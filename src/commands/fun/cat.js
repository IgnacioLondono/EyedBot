const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');

const recentCats = [];
const RECENT_LIMIT = 8;

async function fetchCatUrl() {
    try {
        const response = await axios.get('https://api.thecatapi.com/v1/images/search', { timeout: 8000 });
        const url = response.data?.[0]?.url || null;
        if (url) return url;
    } catch {
        /* fallback */
    }

    try {
        const response = await axios.get('https://cataas.com/cat?json=true', {
            timeout: 8000,
            headers: { Accept: 'application/json' }
        });
        const id = response.data?._id || response.data?.id;
        if (id) return `https://cataas.com/cat/${id}`;
        if (response.data?.url) return response.data.url;
    } catch {
        /* noop */
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cat')
        .setDescription('Muestra una imagen aleatoria de gato'),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        try {
            let catUrl = null;
            for (let i = 0; i < 5; i += 1) {
                const url = await fetchCatUrl();
                if (!url) continue;
                if (!recentCats.includes(url)) {
                    catUrl = url;
                    break;
                }
                if (!catUrl) catUrl = url;
            }

            if (!catUrl) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener la imagen.')]
                });
            }

            recentCats.unshift(catUrl);
            if (recentCats.length > RECENT_LIMIT) recentCats.length = RECENT_LIMIT;

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🐱 Gato Aleatorio')
                .setImage(catUrl);

            setInteractionFooter(embed, interaction.user.tag);
            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener la imagen.')]
            });
        }
    }
};
