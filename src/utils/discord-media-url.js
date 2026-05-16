/**
 * Discord recupera thumbnails/imágenes de embed desde sus servidores;
 * localhost y redes privadas no son alcanzables desde Discord.
 */
const fs = require('fs/promises');
const path = require('path');

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

function webPublicRoots() {
    const fromEnv = String(process.env.EYEDBOT_WEB_PUBLIC_DIRS || '').split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (fromEnv.length) return [...new Set(fromEnv.map((d) => path.resolve(d)))];
    return [
        path.resolve(__dirname, '..', '..', 'web', 'public'),
        path.resolve(process.cwd(), 'web', 'public')
    ];
}

function extFromContentType(ct = '') {
    const m = String(ct).split(';')[0].trim().toLowerCase();
    if (m === 'image/png') return 'png';
    if (m === 'image/webp') return 'webp';
    if (m === 'image/gif') return 'gif';
    if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
    return null;
}

function extFromPathname(filePathOrUrlPath = '') {
    const base = path.basename(String(filePathOrUrlPath).split('?')[0]);
    const m = base.toLowerCase().match(/\.(png|jpe?g|gif|webp)$/);
    if (!m) return null;
    return m[1] === 'jpeg' ? 'jpg' : m[1];
}

/** @returns {string} png|jpg|gif|webp o cadena vacía */
function inferImageKindFromMagic(buf) {
    if (!buf?.length || buf.length < 12) return '';
    const b = buf;

    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (b.length >= 8 && b.subarray(0, 8).equals(pngSig)) return 'png';

    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';

    const g6 = b.subarray(0, 6).toString('ascii');
    if (g6 === 'GIF87a' || g6 === 'GIF89a') return 'gif';

    if (b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';

    return '';
}

/**
 * Rutas tipo /uploads/... servidas desde web/public/uploads/...
 * @returns {Promise<FetchedDiscordImageParts | null>}
 */
async function readLocalUploadFileForDiscordAttachment(imageUrl, safeBase) {
    let pathname = '';
    try {
        pathname = new URL(String(imageUrl).trim()).pathname;
    } catch {
        return null;
    }
    const segments = pathname.split('?')[0].split(/[/\\]+/).filter(Boolean);
    if (segments.length < 2 || segments[0] !== 'uploads') return null;
    if (segments.some((seg) => seg === '..' || seg === '.')) return null;

    const pathnameExt = extFromPathname(pathname);
    const roots = webPublicRoots();
    for (const root of roots) {
        try {
            const abs = path.resolve(root, ...segments);
            const rel = path.relative(path.resolve(root), abs);
            if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;

            let st = null;
            try {
                st = await fs.stat(abs);
            } catch {
                continue;
            }
            if (!st.isFile() || st.size > MAX_EMBED_IMAGE_BYTES) continue;

            const buf = Buffer.from(await fs.readFile(abs));
            if (!buf.length || buf.length > MAX_EMBED_IMAGE_BYTES) continue;

            const magic = inferImageKindFromMagic(buf);
            const ext = magic || pathnameExt || 'png';
            const name = `${safeBase}.${ext}`;
            return { name, data: buf };
        } catch {
            continue;
        }
    }

    return null;
}

/**
 * Imagen para embed vía attachment:// (prioriza archivo en web/public del proyecto).
 * @param {string} imageUrl
 * @param {string} fileBase nombre base sin extensión (solo [a-zA-Z0-9_-])
 * @returns {Promise<FetchedDiscordImageParts | null>}
 */
async function fetchImageBufferForDiscordAttachment(imageUrl, fileBase) {
    const url = String(imageUrl || '').trim();
    if (!/^https?:\/\/.+/i.test(url)) return null;

    let pathname = '';
    try {
        pathname = new URL(url).pathname;
    } catch {
        return null;
    }

    const safeBase = String(fileBase || 'img').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || 'img';

    if (/\/uploads\//i.test(pathname)) {
        const fromDisk = await readLocalUploadFileForDiscordAttachment(url, safeBase);
        if (fromDisk) return fromDisk;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            redirect: 'follow',
            headers: { 'User-Agent': 'EyedBot/1.0 (Discord shop image)' }
        });
        if (!res.ok) return null;

        const declared = Number(res.headers.get('content-length') || '0');
        if (declared > MAX_EMBED_IMAGE_BYTES) return null;

        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_EMBED_IMAGE_BYTES) return null;

        const ctHeader = String(res.headers.get('content-type') || '');
        const mimeMain = ctHeader.split(';')[0].trim().toLowerCase();
        const pathnameExt = extFromPathname(pathname);

        const magicExt = inferImageKindFromMagic(buf);
        if (magicExt) {
            return { name: `${safeBase}.${magicExt}`, data: buf };
        }

        if (/^image\//.test(mimeMain)) {
            const ext = extFromContentType(ctHeader) || pathnameExt || 'jpg';
            return { name: `${safeBase}.${ext}`, data: buf };
        }

        return null;
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
