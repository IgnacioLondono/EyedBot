const path = require('path');
const fs = require('fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const DEFAULT_BG_PATH = path.join(__dirname, '../assets/leveling-card-bg.png');
const NIVEL_W = 920;
const NIVEL_H = 520;
const TOP_W = 920;
const TOP_ROW_H = 54;
const TOP_HEADER_H = 88;
const TOP_PAD = 36;

const ACCENT = '#c084fc';
const ACCENT_SOFT = '#e9d5ff';
const TEXT_MAIN = '#ffffff';
const TEXT_MUTED = '#ddd6fe';
const BAR_BG = 'rgba(15, 5, 35, 0.55)';
const BAR_FILL_START = '#a855f7';
const BAR_FILL_END = '#ec4899';

const MEDAL_COLORS = ['#ffd700', '#c0c0c0', '#cd7f32'];

function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
}

function truncate(text, max = 22) {
    const s = String(text || '').trim();
    if (s.length <= max) return s;
    return `${s.slice(0, max - 1)}…`;
}

function resolveBackgroundPath(customPath) {
    if (customPath && fs.existsSync(customPath)) return customPath;
    if (fs.existsSync(DEFAULT_BG_PATH)) return DEFAULT_BG_PATH;
    return null;
}

async function loadBackgroundImage(customPath) {
    const filePath = resolveBackgroundPath(customPath);
    if (!filePath) return null;
    try {
        return await loadImage(filePath);
    } catch {
        return null;
    }
}

function drawFallbackGradient(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7c3aed');
    g.addColorStop(0.5, '#5b21b6');
    g.addColorStop(1, '#3b0764');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

function drawBackgroundCover(ctx, img, w, h) {
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const ox = (w - dw) / 2;
    const oy = (h - dh) / 2;
    ctx.drawImage(img, ox, oy, dw, dh);
}

function drawStrokedText(ctx, text, x, y, opts = {}) {
    const {
        fill = TEXT_MAIN,
        stroke = 'rgba(8, 0, 24, 0.82)',
        lineWidth = 5,
        align = 'center',
        baseline = 'alphabetic',
        font = 'bold 28px sans-serif'
    } = opts;
    const t = String(text || '');
    if (!t) return;
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.strokeText(t, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(t, x, y);
    ctx.restore();
}

async function loadAvatar(url) {
    if (!url) return null;
    try {
        return await loadImage(String(url));
    } catch {
        return null;
    }
}

function drawCircularAvatar(ctx, img, cx, cy, radius, ringColor = ACCENT) {
    const ring = Math.max(3, Math.round(radius * 0.08));
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + ring, 0, Math.PI * 2);
    ctx.fillStyle = ringColor;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    if (img) {
        ctx.clip();
        const ar = img.width / img.height;
        let sw = img.width;
        let sh = img.height;
        if (ar > 1) {
            sw = img.height;
        } else {
            sh = img.width;
        }
        const sx = (img.width - sw) / 2;
        const sy = (img.height - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, cx - radius, cy - radius, radius * 2, radius * 2);
    } else {
        ctx.fillStyle = '#4c1d95';
        ctx.fill();
    }
    ctx.restore();

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
}

function drawProgressBar(ctx, x, y, width, height, percent) {
    const p = clamp(Number(percent) || 0, 0, 100);
    const r = height / 2;

    ctx.save();
    roundRectPath(ctx, x, y, width, height, r);
    ctx.fillStyle = BAR_BG;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (p > 0) {
        const fillW = Math.max(height, (width * p) / 100);
        roundRectPath(ctx, x, y, fillW, height, r);
        const grad = ctx.createLinearGradient(x, y, x + fillW, y);
        grad.addColorStop(0, BAR_FILL_START);
        grad.addColorStop(1, BAR_FILL_END);
        ctx.fillStyle = grad;
        ctx.fill();
    }
    ctx.restore();
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

/**
 * Tarjeta de progreso individual (/nivel).
 * @param {object} opts
 */
async function renderNivelCardPng(opts = {}) {
    const canvas = createCanvas(NIVEL_W, NIVEL_H);
    const ctx = canvas.getContext('2d');

    const bg = await loadBackgroundImage(opts.backgroundPath);
    if (bg) {
        drawBackgroundCover(ctx, bg, NIVEL_W, NIVEL_H);
    } else {
        drawFallbackGradient(ctx, NIVEL_W, NIVEL_H);
    }

    const avatarUrl = opts.avatarUrl;
    const avatarImg = await loadAvatar(avatarUrl);
    drawCircularAvatar(ctx, avatarImg, NIVEL_W / 2, 168, 82, ACCENT);

    const displayName = truncate(opts.displayName || 'Usuario', 28);
    const level = Number.parseInt(opts.level, 10) || 0;
    const xp = Math.max(0, Number.parseInt(opts.xp, 10) || 0);
    const rankRaw = opts.rank != null ? String(opts.rank) : '—';
    const rankDisplay =
        rankRaw.startsWith('#') || rankRaw === 'Sin clasificar' ? rankRaw : `#${rankRaw}`;
    const percent = clamp(Number(opts.percent) || 0, 0, 100);

    drawStrokedText(ctx, displayName, NIVEL_W / 2, 278, {
        font: 'bold 34px sans-serif',
        fill: TEXT_MAIN
    });

    const statY = 332;
    const colW = 240;
    const cols = [
        { label: 'NIVEL', value: String(level) },
        { label: 'XP TOTAL', value: xp.toLocaleString('es-ES') },
        { label: 'PUESTO', value: rankDisplay }
    ];
    cols.forEach((col, i) => {
        const cx = NIVEL_W / 2 + (i - 1) * colW;
        drawStrokedText(ctx, col.label, cx, statY, {
            font: 'bold 16px sans-serif',
            fill: TEXT_MUTED,
            lineWidth: 3
        });
        drawStrokedText(ctx, col.value, cx, statY + 30, {
            font: 'bold 30px sans-serif',
            fill: ACCENT_SOFT
        });
    });

    const barX = 120;
    const barY = 410;
    const barW = NIVEL_W - 240;
    const barH = 28;
    drawProgressBar(ctx, barX, barY, barW, barH, percent);

    drawStrokedText(ctx, `${percent}%`, NIVEL_W / 2, barY + 52, {
        font: 'bold 22px sans-serif',
        fill: TEXT_MAIN,
        lineWidth: 4
    });

    const progLabel = opts.progressLabel ? String(opts.progressLabel).slice(0, 80) : '';
    if (progLabel) {
        drawStrokedText(ctx, progLabel, NIVEL_W / 2, barY - 14, {
            font: '16px sans-serif',
            fill: TEXT_MUTED,
            lineWidth: 3
        });
    }

    return canvas.toBuffer('image/png');
}

/**
 * Tarjeta de ranking (/top).
 * @param {object} opts
 * @param {string} opts.title
 * @param {Array<{ rank: number, avatarUrl?: string, displayName: string, level: number, percent: number, suffix?: string }>} opts.entries
 */
async function renderTopCardPng(opts = {}) {
    const entries = Array.isArray(opts.entries) ? opts.entries.slice(0, 25) : [];
    const count = Math.max(1, entries.length);
    const h = TOP_HEADER_H + count * TOP_ROW_H + TOP_PAD;
    const canvas = createCanvas(TOP_W, h);
    const ctx = canvas.getContext('2d');

    const bg = await loadBackgroundImage(opts.backgroundPath);
    if (bg) {
        drawBackgroundCover(ctx, bg, TOP_W, h);
    } else {
        drawFallbackGradient(ctx, TOP_W, h);
    }

    const overlay = ctx.createLinearGradient(0, 0, 0, h);
    overlay.addColorStop(0, 'rgba(8, 0, 24, 0.12)');
    overlay.addColorStop(1, 'rgba(8, 0, 24, 0.38)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, TOP_W, h);

    drawStrokedText(ctx, truncate(String(opts.title || 'Ranking'), 40), TOP_W / 2, 48, {
        font: 'bold 36px sans-serif',
        fill: ACCENT_SOFT
    });

    const avatarImages = await Promise.all(
        entries.map((entry) => loadAvatar(entry.avatarUrl))
    );

    const startY = TOP_HEADER_H;
    const rowLeft = 48;
    const avatarR = 20;

    for (let i = 0; i < entries.length; i += 1) {
        const entry = entries[i];
        const y = startY + i * TOP_ROW_H + TOP_ROW_H / 2;
        const rank = Number.parseInt(entry.rank, 10) || i + 1;
        const isPodium = rank <= 3;

        if (isPodium) {
            drawStrokedText(ctx, `#${rank}`, rowLeft + 8, y - 6, {
                align: 'left',
                baseline: 'middle',
                font: 'bold 22px sans-serif',
                fill: MEDAL_COLORS[rank - 1] || ACCENT,
                lineWidth: 4
            });
        } else {
            drawStrokedText(ctx, `#${rank}`, rowLeft + 8, y - 6, {
                align: 'left',
                baseline: 'middle',
                font: 'bold 20px sans-serif',
                fill: TEXT_MUTED,
                lineWidth: 3
            });
        }

        const avX = rowLeft + 52;
        drawCircularAvatar(ctx, avatarImages[i], avX, y, avatarR, isPodium ? MEDAL_COLORS[rank - 1] : ACCENT);

        const nameX = rowLeft + 92;
        const name = truncate(entry.displayName, 26);
        const level = Number.parseInt(entry.level, 10) || 0;
        const pct = clamp(Number(entry.percent) || 0, 0, 100);
        const suffix = entry.suffix ? String(entry.suffix).slice(0, 36) : '';

        drawStrokedText(ctx, name, nameX, y - 10, {
            align: 'left',
            baseline: 'middle',
            font: 'bold 22px sans-serif',
            fill: TEXT_MAIN,
            lineWidth: 4
        });

        const detail = `Nv ${level} · ${pct}%${suffix ? ` · ${suffix}` : ''}`;
        drawStrokedText(ctx, detail, nameX, y + 14, {
            align: 'left',
            baseline: 'middle',
            font: '16px sans-serif',
            fill: TEXT_MUTED,
            lineWidth: 3
        });

        const miniBarW = 140;
        const miniBarH = 8;
        const miniBarX = TOP_W - rowLeft - miniBarW;
        drawProgressBar(ctx, miniBarX, y - miniBarH / 2, miniBarW, miniBarH, pct);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    renderNivelCardPng,
    renderTopCardPng,
    DEFAULT_BG_PATH,
    NIVEL_CARD_WIDTH: NIVEL_W,
    NIVEL_CARD_HEIGHT: NIVEL_H
};
