const {
    normalizeEmojiIdentifier,
    resolveVerifyConfig,
    ensureMember,
    completeVerification,
    revokeVerification,
    usesReactionVerification,
    eligibilityMessage
} = require('../utils/verify-service');

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
    if (!cfg || !usesReactionVerification(cfg)) return;

    if (String(message.channelId) !== String(cfg.channelId) || String(message.id) !== String(cfg.messageId)) return;

    const expectedEmoji = String(cfg.emoji || '✅');
    const reactionEmoji = normalizeEmojiIdentifier(reaction.emoji);
    if (reactionEmoji !== expectedEmoji) return;

    const member = await ensureMember(guild, user.id);
    if (!member) return;

    const result = await completeVerification(member, cfg, 'Verificación por reacción');
    if (!result.ok && result.reason !== 'already_verified') {
        await reaction.users.remove(user.id).catch(() => null);
        const channel = message.channel;
        if (channel?.isTextBased?.()) {
            await channel.send({
                content: `<@${user.id}> ${eligibilityMessage(cfg, result)}`,
                allowedMentions: { users: [user.id], parse: [] }
            }).catch(() => null);
        }
    }
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
    if (!cfg || cfg.removeRoleOnUnreact !== true || !usesReactionVerification(cfg)) return;

    if (String(message.channelId) !== String(cfg.channelId) || String(message.id) !== String(cfg.messageId)) return;

    const expectedEmoji = String(cfg.emoji || '✅');
    const reactionEmoji = normalizeEmojiIdentifier(reaction.emoji);
    if (reactionEmoji !== expectedEmoji) return;

    const member = await ensureMember(guild, user.id);
    if (!member) return;

    await revokeVerification(member, cfg, 'Desverificación por quitar reacción');
}

module.exports = {
    handleReactionAdd,
    handleReactionRemove
};
