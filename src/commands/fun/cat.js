const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cat')
        .setDescription('Muestra una imagen aleatoria de gato'),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const response = await axios.get('https://api.thecatapi.com/v1/images/search');
            const catUrl = response.data[0].url;

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🐱 Gato Aleatorio')
                .setImage(catUrl)
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener la imagen.')]
            });
        }
    }
};













