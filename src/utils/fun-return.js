const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../config');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const MENTIONS_FILE = path.join(DATA_DIR, 'fun-mentions.json');
const TRANSLATION_CACHE_TTL_MS = Math.max(60_000, Number.parseInt(process.env.FUN_TRANSLATION_CACHE_TTL_MS || '900000', 10));
const GIF_RECENT_LIMIT = Math.max(3, Number.parseInt(process.env.FUN_GIF_RECENT_LIMIT || '5', 10));
/** nekos.best exige APP_NAME (CONTACT); axios por defecto es bloqueado. */
const GIF_USER_AGENT =
    process.env.GIF_USER_AGENT
    || 'EyedBot (https://github.com/IgnacioLondono/EyedBot)';

const gifHttp = axios.create({
    timeout: 9000,
    headers: {
        'User-Agent': GIF_USER_AGENT,
        Accept: 'application/json, image/*, */*'
    }
});

let mentionsCache = null;
let writeQueue = Promise.resolve();
const gifCache = new Map();
const gifInflight = new Map();
const gifRecent = new Map();
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

function pairInteractionKeys(action, guildId, userAId, userBId) {
    const scope = guildId || 'global';
    const [left, right] = [String(userAId || ''), String(userBId || '')].sort();
    const pairKey = `${left}:${right}`;
    return {
        total: `fun:pair:total:${scope}:${pairKey}`,
        action: `fun:pair:${action}:${scope}:${pairKey}`
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

async function incrementPairInteractionCount(action, guildId, userAId, userBId) {
    await ensureMentionsStoreLoaded();
    const keys = pairInteractionKeys(action, guildId, userAId, userBId);

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
    // Una sola línea: Discord suele truncar/ignorar saltos en footers.
    let text = v ? `${base} · ${sourceLabel} ${v}` : base;
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

/** MyMemory limita la query; dejamos margen por codificacion en la URL. */
const MYMEMORY_QUERY_MAX = 450;

function isBadTranslationOutput(s) {
    const lower = String(s || '').toLowerCase();
    if (!lower) return true;
    if (lower.includes('invalid source language')) return true;
    if (lower.includes('example: langpair=')) return true;
    if (lower.includes('query length limit') || lower.includes('max allowed query')) return true;
    return false;
}

async function translateTextOnce(limited, langpair, options, fallbackOriginal) {
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
            if (!translated || typeof translated !== 'string') return fallbackOriginal;

            const cleaned = decodeHtmlEntities(translated);
            if (!cleaned || isBadTranslationOutput(cleaned)) {
                return fallbackOriginal;
            }

            setCachedTranslation(cacheKey, cleaned);
            return cleaned;
        } catch {
            return fallbackOriginal;
        }
    })().finally(() => {
        translationInflight.delete(cacheKey);
    });

    translationInflight.set(cacheKey, request);
    return request;
}

async function translateText(text, langpair = 'en|es', options = {}) {
    if (!text || typeof text !== 'string') return text;

    const normalizedText = text.trim();
    if (!normalizedText) return text;

    if (normalizedText.length <= MYMEMORY_QUERY_MAX) {
        return translateTextOnce(normalizedText, langpair, options, normalizedText);
    }

    const chunks = [];
    for (let i = 0; i < normalizedText.length; i += MYMEMORY_QUERY_MAX) {
        chunks.push(normalizedText.slice(i, i + MYMEMORY_QUERY_MAX));
    }

    const parts = [];
    for (const chunk of chunks) {
        parts.push(await translateTextOnce(chunk, langpair, options, chunk));
    }
    return parts.join('').trim();
}

async function fetchFromWaifuPics(action) {
    const response = await gifHttp.get(`https://api.waifu.pics/sfw/${action}`);
    const url = response?.data?.url || null;
    return url ? { url, source: null } : null;
}

async function fetchFromNekosBest(action) {
    const response = await gifHttp.get(`https://nekos.best/api/v2/${action}`);
    const row = response?.data?.results?.[0];
    const url = row?.url || null;
    const source = row?.anime_name?.trim() || null;
    return url ? { url, source } : null;
}

async function fetchFromOtakuGifs(action) {
    const response = await gifHttp.get('https://api.otakugifs.xyz/gif', {
        params: { reaction: action }
    });
    const url = response?.data?.url || null;
    return url ? { url, source: null } : null;
}

async function fetchFromTenor(action) {
    if (!config.tenorApiKey) return null;
    const meta = getActionMeta(action);
    if (!meta) return null;

    const response = await gifHttp.get('https://tenor.googleapis.com/v2/search', {
        params: {
            key: config.tenorApiKey,
            q: meta.tenorQuery,
            limit: 10,
            media_filter: 'gif',
            contentfilter: 'medium',
            random: true
        }
    });

    const items = response?.data?.results || [];
    const item = items[Math.floor(Math.random() * items.length)] || items[0];
    const url = item?.media_formats?.gif?.url || null;
    if (!url) return null;
    const desc = item?.content_description?.trim();
    const title = item?.title?.trim();
    const source = desc || title || null;
    return { url, source };
}

async function fetchGifFromSearchTenor(query) {
    if (!config.tenorApiKey) return null;

    const response = await gifHttp.get('https://tenor.googleapis.com/v2/search', {
        params: {
            key: config.tenorApiKey,
            q: query,
            limit: 10,
            media_filter: 'gif',
            contentfilter: 'medium',
            random: true
        }
    });

    const items = response?.data?.results || [];
    const item = items[Math.floor(Math.random() * items.length)] || items[0];
    const url = item?.media_formats?.gif?.url || null;
    if (!url) return null;
    const desc = item?.content_description?.trim();
    const title = item?.title?.trim();
    const source = desc || title || null;
    return { url, source };
}

async function fetchGifFromGiphy(query) {
    const response = await gifHttp.get('https://api.giphy.com/v1/gifs/search', {
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
    const response = await gifHttp.get(
        `https://nekos.life/api/v2/img/${query.toLowerCase().includes('anime') ? 'smug' : 'cuddle'}`
    );

    const url = response?.data?.url || null;
    return url ? { url, source: null } : null;
}

function getRecentGifList(cacheKey) {
    return gifRecent.get(cacheKey) || [];
}

function rememberGif(cacheKey, value) {
    if (!value?.url) return;

    const current = getRecentGifList(cacheKey).filter((item) => item?.url && item.url !== value.url);
    current.unshift(value);
    gifRecent.set(cacheKey, current.slice(0, GIF_RECENT_LIMIT));
}

function isRecentGif(cacheKey, url) {
    if (!url) return false;
    return getRecentGifList(cacheKey).some((item) => item?.url === url);
}

function shuffleItems(items) {
    return [...items].sort(() => Math.random() - 0.5);
}

async function resolveGif(cacheKey, providers, options = {}) {
    if (gifInflight.has(cacheKey)) {
        return gifInflight.get(cacheKey);
    }

    const preferSource = options.preferSource === true;

    const pickResult = (results) => {
        if (!results.length) return null;
        if (preferSource) {
            const withSource = results.filter((result) => String(result?.source || '').trim());
            if (withSource.length) {
                return withSource[Math.floor(Math.random() * withSource.length)];
            }
        }
        return results[Math.floor(Math.random() * results.length)] || null;
    };

    const request = (async () => {
        let fallback = null;

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const settled = await Promise.allSettled(
                shuffleItems(providers).map((provider) => Promise.resolve().then(() => provider()))
            );

            const results = settled
                .filter((entry) => entry.status === 'fulfilled' && entry.value?.url)
                .map((entry) => entry.value);

            if (!results.length) continue;

            if (!fallback) {
                fallback = pickResult(results);
            }

            const freshResults = results.filter((result) => !isRecentGif(cacheKey, result.url));
            const selected = freshResults.length ? pickResult(freshResults) : null;

            if (selected?.url) {
                rememberGif(cacheKey, selected);
                return selected;
            }
        }

        if (fallback?.url) {
            rememberGif(cacheKey, fallback);
            return fallback;
        }

        return { url: null, source: null };
    })()
        .finally(() => {
            gifInflight.delete(cacheKey);
        });

    gifInflight.set(cacheKey, request);
    return request;
}

async function fetchInteractionGif(action) {
    const cacheKey = `action:${action}`;

    // Preferir nekos.best: trae anime_name para el footer en /hug, /pat, devoluciones, etc.
    for (let tryN = 0; tryN < 2; tryN += 1) {
        try {
            const fromNekos = await fetchFromNekosBest(action);
            if (!fromNekos?.url) break;
            const hasAnime = Boolean(String(fromNekos.source || '').trim());
            if (hasAnime && !isRecentGif(cacheKey, fromNekos.url)) {
                rememberGif(cacheKey, fromNekos);
                return fromNekos;
            }
            if (hasAnime && tryN === 1) {
                rememberGif(cacheKey, fromNekos);
                return fromNekos;
            }
            if (hasAnime) continue;
            break;
        } catch {
            break;
        }
    }

    return resolveGif(cacheKey, [
        () => fetchFromNekosBest(action),
        () => fetchFromOtakuGifs(action),
        () => fetchFromWaifuPics(action),
        () => fetchFromTenor(action)
    ], { preferSource: true });
}

async function fetchSearchGif(query) {
    const normalizedQuery = (query || '').trim().toLowerCase();
    if (!normalizedQuery) return { url: null, source: null };

    const providers = [];
    if (config.tenorApiKey) {
        providers.push(() => fetchGifFromSearchTenor(normalizedQuery));
    }
    providers.push(() => fetchGifFromGiphy(normalizedQuery));

    const cacheKey = `search:${normalizedQuery}`;
    const primaryResult = await resolveGif(cacheKey, providers);
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

    await interaction.deferReply().catch(() => {});

    const [media, counts, pairCounts] = await Promise.all([
        fetchInteractionGif(parsed.action),
        incrementMentionCount(parsed.action, interaction.guild?.id || null, parsed.authorId).catch(() => ({ total: null, actionCount: null })),
        incrementPairInteractionCount(parsed.action, interaction.guild?.id || null, interaction.user.id, parsed.authorId).catch(() => ({ total: null, actionCount: null }))
    ]);

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

    if (Number.isFinite(pairCounts?.total) && Number.isFinite(pairCounts?.actionCount)) {
        embed.addFields({
            name: '🤝 Interacciones Entre Ambos',
            value: `**${pairCounts.total}** devoluciones total (**${pairCounts.actionCount}** en ${parsed.action})`,
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
    await interaction.editReply({ embeds: [embed] }).catch(() => {});
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
