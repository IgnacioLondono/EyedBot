const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Bloquea un canal')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal a bloquear (por defecto el actual)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    cooldown: 5,
    async execute(interaction) {
        const channel = interaction.options.getChannel('canal') || interaction.channel;

        try {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: false
            });

            return interaction.reply({
                embeds: [Embeds.success('Canal Bloqueado', `${channel} ha sido bloqueado.`)]
            });
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudo bloquear el canal.')],
                flags: 64
            });
        }
    }
};






