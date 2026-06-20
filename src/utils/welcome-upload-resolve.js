const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const greetingImageStore = require('./greeting-image-store');

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

function isLocalNetworkHostname(hostname = '') {
    const h = String(hostname || '').toLowerCase();
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true;
    if (h.endsWith('.local') || h.endsWith('.localhost')) return true;
    if (/^10\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
    if (/^169\.254\./.test(h)) return true;
    return false;
}

/**
 * URL segura para el panel: rutas relativas /uploads o /api, o HTTPS públicas.
 * Convierte URLs absolutas de red local (192.168.x, localhost…) a pathname relativo.
 */
function canonicalPanelMediaUrl(raw) {
    const rawStr = String(raw || '').trim();
    if (!rawStr || /^(blob:|data:)/i.test(rawStr)) return '';

    if (greetingImageStore.parseGreetingImageApiUrl(rawStr)) {
        return rawStr.split('?')[0].slice(0, 1000);
    }

    const uploadPath = extractUploadPath(rawStr);
    if (uploadPath) return uploadPath.slice(0, 1000);

    if (/^https?:\/\//i.test(rawStr)) {
        try {
            const parsed = new URL(rawStr);
            if (isLocalNetworkHostname(parsed.hostname)) {
                const localUpload = extractUploadPath(parsed.href);
                if (localUpload) return localUpload.slice(0, 1000);
                const apiPath = String(parsed.pathname || '').split('?')[0];
                if (apiPath.startsWith('/api/')) return apiPath.slice(0, 1000);
                return '';
            }
            return rawStr.slice(0, 1000);
        } catch {
            return '';
        }
    }

    if (rawStr.startsWith('/')) return rawStr.split('?')[0].slice(0, 1000);

    return '';
}

/**
 * Para persistir en JSON/MySQL: ruta API de imagen en BD, `/uploads/...`, o https externas.
 */
function canonicalWelcomeMediaUrl(raw) {
    const rawStr = String(raw || '').trim();
    if (!rawStr || /^(blob:|data:)/i.test(rawStr)) return '';

    if (greetingImageStore.parseGreetingImageApiUrl(rawStr)) {
        return rawStr.split('?')[0].slice(0, 1000);
    }

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

function slotForMediaKind(slot = 'image', parsedSlot = null, rawUrl = '') {
    if (parsedSlot) return parsedSlot;
    const raw = String(rawUrl || '');
    const isGoodbye = /\/greeting-image\/goodbye/i.test(raw) || /greeting-db:[^:]+:goodbye/i.test(raw);
    if (slot === 'thumbnail') return isGoodbye ? 'goodbye_thumb' : 'welcome_thumb';
    return isGoodbye ? 'goodbye' : 'welcome';
}

/**
 * Decide cómo enviar la imagen a Discord (adjunto local, buffer en MySQL o URL pública).
 */
async function resolveWelcomeMediaForDiscord(rawUrl = '', options = {}) {
    const slot = options.slot === 'thumbnail' ? 'thumbnail' : 'image';
    const guild = options.guild || null;
    const raw = String(rawUrl || '').trim();
    if (!raw) return null;

    const parsed = greetingImageStore.parseGreetingImageApiUrl(raw);
    if (guild && parsed && parsed.guildId === guild.id) {
        const imageSlot = slotForMediaKind(slot, parsed.slot, raw);
        const blob = await greetingImageStore.getImage(guild.id, imageSlot);
        if (blob?.data?.length) {
            const attachmentName = slot === 'thumbnail'
                ? `thumb_greeting.${blob.ext}`
                : `greeting.${blob.ext}`;
            return { mode: 'buffer', buffer: blob.data, attachmentName, mime: blob.mime };
        }
    }

    const localPath = resolveWelcomeUploadFile(raw);
    if (localPath) {
        const base = path.basename(localPath);
        const attachmentName = slot === 'thumbnail' ? `thumb_${base}` : base;
        return { mode: 'attachment', localPath, attachmentName };
    }

    const uploadPath = extractUploadPath(raw);
    const origin = getWelcomePublicOrigin();
    if (uploadPath && origin) {
        return { mode: 'url', url: `${origin}${uploadPath}` };
    }

    if (/^https?:\/\//i.test(raw)) {
        return { mode: 'url', url: raw };
    }

    return null;
}

/**
 * Aplica imagen o miniatura al embed y añade adjuntos si hace falta.
 */
async function applyWelcomeMediaToEmbed(embed, rawUrl, files, guildOrSlot = 'image', maybeSlot = 'image') {
    let guild = null;
    let slot = 'image';
    if (typeof guildOrSlot === 'object' && guildOrSlot !== null) {
        guild = guildOrSlot;
        slot = maybeSlot === 'thumbnail' ? 'thumbnail' : 'image';
    } else {
        slot = guildOrSlot === 'thumbnail' ? 'thumbnail' : 'image';
    }

    const resolved = await resolveWelcomeMediaForDiscord(rawUrl, { guild, slot });
    if (!resolved || !embed) return false;

    if (resolved.mode === 'buffer') {
        const attachName = resolved.attachmentName;
        if (slot === 'thumbnail') {
            embed.setThumbnail(`attachment://${attachName}`);
        } else {
            embed.setImage(`attachment://${attachName}`);
        }
        files.push(new AttachmentBuilder(resolved.buffer, { name: attachName }));
        return true;
    }

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

function greetingImageSlotForCardBackground(parsed) {
    if (!parsed?.slot) return 'welcome';
    if (parsed.slot === 'goodbye' || parsed.slot === 'goodbye_thumb') return 'goodbye';
    return 'welcome';
}

/**
 * Resuelve fondo de tarjeta PNG: archivo local, buffer MySQL o URL pública.
 */
async function resolveWelcomeCardBackground(imageUrl, guildId) {
    const raw = String(imageUrl || '').trim();
    if (!raw) return {};

    const localPath = resolveWelcomeUploadFile(raw);
    if (localPath) {
        return { backgroundFilePath: localPath, backgroundUrl: null, backgroundBuffer: null };
    }

    const gid = String(guildId || '').trim();
    const parsed = greetingImageStore.parseGreetingImageApiUrl(raw);
    if (gid && parsed && parsed.guildId === gid) {
        const slot = greetingImageSlotForCardBackground(parsed);
        const blob = await greetingImageStore.getImage(gid, slot);
        if (blob?.data?.length) {
            return { backgroundFilePath: null, backgroundUrl: null, backgroundBuffer: blob.data };
        }
    }

    const origin = getWelcomePublicOrigin();
    const pathOnly = raw.split('?')[0];
    if (parsed && origin && pathOnly.startsWith('/api/')) {
        return { backgroundFilePath: null, backgroundUrl: `${origin}${pathOnly}`, backgroundBuffer: null };
    }

    if (/^https?:\/\//i.test(raw)) {
        return { backgroundFilePath: null, backgroundUrl: raw, backgroundBuffer: null };
    }

    return {};
}

module.exports = {
    extractUploadPath,
    getWelcomePublicOrigin,
    isLocalNetworkHostname,
    canonicalWelcomeMediaUrl,
    canonicalPanelMediaUrl,
    resolveWelcomeUploadFile,
    resolveWelcomeMediaForDiscord,
    applyWelcomeMediaToEmbed,
    resolveWelcomeCardBackground
};
