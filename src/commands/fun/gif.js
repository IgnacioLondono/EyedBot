const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { fetchSearchGif, setInteractionFooter } = require('../../utils/fun-return');

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
            const media = await fetchSearchGif(query);

            if (!media?.url) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se encontró ningún GIF. Intenta con otra búsqueda.')]
                });
            }

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(`GIF: ${query}`)
                .setImage(media.url);

            setInteractionFooter(embed, interaction.user.tag, media.source, '🎬 Origen:');

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener el GIF.')]
            });
        }
    }
};













