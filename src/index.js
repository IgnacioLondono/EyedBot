const { Client, GatewayIntentBits, Collection, REST, Routes, Partials, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { safeReply, isUnknownInteractionError } = require('./utils/interactions');
const { handleReturnInteraction } = require('./utils/fun-return');
const guildMemberAddEvent = require('./events/guildMemberAdd');
const guildMemberRemoveEvent = require('./events/guildMemberRemove');
const antiRaidGuard = require('./events/anti-raid-guard');
const { handleReactionAdd, handleReactionRemove } = require('./events/verify-reaction');
const { handleTicketButton, handleTicketSelectMenu, handleTicketModal } = require('./events/ticket-interaction');
const { handleMessageCreate, startVoiceXpLoop, stopVoiceXpLoop } = require('./events/leveling-tracker');
const { handleCountingMessage } = require('./events/counting-game');
const { handleVoiceStateUpdate } = require('./events/temp-voice');
const db = require('./utils/database');
const { startBackupScheduler, stopBackupScheduler } = require('./utils/backup-scheduler');
const { startStreamAlertScheduler, stopStreamAlertScheduler } = require('./utils/stream-alert-scheduler');
require('dotenv').config();

let webPanel = null;
if ((process.env.WEB_ENABLED || 'true').toLowerCase() === 'true') {
    try {
        webPanel = require('../web/server');
        console.log('🌐 Panel web cargado.');
    } catch (error) {
        console.error('❌ No se pudo cargar el panel web:', error?.message || error);
    }
}

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const MUSIC_ENABLED = (process.env.MUSIC_ENABLED || 'false').toLowerCase() === 'true';
const SLOW_COMMAND_WARN_MS = Math.max(250, Number.parseInt(process.env.SLOW_COMMAND_WARN_MS || '1200', 10));
const COMMAND_REGISTER_RETRIES = Math.max(1, Number.parseInt(process.env.COMMAND_REGISTER_RETRIES || '3', 10));
const COMMAND_REGISTER_RETRY_DELAY_MS = Math.max(1000, Number.parseInt(process.env.COMMAND_REGISTER_RETRY_DELAY_MS || '5000', 10));
const COMMAND_REGISTER_POST_READY_DELAY_MS = Math.max(0, Number.parseInt(process.env.COMMAND_REGISTER_POST_READY_DELAY_MS || '10000', 10));
const MODERATION_COMMAND_NAMES = new Set([
    'announce',
    'ban',
    'clear',
    'clearwarns',
    'kick',
    'lock',
    'mute',
    'nick',
    'purge',
    'role',
    'slowmode',
    'unban',
    'unlock',
    'unmute',
    'vozocultar',
    'warn',
    'warnings'
]);

function canUseModerationCommands(interaction) {
    const perms = interaction.memberPermissions;
    if (!perms) return false;

    return perms.has(PermissionFlagsBits.Administrator)
        || perms.has(PermissionFlagsBits.ManageGuild)
        || perms.has(PermissionFlagsBits.ManageMessages)
        || perms.has(PermissionFlagsBits.KickMembers)
        || perms.has(PermissionFlagsBits.BanMembers)
        || perms.has(PermissionFlagsBits.ModerateMembers)
        || perms.has(PermissionFlagsBits.ManageChannels);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

async function registerSlashCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const runtimeClientId = String(client.user?.id || '').trim();
    const configuredClientId = String(CLIENT_ID || '').trim();
    const appIds = Array.from(new Set([configuredClientId, runtimeClientId].filter(Boolean)));

    if (!appIds.length) {
        console.error('❌ No se puede registrar slash: falta CLIENT_ID y no hay ID runtime.');
        return false;
    }

    const connectedGuildIds = Array.from(client.guilds.cache.keys());
    const targetGuildIds = Array.from(new Set([
        String(GUILD_ID || '').trim(),
        ...connectedGuildIds
    ].filter(Boolean)));

    if (!targetGuildIds.length) {
        console.error('❌ No se puede registrar slash: el bot no tiene servidores disponibles.');
        return false;
    }

    for (const appId of appIds) {
        for (let attempt = 1; attempt <= COMMAND_REGISTER_RETRIES; attempt++) {
            try {
                console.log(`🔄 Registrando comandos en Discord (app ${appId}, intento ${attempt}/${COMMAND_REGISTER_RETRIES})...`);

                let okCount = 0;
                for (const guildId of targetGuildIds) {
                    try {
                        await rest.put(
                            Routes.applicationGuildCommands(appId, guildId),
                            { body: commands }
                        );
                        okCount += 1;
                        console.log(`✅ Slash registrados en guild ${guildId}.`);
                    } catch (guildError) {
                        console.warn(`⚠️ No se pudieron registrar slash en guild ${guildId}:`, guildError?.message || guildError);
                    }
                }

                if (okCount === 0) {
                    throw new Error('No se pudo registrar en ningún servidor conectado.');
                }

                await rest.put(Routes.applicationCommands(appId), { body: [] }).catch((cleanupError) => {
                    console.warn('⚠️ No se pudieron limpiar comandos globales obsoletos:', cleanupError?.message || cleanupError);
                });

                console.log(`✅ Comandos registrados exitosamente para app ${appId} en ${okCount}/${targetGuildIds.length} servidores.`);
                return true;
            } catch (error) {
                console.error(`⚠️ Falló registro de comandos (app ${appId}, intento ${attempt}):`, error?.message || error);
                if (attempt < COMMAND_REGISTER_RETRIES) {
                    await new Promise((resolve) => setTimeout(resolve, COMMAND_REGISTER_RETRY_DELAY_MS));
                }
            }
        }
    }

    console.error('❌ No se pudieron registrar comandos slash después de varios intentos.');
    return false;
}

if (MUSIC_ENABLED) {
    const { Player } = require('discord-player');
    const ffmpegPath = require('ffmpeg-static');
    const player = new Player(client, {
        connectionTimeout: 45000,
        probeTimeout: 20000,
        skipFFmpeg: config.musicSkipFfmpeg,
        ffmpegPath
    });
    client.player = player;
} else {
    console.log('🎵 Música desactivada (MUSIC_ENABLED=false).');
}

client.commands = new Collection();

// Cargar comandos
const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// Función recursiva para cargar comandos
function loadCommands(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            if (file.toLowerCase() === 'music') {
                continue;
            }
            loadCommands(filePath);
        } else if (file.endsWith('.js')) {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
                console.log(`✅ Comando cargado: ${command.data.name}`);
            }
        }
    }
}

loadCommands(commandsPath);

client.once('clientReady', () => {
    console.log(`👁️ EyedBot conectado como ${client.user.tag}`);
    if (webPanel?.setBotClient) {
        webPanel.setBotClient(client);
        console.log('🔗 Panel web conectado al cliente del bot.');
    }

    registerSlashCommands().catch((error) => {
        console.error('❌ Error inesperado registrando slash:', error?.message || error);
    });

    if (COMMAND_REGISTER_POST_READY_DELAY_MS > 0) {
        setTimeout(() => {
            registerSlashCommands().catch((error) => {
                console.error('❌ Error en re-sincronización automática de slash:', error?.message || error);
            });
        }, COMMAND_REGISTER_POST_READY_DELAY_MS);
    }

    startBackupScheduler();
    startVoiceXpLoop(client);
    startStreamAlertScheduler(client);
});

client.on('guildCreate', (guild) => {
    console.log(`➕ Bot agregado a nuevo servidor: ${guild.id}. Sincronizando slash...`);
    registerSlashCommands().catch((error) => {
        console.error('❌ Error sincronizando slash en nuevo servidor:', error?.message || error);
    });
});

client.on('messageCreate', async (message) => {
    try {
        await handleCountingMessage(message);
        await handleMessageCreate(message);
        await antiRaidGuard.handleMessageCreate(message);
    } catch (error) {
        console.error('Error en leveling messageCreate:', error);
    }
});

client.on('guildMemberAdd', async (member) => {
    try {
        await guildMemberAddEvent.execute(member);
        await antiRaidGuard.handleGuildMemberAdd(member);
    } catch (error) {
        console.error('Error en guildMemberAdd:', error);
    }
});

client.on('channelCreate', async (channel) => {
    try {
        await antiRaidGuard.handleChannelCreate(channel);
    } catch (error) {
        console.error('Error en channelCreate (anti-raid):', error);
    }
});

client.on('channelDelete', async (channel) => {
    try {
        await antiRaidGuard.handleChannelDelete(channel);
    } catch (error) {
        console.error('Error en channelDelete (anti-raid):', error);
    }
});

client.on('roleCreate', async (role) => {
    try {
        await antiRaidGuard.handleRoleCreate(role);
    } catch (error) {
        console.error('Error en roleCreate (anti-raid):', error);
    }
});

client.on('roleDelete', async (role) => {
    try {
        await antiRaidGuard.handleRoleDelete(role);
    } catch (error) {
        console.error('Error en roleDelete (anti-raid):', error);
    }
});

client.on('guildMemberRemove', async (member) => {
    try {
        await guildMemberRemoveEvent.execute(member);
    } catch (error) {
        console.error('Error en guildMemberRemove:', error);
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        await handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
        console.error('Error en voiceStateUpdate (temp voice):', error);
    }
});

client.on('messageReactionAdd', async (reaction, user) => {
    try {
        await handleReactionAdd(reaction, user);
    } catch (error) {
        console.error('Error en messageReactionAdd (verify):', error);
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    try {
        await handleReactionRemove(reaction, user);
    } catch (error) {
        console.error('Error en messageReactionRemove (verify):', error);
    }
});

client.on('interactionCreate', async interaction => {
    let musicSystem = interaction.client.musicSystem;
    if (MUSIC_ENABLED && !musicSystem) {
        const MusicSystem = require('./cogs/music');
        musicSystem = new MusicSystem(interaction.client);
        interaction.client.musicSystem = musicSystem;
    }

    if (interaction.isButton()) {
        try {
            const ticketHandled = await handleTicketButton(interaction);
            if (ticketHandled) return;

            if (interaction.customId.startsWith('fun_return_')) {
                const handled = await handleReturnInteraction(interaction);
                if (handled) return;
            }

            if (interaction.customId.startsWith('search_select_')) {
                if (!MUSIC_ENABLED) {
                    await safeReply(interaction, { content: '🎵 La música está desactivada temporalmente.', flags: 64 }).catch(() => {});
                    return;
                }
                await musicSystem.handleSearchSelection(interaction);
                return;
            }

            if (interaction.customId.startsWith('music_')) {
                if (!MUSIC_ENABLED) {
                    await safeReply(interaction, { content: '🎵 La música está desactivada temporalmente.', flags: 64 }).catch(() => {});
                    return;
                }
                const parts = interaction.customId.split('_');
                let action = parts[1];

                if (parts.length > 3) {
                    action = parts.slice(1, -1).join('_');
                }

                await musicSystem.handleMusicControl(interaction, action);
                return;
            }
        } catch (error) {
            if (isUnknownInteractionError(error)) return;
            console.error('Error handling button interaction:', error);
            await safeReply(interaction, { content: '❌ Error al procesar el botón.', flags: 64 }).catch(() => {});
            return;
        }
    }

    if (interaction.isModalSubmit()) {
        try {
            const ticketModalHandled = await handleTicketModal(interaction);
            if (ticketModalHandled) return;

            if (interaction.customId.startsWith('music_volume_modal_')) {
                if (!MUSIC_ENABLED) {
                    await safeReply(interaction, { content: '🎵 La música está desactivada temporalmente.', flags: 64 }).catch(() => {});
                    return;
                }
                await musicSystem.handleVolumeModalSubmit(interaction);
                return;
            }
        } catch (error) {
            if (isUnknownInteractionError(error)) return;
            console.error('Error handling modal submit:', error);
            await safeReply(interaction, { content: '❌ Error al procesar el formulario.', flags: 64 }).catch(() => {});
            return;
        }
    }

    if (interaction.isStringSelectMenu()) {
        try {
            const ticketSelectHandled = await handleTicketSelectMenu(interaction);
            if (ticketSelectHandled) return;
        } catch (error) {
            if (isUnknownInteractionError(error)) return;
            console.error('Error handling select menu interaction:', error);
            await safeReply(interaction, { content: '❌ Error al procesar la selección.', flags: 64 }).catch(() => {});
            return;
        }
    }

    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command || typeof command.autocomplete !== 'function') return;
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error('Error en autocomplete:', error);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    if (MODERATION_COMMAND_NAMES.has(interaction.commandName) && !canUseModerationCommands(interaction)) {
        await safeReply(interaction, {
            content: '❌ Solo moderadores o administradores pueden usar este comando.',
            flags: 64
        }).catch(() => {});
        return;
    }

    const startedAt = Date.now();
    try {
        await command.execute(interaction);
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs >= SLOW_COMMAND_WARN_MS) {
            console.warn(`⚠️ Comando lento: /${interaction.commandName} tardó ${elapsedMs}ms en ${interaction.guildId || 'DM'}`);
        }
    } catch (error) {
        if (isUnknownInteractionError(error)) return;
        console.error(error);
        await safeReply(interaction, { content: '❌ Error al ejecutar el comando.', flags: 64 }).catch(() => {});
    }
});

async function main() {
    if (!TOKEN) {
        throw new Error('Falta DISCORD_TOKEN en .env');
    }
    if (!CLIENT_ID) {
        throw new Error('Falta CLIENT_ID en .env');
    }
    if (!GUILD_ID) {
        throw new Error('Falta GUILD_ID en .env');
    }

    await db.init().catch((error) => {
        console.error('❌ Error inicializando base de datos:', error?.message || error);
        return false;
    });

    if (MUSIC_ENABLED && client.player) {
        const { DefaultExtractors } = require('@discord-player/extractor');
        await client.player.extractors.loadMulti(DefaultExtractors);
    }

    await client.login(TOKEN);
}

async function gracefulShutdown(signal) {
    console.log(`⚠️ Señal recibida: ${signal}. Cerrando bot...`);
    try {
        stopBackupScheduler();
        stopVoiceXpLoop();
        stopStreamAlertScheduler();
        await db.close().catch(() => null);
        await client.destroy();
    } catch {
        // ignore shutdown errors
    } finally {
        process.exit(0);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

main();
