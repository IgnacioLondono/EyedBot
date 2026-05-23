let discordClient = null;

function setDiscordClient(client) {
    discordClient = client || null;
}

function getDiscordClient() {
    return discordClient;
}

module.exports = {
    setDiscordClient,
    getDiscordClient
};
