const fs = require('fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const W = 920;
const H = 520;

const DEFAULT_CARD_LAYOUT = {
    bgFocalX: 0.5,
    bgFocalY: 0.5,
    avatarCx: 460,
    avatarCy: 168,
    avatarR: 78,
    titleX: 460,
    titleY: 262,
    nameX: 460,
    nameY: 320,
    subtitleX: 460,
    subtitleY: 368,
    overlayX: 892,
    overlayY: 498
};

function clamp(n, a, b) {
    return Math.min(b, Math.max(a, n));
}

function mergeCardLayout(raw) {
    const d = { ...DEFAULT_CARD_LAYOUT };
    if (!raw || typeof raw !== 'object') return d;
    const num = (v, def, min, max) => {
        const x = Number(v);
        return Number.isFinite(x) ? clamp(x, min, max) : def;
    };
    return {
        bgFocalX: num(raw.bgFocalX, d.bgFocalX, 0, 1),
        bgFocalY: num(raw.bgFocalY, d.bgFocalY, 0, 1),
        avatarCx: num(raw.avatarCx, d.avatarCx, 0, W),
        avatarCy: num(raw.avatarCy, d.avatarCy, 0, H),
        avatarR: num(raw.avatarR, d.avatarR, 36, 150),
        titleX: num(raw.titleX, d.titleX, 0, W),
        titleY: num(raw.titleY, d.titleY, 0, H),
        nameX: num(raw.nameX, d.nameX, 0, W),
        nameY: num(raw.nameY, d.nameY, 0, H),
        subtitleX: num(raw.subtitleX, d.subtitleX, 0, W),
        subtitleY: num(raw.subtitleY, d.subtitleY, 0, H),
        overlayX: num(raw.overlayX, d.overlayX, 0, W),
        overlayY: num(raw.overlayY, d.overlayY, 0, H)
    };
}

/** Fuentes del sistema (sin comillas internas). */
const FONT_STACKS = {
    system: { title: 'bold 44px Arial', name: '26px Arial', sub: 'italic 20px Arial', overlay: 'bold 17px Arial' },
    serif: { title: 'bold 44px Georgia', name: '26px Georgia', sub: 'italic 20px Georgia', overlay: 'bold 17px Georgia' },
    mono: { title: 'bold 40px Consolas', name: '24px Consolas', sub: 'italic 18px Consolas', overlay: 'bold 16px Consolas' },
    rounded: { title: 'bold 44px Verdana', name: '26px Verdana', sub: 'italic 20px Verdana', overlay: 'bold 17px Verdana' },
    elegant: { title: 'bold 44px Times New Roman', name: '26px Times New Roman', sub: 'italic 20px Times New Roman', overlay: 'bold 17px Times New Roman' }
};

function resolveFonts(fontKey) {
    const k = String(fontKey || 'system').toLowerCase();
    return FONT_STACKS[k] || FONT_STACKS.system;
}

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

function canvasSafeLine(text, usernameFallback = 'usuario') {
    let s = String(text || '').trim();
    s = s.replace(/<@!?([0-9]+)>/g, `@${usernameFallback}`);
    s = s.replace(/<@&([0-9]+)>/g, '@rol');
    s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
    s = s.replace(/\*([^*]+)\*/g, '$1');
    s = s.replace(/__([^_]+)__/g, '$1');
    s = s.replace(/`([^`]+)`/g, '$1');
    return s;
}

async function loadBackgroundImage(backgroundUrl, backgroundFilePath, backgroundBuffer) {
    try {
        if (backgroundBuffer && Buffer.isBuffer(backgroundBuffer) && backgroundBuffer.length > 0) {
            return await loadImage(backgroundBuffer);
        }
        if (backgroundFilePath && fs.existsSync(backgroundFilePath)) {
            return await loadImage(backgroundFilePath);
        }
        if (backgroundUrl && String(backgroundUrl).trim()) {
            return await loadImage(String(backgroundUrl).trim());
        }
    } catch {
        // ignore
    }
    return null;
}

function drawBackgroundGradient(ctx) {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#38bdf8');
    g.addColorStop(0.45, '#a78bfa');
    g.addColorStop(1, '#34d399');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

function drawBackgroundImage(ctx, img, focalX, focalY) {
    const fx = clamp(Number(focalX) || 0.5, 0, 1);
    const fy = clamp(Number(focalY) || 0.5, 0, 1);
    const scale = Math.max(W / img.width, H / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const ox = dw > W ? (W - dw) * fx : (W - dw) / 2;
    const oy = dh > H ? (H - dh) * fy : (H - dh) / 2;
    ctx.drawImage(img, ox, oy, dw, dh);
}

function drawStrokedText(ctx, text, x, y, fillHex, strokeRgba = 'rgba(0,0,0,0.72)') {
    const t = String(text || '');
    if (!t) return;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = 5;
    ctx.strokeStyle = strokeRgba;
    ctx.strokeText(t, x, y);
    ctx.fillStyle = rgbFill(fillHex);
    ctx.fillText(t, x, y);
}

/** Trozos de texto con color opcional; formato almacenado: [[#RRGGBB]]...[[/]] */
function parseColorMarkupSegments(input) {
    const s = String(input ?? '');
    const segments = [];
    let color = null;
    let buf = '';
    const flush = () => {
        if (!buf) return;
        segments.push({ text: buf, color });
        buf = '';
    };
    const re = /\[\[#([0-9a-fA-F]{6})\]\]|\[\[\/\]\]/gi;
    let last = 0;
    let m;
    while ((m = re.exec(s)) !== null) {
        buf += s.slice(last, m.index);
        if (m[0].toLowerCase().startsWith('[[#')) {
            flush();
            color = m[1].toLowerCase();
        } else {
            flush();
            color = null;
        }
        last = m.index + m[0].length;
    }
    buf += s.slice(last);
    flush();
    return segments.length ? segments : [{ text: s, color: null }];
}

function stripColorMarkup(input) {
    return String(input || '')
        .replace(/\[\[#([0-9a-fA-F]{6})\]\]/gi, '')
        .replace(/\[\[\/\]\]/g, '');
}

function truncatePlainSegments(segments, maxLen) {
    let n = 0;
    const out = [];
    for (const seg of segments) {
        if (n >= maxLen) break;
        let t = String(seg.text || '');
        if (n + t.length > maxLen) t = t.slice(0, maxLen - n);
        t = String(t);
        if (!t) continue;
        out.push({ text: t, color: seg.color });
        n += t.length;
        if (n >= maxLen) break;
    }
    return out.length ? out : [{ text: '', color: null }];
}

function drawRichStrokedLineTopCentered(ctx, segments, xCenter, y, defaultHex, userHint, maxFlatLen = 200) {
    const parts = segments
        .map((seg) => ({
            text: canvasSafeLine(String(seg.text || ''), userHint),
            color: seg.color
        }))
        .filter((p) => p.text.length);
    if (!parts.length) {
        const flat = canvasSafeLine(
            segments.map((s) => String(s.text || '')).join(''),
            userHint
        ).trim();
        if (flat) {
            drawStrokedText(ctx, flat.slice(0, maxFlatLen), xCenter, y, defaultHex);
        }
        return;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let total = 0;
    const widths = parts.map((p) => {
        const w = ctx.measureText(p.text).width;
        total += w;
        return w;
    });
    if (!Number.isFinite(total) || total <= 0) {
        const flat = parts.map((p) => p.text).join('');
        drawStrokedText(ctx, flat.slice(0, maxFlatLen), xCenter, y, defaultHex);
        return;
    }
    let left = xCenter - total / 2;
    for (let i = 0; i < parts.length; i++) {
        const cx = left + widths[i] / 2;
        drawStrokedText(ctx, parts[i].text, cx, y, parts[i].color || defaultHex);
        left += widths[i];
    }
}

function drawRichStrokedLineOverlay(ctx, segments, anchorX, anchorY, defaultHex, alignRight, userHint, maxFlatLen = 200) {
    const parts = segments
        .map((seg) => ({
            text: canvasSafeLine(String(seg.text || ''), userHint),
            color: seg.color
        }))
        .filter((p) => p.text.length);
    if (!parts.length) {
        const flat = canvasSafeLine(
            segments.map((s) => String(s.text || '')).join(''),
            userHint
        ).trim();
        if (flat) {
            ctx.textAlign = alignRight ? 'right' : 'left';
            ctx.textBaseline = 'bottom';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0,0,0,0.75)';
            ctx.lineJoin = 'round';
            ctx.strokeText(flat.slice(0, maxFlatLen), anchorX, anchorY);
            ctx.fillStyle = rgbFill(defaultHex);
            ctx.fillText(flat.slice(0, maxFlatLen), anchorX, anchorY);
        }
        return;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineJoin = 'round';
    let total = 0;
    const widths = parts.map((p) => {
        const w = ctx.measureText(p.text).width;
        total += w;
        return w;
    });
    if (!Number.isFinite(total) || total <= 0) {
        const flat = parts.map((p) => p.text).join('');
        ctx.textAlign = alignRight ? 'right' : 'left';
        ctx.strokeText(flat.slice(0, maxFlatLen), anchorX, anchorY);
        ctx.fillStyle = rgbFill(defaultHex);
        ctx.fillText(flat.slice(0, maxFlatLen), anchorX, anchorY);
        return;
    }
    let left = alignRight ? anchorX - total : anchorX;
    for (let i = 0; i < parts.length; i++) {
        const cx = left + widths[i] / 2;
        ctx.strokeText(parts[i].text, cx, anchorY);
        ctx.fillStyle = rgbFill(parts[i].color || defaultHex);
        ctx.fillText(parts[i].text, cx, anchorY);
        left += widths[i];
    }
}

/**
 * @param {object} opts
 * @param {object} [opts.cardLayout] posiciones en px (espacio 920×520); se fusiona con valores por defecto.
 */
async function renderWelcomeCardPng(opts = {}) {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const layout = mergeCardLayout(opts.cardLayout);

    const accent = (opts.accentHex || '4ade80').replace('#', '');
    const titleColor = (opts.titleHex || 'ffffff').replace('#', '');
    const nameColor = (opts.nameHex || 'f8fafc').replace('#', '');
    const subColor = (opts.subtitleHex || 'e2e8f0').replace('#', '');
    const overlayColor = (opts.overlayHex || 'ffffff').replace('#', '');
    const fonts = resolveFonts(opts.fontKey);
    const userHint = opts.plainUsername || 'usuario';

    ctx.save();
    roundRectPath(ctx, 0, 0, W, H, 24);
    ctx.clip();

    const bgImg = await loadBackgroundImage(opts.backgroundUrl, opts.backgroundFilePath, opts.backgroundBuffer);
    if (!bgImg) {
        drawBackgroundGradient(ctx);
    } else {
        drawBackgroundImage(ctx, bgImg, layout.bgFocalX, layout.bgFocalY);
    }

    const vignette = ctx.createLinearGradient(0, H * 0.35, 0, H);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();

    const cx = layout.avatarCx;
    const cy = layout.avatarCy;
    const radius = layout.avatarR;
    const ring = Math.max(3, Math.round(radius * 0.07));

    let avatarImg = null;
    try {
        if (opts.avatarUrl) avatarImg = await loadImage(String(opts.avatarUrl));
    } catch {
        avatarImg = null;
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + ring, 0, Math.PI * 2);
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

    ctx.beginPath();

    const headlineSegs = truncatePlainSegments(parseColorMarkupSegments(String(opts.headline || 'Bienvenido')), 80);
    const displayNameSegs = truncatePlainSegments(parseColorMarkupSegments(String(opts.displayName || 'Usuario')), 80);
    const subtitlePlain = canvasSafeLine(stripColorMarkup(String(opts.subtitle || '').slice(0, 200)), userHint);
    const overlaySegs = truncatePlainSegments(parseColorMarkupSegments(String(opts.overlayText || '').slice(0, 160)), 160);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'transparent';

    ctx.font = fonts.title;
    drawRichStrokedLineTopCentered(ctx, headlineSegs, layout.titleX, layout.titleY, titleColor, userHint, 80);

    ctx.font = fonts.name;
    drawRichStrokedLineTopCentered(ctx, displayNameSegs, layout.nameX, layout.nameY, nameColor, userHint, 80);

    if (subtitlePlain.trim()) {
        ctx.font = fonts.sub;
        const lines = wrapText(ctx, subtitlePlain, W - 120);
        let y = layout.subtitleY;
        for (const line of lines.slice(0, 3)) {
            drawStrokedText(ctx, line, layout.subtitleX, y, subColor);
            y += 28;
        }
    }

    const hasOverlayDraw = overlaySegs.some((seg) => canvasSafeLine(String(seg.text || ''), userHint).trim());
    if (hasOverlayDraw) {
        ctx.font = fonts.overlay;
        const alignRight = layout.overlayX >= W / 2;
        drawRichStrokedLineOverlay(ctx, overlaySegs, layout.overlayX, layout.overlayY, overlayColor, alignRight, userHint, 160);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
    }

    ctx.shadowColor = 'transparent';

    return canvas.toBuffer('image/png');
}

function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
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
    return lines.length ? lines : (text.trim() ? [text] : []);
}

module.exports = {
    renderWelcomeCardPng,
    mergeCardLayout,
    DEFAULT_CARD_LAYOUT,
    FONT_STACKS,
    WELCOME_CARD_WIDTH: W,
    WELCOME_CARD_HEIGHT: H
};
