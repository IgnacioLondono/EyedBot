const { ChannelType } = require('discord.js');

/** @typedef {{ name: string, type: 'text'|'voice', topic?: string }} ChannelSetupLeaf */

/** @typedef {{ name: string, children: ChannelSetupLeaf[] }} ChannelSetupCategory */

/**
 * Normaliza nombre de canal para la API de Discord (minúsculas, guiones).
 */
function discordChannelSlug(raw) {
    const base = String(raw || 'canal')
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    const slug = base.slice(0, 90);
    return slug || 'canal';
}

/**
 * Plantillas predefinidas: categorías con canales texto / voz.
 */
const TEMPLATES = {
    standard: {
        id: 'standard',
        label: 'Comunidad general',
        description:
            'Estructura típica: información, chat, extras y salas de voz. Los canales ya existentes con el mismo nombre se pueden omitir.',
        categories: /** @type {ChannelSetupCategory[]} */ ([
            {
                name: 'informacion',
                children: [
                    { name: 'reglas', type: 'text', topic: 'Normas del servidor. Léelas antes de participar.' },
                    { name: 'anuncios', type: 'text', topic: 'Anuncios del staff. Mantén las menciones al mínimo.' },
                    { name: 'roles-y-enlaces', type: 'text', topic: 'Roles, enlaces útiles y cómo empezar.' }
                ]
            },
            {
                name: 'comunidad',
                children: [
                    { name: 'general', type: 'text', topic: 'Charla general de la comunidad.' },
                    { name: 'media-y-memes', type: 'text', topic: 'Imágenes, vídeos y memes.' },
                    { name: 'comandos-bot', type: 'text', topic: 'Usa comandos del bot aquí para no saturar #general.' }
                ]
            },
            {
                name: 'voz',
                children: [
                    { name: 'Lobby', type: 'voice' },
                    { name: 'Gaming-1', type: 'voice' },
                    { name: 'Gaming-2', type: 'voice' },
                    { name: 'Musica-o-afk', type: 'voice' }
                ]
            }
        ])
    }
};

function resolveChannelType(leaf) {
    if (leaf.type === 'voice') return ChannelType.GuildVoice;
    return ChannelType.GuildText;
}

function flattenTemplate(template) {
    const rows = [];
    for (const cat of template.categories || []) {
        const cname = discordChannelSlug(cat.name);
        for (const ch of cat.children || []) {
            rows.push({
                categorySlug: cname,
                categoryLabel: cat.name,
                channelSlug: discordChannelSlug(ch.name),
                channelLabel: ch.name,
                type: ch.type === 'voice' ? 'voice' : 'text',
                topic: ch.topic || ''
            });
        }
    }
    return rows;
}

/**
 * Lista filas que ya existirían (misma categoría + canal) si skipExisting está activo.
 */
function listConflicts(guild, templateId) {
    const template = TEMPLATES[templateId];
    if (!template) return { error: 'Plantilla no válida' };

    const rows = flattenTemplate(template);
    const conflicts = [];

    for (const row of rows) {
        const categoryChannel = guild.channels.cache.find(
            (c) => c.type === ChannelType.GuildCategory && discordChannelSlug(c.name) === row.categorySlug
        );
        if (!categoryChannel) continue;

        const existingChild = guild.channels.cache.find(
            (ch) => ch.parentId === categoryChannel.id && discordChannelSlug(ch.name) === row.channelSlug
        );

        if (existingChild) {
            conflicts.push({
                category: row.categoryLabel,
                channel: row.channelLabel,
                type: row.type,
                reason: 'Ya existe en el servidor'
            });
        }
    }

    return { templateId, preview: rows, conflicts };
}

/**
 * Crea categorías y canales según la plantilla.
 * @param {import('discord.js').Guild} guild
 * @param {string} templateId
 * @param {{ skipExisting?: boolean }} options
 */
async function applyTemplate(guild, templateId, options = {}) {
    const skipExisting = options.skipExisting !== false;
    const template = TEMPLATES[templateId];
    if (!template) {
        return { ok: false, error: 'Plantilla no válida', created: [], skipped: [], errors: [] };
    }

    const created = [];
    const skipped = [];
    const errors = [];

    const categoryIdBySlug = new Map();

    for (const cat of template.categories || []) {
        const slug = discordChannelSlug(cat.name);
        let categoryChannel = guild.channels.cache.find(
            (c) => c.type === ChannelType.GuildCategory && discordChannelSlug(c.name) === slug
        );

        if (!categoryChannel) {
            try {
                categoryChannel = await guild.channels.create({
                    name: slug,
                    type: ChannelType.GuildCategory,
                    reason: 'EyedBot: generador de estructura (panel web)'
                });
                created.push({ kind: 'category', id: categoryChannel.id, name: categoryChannel.name });
            } catch (e) {
                errors.push({ kind: 'category', name: slug, message: e.message || String(e) });
                continue;
            }
        } else if (skipExisting) {
            skipped.push({ kind: 'category', id: categoryChannel.id, name: categoryChannel.name });
        }

        categoryIdBySlug.set(slug, categoryChannel.id);

        for (const leaf of cat.children || []) {
            const chSlug = discordChannelSlug(leaf.name);
            const existing = guild.channels.cache.find((ch) => {
                if (ch.parentId !== categoryChannel.id) return false;
                return discordChannelSlug(ch.name) === chSlug;
            });

            if (existing && skipExisting) {
                skipped.push({
                    kind: 'channel',
                    id: existing.id,
                    name: existing.name,
                    type: leaf.type,
                    parentId: categoryChannel.id
                });
                continue;
            }

            try {
                const payload = {
                    name: chSlug,
                    type: resolveChannelType(leaf),
                    parent: categoryChannel.id,
                    reason: 'EyedBot: generador de estructura (panel web)'
                };
                if (leaf.type !== 'voice' && leaf.topic) {
                    payload.topic = String(leaf.topic).slice(0, 1024);
                }

                const ch = await guild.channels.create(payload);
                created.push({
                    kind: 'channel',
                    id: ch.id,
                    name: ch.name,
                    type: leaf.type,
                    parentId: categoryChannel.id
                });
                await new Promise((r) => setTimeout(r, 380));
            } catch (e) {
                errors.push({
                    kind: 'channel',
                    name: chSlug,
                    category: slug,
                    message: e.message || String(e)
                });
            }
        }
    }

    return { ok: errors.length === 0, created, skipped, errors };
}

function listTemplateSummaries() {
    return Object.values(TEMPLATES).map((t) => ({
        id: t.id,
        label: t.label,
        description: t.description,
        preview: flattenTemplate(t)
    }));
}

module.exports = {
    TEMPLATES,
    discordChannelSlug,
    flattenTemplate,
    listConflicts,
    applyTemplate,
    listTemplateSummaries
};
