const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const {
    addStreamSource,
    removeStreamSource,
    listStreamSources,
    buildSourceUrl,
    cleanUsername
} = require('../../utils/stream-alert-sources');

const PLATFORM_LABELS = {
    twitch: 'Twitch',
    youtube: 'YouTube',
    kick: 'Kick',
    rumble: 'Rumble',
    tiktok: 'TikTok',
    custom: 'Custom'
};

const PLATFORM_CHOICES = [
    { name: 'Twitch', value: 'twitch' },
    { name: 'YouTube', value: 'youtube' },
    { name: 'Kick', value: 'kick' },
    { name: 'Rumble', value: 'rumble' },
    { name: 'TikTok', value: 'tiktok' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('streamer')
        .setDescription('Gestiona alertas de directos (Twitch, YouTube, Kick, Rumble, TikTok).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) =>
            sub
                .setName('añadir')
                .setDescription('Añade un streamer a las alertas')
                .addStringOption((opt) =>
                    opt
                        .setName('plataforma')
                        .setDescription('Plataforma del streamer')
                        .setRequired(true)
                        .addChoices(...PLATFORM_CHOICES)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('usuario')
                        .setDescription('Nombre de usuario o URL del canal')
                        .setRequired(true)
                )
                .addChannelOption((opt) =>
                    opt
                        .setName('canal')
                        .setDescription('Canal donde publicar alertas (si no está configurado)')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('quitar')
                .setDescription('Quita un streamer de las alertas')
                .addStringOption((opt) =>
                    opt
                        .setName('plataforma')
                        .setDescription('Plataforma del streamer')
                        .addChoices(...PLATFORM_CHOICES)
                )
                .addStringOption((opt) =>
                    opt
                        .setName('usuario')
                        .setDescription('Nombre de usuario o URL del canal')
                )
        )
        .addSubcommand((sub) => sub.setName('lista').setDescription('Lista los streamers configurados')),
    cooldown: 5,
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({ content: 'Solo en servidores.', flags: 64 });
        }

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (sub === 'lista') {
            const { config: alertConfig, sources } = await listStreamSources(guildId);
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('📡 Streamers en alertas')
                .addFields(
                    { name: 'Estado', value: alertConfig.enabled ? '✅ Activo' : '❌ Inactivo', inline: true },
                    { name: 'Canal', value: alertConfig.channelId ? `<#${alertConfig.channelId}>` : '—', inline: true },
                    { name: 'Fuentes', value: String(sources.length), inline: true }
                );

            if (!sources.length) {
                embed.setDescription('No hay streamers configurados. Usa `/streamer añadir` o el panel web.');
            } else {
                const lines = sources.map((source, index) => {
                    const label = PLATFORM_LABELS[source.platform] || source.platform;
                    const status = source.enabled ? '🟢' : '⏸️';
                    return `${status} **${index + 1}.** ${label} · \`${source.name}\` — ${source.url || 'sin URL'}`;
                });
                embed.setDescription(lines.join('\n').slice(0, 4000));
            }

            return interaction.reply({ embeds: [embed], flags: 64 });
        }

        if (sub === 'añadir') {
            const platform = interaction.options.getString('plataforma', true);
            const username = interaction.options.getString('usuario', true);
            const channel = interaction.options.getChannel('canal');

            try {
                const { source } = await addStreamSource(guildId, {
                    platform,
                    username,
                    channelId: channel?.id,
                    updatedBy: interaction.user.id
                });

                const label = PLATFORM_LABELS[platform] || platform;
                const clean = cleanUsername(username);
                const url = source.url || buildSourceUrl(platform, clean);

                return interaction.reply({
                    content: `✅ **${label}** · \`${source.name || clean}\` añadido.\n${url}`,
                    flags: 64
                });
            } catch (error) {
                return interaction.reply({
                    content: `❌ ${error.message || 'No se pudo añadir el streamer.'}`,
                    flags: 64
                });
            }
        }

        const platform = interaction.options.getString('plataforma');
        const username = interaction.options.getString('usuario');

        if (!platform && !username) {
            return interaction.reply({
                content: 'Indica plataforma y/o usuario para quitar un streamer.',
                flags: 64
            });
        }

        try {
            await removeStreamSource(guildId, {
                platform,
                username,
                updatedBy: interaction.user.id
            });

            return interaction.reply({
                content: `✅ Streamer eliminado de las alertas.`,
                flags: 64
            });
        } catch (error) {
            return interaction.reply({
                content: `❌ ${error.message || 'No se pudo quitar el streamer.'}`,
                flags: 64
            });
        }
    }
};
