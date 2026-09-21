const db = require('./database');
const { scopeKey, parseScopedGuildKey } = require('./config-scope');

const MAX_GREETING_IMAGE_BYTES = 8 * 1024 * 1024;
const GUILD_ID_DB_MAX = 64;
const VALID_SLOTS = new Set(['welcome', 'goodbye', 'welcome_thumb', 'goodbye_thumb']);

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS greeting_embed_image (
    guild_id VARCHAR(64) NOT NULL,
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

/** Snowflake de Discord sin prefijo de bot (para URLs del panel). */
function rawDiscordGuildId(guildId = '') {
    const parsed = parseScopedGuildKey(guildId);
    const gid = String(parsed.guildId || guildId || '').trim();
    return /^\d{17,20}$/.test(gid) ? gid : String(guildId || '').trim();
}

function storageKeyCandidates(guildId = '') {
    const scoped = String(scopeKey(guildId) || '').trim();
    const plain = rawDiscordGuildId(guildId);
    return [...new Set([
        scoped.slice(0, GUILD_ID_DB_MAX),
        scoped.slice(0, 32), // legacy VARCHAR(32) truncate
        plain.slice(0, GUILD_ID_DB_MAX),
        plain.slice(0, 32)
    ].filter(Boolean))];
}

/**
 * Ruta pública del panel. Siempre usa el snowflake crudo para que
 * Express + sesión + <img src> funcionen (sin botId: en el path).
 */
function buildApiPath(guildId, slot = 'welcome') {
    const gid = rawDiscordGuildId(guildId);
    const s = normalizeSlot(slot);
    return `/api/guild/${gid}/greeting-image/${s}`;
}

function parseGreetingImageApiUrl(rawUrl = '') {
    const raw = String(rawUrl || '').trim();
    if (!raw) return null;

    const scoped = raw.match(
        /\/api\/guild\/([a-f0-9]{8,32}):(\d{17,20})\/greeting-image\/(welcome|goodbye|welcome_thumb|goodbye_thumb)/i
    );
    if (scoped) {
        return { guildId: scoped[2], slot: normalizeSlot(scoped[3]), botId: scoped[1] };
    }

    const apiMatch = raw.match(
        /\/api\/guild\/(\d{17,20})\/greeting-image\/(welcome|goodbye|welcome_thumb|goodbye_thumb)/i
    );
    if (apiMatch) {
        return { guildId: apiMatch[1], slot: normalizeSlot(apiMatch[2]) };
    }

    const dbMatch = raw.match(
        /^greeting-db:(?:([a-f0-9]{8,32}):)?(\d{17,20}):(welcome|goodbye|welcome_thumb|goodbye_thumb)$/i
    );
    if (dbMatch) {
        return { guildId: dbMatch[2], slot: normalizeSlot(dbMatch[3]), botId: dbMatch[1] || undefined };
    }

    return null;
}

async function ensureSchema() {
    if (schemaReady) return true;
    try {
        await db.query(SCHEMA_SQL);
        try {
            await db.query('ALTER TABLE greeting_embed_image MODIFY guild_id VARCHAR(64) NOT NULL');
        } catch {
            // columna ya ampliada o sin permisos ALTER
        }
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
    const gid = String(scopeKey(guildId) || '').trim().slice(0, GUILD_ID_DB_MAX);
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
    const s = normalizeSlot(slot);
    const candidates = storageKeyCandidates(guildId);
    if (!candidates.length) return null;

    await ensureSchema();
    try {
        for (const gid of candidates) {
            const rows = await db.query(
                'SELECT mime_type AS mime, image AS data FROM greeting_embed_image WHERE guild_id = ? AND slot = ? LIMIT 1',
                [gid, s]
            );
            const row = rows?.[0];
            const data = bufferFromDbImageField(row?.data);
            if (!data?.length) continue;
            return { mime: sanitizeMime(row?.mime), data, ext: extFromMime(sanitizeMime(row?.mime)) };
        }
        return null;
    } catch (error) {
        console.warn(`⚠️ No se pudo leer imagen greeting (${s}) desde MySQL:`, error.message);
        return null;
    }
}

async function deleteImage(guildId, slot) {
    const s = normalizeSlot(slot);
    const candidates = storageKeyCandidates(guildId);
    if (!candidates.length) return false;
    await ensureSchema();
    let removed = false;
    try {
        for (const gid of candidates) {
            await db.query('DELETE FROM greeting_embed_image WHERE guild_id = ? AND slot = ?', [gid, s]);
            removed = true;
        }
        return removed;
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
    rawDiscordGuildId,
    setImage,
    getImage,
    deleteImage,
    hasImage,
    ensureSchema
};
