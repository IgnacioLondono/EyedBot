const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const Embeds = require('../../utils/embeds');
const levelingStore = require('../../utils/leveling-store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('canal-niveles')
        .setDescription('Canal donde avisar con mensaje de texto cuando alguien sube de nivel')
        .addSubcommand((sub) =>
            sub
                .setName('establecer')
                .setDescription('Define el canal de anuncios (solo texto plano, sin embed)')
                .addChannelOption((opt) =>
                    opt
                        .setName('canal')
                        .setDescription('Canal de texto para los avisos de nivel')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub.setName('quitar').setDescription('Deja de enviar avisos de nivel automáticos')
        )
        .addSubcommand((sub) =>
            sub.setName('ver').setDescription('Muestra si hay canal de anuncios configurado')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    cooldown: 5,
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'Este comando solo se puede usar en un servidor.',
                ephemeral: true
            });
        }

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'establecer') {
            const channel = interaction.options.getChannel('canal', true);
            const me = interaction.guild.members.me;
            const perms = me?.permissionsIn(channel);
            if (!perms?.has(PermissionFlagsBits.SendMessages)) {
                return interaction.reply({
                    embeds: [
                        Embeds.error(
                            'Sin permiso',
                            'Necesito poder enviar mensajes en ese canal.'
                        )
                    ],
                    ephemeral: true
                });
            }

            const cfg = await levelingStore.getLevelingConfig(guildId);
            await levelingStore.setLevelingConfig(guildId, {
                ...cfg,
                levelUpAnnounceChannelId: channel.id,
                updatedAt: new Date().toISOString(),
                updatedBy: interaction.user.id
            });

            return interaction.reply({
                embeds: [
                    Embeds.success(
                        'Canal de niveles',
                        `Los avisos se enviarán en ${channel} como mensaje de texto cuando un usuario suba de nivel (nivel 1 en adelante). El sistema debe tener niveles activos.`
                    )
                ]
            });
        }

        if (sub === 'quitar') {
            const cfg = await levelingStore.getLevelingConfig(guildId);
            await levelingStore.setLevelingConfig(guildId, {
                ...cfg,
                levelUpAnnounceChannelId: '',
                updatedAt: new Date().toISOString(),
                updatedBy: interaction.user.id
            });

            return interaction.reply({
                embeds: [Embeds.warning('Canal de niveles', 'Ya no se enviarán avisos automáticos de subida de nivel.')]
            });
        }

        if (sub === 'ver') {
            const cfg = await levelingStore.getLevelingConfig(guildId);
            const id = String(cfg?.levelUpAnnounceChannelId || '').trim();
            if (!id) {
                return interaction.reply({
                    embeds: [
                        Embeds.info(
                            'Canal de niveles',
                            'No hay canal configurado. Usa `/canal-niveles establecer` para definir uno.'
                        )
                    ],
                    ephemeral: true
                });
            }

            return interaction.reply({
                embeds: [
                    Embeds.info(
                        'Canal de niveles',
                        `Canal actual: <#${id}>\nLos avisos son mensajes de texto cuando alguien sube de nivel.`
                    )
                ],
                ephemeral: true
            });
        }

        return interaction.reply({
            embeds: [Embeds.error('Error', 'Subcomando no reconocido.')],
            ephemeral: true
        });
    }
};
