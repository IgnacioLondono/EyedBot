const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const Embeds = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vozocultar')
        .setDescription('Oculta o muestra un canal de voz para @everyone')
        .addBooleanOption(option =>
            option.setName('activar')
                .setDescription('true = ocultar, false = mostrar')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal de voz a gestionar (por defecto el canal de voz en el que estás)')
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    cooldown: 5,
    async execute(interaction) {
        const activate = interaction.options.getBoolean('activar', true);
        const selectedChannel = interaction.options.getChannel('canal');
        const memberVoiceChannel = interaction.member?.voice?.channel;
        const channel = selectedChannel || memberVoiceChannel;

        if (!channel || channel.type !== ChannelType.GuildVoice) {
            return interaction.reply({
                embeds: [Embeds.error('Canal no válido', 'Debes indicar un canal de voz o estar conectado a uno.')],
                flags: 64
            });
        }

        try {
            if (activate) {
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    ViewChannel: false,
                    Connect: false
                });

                return interaction.reply({
                    embeds: [Embeds.success('Canal de voz oculto', `${channel} fue ocultado para @everyone.`)],
                    flags: 64
                });
            }

            await channel.permissionOverwrites.delete(interaction.guild.roles.everyone.id).catch(async () => {
                await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                    ViewChannel: null,
                    Connect: null
                });
            });

            return interaction.reply({
                embeds: [Embeds.success('Canal de voz visible', `${channel} volvió a estar visible para @everyone.`)],
                flags: 64
            });
        } catch (error) {
            console.error('Error en /vozocultar:', error);
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No pude ocultar el canal de voz. Revisa permisos del bot.')],
                flags: 64
            });
        }
    }
};
