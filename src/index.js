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
const { handleVerifyButton } = require('./utils/verify-service');
const { handleTicketButton, handleTicketSelectMenu, handleTicketModal } = require('./events/ticket-interaction');
const {
    handleMessageCreate,
    handleAnalyticsVoiceStateUpdate,
    seedVoiceAnalyticsSessions,
    flushAllVoiceAnalyticsSessions,
    startVoiceXpLoop,
    stopVoiceXpLoop
} = require('./events/leveling-tracker');
const { handleCountingMessage } = require('./events/counting-game');
const { handleVoiceStateUpdate } = require('./events/temp-voice');
const { handleTempVoiceButton, handleTempVoiceModal } = require('./events/temp-voice-interaction');
const { handleAFKAuthorReturn, handleAFKMentions } = require('./events/messageCreate');
const guildActivityStore = require('./utils/guild-activity-store');
const db = require('./utils/database');
const { startBackupScheduler, stopBackupScheduler } = require('./utils/backup-scheduler');
const { startStreamAlertScheduler, stopStreamAlertScheduler } = require('./utils/stream-alert-scheduler');
const { startFreeGamesScheduler, stopFreeGamesScheduler } = require('./utils/free-games-service');
const { startCrunchyrollScheduler, stopCrunchyrollScheduler } = require('./utils/crunchyroll-service');
const { startBumpReminderScheduler, stopBumpReminderScheduler, handleDisboardBumpMessage } = require('./utils/bump-reminder-scheduler');
const { startEventsGiveawaysScheduler, stopEventsGiveawaysScheduler, handleGiveawayButton } = require('./utils/giveaway-service');
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
const COMMAND_REGISTER_PER_GUILD_TIMEOUT_MS = Number.parseInt(process.env.COMMAND_REGISTER_PER_GUILD_TIMEOUT_MS || '0', 10);
const FORCED_SLASH_GUILD_IDS = String(process.env.FORCED_SLASH_GUILD_IDS || '')
    .split(/[,;\s]+/)
    .map((id) => id.trim())
    .filter(Boolean);
const DISABLED_SLASH_COMMANDS = new Set([
    'voznombre',
    'vozprivado'
]);
const MODERATION_COMMAND_NAMES = new Set([
    'announce',
    'ban',
    'clear',
    'clearwarns',
    'dm',
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

if ((process.env.TTS_ENABLED || 'true').toLowerCase() !== 'false') {
    try {
        require('./utils/tts-voice-manager').attachCleanupListeners(client);
        console.log('🔈 TTS: voz en llamadas + lectura opcional del chat (/tts).');
    } catch (ttsErr) {
        console.warn('⚠️ No se pudieron cargar listeners TTS:', ttsErr?.message || ttsErr);
    }
}

let slashRegisterInFlight = null;

async function registerSlashCommands(targetGuildIds = null, options = {}) {
    if (slashRegisterInFlight) return slashRegisterInFlight;

    slashRegisterInFlight = (async () => {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const runtimeClientId = String(client.user?.id || '').trim();
    const configuredClientId = String(CLIENT_ID || '').trim();
    const appIds = Array.from(new Set([configuredClientId, runtimeClientId].filter(Boolean)));
    const perGuildTimeoutRaw = Number.parseInt(options.perGuildTimeoutMs ?? `${COMMAND_REGISTER_PER_GUILD_TIMEOUT_MS}`, 10);
    const perGuildTimeoutMs = Number.isFinite(perGuildTimeoutRaw) ? perGuildTimeoutRaw : 0;
    const retries = Math.max(1, Number.parseInt(options.retries || `${COMMAND_REGISTER_RETRIES}`, 10));
    const retryDelayMs = Math.max(1000, Number.parseInt(options.retryDelayMs || `${COMMAND_REGISTER_RETRY_DELAY_MS}`, 10));
    const cleanupGlobal = options.cleanupGlobal !== false;

    if (!appIds.length) {
        console.error('❌ No se puede registrar slash: falta CLIENT_ID y no hay ID runtime.');
        return false;
    }

    let resolvedTargetGuildIds = Array.isArray(targetGuildIds) && targetGuildIds.length
        ? targetGuildIds
        : null;

    if (!resolvedTargetGuildIds) {
        try {
            const fetchedGuilds = await client.guilds.fetch();
            resolvedTargetGuildIds = Array.from(fetchedGuilds.keys());
        } catch {
            resolvedTargetGuildIds = Array.from(client.guilds.cache.keys());
        }
    }

    resolvedTargetGuildIds = Array.from(new Set([
        ...resolvedTargetGuildIds,
        ...FORCED_SLASH_GUILD_IDS
    ].filter(Boolean)));

    if (!resolvedTargetGuildIds.length) {
        console.error('❌ No se puede registrar slash: el bot no tiene servidores disponibles.');
        return false;
    }

    for (const appId of appIds) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                console.log(`🔄 Registrando comandos en Discord (app ${appId}, intento ${attempt}/${retries})...`);

                let okCount = 0;
                const failedGuilds = [];
                for (const guildId of resolvedTargetGuildIds) {
                    const guildName = client.guilds.cache.get(guildId)?.name || 'unknown';
                    console.log(`↪️ Sincronizando slash en guild ${guildName} (${guildId})...`);

                    const registerOneGuild = rest.put(
                        Routes.applicationGuildCommands(appId, guildId),
                        { body: commands }
                    );

                    try {
                        if (perGuildTimeoutMs > 0) {
                            const timeoutOneGuild = new Promise((_, reject) => {
                                setTimeout(() => {
                                    reject(new Error(`timeout ${perGuildTimeoutMs}ms`));
                                }, perGuildTimeoutMs);
                            });
                            await Promise.race([registerOneGuild, timeoutOneGuild]);
                        } else {
                            await registerOneGuild;
                        }
                        okCount += 1;
                        console.log(`✅ Slash registrados en guild ${guildName} (${guildId}).`);
                    } catch (guildError) {
                        failedGuilds.push(guildId);
                        console.warn(`⚠️ No se pudieron registrar slash en guild ${guildName} (${guildId}):`, guildError?.message || guildError);
                    }
                }

                if (okCount === 0) {
                    throw new Error('No se pudo registrar en ningún servidor conectado.');
                }

                if (cleanupGlobal) {
                    await rest.put(Routes.applicationCommands(appId), { body: [] }).catch((cleanupError) => {
                        console.warn('⚠️ No se pudieron limpiar comandos globales obsoletos:', cleanupError?.message || cleanupError);
                    });
                }

                console.log(`✅ Comandos registrados exitosamente para app ${appId} en ${okCount}/${resolvedTargetGuildIds.length} servidores.`);
                if (failedGuilds.length) {
                    const failedDetails = failedGuilds.map((guildId) => {
                        const guildName = client.guilds.cache.get(guildId)?.name || 'unknown';
                        return `${guildName} (${guildId})`;
                    });
                    console.warn(`⚠️ Guilds con fallo de registro: ${failedDetails.join(', ')}`);
                }
                return true;
            } catch (error) {
                console.error(`⚠️ Falló registro de comandos (app ${appId}, intento ${attempt}):`, error?.message || error);
                if (attempt < retries) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                }
            }
        }
    }

    console.error('❌ No se pudieron registrar comandos slash después de varios intentos.');
    return false;
    })();

    try {
        return await slashRegisterInFlight;
    } finally {
        slashRegisterInFlight = null;
    }
}

if (MUSIC_ENABLED && config.lavalinkEnabled) {
    client.player = null;
} else {
    if (MUSIC_ENABLED && !config.lavalinkEnabled) {
        console.log('🎵 Música desactivada (LAVALINK_ENABLED=false).');
    } else {
        console.log('🎵 Música desactivada (MUSIC_ENABLED=false).');
    }
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
                if (DISABLED_SLASH_COMMANDS.has(command.data.name)) {
                    console.log(`⏭️ Comando desactivado (omitido): ${command.data.name}`);
                    continue;
                }
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
                console.log(`✅ Comando cargado: ${command.data.name}`);
            }
        }
    }
}

loadCommands(commandsPath);

if (MUSIC_ENABLED && config.lavalinkEnabled) {
    const musicDir = path.join(commandsPath, 'music');
    if (fs.existsSync(musicDir)) {
        const musicFiles = fs.readdirSync(musicDir).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
        for (const file of musicFiles) {
            try {
                const command = require(path.join(musicDir, file));
                if ('data' in command && 'execute' in command) {
                    if (DISABLED_SLASH_COMMANDS.has(command.data.name)) {
                        console.log(`⏭️ Comando música desactivado (omitido): ${command.data.name}`);
                        continue;
                    }
                    client.commands.set(command.data.name, command);
                    commands.push(command.data.toJSON());
                    console.log(`🎵 Comando música cargado: ${command.data.name}`);
                }
            } catch (error) {
                console.error(`❌ Error cargando comando música ${file}:`, error?.message || error);
            }
        }
    }
}

client.once('clientReady', async () => {
    console.log(`👁️ EyedBot conectado como ${client.user.tag}`);
    if (webPanel?.setBotClient) {
        webPanel.setBotClient(client);
        console.log('🔗 Panel web conectado al cliente del bot.');
    }

    if (MUSIC_ENABLED && config.lavalinkEnabled) {
        try {
            const lavalink = require('./utils/lavalink-shoukaku');
            const { initQueueManager } = require('./utils/music-queue-manager');
            const { createMusicPlayerFacade } = require('./utils/music-player-facade');
            const MusicSystem = require('./cogs/music');

            initQueueManager(client);
            client.player = createMusicPlayerFacade(client);
            client.musicSystem = new MusicSystem(client);

            const node = await lavalink.bootstrapMusicConnection(client);
            if (node) {
                console.log('🎵 Música: Lavalink + Shoukaku operativos.');
            } else {
                console.warn(
                    '⚠️ Lavalink no conectó en el arranque. Se reintentará en segundo plano; /play esperará unos segundos si el nodo acaba de levantar.'
                );
                lavalink.startNodeReadyMonitor((ok) => {
                    if (ok) console.log('🎵 Música: Lavalink + Shoukaku operativos (conexión tardía).');
                });
            }
        } catch (error) {
            console.error('❌ Error iniciando música (Lavalink/Shoukaku):', error?.message || error);
        }
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
    seedVoiceAnalyticsSessions(client);
    startStreamAlertScheduler(client);
    startFreeGamesScheduler(client);
    startCrunchyrollScheduler(client);
    startBumpReminderScheduler(client);
    startEventsGiveawaysScheduler(client);
});

client.on('guildCreate', (guild) => {
    console.log(`➕ Bot agregado a nuevo servidor: ${guild.id}. Sincronizando slash...`);
    setTimeout(() => {
        registerSlashCommands([guild.id], {
            retries: 5,
            retryDelayMs: 10000,
            perGuildTimeoutMs: 0,
            cleanupGlobal: false
        }).catch((error) => {
            console.error('❌ Error sincronizando slash en nuevo servidor:', error?.message || error);
        });
    }, Math.max(10000, COMMAND_REGISTER_POST_READY_DELAY_MS));
});

client.on('messageCreate', async (message) => {
    try {
        await handleAFKAuthorReturn(message);
        await handleAFKMentions(message);
        await handleDisboardBumpMessage(message);
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
        await guildActivityStore.incrementGuildMetric(member.guild.id, 'joins');
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
        await guildActivityStore.incrementGuildMetric(member.guild.id, 'leaves');
    } catch (error) {
        console.error('Error en guildMemberRemove:', error);
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
        await handleAnalyticsVoiceStateUpdate(oldState, newState);
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
            const tempVoiceButtonHandled = await handleTempVoiceButton(interaction);
            if (tempVoiceButtonHandled) return;

            const ticketHandled = await handleTicketButton(interaction);
            if (ticketHandled) return;

            const giveawayHandled = await handleGiveawayButton(interaction);
            if (giveawayHandled) return;

            const verifyHandled = await handleVerifyButton(interaction);
            if (verifyHandled) return;

            if (interaction.customId.startsWith('fun_return_')) {
                const handled = await handleReturnInteraction(interaction);
                if (handled) return;
            }

            if (interaction.customId.startsWith('help_nav:')) {
                const helpCmd = interaction.client.commands?.get?.('help');
                if (helpCmd && typeof helpCmd.handleHelpButton === 'function') {
                    const handled = await helpCmd.handleHelpButton(interaction);
                    if (handled) return;
                }
            }

            if (interaction.customId.startsWith('shop_')) {
                const shopCmd = interaction.client.commands?.get?.('tienda');
                if (shopCmd && typeof shopCmd.handleShopButton === 'function') {
                    const handled = await shopCmd.handleShopButton(interaction);
                    if (handled) return;
                }
            }

            if (interaction.customId.startsWith('mg_')
                || interaction.customId.startsWith('trade:')
                || interaction.customId.startsWith('versus:')) {
                const { handleEconomyButton } = require('./utils/economy-minigames');
                const handled = await handleEconomyButton(interaction);
                if (handled) return;
            }

            if (interaction.customId.startsWith('trivia_')) {
                const triviaData = interaction.client.triviaAnswers?.[interaction.message.interaction?.id];
                if (!triviaData) {
                    await safeReply(interaction, {
                        content: 'Esta trivia ya expiró.',
                        flags: 64
                    }).catch(() => {});
                    return;
                }

                const answerIndex = Number.parseInt(interaction.customId.split('_')[1], 10);
                const selectedAnswer = triviaData.answers[answerIndex];
                const isCorrect = answerIndex === triviaData.correctIndex || selectedAnswer === triviaData.correct;
                let rewardLine = '';

                if (isCorrect && interaction.guildId) {
                    const { awardMinigameCoins } = require('./utils/economy-rewards');
                    const reward = await awardMinigameCoins(interaction.guildId, interaction.user.id, 'trivia');
                    if (reward?.ok) {
                        rewardLine = `\n\nGanaste **${Number(reward.reward || 0).toLocaleString('es-ES')}** monedas.`;
                    }
                }

                const { EmbedBuilder } = require('discord.js');
                const config = require('./config');
                const embed = new EmbedBuilder()
                    .setColor(isCorrect ? config.embedColor : '#FF0000')
                    .setTitle(isCorrect ? 'Correcto' : 'Incorrecto')
                    .setDescription(isCorrect
                        ? `La respuesta correcta era: **${triviaData.correct}**${rewardLine}`
                        : `La respuesta correcta era: **${triviaData.correct}**`)
                    .setFooter({ text: `Respondido por ${interaction.user.tag}` });

                await safeReply(interaction, { embeds: [embed], flags: 64 }).catch(() => {});
                delete interaction.client.triviaAnswers[interaction.message.interaction?.id];
                return;
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

            if (interaction.customId.startsWith('lyrics_')) {
                const lyricsCmd = interaction.client.commands?.get?.('lyrics');
                if (lyricsCmd && typeof lyricsCmd.handleButton === 'function') {
                    const handled = await lyricsCmd.handleButton(interaction);
                    if (handled) return;
                }
            }

            if (interaction.customId.startsWith('karaoke_')) {
                const karaokeCmd = interaction.client.commands?.get?.('karaoke');
                if (karaokeCmd && typeof karaokeCmd.handleButton === 'function') {
                    const handled = await karaokeCmd.handleButton(interaction);
                    if (handled) return;
                }
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
            const tempVoiceModalHandled = await handleTempVoiceModal(interaction);
            if (tempVoiceModalHandled) return;

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
    let acknowledgedInTime = false;
    const slowCommandTimer = setTimeout(() => {
        acknowledgedInTime = interaction.replied || interaction.deferred;
    }, SLOW_COMMAND_WARN_MS);

    try {
        await command.execute(interaction);
        const elapsedMs = Date.now() - startedAt;
        if (elapsedMs >= SLOW_COMMAND_WARN_MS && !acknowledgedInTime) {
            console.warn(`⚠️ Comando lento: /${interaction.commandName} tardó ${elapsedMs}ms en ${interaction.guildId || 'DM'}`);
        }
    } catch (error) {
        if (isUnknownInteractionError(error)) return;
        console.error(error);
        await safeReply(interaction, { content: '❌ Error al ejecutar el comando.', flags: 64 }).catch(() => {});
    } finally {
        clearTimeout(slowCommandTimer);
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

    await client.login(TOKEN);
}

async function gracefulShutdown(signal) {
    console.log(`⚠️ Señal recibida: ${signal}. Cerrando bot...`);
    try {
        stopBackupScheduler();
        stopVoiceXpLoop();
        await flushAllVoiceAnalyticsSessions();
        stopStreamAlertScheduler();
        stopFreeGamesScheduler();
        stopCrunchyrollScheduler();
        stopBumpReminderScheduler();
        try {
            require('./utils/tts-voice-manager').disconnectAll('shutdown');
        } catch {
            /* noop */
        }
        try {
            require('./utils/music-queue-manager').destroyAllQueues();
            require('./utils/lavalink-shoukaku').destroyShoukaku();
        } catch {
            /* noop */
        }
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
