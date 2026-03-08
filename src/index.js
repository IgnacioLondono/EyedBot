const { Client, GatewayIntentBits, Collection, REST, Routes, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { safeReply, isUnknownInteractionError } = require('./utils/interactions');
const { handleReturnInteraction } = require('./utils/fun-return');
const guildMemberAddEvent = require('./events/guildMemberAdd');
const guildMemberRemoveEvent = require('./events/guildMemberRemove');
const antiRaidGuard = require('./events/anti-raid-guard');
const { handleReactionAdd, handleReactionRemove } = require('./events/verify-reaction');
const { handleTicketButton, handleTicketModal } = require('./events/ticket-interaction');
const { handleMessageCreate, startVoiceXpLoop, stopVoiceXpLoop } = require('./events/leveling-tracker');
const { handleVoiceStateUpdate } = require('./events/temp-voice');
const db = require('./utils/database');
const { startBackupScheduler, stopBackupScheduler } = require('./utils/backup-scheduler');
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
            if (!MUSIC_ENABLED && file.toLowerCase() === 'music') {
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

    startBackupScheduler();
    startVoiceXpLoop(client);
});

client.on('messageCreate', async (message) => {
    try {
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

    // Registrar comandos automáticamente
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('🔄 Registrando comandos en Discord...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        console.log('✅ Comandos registrados exitosamente.');
    } catch (error) {
        console.error('❌ Error registrando comandos:', error);
    }

    await db.init().catch(() => false);
    if (MUSIC_ENABLED && client.player) {
        const { DefaultExtractors } = require('@discord-player/extractor');
        await client.player.extractors.loadMulti(DefaultExtractors);
    }
    client.login(TOKEN);
}

async function gracefulShutdown(signal) {
    console.log(`⚠️ Señal recibida: ${signal}. Cerrando bot...`);
    try {
        stopBackupScheduler();
        stopVoiceXpLoop();
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
