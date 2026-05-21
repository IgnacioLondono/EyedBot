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

module.exports = {
    extractUploadPath,
    getWelcomePublicOrigin,
    canonicalWelcomeMediaUrl,
    resolveWelcomeUploadFile,
    resolveWelcomeMediaForDiscord,
    applyWelcomeMediaToEmbed
};
