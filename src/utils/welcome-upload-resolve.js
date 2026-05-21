const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

/**
 * Devuelve la ruta public bajo /uploads/... si la cadena es una URL absoluta o ya es pathname.
 */
function extractUploadPath(rawUrl = '') {
    const raw = String(rawUrl || '').trim();
    if (!raw) return '';

    if (raw.startsWith('/uploads/')) return raw.split('?')[0];

    try {
        const parsed = new URL(raw);
        const pn = String(parsed.pathname || '');
        if (pn.startsWith('/uploads/')) return pn.split('?')[0];
    } catch {
        // no es URL absoluta
    }

    return '';
}

function getWelcomePublicOrigin() {
    return String(process.env.WEB_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
}

/**
 * Para persistir en JSON/MySQL: `/uploads/...` local, https externas. Ignora blob/data.
 */
function canonicalWelcomeMediaUrl(raw) {
    const rawStr = String(raw || '').trim();
    if (!rawStr || /^(blob:|data:)/i.test(rawStr)) return '';

    const uploadPath = extractUploadPath(rawStr);
    if (uploadPath) return uploadPath.slice(0, 1000);

    if (/^https?:\/\//i.test(rawStr)) return rawStr.slice(0, 1000);

    return '';
}

/**
 * Resuelve archivo local para adjuntar al embed. Varios candidatos por cwd / despliegue.
 */
function resolveWelcomeUploadFile(rawUrl = '') {
    const uploadPath = extractUploadPath(rawUrl);
    if (!uploadPath) return null;

    const cleaned = uploadPath.replace(/^\/+/, '');
    const fileName = path.basename(cleaned);

    const candidates = [
        path.join(__dirname, '..', '..', 'web', 'public', cleaned),
        path.join(__dirname, '..', '..', 'web', 'public', 'uploads', 'welcome', fileName),
        path.join(__dirname, '..', '..', 'web', 'public', 'uploads', 'verify', fileName),
        path.join(process.cwd(), 'web', 'public', cleaned),
        path.join(process.cwd(), 'web', 'public', 'uploads', 'welcome', fileName),
        path.join(process.cwd(), 'public', cleaned),
        path.join(process.cwd(), 'uploads', 'welcome', fileName)
    ];

    for (const absolute of candidates) {
        if (fs.existsSync(absolute)) return absolute;
    }

    return null;
}

/**
 * Decide cómo enviar la imagen a Discord: adjunto local o URL pública.
 */
function resolveWelcomeMediaForDiscord(rawUrl = '', options = {}) {
    const slot = options.slot === 'thumbnail' ? 'thumbnail' : 'image';
    const localPath = resolveWelcomeUploadFile(rawUrl);
    if (localPath) {
        const base = path.basename(localPath);
        const attachmentName = slot === 'thumbnail' ? `thumb_${base}` : base;
        return { mode: 'attachment', localPath, attachmentName };
    }

    const uploadPath = extractUploadPath(rawUrl);
    const origin = getWelcomePublicOrigin();
    if (uploadPath && origin) {
        return { mode: 'url', url: `${origin}${uploadPath}` };
    }

    const trimmed = String(rawUrl || '').trim();
    if (/^https?:\/\//i.test(trimmed)) {
        return { mode: 'url', url: trimmed };
    }

    return null;
}

/**
 * Aplica imagen o miniatura al embed y añade adjuntos si hace falta.
 */
function applyWelcomeMediaToEmbed(embed, rawUrl, files, slot = 'image') {
    const resolved = resolveWelcomeMediaForDiscord(rawUrl, { slot });
    if (!resolved || !embed) return false;

    if (resolved.mode === 'attachment') {
        if (slot === 'thumbnail') {
            embed.setThumbnail(`attachment://${resolved.attachmentName}`);
        } else {
            embed.setImage(`attachment://${resolved.attachmentName}`);
        }
        files.push(new AttachmentBuilder(resolved.localPath).setName(resolved.attachmentName));
        return true;
    }

    if (slot === 'thumbnail') {
        embed.setThumbnail(resolved.url);
    } else {
        embed.setImage(resolved.url);
    }
    return true;
}

module.exports = {
    extractUploadPath,
    getWelcomePublicOrigin,
    canonicalWelcomeMediaUrl,
    resolveWelcomeUploadFile,
    resolveWelcomeMediaForDiscord,
    applyWelcomeMediaToEmbed
};
