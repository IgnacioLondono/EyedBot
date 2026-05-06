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
const ACCEPT_PREFIX = 'ticket_accept_';
const CATEGORY_SELECT_PREFIX = 'ticket_cat_';
const COMMON_SELECT_PREFIX = 'ticket_common_';
const CONTINUE_PREFIX = 'ticket_continue_';
const CANCEL_PREFIX = 'ticket_cancel_';
const PANEL_CATEGORY_SELECT_PREFIX = 'ticket_panel_cat_';
const PANEL_COMMON_SELECT_PREFIX = 'ticket_panel_common_';
const PANEL_CONTINUE_PREFIX = 'ticket_panel_continue_';
const PANEL_CANCEL_PREFIX = 'ticket_panel_cancel_';
const DRAFT_TTL_MS = 15 * 60 * 1000;

const DEFAULT_CATEGORIES = [
    { value: 'soporte-general', label: 'Soporte general', description: 'Dudas o ayuda general del servidor' },
    { value: 'reportes', label: 'Reportes', description: 'Reportar usuarios, bugs o conductas' },
    { value: 'solicitud-ingreso-minecraft', label: 'Minecraft Server', description: 'Ayuda con el servidor, soporte tecnico y consultas generales' },
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
const pendingRequestsMemory = new Map();
const pendingUsersMemory = new Map();

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

function buildCaseRoleSet(config, details = {}) {
    const adminRoleSet = buildAdminRoleSet(config);
    const caseRoleIds = buildCaseRoleIds(config, details);
    return new Set([...adminRoleSet, ...caseRoleIds.map((id) => String(id))]);
}

function makePendingRequestId() {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${Date.now().toString(36)}${rand}`;
}

function pendingKey(guildId, requestId) {
    return `ticket_pending_${guildId}_${requestId}`;
}

function pendingUserKey(guildId, userId) {
    return `ticket_pending_user_${guildId}_${userId}`;
}

async function getPendingRequest(guildId, requestId) {
    const key = pendingKey(guildId, requestId);
    const fromDb = await db.get(key).catch(() => null);
    if (fromDb && typeof fromDb === 'object') {
        pendingRequestsMemory.set(key, fromDb);
        pendingUsersMemory.set(pendingUserKey(guildId, fromDb.requesterId), requestId);
        return fromDb;
    }

    return pendingRequestsMemory.get(key) || null;
}

async function getPendingUserRequestId(guildId, userId) {
    const key = pendingUserKey(guildId, userId);
    const fromDb = await db.get(key).catch(() => null);
    if (fromDb) {
        pendingUsersMemory.set(key, String(fromDb));
        return String(fromDb);
    }
    return pendingUsersMemory.get(key) || null;
}

async function savePendingRequest(guildId, requestId, pendingRecord) {
    const key = pendingKey(guildId, requestId);
    const userKey = pendingUserKey(guildId, pendingRecord.requesterId);

    pendingRequestsMemory.set(key, pendingRecord);
    pendingUsersMemory.set(userKey, requestId);

    await db.set(key, pendingRecord).catch(() => null);
    await db.set(userKey, requestId).catch(() => null);
}

async function clearPendingRequest(guildId, requestId, requesterId) {
    const key = pendingKey(guildId, requestId);
    const userKey = pendingUserKey(guildId, requesterId);

    pendingRequestsMemory.delete(key);
    pendingUsersMemory.delete(userKey);

    await db.delete(key).catch(() => null);
    await db.delete(userKey).catch(() => null);
}

function parseAcceptCustomId(customId = '') {
    if (!String(customId).startsWith(ACCEPT_PREFIX)) return null;
    const payload = String(customId).slice(ACCEPT_PREFIX.length);
    const splitIndex = payload.indexOf('_');
    if (splitIndex <= 0) return null;
    const guildId = payload.slice(0, splitIndex);
    const requestId = payload.slice(splitIndex + 1);
    if (!guildId || !requestId) return null;
    return { guildId, requestId };
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

function buildTranscriptEntries(messages = []) {
    return messages.map((message) => {
        const attachments = Array.from(message.attachments?.values?.() || []).map((a) => ({
            name: a.name || 'attachment',
            url: a.url || '',
            contentType: a.contentType || ''
        }));
        return {
            id: message.id,
            createdAt: new Date(message.createdTimestamp).toISOString(),
            authorId: message.author?.id || '',
            authorTag: message.author?.tag || message.author?.username || 'desconocido',
            authorBot: !!message.author?.bot,
            content: String(message.content || ''),
            attachments
        };
    });
}

async function generateAndSendCloseReport({ interaction, channel, guild, ownerId, closerTag }) {
    const reportId = await nextCloseReportId(guild.id).catch(() => `TK-${guild.id}-${Date.now()}`);

    const fetched = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    const messages = fetched ? Array.from(fetched.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp) : [];
    const participants = Array.from(new Set(messages.map((msg) => msg.author?.id).filter(Boolean)));
    const category = parseTopicField(channel.topic, 'category') || 'No especificado';
    const common = parseTopicField(channel.topic, 'common') || 'No especificado';
    const reason = parseTopicField(channel.topic, 'reason') || 'No especificado';

    const transcriptText = buildTranscriptText(channel, messages);
    const transcriptEntries = buildTranscriptEntries(messages);
    const fileName = `ticket-${channel.id}-${reportId}.txt`;

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
        createdAt: new Date().toISOString(),
        transcriptFileName: fileName,
        transcriptText: transcriptText.slice(0, 900000),
        transcriptEntries
    };

    try {
        await db.set(`ticket_report_${reportId}`, reportData);
    } catch (err) {
        console.warn(`⚠️ Error guardando informe ${reportId} en la base de datos:`, err?.message || err);
    }

    // Verificacion rápida: intentar leer lo guardado
    try {
        const verify = await db.get(`ticket_report_${reportId}`);
        if (!verify) {
            console.warn(`⚠️ Verificacion fallida: informe ${reportId} no se encontro despues de guardar (guild ${guild.id})`);
        }
    } catch (err) {
        console.warn(`⚠️ Error comprobando informe ${reportId}:`, err?.message || err);
    }

    const cfg = await resolveConfig(guild.id).catch(() => null);
    const receiptHistoryChannelId = String(cfg?.receiptHistoryChannelId || '').trim();
    const receiptHistoryChannel = receiptHistoryChannelId
        ? (guild.channels.cache.get(receiptHistoryChannelId) || await guild.channels.fetch(receiptHistoryChannelId).catch(() => null))
        : null;

    const createTranscriptFile = () => new AttachmentBuilder(
        Buffer.from(transcriptText, 'utf8'),
        { name: fileName }
    );

    const buildReportEmbed = () => new EmbedBuilder()
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

    let dmSent = false;
    if (ownerId) {
        const ownerUser = await interaction.client.users.fetch(ownerId).catch(() => null);
        if (ownerUser) {
            await ownerUser.send({ embeds: [buildReportEmbed()], files: [createTranscriptFile()] }).then(() => {
                dmSent = true;
            }).catch(() => null);
        }
    }

    if (receiptHistoryChannel?.isTextBased?.()) {
        await receiptHistoryChannel.send({
            embeds: [buildReportEmbed()],
            files: [createTranscriptFile()]
        }).catch(() => null);
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
        const label = isMinecraft ? 'Minecraft Server' : rawLabel;
        const description = isMinecraft
            ? 'Ayuda con el servidor, soporte tecnico y consultas generales'
            : String(item?.description || '').trim();

        if (!value || !label || used.has(value)) return;
        used.add(value);
        normalized.push({ value, label, description: description.slice(0, 100) });
    });

    if (!normalized.some((item) => item.value === 'solicitud-ingreso-minecraft')) {
        normalized.push({
            value: 'solicitud-ingreso-minecraft',
            label: 'Minecraft Server',
            description: 'Ayuda con el servidor, soporte tecnico y consultas generales'
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

function buildTicketPanelComponents(guildId, cfg, presetDraft = null) {
    const optionsConfig = buildSelectionConfig(cfg || {});
    const firstCategoryValue = optionsConfig.categories[0]?.value || 'soporte-general';
    const category = (presetDraft && optionsConfig.categories.some((item) => item.value === presetDraft.category))
        ? presetDraft.category
        : firstCategoryValue;

    const categoryIssues = getCommonIssuesForCategory(optionsConfig, category);
    const commonIssue = (presetDraft && categoryIssues.some((item) => item.value === presetDraft.commonIssue))
        ? presetDraft.commonIssue
        : (categoryIssues[0]?.value || 'otro');

    const categorySelect = buildSelectMenu(
        `${PANEL_CATEGORY_SELECT_PREFIX}${guildId}`,
        'Selecciona una categoria',
        optionsConfig.categories,
        category
    );
    const issueSelect = buildSelectMenu(
        `${PANEL_COMMON_SELECT_PREFIX}${guildId}`,
        'Selecciona un problema frecuente',
        categoryIssues,
        commonIssue
    );
    const continueButton = new ButtonBuilder()
        .setCustomId(`${PANEL_CONTINUE_PREFIX}${guildId}`)
        .setLabel('Continuar')
        .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
        .setCustomId(`${PANEL_CANCEL_PREFIX}${guildId}`)
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

async function submitPendingTicketRequest(interaction, guildId, payload = {}) {
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

    const existing = guild.channels.cache.find((ch) =>
        ch.type === ChannelType.GuildText && parseTicketOwner(ch.topic) === interaction.user.id
    );
    if (existing) {
        await sendEphemeral(interaction, `Ya tienes un ticket abierto: <#${existing.id}>`);
        return;
    }

    const userPendingId = await getPendingUserRequestId(guildId, interaction.user.id);
    if (userPendingId) {
        await sendEphemeral(interaction, 'Ya tienes una solicitud pendiente. Espera a que un moderador la atienda.');
        return;
    }

    const requestChannelId = String(cfg.requestChannelId || cfg.panelChannelId || '').trim();
    const requestChannel = guild.channels.cache.get(requestChannelId) || await guild.channels.fetch(requestChannelId).catch(() => null);
    if (!requestChannel || !requestChannel.isTextBased()) {
        await sendEphemeral(interaction, 'No se encontro el canal de tickets para dejar la solicitud pendiente.');
        return;
    }

    const requestId = makePendingRequestId();
    const acceptId = `${ACCEPT_PREFIX}${guildId}_${requestId}`;

    const pendingEmbed = new EmbedBuilder()
        .setColor('f5a623')
        .setTitle('Solicitud de ticket pendiente')
        .setDescription('Un moderador debe aceptar esta solicitud para crear el canal del ticket.')
        .addFields(
            { name: 'Solicitante', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Categoria', value: String(payload.category || 'No especificado').slice(0, 1024), inline: true },
            { name: 'Caso', value: String(payload.commonIssue || 'No especificado').slice(0, 1024), inline: true },
            { name: 'Detalle', value: String(payload.reason || 'Sin detalles').slice(0, 1024), inline: false },
            { name: 'Estado', value: 'Pendiente de aceptación', inline: true },
            { name: 'ID solicitud', value: requestId.slice(0, 1024), inline: true }
        )
        .setTimestamp();

    const acceptBtn = new ButtonBuilder()
        .setCustomId(acceptId)
        .setLabel('Aceptar solicitud')
        .setStyle(ButtonStyle.Success);

    const pendingMessage = await requestChannel.send({
        content: `<@${interaction.user.id}>`,
        embeds: [pendingEmbed],
        components: [new ActionRowBuilder().addComponents(acceptBtn)]
    }).catch(() => null);

    if (!pendingMessage) {
        await sendEphemeral(interaction, 'No se pudo registrar la solicitud pendiente.');
        return;
    }

    const pendingRecord = {
        requestId,
        guildId,
        requesterId: interaction.user.id,
        requesterTag: interaction.user.tag,
        requesterUsername: interaction.user.username,
        category: String(payload.category || 'Soporte general'),
        commonIssue: String(payload.commonIssue || 'No especificado'),
        categoryValue: String(payload.categoryValue || ''),
        commonIssueValue: String(payload.commonIssueValue || ''),
        noMatchIssue: String(payload.noMatchIssue || 'No aplica'),
        reason: String(payload.reason || 'Sin motivo'),
        messageId: pendingMessage.id,
        channelId: pendingMessage.channelId,
        createdAt: new Date().toISOString()
    };

    await savePendingRequest(guildId, requestId, pendingRecord);

    const userPendingEmbed = new EmbedBuilder()
        .setColor('f5a623')
        .setTitle('Solicitud enviada')
        .setDescription('Tu ticket quedo en estado pendiente. Un moderador revisara y aceptara la petición.')
        .addFields(
            { name: 'Categoria', value: String(payload.category || 'No especificado').slice(0, 1024), inline: true },
            { name: 'Caso', value: String(payload.commonIssue || 'No especificado').slice(0, 1024), inline: true },
            { name: 'Estado', value: 'Pendiente de aceptación', inline: true },
            { name: 'ID solicitud', value: requestId.slice(0, 1024), inline: true }
        )
        .setTimestamp();

    await interaction.editReply({
        content: '\u200b',
        embeds: [userPendingEmbed],
        components: []
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
    const modalCustomId = `${MODAL_PREFIX}${guildId}_${Date.now()}`;

    if (String(preset.mode || '') === 'minecraft-application') {
        const modal = new ModalBuilder()
            .setCustomId(modalCustomId)
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
        .setCustomId(modalCustomId)
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

async function createTicketChannel(interaction, guildId, reason, details = {}, options = {}) {
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

    const ownerUserId = String(options.ownerUserId || interaction.user.id);
    const ownerUsername = String(options.ownerUsername || interaction.user.username || 'usuario');

    const existing = guild.channels.cache.find((ch) =>
        ch.type === ChannelType.GuildText && parseTicketOwner(ch.topic) === ownerUserId
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

    const baseName = toSafeChannelName(ownerUsername);
    const categorySlug = toSafeChannelName(categoryLabel).slice(0, 24);
    const ticketName = `ticket-${categorySlug}-${baseName}`.slice(0, 95);

    const permissionOverwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
            id: ownerUserId,
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
        `owner:${ownerUserId}`,
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
        .setAuthor({
            name: `${ownerUsername} abrió un ticket`,
            iconURL: options.ownerAvatarURL || interaction.user.displayAvatarURL({ size: 64 })
        })
        .setThumbnail(options.ownerAvatarURL || interaction.user.displayAvatarURL({ size: 128 }))
        .setTitle('Nuevo ticket abierto')
        .setDescription('Se registró una nueva solicitud. El staff revisará la información del ticket.')
        .addFields(
            { name: 'Usuario', value: `<@${ownerUserId}>`, inline: true },
            { name: 'Referencia', value: `#${created.id}`, inline: true },
            { name: 'Categoria', value: categoryLabel.slice(0, 1024), inline: true },
            { name: 'Caso', value: commonIssueLabel.slice(0, 1024), inline: true },
            { name: 'Contexto / Motivo', value: String(reason).slice(0, 1024) || 'Sin detalles', inline: false }
        )
        .setFooter({ text: 'Usa el boton de abajo para cerrar el ticket cuando termines.' })
        .setTimestamp();

    const closeBtn = new ButtonBuilder()
        .setCustomId(CLOSE_ID)
        .setLabel('Cerrar ticket')
        .setStyle(ButtonStyle.Danger);

    await created.send({
        content: `${[...validAdminRoles, ...validCaseRoles].map((r) => `<@&${r.id}>`).join(' ')} <@${ownerUserId}>`.trim() || undefined,
        embeds: [infoEmbed],
        components: [new ActionRowBuilder().addComponents(closeBtn)]
    }).catch(() => null);

    clearDraftForUser(guildId, ownerUserId);
    await interaction.editReply({
        content: `Ticket creado correctamente. Accede aqui: <#${created.id}>`,
        components: []
    }).catch(() => null);

    setTimeout(() => {
        interaction.deleteReply().catch(() => null);
    }, 60000);

    return created;
}

function shouldOpenDetailModal(commonIssueValue, commonIssueLabel, categoryValue) {
    if (String(commonIssueValue) === 'otro') return true;
    return /no aparece en esta lista/i.test(String(commonIssueLabel || ''));
}

function shouldOpenMinecraftApplication(commonIssueValue) {
    return String(commonIssueValue || '') === 'postulacion';
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

    if (interaction.customId.startsWith(ACCEPT_PREFIX)) {
        const parsed = parseAcceptCustomId(interaction.customId);
        if (!parsed) {
            await interaction.reply({ content: 'Solicitud invalida.', flags: 64 }).catch(() => null);
            return true;
        }

        const { guildId, requestId } = parsed;
        if (String(interaction.guildId) !== String(guildId)) {
            await interaction.reply({ content: 'Esta solicitud no corresponde a este servidor.', flags: 64 }).catch(() => null);
            return true;
        }

        const pending = await getPendingRequest(guildId, requestId);
        if (!pending) {
            await interaction.reply({ content: 'Esta solicitud ya fue gestionada o no existe.', flags: 64 }).catch(() => null);
            return true;
        }

        const cfg = await resolveConfig(guildId);
        if (!cfg) {
            await interaction.reply({ content: 'El sistema de tickets no esta activo.', flags: 64 }).catch(() => null);
            return true;
        }

        const closerRoleSet = buildCaseRoleSet(cfg, {
            categoryValue: pending.categoryValue,
            commonIssueValue: pending.commonIssueValue
        });

        if (!memberCanCloseTicket(interaction.member, closerRoleSet)) {
            await interaction.reply({ content: 'No tienes permisos para aceptar esta solicitud.', flags: 64 }).catch(() => null);
            return true;
        }

        await interaction.deferReply({ flags: 64 }).catch(() => null);

        const requesterUser = await interaction.client.users.fetch(pending.requesterId).catch(() => null);
        const created = await createTicketChannel(
            interaction,
            guildId,
            pending.reason,
            {
                category: pending.category,
                commonIssue: pending.commonIssue,
                categoryValue: pending.categoryValue,
                commonIssueValue: pending.commonIssueValue,
                noMatchIssue: pending.noMatchIssue
            },
            {
                ownerUserId: pending.requesterId,
                ownerUsername: pending.requesterUsername || requesterUser?.username,
                ownerAvatarURL: requesterUser?.displayAvatarURL?.({ size: 128 })
            }
        );

        if (created) {
            const acceptedEmbed = new EmbedBuilder()
                .setColor('43b581')
                .setTitle('Solicitud aceptada')
                .setDescription(`Esta solicitud sera gestionada por <@${interaction.user.id}>.`)
                .addFields(
                    { name: 'Solicitante', value: `<@${pending.requesterId}>`, inline: true },
                    { name: 'Canal creado', value: `<#${created.id}>`, inline: true },
                    { name: 'ID solicitud', value: requestId.slice(0, 1024), inline: true }
                )
                .setTimestamp();

            await interaction.message.edit({
                embeds: [acceptedEmbed],
                components: []
            }).catch(() => null);

            const approvedForUserEmbed = new EmbedBuilder()
                .setColor('43b581')
                .setTitle('Ticket aprobado')
                .setDescription('Tu solicitud fue aprobada y ya tienes un canal de ticket activo. Este aviso es privado para ti.')
                .addFields(
                    { name: 'Canal de ticket', value: `<#${created.id}>`, inline: true },
                    { name: 'Moderador', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'ID solicitud', value: requestId.slice(0, 1024), inline: true }
                )
                .setTimestamp();

            if (requesterUser) {
                await requesterUser.send({ embeds: [approvedForUserEmbed] }).catch(() => null);
            }

            await clearPendingRequest(guildId, requestId, pending.requesterId);

            if (requesterUser) {
                await requesterUser.send(`Tu solicitud fue aceptada por ${interaction.user.tag}. Canal del ticket: <#${created.id}>`).catch(() => null);
            }
        }

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

        if (String(draft.category) === 'solicitud-ingreso-minecraft') {
            if (shouldOpenMinecraftApplication(draft.commonIssue)) {
                await showTicketReasonModal(interaction, guildId, {
                    mode: 'minecraft-application'
                });
                return true;
            }

            await showTicketReasonModal(interaction, guildId, {
                category: categoryLabel,
                commonIssue: commonIssueLabel,
                categoryValue: draft.category
            });
            return true;
        }

        if (shouldOpenDetailModal(draft.commonIssue, commonIssueLabel, draft.category)) {
            await showTicketReasonModal(interaction, guildId, {
                category: categoryLabel,
                commonIssue: commonIssueLabel,
                categoryValue: draft.category
            });
            return true;
        }

        await interaction.deferReply({ flags: 64 }).catch(() => null);
        await submitPendingTicketRequest(interaction, guildId, {
            category: categoryLabel,
            commonIssue: commonIssueLabel,
            categoryValue: draft.category,
            commonIssueValue: draft.commonIssue,
            noMatchIssue: 'No aplica',
            reason: commonIssueLabel
        });
        return true;
    }

    if (interaction.customId.startsWith(PANEL_CONTINUE_PREFIX)) {
        const guildId = interaction.customId.slice(PANEL_CONTINUE_PREFIX.length);
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

        if (String(draft.category) === 'solicitud-ingreso-minecraft' && shouldOpenMinecraftApplication(draft.commonIssue)) {
            await showTicketReasonModal(interaction, guildId, { mode: 'minecraft-application' });
            return true;
        }

        if (shouldOpenDetailModal(draft.commonIssue, commonIssueLabel, draft.category)) {
            await showTicketReasonModal(interaction, guildId, {
                category: categoryLabel,
                commonIssue: commonIssueLabel,
                categoryValue: draft.category
            });
            return true;
        }

        await interaction.deferReply({ flags: 64 }).catch(() => null);
        await submitPendingTicketRequest(interaction, guildId, {
            category: categoryLabel,
            commonIssue: commonIssueLabel,
            categoryValue: draft.category,
            commonIssueValue: draft.commonIssue,
            noMatchIssue: 'No aplica',
            reason: commonIssueLabel
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

    if (interaction.customId.startsWith(PANEL_CANCEL_PREFIX)) {
        const guildId = interaction.customId.slice(PANEL_CANCEL_PREFIX.length);
        clearDraftForUser(guildId, interaction.user.id);
        await interaction.deferUpdate().catch(() => null);
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

    if (interaction.customId.startsWith(PANEL_CATEGORY_SELECT_PREFIX)) {
        const guildId = interaction.customId.slice(PANEL_CATEGORY_SELECT_PREFIX.length);
        const cfg = await resolveConfig(guildId);
        if (!cfg) {
            await sendEphemeral(interaction, 'El sistema de tickets no esta activo.');
            return true;
        }

        const optionsConfig = buildSelectionConfig(cfg);
        const draft = getDraftForUser(guildId, interaction.user.id, optionsConfig);
        const selected = interaction.values?.[0] || optionsConfig.categories[0].value;
        const valid = optionsConfig.categories.some((item) => item.value === selected);
        draft.category = valid ? selected : optionsConfig.categories[0].value;
        const categoryIssues = getCommonIssuesForCategory(optionsConfig, draft.category);
        draft.commonIssue = categoryIssues[0].value;
        draft.updatedAt = Date.now();

        await interaction.reply({
            content: buildSetupContent(optionsConfig, draft),
            components: buildSetupComponents(guildId, optionsConfig, draft),
            flags: 64
        }).catch(() => null);
        return true;
    }

    if (interaction.customId.startsWith(PANEL_COMMON_SELECT_PREFIX)) {
        const guildId = interaction.customId.slice(PANEL_COMMON_SELECT_PREFIX.length);
        const cfg = await resolveConfig(guildId);
        if (!cfg) {
            await sendEphemeral(interaction, 'El sistema de tickets no esta activo.');
            return true;
        }

        const optionsConfig = buildSelectionConfig(cfg);
        const draft = getDraftForUser(guildId, interaction.user.id, optionsConfig);
        const categoryIssues = getCommonIssuesForCategory(optionsConfig, draft.category);
        const selected = interaction.values?.[0] || categoryIssues[0].value;
        const valid = categoryIssues.some((item) => item.value === selected);
        draft.commonIssue = valid ? selected : categoryIssues[0].value;
        draft.updatedAt = Date.now();

        await interaction.reply({
            content: buildSetupContent(optionsConfig, draft),
            components: buildSetupComponents(guildId, optionsConfig, draft),
            flags: 64
        }).catch(() => null);
        return true;
    }

    return false;
}

async function handleTicketModal(interaction) {
    if (!interaction?.isModalSubmit()) return false;
    if (!interaction.customId.startsWith(MODAL_PREFIX)) return false;

    await interaction.deferReply({ flags: 64 }).catch(() => null);

    const modalPayload = interaction.customId.slice(MODAL_PREFIX.length);
    const guildId = modalPayload.split('_')[0];
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

    await submitPendingTicketRequest(interaction, guildId, {
        category,
        commonIssue,
        categoryValue: selectedDraft?.category,
        commonIssueValue: selectedDraft?.commonIssue,
        noMatchIssue: mcWhy || reason,
        reason: finalReason
    });
    return true;
}

function ticketButtonCustomIdForGuild(guildId) {
    return `${OPEN_PREFIX}${guildId}`;
}

// ===== HELPERS EXPUESTOS PARA LA WEB =====

async function acceptPendingFromWeb(botClient, guildId, requestId, acceptedByUserId) {
    if (!botClient) {
        return { ok: false, code: 'BOT_OFFLINE', error: 'Bot no disponible' };
    }

    const guild = botClient.guilds.cache.get(String(guildId));
    if (!guild) {
        return { ok: false, code: 'GUILD_NOT_FOUND', error: 'Servidor no encontrado' };
    }

    const pending = await getPendingRequest(guildId, requestId);
    if (!pending || typeof pending !== 'object') {
        return { ok: false, code: 'PENDING_NOT_FOUND', error: 'La solicitud ya fue atendida o expiro' };
    }

    const cfg = await ticketStore.getTicketConfig(guildId);
    if (!cfg) {
        return { ok: false, code: 'CONFIG_MISSING', error: 'El sistema de tickets no esta configurado' };
    }

    const me = guild.members.me || await guild.members.fetch(botClient.user.id).catch(() => null);
    if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        return { ok: false, code: 'BOT_NO_PERMS', error: 'El bot no tiene permisos para crear canales' };
    }

    const ownerUserId = String(pending.requesterId || '');
    const ownerUsername = String(pending.requesterUsername || pending.requesterTag || 'usuario');

    if (!ownerUserId) {
        await clearPendingRequest(guildId, requestId, ownerUserId).catch(() => null);
        return { ok: false, code: 'PENDING_CORRUPT', error: 'La solicitud no tiene usuario asociado' };
    }

    const existing = guild.channels.cache.find((ch) =>
        ch.type === ChannelType.GuildText && parseTicketOwner(ch.topic) === ownerUserId
    );

    if (existing) {
        await clearPendingRequest(guildId, requestId, ownerUserId).catch(() => null);
        return {
            ok: false,
            code: 'ALREADY_OPEN',
            error: `El usuario ya tiene un ticket abierto: #${existing.name}`,
            channelId: existing.id
        };
    }

    const details = {
        category: String(pending.category || 'Soporte general'),
        commonIssue: String(pending.commonIssue || 'No especificado'),
        categoryValue: String(pending.categoryValue || ''),
        commonIssueValue: String(pending.commonIssueValue || ''),
        noMatchIssue: String(pending.noMatchIssue || 'No especificado')
    };

    const reason = String(pending.reason || 'Sin motivo');

    const adminRoleIds = Array.isArray(cfg.adminRoleIds) ? cfg.adminRoleIds : [];
    const validAdminRoles = adminRoleIds
        .map((id) => guild.roles.cache.get(id))
        .filter(Boolean);
    const caseRoleIds = buildCaseRoleIds(cfg, details);
    const validCaseRoles = caseRoleIds
        .filter((id) => !adminRoleIds.includes(id))
        .map((id) => guild.roles.cache.get(id))
        .filter(Boolean);

    const categoryLabel = details.category.slice(0, 80);
    const commonIssueLabel = details.commonIssue.slice(0, 120);
    const noMatchIssueLabel = details.noMatchIssue.slice(0, 180);

    const baseName = toSafeChannelName(ownerUsername);
    const categorySlug = toSafeChannelName(categoryLabel).slice(0, 24);
    const ticketName = `ticket-${categorySlug}-${baseName}`.slice(0, 95);

    const permissionOverwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
        },
        {
            id: ownerUserId,
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
        `owner:${ownerUserId}`,
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
        return { ok: false, code: 'CHANNEL_CREATE_FAILED', error: 'No pude crear el canal del ticket' };
    }

    const ownerMember = await guild.members.fetch(ownerUserId).catch(() => null);
    const acceptorUser = acceptedByUserId ? await botClient.users.fetch(acceptedByUserId).catch(() => null) : null;
    const ownerAvatarURL = ownerMember?.user?.displayAvatarURL({ size: 128 }) || null;

    const infoEmbed = new EmbedBuilder()
        .setColor((cfg.color || '7c4dff').replace('#', ''))
        .setAuthor({
            name: `${ownerUsername} abrio un ticket`,
            iconURL: ownerAvatarURL || undefined
        })
        .setTitle('Nuevo ticket abierto')
        .setDescription('Se registro una nueva solicitud. El staff revisara la informacion del ticket.')
        .addFields(
            { name: 'Usuario', value: `<@${ownerUserId}>`, inline: true },
            { name: 'Referencia', value: `#${created.id}`, inline: true },
            { name: 'Categoria', value: categoryLabel.slice(0, 1024), inline: true },
            { name: 'Caso', value: commonIssueLabel.slice(0, 1024), inline: true },
            { name: 'Contexto / Motivo', value: String(reason).slice(0, 1024) || 'Sin detalles', inline: false },
            { name: 'Aceptado por', value: acceptorUser ? `<@${acceptorUser.id}> (web)` : 'Web panel', inline: false }
        )
        .setFooter({ text: 'Usa el boton de abajo para cerrar el ticket cuando termines.' })
        .setTimestamp();

    if (ownerAvatarURL) infoEmbed.setThumbnail(ownerAvatarURL);

    const closeBtn = new ButtonBuilder()
        .setCustomId(CLOSE_ID)
        .setLabel('Cerrar ticket')
        .setStyle(ButtonStyle.Danger);

    await created.send({
        content: `${[...validAdminRoles, ...validCaseRoles].map((r) => `<@&${r.id}>`).join(' ')} <@${ownerUserId}>`.trim() || undefined,
        embeds: [infoEmbed],
        components: [new ActionRowBuilder().addComponents(closeBtn)]
    }).catch(() => null);

    // Intentar editar / borrar el mensaje pendiente si existe
    if (pending.channelId && pending.messageId) {
        const pendingChannel = guild.channels.cache.get(pending.channelId) || await guild.channels.fetch(pending.channelId).catch(() => null);
        if (pendingChannel && pendingChannel.isTextBased && pendingChannel.isTextBased()) {
            const pendingMsg = await pendingChannel.messages.fetch(pending.messageId).catch(() => null);
            if (pendingMsg) {
                await pendingMsg.edit({
                    content: `Solicitud aceptada desde la web. Canal: <#${created.id}>`,
                    components: []
                }).catch(() => null);
            }
        }
    }

    clearDraftForUser(guildId, ownerUserId);
    await clearPendingRequest(guildId, requestId, ownerUserId).catch(() => null);

    // DM de confirmacion al usuario
    if (ownerMember) {
        await ownerMember.send({
            content: `Tu solicitud de ticket fue aceptada. Accede aqui: <#${created.id}>`
        }).catch(() => null);
    }

    return {
        ok: true,
        channelId: created.id,
        channelName: created.name,
        ownerId: ownerUserId
    };
}

async function listPendingRequests(guildId) {
    const safeGuildId = String(guildId || '');
    if (!safeGuildId) return [];

    try {
        const prefix = `ticket_pending_${safeGuildId}_`;
        const rows = await db.query(
            'SELECT `key`, `value` FROM key_value_store WHERE `key` LIKE ?',
            [`${prefix}%`]
        );

        const out = [];
        for (const row of rows || []) {
            const key = String(row.key || '');
            if (!key.startsWith(prefix)) continue;
            // Skip pending_user index entries
            if (key.startsWith(`ticket_pending_user_${safeGuildId}_`)) continue;
            try {
                const parsed = JSON.parse(row.value);
                if (parsed && typeof parsed === 'object' && parsed.requesterId) {
                    out.push(parsed);
                }
            } catch {
                // ignorar
            }
        }

        // De mas reciente a mas antiguo
        out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return out;
    } catch (error) {
        console.error('Error listando pendientes de tickets:', error.message);
        return [];
    }
}

async function listTicketReports(guildId, limit = 50) {
    const safeGuildId = String(guildId || '');
    if (!safeGuildId) return [];

    const lim = Math.max(1, Math.min(500, Number(limit) || 50));
    /** Las claves de informe son `ticket_report_${reportId}` con reportId tipo TK-{guildId}-00001 (no mezclar con ticket_report_counter_…). */
    const keyLike = `ticket_report_TK-${safeGuildId}-%`;

    try {
        const rows = await db.query(
            'SELECT `value` FROM key_value_store WHERE `key` LIKE ? ORDER BY updated_at DESC LIMIT ?',
            [keyLike, lim]
        );

        const out = [];
        for (const row of rows || []) {
            try {
                const raw = row?.value;
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (parsed && typeof parsed === 'object' && String(parsed.guildId) === safeGuildId) {
                    out.push(parsed);
                }
            } catch {
                // ignorar
            }
        }

        out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return out;
    } catch (error) {
        console.error('Error listando reports de tickets:', error.message);
        return [];
    }
}

// Fallback amplio: intenta buscar claves con distintos formatos si no se encontraron informes
async function listTicketReportsWithFallback(guildId, limit = 50) {
    const primary = await listTicketReports(guildId, limit).catch(() => []);
    if (primary && primary.length) return primary;

    // Intentar patron mas amplio: ticket_report_%{guildId}%
    try {
        const safeGuildId = String(guildId || '');
        const lim = Math.max(1, Math.min(500, Number(limit) || 50));
        const altLike = `ticket_report_%${safeGuildId}%`;
        const altRows = await db.query(
            'SELECT `value` FROM key_value_store WHERE `key` LIKE ? ORDER BY updated_at DESC LIMIT ?',
            [altLike, lim]
        ).catch(() => []);

        const out = [];
        for (const row of altRows || []) {
            try {
                const raw = row?.value;
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                if (parsed && typeof parsed === 'object' && String(parsed.guildId) === safeGuildId) {
                    out.push(parsed);
                }
            } catch (e) {
                // ignorar parse errors
            }
        }

        if (out.length) {
            out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
            console.warn(`⚠️ Se recuperaron informes de tickets con un patron alternativo para guild ${guildId}: encontrados ${out.length}`);
            return out;
        }
    } catch (err) {
        console.warn('⚠️ Fallback listTicketReports fallo:', err?.message || err);
    }

    return [];
}

async function getTicketReport(guildId, reportId) {
    const safeGuildId = String(guildId || '');
    const safeReportId = String(reportId || '');
    if (!safeGuildId || !safeReportId) return null;

    try {
        const data = await db.get(`ticket_report_${safeReportId}`);
        if (!data || typeof data !== 'object') return null;
        if (String(data.guildId) !== safeGuildId) return null;
        return data;
    } catch (error) {
        console.error('Error obteniendo report:', error.message);
        return null;
    }
}

function listActiveTicketChannels(guild) {
    if (!guild) return [];
    const channels = [];
    guild.channels.cache.forEach((ch) => {
        if (ch.type !== ChannelType.GuildText) return;
        const topic = String(ch.topic || '');
        const ownerId = parseTicketOwner(topic);
        if (!ownerId) return;
        channels.push({
            channelId: ch.id,
            channelName: ch.name,
            ownerId,
            category: parseTopicField(topic, 'category') || 'Sin categoria',
            commonIssue: parseTopicField(topic, 'common') || '',
            reason: parseTopicField(topic, 'reason') || '',
            claimedBy: parseTopicField(topic, 'claimed') || '',
            createdAt: new Date(Number(ch.createdTimestamp || Date.now())).toISOString()
        });
    });

    channels.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return channels;
}

async function claimTicketFromWeb(botClient, guildId, channelId, claimerUserId) {
    if (!botClient) return { ok: false, code: 'BOT_OFFLINE', error: 'Bot no disponible' };

    const guild = botClient.guilds.cache.get(String(guildId));
    if (!guild) return { ok: false, code: 'GUILD_NOT_FOUND', error: 'Servidor no encontrado' };

    const channel = guild.channels.cache.get(String(channelId)) || await guild.channels.fetch(String(channelId)).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
        return { ok: false, code: 'CHANNEL_NOT_FOUND', error: 'Canal no encontrado' };
    }

    const topic = String(channel.topic || '');
    const ownerId = parseTicketOwner(topic);
    if (!ownerId) {
        return { ok: false, code: 'NOT_A_TICKET', error: 'El canal no parece un ticket' };
    }

    const currentClaim = parseTopicField(topic, 'claimed');
    const newClaim = String(claimerUserId || '');

    // Remover campo claimed: existente y agregar el nuevo
    let newTopic = topic.replace(/\s*\|\s*claimed:[^|]*/i, '').trim();

    if (newClaim) {
        // Agregar al final si es un nuevo claim o cambio de claim
        newTopic = `${newTopic} | claimed:${newClaim}`.slice(0, 1000);
    }

    await channel.setTopic(newTopic).catch(() => null);

    // Anuncio en el canal
    const claimerUser = await botClient.users.fetch(newClaim).catch(() => null);
    if (newClaim && claimerUser) {
        const embed = new EmbedBuilder()
            .setColor('7c4dff')
            .setDescription(`🛎️ **<@${newClaim}> ha reclamado este ticket desde la web.** Se encargara de la atencion.`)
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => null);
    } else if (!newClaim && currentClaim) {
        const embed = new EmbedBuilder()
            .setColor('f59e0b')
            .setDescription(`🔓 El ticket ha sido liberado. Cualquier staff puede tomarlo.`)
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => null);
    }

    return {
        ok: true,
        channelId: channel.id,
        claimedBy: newClaim || ''
    };
}

// =====================================================================
// Chat bidireccional ticket <-> web
// =====================================================================

// Nombre del webhook usado para enviar mensajes desde la web con el avatar y
// nombre del staff autenticado.
const WEB_RELAY_WEBHOOK_NAME = 'EyedBot Web Relay';

function mapDiscordMessageToPayload(message) {
    if (!message) return null;
    const attachments = Array.from(message.attachments?.values?.() || []).map((a) => ({
        id: a.id,
        name: a.name || 'attachment',
        url: a.url || '',
        contentType: a.contentType || '',
        size: Number(a.size || 0)
    }));

    const author = message.author || {};
    const avatarURL = typeof author.displayAvatarURL === 'function'
        ? author.displayAvatarURL({ size: 128, extension: 'png' })
        : null;

    return {
        id: message.id,
        createdAt: new Date(Number(message.createdTimestamp || Date.now())).toISOString(),
        editedAt: message.editedTimestamp ? new Date(Number(message.editedTimestamp)).toISOString() : null,
        content: String(message.content || ''),
        authorId: author.id || '',
        authorTag: author.tag || author.username || 'desconocido',
        authorDisplayName: author.globalName || author.username || 'desconocido',
        authorAvatarURL: avatarURL,
        authorBot: !!author.bot,
        webhookId: message.webhookId || null,
        attachments,
        embeds: Array.isArray(message.embeds)
            ? message.embeds.slice(0, 5).map((embed) => ({
                title: embed.title || '',
                description: embed.description || '',
                color: embed.color || null,
                url: embed.url || '',
                fields: Array.isArray(embed.fields)
                    ? embed.fields.slice(0, 10).map((f) => ({ name: f.name, value: f.value, inline: !!f.inline }))
                    : []
            }))
            : []
    };
}

async function listTicketChannelMessages(botClient, guildId, channelId, { limit = 60, after = null } = {}) {
    if (!botClient) return { ok: false, code: 'BOT_OFFLINE', error: 'Bot no disponible' };

    const guild = botClient.guilds.cache.get(String(guildId));
    if (!guild) return { ok: false, code: 'GUILD_NOT_FOUND', error: 'Servidor no encontrado' };

    const channel = guild.channels.cache.get(String(channelId))
        || await guild.channels.fetch(String(channelId)).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
        return { ok: false, code: 'CHANNEL_NOT_FOUND', error: 'Canal no encontrado' };
    }

    const topic = String(channel.topic || '');
    const ownerId = parseTicketOwner(topic);
    if (!ownerId) {
        return { ok: false, code: 'NOT_A_TICKET', error: 'El canal no parece un ticket' };
    }

    const fetchOptions = { limit: Math.max(1, Math.min(100, Number(limit) || 60)) };
    if (after) fetchOptions.after = String(after);

    const fetched = await channel.messages.fetch(fetchOptions).catch(() => null);
    if (!fetched) return { ok: false, code: 'FETCH_FAILED', error: 'No se pudieron cargar los mensajes' };

    const messages = Array.from(fetched.values())
        .sort((a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0))
        .map(mapDiscordMessageToPayload)
        .filter(Boolean);

    return {
        ok: true,
        channelId: channel.id,
        channelName: channel.name,
        ownerId,
        category: parseTopicField(topic, 'category') || '',
        commonIssue: parseTopicField(topic, 'common') || '',
        claimedBy: parseTopicField(topic, 'claimed') || '',
        messages
    };
}

async function getOrCreateWebRelayWebhook(channel) {
    try {
        const webhooks = await channel.fetchWebhooks().catch(() => null);
        if (webhooks) {
            const existing = webhooks.find((w) => w.name === WEB_RELAY_WEBHOOK_NAME && w.token);
            if (existing) return existing;
        }
        const created = await channel.createWebhook({
            name: WEB_RELAY_WEBHOOK_NAME,
            reason: 'Webhook para mensajes enviados desde el dashboard web'
        }).catch(() => null);
        return created || null;
    } catch {
        return null;
    }
}

function sanitizeWebhookUsername(rawName, fallback = 'Staff web') {
    const name = String(rawName || '').trim() || fallback;
    const cleaned = name.replace(/discord/gi, 'd1scord').slice(0, 80);
    return cleaned || fallback;
}

async function sendWebMessageToTicket(botClient, guildId, channelId, sender, rawContent) {
    if (!botClient) return { ok: false, code: 'BOT_OFFLINE', error: 'Bot no disponible' };

    const content = String(rawContent || '').trim();
    if (!content) return { ok: false, code: 'EMPTY_CONTENT', error: 'El mensaje no puede estar vacio' };
    if (content.length > 1800) return { ok: false, code: 'TOO_LONG', error: 'El mensaje es demasiado largo' };

    const guild = botClient.guilds.cache.get(String(guildId));
    if (!guild) return { ok: false, code: 'GUILD_NOT_FOUND', error: 'Servidor no encontrado' };

    const channel = guild.channels.cache.get(String(channelId))
        || await guild.channels.fetch(String(channelId)).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
        return { ok: false, code: 'CHANNEL_NOT_FOUND', error: 'Canal no encontrado' };
    }

    const topic = String(channel.topic || '');
    const ownerId = parseTicketOwner(topic);
    if (!ownerId) {
        return { ok: false, code: 'NOT_A_TICKET', error: 'El canal no parece un ticket' };
    }

    const safeContent = content
        .replace(/@everyone/gi, '@\u200beveryone')
        .replace(/@here/gi, '@\u200bhere');

    const webhook = await getOrCreateWebRelayWebhook(channel);

    if (webhook) {
        const username = sanitizeWebhookUsername(
            sender?.displayName || sender?.tag || sender?.username,
            'Staff web'
        );
        try {
            const sent = await webhook.send({
                content: safeContent,
                username,
                avatarURL: sender?.avatarURL || undefined,
                allowedMentions: { parse: ['users', 'roles'] }
            });
            return {
                ok: true,
                via: 'webhook',
                message: mapDiscordMessageToPayload(sent)
            };
        } catch (err) {
            // Si falla el webhook caemos al fallback
            console.warn('Webhook send fallo, usando bot como fallback:', err.message);
        }
    }

    // Fallback: el bot envia un embed con la identidad del staff
    try {
        const senderTag = String(sender?.displayName || sender?.tag || 'Staff web');
        const embed = new EmbedBuilder()
            .setColor('7c4dff')
            .setAuthor({
                name: `${senderTag} (via web)`,
                iconURL: sender?.avatarURL || undefined
            })
            .setDescription(safeContent)
            .setTimestamp();

        const sent = await channel.send({
            embeds: [embed],
            allowedMentions: { parse: ['users', 'roles'] }
        });

        return {
            ok: true,
            via: 'bot-embed',
            message: mapDiscordMessageToPayload(sent)
        };
    } catch (err) {
        console.error('Error enviando mensaje a ticket desde web:', err);
        return { ok: false, code: 'SEND_FAILED', error: 'No se pudo enviar el mensaje' };
    }
}

module.exports = {
    handleTicketButton,
    handleTicketSelectMenu,
    handleTicketModal,
    ticketButtonCustomIdForGuild,
    buildTicketPanelComponents,
    // Helpers web
    acceptPendingFromWeb,
    claimTicketFromWeb,
    listPendingRequests,
    listTicketReports,
    listTicketReportsWithFallback,
    getTicketReport,
    listActiveTicketChannels,
    listTicketChannelMessages,
    sendWebMessageToTicket,
    parseTicketOwner,
    parseTopicField
};
