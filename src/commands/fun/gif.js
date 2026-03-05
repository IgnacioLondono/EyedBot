const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gif')
        .setDescription('Busca un GIF aleatorio')
        .addStringOption(option =>
            option.setName('busqueda')
                .setDescription('Qué buscar')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('busqueda');
        
        try {
            let url;
            if (config.tenorApiKey) {
                const response = await axios.get(`https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=${config.tenorApiKey}&limit=10`, {
                    timeout: 10000
                });
                if (response.data.results && response.data.results.length > 0) {
                    const randomResult = response.data.results[Math.floor(Math.random() * response.data.results.length)];
                    url = randomResult.media[0].gif.url;
                }
            } else {
                // Fallback a Giphy si no hay Tenor API
                try {
                    const response = await axios.get(`https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(query)}&api_key=dc6zaTOxFJmzC&limit=10`, {
                        timeout: 10000
                    });
                    if (response.data.data && response.data.data.length > 0) {
                        const randomGif = response.data.data[Math.floor(Math.random() * response.data.data.length)];
                        url = randomGif.images.original.url;
                    }
                } catch (giphyError) {
                    // Si Giphy falla, usar una API alternativa
                    const response = await axios.get(`https://nekos.life/api/v2/img/${query.includes('anime') ? 'smug' : 'cuddle'}`, {
                        timeout: 10000
                    });
                    url = response.data.url;
                }
            }

            if (!url) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se encontró ningún GIF. Intenta con otra búsqueda.')]
                });
            }

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(`GIF: ${query}`)
                .setImage(url)
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener el GIF.')]
            });
        }
    }
};













