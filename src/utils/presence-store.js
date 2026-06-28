const SPOTIFY_APPLICATION_ID = '463097721130188802';

const OFFLINE_TTL_MS = Math.max(
    60_000,
    Number.parseInt(process.env.PRESENCE_OFFLINE_TTL_MS || '300000', 10)
);
const ONLINE_TTL_MS = Math.max(
    OFFLINE_TTL_MS,
    Number.parseInt(process.env.PRESENCE_ONLINE_TTL_MS || '3600000', 10)
);

const cache = new Map();
let cleanupTimer = null;

function isSpotifyActivity(activity) {
    if (!activity) return false;
    return activity.applicationId === SPOTIFY_APPLICATION_ID
        || (Number(activity.type) === 2 && String(activity.name || '').toLowerCase() === 'spotify');
}

function formatDiscordUser(user) {
    if (!user) return null;
    return {
        id: String(user.id),
        username: user.username || '',
        global_name: user.globalName ?? user.global_name ?? null,
        avatar: user.avatar ?? null,
        discriminator: user.discriminator || '0'
    };
}

function formatActivities(presence) {
    const raw = presence?.activities || [];
    return raw
        .filter((activity) => !isSpotifyActivity(activity))
        .map((activity) => ({
            type: Number(activity.type ?? 0),
            name: activity.name || '',
            details: activity.details ?? null,
            state: activity.state ?? null
        }));
}

function extractSpotify(presence) {
    const spotifyActivity = (presence?.activities || []).find(isSpotifyActivity);
    if (!spotifyActivity) return null;
    return {
        song: spotifyActivity.details || null,
        artist: spotifyActivity.state || null,
        album: spotifyActivity.assets?.largeText || null
    };
}

function normalizeStatus(status) {
    const value = String(status || 'offline').toLowerCase();
    if (value === 'invisible') return 'offline';
    if (value === 'online' || value === 'idle' || value === 'dnd' || value === 'offline') {
        return value;
    }
    return 'offline';
}

function serializePresence(presence, userFallback = null) {
    const user = presence?.user || userFallback;
    if (!user) return null;

    const discordUser = formatDiscordUser(user);
    const discordStatus = normalizeStatus(presence?.status);
    const spotify = extractSpotify(presence);
    const activities = formatActivities(presence);

    return {
        discord_user: discordUser,
        discord_status: discordStatus,
        activities,
        spotify
    };
}

function serializeFromMember(member) {
    if (!member?.user) return null;
    return serializePresence(member.presence, member.user);
}

function setPresence(userId, data) {
    if (!userId || !data) return;
    const id = String(userId);
    const status = data.discord_status || 'offline';
    const ttl = status === 'offline' ? OFFLINE_TTL_MS : ONLINE_TTL_MS;
    cache.set(id, {
        data,
        expiresAt: Date.now() + ttl,
        updatedAt: Date.now()
    });
}

function getPresence(userId) {
    const id = String(userId);
    const entry = cache.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        cache.delete(id);
        return null;
    }
    return entry.data;
}

function pruneExpiredEntries() {
    const now = Date.now();
    for (const [userId, entry] of cache.entries()) {
        if (now > entry.expiresAt) {
            cache.delete(userId);
        }
    }
}

function startPresenceCacheCleanup() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(pruneExpiredEntries, Math.min(OFFLINE_TTL_MS, 60_000));
    if (typeof cleanupTimer.unref === 'function') {
        cleanupTimer.unref();
    }
}

function stopPresenceCacheCleanup() {
    if (!cleanupTimer) return;
    clearInterval(cleanupTimer);
    cleanupTimer = null;
}

function getPresenceGuildFilter() {
    const explicit = process.env.PRESENCE_GUILD_IDS;
    if (explicit !== undefined && explicit !== null) {
        const trimmed = String(explicit).trim();
        if (!trimmed || trimmed === '*') return null;
        const ids = trimmed.split(/[,;\s]+/).map((id) => id.trim()).filter(Boolean);
        return ids.length ? new Set(ids) : null;
    }

    const guildId = String(process.env.GUILD_ID || '').trim();
    if (guildId) return new Set([guildId]);
    return null;
}

function isGuildTracked(guildId) {
    const filter = getPresenceGuildFilter();
    if (!filter) return true;
    return filter.has(String(guildId));
}

module.exports = {
    serializePresence,
    serializeFromMember,
    setPresence,
    getPresence,
    startPresenceCacheCleanup,
    stopPresenceCacheCleanup,
    isGuildTracked,
    getPresenceGuildFilter
};
