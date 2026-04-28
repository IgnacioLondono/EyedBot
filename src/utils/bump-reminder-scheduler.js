const { EmbedBuilder } = require('discord.js');
const bumpReminderStore = require('./bump-reminder-store');

const CHECK_MS = Math.max(30_000, Number.parseInt(process.env.BUMP_REMINDER_CHECK_MS || '60000', 10));
let intervalRef = null;
let running = false;

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

    await channel.send({ embeds: [embed] });
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

module.exports = {
    buildNextReminderAt,
    startBumpReminderScheduler,
    stopBumpReminderScheduler,
    runBumpReminderSweep
};
