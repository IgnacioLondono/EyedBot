const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

const MEME_CACHE_TTL_MS = 60_000;
let memeCache = null;

function getCachedMeme() {
    if (!memeCache || memeCache.expiresAt <= Date.now()) {
        memeCache = null;
        return null;
    }
    return memeCache.value;
}

function setCachedMeme(value) {
    memeCache = {
        value,
        expiresAt: Date.now() + MEME_CACHE_TTL_MS
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Muestra un meme aleatorio'),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        try {
            let meme = getCachedMeme();
            if (!meme) {
                const response = await axios.get('https://meme-api.com/gimme');
                meme = response.data;
                setCachedMeme(meme);
            }

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













