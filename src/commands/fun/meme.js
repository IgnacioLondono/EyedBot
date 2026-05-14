const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

/** Subreddits mayormente en español / Latinoamérica (meme-api.com/gimme/{sub}) */
const SPANISH_MEME_SUBREDDITS = [
    'memesLatinoamerica',
    'yo_elvr',
    'dankgentina',
    'MemesEnEspanol',
    'SpanishMemes'
];

function shuffleInPlace(arr) {
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function fetchSpanishMeme() {
    const order = shuffleInPlace([...SPANISH_MEME_SUBREDDITS]);
    const maxAttempts = Math.min(10, order.length * 2);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const sub = order[attempt % order.length];
        try {
            const { data } = await axios.get(`https://meme-api.com/gimme/${sub}`, {
                timeout: 12000
            });
            if (data?.url && data?.postLink && !data.nsfw && !data.spoiler) {
                return data;
            }
        } catch {
            // siguiente sub o reintento
        }
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Muestra un meme aleatorio en español'),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const meme = await fetchSpanishMeme();

            if (!meme) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Error')
                            .setDescription('No se pudo obtener un meme ahora mismo. Intenta de nuevo.')
                    ]
                });
            }

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(meme.title || 'Meme')
                .setURL(meme.postLink)
                .setImage(meme.url)
                .setFooter({ text: `r/${meme.subreddit} | ⬆️ ${meme.ups ?? '—'}` });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('No se pudo obtener el meme.')
                ]
            });
        }
    }
};
