const fs = require('fs');
const path = require('path');

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

/**
 * Para persistir en JSON/MySQL: si la imagen es de nuestra carpeta uploads, guardar solo `/uploads/...`
 * (el bot la adjunta desde disco). URLs externas HTTPS se guardan tal cual.
 */
function canonicalWelcomeMediaUrl(raw) {
    const p = extractUploadPath(raw);
    if (p) return p.slice(0, 1000);
    return String(raw || '').trim().slice(0, 1000);
}

/**
 * Resuelve archivo local para adjuntar al embed. Varios candidatos por cwd / despliegue.
 */
function resolveWelcomeUploadFile(rawUrl = '') {
    const uploadPath = extractUploadPath(rawUrl);
    if (!uploadPath) return null;

    const cleaned = uploadPath.replace(/^\/+/, '');

    const candidates = [
        path.join(__dirname, '..', '..', 'web', 'public', cleaned),
        path.join(process.cwd(), 'web', 'public', cleaned),
        path.join(process.cwd(), 'public', cleaned)
    ];

    for (const absolute of candidates) {
        if (fs.existsSync(absolute)) return absolute;
    }

    return null;
}

module.exports = {
    extractUploadPath,
    canonicalWelcomeMediaUrl,
    resolveWelcomeUploadFile
};
