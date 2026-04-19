const {
    ActionRowBuilder,
    AttachmentBuilder,
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
const db = require('../utils/database');

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
    { value: 'solicitud-ingreso-minecraft', label: 'Minecraft', description: 'Solicitud para ingresar al servidor premium de la comunidad' },
    { value: 'sugerencias', label: 'Sugerencias', description: 'Ideas para mejorar la comunidad' }
];

const DEFAULT_COMMON_ISSUES = [
    { value: 'permisos', label: 'Problemas de permisos', description: 'No puedo ver o usar un canal/comando' },
    { value: 'sanciones', label: 'Sancion o apelacion', description: 'Mute, kick, ban o apelacion' },
    { value: 'errores-del-bot', label: 'Error del bot', description: 'Comandos que fallan o no responden' },
    { value: 'roles-y-canales', label: 'Roles y canales', description: 'Roles incorrectos o accesos faltantes' },
    { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
];

const DEFAULT_COMMON_ISSUES_BY_CATEGORY = {
    'soporte-general': [
        { value: 'permisos', label: 'Problemas de permisos', description: 'No puedo ver o usar un canal/comando' },
        { value: 'errores-del-bot', label: 'Error del bot', description: 'Comandos que fallan o no responden' },
        { value: 'roles-y-canales', label: 'Roles y canales', description: 'Roles incorrectos o accesos faltantes' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    reportes: [
        { value: 'usuario', label: 'Reportar usuario', description: 'Reporte por conducta o incumplimiento' },
        { value: 'bug', label: 'Reportar bug', description: 'Fallos tecnicos detectados' },
        { value: 'apelacion', label: 'Sancion o apelacion', description: 'Revisar mute, kick o ban' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    'solicitud-ingreso-minecraft': [
        { value: 'postulacion', label: 'Solicitud de ingreso', description: 'Aplicar para entrar al servidor' },
        { value: 'whitelist', label: 'Whitelist', description: 'Agregar o corregir acceso de whitelist' },
        { value: 'cuenta', label: 'Cuenta/Nick de Minecraft', description: 'Problemas con nick o cuenta' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ],
    sugerencias: [
        { value: 'mejora-comunidad', label: 'Mejora de comunidad', description: 'Ideas para eventos y convivencia' },
        { value: 'mejora-bot', label: 'Mejora del bot', description: 'Nuevos comandos o ajustes' },
        { value: 'mejora-minecraft', label: 'Mejora de Minecraft', description: 'Ideas para el servidor Minecraft' },
        { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
    ]
};

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

function memberCanCloseTicket(member, closerRoleSet) {
    if (!member) return false;
    if (member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return true;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
    return member.roles.cache.some((role) => closerRoleSet.has(String(role.id)));
}

function parseTicketOwner(topic = '') {
    const match = String(topic || '').match(/owner:(\d{10,25})/);
    return match?.[1] || '';
}

function parseTopicField(topic = '', key = '') {
    const match = String(topic || '').match(new RegExp(`${String(key)}:([^|]+)`));
    return String(match?.[1] || '').trim();
}

function parseTopicRoleIds(topic = '', key = 'staff') {
    const raw = parseTopicField(topic, key);
    if (!raw) return [];
    return raw
        .split(',')
        .map((id) => String(id || '').trim())
        .filter((id) => /^\d{10,25}$/.test(id));
}

function parseMappedRoleIds(input) {
    if (Array.isArray(input)) {
        return input
            .map((id) => String(id || '').trim())
            .filter((id) => /^\d{10,25}$/.test(id));
    }

    if (typeof input === 'string') {
        return input
            .split(',')
            .map((id) => String(id || '').trim())
            .filter((id) => /^\d{10,25}$/.test(id));
    }

    return [];
}

function buildCaseRoleIds(config, details = {}) {
    const map = config?.caseRoleMap && typeof config.caseRoleMap === 'object'
        ? config.caseRoleMap
        : (config?.ticketCaseRoleMap && typeof config.ticketCaseRoleMap === 'object' ? config.ticketCaseRoleMap : {});

    const categoryValue = String(details.categoryValue || '').trim();
    const commonIssueValue = String(details.commonIssueValue || '').trim();

    const mapped = new Set();
    parseMappedRoleIds(map.default).forEach((id) => mapped.add(id));
    parseMappedRoleIds(map[categoryValue]).forEach((id) => mapped.add(id));
    parseMappedRoleIds(map[`common:${commonIssueValue}`]).forEach((id) => mapped.add(id));

    return Array.from(mapped);
}

async function nextCloseReportId(guildId) {
    const key = `ticket_report_counter_${guildId}`;
    const current = Number.parseInt(await db.get(key), 10) || 0;
    const next = current + 1;
    await db.set(key, next);
    const padded = String(next).padStart(5, '0');
    return `TK-${guildId}-${padded}`;
}

function buildTranscriptText(channel, messages = []) {
    const lines = [
        `Ticket channel: #${channel.name} (${channel.id})`,
        `Generated at: ${new Date().toISOString()}`,
        ''
    ];

    messages.forEach((message) => {
        const time = new Date(message.createdTimestamp).toISOString();
        const author = message.author?.tag || message.author?.id || 'unknown';
        const content = String(message.content || '').replace(/\r?\n/g, ' ').trim();
        const attachments = Array.from(message.attachments?.values?.() || [])
            .map((a) => a.url)
            .join(' ');
        const merged = [content, attachments].filter(Boolean).join(' | ').slice(0, 1600);
        lines.push(`[${time}] ${author}: ${merged || '(sin contenido)'}`);
    });

    return lines.join('\n').slice(0, 1900000);
}

async function generateAndSendCloseReport({ interaction, channel, guild, ownerId, closerTag }) {
    const reportId = await nextCloseReportId(guild.id).catch(() => `TK-${guild.id}-${Date.now()}`);

    const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    const messages = fetched ? Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp) : [];
    const participants = Array.from(new Set(messages.map((msg) => msg.author?.id).filter(Boolean)));
    const category = parseTopicField(channel.topic, 'category') || 'No especificado';
    const common = parseTopicField(channel.topic, 'common') || 'No especificado';
    const reason = parseTopicField(channel.topic, 'reason') || 'No especificado';

    const reportData = {
        reportId,
        guildId: guild.id,
        channelId: channel.id,
        channelName: channel.name,
        ownerId: ownerId || '',
        closedById: interaction.user.id,
        closedByTag: closerTag,
        category,
        common,
        reason,
        messagesCount: messages.length,
        participants,
        createdAt: new Date().toISOString()
    };

    await db.set(`ticket_report_${reportId}`, reportData).catch(() => null);

    let dmSent = false;
    if (ownerId) {
        const ownerUser = await interaction.client.users.fetch(ownerId).catch(() => null);
        if (ownerUser) {
            const transcriptText = buildTranscriptText(channel, messages);
            const fileName = `ticket-${channel.id}-${reportId}.txt`;
            const transcriptFile = new AttachmentBuilder(Buffer.from(transcriptText, 'utf8'), { name: fileName });

            const reportEmbed = new EmbedBuilder()
                .setColor('2b90d9')
                .setTitle('Informe de cierre de ticket')
                .setDescription('Tu ticket fue cerrado. Te compartimos un resumen e historial reciente.')
                .addFields(
                    { name: 'ID del informe', value: reportId, inline: true },
                    { name: 'Servidor', value: guild.name.slice(0, 1024), inline: true },
                    { name: 'Canal', value: `#${channel.name}`.slice(0, 1024), inline: true },
                    { name: 'Categoria', value: String(category).slice(0, 1024), inline: true },
                    { name: 'Caso', value: String(common).slice(0, 1024), inline: true },
                    { name: 'Cerrado por', value: closerTag.slice(0, 1024), inline: true }
                )
                .setTimestamp();

            await ownerUser.send({ embeds: [reportEmbed], files: [transcriptFile] }).then(() => {
                dmSent = true;
            }).catch(() => null);
        }
    }

    return { reportId, dmSent };
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

function sanitizeCategories(categories = []) {
    const normalized = [];
    const used = new Set();

    categories.forEach((item) => {
        const rawLabel = String(item?.label || '').trim();
        const rawValue = String(item?.value || '').trim();

        if (rawValue === 'compras-y-rangos' || /compras\s*y\s*rangos/i.test(rawLabel)) return;

        const isMinecraft = rawValue === 'minecraft' || rawValue === 'solicitud-ingreso-minecraft' || /minecraft/i.test(rawLabel);
        const value = isMinecraft ? 'solicitud-ingreso-minecraft' : rawValue;
        const label = isMinecraft ? 'Minecraft' : rawLabel;
        const description = isMinecraft
            ? 'Solicitud para ingresar al servidor premium de la comunidad'
            : String(item?.description || '').trim();

        if (!value || !label || used.has(value)) return;
        used.add(value);
        normalized.push({ value, label, description: description.slice(0, 100) });
    });

    if (!normalized.some((item) => item.value === 'solicitud-ingreso-minecraft')) {
        normalized.push({
            value: 'solicitud-ingreso-minecraft',
            label: 'Minecraft',
            description: 'Solicitud para ingresar al servidor premium de la comunidad'
        });
    }

    return normalized.length ? normalized.slice(0, 25) : DEFAULT_CATEGORIES;
}

function safeGetField(interaction, fieldId, fallback = '') {
    try {
        return interaction.fields.getTextInputValue(fieldId) || fallback;
    } catch {
        return fallback;
    }
}

function buildSelectionConfig(cfg) {
    const categories = sanitizeCategories(normalizeConfiguredOptions(cfg?.ticketCategories, DEFAULT_CATEGORIES, 'cat'));
    const commonIssues = normalizeConfiguredOptions(cfg?.commonProblems, DEFAULT_COMMON_ISSUES, 'issue');
    return { categories, commonIssues };
}

function getCommonIssuesForCategory(optionsConfig, categoryValue) {
    const mapped = DEFAULT_COMMON_ISSUES_BY_CATEGORY[String(categoryValue || '')];
    if (Array.isArray(mapped) && mapped.length) return mapped;
    return optionsConfig.commonIssues;
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

    const draft = {
        category: categoryValues.has(existing?.category) ? existing.category : optionsConfig.categories[0].value,
        commonIssue: '',
        updatedAt: Date.now()
    };

    const categoryIssues = getCommonIssuesForCategory(optionsConfig, draft.category);
    const issueValues = new Set(categoryIssues.map((item) => item.value));
    draft.commonIssue = issueValues.has(existing?.commonIssue) ? existing.commonIssue : categoryIssues[0].value;

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
    const categoryIssues = getCommonIssuesForCategory(optionsConfig, draft.category);

    const categorySelect = buildSelectMenu(
        `${CATEGORY_SELECT_PREFIX}${guildId}`,
        'Selecciona una categoria',
        optionsConfig.categories,
        draft.category
    );
    const issueSelect = buildSelectMenu(
        `${COMMON_SELECT_PREFIX}${guildId}`,
        'Selecciona un problema frecuente',
        categoryIssues,
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
    if (String(preset.categoryValue || '') === 'solicitud-ingreso-minecraft') {
        const modal = new ModalBuilder()
            .setCustomId(`${MODAL_PREFIX}${guildId}`)
            .setTitle('Ingreso a Minecraft');

        const whyInput = new TextInputBuilder()
            .setCustomId('ticket_mc_why_input_v2')
            .setLabel('Por que quieres ingresar?')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(500)
            .setPlaceholder('Cuentanos por que quieres entrar al servidor premium.');

        const nickInput = new TextInputBuilder()
            .setCustomId('ticket_mc_nick_input_v2')
            .setLabel('Nick de Minecraft')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(32)
            .setPlaceholder('Ej: Steve123');

        modal.addComponents(
            new ActionRowBuilder().addComponents(whyInput),
            new ActionRowBuilder().addComponents(nickInput)
        );
        await interaction.showModal(modal);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`${MODAL_PREFIX}${guildId}`)
        .setTitle('Cuentanos tu caso');

    const selectedCategory = String(preset.category || 'Soporte general').trim();
    const detailPlaceholder = `Categoria: ${selectedCategory}`.slice(0, 90);

    const reasonInput = new TextInputBuilder()
        .setCustomId('ticket_reason_input')
        .setLabel('Describe tu problema y tu caso')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(500)
        .setPlaceholder(`${detailPlaceholder}. Incluye contexto y lo que necesitas.`);

    modal.addComponents(
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
    const caseRoleIds = buildCaseRoleIds(cfg, details);
    const validCaseRoles = caseRoleIds
        .filter((id) => !adminRoleIds.includes(id))
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

    validCaseRoles.forEach((role) => {
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

    const closerRoleIds = Array.from(new Set([
        ...validAdminRoles.map((role) => String(role.id)),
        ...validCaseRoles.map((role) => String(role.id))
    ]));

    const topic = [
        `owner:${interaction.user.id}`,
        `category:${categoryLabel}`,
        `common:${commonIssueLabel}`,
        `staff:${closerRoleIds.join(',')}`,
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
        content: `${[...validAdminRoles, ...validCaseRoles].map((r) => `<@&${r.id}>`).join(' ')} <@${interaction.user.id}>`.trim() || undefined,
        embeds: [infoEmbed],
        components: [new ActionRowBuilder().addComponents(closeBtn)]
    }).catch(() => null);

    clearDraftForUser(guildId, interaction.user.id);
    await sendEphemeral(interaction, `Ticket creado: <#${created.id}>`);
}

function shouldOpenDetailModal(commonIssueValue, commonIssueLabel, categoryValue) {
    if (String(categoryValue || '') === 'solicitud-ingreso-minecraft') return true;
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
    const staffRoleSet = new Set(parseTopicRoleIds(channel.topic, 'staff'));
    const closerRoleSet = new Set([...adminRoleSet, ...staffRoleSet]);

    const member = interaction.member;
    const canClose = memberCanCloseTicket(member, closerRoleSet);

    if (!canClose) {
        await interaction.reply({ content: 'Solo el staff asignado y admins pueden cerrar este ticket.', flags: 64 }).catch(() => null);
        return;
    }

    await interaction.deferReply({ flags: 64 }).catch(() => null);
    const report = await generateAndSendCloseReport({
        interaction,
        channel,
        guild,
        ownerId,
        closerTag: interaction.user.tag
    }).catch(() => ({ reportId: `TK-${guild.id}-${Date.now()}`, dmSent: false }));

    await interaction.editReply({
        content: `Ticket cerrado. Informe: ${report.reportId}. ${report.dmSent ? 'Se envio un resumen por DM al usuario.' : 'No se pudo enviar DM al usuario (DMs cerrados o bloqueo).'}`
    }).catch(() => null);

    await channel.delete(`Ticket cerrado por ${interaction.user.tag} | Informe ${report.reportId}`).catch(() => null);
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
        const categoryIssues = getCommonIssuesForCategory(optionsConfig, draft.category);
        const commonIssueLabel = optionLabelByValue(categoryIssues, draft.commonIssue);

        if (shouldOpenDetailModal(draft.commonIssue, commonIssueLabel, draft.category)) {
            await showTicketReasonModal(interaction, guildId, {
                category: categoryLabel,
                commonIssue: commonIssueLabel,
                categoryValue: draft.category
            });
            return true;
        }

        await interaction.deferReply({ flags: 64 }).catch(() => null);
        await createTicketChannel(interaction, guildId, commonIssueLabel, {
            category: categoryLabel,
            commonIssue: commonIssueLabel,
            categoryValue: draft.category,
            commonIssueValue: draft.commonIssue,
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

            const categoryIssues = getCommonIssuesForCategory(optionsConfig, draft.category);
            draft.commonIssue = categoryIssues[0].value;
        });
        return true;
    }

    if (interaction.customId.startsWith(COMMON_SELECT_PREFIX)) {
        const guildId = interaction.customId.slice(COMMON_SELECT_PREFIX.length);
        await updateTicketPresetSelector(interaction, guildId, (draft, optionsConfig) => {
            const categoryIssues = getCommonIssuesForCategory(optionsConfig, draft.category);
            const selected = interaction.values?.[0] || categoryIssues[0].value;
            const valid = categoryIssues.some((item) => item.value === selected);
            draft.commonIssue = valid ? selected : categoryIssues[0].value;
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
    const reason = safeGetField(interaction, 'ticket_reason_input', 'Sin motivo');
    const mcWhy = safeGetField(interaction, 'ticket_mc_why_input_v2', '');
    const mcNick = safeGetField(interaction, 'ticket_mc_nick_input_v2', '');

    let category = 'Soporte general';
    let commonIssue = 'Mi caso no aparece en esta lista';
    let selectedDraft = null;

    const cfg = await resolveConfig(guildId);
    if (cfg) {
        const optionsConfig = buildSelectionConfig(cfg);
        selectedDraft = getDraftForUser(guildId, interaction.user.id, optionsConfig);
        const categoryIssues = getCommonIssuesForCategory(optionsConfig, selectedDraft.category);
        category = optionLabelByValue(optionsConfig.categories, selectedDraft.category);
        commonIssue = optionLabelByValue(categoryIssues, selectedDraft.commonIssue);
    }

    const finalReason = mcWhy
        ? [`Motivo ingreso: ${mcWhy}`, `Nick Minecraft: ${mcNick || 'No especificado'}`]
            .filter(Boolean)
            .join('\n')
        : reason;

    await createTicketChannel(interaction, guildId, finalReason, {
        category,
        commonIssue,
        categoryValue: selectedDraft?.category,
        commonIssueValue: selectedDraft?.commonIssue,
        noMatchIssue: mcWhy || reason
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
