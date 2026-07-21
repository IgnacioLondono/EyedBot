const presenceStore = require('../utils/presence-store');
const { communityEventBus } = require('../utils/community-event-bus');

function attachPresenceTracking(client) {
    client.on('presenceUpdate', (_oldPresence, newPresence) => {
        try {
            const user = newPresence?.user;
            if (!user || user.bot) return;

            const guildId = newPresence.guild?.id;
            if (guildId && !presenceStore.isGuildTracked(guildId)) return;

            const payload = presenceStore.serializePresence(newPresence, user);
            if (payload) {
                presenceStore.setPresence(user.id, payload);
                communityEventBus.appendCoalesced({
                    guildId,
                    type: 'presence.changed',
                    scope: 'guild_public',
                    subjectUserId: user.id,
                    payload: {
                        userId: String(user.id),
                        status: String(payload.status || 'offline')
                    }
                }, `presence:${guildId}:${user.id}`, 500);
            }
        } catch (error) {
            console.error('Error en presenceUpdate:', error?.message || error);
        }
    });
}

function seedPresencesFromClient(client) {
    let seeded = 0;
    for (const guild of client.guilds.cache.values()) {
        if (!presenceStore.isGuildTracked(guild.id)) continue;

        for (const member of guild.members.cache.values()) {
            if (member.user.bot) continue;
            const payload = presenceStore.serializeFromMember(member);
            if (!payload) continue;
            presenceStore.setPresence(member.id, payload);
            seeded += 1;
        }
    }
    if (seeded > 0) {
        console.log(`👁️ Presencia: ${seeded} miembros cacheados desde ${client.guilds.cache.size} servidor(es).`);
    }
}

module.exports = {
    attachPresenceTracking,
    seedPresencesFromClient
};
