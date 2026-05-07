const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');

const CARD_WIDTH = 920;
const CARD_HEIGHT = 420;

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function randomLovePercent(authorId, targetId) {
    // Keep some variety while staying stable for the same pair during a short window.
    const seedBase = `${authorId}:${targetId}:${Math.floor(Date.now() / 3600000)}`;
    let hash = 0;
    for (let i = 0; i < seedBase.length; i += 1) {
        hash = ((hash << 5) - hash) + seedBase.charCodeAt(i);
        hash |= 0;
    }

    const normalized = Math.abs(hash % 101);
    return clamp(normalized, 0, 100);
}

function loveComment(percent, isSelfLove) {
    if (isSelfLove) return 'Amor propio al 100%. Esa vibra no falla.';
    if (percent <= 10) return 'Uy... esto está más frío que un iceberg.';
    if (percent <= 25) return 'Hay química, pero toca remar bastante.';
    if (percent <= 45) return 'Puede funcionar si hay paciencia y memes.';
    if (percent <= 65) return 'Buen match. Hay señales positivas.';
    if (percent <= 85) return 'Alta compatibilidad. Aquí hay chispas.';
    return '¡Match legendario! Esto parece destino.';
}

function drawCircleAvatar(ctx, image, cx, cy, radius) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();

    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
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
    gradient.addColorStop(0, '#ff4d6d');
    gradient.addColorStop(1, '#ff8fa3');
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
}

async function buildLoveImage(author, target, percent) {
    const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT);
    const ctx = canvas.getContext('2d');

    const bgGradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    bgGradient.addColorStop(0, '#240046');
    bgGradient.addColorStop(0.5, '#5a189a');
    bgGradient.addColorStop(1, '#ff4d6d');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 16; i += 1) {
        const x = Math.floor(Math.random() * CARD_WIDTH);
        const y = Math.floor(Math.random() * CARD_HEIGHT);
        const r = Math.floor(Math.random() * 24) + 8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    const authorAvatarUrl = author.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
    const targetAvatarUrl = target.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
    const [authorAvatar, targetAvatar] = await Promise.all([
        loadImage(authorAvatarUrl),
        loadImage(targetAvatarUrl)
    ]);

    drawCircleAvatar(ctx, authorAvatar, 210, 165, 95);
    drawCircleAvatar(ctx, targetAvatar, 710, 165, 95);
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
    ctx.fillText(author.username.slice(0, 18), 210, 280);
    ctx.fillText(target.username.slice(0, 18), 710, 280);

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

        const target = interaction.options.getUser('usuario');
        const author = interaction.user;
        const isSelfLove = target.id === author.id;

        try {
            const percent = isSelfLove ? 100 : randomLovePercent(author.id, target.id);
            const image = await buildLoveImage(author, target, percent);
            const attachment = new AttachmentBuilder(image, { name: 'amor.png' });

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('💘 Medidor de Amor')
                .setDescription(`${author} + ${target}\n**${percent}%** de compatibilidad\n${loveComment(percent, isSelfLove)}`)
                .setImage('attachment://amor.png');

            setInteractionFooter(embed, interaction.user.tag);

            return interaction.editReply({ embeds: [embed], files: [attachment] });
        } catch {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('No pude generar la carta de amor ahora mismo.')]
            });
        }
    }
};
