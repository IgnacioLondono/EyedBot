const verifyStore = require('../utils/verify-config-store');

function normalizeEmojiIdentifier(emoji) {
    if (!emoji) return '';
    if (emoji.id) return String(emoji.id);
    return String(emoji.name || '');
}

async function resolveVerifyConfig(guild) {
    if (!guild?.id) return null;
    const cfg = await verifyStore.getVerifyConfig(guild.id);
    if (!cfg || cfg.enabled === false) return null;
    if (!cfg.channelId || !cfg.messageId || !cfg.roleId) return null;
    return cfg;
}

async function ensureMember(guild, userId) {
    if (!guild || !userId) return null;
    return guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
}

function hasRequiredPermissions(guild, role) {
    const me = guild?.members?.me;
    if (!me || !role) return false;
    if (!me.permissions.has('ManageRoles')) return false;
    if (me.roles.highest.position <= role.position) return false;
    return true;
}

async function handleReactionAdd(reaction, user) {
    if (!reaction || !user || user.bot) return;

    if (reaction.partial) {
        reaction = await reaction.fetch().catch(() => null);
        if (!reaction) return;
    }

    const message = reaction.message;
    const guild = message?.guild;
    if (!guild) return;

    const cfg = await resolveVerifyConfig(guild);
    if (!cfg) return;

    if (String(message.channelId) !== String(cfg.channelId) || String(message.id) !== String(cfg.messageId)) return;

    const expectedEmoji = String(cfg.emoji || '✅');
    const reactionEmoji = normalizeEmojiIdentifier(reaction.emoji);
    if (reactionEmoji !== expectedEmoji) return;

    const role = guild.roles.cache.get(cfg.roleId) || await guild.roles.fetch(cfg.roleId).catch(() => null);
    if (!role) return;
    if (!hasRequiredPermissions(guild, role)) return;

    const member = await ensureMember(guild, user.id);
    if (!member || member.roles.cache.has(role.id)) return;

    await member.roles.add(role, 'Verificación por reacción').catch(() => null);
}

async function handleReactionRemove(reaction, user) {
    if (!reaction || !user || user.bot) return;

    if (reaction.partial) {
        reaction = await reaction.fetch().catch(() => null);
        if (!reaction) return;
    }

    const message = reaction.message;
    const guild = message?.guild;
    if (!guild) return;

    const cfg = await resolveVerifyConfig(guild);
    if (!cfg || cfg.removeRoleOnUnreact !== true) return;

    if (String(message.channelId) !== String(cfg.channelId) || String(message.id) !== String(cfg.messageId)) return;

    const expectedEmoji = String(cfg.emoji || '✅');
    const reactionEmoji = normalizeEmojiIdentifier(reaction.emoji);
    if (reactionEmoji !== expectedEmoji) return;

    const role = guild.roles.cache.get(cfg.roleId) || await guild.roles.fetch(cfg.roleId).catch(() => null);
    if (!role) return;
    if (!hasRequiredPermissions(guild, role)) return;

    const member = await ensureMember(guild, user.id);
    if (!member || !member.roles.cache.has(role.id)) return;

    await member.roles.remove(role, 'Desverificación por quitar reacción').catch(() => null);
}

module.exports = {
    handleReactionAdd,
    handleReactionRemove
};
