const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Desbloquea un canal')
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal a desbloquear (por defecto el actual)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    cooldown: 5,
    async execute(interaction) {
        const channel = interaction.options.getChannel('canal') || interaction.channel;

        try {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: true
            });

            return interaction.reply({
                embeds: [Embeds.success('Canal Desbloqueado', `${channel} ha sido desbloqueado.`)]
            });
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudo desbloquear el canal.')],
                flags: 64
            });
        }
    }
};






