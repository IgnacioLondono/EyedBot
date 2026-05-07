const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { fetchInteractionGif, setInteractionFooter } = require('../../utils/fun-return');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wink')
        .setDescription('Guiña el ojo')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario al que guiñar')
                .setRequired(false)),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        const user = interaction.options.getUser('usuario');

        try {
            const media = await fetchInteractionGif('wink');
            if (!media?.url) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener el GIF.')]
                });
            }

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('😉 Guiño')
                .setDescription(user ? `${interaction.user} le guiñó a ${user}` : `${interaction.user} guiñó`)
                .setImage(media.url);

            setInteractionFooter(embed, interaction.user.tag, media.source);

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener el GIF.')]
            });
        }
    }
};
