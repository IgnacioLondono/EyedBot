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
 * Resuelve archivo local para adjuntar al embed.
 * El panel sirve estáticos desde `web/uploads` (no `web/public/uploads`).
 */
function resolveWelcomeUploadFile(rawUrl = '') {
    const uploadPath = extractUploadPath(rawUrl);
    if (!uploadPath) return null;

    const cleaned = uploadPath.replace(/^\/+/, '');
    const fileName = path.basename(cleaned);
    const projectRoot = path.join(__dirname, '..', '..');
    const cwd = process.cwd();

    const candidates = [
        // Ruta real del panel (express.static web/uploads)
        path.join(projectRoot, 'web', cleaned),
        path.join(cwd, 'web', cleaned),
        path.join(projectRoot, cleaned),
        path.join(cwd, cleaned),
        // Compat layouts antiguos
        path.join(projectRoot, 'web', 'public', cleaned),
        path.join(cwd, 'web', 'public', cleaned),
        path.join(projectRoot, 'web', 'public', 'uploads', 'welcome', fileName),
        path.join(projectRoot, 'web', 'public', 'uploads', 'verify', fileName),
        path.join(projectRoot, 'web', 'uploads', 'welcome', fileName),
        path.join(projectRoot, 'web', 'uploads', 'verify', fileName),
        path.join(cwd, 'uploads', 'welcome', fileName),
        path.join(cwd, 'web', 'uploads', 'welcome', fileName)
    ];

    for (const absolute of candidates) {
        try {
            if (fs.existsSync(absolute)) return absolute;
        } catch {
            // noop
        }
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
    const lookupGuildId = (guild && parsed && parsed.guildId === guild.id)
        ? guild.id
        : (parsed?.guildId || guild?.id || '');
    if (lookupGuildId) {
        const imageSlot = slotForMediaKind(slot, parsed?.slot, raw);
        const blob = await greetingImageStore.getImage(lookupGuildId, imageSlot);
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

    // Rutas /api/... no son alcanzables por Discord (requieren sesión).
    // Si llegamos acá sin buffer, no devolver la URL relativa/API.
    if (/^https?:\/\//i.test(raw) && !/\/api\/guild\/[^/]+\/greeting-image\//i.test(raw)) {
        try {
            const host = new URL(raw).hostname;
            if (!isLocalNetworkHostname(host)) {
                return { mode: 'url', url: raw };
            }
        } catch {
            return { mode: 'url', url: raw };
        }
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
 * Nunca depende de fetch HTTP a /api/... (requiere sesión y falla dentro del contenedor).
 */
async function resolveWelcomeCardBackground(imageUrl, guildId) {
    const raw = String(imageUrl || '').trim();
    if (!raw) return {};

    const localPath = resolveWelcomeUploadFile(raw);
    if (localPath) {
        return { backgroundFilePath: localPath, backgroundUrl: null, backgroundBuffer: null };
    }

    const parsed = greetingImageStore.parseGreetingImageApiUrl(raw);
    const routeGid = greetingImageStore.rawDiscordGuildId(guildId);
    const imageGid = parsed?.guildId || routeGid;

    if (imageGid && (parsed || /greeting-image|greeting-db:/i.test(raw))) {
        const slot = greetingImageSlotForCardBackground(parsed || { slot: 'welcome' });
        const blob = await greetingImageStore.getImage(imageGid, slot);
        if (blob?.data?.length) {
            return { backgroundFilePath: null, backgroundUrl: null, backgroundBuffer: blob.data };
        }

        // Fallback disco: {guildId}_{slot}_*
        try {
            const uploadsDir = path.join(__dirname, '..', '..', 'web', 'uploads', 'welcome');
            if (fs.existsSync(uploadsDir)) {
                const prefixes = [
                    `${imageGid}_${slot}_`,
                    routeGid && routeGid !== imageGid ? `${routeGid}_${slot}_` : null
                ].filter(Boolean);
                const names = fs.readdirSync(uploadsDir);
                for (const prefix of prefixes) {
                    const match = names
                        .filter((name) => name.startsWith(prefix))
                        .sort()
                        .reverse()[0];
                    if (match) {
                        return {
                            backgroundFilePath: path.join(uploadsDir, match),
                            backgroundUrl: null,
                            backgroundBuffer: null
                        };
                    }
                }
            }
        } catch {
            // ignore
        }
    }

    // Solo URLs http(s) públicas (no /api autenticado).
    if (/^https?:\/\//i.test(raw) && !/\/api\/guild\//i.test(raw)) {
        return { backgroundFilePath: null, backgroundUrl: raw, backgroundBuffer: null };
    }

    // Último recurso: slot welcome del guild aunque la URL no parsee limpia.
    if (routeGid) {
        const blob = await greetingImageStore.getImage(routeGid, 'welcome');
        if (blob?.data?.length) {
            return { backgroundFilePath: null, backgroundUrl: null, backgroundBuffer: blob.data };
        }
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
