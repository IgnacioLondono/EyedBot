/**
 * Discord recupera thumbnails/imágenes de embed desde sus servidores;
 * localhost y redes privadas no son accesibles desde Discord.
 */
function isUrlLikelyUnreachableFromDiscord(absoluteUrl = '') {
    try {
        const u = new URL(String(absoluteUrl).trim());
        const host = u.hostname.toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') return true;
        if (host.endsWith('.local') || host.endsWith('.localhost')) return true;
        const parts = host.split('.');
        if (parts.length === 4 && parts.every((x) => /^\d{1,3}$/.test(x))) {
            const a = Number(parts[0]);
            const b = Number(parts[1]);
            if (a === 10) return true;
            if (a === 172 && b >= 16 && b <= 31) return true;
            if (a === 192 && b === 168) return true;
            if (a === 169 && b === 254) return true;
        }
        return false;
    } catch {
        return false;
    }
}

/** @typedef {{ name: string, data: Buffer }} FetchedDiscordImageParts */

const MAX_EMBED_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

function extFromContentType(ct = '') {
    const m = String(ct).split(';')[0].trim().toLowerCase();
    if (m === 'image/png') return 'png';
    if (m === 'image/webp') return 'webp';
    if (m === 'image/gif') return 'gif';
    if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
    return null;
}

function extFromPathname(pathname = '') {
    const m = String(pathname).toLowerCase().match(/\.(png|jpe?g|gif|webp)(\?|$)/);
    if (!m) return null;
    return m[1] === 'jpeg' ? 'jpg' : m[1];
}

/**
 * Descarga una imagen HTTP(S) para usarla en embed vía attachment://name
 * (útil cuando la URL no es alcanzable desde Discord, p. ej. localhost).
 * @param {string} imageUrl
 * @param {string} fileBase nombre base sin extensión (solo [a-zA-Z0-9_-])
 * @returns {Promise<FetchedDiscordImageParts | null>}
 */
async function fetchImageBufferForDiscordAttachment(imageUrl, fileBase) {
    const url = String(imageUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) return null;

    const safeBase = String(fileBase || 'img').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'img';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'EyedBot/1.0 (Discord shop image)' }
        });
        if (!res.ok) return null;

        const ct = res.headers.get('content-type') || '';
        if (!/^image\//i.test(ct.split(';')[0].trim())) return null;

        const len = Number(res.headers.get('content-length') || '0');
        if (len > MAX_EMBED_IMAGE_BYTES) return null;

        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_EMBED_IMAGE_BYTES) return null;

        let ext = extFromContentType(ct) || extFromPathname(new URL(url).pathname) || 'jpg';
        const name = `${safeBase}.${ext}`;
        return { name, data: buf };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

module.exports = {
    isUrlLikelyUnreachableFromDiscord,
    fetchImageBufferForDiscordAttachment
};
