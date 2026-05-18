const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const Embeds = require('../../utils/embeds');
const confessionStore = require('../../utils/confession-store');

const CONFESSION_COLOR = '#9B59B6';
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 2000;

function normalizeMessage(raw) {
    return String(raw || '')
        .replace(/\u200b/g, '')
        .trim();
}

async function getConfessionChannel(guild, channelId) {
    if (!channelId) return null;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return null;
    return channel;
}

async function runEnviar(interaction) {
    const message = normalizeMessage(interaction.options.getString('mensaje', true));

    if (message.length < MESSAGE_MIN) {
        return interaction.reply({
            embeds: [
                Embeds.error(
                    'Mensaje muy corto',
                    `La confesión debe tener al menos **${MESSAGE_MIN}** caracteres.`
                )
            ],
            flags: 64
        });
    }

    if (message.length > MESSAGE_MAX) {
        return interaction.reply({
            embeds: [
                Embeds.error(
                    'Mensaje muy largo',
                    `La confesión no puede superar **${MESSAGE_MAX}** caracteres.`
                )
            ],
            flags: 64
        });
    }

    const cfg = await confessionStore.getGuildConfig(interaction.guild.id);
    const channel = await getConfessionChannel(interaction.guild, cfg.channelId);

    if (!channel) {
        return interaction.reply({
            embeds: [
                Embeds.warning(
                    'Canal no configurado',
                    'Un administrador debe usar `/confess canal` para elegir dónde se publican las confesiones.'
                )
            ],
            flags: 64
        });
    }

    const me = interaction.guild.members.me;
    const perms = channel.permissionsFor(me);
    if (!perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return interaction.reply({
            embeds: [
                Embeds.error(
                    'Sin permisos',
                    `No puedo enviar confesiones en ${channel}. Revisa permisos del bot en ese canal.`
                )
            ],
            flags: 64
        });
    }

    const confessionId = await confessionStore.takeNextConfessionId(interaction.guild.id);

    const embed = new EmbedBuilder()
        .setColor(CONFESSION_COLOR)
        .setTitle(`Confesión #${confessionId}`)
        .setDescription(message)
        .setFooter({
            text: `Anónima · ${interaction.guild.name}`
        })
        .setTimestamp();

    try {
        await channel.send({ embeds: [embed] });
    } catch {
        return interaction.reply({
            embeds: [Embeds.error('Error', 'No se pudo publicar la confesión. Inténtalo más tarde.')],
            flags: 64
        });
    }

    return interaction.reply({
        embeds: [
            Embeds.success(
                'Confesión enviada',
                `Tu mensaje se publicó de forma anónima en ${channel}.\n\n` +
                    '*Los miembros no verán quién la escribió. El staff puede ver el uso del comando en el registro de auditoría de Discord.*'
            )
        ],
        flags: 64
    });
}

async function runCanal(interaction) {
    const channel = interaction.options.getChannel('canal', true);

    if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
    ) {
        return interaction.reply({
            embeds: [Embeds.error('Canal no válido', 'Elige un canal de texto o de anuncios.')],
            flags: 64
        });
    }

    await confessionStore.setChannelId(interaction.guild.id, channel.id);

    return interaction.reply({
        embeds: [
            Embeds.success(
                'Canal de confesiones',
                `Las confesiones anónimas se publicarán en ${channel}.\n\n` +
                    'Los usuarios pueden enviarlas con `/confess enviar`.'
            )
        ],
        flags: 64
    });
}

async function runQuitar(interaction) {
    await confessionStore.clearChannel(interaction.guild.id);

    return interaction.reply({
        embeds: [
            Embeds.info(
                'Confesiones desactivadas',
                'Se quitó el canal de confesiones. Nadie podrá enviar confesiones hasta que configures uno de nuevo.'
            )
        ],
        flags: 64
    });
}

async function runInfo(interaction) {
    const cfg = await confessionStore.getGuildConfig(interaction.guild.id);
    const channel = await getConfessionChannel(interaction.guild, cfg.channelId);

    if (!channel) {
        return interaction.reply({
            embeds: [
                Embeds.info(
                    'Confesiones',
                    'Este servidor **no** tiene canal de confesiones.\n\n' +
                        'Un administrador puede usar `/confess canal` para activarlo.'
                )
            ],
            flags: 64
        });
    }

    return interaction.reply({
        embeds: [
            Embeds.info(
                'Confesiones',
                `Canal activo: ${channel}\nPróximo número: **#${cfg.nextId}**\n\nUsa \`/confess enviar\` para publicar una confesión anónima.`
            )
        ],
        flags: 64
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('Confesiones anónimas en el servidor')
        .addSubcommand((sub) =>
            sub
                .setName('enviar')
                .setDescription('Publica una confesión anónima')
                .addStringOption((opt) =>
                    opt
                        .setName('mensaje')
                        .setDescription('Texto de tu confesión')
                        .setMinLength(MESSAGE_MIN)
                        .setMaxLength(MESSAGE_MAX)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('canal')
                .setDescription('Define el canal donde se publican las confesiones')
                .addChannelOption((opt) =>
                    opt
                        .setName('canal')
                        .setDescription('Canal de confesiones')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('quitar')
                .setDescription('Desactiva el canal de confesiones')
        )
        .addSubcommand((sub) =>
            sub.setName('info').setDescription('Muestra el canal de confesiones configurado')
        ),
    cooldown: 30,
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'Este comando solo se puede usar en un servidor.',
                flags: 64
            });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'enviar') return runEnviar(interaction);

        if (sub === 'canal' || sub === 'quitar') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    embeds: [
                        Embeds.error(
                            'Sin permiso',
                            'Necesitas el permiso **Gestionar servidor** para configurar confesiones.'
                        )
                    ],
                    flags: 64
                });
            }
            if (sub === 'canal') return runCanal(interaction);
            return runQuitar(interaction);
        }

        if (sub === 'info') return runInfo(interaction);

        return interaction.reply({
            embeds: [Embeds.error('Error', 'Subcomando no reconocido.')],
            flags: 64
        });
    }
};
