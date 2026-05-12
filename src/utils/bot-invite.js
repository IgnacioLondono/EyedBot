function getBotInviteUrl(client) {
    const override = String(process.env.BOT_INVITE_URL || process.env.BOT_OAUTH_URL || '').trim();
    if (override) return override;

    const clientId = String(process.env.CLIENT_ID || client?.user?.id || '').trim();
    if (!clientId) return '';

    return `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=8&scope=bot%20applications.commands`;
}

module.exports = {
    getBotInviteUrl
};
