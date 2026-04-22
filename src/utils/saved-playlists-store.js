const db = require('./database');

const KEY_PREFIX = 'music_saved_playlist';
const MAX_TRACKS_PER_PLAYLIST = Math.max(1, Number.parseInt(process.env.MUSIC_PLAYLIST_MAX_TRACKS || '200', 10));
const MAX_PLAYLISTS_PER_USER = Math.max(1, Number.parseInt(process.env.MUSIC_PLAYLIST_MAX_PER_USER || '25', 10));

function slugify(name) {
    return (name || '')
        .toString()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 40);
}

function buildKey(guildId, ownerId, slug) {
    return `${KEY_PREFIX}_${guildId}_${ownerId}_${slug}`;
}

function sanitizeTrack(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const url = (raw.url || raw.sourceUrl || '').toString().trim();
    if (!url) return null;
    return {
        title: (raw.title || 'Sin titulo').toString().slice(0, 200),
        artist: (raw.artist || raw.author || '').toString().slice(0, 200),
        url,
        durationMs: Number.isFinite(raw.durationMs) ? Number(raw.durationMs) : 0,
        thumbnail: raw.thumbnail ? raw.thumbnail.toString().slice(0, 500) : null
    };
}

async function savePlaylist({ guildId, ownerId, name, tracks, overwrite = false }) {
    if (!guildId) throw new Error('guildId requerido');
    if (!ownerId) throw new Error('ownerId requerido');
    if (!name || typeof name !== 'string') throw new Error('Nombre de playlist inválido.');
    const slug = slugify(name);
    if (!slug) throw new Error('El nombre de la playlist debe contener letras o números.');

    const cleanTracks = (Array.isArray(tracks) ? tracks : [])
        .map(sanitizeTrack)
        .filter(Boolean)
        .slice(0, MAX_TRACKS_PER_PLAYLIST);

    if (!cleanTracks.length) {
        throw new Error('No hay canciones válidas para guardar.');
    }

    const key = buildKey(guildId, ownerId, slug);
    const existing = await db.get(key);
    if (existing && !overwrite) {
        const err = new Error(`Ya existe una playlist llamada "${name}". Usa "sobrescribir: Sí" para reemplazarla.`);
        err.code = 'PLAYLIST_EXISTS';
        throw err;
    }

    if (!existing) {
        const list = await listPlaylistsForUser(guildId, ownerId);
        if (list.length >= MAX_PLAYLISTS_PER_USER) {
            throw new Error(`Alcanzaste el máximo de ${MAX_PLAYLISTS_PER_USER} playlists guardadas. Elimina alguna primero.`);
        }
    }

    const record = {
        guildId,
        ownerId,
        slug,
        name: name.trim().slice(0, 60),
        tracks: cleanTracks,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await db.set(key, record);
    return record;
}

async function getPlaylist(guildId, ownerId, name) {
    const slug = slugify(name);
    if (!slug) return null;
    const primary = await db.get(buildKey(guildId, ownerId, slug));
    return primary || null;
}

async function getPlaylistInGuild(guildId, name) {
    const slug = slugify(name);
    if (!slug) return null;
    try {
        const rows = await db.query(
            'SELECT `key`, `value` FROM key_value_store WHERE `key` LIKE ? LIMIT 25',
            [`${KEY_PREFIX}_${guildId}_%_${slug}`]
        );
        if (!Array.isArray(rows) || !rows.length) return null;
        for (const row of rows) {
            try {
                const parsed = JSON.parse(row.value);
                if (parsed?.slug === slug) return parsed;
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
    return null;
}

async function deletePlaylist(guildId, ownerId, name) {
    const slug = slugify(name);
    if (!slug) return false;
    const key = buildKey(guildId, ownerId, slug);
    const existed = await db.has(key);
    if (!existed) return false;
    await db.delete(key);
    return true;
}

async function listPlaylistsForUser(guildId, ownerId) {
    try {
        const rows = await db.query(
            'SELECT `key`, `value` FROM key_value_store WHERE `key` LIKE ? LIMIT 50',
            [`${KEY_PREFIX}_${guildId}_${ownerId}_%`]
        );
        if (!Array.isArray(rows)) return [];
        const items = [];
        for (const row of rows) {
            try {
                const parsed = JSON.parse(row.value);
                if (parsed?.slug) items.push(parsed);
            } catch { /* ignore */ }
        }
        items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        return items;
    } catch {
        return [];
    }
}

async function listPlaylistsForGuild(guildId) {
    try {
        const rows = await db.query(
            'SELECT `key`, `value` FROM key_value_store WHERE `key` LIKE ? LIMIT 200',
            [`${KEY_PREFIX}_${guildId}_%`]
        );
        if (!Array.isArray(rows)) return [];
        const items = [];
        for (const row of rows) {
            try {
                const parsed = JSON.parse(row.value);
                if (parsed?.slug) items.push(parsed);
            } catch { /* ignore */ }
        }
        items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
        return items;
    } catch {
        return [];
    }
}

module.exports = {
    slugify,
    savePlaylist,
    getPlaylist,
    getPlaylistInGuild,
    deletePlaylist,
    listPlaylistsForUser,
    listPlaylistsForGuild,
    MAX_TRACKS_PER_PLAYLIST,
    MAX_PLAYLISTS_PER_USER
};
