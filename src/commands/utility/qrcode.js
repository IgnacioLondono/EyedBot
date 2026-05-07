const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('qrcode')
        .setDescription('Genera un código QR')
        .addStringOption(option =>
            option.setName('texto')
                .setDescription('Texto o URL para el QR')
                .setRequired(true)),
    cooldown: 5,
    async execute(interaction) {
        const text = interaction.options.getString('texto');
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('📱 Código QR')
            .setImage(qrUrl);

        setInteractionFooter(embed, interaction.user.tag);

        return interaction.reply({ embeds: [embed] });
    }
};













