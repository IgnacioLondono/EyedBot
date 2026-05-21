const db = require('./database');

const MAX_GREETING_IMAGE_BYTES = 8 * 1024 * 1024;
const VALID_SLOTS = new Set(['welcome', 'goodbye', 'welcome_thumb', 'goodbye_thumb']);

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS greeting_embed_image (
    guild_id VARCHAR(32) NOT NULL,
    slot VARCHAR(32) NOT NULL,
    mime_type VARCHAR(80) NOT NULL,
    image LONGBLOB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, slot),
    INDEX idx_greeting_img_guild (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

let schemaReady = false;

function sanitizeMime(mimeType = '') {
    const m = String(mimeType || '').toLowerCase().split(';')[0].trim();
    if (['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'].includes(m)) {
        return m === 'image/jpg' ? 'image/jpeg' : m;
    }
    return 'image/jpeg';
}

function extFromMime(mime) {
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    if (mime === 'image/gif') return 'gif';
    return 'jpg';
}

function normalizeSlot(slot = 'welcome') {
    const s = String(slot || 'welcome').trim().toLowerCase();
    return VALID_SLOTS.has(s) ? s : 'welcome';
}

function buildApiPath(guildId, slot = 'welcome') {
    const gid = String(guildId || '').trim();
    const s = normalizeSlot(slot);
    return `/api/guild/${gid}/greeting-image/${s}`;
}

function parseGreetingImageApiUrl(rawUrl = '') {
    const raw = String(rawUrl || '').trim();
    if (!raw) return null;

    const apiMatch = raw.match(/\/api\/guild\/(\d{17,20})\/greeting-image\/(welcome|goodbye|welcome_thumb|goodbye_thumb)/i);
    if (apiMatch) {
        return { guildId: apiMatch[1], slot: normalizeSlot(apiMatch[2]) };
    }

    const dbMatch = raw.match(/^greeting-db:(\d{17,20}):(welcome|goodbye|welcome_thumb|goodbye_thumb)$/i);
    if (dbMatch) {
        return { guildId: dbMatch[1], slot: normalizeSlot(dbMatch[2]) };
    }

    return null;
}

async function ensureSchema() {
    if (schemaReady) return true;
    try {
        await db.query(SCHEMA_SQL);
        schemaReady = true;
        return true;
    } catch (error) {
        console.warn('⚠️ No se pudo crear tabla greeting_embed_image:', error.message);
        return false;
    }
}

function bufferFromDbImageField(raw) {
    if (!raw) return null;
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof Uint8Array) return Buffer.from(raw);
    if (Array.isArray(raw)) return Buffer.from(raw);
    if (typeof raw === 'object' && raw.type === 'Buffer' && Array.isArray(raw.data)) {
        return Buffer.from(raw.data);
    }
    try {
        return Buffer.from(raw);
    } catch {
        return null;
    }
}

async function setImage(guildId, slot, buffer, mimeType = 'image/jpeg') {
    const gid = String(guildId || '').trim().slice(0, 32);
    const s = normalizeSlot(slot);
    if (!gid || !Buffer.isBuffer(buffer) || buffer.length === 0) return false;
    if (buffer.length > MAX_GREETING_IMAGE_BYTES) return false;

    await ensureSchema();
    const mime = sanitizeMime(mimeType);
    try {
        await db.query(
            `INSERT INTO greeting_embed_image (guild_id, slot, mime_type, image)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE mime_type = VALUES(mime_type), image = VALUES(image)`,
            [gid, s, mime, buffer]
        );
        return true;
    } catch (error) {
        console.warn(`⚠️ No se pudo guardar imagen greeting (${s}) en MySQL:`, error.message);
        return false;
    }
}

async function getImage(guildId, slot) {
    const gid = String(guildId || '').trim().slice(0, 32);
    const s = normalizeSlot(slot);
    if (!gid) return null;

    await ensureSchema();
    try {
        const rows = await db.query(
            'SELECT mime_type AS mime, image AS data FROM greeting_embed_image WHERE guild_id = ? AND slot = ? LIMIT 1',
            [gid, s]
        );
        const row = rows?.[0];
        const data = bufferFromDbImageField(row?.data);
        if (!data?.length) return null;
        return { mime: sanitizeMime(row?.mime), data, ext: extFromMime(sanitizeMime(row?.mime)) };
    } catch (error) {
        console.warn(`⚠️ No se pudo leer imagen greeting (${s}) desde MySQL:`, error.message);
        return null;
    }
}

async function deleteImage(guildId, slot) {
    const gid = String(guildId || '').trim().slice(0, 32);
    const s = normalizeSlot(slot);
    if (!gid) return false;
    await ensureSchema();
    try {
        await db.query('DELETE FROM greeting_embed_image WHERE guild_id = ? AND slot = ?', [gid, s]);
        return true;
    } catch {
        return false;
    }
}

async function hasImage(guildId, slot) {
    const img = await getImage(guildId, slot);
    return !!(img?.data?.length);
}

module.exports = {
    VALID_SLOTS,
    MAX_GREETING_IMAGE_BYTES,
    buildApiPath,
    parseGreetingImageApiUrl,
    normalizeSlot,
    setImage,
    getImage,
    deleteImage,
    hasImage,
    ensureSchema
};
