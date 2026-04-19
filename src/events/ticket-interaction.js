const {
    ActionRowBuilder,
    ChannelType,
    EmbedBuilder,
    ModalBuilder,
    PermissionsBitField,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const ticketStore = require('../utils/ticket-config-store');

const OPEN_PREFIX = 'ticket_open_';
const MODAL_PREFIX = 'ticket_reason_';
const CLOSE_ID = 'ticket_close';
const CATEGORY_SELECT_PREFIX = 'ticket_cat_';
const COMMON_SELECT_PREFIX = 'ticket_common_';
const CONTINUE_PREFIX = 'ticket_continue_';
const CANCEL_PREFIX = 'ticket_cancel_';
const DRAFT_TTL_MS = 15 * 60 * 1000;

const DEFAULT_CATEGORIES = [
    { value: 'soporte-general', label: 'Soporte general', description: 'Dudas o ayuda general del servidor' },
    { value: 'reportes', label: 'Reportes', description: 'Reportar usuarios, bugs o conductas' },
    { value: 'compras-y-rangos', label: 'Compras y rangos', description: 'Pagos, rangos y beneficios' },
    { value: 'solicitud-ingreso-minecraft', label: 'Solicitud para ingresar al servidor de Minecraft', description: 'Postulacion o solicitud de acceso al servidor Minecraft' },
    { value: 'sugerencias', label: 'Sugerencias', description: 'Ideas para mejorar la comunidad' }
];

const DEFAULT_COMMON_ISSUES = [
    { value: 'permisos', label: 'Problemas de permisos', description: 'No puedo ver o usar un canal/comando' },
    { value: 'sanciones', label: 'Sancion o apelacion', description: 'Mute, kick, ban o apelacion' },
    { value: 'errores-del-bot', label: 'Error del bot', description: 'Comandos que fallan o no responden' },
    { value: 'roles-y-canales', label: 'Roles y canales', description: 'Roles incorrectos o accesos faltantes' },
    { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
];

const ticketDrafts = new Map();

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

function draftKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function toOptionValue(text, fallback) {
    const safe = String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return safe || fallback;
}

function normalizeConfiguredOptions(raw, defaults, prefix) {
    const source = Array.isArray(raw) && raw.length ? raw : defaults;
    const usedValues = new Set();
    const built = [];

    source.slice(0, 25).forEach((entry, index) => {
        const asObject = entry && typeof entry === 'object' && !Array.isArray(entry)
            ? entry
            : { label: String(entry || '').trim() };

        const label = String(asObject.label || asObject.name || '').trim().slice(0, 100);
        if (!label) return;

        let value = toOptionValue(asObject.value || label, `${prefix}-${index + 1}`).slice(0, 100);
        if (!value) value = `${prefix}-${index + 1}`;

        if (usedValues.has(value)) {
            value = `${value}-${index + 1}`.slice(0, 100);
        }
        usedValues.add(value);

        const description = String(asObject.description || '').trim().slice(0, 100);
        built.push({ value, label, description });
    });

    return built.length ? built : defaults;
}

function buildSelectionConfig(cfg) {
    const categories = normalizeConfiguredOptions(cfg?.ticketCategories, DEFAULT_CATEGORIES, 'cat');
    const commonIssues = normalizeConfiguredOptions(cfg?.commonProblems, DEFAULT_COMMON_ISSUES, 'issue');
    return { categories, commonIssues };
}

function cleanupDrafts() {
    const now = Date.now();
    for (const [key, value] of ticketDrafts.entries()) {
        if (!value || now - Number(value.updatedAt || 0) > DRAFT_TTL_MS) {
            ticketDrafts.delete(key);
        }
    }
}

function getDraftForUser(guildId, userId, optionsConfig) {
    cleanupDrafts();
    const key = draftKey(guildId, userId);
    const existing = ticketDrafts.get(key);

    const categoryValues = new Set(optionsConfig.categories.map((item) => item.value));
    const issueValues = new Set(optionsConfig.commonIssues.map((item) => item.value));
    const draft = {
        category: categoryValues.has(existing?.category) ? existing.category : optionsConfig.categories[0].value,
        commonIssue: issueValues.has(existing?.commonIssue) ? existing.commonIssue : optionsConfig.commonIssues[0].value,
        updatedAt: Date.now()
    };

    ticketDrafts.set(key, draft);
    return draft;
}

function clearDraftForUser(guildId, userId) {
    ticketDrafts.delete(draftKey(guildId, userId));
}

function optionLabelByValue(options, value) {
    return options.find((item) => item.value === value)?.label || 'No especificado';
}

function buildSetupContent(optionsConfig, draft) {
    return '\u200b';
}

function buildSelectMenu(customId, placeholder, options, selectedValue) {
    const menu = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .setMinValues(1)
        .setMaxValues(1);

    menu.addOptions(
        options.map((item) => ({
            label: item.label,
            value: item.value,
            description: item.description || undefined,
            default: item.value === selectedValue
        }))
    );

    return menu;
}

function buildSetupComponents(guildId, optionsConfig, draft) {
    const categorySelect = buildSelectMenu(
        `${CATEGORY_SELECT_PREFIX}${guildId}`,
        'Selecciona una categoria',
        optionsConfig.categories,
        draft.category
    );
    const issueSelect = buildSelectMenu(
        `${COMMON_SELECT_PREFIX}${guildId}`,
        'Selecciona un problema frecuente',
        optionsConfig.commonIssues,
        draft.commonIssue
    );
    const continueButton = new ButtonBuilder()
        .setCustomId(`${CONTINUE_PREFIX}${guildId}`)
        .setLabel('Continuar')
        .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
        .setCustomId(`${CANCEL_PREFIX}${guildId}`)
        .setLabel('Cancelar')
        .setStyle(ButtonStyle.Secondary);

    return [
        new ActionRowBuilder().addComponents(categorySelect),
        new ActionRowBuilder().addComponents(issueSelect),
        new ActionRowBuilder().addComponents(cancelButton, continueButton)
    ];
}

async function showTicketPresetSelector(interaction, guildId) {
    const cfg = await resolveConfig(guildId);
    if (!cfg) {
        await sendEphemeral(interaction, 'El sistema de tickets no esta activo.');
        return;
    }

    const optionsConfig = buildSelectionConfig(cfg);
    const draft = getDraftForUser(guildId, interaction.user.id, optionsConfig);

    await interaction.reply({
        content: buildSetupContent(optionsConfig, draft),
        components: buildSetupComponents(guildId, optionsConfig, draft),
        flags: 64
    }).catch(() => null);
}

async function updateTicketPresetSelector(interaction, guildId, updater) {
    const cfg = await resolveConfig(guildId);
    if (!cfg) {
        await sendEphemeral(interaction, 'El sistema de tickets no esta activo.');
        return;
    }

    const optionsConfig = buildSelectionConfig(cfg);
    const draft = getDraftForUser(guildId, interaction.user.id, optionsConfig);

    if (typeof updater === 'function') updater(draft, optionsConfig);
    draft.updatedAt = Date.now();

    await interaction.update({
        content: buildSetupContent(optionsConfig, draft),
        components: buildSetupComponents(guildId, optionsConfig, draft)
    }).catch(() => null);
}

async function showTicketReasonModal(interaction, guildId, preset = {}) {
    const modal = new ModalBuilder()
        .setCustomId(`${MODAL_PREFIX}${guildId}`)
        .setTitle('Motivo del ticket');

    const prefillCategory = String(preset.category || '').trim().slice(0, 100);
    const prefillCommonIssue = String(preset.commonIssue || '').trim().slice(0, 120);

    const categoryInput = new TextInputBuilder()
        .setCustomId('ticket_category_input')
        .setLabel('Categoria de tu solicitud')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(100)
        .setPlaceholder('Ej: Soporte general, Reporte, Compras, Minecraft');

    if (prefillCategory) categoryInput.setValue(prefillCategory);

    const commonIssueInput = new TextInputBuilder()
        .setCustomId('ticket_common_issue_input')
        .setLabel('Problema comun (opcional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(120)
        .setPlaceholder('Ej: Permisos, sancion, error del bot, roles');

    if (prefillCommonIssue) commonIssueInput.setValue(prefillCommonIssue);

    const noMatchIssueInput = new TextInputBuilder()
        .setCustomId('ticket_no_match_issue_input')
        .setLabel('No sale mi problema (opcional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(180)
        .setPlaceholder('Describe aqui tu caso si no aparece en las opciones');

    const reasonInput = new TextInputBuilder()
        .setCustomId('ticket_reason_input')
        .setLabel('Explica brevemente tu solicitud')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(500)
        .setPlaceholder('Ej: Necesito ayuda con permisos en el servidor');

    modal.addComponents(
        new ActionRowBuilder().addComponents(categoryInput),
        new ActionRowBuilder().addComponents(commonIssueInput),
        new ActionRowBuilder().addComponents(noMatchIssueInput),
        new ActionRowBuilder().addComponents(reasonInput)
    );
    await interaction.showModal(modal);
}

async function createTicketChannel(interaction, guildId, reason, details = {}) {
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

    const categoryLabel = String(details?.category || 'Soporte general').trim().slice(0, 80) || 'Soporte general';
    const commonIssueLabel = String(details?.commonIssue || 'No especificado').trim().slice(0, 120) || 'No especificado';
    const noMatchIssueLabel = String(details?.noMatchIssue || 'No especificado').trim().slice(0, 180) || 'No especificado';

    const baseName = toSafeChannelName(interaction.user.username);
    const categorySlug = toSafeChannelName(categoryLabel).slice(0, 24);
    const ticketName = `ticket-${categorySlug}-${baseName}`.slice(0, 95);

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

    const topic = [
        `owner:${interaction.user.id}`,
        `category:${categoryLabel}`,
        `common:${commonIssueLabel}`,
        `no-match:${noMatchIssueLabel}`,
        `reason:${String(reason).replace(/\|/g, '/').slice(0, 450)}`
    ].join(' | ').slice(0, 1000);

    const created = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        topic,
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
        .addFields(
            { name: 'Categoria', value: categoryLabel.slice(0, 1024), inline: true },
            { name: 'Problema comun', value: commonIssueLabel.slice(0, 1024), inline: true },
            { name: 'No sale mi problema', value: noMatchIssueLabel.slice(0, 1024), inline: false }
        )
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

    clearDraftForUser(guildId, interaction.user.id);
    await sendEphemeral(interaction, `Ticket creado: <#${created.id}>`);
}

function shouldOpenDetailModal(commonIssueValue, commonIssueLabel) {
    if (String(commonIssueValue) === 'otro') return true;
    return /no aparece en esta lista/i.test(String(commonIssueLabel || ''));
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

    if (interaction.customId.startsWith(OPEN_PREFIX)) {
        const guildId = interaction.customId.slice(OPEN_PREFIX.length);
        await showTicketPresetSelector(interaction, guildId);
        return true;
    }

    if (interaction.customId.startsWith(CONTINUE_PREFIX)) {
        const guildId = interaction.customId.slice(CONTINUE_PREFIX.length);
        const cfg = await resolveConfig(guildId);
        if (!cfg) {
            await sendEphemeral(interaction, 'El sistema de tickets no esta activo.');
            return true;
        }

        const optionsConfig = buildSelectionConfig(cfg);
        const draft = getDraftForUser(guildId, interaction.user.id, optionsConfig);
        const categoryLabel = optionLabelByValue(optionsConfig.categories, draft.category);
        const commonIssueLabel = optionLabelByValue(optionsConfig.commonIssues, draft.commonIssue);

        if (shouldOpenDetailModal(draft.commonIssue, commonIssueLabel)) {
            await showTicketReasonModal(interaction, guildId, {
                category: categoryLabel,
                commonIssue: commonIssueLabel
            });
            return true;
        }

        await interaction.deferReply({ flags: 64 }).catch(() => null);
        await createTicketChannel(interaction, guildId, commonIssueLabel, {
            category: categoryLabel,
            commonIssue: commonIssueLabel,
            noMatchIssue: 'No aplica'
        });
        return true;
    }

    if (interaction.customId.startsWith(CANCEL_PREFIX)) {
        const guildId = interaction.customId.slice(CANCEL_PREFIX.length);
        clearDraftForUser(guildId, interaction.user.id);
        await interaction.update({
            content: 'Solicitud cancelada. Puedes volver a abrir el formulario cuando quieras.',
            components: []
        }).catch(() => null);
        return true;
    }

    return false;
}

async function handleTicketSelectMenu(interaction) {
    if (!interaction?.isStringSelectMenu()) return false;

    if (interaction.customId.startsWith(CATEGORY_SELECT_PREFIX)) {
        const guildId = interaction.customId.slice(CATEGORY_SELECT_PREFIX.length);
        await updateTicketPresetSelector(interaction, guildId, (draft, optionsConfig) => {
            const selected = interaction.values?.[0] || optionsConfig.categories[0].value;
            const valid = optionsConfig.categories.some((item) => item.value === selected);
            draft.category = valid ? selected : optionsConfig.categories[0].value;
        });
        return true;
    }

    if (interaction.customId.startsWith(COMMON_SELECT_PREFIX)) {
        const guildId = interaction.customId.slice(COMMON_SELECT_PREFIX.length);
        await updateTicketPresetSelector(interaction, guildId, (draft, optionsConfig) => {
            const selected = interaction.values?.[0] || optionsConfig.commonIssues[0].value;
            const valid = optionsConfig.commonIssues.some((item) => item.value === selected);
            draft.commonIssue = valid ? selected : optionsConfig.commonIssues[0].value;
        });
        return true;
    }

    return false;
}

async function handleTicketModal(interaction) {
    if (!interaction?.isModalSubmit()) return false;
    if (!interaction.customId.startsWith(MODAL_PREFIX)) return false;

    await interaction.deferReply({ flags: 64 }).catch(() => null);

    const guildId = interaction.customId.slice(MODAL_PREFIX.length);
    const category = interaction.fields.getTextInputValue('ticket_category_input') || 'Soporte general';
    const commonIssue = interaction.fields.getTextInputValue('ticket_common_issue_input') || 'No especificado';
    const noMatchIssue = interaction.fields.getTextInputValue('ticket_no_match_issue_input') || 'No especificado';
    const reason = interaction.fields.getTextInputValue('ticket_reason_input') || 'Sin motivo';
    await createTicketChannel(interaction, guildId, reason, {
        category,
        commonIssue,
        noMatchIssue
    });
    return true;
}

function ticketButtonCustomIdForGuild(guildId) {
    return `${OPEN_PREFIX}${guildId}`;
}

module.exports = {
    handleTicketButton,
    handleTicketSelectMenu,
    handleTicketModal,
    ticketButtonCustomIdForGuild
};
