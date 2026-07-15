const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const config = require('../../config');

const CARD_WIDTH = 920;
const CARD_HEIGHT = 480;
const AVATAR_RADIUS = 100;

function getLovePercent(authorId, targetId) {
    if (authorId === targetId) return 100;
    return Math.floor(Math.random() * 101);
}

function getLoveComment(percent, isSelfLove) {
    if (isSelfLove) return 'Amor propio al 100%. Esa vibra no falla.';
    if (percent <= 10) return 'Uy... esto está más frío que un iceberg.';
    if (percent <= 25) return 'Hay química, pero toca remar bastante.';
    if (percent <= 45) return 'Puede funcionar si hay paciencia y memes.';
    if (percent <= 65) return 'Buen match. Hay señales positivas.';
    if (percent <= 85) return 'Alta compatibilidad. Aquí hay chispas.';
    return 'Match legendario. Esto parece destino.';
}

function truncateLabel(value, limit = 20) {
    const s = String(value || '').trim();
    if (s.length <= limit) return s;
    return `${s.slice(0, limit - 1)}…`;
}

function displayNameOf(user) {
    return user.globalName || user.username || 'Usuario';
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

function percentTone(percent) {
    if (percent <= 25) return { fill: '#94a3b8', glow: 'rgba(148,163,184,0.45)', bar: ['#64748b', '#94a3b8'] };
    if (percent <= 50) return { fill: '#fb7185', glow: 'rgba(251,113,133,0.45)', bar: ['#e11d48', '#fb7185'] };
    if (percent <= 75) return { fill: '#f472b6', glow: 'rgba(244,114,182,0.5)', bar: ['#db2777', '#f9a8d4'] };
    return { fill: '#fda4af', glow: 'rgba(252,165,165,0.55)', bar: ['#be123c', '#fb7185'] };
}

function drawBackground(ctx) {
    ctx.save();
    roundRectPath(ctx, 0, 0, CARD_WIDTH, CARD_HEIGHT, 28);
    ctx.clip();

    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    gradient.addColorStop(0, '#3b0764');
    gradient.addColorStop(0.35, '#6b21a8');
    gradient.addColorStop(0.7, '#9d174d');
    gradient.addColorStop(1, '#e11d48');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Soft bokeh
    for (let i = 0; i < 22; i += 1) {
        const x = (i * 79 + 40) % CARD_WIDTH;
        const y = (i * 53 + 30) % CARD_HEIGHT;
        const radius = 18 + ((i * 17) % 40);
        const orb = ctx.createRadialGradient(x, y, 0, x, y, radius);
        orb.addColorStop(0, i % 2 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,180,210,0.12)');
        orb.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = orb;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    }

    // Vignette
    const vignette = ctx.createRadialGradient(
        CARD_WIDTH / 2,
        CARD_HEIGHT / 2,
        CARD_HEIGHT * 0.2,
        CARD_WIDTH / 2,
        CARD_HEIGHT / 2,
        CARD_WIDTH * 0.72
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    ctx.restore();
}

function drawAvatar(ctx, image, centerX, centerY, radius, ringColor) {
    // Soft drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.restore();

    // Outer glow ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 4;
    ctx.stroke();

    // White inner frame
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const ar = image.width / image.height;
    let sw = image.width;
    let sh = image.height;
    if (ar > 1) sw = image.height;
    else sh = image.width;
    const sx = (image.width - sw) / 2;
    const sy = (image.height - sh) / 2;
    ctx.drawImage(image, sx, sy, sw, sh, centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();
}

function drawHeart(ctx, centerX, centerY, size, glowColor) {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 28;

    const s = size / 100;
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 28);
    ctx.bezierCurveTo(-40, 0, -42, -38, -16, -42);
    ctx.bezierCurveTo(-4, -44, 0, -30, 0, -22);
    ctx.bezierCurveTo(0, -30, 4, -44, 16, -42);
    ctx.bezierCurveTo(42, -38, 40, 0, 0, 28);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(-40, -40, 40, 40);
    gradient.addColorStop(0, '#fb7185');
    gradient.addColorStop(0.45, '#f43f5e');
    gradient.addColorStop(1, '#e11d48');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Subtle highlight
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.ellipse(-12, -18, 10, 7, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();

    ctx.restore();
}

function drawConnector(ctx, leftX, rightX, y, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 8]);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(leftX, y);
    ctx.lineTo(rightX, y);
    ctx.stroke();
    ctx.restore();
}

function drawProgressBar(ctx, x, y, width, height, percent, colors) {
    const p = Math.max(0, Math.min(100, percent));
    const r = height / 2;

    ctx.save();
    roundRectPath(ctx, x, y, width, height, r);
    ctx.fillStyle = 'rgba(15,5,30,0.45)';
    ctx.fill();

    if (p > 0) {
        const fillW = Math.max(height, (width * p) / 100);
        roundRectPath(ctx, x, y, fillW, height, r);
        const grad = ctx.createLinearGradient(x, y, x + fillW, y);
        grad.addColorStop(0, colors[0]);
        grad.addColorStop(1, colors[1]);
        ctx.fillStyle = grad;
        ctx.fill();
    }

    roundRectPath(ctx, x, y, width, height, r);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
}

function drawStrokedText(ctx, text, x, y, opts = {}) {
    const {
        font = 'bold 28px sans-serif',
        fill = '#ffffff',
        stroke = 'rgba(20,0,40,0.65)',
        lineWidth = 5,
        align = 'center',
        baseline = 'alphabetic'
    } = opts;
    ctx.save();
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.lineJoin = 'round';
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
    ctx.restore();
}

async function buildLoveCard(author, target, percent) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    const tone = percentTone(percent);

    drawBackground(ctx);

    const [authorAvatar, targetAvatar] = await Promise.all([
        loadImage(author.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true })),
        loadImage(target.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }))
    ]);

    const leftX = 230;
    const rightX = 690;
    const avatarY = 168;
    const heartX = CARD_WIDTH / 2;
    const heartY = 160;

    drawConnector(ctx, leftX + AVATAR_RADIUS + 14, rightX - AVATAR_RADIUS - 14, avatarY, tone.fill);
    drawAvatar(ctx, authorAvatar, leftX, avatarY, AVATAR_RADIUS, tone.fill);
    drawAvatar(ctx, targetAvatar, rightX, avatarY, AVATAR_RADIUS, tone.fill);
    drawHeart(ctx, heartX, heartY, 118, tone.glow);

    const authorName = truncateLabel(displayNameOf(author));
    const targetName = truncateLabel(displayNameOf(target));

    drawStrokedText(ctx, authorName, leftX, 300, {
        font: 'bold 26px sans-serif',
        fill: '#fff7fb'
    });
    drawStrokedText(ctx, targetName, rightX, 300, {
        font: 'bold 26px sans-serif',
        fill: '#fff7fb'
    });

    drawStrokedText(ctx, `${percent}%`, heartX, 348, {
        font: 'bold 64px sans-serif',
        fill: '#ffffff',
        lineWidth: 7
    });

    drawStrokedText(ctx, 'Compatibilidad amorosa', heartX, 392, {
        font: '600 22px sans-serif',
        fill: '#ffe4ef',
        lineWidth: 4
    });

    drawProgressBar(ctx, 220, 424, CARD_WIDTH - 440, 16, percent, tone.bar);

    return canvas.encode('png');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('amor')
        .setDescription('Calcula la compatibilidad amorosa con otro usuario')
        .addUserOption((option) =>
            option
                .setName('usuario')
                .setDescription('Usuario para calcular el match')
                .setRequired(true)
        ),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        const author = interaction.user;
        const target = interaction.options.getUser('usuario');
        const isSelfLove = author.id === target.id;

        try {
            const percent = getLovePercent(author.id, target.id);
            const image = await buildLoveCard(author, target, percent);
            const attachment = new AttachmentBuilder(image, { name: 'amor.png' });

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('💘 Medidor de Amor')
                .setDescription(`${author} + ${target}\n**${percent}%** de compatibilidad\n${getLoveComment(percent, isSelfLove)}`)
                .setImage('attachment://amor.png');

            return interaction.editReply({
                embeds: [embed],
                files: [attachment]
            });
        } catch (error) {
            console.error('amor card:', error);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('No pude generar la carta de amor ahora mismo.')
                ]
            });
        }
    }
};
