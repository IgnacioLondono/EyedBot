const fs = require('fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const W = 920;
const H = 520;

function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) {
        return {
            r: Number.parseInt(h[0] + h[0], 16),
            g: Number.parseInt(h[1] + h[1], 16),
            b: Number.parseInt(h[2] + h[2], 16)
        };
    }
    if (h.length !== 6 || Number.isNaN(Number.parseInt(h, 16))) {
        return { r: 255, g: 255, b: 255 };
    }
    const n = Number.parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbFill(hex) {
    const { r, g, b } = hexToRgb(hex);
    return `rgb(${r},${g},${b})`;
}

function roundRectPath(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
}

async function drawBackground(ctx, backgroundUrl, backgroundFilePath) {
    let img = null;
    try {
        if (backgroundFilePath && fs.existsSync(backgroundFilePath)) {
            img = await loadImage(backgroundFilePath);
        } else if (backgroundUrl && String(backgroundUrl).trim()) {
            img = await loadImage(String(backgroundUrl).trim());
        }
    } catch {
        img = null;
    }

    if (!img) {
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, '#38bdf8');
        g.addColorStop(0.45, '#a78bfa');
        g.addColorStop(1, '#34d399');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        return;
    }

    const scale = Math.max(W / img.width, H / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const ox = (W - dw) / 2;
    const oy = (H - dh) / 2;
    ctx.drawImage(img, ox, oy, dw, dh);
}

/**
 * Genera un PNG de tarjeta de bienvenida (fondo + avatar circular + textos).
 * @param {object} opts
 * @param {string} opts.avatarUrl
 * @param {string} [opts.backgroundUrl]
 * @param {string|null} [opts.backgroundFilePath]
 * @param {string} opts.headline
 * @param {string} opts.displayName
 * @param {string} [opts.subtitle]
 * @param {string} [opts.accentHex] sin #
 * @param {string} [opts.titleHex]
 * @param {string} [opts.nameHex]
 * @param {string} [opts.subtitleHex]
 * @returns {Promise<Buffer>}
 */
async function renderWelcomeCardPng(opts = {}) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    const accent = (opts.accentHex || '4ade80').replace('#', '');
    const titleColor = (opts.titleHex || 'ffffff').replace('#', '');
    const nameColor = (opts.nameHex || 'f8fafc').replace('#', '');
    const subColor = (opts.subtitleHex || 'e2e8f0').replace('#', '');

    ctx.save();
    roundRectPath(ctx, 0, 0, W, H, 24);
    ctx.clip();

    await drawBackground(ctx, opts.backgroundUrl, opts.backgroundFilePath);

    const vignette = ctx.createLinearGradient(0, H * 0.35, 0, H);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();

    const cx = W / 2;
    const cy = 168;
    const radius = 78;

    let avatarImg = null;
    try {
        if (opts.avatarUrl) avatarImg = await loadImage(String(opts.avatarUrl));
    } catch {
        avatarImg = null;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
    ctx.fillStyle = rgbFill(accent);
    ctx.fill();

    if (avatarImg) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const ar = avatarImg.width / avatarImg.height;
        let sw = avatarImg.width;
        let sh = avatarImg.height;
        if (ar > 1) {
            sw = avatarImg.height;
            sh = avatarImg.height;
        } else {
            sw = avatarImg.width;
            sh = avatarImg.width;
        }
        const sx = (avatarImg.width - sw) / 2;
        const sy = (avatarImg.height - sh) / 2;
        ctx.drawImage(avatarImg, sx, sy, sw, sh, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
        ctx.fillStyle = '#334155';
        ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = rgbFill(accent);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const headline = String(opts.headline || 'Bienvenido').slice(0, 80);
    const displayName = String(opts.displayName || 'Usuario').slice(0, 64);
    const subtitle = String(opts.subtitle || '').slice(0, 120);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;

    ctx.font = 'bold 46px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = rgbFill(titleColor);
    ctx.fillText(headline, cx, 268);

    ctx.font = '28px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
    ctx.fillStyle = rgbFill(nameColor);
    ctx.fillText(displayName, cx, 328);

    if (subtitle.trim()) {
        ctx.font = 'italic 22px "Segoe UI", "Helvetica Neue", Arial, sans-serif';
        ctx.fillStyle = rgbFill(subColor);
        const lines = wrapText(ctx, subtitle, W - 120);
        let y = 378;
        for (const line of lines.slice(0, 3)) {
            ctx.fillText(line, cx, y);
            y += 28;
        }
    }

    ctx.shadowColor = 'transparent';

    return canvas.toBuffer('image/png');
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = w;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

module.exports = {
    renderWelcomeCardPng,
    WELCOME_CARD_WIDTH: W,
    WELCOME_CARD_HEIGHT: H
};
