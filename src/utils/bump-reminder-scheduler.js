const { EmbedBuilder } = require('discord.js');
const bumpReminderStore = require('./bump-reminder-store');
const { awardXpToMember } = require('../events/leveling-tracker');

const CHECK_MS = Math.max(30_000, Number.parseInt(process.env.BUMP_REMINDER_CHECK_MS || '60000', 10));
const DISBOARD_BOT_ID = '302050872383242240';
const DETECT_COOLDOWN_MS = Math.max(10_000, Number.parseInt(process.env.BUMP_DETECT_COOLDOWN_MS || '45000', 10));
let intervalRef = null;
let running = false;
const lastDetectionByGuild = new Map();
const lastRewardByBumper = new Map();
const BUMP_REWARD_COOLDOWN_MS = Math.max(30_000, Number.parseInt(process.env.BUMP_REWARD_COOLDOWN_MS || '120000', 10));

function buildNextReminderAt(intervalMinutes) {
    const mins = Math.max(15, Number(intervalMinutes) || 120);
    return new Date(Date.now() + (mins * 60 * 1000)).toISOString();
}

function shouldSendNow(config) {
    if (config.waitingForBump === true) return false;
    const raw = String(config.nextReminderAt || '').trim();
    if (!raw) return false;
    const ts = Date.parse(raw);
    if (!Number.isFinite(ts)) return false;
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

    await bumpReminderStore.setBumpReminderConfig(guildId, {
        ...config,
        waitingForBump: true,
        nextReminderAt: '',
        updatedAt: new Date().toISOString(),
        updatedBy: 'scheduler'
    });
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

function extractBumperUserId(message) {
    const fromInteraction = message?.interaction?.user?.id
        || message?.interactionMetadata?.user?.id;
    if (fromInteraction) return String(fromInteraction);

    return '';
}

async function grantBumpXpBonus(message, config) {
    const userId = extractBumperUserId(message);
    if (!userId) return null;

    const xpBonus = Math.max(0, Number.parseInt(config.bumpXpBonus ?? 0, 10) || 0);
    if (xpBonus <= 0) return null;

    const guild = message.guild || await message.client.guilds.fetch(message.guildId).catch(() => null);
    if (!guild) return null;

    const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
    if (!member || member.user?.bot) return null;

    return awardXpToMember(member, xpBonus, 'bump');
}

async function grantBumpRewards(message, config) {
    const userId = extractBumperUserId(message);
    const guildId = String(message.guildId || '');
    if (!userId || !guildId) return;

    const rewardKey = `${guildId}:${userId}`;
    const now = Date.now();
    const lastReward = Number(lastRewardByBumper.get(rewardKey) || 0);
    if (now - lastReward < BUMP_REWARD_COOLDOWN_MS) return;

    const xpState = await grantBumpXpBonus(message, config).catch(() => null);

    const xpBonus = Math.max(0, Number.parseInt(config.bumpXpBonus ?? 0, 10) || 0);
    if (xpState && xpBonus > 0) {
        const guild = message.guild || await message.client.guilds.fetch(guildId).catch(() => null);
        const channel = guild?.channels?.cache?.get(config.channelId)
            || await guild?.channels?.fetch(config.channelId).catch(() => null);
        if (channel?.isTextBased()) {
            await channel.send({
                content: `<@${userId}> recibiste **+${xpBonus} XP** por hacer bump.`
            }).catch(() => null);
        }
    }

    lastRewardByBumper.set(rewardKey, now);
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
        waitingForBump: false,
        nextReminderAt: buildNextReminderAt(config.intervalMinutes),
        updatedAt: new Date().toISOString(),
        updatedBy: 'disboard-detect'
    };
    await bumpReminderStore.setBumpReminderConfig(guildId, nextConfig);
    lastDetectionByGuild.set(guildId, now);

    await grantBumpRewards(message, config).catch((error) => {
        console.error('Error otorgando recompensas de bump:', error?.message || error);
    });

    return true;
}

module.exports = {
    buildNextReminderAt,
    startBumpReminderScheduler,
    stopBumpReminderScheduler,
    runBumpReminderSweep,
    handleDisboardBumpMessage
};
