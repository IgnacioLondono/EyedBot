const streamAlertStore = require('./stream-alert-store');

const VALID_PLATFORMS = new Set(['twitch', 'youtube', 'kick', 'rumble', 'tiktok', 'custom']);

function cleanUsername(raw) {
    return String(raw || '')
        .trim()
        .replace(/^@/, '')
        .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
        .replace(/^https?:\/\/(www\.)?youtube\.com\/@/i, '')
        .replace(/^https?:\/\/(www\.)?kick\.com\//i, '')
        .replace(/^https?:\/\/(www\.)?rumble\.com\/c\//i, '')
        .replace(/[/?#].*$/, '')
        .toLowerCase();
}

function buildSourceUrl(platform, username) {
    const u = cleanUsername(username);
    switch (platform) {
        case 'twitch': return `https://twitch.tv/${u}`;
        case 'youtube': return `https://www.youtube.com/@${u}`;
        case 'kick': return `https://kick.com/${u}`;
        case 'rumble': return `https://rumble.com/c/${u}`;
        case 'tiktok': return `https://www.tiktok.com/@${u}`;
        default: return String(username || '').trim();
    }
}

function sourceKey(source) {
    return `${source.platform}:${cleanUsername(source.name || source.url)}`;
}

async function addStreamSource(guildId, { platform, username, channelId, updatedBy = 'discord' }) {
    const plat = VALID_PLATFORMS.has(platform) ? platform : 'custom';
    const clean = cleanUsername(username);
    if (!clean && plat !== 'custom') throw new Error('Usuario inválido');

    const config = await streamAlertStore.getStreamAlertConfig(guildId);
    const url = buildSourceUrl(plat, clean || username);
    const newSource = streamAlertStore.normalizeSource({
        platform: plat,
        name: clean || username,
        url,
        enabled: true
    });

    const exists = config.sources.some((s) => sourceKey(s) === sourceKey(newSource));
    if (exists) throw new Error('Ese streamer ya está en la lista');

    if (channelId) config.channelId = channelId;
    if (!config.channelId) throw new Error('Indica un canal de alertas (o configúralo en el panel web)');

    config.enabled = true;
    config.sources = [...(config.sources || []), newSource].slice(0, 20);
    config.updatedBy = updatedBy;

    await streamAlertStore.setStreamAlertConfig(guildId, config);
    return { config, source: newSource };
}

async function removeStreamSource(guildId, { platform, username, sourceId, updatedBy = 'discord' }) {
    const config = await streamAlertStore.getStreamAlertConfig(guildId);
    const before = config.sources.length;

    if (sourceId) {
        config.sources = config.sources.filter((s) => s.id !== sourceId);
    } else {
        const plat = VALID_PLATFORMS.has(platform) ? platform : null;
        const clean = cleanUsername(username);
        config.sources = config.sources.filter((s) => {
            if (plat && s.platform !== plat) return true;
            if (clean && cleanUsername(s.name) !== clean && !String(s.url).toLowerCase().includes(clean)) return true;
            return false;
        });
    }

    if (config.sources.length === before) throw new Error('Streamer no encontrado');
    config.updatedBy = updatedBy;
    await streamAlertStore.setStreamAlertConfig(guildId, config);
    return config;
}

async function listStreamSources(guildId) {
    const config = await streamAlertStore.getStreamAlertConfig(guildId);
    return { config, sources: config.sources || [] };
}

module.exports = {
    VALID_PLATFORMS,
    cleanUsername,
    buildSourceUrl,
    addStreamSource,
    removeStreamSource,
    listStreamSources
};
