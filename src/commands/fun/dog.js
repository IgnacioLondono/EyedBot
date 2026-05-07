const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');

const DOG_CACHE_TTL_MS = 60_000;
let dogCache = null;

function getCachedDog() {
    if (!dogCache || dogCache.expiresAt <= Date.now()) {
        dogCache = null;
        return null;
    }
    return dogCache.value;
}

function setCachedDog(value) {
    dogCache = {
        value,
        expiresAt: Date.now() + DOG_CACHE_TTL_MS
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dog')
        .setDescription('Muestra una imagen aleatoria de perro'),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        try {
            let dogUrl = getCachedDog();
            if (!dogUrl) {
                const response = await axios.get('https://dog.ceo/api/breeds/image/random');
                dogUrl = response.data.message;
                setCachedDog(dogUrl);
            }

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













