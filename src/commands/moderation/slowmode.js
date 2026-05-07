const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Establece el modo lento en un canal')
        .addIntegerOption(option =>
            option.setName('segundos')
                .setDescription('Segundos de cooldown (0-21600)')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(21600))
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal a modificar (por defecto el actual)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    cooldown: 5,
    async execute(interaction) {
        const seconds = interaction.options.getInteger('segundos');
        const channel = interaction.options.getChannel('canal') || interaction.channel;

        try {
            await channel.setRateLimitPerUser(seconds);
            return interaction.reply({
                embeds: [Embeds.success('Modo Lento', `Modo lento establecido en ${seconds} segundos en ${channel}.`)]
            });
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudo establecer el modo lento.')],
                flags: 64
            });
        }
    }
};






