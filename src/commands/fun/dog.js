const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dog')
        .setDescription('Muestra una imagen aleatoria de perro'),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const response = await axios.get('https://dog.ceo/api/breeds/image/random');
            const dogUrl = response.data.message;

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🐕 Perro Aleatorio')
                .setImage(dogUrl)
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener la imagen.')]
            });
        }
    }
};













