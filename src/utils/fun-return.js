const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../config');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const MENTIONS_FILE = path.join(DATA_DIR, 'fun-mentions.json');
const GIF_CACHE_TTL_MS = Math.max(60_000, Number.parseInt(process.env.FUN_GIF_CACHE_TTL_MS || '900000', 10));
const TRANSLATION_CACHE_TTL_MS = Math.max(60_000, Number.parseInt(process.env.FUN_TRANSLATION_CACHE_TTL_MS || '900000', 10));

let mentionsCache = null;
let writeQueue = Promise.resolve();
const gifCache = new Map();
const gifInflight = new Map();
const translationCache = new Map();
const translationInflight = new Map();

const ACTIONS = {
    hug: { title: '🤗 Abrazo', verb: 'abrazó', tenorQuery: 'anime hug' },
    kiss: { title: '💋 Beso', verb: 'besó', tenorQuery: 'anime kiss' },
    pat: { title: '👋 Caricia', verb: 'acarició', tenorQuery: 'anime pat' },
    slap: { title: '👋 Golpe', verb: 'golpeó', tenorQuery: 'anime slap' },
    punch: { title: '👊 Puñetazo', verb: 'golpeó', tenorQuery: 'anime punch' },
    wink: { title: '😉 Guiño', verb: 'guiñó', tenorQuery: 'anime wink' }
};

function getActionMeta(action) {
    return ACTIONS[action] || null;
}

function mentionKeys(action, guildId, userId) {
    const scope = guildId || 'global';
    return {
        total: `fun:mentions:total:${scope}:${userId}`,
        action: `fun:mentions:${action}:${scope}:${userId}`
    };
}

async function ensureMentionsStoreLoaded() {
    if (mentionsCache) return mentionsCache;

    try {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
    } catch {
        // ignore
    }

    try {
        const raw = await fs.promises.readFile(MENTIONS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        mentionsCache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        mentionsCache = {};
    }

    return mentionsCache;
}

async function persistMentionsStore() {
    const snapshot = JSON.stringify(mentionsCache || {}, null, 2);

    // Serialize writes to avoid corrupted file on burst interactions.
    writeQueue = writeQueue.then(async () => {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
        await fs.promises.writeFile(MENTIONS_FILE, snapshot, 'utf8');
    }).catch(() => {});

    return writeQueue;
}

async function incrementMentionCount(action, guildId, userId) {
    await ensureMentionsStoreLoaded();
    const keys = mentionKeys(action, guildId, userId);

    const totalRaw = mentionsCache[keys.total] || 0;
    const actionRaw = mentionsCache[keys.action] || 0;

    const total = Number.parseInt(totalRaw, 10) + 1;
    const actionCount = Number.parseInt(actionRaw, 10) + 1;

    mentionsCache[keys.total] = total;
    mentionsCache[keys.action] = actionCount;
    await persistMentionsStore();

    return { total, actionCount };
}

const FOOTER_TEXT_MAX = 2048;

function setInteractionFooter(embed, requesterTag, source = null, sourceLabel = '🎬 Anime:') {
    const base = `Solicitado por ${requesterTag}`;
    const v = source != null ? String(source).trim() : '';
    let text = v ? `${base}\n${sourceLabel} ${v}` : base;
    if (text.length > FOOTER_TEXT_MAX) {
        text = `${text.slice(0, FOOTER_TEXT_MAX - 3)}...`;
    }
    embed.setFooter({ text });
}

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
}

function getCachedTranslation(cacheKey) {
    const cached = translationCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        translationCache.delete(cacheKey);
        return null;
    }
    return cached.value;
}

function setCachedTranslation(cacheKey, value) {
    translationCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + TRANSLATION_CACHE_TTL_MS
    });
}

async function translateText(text, langpair = 'en|es', options = {}) {
    if (!text || typeof text !== 'string') return text;

    const normalizedText = text.trim();
    if (!normalizedText) return text;

    const limited = normalizedText.length > 1000 ? normalizedText.slice(0, 1000) : normalizedText;
    const cacheKey = `${langpair}:${limited}`;
    const cached = getCachedTranslation(cacheKey);
    if (cached) return cached;

    if (translationInflight.has(cacheKey)) {
        return translationInflight.get(cacheKey);
    }

    const request = (async () => {
        try {
            const response = await axios.get('https://api.mymemory.translated.net/get', {
                timeout: options.timeout || 10000,
                params: {
                    q: limited,
                    langpair
                }
            });

            const translated = response?.data?.responseData?.translatedText;
            if (!translated || typeof translated !== 'string') return text;

            const cleaned = decodeHtmlEntities(translated);
            if (!cleaned || cleaned.toLowerCase().includes('invalid source language') || cleaned.toLowerCase().includes('example: langpair=')) {
                return text;
            }

            setCachedTranslation(cacheKey, cleaned);
            return cleaned;
        } catch {
            return text;
        }
    })().finally(() => {
        translationInflight.delete(cacheKey);
    });

    translationInflight.set(cacheKey, request);
    return request;
}

async function fetchFromWaifuPics(action) {
    const response = await axios.get(`https://api.waifu.pics/sfw/${action}`, { timeout: 8000 });
    const url = response?.data?.url || null;
    return url ? { url, source: null } : null;
}

async function fetchFromNekosBest(action) {
    const response = await axios.get(`https://nekos.best/api/v2/${action}`, { timeout: 8000 });
    const row = response?.data?.results?.[0];
    const url = row?.url || null;
    const source = row?.anime_name?.trim() || null;
    return url ? { url, source } : null;
}

async function fetchFromTenor(action) {
    if (!config.tenorApiKey) return null;
    const meta = getActionMeta(action);
    if (!meta) return null;

    const response = await axios.get('https://tenor.googleapis.com/v2/search', {
        timeout: 8000,
        params: {
            key: config.tenorApiKey,
            q: meta.tenorQuery,
            limit: 10,
            media_filter: 'gif',
            contentfilter: 'medium',
            random: true
        }
    });

    const item = response?.data?.results?.[0];
    const url = item?.media_formats?.gif?.url || null;
    if (!url) return null;
    const desc = item?.content_description?.trim();
    const title = item?.title?.trim();
    const source = desc || title || null;
    return { url, source };
}

async function fetchGifFromSearchTenor(query) {
    if (!config.tenorApiKey) return null;

    const response = await axios.get('https://tenor.googleapis.com/v2/search', {
        timeout: 9000,
        params: {
            key: config.tenorApiKey,
            q: query,
            limit: 10,
            media_filter: 'gif',
            contentfilter: 'medium',
            random: true
        }
    });

    const item = response?.data?.results?.[0];
    const url = item?.media_formats?.gif?.url || null;
    if (!url) return null;
    const desc = item?.content_description?.trim();
    const title = item?.title?.trim();
    const source = desc || title || null;
    return { url, source };
}

async function fetchGifFromGiphy(query) {
    const response = await axios.get('https://api.giphy.com/v1/gifs/search', {
        timeout: 9000,
        params: {
            api_key: 'dc6zaTOxFJmzC',
            q: query,
            limit: 10
        }
    });

    const gifs = response?.data?.data || [];
    if (!gifs.length) return null;

    const chosen = gifs[Math.floor(Math.random() * gifs.length)];
    const url = chosen?.images?.original?.url || chosen?.images?.downsized_large?.url || chosen?.images?.fixed_height?.url || null;
    if (!url) return null;

    return {
        url,
        source: chosen?.title?.trim() || null
    };
}

async function fetchGifFromNekosFallback(query) {
    const response = await axios.get(`https://nekos.life/api/v2/img/${query.toLowerCase().includes('anime') ? 'smug' : 'cuddle'}`, {
        timeout: 9000
    });

    const url = response?.data?.url || null;
    return url ? { url, source: null } : null;
}

function getCachedGif(cacheKey) {
    const cached = gifCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
        gifCache.delete(cacheKey);
        return null;
    }
    return cached.value;
}

function setCachedGif(cacheKey, value) {
    if (!value?.url) return;
    gifCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + GIF_CACHE_TTL_MS
    });
}

async function resolveGif(cacheKey, providers) {
    const cached = getCachedGif(cacheKey);
    if (cached) return cached;

    if (gifInflight.has(cacheKey)) {
        return gifInflight.get(cacheKey);
    }

    const request = Promise.any(
        providers.map((provider) =>
            Promise.resolve()
                .then(() => provider())
                .then((result) => {
                    if (result?.url) return result;
                    throw new Error('GIF not found');
                })
        )
    ).catch(() => ({ url: null, source: null }))
        .then((result) => {
            if (result?.url) setCachedGif(cacheKey, result);
            return result;
        })
        .finally(() => {
            gifInflight.delete(cacheKey);
        });

    gifInflight.set(cacheKey, request);
    return request;
}

async function fetchInteractionGif(action) {
    const providers = [
        () => fetchFromNekosBest(action),
        () => fetchFromWaifuPics(action),
        () => fetchFromTenor(action)
    ];

    return resolveGif(`action:${action}`, providers);
}

async function fetchSearchGif(query) {
    const normalizedQuery = (query || '').trim().toLowerCase();
    if (!normalizedQuery) return { url: null, source: null };

    const providers = [];
    if (config.tenorApiKey) {
        providers.push(() => fetchGifFromSearchTenor(normalizedQuery));
    }
    providers.push(() => fetchGifFromGiphy(normalizedQuery));

    const primaryResult = await resolveGif(`search:${normalizedQuery}`, providers);
    if (primaryResult?.url) return primaryResult;

    return fetchGifFromNekosFallback(normalizedQuery).catch(() => ({ url: null, source: null }));
}

function createReturnComponents(action, authorId, targetId) {
    const meta = getActionMeta(action);
    if (!meta) return [];

    const customId = `fun_return_${action}_${authorId}_${targetId}`;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(customId)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Devolver')
    );

    return [row];
}

function parseReturnCustomId(customId) {
    const parts = (customId || '').split('_');
    if (parts.length < 5) return null;
    if (parts[0] !== 'fun' || parts[1] !== 'return') return null;

    return {
        action: parts[2],
        authorId: parts[3],
        targetId: parts[4]
    };
}

async function handleReturnInteraction(interaction) {
    const parsed = parseReturnCustomId(interaction.customId);
    if (!parsed) return false;

    const meta = getActionMeta(parsed.action);
    if (!meta) {
        await interaction.reply({ content: '❌ Interacción inválida.', flags: 64 }).catch(() => {});
        return true;
    }

    if (interaction.user.id !== parsed.targetId) {
        await interaction.reply({ content: '❌ Solo el usuario mencionado puede devolver esta interacción.', flags: 64 }).catch(() => {});
        return true;
    }

    const media = await fetchInteractionGif(parsed.action);
    const counts = await incrementMentionCount(parsed.action, interaction.guild?.id || null, parsed.authorId).catch(() => ({ total: null, actionCount: null }));

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${meta.title} (Devolución)`)
        .setDescription(`<@${interaction.user.id}> ${meta.verb} a <@${parsed.authorId}>`);

    if (Number.isFinite(counts?.total) && Number.isFinite(counts?.actionCount)) {
        embed.addFields({
            name: '📊 Conteo',
            value: `Menciones a <@${parsed.authorId}>: **${counts.total}** total (**${counts.actionCount}** en ${parsed.action})`,
            inline: false
        });
    }

    if (media?.url) embed.setImage(media.url);
    setInteractionFooter(embed, interaction.user.tag, media?.source);

    const disabledRows = (interaction.message.components || []).map((row) => {
        const clone = ActionRowBuilder.from(row);
        clone.components.forEach((component) => component.setDisabled(true));
        return clone;
    });

    await interaction.message.edit({ components: disabledRows }).catch(() => {});
    await interaction.reply({ embeds: [embed] }).catch(() => {});
    return true;
}

module.exports = {
    getActionMeta,
    fetchInteractionGif,
    fetchSearchGif,
    translateText,
    setInteractionFooter,
    incrementMentionCount,
    createReturnComponents,
    handleReturnInteraction
};
