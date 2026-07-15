const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');

const recentDogs = [];
const RECENT_LIMIT = 8;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dog')
        .setDescription('Muestra una imagen aleatoria de perro'),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        try {
            let dogUrl = null;
            for (let i = 0; i < 5; i += 1) {
                const response = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 8000 });
                const url = response.data?.message || null;
                if (!url) continue;
                if (!recentDogs.includes(url)) {
                    dogUrl = url;
                    break;
                }
                if (!dogUrl) dogUrl = url;
            }

            if (!dogUrl) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener la imagen.')]
                });
            }

            recentDogs.unshift(dogUrl);
            if (recentDogs.length > RECENT_LIMIT) recentDogs.length = RECENT_LIMIT;

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🐕 Perro Aleatorio')
                .setImage(dogUrl);

            setInteractionFooter(embed, interaction.user.tag);
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener la imagen.')]
            });
        }
    }
};
