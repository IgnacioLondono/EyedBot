function formatMs(ms) {
    const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = Math.floor(total % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function isHttpUrl(input) {
    return /^https?:\/\//i.test(String(input || '').trim());
}

/**
 * @param {import('lavalink-client').Track | { encoded: string, info: object }} lavalinkTrack
 * @param {import('discord.js').User | object | null} [requestedBy]
 */
function trackFromLavalink(lavalinkTrack, requestedBy = null) {
    const info = lavalinkTrack?.info || {};
    const uri = info.uri || info.url || '';
    return {
        title: info.title || 'Sin título',
        author: info.author || 'Desconocido',
        url: uri,
        uri,
        duration: formatMs(info.length),
        durationMS: Number(info.length) || 0,
        thumbnail: info.artworkUrl || info.artwork_url || null,
        encoded: lavalinkTrack.encoded,
        requestedBy,
        source: info.sourceName || info.source || 'unknown',
        raw: lavalinkTrack
    };
}

/**
 * @param {string} query
 * @param {string} [searchEngine]
 */
function buildResolveIdentifier(query, searchEngine = 'youtube') {
    const q = String(query || '').trim();
    if (!q) return '';
    if (isHttpUrl(q)) return q;

    const engine = String(searchEngine || 'youtube').toLowerCase();
    if (engine === 'soundcloud') return `scsearch:${q}`;
    if (engine === 'spotify') return `spsearch:${q}`;
    if (q.startsWith('ytsearch:') || q.startsWith('scsearch:') || q.startsWith('spsearch:')) return q;
    return `ytsearch:${q}`;
}

function inferSearchEngineForUrl(url) {
    const lower = String(url || '').toLowerCase();
    if (lower.includes('soundcloud.com')) return 'soundcloud';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    if (lower.includes('spotify.com')) return 'spotify';
    return 'youtube';
}

/**
 * Guarda metadatos del enlace original sin sobrescribir lo que realmente suena.
 * @param {object} track
 * @param {{ title?: string, artist?: string, provider?: string, sourceUrl?: string, thumbnail?: string }} meta
 */
function attachRequestedMetadata(track, meta = {}) {
    if (!track || !meta) return track;
    if (meta.title) track.requestedTitle = meta.title;
    if (meta.artist) track.requestedArtist = meta.artist;
    if (meta.provider) track.requestedProvider = meta.provider;
    if (meta.sourceUrl) track.requestedSourceUrl = meta.sourceUrl;
    if (meta.thumbnail) track.requestedThumbnail = meta.thumbnail;
    return track;
}

module.exports = {
    formatMs,
    isHttpUrl,
    trackFromLavalink,
    buildResolveIdentifier,
    inferSearchEngineForUrl,
    attachRequestedMetadata
};
