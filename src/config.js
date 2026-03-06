module.exports = {
    prefix: process.env.DEFAULT_PREFIX || '!',
    defaultCooldown: 3000,
    embedColor: '#0099FF', // Azul
    supportServer: '',
    ownerId: '',
    tenorApiKey: process.env.TENOR_API_KEY || '',
    musicDefaultVolume: Number.parseInt(process.env.MUSIC_DEFAULT_VOLUME || '55', 10),
    musicMaxVolume: Number.parseInt(process.env.MUSIC_MAX_VOLUME || '80', 10),
    musicSkipFfmpeg: (process.env.MUSIC_SKIP_FFMPEG || 'false').toLowerCase() === 'true',
    musicCleanProfileEnabled: (process.env.MUSIC_CLEAN_PROFILE_ENABLED || 'true').toLowerCase() === 'true',
    musicCleanFilters: (process.env.MUSIC_CLEAN_FILTERS || 'normalizer2,softlimiter')
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
    musicLeaveOnEmpty: (process.env.MUSIC_LEAVE_ON_EMPTY || 'true').toLowerCase() === 'true',
    musicLeaveOnEmptyCooldownMs: Number.parseInt(process.env.MUSIC_LEAVE_ON_EMPTY_COOLDOWN_MS || '90000', 10),
    musicLeaveOnEnd: (process.env.MUSIC_LEAVE_ON_END || 'true').toLowerCase() === 'true',
    musicLeaveOnEndCooldownMs: Number.parseInt(process.env.MUSIC_LEAVE_ON_END_COOLDOWN_MS || '180000', 10),
    musicLeaveOnStop: (process.env.MUSIC_LEAVE_ON_STOP || 'true').toLowerCase() === 'true',
    musicLeaveOnStopCooldownMs: Number.parseInt(process.env.MUSIC_LEAVE_ON_STOP_COOLDOWN_MS || '30000', 10),
    musicBufferingTimeoutMs: Number.parseInt(process.env.MUSIC_BUFFERING_TIMEOUT_MS || '7000', 10),
    musicConnectionTimeoutMs: Number.parseInt(process.env.MUSIC_CONNECTION_TIMEOUT_MS || '45000', 10),
    musicStrictArtistMatch: (process.env.MUSIC_STRICT_ARTIST_MATCH || 'true').toLowerCase() === 'true',
    lavalinkEnabled: (process.env.LAVALINK_ENABLED || 'false').toLowerCase() === 'true',
    lavalinkHost: process.env.LAVALINK_HOST || 'lavalink',
    lavalinkPort: Number.parseInt(process.env.LAVALINK_PORT || '2333', 10),
    lavalinkPassword: process.env.LAVALINK_PASSWORD || 'youshallnotpass'
};

