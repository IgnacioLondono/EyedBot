/**
 * Plantillas de embed para Bienvenida, Despedida y el constructor de Embeds.
 * Cada plantilla define qué espacios (slots) de imagen usa:
 *   - 'avatar':     miniatura con el avatar del usuario (dinámico).
 *   - 'image':      imagen destacada al pie del embed (subida o URL).
 *   - 'thumbnail':  miniatura personalizada (subida o URL).
 */
const { applyWelcomeMediaToEmbed } = require('./welcome-upload-resolve');

const EMBED_TEMPLATES = [
    {
        id: 'classic',
        label: 'Clásica',
        description: 'Título, texto y barra de color lateral. Sin imágenes.',
        slots: []
    },
    {
        id: 'avatar',
        label: 'Avatar',
        description: 'Miniatura con el avatar del usuario en la esquina superior.',
        slots: ['avatar']
    },
    {
        id: 'banner',
        label: 'Banner',
        description: 'Imagen destacada al pie del embed.',
        slots: ['image']
    },
    {
        id: 'avatar-banner',
        label: 'Avatar + Banner',
        description: 'Avatar del usuario como miniatura e imagen destacada al pie.',
        slots: ['avatar', 'image']
    },
    {
        id: 'sidebar',
        label: 'Barra lateral',
        description: 'Miniatura personalizada (logo o emblema) y barra de acento de color.',
        slots: ['thumbnail']
    }
];

const EMBED_TEMPLATE_IDS = EMBED_TEMPLATES.map((tpl) => tpl.id);

function getEmbedTemplate(id) {
    return EMBED_TEMPLATES.find((tpl) => tpl.id === id) || null;
}

function isEmbedTemplateId(id) {
    return EMBED_TEMPLATE_IDS.includes(String(id || ''));
}

function getEmbedTemplateSlots(id) {
    const tpl = getEmbedTemplate(id);
    return tpl ? tpl.slots.slice() : [];
}

/**
 * Aplica una plantilla sobre un EmbedBuilder ya construido (título/descripción/color/pie quedan a cargo del caller).
 * Solo agrega lo que el template y sus valores permitan.
 *
 * @param {import('discord.js').EmbedBuilder} embed
 * @param {{ embedTemplateId?: string, imageUrl?: string, thumbnailUrl?: string }} config
 * @param {{ guild?: import('discord.js').Guild, files?: Array, avatarUrl?: string }} options
 */
async function applyEmbedTemplateToEmbed(embed, config, options = {}) {
    const { guild = null, files = null, avatarUrl = '' } = options || {};
    const slots = getEmbedTemplateSlots(config?.embedTemplateId);
    if (!slots.length || !embed) return false;

    const fileList = Array.isArray(files) ? files : null;
    let applied = false;

    for (const slot of slots) {
        try {
            if (slot === 'avatar' && avatarUrl) {
                embed.setThumbnail(avatarUrl);
                applied = true;
            } else if (slot === 'image' && config?.imageUrl && fileList) {
                if (await applyWelcomeMediaToEmbed(embed, config.imageUrl, fileList, guild, 'image')) applied = true;
            } else if (slot === 'thumbnail' && config?.thumbnailUrl && fileList) {
                if (await applyWelcomeMediaToEmbed(embed, config.thumbnailUrl, fileList, guild, 'thumbnail')) applied = true;
            }
        } catch {
            // un slot que falla no debe romper el resto
        }
    }

    return applied;
}

module.exports = {
    EMBED_TEMPLATES,
    EMBED_TEMPLATE_IDS,
    getEmbedTemplate,
    isEmbedTemplateId,
    getEmbedTemplateSlots,
    applyEmbedTemplateToEmbed
};