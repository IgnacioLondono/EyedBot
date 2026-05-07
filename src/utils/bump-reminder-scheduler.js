const { EmbedBuilder } = require('discord.js');
const bumpReminderStore = require('./bump-reminder-store');

const CHECK_MS = Math.max(30_000, Number.parseInt(process.env.BUMP_REMINDER_CHECK_MS || '60000', 10));
const DISBOARD_BOT_ID = '302050872383242240';
const DETECT_COOLDOWN_MS = Math.max(10_000, Number.parseInt(process.env.BUMP_DETECT_COOLDOWN_MS || '45000', 10));
let intervalRef = null;
let running = false;
const lastDetectionByGuild = new Map();

function buildNextReminderAt(intervalMinutes) {
    const mins = Math.max(15, Number(intervalMinutes) || 120);
    return new Date(Date.now() + (mins * 60 * 1000)).toISOString();
}

function shouldSendNow(config) {
    const raw = String(config.nextReminderAt || '').trim();
    if (!raw) return true;
    const ts = Date.parse(raw);
    if (!Number.isFinite(ts)) return true;
    return Date.now() >= ts;
}

async function postReminder(client, guildId, config) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    const channel = guild.channels.cache.get(config.channelId)
        || await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('🔔 Recordatorio de bump')
        .setDescription(String(config.message || 'Ya puedes hacer `/bump` en Disboard.').slice(0, 4000))
        .setFooter({ text: 'EyedBot • Bump Reminder' })
        .setTimestamp(new Date());

    const rid = String(config.pingRoleId || '').trim();
    const content = rid ? `<@&${rid}>` : undefined;
    await channel.send(content ? { content, embeds: [embed] } : { embeds: [embed] });
    return true;
}

async function processGuildConfig(client, guildId, config) {
    if (!config || config.enabled !== true) return;
    if (!config.channelId) return;
    if (!shouldSendNow(config)) return;

    const posted = await postReminder(client, guildId, config).catch(() => false);
    if (!posted) return;

    const nextConfig = {
        ...config,
        nextReminderAt: buildNextReminderAt(config.intervalMinutes),
        updatedAt: new Date().toISOString(),
        updatedBy: 'scheduler'
    };
    await bumpReminderStore.setBumpReminderConfig(guildId, nextConfig);
}

async function runBumpReminderSweep(client) {
    if (running) return;
    running = true;
    try {
        const all = await bumpReminderStore.listAllBumpReminderConfigs();
        for (const item of all) {
            const guildId = String(item.guildId || '');
            if (!guildId) continue;
            await processGuildConfig(client, guildId, item.config || {});
        }
    } catch (error) {
        console.error('Error en bump reminder sweep:', error?.message || error);
    } finally {
        running = false;
    }
}

function startBumpReminderScheduler(client) {
    if (!client || intervalRef) return;
    intervalRef = setInterval(() => {
        runBumpReminderSweep(client).catch(() => null);
    }, CHECK_MS);

    runBumpReminderSweep(client).catch(() => null);
    console.log(`🔔 Bump reminder scheduler activo cada ${Math.round(CHECK_MS / 1000)}s`);
}

function stopBumpReminderScheduler() {
    if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
    }
}

function extractMessageText(message) {
    const parts = [];
    if (message?.content) parts.push(String(message.content));
    const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
    for (const embed of embeds) {
        if (embed?.title) parts.push(String(embed.title));
        if (embed?.description) parts.push(String(embed.description));
    }
    return parts.join('\n').toLowerCase();
}

function isDisboardBumpMessage(message) {
    if (!message?.guildId) return false;
    if (String(message?.author?.id || '') !== DISBOARD_BOT_ID) return false;

    const interactionCommand = String(message?.interaction?.commandName || message?.interactionMetadata?.name || '').toLowerCase();
    if (interactionCommand === 'bump') return true;

    const text = extractMessageText(message);
    if (!text) return false;

    // Solo considerar confirmaciones reales de bump exitoso.
    // No debemos detectar respuestas de cooldown como "please wait...".
    return text.includes('bump done')
        || text.includes('check it out on disboard')
        || text.includes('has bumped');
}

async function handleDisboardBumpMessage(message) {
    if (!isDisboardBumpMessage(message)) return false;

    const guildId = String(message.guildId || '');
    if (!guildId) return false;
    const now = Date.now();
    const last = Number(lastDetectionByGuild.get(guildId) || 0);
    if (now - last < DETECT_COOLDOWN_MS) return false;

    const config = await bumpReminderStore.getBumpReminderConfig(guildId);
    if (!config || config.enabled !== true) return false;

    const nextConfig = {
        ...config,
        nextReminderAt: buildNextReminderAt(config.intervalMinutes),
        updatedAt: new Date().toISOString(),
        updatedBy: 'disboard-detect'
    };
    await bumpReminderStore.setBumpReminderConfig(guildId, nextConfig);
    lastDetectionByGuild.set(guildId, now);

    const guild = message.guild || message.client.guilds.cache.get(guildId);
    const channel = guild?.channels?.cache?.get(config.channelId)
        || await guild?.channels?.fetch?.(config.channelId).catch(() => null);
    if (channel?.isTextBased()) {
        const nextTs = Math.floor(Date.parse(nextConfig.nextReminderAt) / 1000);
        const rid = String(config.pingRoleId || '').trim();
        const mention = rid ? `<@&${rid}> ` : '';
        await channel.send({
            content: `${mention}✅ Bump detectado. Próximo recordatorio <t:${nextTs}:R>.`
        }).catch(() => null);
    }

    return true;
}

module.exports = {
    buildNextReminderAt,
    startBumpReminderScheduler,
    stopBumpReminderScheduler,
    runBumpReminderSweep,
    handleDisboardBumpMessage
};
