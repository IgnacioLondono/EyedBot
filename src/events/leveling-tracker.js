const { ChannelType, PermissionsBitField } = require('discord.js');
const levelingStore = require('../utils/leveling-store');
const guildActivityStore = require('../utils/guild-activity-store');
const { getLevelFromXp, sanitizeDifficulty } = require('../utils/leveling-math');
const { parseRoleRewards } = require('../utils/leveling-rewards');

const messageCooldownMap = new Map();
const voiceAnalyticsSessions = new Map();
let voiceLoopTimer = null;
let voiceLoopRunning = false;

function getVoiceSessionKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function canTrackVoiceChannel(channel) {
    return channel && (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice);
}

function beginVoiceAnalyticsSession(member, channel, startedAt = Date.now()) {
    if (!member?.guild || !member.user || member.user.bot || !canTrackVoiceChannel(channel)) return;
    voiceAnalyticsSessions.set(getVoiceSessionKey(member.guild.id, member.user.id), {
        guildId: member.guild.id,
        userId: member.user.id,
        startedAt
    });
}

async function flushVoiceAnalyticsSession(guildId, userId, endedAt = Date.now()) {
    const sessionKey = getVoiceSessionKey(guildId, userId);
    const session = voiceAnalyticsSessions.get(sessionKey);
    if (!session) return 0;

    voiceAnalyticsSessions.delete(sessionKey);

    const elapsedMs = Math.max(0, Number(endedAt) - Number(session.startedAt || endedAt));
    const earnedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));
    if (earnedMinutes <= 0) return 0;

    await levelingStore.incrementUserStats(guildId, userId, { voiceMinutes: earnedMinutes });
    await guildActivityStore.incrementGuildMetric(guildId, 'voiceMinutes', earnedMinutes).catch(() => null);
    return earnedMinutes;
}

function randInt(min, max) {
    const low = Math.max(0, Number.parseInt(min, 10) || 0);
    const high = Math.max(low, Number.parseInt(max, 10) || low);
    return low + Math.floor(Math.random() * (high - low + 1));
}

async function sendLevelUpAnnouncements(member, oldLevel, newLevel, cfg) {
    const channelId = String(cfg?.levelUpAnnounceChannelId || '').trim();
    if (!channelId || !member?.guild?.id || newLevel <= oldLevel) return;

    const guild = member.guild;
    const channel =
        guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel || !channel.isTextBased?.()) return;

    const me = guild.members.me;
    if (!me?.permissionsIn(channel)?.has(PermissionsBitField.Flags.SendMessages)) return;

    const mention = `<@${member.user.id}>`;

    const start = Math.max(1, oldLevel + 1);
    const end = Math.max(start, newLevel);
    const span = end - start + 1;

    try {
        if (span <= 5) {
            for (let lvl = start; lvl <= end; lvl += 1) {
                await channel.send({
                    content: `¡Felicidades ${mention}! Has alcanzado el nivel ${lvl}.`
                });
            }
        } else {
            await channel.send({
                content: `¡Felicidades ${mention}! Has pasado del nivel ${oldLevel} al ${newLevel}.`
            });
        }
    } catch (err) {
        console.warn('[leveling] No se pudo enviar aviso de nivel:', err?.message || err);
    }
}

async function applyRoleRewards(member, level, rewards) {
    if (!member || !member.guild) return;

    const me = member.guild.members.me;
    if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

    const sorted = [...rewards].sort((a, b) => a.level - b.level);
    const unlocked = sorted.filter((r) => level >= r.level);
    if (!unlocked.length) return;

    const currentReward = unlocked[unlocked.length - 1];
    const lowerRewards = unlocked.slice(0, -1);

    for (const prev of lowerRewards) {
        if (!member.roles.cache.has(prev.roleId)) continue;
        const prevRole = member.guild.roles.cache.get(prev.roleId)
            || await member.guild.roles.fetch(prev.roleId).catch(() => null);
        if (!prevRole) continue;
        if (me.roles.highest.position <= prevRole.position) continue;
        await member.roles.remove(prevRole, `Level automático: reemplazo por nivel ${level}`).catch(() => null);
    }

    const role = member.guild.roles.cache.get(currentReward.roleId)
        || await member.guild.roles.fetch(currentReward.roleId).catch(() => null);
    if (!role) return;
    if (me.roles.highest.position <= role.position) return;
    if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role, `Level automático: nivel ${level}`).catch(() => null);
    }
}

async function awardXpToMember(member, amount, source = 'message') {
    if (!member || !member.guild || member.user?.bot) return null;

    const guildId = member.guild.id;
    const userId = member.user.id;

    const cfg = await levelingStore.getLevelingConfig(guildId);
    if (!cfg || cfg.enabled !== true) return null;

    const state = await levelingStore.getUserState(guildId, userId);
    const difficulty = sanitizeDifficulty(cfg.difficulty);

    const oldLevel = Math.max(0, Number.parseInt(state.level || 0, 10) || 0);
    const newXp = Math.max(0, (Number.parseInt(state.xp || 0, 10) || 0) + Math.max(0, Number.parseInt(amount || 0, 10) || 0));
    const newLevel = getLevelFromXp(newXp, difficulty);

    const nextState = {
        ...state,
        xp: newXp,
        level: newLevel,
        updatedAt: new Date().toISOString()
    };

    await levelingStore.setUserState(guildId, userId, nextState);

    if (newLevel > oldLevel) {
        const rewards = parseRoleRewards(cfg.roleRewards);
        await applyRoleRewards(member, newLevel, rewards);
        await sendLevelUpAnnouncements(member, oldLevel, newLevel, cfg);
    }

    return nextState;
}

async function handleMessageCreate(message) {
    if (!message || !message.guild || message.author?.bot) return;

    await levelingStore.incrementUserStats(message.guild.id, message.author.id, { messageCount: 1 });
    await guildActivityStore.incrementGuildMetric(message.guild.id, 'messages', 1).catch(() => null);

    const cfg = await levelingStore.getLevelingConfig(message.guild.id);
    if (!cfg || cfg.enabled !== true || cfg.messageXpEnabled !== true) return;

    const cooldownMs = Math.max(10000, Number.parseInt(cfg.messageCooldownMs || 45000, 10) || 45000);
    const cooldownKey = `${message.guild.id}:${message.author.id}`;
    const last = messageCooldownMap.get(cooldownKey) || 0;
    const now = Date.now();
    if (now - last < cooldownMs) return;

    messageCooldownMap.set(cooldownKey, now);

    const xpGain = randInt(cfg.messageXpMin ?? 10, cfg.messageXpMax ?? 16);
    const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return;

    await awardXpToMember(member, xpGain, 'message');
}

async function handleAnalyticsVoiceStateUpdate(oldState, newState) {
    const member = newState?.member || oldState?.member;
    if (!member?.guild || member.user?.bot) return;

    const guildId = member.guild.id;
    const userId = member.user.id;
    const oldChannelId = oldState?.channelId || null;
    const newChannelId = newState?.channelId || null;
    const oldTrackable = canTrackVoiceChannel(oldState?.channel);
    const newTrackable = canTrackVoiceChannel(newState?.channel);

    if (oldChannelId && (!newChannelId || oldChannelId !== newChannelId || !newTrackable)) {
        await flushVoiceAnalyticsSession(guildId, userId, Date.now());
    }

    if (newChannelId && newTrackable && oldChannelId !== newChannelId) {
        beginVoiceAnalyticsSession(member, newState.channel, Date.now());
    }
}

function seedVoiceAnalyticsSessions(client) {
    if (!client?.guilds?.cache) return;

    for (const guild of client.guilds.cache.values()) {
        for (const channel of guild.channels.cache.values()) {
            if (!canTrackVoiceChannel(channel)) continue;
            for (const member of channel.members.values()) {
                beginVoiceAnalyticsSession(member, channel, Date.now());
            }
        }
    }
}

function countHumanMembersInVoice(channel) {
    if (!channel || !channel.members) return 0;
    let count = 0;
    channel.members.forEach((member) => {
        if (!member.user?.bot) count += 1;
    });
    return count;
}

async function runVoiceXpCycle(client) {
    if (!client || voiceLoopRunning) return;
    voiceLoopRunning = true;

    try {
        const guilds = Array.from(client.guilds.cache.values());
        for (const guild of guilds) {
            const cfg = await levelingStore.getLevelingConfig(guild.id);
            if (!cfg || cfg.enabled !== true || cfg.voiceXpEnabled !== true) continue;

            const voiceXpPerMinute = Math.max(1, Math.min(100, Number.parseInt(cfg.voiceXpPerMinute || 6, 10) || 6));
            const requirePeers = cfg.voiceRequirePeers !== false;

            const voiceChannels = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildVoice);
            for (const channel of voiceChannels.values()) {
                const humanCount = countHumanMembersInVoice(channel);
                if (requirePeers && humanCount < 2) continue;

                for (const member of channel.members.values()) {
                    if (member.user?.bot) continue;
                    await awardXpToMember(member, voiceXpPerMinute, 'voice');
                }
            }
        }
    } catch (error) {
        console.error('Error en ciclo de XP de voz:', error);
    } finally {
        voiceLoopRunning = false;
    }
}

function startVoiceXpLoop(client) {
    if (voiceLoopTimer) clearInterval(voiceLoopTimer);
    voiceLoopTimer = setInterval(() => {
        runVoiceXpCycle(client);
    }, 60 * 1000);

    runVoiceXpCycle(client);
}

function stopVoiceXpLoop() {
    if (voiceLoopTimer) {
        clearInterval(voiceLoopTimer);
        voiceLoopTimer = null;
    }
}

async function flushAllVoiceAnalyticsSessions() {
    const sessions = Array.from(voiceAnalyticsSessions.values());
    for (const session of sessions) {
        await flushVoiceAnalyticsSession(session.guildId, session.userId, Date.now());
    }
}

module.exports = {
    handleMessageCreate,
    handleAnalyticsVoiceStateUpdate,
    seedVoiceAnalyticsSessions,
    flushAllVoiceAnalyticsSessions,
    startVoiceXpLoop,
    stopVoiceXpLoop
};
