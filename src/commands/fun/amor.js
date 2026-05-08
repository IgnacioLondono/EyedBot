const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const config = require('../../config');

const CARD_WIDTH = 920;
const CARD_HEIGHT = 420;
const AVATAR_RADIUS = 94;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function hashString(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function buildPairSeed(authorId, targetId) {
    const sorted = [String(authorId), String(targetId)].sort();
    return `${sorted[0]}:${sorted[1]}`;
}

function getLovePercent(authorId, targetId) {
    if (authorId === targetId) return 100;
    // Genera un porcentaje aleatorio en cada ejecución para dar resultados distintos
    return Math.floor(Math.random() * 101);
}

function getLoveComment(percent, isSelfLove) {
    if (isSelfLove) return 'Amor propio al 100%. Esa vibra no falla.';
    if (percent <= 10) return 'Uy... esto esta mas frio que un iceberg.';
    if (percent <= 25) return 'Hay quimica, pero toca remar bastante.';
    if (percent <= 45) return 'Puede funcionar si hay paciencia y memes.';
    if (percent <= 65) return 'Buen match. Hay senales positivas.';
    if (percent <= 85) return 'Alta compatibilidad. Aqui hay chispas.';
    return 'Match legendario. Esto parece destino.';
}

function truncateLabel(value, limit = 18) {
    return String(value || '').slice(0, limit);
}

function drawAvatar(ctx, image, centerX, centerY, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, centerX - radius, centerY - radius, radius * 2, radius * 2);
    ctx.restore();

    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
}

function drawHeart(ctx, centerX, centerY, size) {
    ctx.save();
    ctx.translate(centerX - (size / 2), centerY - (size / 2));
    ctx.scale(size / 100, size / 100);
    ctx.beginPath();
    ctx.moveTo(50, 85);
    ctx.bezierCurveTo(10, 55, 5, 15, 35, 10);
    ctx.bezierCurveTo(50, 8, 62, 17, 50, 30);
    ctx.bezierCurveTo(38, 17, 50, 8, 65, 10);
    ctx.bezierCurveTo(95, 15, 90, 55, 50, 85);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 100, 100);
    gradient.addColorStop(0, '#ff5d8f');
    gradient.addColorStop(1, '#ff839f');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
}

function drawBackground(ctx) {
    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    gradient.addColorStop(0, '#2b0b5f');
    gradient.addColorStop(0.5, '#6a1b9a');
    gradient.addColorStop(1, '#ef476f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    for (let i = 0; i < 18; i += 1) {
        const x = (i * 53) % CARD_WIDTH;
        const y = (i * 97) % CARD_HEIGHT;
        const radius = 8 + ((i * 11) % 22);
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';
        ctx.beginPath();
        ctx.arc(x + 30, y + 24, radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

async function buildLoveCard(author, target, percent) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');

    drawBackground(ctx);

    const [authorAvatar, targetAvatar] = await Promise.all([
        loadImage(author.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true })),
        loadImage(target.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }))
    ]);

    drawAvatar(ctx, authorAvatar, 210, 165, AVATAR_RADIUS);
    drawAvatar(ctx, targetAvatar, 710, 165, AVATAR_RADIUS);
    drawHeart(ctx, 460, 165, 165);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.font = 'bold 58px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${percent}%`, 460, 255);

    ctx.font = 'bold 28px Arial';
    ctx.fillStyle = '#ffe5ec';
    ctx.fillText('Compatibilidad amorosa', 460, 320);

    ctx.font = 'bold 24px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(truncateLabel(author.username), 210, 280);
    ctx.fillText(truncateLabel(target.username), 710, 280);

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
        } catch {
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
