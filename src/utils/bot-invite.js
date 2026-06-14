function getBotInviteUrl(client) {
    const override = String(process.env.BOT_INVITE_URL || process.env.BOT_OAUTH_URL || '').trim();
    if (override) return override;

    const clientId = String(process.env.CLIENT_ID || client?.user?.id || '').trim();
    return buildBotInviteUrl(clientId);
}

function buildBotInviteUrl(clientId, permissions = '8') {
    const id = String(clientId || '').trim();
    if (!id) return '';
    const perms = String(permissions || '8').trim();
    return `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(id)}&permissions=${encodeURIComponent(perms)}&scope=bot%20applications.commands`;
}

module.exports = {
    getBotInviteUrl,
    buildBotInviteUrl
};
