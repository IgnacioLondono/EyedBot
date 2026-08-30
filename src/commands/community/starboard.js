const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const starboardStore = require('../../utils/starboard-store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('starboard')
        .setDescription('Tablón de estrellas premium — destaca los mejores mensajes.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('activar')
                .setDescription('Activa el starboard en un canal')
                .addChannelOption((opt) =>
                    opt
                        .setName('canal')
                        .setDescription('Canal donde se publican las estrellas')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('umbral')
                        .setDescription('Reacciones necesarias (por defecto 3)')
                        .setMinValue(1)
                        .setMaxValue(50)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('emoji')
                        .setDescription('Emoji contador (por defecto ⭐)')
                )
        )
        .addSubcommand((sub) => sub.setName('desactivar').setDescription('Desactiva el starboard'))
        .addSubcommand((sub) => sub.setName('estado').setDescription('Ver configuración actual')),
    cooldown: 5,
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: 'Solo en servidores.', flags: 64 });
        }

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const current = await starboardStore.getConfig(guildId);

        if (sub === 'desactivar') {
            await starboardStore.setConfig(guildId, { ...current, enabled: false });
            return interaction.reply({ content: '⭐ Starboard desactivado.', flags: 64 });
        }

        if (sub === 'estado') {
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('⭐ Starboard')
                .addFields(
                    { name: 'Estado', value: current.enabled ? '✅ Activo' : '❌ Inactivo', inline: true },
                    { name: 'Canal', value: current.channelId ? `<#${current.channelId}>` : '—', inline: true },
                    { name: 'Umbral', value: String(current.threshold || 3), inline: true },
                    { name: 'Emoji', value: current.emoji || '⭐', inline: true }
                );
            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        const channel = interaction.options.getChannel('canal');
        const threshold = interaction.options.getInteger('umbral') || 3;
        const emoji = interaction.options.getString('emoji') || '⭐';

        await starboardStore.setConfig(guildId, {
            ...current,
            enabled: true,
            channelId: channel.id,
            threshold,
            emoji
        });

        return interaction.reply({
            content: `⭐ Starboard activo en ${channel}. Umbral: **${threshold}** ${emoji}`,
            flags: 64
        });
    }
};
