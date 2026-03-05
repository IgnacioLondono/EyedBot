const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

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
            const response = await axios.get('https://api.waifu.pics/sfw/wink');
            const gifUrl = response.data.url;

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('😉 Guiño')
                .setDescription(user ? `${interaction.user} le guiñó a ${user}` : `${interaction.user} guiñó`)
                .setImage(gifUrl)
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener el GIF.')]
            });
        }
    }
};













