const {
    ActionRowBuilder,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    PermissionsBitField,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const ticketStore = require('../utils/ticket-config-store');

const OPEN_PREFIX = 'ticket_open_';
const MODAL_PREFIX = 'ticket_reason_';
const CLOSE_ID = 'ticket_close';

async function sendEphemeral(interaction, content) {
    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content }).catch(() => null);
        return;
    }

    await interaction.reply({ content, flags: 64 }).catch(() => null);
}

function toSafeChannelName(raw) {
    return String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'ticket';
}

async function resolveConfig(guildId) {
    if (!guildId) return null;
    const cfg = await ticketStore.getTicketConfig(guildId);
    if (!cfg || cfg.enabled === false) return null;
    if (!cfg.panelChannelId || !cfg.messageId) return null;
    return cfg;
}

function buildAdminRoleSet(config) {
    const ids = Array.isArray(config?.adminRoleIds) ? config.adminRoleIds : [];
    return new Set(ids.map((id) => String(id)));
}

function memberCanCloseTicket(member, adminRoleSet) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return true;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.some((role) => adminRoleSet.has(String(role.id)));
}

function parseTicketOwner(topic = '') {
    const match = String(topic || '').match(/owner:(\d{10,25})/);
    return match?.[1] || '';
}

async function showTicketReasonModal(interaction, guildId) {
    const modal = new ModalBuilder()
        .setCustomId(`${MODAL_PREFIX}${guildId}`)
        .setTitle('Motivo del ticket');

    const reasonInput = new TextInputBuilder()
        .setCustomId('ticket_reason_input')
        .setLabel('Explica brevemente tu solicitud')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(500)
        .setPlaceholder('Ej: Necesito ayuda con permisos en el servidor');

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
}

async function createTicketChannel(interaction, guildId, reason) {
    const guild = interaction.guild;
    if (!guild || String(guild.id) !== String(guildId)) {
        await sendEphemeral(interaction, 'Este boton no corresponde a este servidor.');
        return;
    }

    const cfg = await resolveConfig(guildId);
    if (!cfg) {
        await sendEphemeral(interaction, 'El sistema de tickets no esta activo.');
        return;
    }

    const me = guild.members.me || await guild.members.fetch(interaction.client.user.id).catch(() => null);
    if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        await sendEphemeral(interaction, 'No tengo permisos para crear canales de ticket.');
        return;
    }

    const existing = guild.channels.cache.find((ch) =>
        ch.type === ChannelType.GuildText && parseTicketOwner(ch.topic) === interaction.user.id
    );

    if (existing) {
        await sendEphemeral(interaction, `Ya tienes un ticket abierto: <#${existing.id}>`);
        return;
    }

    const adminRoleIds = Array.isArray(cfg.adminRoleIds) ? cfg.adminRoleIds : [];
    const validAdminRoles = adminRoleIds
        .map((id) => guild.roles.cache.get(id))
        .filter(Boolean);

    const baseName = toSafeChannelName(interaction.user.username);
    const ticketName = `ticket-${baseName}`.slice(0, 95);

    const permissionOverwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
            id: interaction.user.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.EmbedLinks
            ]
        },
        {
            id: me.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.SendMessages]
        }
    ];

    validAdminRoles.forEach((role) => {
        permissionOverwrites.push({
            id: role.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.ManageChannels
            ]
        });
    });

    const created = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        topic: `owner:${interaction.user.id} | reason:${String(reason).replace(/\|/g, '/').slice(0, 180)}`,
        permissionOverwrites
    }).catch(() => null);

    if (!created) {
        await sendEphemeral(interaction, 'No pude crear el canal del ticket.');
        return;
    }

    const infoEmbed = new EmbedBuilder()
        .setColor((cfg.color || '7c4dff').replace('#', ''))
        .setTitle('Nuevo ticket creado')
        .setDescription(`**Usuario:** <@${interaction.user.id}>\n**Motivo:** ${String(reason).slice(0, 500)}`)
        .setFooter({ text: 'Usa el boton para cerrar cuando termines.' })
        .setTimestamp();

    const closeBtn = new ButtonBuilder()
        .setCustomId(CLOSE_ID)
        .setLabel('Cerrar ticket')
        .setStyle(ButtonStyle.Danger);

    await created.send({
        content: `${validAdminRoles.map((r) => `<@&${r.id}>`).join(' ')} <@${interaction.user.id}>`.trim() || undefined,
        embeds: [infoEmbed],
        components: [new ActionRowBuilder().addComponents(closeBtn)]
    }).catch(() => null);

    await sendEphemeral(interaction, `Ticket creado: <#${created.id}>`);
}

async function closeTicket(interaction) {
    const channel = interaction.channel;
    const guild = interaction.guild;
    if (!guild || !channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: 'Este boton solo funciona dentro de un ticket.', flags: 64 }).catch(() => null);
        return;
    }

    const ownerId = parseTicketOwner(channel.topic);
    const cfg = await ticketStore.getTicketConfig(guild.id);
    const adminRoleSet = buildAdminRoleSet(cfg);

    const member = interaction.member;
    const isOwner = ownerId && String(ownerId) === String(interaction.user.id);
    const canClose = isOwner || memberCanCloseTicket(member, adminRoleSet);

    if (!canClose) {
        await interaction.reply({ content: 'No tienes permisos para cerrar este ticket.', flags: 64 }).catch(() => null);
        return;
    }

    await interaction.reply({ content: 'Cerrando ticket en 3 segundos...', flags: 64 }).catch(() => null);
    setTimeout(async () => {
        await channel.delete(`Ticket cerrado por ${interaction.user.tag}`).catch(() => null);
    }, 3000);
}

async function handleTicketButton(interaction) {
    if (!interaction?.isButton()) return false;

    if (interaction.customId === CLOSE_ID) {
        await closeTicket(interaction);
        return true;
    }

    if (!interaction.customId.startsWith(OPEN_PREFIX)) return false;

    const guildId = interaction.customId.slice(OPEN_PREFIX.length);
    await showTicketReasonModal(interaction, guildId);
    return true;
}

async function handleTicketModal(interaction) {
    if (!interaction?.isModalSubmit()) return false;
    if (!interaction.customId.startsWith(MODAL_PREFIX)) return false;

    await interaction.deferReply({ flags: 64 }).catch(() => null);

    const guildId = interaction.customId.slice(MODAL_PREFIX.length);
    const reason = interaction.fields.getTextInputValue('ticket_reason_input') || 'Sin motivo';
    await createTicketChannel(interaction, guildId, reason);
    return true;
}

function ticketButtonCustomIdForGuild(guildId) {
    return `${OPEN_PREFIX}${guildId}`;
}

module.exports = {
    handleTicketButton,
    handleTicketModal,
    ticketButtonCustomIdForGuild
};
