const { ChannelType, PermissionsBitField } = require('discord.js');
const levelingStore = require('../utils/leveling-store');
const { getLevelFromXp, sanitizeDifficulty } = require('../utils/leveling-math');

const messageCooldownMap = new Map();
let voiceLoopTimer = null;
let voiceLoopRunning = false;

function randInt(min, max) {
    const low = Math.max(0, Number.parseInt(min, 10) || 0);
    const high = Math.max(low, Number.parseInt(max, 10) || low);
    return low + Math.floor(Math.random() * (high - low + 1));
}

function parseRoleRewards(rawRewards) {
    if (!Array.isArray(rawRewards)) return [];
    return rawRewards
        .map((reward) => ({
            level: Math.max(1, Number.parseInt(reward?.level, 10) || 1),
            roleId: String(reward?.roleId || '').trim()
        }))
        .filter((reward) => reward.roleId)
        .sort((a, b) => a.level - b.level);
}

async function applyRoleRewards(member, level, rewards) {
    if (!member || !member.guild) return;

    const me = member.guild.members.me;
    if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;

    for (const reward of rewards) {
        if (level < reward.level) continue;
        const role = member.guild.roles.cache.get(reward.roleId) || await member.guild.roles.fetch(reward.roleId).catch(() => null);
        if (!role) continue;
        if (member.roles.cache.has(role.id)) continue;
        if (me.roles.highest.position <= role.position) continue;
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

    if (source === 'message') nextState.messageCount = Math.max(0, Number.parseInt(state.messageCount || 0, 10) || 0) + 1;
    if (source === 'voice') nextState.voiceMinutes = Math.max(0, Number.parseInt(state.voiceMinutes || 0, 10) || 0) + 1;

    await levelingStore.setUserState(guildId, userId, nextState);

    if (newLevel > oldLevel) {
        const rewards = parseRoleRewards(cfg.roleRewards);
        await applyRoleRewards(member, newLevel, rewards);
    }

    return nextState;
}

async function handleMessageCreate(message) {
    if (!message || !message.guild || message.author?.bot) return;

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

module.exports = {
    handleMessageCreate,
    startVoiceXpLoop,
    stopVoiceXpLoop
};
