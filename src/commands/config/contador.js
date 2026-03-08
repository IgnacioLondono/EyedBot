const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const Embeds = require('../../utils/embeds');
const countingStore = require('../../utils/counting-store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('contador')
        .setDescription('Configura el juego de contador por numeros')
        .addSubcommand(subcommand =>
            subcommand
                .setName('canal')
                .setDescription('Establece el canal donde se contara')
                .addChannelOption(option =>
                    option
                        .setName('canal')
                        .setDescription('Canal de texto para contar')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('estado')
                .setDescription('Muestra el estado del contador'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reiniciar')
                .setDescription('Reinicia el contador a 0 (proximo numero: 1)'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('desactivar')
                .setDescription('Desactiva el contador en este servidor'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    cooldown: 5,
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'canal') {
            const channel = interaction.options.getChannel('canal');
            if (!channel || !channel.isTextBased()) {
                return interaction.reply({
                    embeds: [Embeds.error('Canal invalido', 'Debes elegir un canal de texto valido.')],
                    flags: 64
                });
            }

            const state = await countingStore.setChannel(interaction.guild.id, channel.id);
            return interaction.reply({
                embeds: [
                    Embeds.success(
                        'Contador configurado',
                        `Canal establecido en ${channel}.\nNumero actual: **${state.current}**\nSiguiente numero: **${state.current + 1}**`
                    )
                ]
            });
        }

        if (subcommand === 'estado') {
            const state = await countingStore.getGuildConfig(interaction.guild.id);
            if (!state.enabled || !state.channelId) {
                return interaction.reply({
                    embeds: [Embeds.info('Estado del contador', 'El contador esta desactivado en este servidor.')],
                    flags: 64
                });
            }

            return interaction.reply({
                embeds: [
                    Embeds.info(
                        'Estado del contador',
                        `Canal: <#${state.channelId}>\nNumero actual: **${state.current}**\nSiguiente numero: **${state.current + 1}**`
                    )
                ]
            });
        }

        if (subcommand === 'reiniciar') {
            const previous = await countingStore.getGuildConfig(interaction.guild.id);
            const reached = previous.current || 0;
            await countingStore.resetProgress(interaction.guild.id);
            return interaction.reply({
                embeds: [
                    Embeds.warning(
                        'Contador reiniciado',
                        `Listo. Numero alcanzado antes del reinicio: **${reached}**.\nAhora deben empezar en **1**.`
                    )
                ]
            });
        }

        if (subcommand === 'desactivar') {
            await countingStore.disable(interaction.guild.id);
            return interaction.reply({
                embeds: [Embeds.warning('Contador desactivado', 'El juego de contador fue desactivado para este servidor.')]
            });
        }

        return interaction.reply({
            embeds: [Embeds.error('Accion no valida', 'Subcomando no reconocido.')],
            flags: 64
        });
    }
};
