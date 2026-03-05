const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Muestra un meme aleatorio'),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const response = await axios.get('https://meme-api.com/gimme');
            const meme = response.data;

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(meme.title)
                .setImage(meme.url)
                .setFooter({ text: `r/${meme.subreddit} | ⬆️ ${meme.ups}` });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener el meme.')]
            });
        }
    }
};













