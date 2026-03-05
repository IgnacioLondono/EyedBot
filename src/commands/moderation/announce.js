const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Envía un anuncio a un canal')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal donde enviar el anuncio')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('titulo')
                .setDescription('Título del anuncio')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('mensaje')
                .setDescription('Mensaje del anuncio')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    cooldown: 5,
    async execute(interaction) {
        const channel = interaction.options.getChannel('canal');
        const title = interaction.options.getString('titulo');
        const message = interaction.options.getString('mensaje');

        if (!channel.isTextBased()) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('Error').setDescription('El canal debe ser de texto.')],
                flags: 64
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(title)
            .setDescription(message)
            .setFooter({ text: `Anunciado por ${interaction.user.tag}` })
            .setTimestamp();

        try {
            await channel.send({ embeds: [embed] });
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle('✅ Anuncio Enviado').setDescription(`Anuncio enviado a ${channel}.`)],
                flags: 64
            });
        } catch (error) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('Error').setDescription('No se pudo enviar el anuncio.')],
                flags: 64
            });
        }
    }
};






