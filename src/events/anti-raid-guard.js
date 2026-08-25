const { AuditLogEvent, ChannelType, PermissionFlagsBits, UserFlags } = require('discord.js');
const antiRaidStore = require('../utils/anti-raid-config-store');

const messageWindowMap = new Map();
const joinWindowMap = new Map();
const destructiveWindowMap = new Map();

function nowMs() {
    return Date.now();
}

function inTrustedRole(member, trustedRoleIds = []) {
    if (!member || !Array.isArray(trustedRoleIds) || !trustedRoleIds.length) return false;
    return trustedRoleIds.some((roleId) => member.roles.cache.has(String(roleId)));
}

function isTrustedMember(member, guild, config) {
    if (!member || !guild) return false;
    if (member.user?.id === guild.ownerId) return true;
    if (member.user?.bot) return true;
    if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
    if (inTrustedRole(member, config?.trustedRoleIds || [])) return true;
    return false;
}

async function sendAlert(guild, config, text) {
    const channelId = String(config?.alertChannelId || '').trim();
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ content: `🛡️ Anti-Raid: ${text}` }).catch(() => null);
}

async function applyPunishment(member, mode, reason, timeoutMinutes = 30) {
    if (!member || !member.guild || member.user?.bot) return;

    const guild = member.guild;
    const me = guild.members.me;
    if (!me) return;
    if (member.id === guild.ownerId) return;
    if (member.roles.highest.position >= me.roles.highest.position) return;

    const action = String(mode || 'timeout');
    if (action === 'ban' && me.permissions.has(PermissionFlagsBits.BanMembers)) {
        await member.ban({ reason }).catch(() => null);
        return;
    }
    if (action === 'kick' && me.permissions.has(PermissionFlagsBits.KickMembers)) {
        await member.kick(reason).catch(() => null);
        return;
    }

    if (me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        const timeoutMs = Math.max(60_000, Math.min(2_419_200_000, (Number.parseInt(timeoutMinutes || 30, 10) || 30) * 60_000));
        await member.timeout(timeoutMs, reason).catch(() => null);
    }
}

function pushWindowCounter(map, key, windowMs) {
    const t = nowMs();
    const arr = map.get(key) || [];
    const next = arr.filter((value) => t - value <= windowMs);
    next.push(t);
    map.set(key, next);
    return next.length;
}

function hasSuspiciousLink(content = '') {
    const text = String(content || '').toLowerCase();
    if (!text) return false;
    return /https?:\/\//.test(text) || /\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}\b/.test(text);
}

function hasDiscordInvite(content = '') {
    const text = String(content || '').toLowerCase();
    return /(?:discord\.gg|discord\.com\/invite)\//.test(text);
}

function mentionCount(content = '') {
    return (String(content || '').match(/<@!?\d+>/g) || []).length;
}

async function handleMessageCreate(message) {
    if (!message || !message.guild || !message.member || message.author?.bot) return;

    const config = await antiRaidStore.getAntiRaidConfig(message.guild.id);
    if (!config || config.enabled !== true) return;

    if (isTrustedMember(message.member, message.guild, config)) return;

    const windowMs = Math.max(3000, (Number.parseInt(config.spamWindowSec || 8, 10) || 8) * 1000);
    const limit = Math.max(3, Number.parseInt(config.spamMessages || 7, 10) || 7);

    if (config.antiSpamEnabled === true) {
        const key = `${message.guild.id}:${message.author.id}`;
        const count = pushWindowCounter(messageWindowMap, key, windowMs);
        if (count >= limit) {
            await message.delete().catch(() => null);
            await applyPunishment(message.member, config.actionMode, 'Anti-raid: spam detectado', config.timeoutMinutes);
            await sendAlert(message.guild, config, `Spam detectado de <@${message.author.id}>. Acción: ${config.actionMode || 'timeout'}.`);
            return;
        }
    }

    if (config.blockInvites === true && hasDiscordInvite(message.content || '')) {
        await message.delete().catch(() => null);
        await applyPunishment(message.member, config.actionMode, 'Anti-raid: invitación externa', config.timeoutMinutes);
        await sendAlert(message.guild, config, `Invitación externa bloqueada de <@${message.author.id}>.`);
        return;
    }

    if (config.blockLinks === true && hasSuspiciousLink(message.content || '')) {
        await message.delete().catch(() => null);
        await sendAlert(message.guild, config, `Enlace sospechoso bloqueado de <@${message.author.id}>.`);
        return;
    }

    const maxMentions = Math.max(1, Number.parseInt(config.maxMentions || 6, 10) || 6);
    if (mentionCount(message.content || '') > maxMentions) {
        await message.delete().catch(() => null);
        await applyPunishment(message.member, config.actionMode, 'Anti-raid: exceso de menciones', config.timeoutMinutes);
        await sendAlert(message.guild, config, `Exceso de menciones detectado de <@${message.author.id}>.`);
    }
}

async function isDiscordVerifiedBot(user) {
    if (!user?.bot) return false;
    let flags = user.flags;
    if (!flags) {
        try {
            const fetched = await user.fetch(true);
            flags = fetched.flags;
        } catch {
            flags = null;
        }
    }
    if (!flags) return false;
    try {
        return flags.has(UserFlags.VerifiedBot);
    } catch {
        return false;
    }
}

async function applyBotFilterAction(member, action, reason) {
    const guild = member.guild;
    const me = guild.members.me;
    if (!me || member.id === me.id) return false;
    if (member.id === guild.ownerId) return false;
    if (member.roles.highest.position >= me.roles.highest.position) return false;

    const mode = String(action || 'kick');
    if (mode === 'ban' && me.permissions.has(PermissionFlagsBits.BanMembers)) {
        await member.ban({ reason }).catch(() => null);
        return true;
    }
    if ((mode === 'kick' || mode === 'ban') && me.permissions.has(PermissionFlagsBits.KickMembers)) {
        await member.kick(reason).catch(() => null);
        return true;
    }
    return false;
}

async function assignBotRole(member, botRoleId) {
    const roleId = String(botRoleId || '').trim();
    if (!roleId || !member?.guild) return;
    const me = member.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return;
    const role = member.guild.roles.cache.get(roleId)
        || await member.guild.roles.fetch(roleId).catch(() => null);
    if (!role || role.position >= me.roles.highest.position) return;
    if (member.roles.cache.has(role.id)) return;
    await member.roles.add(role, 'Bot permitido: rol de bots').catch(() => null);
}

/**
 * Decide si un bot puede quedarse en el servidor.
 * - verified_only: verificados por Discord + allowlist
 * - allowlist_only: solo IDs en allowlist
 * - log_only: nunca echa; solo registra
 */
async function handleBotJoinFilter(member, config) {
    if (!config || config.botFilterEnabled !== true) return false;
    if (!member?.user?.bot) return false;

    const me = member.guild.members.me;
    if (me && member.id === me.id) return true;

    const allowlist = new Set(
        (Array.isArray(config.botAllowlistIds) ? config.botAllowlistIds : [])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
    );
    const onAllowlist = allowlist.has(String(member.id));
    const verified = await isDiscordVerifiedBot(member.user);
    const mode = String(config.botFilterMode || 'verified_only');
    const action = String(config.botFilterAction || 'kick');

    let allowed = false;
    if (mode === 'allowlist_only') {
        allowed = onAllowlist;
    } else if (mode === 'log_only') {
        allowed = true;
    } else {
        // verified_only (default)
        allowed = verified || onAllowlist;
    }

    const statusLabel = verified ? 'verificado' : 'no verificado';
    const allowLabel = onAllowlist ? ' · allowlist' : '';

    if (allowed) {
        await assignBotRole(member, config.botRoleId);
        await sendAlert(
            member.guild,
            config,
            `Bot permitido (${statusLabel}${allowLabel}): **${member.user.tag}** (\`${member.id}\`).`
        );
        return true;
    }

    await sendAlert(
        member.guild,
        config,
        `Bot bloqueado (${statusLabel}): **${member.user.tag}** (\`${member.id}\`). Acción: ${action}.`
    );

    if (action === 'log') return true;

    await applyBotFilterAction(
        member,
        action,
        `Filtro de bots: ${statusLabel} no permitido (modo ${mode})`
    );
    return true;
}

async function handleGuildMemberAdd(member) {
    if (!member || !member.guild) return;

    const config = await antiRaidStore.getAntiRaidConfig(member.guild.id);

    if (member.user?.bot) {
        await handleBotJoinFilter(member, config).catch(() => null);
        return;
    }

    if (!config || config.enabled !== true) return;

    const joinLimit = Math.max(2, Number.parseInt(config.joinRateThreshold || 8, 10) || 8);
    const joinCount = pushWindowCounter(joinWindowMap, member.guild.id, 60_000);

    const accountAgeDays = Math.max(0, Number.parseInt(config.accountAgeDays || 3, 10) || 3);
    const accountMs = nowMs() - member.user.createdTimestamp;
    const isFreshAccount = accountMs < (accountAgeDays * 86_400_000);

    if (joinCount >= joinLimit || isFreshAccount) {
        await applyPunishment(member, config.actionMode, 'Anti-raid: cuenta/entrada sospechosa', config.timeoutMinutes);
        await sendAlert(member.guild, config, `Ingreso sospechoso: <@${member.id}> (joins último minuto: ${joinCount}).`);
    }
}

async function findAuditExecutor(guild, eventType, targetId) {
    const logs = await guild.fetchAuditLogs({ type: eventType, limit: 6 }).catch(() => null);
    if (!logs) return null;

    const now = nowMs();
    const entry = logs.entries.find((item) => {
        if (!item?.executor || !item?.target) return false;
        if (String(item.target.id) !== String(targetId)) return false;
        if (now - item.createdTimestamp > 15_000) return false;
        return true;
    });

    if (!entry) return null;
    return entry.executor;
}

async function applyDestructiveProtection(guild, executorId, typeKey, config, revertFn) {
    const member = guild.members.cache.get(executorId) || await guild.members.fetch(executorId).catch(() => null);
    if (!member) return;
    if (isTrustedMember(member, guild, config)) return;

    const windowSec = Math.max(10, Number.parseInt(config.actionWindowSec || 60, 10) || 60);
    const threshold = Math.max(1, Number.parseInt(config.destructiveActionThreshold || 3, 10) || 3);
    const key = `${guild.id}:${executorId}:${typeKey}`;
    const count = pushWindowCounter(destructiveWindowMap, key, windowSec * 1000);

    if (typeof revertFn === 'function') {
        await revertFn().catch(() => null);
    }

    if (count >= threshold) {
        await applyPunishment(member, config.actionMode, `Anti-raid: cambios destructivos (${typeKey})`, config.timeoutMinutes);
        await sendAlert(guild, config, `Cambios destructivos detectados (${typeKey}) por <@${executorId}>. Acción: ${config.actionMode || 'timeout'}.`);
    }
}

async function handleChannelCreate(channel) {
    if (!channel?.guild) return;
    const config = await antiRaidStore.getAntiRaidConfig(channel.guild.id);
    if (!config || config.enabled !== true || config.protectChannels !== true) return;

    const executor = await findAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    if (!executor) return;

    await applyDestructiveProtection(channel.guild, executor.id, 'channel_create', config, async () => {
        await channel.delete('Anti-raid: creación no autorizada').catch(() => null);
    });
}

async function handleChannelDelete(channel) {
    if (!channel?.guild) return;
    const config = await antiRaidStore.getAntiRaidConfig(channel.guild.id);
    if (!config || config.enabled !== true || config.protectChannels !== true) return;

    const executor = await findAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    if (!executor) return;

    await applyDestructiveProtection(channel.guild, executor.id, 'channel_delete', config);
}

async function handleRoleCreate(role) {
    if (!role?.guild) return;
    const config = await antiRaidStore.getAntiRaidConfig(role.guild.id);
    if (!config || config.enabled !== true || config.protectRoles !== true) return;

    const executor = await findAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    if (!executor) return;

    await applyDestructiveProtection(role.guild, executor.id, 'role_create', config, async () => {
        await role.delete('Anti-raid: creación de rol no autorizada').catch(() => null);
    });
}

async function handleRoleDelete(role) {
    if (!role?.guild) return;
    const config = await antiRaidStore.getAntiRaidConfig(role.guild.id);
    if (!config || config.enabled !== true || config.protectRoles !== true) return;

    const executor = await findAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    if (!executor) return;

    await applyDestructiveProtection(role.guild, executor.id, 'role_delete', config);
}

module.exports = {
    handleMessageCreate,
    handleGuildMemberAdd,
    handleChannelCreate,
    handleChannelDelete,
    handleRoleCreate,
    handleRoleDelete
};
