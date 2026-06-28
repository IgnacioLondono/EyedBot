const fs = require('fs');
const path = require('path');
const { REST, Routes, PermissionFlagsBits, Partials } = require('discord.js');
const config = require('../config');
const { safeReply, isUnknownInteractionError } = require('./interactions');
const { handleReturnInteraction } = require('./fun-return');
const guildMemberAddEvent = require('../events/guildMemberAdd');
const guildMemberRemoveEvent = require('../events/guildMemberRemove');
const antiRaidGuard = require('../events/anti-raid-guard');
const { handleReactionAdd, handleReactionRemove } = require('../events/verify-reaction');
const { handleVerifyButton } = require('./verify-service');
const { handleTicketButton, handleTicketSelectMenu, handleTicketModal } = require('../events/ticket-interaction');
const {
    handleMessageCreate,
    handleAnalyticsVoiceStateUpdate,
    seedVoiceAnalyticsSessions,
    startVoiceXpLoop
} = require('../events/leveling-tracker');
const { handleCountingMessage } = require('../events/counting-game');
const { handleVoiceStateUpdate } = require('../events/temp-voice');
const { handleTempVoiceButton, handleTempVoiceModal } = require('../events/temp-voice-interaction');
const { handleAFKAuthorReturn, handleAFKMentions } = require('../events/messageCreate');
const guildActivityStore = require('./guild-activity-store');
const { handleDisboardBumpMessage } = require('./bump-reminder-scheduler');
const { handleGiveawayButton } = require('./giveaway-service');

const MUSIC_ENABLED = (process.env.MUSIC_ENABLED || 'false').toLowerCase() === 'true';
const SLOW_COMMAND_WARN_MS = Math.max(250, Number.parseInt(process.env.SLOW_COMMAND_WARN_MS || '1200', 10));
const COMMAND_REGISTER_RETRIES = Math.max(1, Number.parseInt(process.env.COMMAND_REGISTER_RETRIES || '3', 10));
const COMMAND_REGISTER_RETRY_DELAY_MS = Math.max(1000, Number.parseInt(process.env.COMMAND_REGISTER_RETRY_DELAY_MS || '5000', 10));
const COMMAND_REGISTER_PER_GUILD_TIMEOUT_MS = Number.parseInt(process.env.COMMAND_REGISTER_PER_GUILD_TIMEOUT_MS || '0', 10);

const DISABLED_SLASH_COMMANDS = new Set(['voznombre', 'vozprivado']);
const MODERATION_COMMAND_NAMES = new Set([
    'announce', 'ban', 'clear', 'clearwarns', 'dm', 'kick', 'lock', 'mute', 'nick',
    'purge', 'role', 'slowmode', 'unban', 'unlock', 'unmute', 'vozocultar', 'warn', 'warnings'
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

function loadBotCommands(client) {
    const { Collection } = require('discord.js');
    client.commands = new Collection();
    const commandPayloads = [];
    const commandsPath = path.join(__dirname, '..', 'commands');

    function walk(dir) {
        if (!fs.existsSync(dir)) return;
        for (const file of fs.readdirSync(dir)) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                if (file.toLowerCase() === 'music') continue;
                walk(filePath);
            } else if (file.endsWith('.js')) {
                const command = require(filePath);
                if ('data' in command && 'execute' in command) {
                    if (DISABLED_SLASH_COMMANDS.has(command.data.name)) continue;
                    client.commands.set(command.data.name, command);
                    commandPayloads.push(command.data.toJSON());
                }
            }
        }
    }

    walk(commandsPath);

    if (MUSIC_ENABLED && config.lavalinkEnabled) {
        const musicDir = path.join(commandsPath, 'music');
        if (fs.existsSync(musicDir)) {
            for (const file of fs.readdirSync(musicDir).filter((f) => f.endsWith('.js') && !f.startsWith('_'))) {
                try {
                    const command = require(path.join(musicDir, file));
                    if ('data' in command && 'execute' in command && !DISABLED_SLASH_COMMANDS.has(command.data.name)) {
                        client.commands.set(command.data.name, command);
                        commandPayloads.push(command.data.toJSON());
                    }
                } catch (error) {
                    console.error(`❌ Error cargando comando música ${file}:`, error?.message || error);
                }
            }
        }
    }

    return commandPayloads;
}

async function registerSlashCommandsForClient(client, token, commandPayloads, options = {}) {
    const rest = new REST({ version: '10' }).setToken(token);
    const appId = String(client.user?.id || '').trim();
    if (!appId) return false;

    const perGuildTimeoutMs = Number.isFinite(options.perGuildTimeoutMs)
        ? options.perGuildTimeoutMs
        : COMMAND_REGISTER_PER_GUILD_TIMEOUT_MS;
    const retries = Math.max(1, options.retries || COMMAND_REGISTER_RETRIES);
    const retryDelayMs = Math.max(1000, options.retryDelayMs || COMMAND_REGISTER_RETRY_DELAY_MS);
    const cleanupGlobal = options.cleanupGlobal !== false;

    let guildIds = Array.isArray(options.guildIds) && options.guildIds.length
        ? options.guildIds
        : null;

    if (!guildIds) {
        try {
            const fetched = await client.guilds.fetch();
            guildIds = Array.from(fetched.keys());
        } catch {
            guildIds = Array.from(client.guilds.cache.keys());
        }
    }

    guildIds = Array.from(new Set(guildIds.filter(Boolean)));
    if (!guildIds.length) return false;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            let okCount = 0;
            for (const guildId of guildIds) {
                const registerOne = rest.put(
                    Routes.applicationGuildCommands(appId, guildId),
                    { body: commandPayloads }
                );
                try {
                    if (perGuildTimeoutMs > 0) {
                        await Promise.race([
                            registerOne,
                            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), perGuildTimeoutMs))
                        ]);
                    } else {
                        await registerOne;
                    }
                    okCount += 1;
                } catch (guildError) {
                    console.warn(`⚠️ Slash auxiliar falló en guild ${guildId}:`, guildError?.message || guildError);
                }
            }
            if (okCount === 0) throw new Error('No se registró en ningún servidor');
            if (cleanupGlobal) {
                await rest.put(Routes.applicationCommands(appId), { body: [] }).catch(() => null);
            }
            return true;
        } catch (error) {
            console.warn(`⚠️ Registro slash auxiliar intento ${attempt}/${retries}:`, error?.message || error);
            if (attempt < retries) await new Promise((r) => setTimeout(r, retryDelayMs));
        }
    }
    return false;
}

function attachInteractionHandler(client) {
    client.on('interactionCreate', async (interaction) => {
        let musicSystem = interaction.client.musicSystem;
        if (MUSIC_ENABLED && !musicSystem) {
            const MusicSystem = require('../cogs/music');
            musicSystem = new MusicSystem(interaction.client);
            interaction.client.musicSystem = musicSystem;
        }

        if (interaction.isButton()) {
            try {
                if (await handleTempVoiceButton(interaction)) return;
                if (await handleTicketButton(interaction)) return;
                if (await handleGiveawayButton(interaction)) return;
                if (await handleVerifyButton(interaction)) return;
                if (interaction.customId.startsWith('fun_return_')) {
                    if (await handleReturnInteraction(interaction)) return;
                }
                if (interaction.customId.startsWith('help_nav:')) {
                    const helpCmd = interaction.client.commands?.get?.('help');
                    if (helpCmd?.handleHelpButton && await helpCmd.handleHelpButton(interaction)) return;
                }
                if (interaction.customId.startsWith('shop_')) {
                    const shopCmd = interaction.client.commands?.get?.('tienda');
                    if (shopCmd?.handleShopButton && await shopCmd.handleShopButton(interaction)) return;
                }
                if (interaction.customId.startsWith('mg_') || interaction.customId.startsWith('trade:') || interaction.customId.startsWith('versus:')) {
                    const { handleEconomyButton } = require('./economy-minigames');
                    if (await handleEconomyButton(interaction)) return;
                }
                if (interaction.customId.startsWith('trivia_')) {
                    const triviaData = interaction.client.triviaAnswers?.[interaction.message.interaction?.id];
                    if (!triviaData) {
                        await safeReply(interaction, { content: 'Esta trivia ya expiró.', flags: 64 }).catch(() => {});
                        return;
                    }
                    const answerIndex = Number.parseInt(interaction.customId.split('_')[1], 10);
                    const selectedAnswer = triviaData.answers[answerIndex];
                    const isCorrect = answerIndex === triviaData.correctIndex || selectedAnswer === triviaData.correct;
                    let rewardLine = '';
                    if (isCorrect && interaction.guildId) {
                        const { awardMinigameCoins } = require('./economy-rewards');
                        const reward = await awardMinigameCoins(interaction.guildId, interaction.user.id, 'trivia');
                        if (reward?.ok) rewardLine = `\n\nGanaste **${Number(reward.reward || 0).toLocaleString('es-ES')}** monedas.`;
                    }
                    const { EmbedBuilder } = require('discord.js');
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
                if (interaction.customId.startsWith('search_select_') || interaction.customId.startsWith('music_')) {
                    if (!MUSIC_ENABLED) {
                        await safeReply(interaction, { content: '🎵 La música está desactivada temporalmente.', flags: 64 }).catch(() => {});
                        return;
                    }
                    if (interaction.customId.startsWith('search_select_')) {
                        await musicSystem.handleSearchSelection(interaction);
                    } else {
                        const parts = interaction.customId.split('_');
                        let action = parts[1];
                        if (parts.length > 3) action = parts.slice(1, -1).join('_');
                        await musicSystem.handleMusicControl(interaction, action);
                    }
                    return;
                }
                if (interaction.customId.startsWith('lyrics_')) {
                    const lyricsCmd = interaction.client.commands?.get?.('lyrics');
                    if (lyricsCmd?.handleButton && await lyricsCmd.handleButton(interaction)) return;
                }
                if (interaction.customId.startsWith('karaoke_')) {
                    const karaokeCmd = interaction.client.commands?.get?.('karaoke');
                    if (karaokeCmd?.handleButton && await karaokeCmd.handleButton(interaction)) return;
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
                if (await handleTempVoiceModal(interaction)) return;
                if (await handleTicketModal(interaction)) return;
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
                if (await handleTicketSelectMenu(interaction)) return;
            } catch (error) {
                if (isUnknownInteractionError(error)) return;
                console.error('Error handling select menu interaction:', error);
                await safeReply(interaction, { content: '❌ Error al procesar la selección.', flags: 64 }).catch(() => {});
                return;
            }
        }

        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            if (!command?.autocomplete) return;
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
}

function attachGuildEventHandlers(client, options = {}) {
    const auxiliary = options.auxiliary === true;

    client.on('messageCreate', async (message) => {
        try {
            await handleAFKAuthorReturn(message);
            await handleAFKMentions(message);
            await handleDisboardBumpMessage(message);
            await handleCountingMessage(message);
            await handleMessageCreate(message);
            await antiRaidGuard.handleMessageCreate(message);
        } catch (error) {
            console.error('Error en messageCreate:', error);
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
        try { await antiRaidGuard.handleChannelCreate(channel); } catch (error) {
            console.error('Error en channelCreate:', error);
        }
    });

    client.on('channelDelete', async (channel) => {
        try { await antiRaidGuard.handleChannelDelete(channel); } catch (error) {
            console.error('Error en channelDelete:', error);
        }
    });

    client.on('roleCreate', async (role) => {
        try { await antiRaidGuard.handleRoleCreate(role); } catch (error) {
            console.error('Error en roleCreate:', error);
        }
    });

    client.on('roleDelete', async (role) => {
        try { await antiRaidGuard.handleRoleDelete(role); } catch (error) {
            console.error('Error en roleDelete:', error);
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
            console.error('Error en voiceStateUpdate:', error);
        }
    });

    client.on('messageReactionAdd', async (reaction, user) => {
        try { await handleReactionAdd(reaction, user); } catch (error) {
            console.error('Error en messageReactionAdd:', error);
        }
    });

    client.on('messageReactionRemove', async (reaction, user) => {
        try { await handleReactionRemove(reaction, user); } catch (error) {
            console.error('Error en messageReactionRemove:', error);
        }
    });

    if (!auxiliary) return;

    client.on('guildCreate', (guild) => {
        const payloads = client.__eyedSlashPayloads;
        const token = client.__eyedBotToken;
        if (!payloads?.length || !token) return;
        setTimeout(() => {
            registerSlashCommandsForClient(client, token, payloads, {
                guildIds: [guild.id],
                cleanupGlobal: false,
                retries: 3
            }).catch((error) => {
                console.error('❌ Error sincronizando slash en nuevo servidor (auxiliar):', error?.message || error);
            });
        }, 10000);
    });
}

function createEyedBotClient() {
    const { Client, GatewayIntentBits } = require('discord.js');
    return new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildPresences
        ],
        partials: [Partials.Message, Partials.Channel, Partials.Reaction]
    });
}

function bootstrapAuxiliaryClient(client, token, options = {}) {
    const commandPayloads = loadBotCommands(client);
    client.__eyedSlashPayloads = commandPayloads;
    client.__eyedBotToken = token;
    client.__eyedAuxiliary = true;

    attachInteractionHandler(client);
    attachGuildEventHandlers(client, { auxiliary: true });

    if ((process.env.TTS_ENABLED || 'true').toLowerCase() !== 'false') {
        try {
            require('./tts-voice-manager').attachCleanupListeners(client);
        } catch {
            /* noop */
        }
    }

    client.once('clientReady', async () => {
        console.log(`🤖 Bot auxiliar conectado como ${client.user.tag}${options.label ? ` (${options.label})` : ''}`);
        if (MUSIC_ENABLED && config.lavalinkEnabled) {
            try {
                const lavalink = require('./lavalink-shoukaku');
                const { initQueueManager } = require('./music-queue-manager');
                const { createMusicPlayerFacade } = require('./music-player-facade');
                const MusicSystem = require('../cogs/music');
                initQueueManager(client);
                client.player = createMusicPlayerFacade(client);
                client.musicSystem = new MusicSystem(client);
                await lavalink.bootstrapMusicConnection(client);
            } catch (error) {
                console.warn('⚠️ Música auxiliar no inició:', error?.message || error);
            }
        }
        await registerSlashCommandsForClient(client, token, commandPayloads).catch((error) => {
            console.error('❌ Error registrando slash auxiliar:', error?.message || error);
        });
        if (!options.skipVoiceLoop) {
            startVoiceXpLoop(client);
            seedVoiceAnalyticsSessions(client);
        }
    });
}

module.exports = {
    MUSIC_ENABLED,
    DISABLED_SLASH_COMMANDS,
    MODERATION_COMMAND_NAMES,
    canUseModerationCommands,
    loadBotCommands,
    registerSlashCommandsForClient,
    attachInteractionHandler,
    attachGuildEventHandlers,
    createEyedBotClient,
    bootstrapAuxiliaryClient
};
