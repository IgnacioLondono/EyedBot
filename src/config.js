module.exports = {
    prefix: process.env.DEFAULT_PREFIX || '!',
    defaultCooldown: 3000,
    embedColor: '#0099FF', // Azul
    supportServer: '',
    ownerId: '',
    tenorApiKey: process.env.TENOR_API_KEY || '',
    musicDefaultVolume: Number.parseInt(process.env.MUSIC_DEFAULT_VOLUME || '40', 10),
    musicMaxVolume: Number.parseInt(process.env.MUSIC_MAX_VOLUME || '65', 10),
    musicCleanProfileEnabled: (process.env.MUSIC_CLEAN_PROFILE_ENABLED || 'false').toLowerCase() === 'true',
    musicCleanFilters: (process.env.MUSIC_CLEAN_FILTERS || 'normalizer')
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean),
    lavalinkEnabled: (process.env.LAVALINK_ENABLED || 'false').toLowerCase() === 'true',
    lavalinkHost: process.env.LAVALINK_HOST || 'lavalink',
    lavalinkPort: Number.parseInt(process.env.LAVALINK_PORT || '2333', 10),
    lavalinkPassword: process.env.LAVALINK_PASSWORD || 'youshallnotpass'
};

