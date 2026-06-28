const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const crunchyrollStore = require('./crunchyroll-store');

const CR_BASE = String(process.env.CRUNCHYROLL_API_BASE || 'https://beta-api.crunchyroll.com').replace(/\/+$/, '');
const CR_BASIC_AUTH = `Basic ${Buffer.from('noaihdevm_6iyg0a8l0q:').toString('base64')}`;
const CR_LOCALE = String(process.env.CRUNCHYROLL_LOCALE || 'es-ES').trim() || 'es-ES';
const CR_USER_AGENT = String(process.env.CRUNCHYROLL_USER_AGENT || 'EyedBot/1.0 (+https://eyedcomun.me)').trim();
const CHECK_MS = Math.max(5 * 60_000, Number.parseInt(process.env.CRUNCHYROLL_CHECK_MS || `${20 * 60_000}`, 10));
const FETCH_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.CRUNCHYROLL_FETCH_TIMEOUT_MS || '20000', 10));
const NOTIFY_ALL_LIMIT = Math.max(10, Math.min(50, Number.parseInt(process.env.CRUNCHYROLL_NOTIFY_ALL_LIMIT || '30', 10)));
const NOTIFY_ALL_MAX_POSTS = Math.max(1, Math.min(10, Number.parseInt(process.env.CRUNCHYROLL_NOTIFY_ALL_MAX_POSTS || '3', 10)));

let intervalRef = null;
let running = false;
let tokenCache = { authHeader: '', expiresAt: 0 };

function pickImage(images = {}) {
    const poster = images?.poster_tall?.[0] || images?.poster_wide?.[0] || images?.thumbnail?.[0];
    if (!Array.isArray(poster) || !poster.length) return '';
    const best = poster[poster.length - 1];
    return String(best?.source || best?.url || '').trim();
}

function parseSeriesIdFromInput(input = '') {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const urlMatch = raw.match(/crunchyroll\.com\/(?:[a-z-]+\/)?(?:series|watch)\/([A-Z0-9]+)/i);
    if (urlMatch) return urlMatch[1].toUpperCase();
    if (/^[A-Z0-9]{6,}$/i.test(raw)) return raw.toUpperCase();
    return '';
}

function seriesUrl(seriesId, slug = '') {
    const id = String(seriesId || '').trim();
    if (!id) return 'https://www.crunchyroll.com/simulcastcalendar';
    const safeSlug = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    return safeSlug
        ? `https://www.crunchyroll.com/series/${id}/${safeSlug}`
        : `https://www.crunchyroll.com/series/${id}`;
}

function episodeUrl(episodeId) {
    const id = String(episodeId || '').trim();
    return id ? `https://www.crunchyroll.com/watch/${id}` : 'https://www.crunchyroll.com/simulcastcalendar';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': CR_USER_AGENT,
                Accept: 'application/json',
                ...(options.headers || {})
            }
        });
    } finally {
        clearTimeout(timer);
    }
}

async function ensureAccessToken(force = false) {
    if (!force && tokenCache.authHeader && tokenCache.expiresAt > Date.now() + 60_000) {
        return tokenCache.authHeader;
    }

    const sessionId = crypto.randomUUID();
    const response = await fetchWithTimeout(`${CR_BASE}/auth/v1/token`, {
        method: 'POST',
        headers: {
            Authorization: CR_BASIC_AUTH,
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: `session_id=${sessionId}`
        },
        body: 'grant_type=client_id&scope=offline_access'
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Crunchyroll auth falló (${response.status}): ${text.slice(0, 180)}`);
    }

    const payload = await response.json();
    const accessToken = String(payload?.access_token || '').trim();
    const tokenType = String(payload?.token_type || 'Bearer').trim();
    if (!accessToken) throw new Error('Crunchyroll no devolvió access_token');

    const expiresIn = Number.parseInt(String(payload?.expires_in || '300'), 10);
    tokenCache = {
        authHeader: `${tokenType} ${accessToken}`,
        expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 300_000)
    };
    return tokenCache.authHeader;
}

async function crFetch(path, options = {}, retry = true) {
    const authHeader = await ensureAccessToken();
    const url = path.startsWith('http') ? path : `${CR_BASE}${path}`;
    const response = await fetchWithTimeout(url, {
        ...options,
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });

    if (response.status === 401 && retry) {
        await ensureAccessToken(true);
        return crFetch(path, options, false);
    }

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Crunchyroll API ${response.status}: ${text.slice(0, 180)}`);
    }

    return response.json();
}

function mapSeriesItem(item = {}) {
    const seriesId = String(item.id || '').trim();
    const title = String(item.title || item.name || 'Serie').trim();
    return {
        seriesId,
        title,
        description: String(item.description || '').trim(),
        imageUrl: pickImage(item.images),
        url: seriesUrl(seriesId, title)
    };
}

function mapEpisodeItem(episode = {}, series = {}, season = {}) {
    const episodeId = String(episode.id || '').trim();
    const episodeNumber = Number.parseInt(
        String(episode.episode_number ?? episode.episode ?? episode.sequence_number ?? '0'),
        10
    ) || 0;
    const seriesId = String(series.seriesId || series.id || episode.series_id || '').trim();
    const seriesTitle = String(
        series.title || series.name || episode.series_title || episode.parent_title || ''
    ).trim();

    return {
        episodeId,
        episodeNumber,
        title: String(episode.title || episode.name || `Episodio ${episodeNumber || '?'}`).trim(),
        description: String(episode.description || '').trim(),
        imageUrl: pickImage(episode.images) || pickImage(series.images),
        seasonNumber: Number.parseInt(String(season.season_number ?? season.number ?? '0'), 10) || 0,
        seasonTitle: String(season.title || season.name || '').trim(),
        seriesId,
        seriesTitle,
        url: episodeUrl(episodeId),
        publishedAt: episode.episode_air_date || episode.premium_available_date || episode.free_available_date || null
    };
}

async function searchSeries(query = '', limit = 8) {
    const q = String(query || '').trim();
    if (!q) return [];

    const seriesId = parseSeriesIdFromInput(q);
    if (seriesId) {
        try {
            const detail = await getSeriesDetail(seriesId);
            return detail ? [detail] : [];
        } catch {
            return [];
        }
    }

    const params = new URLSearchParams({
        q,
        type: 'series',
        n: String(Math.max(1, Math.min(25, limit))),
        locale: CR_LOCALE
    });
    const payload = await crFetch(`/content/v2/discover/search?${params.toString()}`);
    return (payload?.data || []).map(mapSeriesItem).filter((item) => item.seriesId);
}

async function getSeriesDetail(seriesId) {
    const id = String(seriesId || '').trim();
    if (!id) return null;
    const payload = await crFetch(`/content/v2/cms/series/${encodeURIComponent(id)}?locale=${encodeURIComponent(CR_LOCALE)}`);
    const data = payload?.data || payload;
    if (!data?.id) return null;
    return mapSeriesItem(data);
}

async function getLatestEpisodeForSeries(seriesId) {
    const id = String(seriesId || '').trim();
    if (!id) return null;

    const series = await getSeriesDetail(id);
    if (!series) return null;

    const seasonsPayload = await crFetch(
        `/content/v2/cms/series/${encodeURIComponent(id)}/seasons?locale=${encodeURIComponent(CR_LOCALE)}`
    );
    const seasons = Array.isArray(seasonsPayload?.data) ? seasonsPayload.data : [];
    if (!seasons.length) return null;

    const latestSeason = seasons.reduce((best, current) => {
        const bestNum = Number.parseInt(String(best?.season_number ?? best?.number ?? '0'), 10) || 0;
        const curNum = Number.parseInt(String(current?.season_number ?? current?.number ?? '0'), 10) || 0;
        return curNum >= bestNum ? current : best;
    }, seasons[0]);

    const episodesPayload = await crFetch(
        `/content/v2/cms/seasons/${encodeURIComponent(latestSeason.id)}/episodes?locale=${encodeURIComponent(CR_LOCALE)}`
    );
    const episodes = Array.isArray(episodesPayload?.data) ? episodesPayload.data : [];
    if (!episodes.length) return null;

    const latestEpisode = episodes.reduce((best, current) => {
        const bestNum = Number.parseInt(String(best?.episode_number ?? best?.episode ?? '0'), 10) || 0;
        const curNum = Number.parseInt(String(current?.episode_number ?? current?.episode ?? '0'), 10) || 0;
        return curNum >= bestNum ? current : best;
    }, episodes[0]);

    return mapEpisodeItem(latestEpisode, series, latestSeason);
}

async function fetchNewlyAddedEpisodes(limit = NOTIFY_ALL_LIMIT) {
    const n = Math.max(1, Math.min(50, limit));
    const payload = await crFetch(
        `/content/v2/discover/browse?type=episode&sort_by=newly_added&n=${n}&locale=${encodeURIComponent(CR_LOCALE)}`
    );
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    return rows
        .map((row) => {
            const seriesMeta = row?.series_metadata || row?.series || {};
            const seasonMeta = row?.season_metadata || row?.season || {};
            return mapEpisodeItem(row, { ...seriesMeta, seriesId: seriesMeta.id }, seasonMeta);
        })
        .filter((item) => item.episodeId);
}

async function fetchUpcomingEpisodes(limit = 12) {
    const params = new URLSearchParams({
        n: String(Math.max(1, Math.min(40, limit))),
        locale: CR_LOCALE
    });

    try {
        const payload = await crFetch(`/content/v2/discover/upcoming_episode?${params.toString()}`);
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        return rows.map((row) => {
            const episode = row?.episode_metadata || row?.episode || row;
            const series = row?.series_metadata || row?.series || {};
            const season = row?.season_metadata || row?.season || {};
            return mapEpisodeItem(episode, { ...series, seriesId: series.id, title: series.title }, season);
        }).filter((item) => item.episodeId || item.seriesTitle);
    } catch {
        const browse = await crFetch(
            `/content/v2/discover/browse?type=episode&sort_by=newly_added&n=${Math.max(1, Math.min(40, limit))}&locale=${encodeURIComponent(CR_LOCALE)}`
        );
        const rows = Array.isArray(browse?.data) ? browse.data : [];
        return rows.map((row) => mapEpisodeItem(row, row?.series_metadata || {}, row?.season_metadata || {}))
            .filter((item) => item.episodeId || item.title);
    }
}

function applyTemplate(template, vars) {
    return String(template || '')
        .replace(/\{series\}/g, vars.series || 'Anime')
        .replace(/\{episode\}/g, String(vars.episode ?? ''))
        .replace(/\{episodeTitle\}/g, vars.episodeTitle || '')
        .replace(/\{season\}/g, String(vars.season ?? ''))
        .replace(/\{url\}/g, vars.url || '');
}

function buildCrunchyrollEmbed(config, series, episode) {
    const colorRaw = String(config?.color || 'f47521').replace('#', '');
    const color = Number.parseInt(colorRaw, 16);
    const title = applyTemplate(config?.titleTemplate, {
        series: series?.title || episode?.seriesTitle || 'Anime',
        episode: episode?.episodeNumber || '?',
        episodeTitle: episode?.title || '',
        season: episode?.seasonNumber || '',
        url: episode?.url || series?.url || ''
    });
    const description = applyTemplate(config?.descriptionTemplate, {
        series: series?.title || episode?.seriesTitle || 'Anime',
        episode: episode?.episodeNumber || '?',
        episodeTitle: episode?.title || '',
        season: episode?.seasonNumber || '',
        url: episode?.url || series?.url || ''
    });

    const embed = new EmbedBuilder()
        .setColor(Number.isFinite(color) ? color : 0xf47521)
        .setTitle(title.slice(0, 256))
        .setDescription(description.slice(0, 4096))
        .setFooter({ text: String(config?.footerText || 'EyedBot · Crunchyroll').slice(0, 2048) });

    const imageUrl = episode?.imageUrl || series?.imageUrl || '';
    if (imageUrl) {
        if (config?.embedLargePreview !== false) embed.setImage(imageUrl);
        else embed.setThumbnail(imageUrl);
    }

    const link = episode?.url || series?.url;
    if (link) embed.setURL(link);

    return embed;
}

async function postEpisodeAlert(client, guildId, config, series, episode) {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return false;

    const channel = guild.channels.cache.get(config.channelId)
        || await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || typeof channel.send !== 'function') return false;

    const mention = String(config.mentionText || '').trim();
    await channel.send({
        content: mention || undefined,
        embeds: [buildCrunchyrollEmbed(config, series, episode)],
        allowedMentions: { parse: ['users', 'roles', 'everyone'] }
    });
    return true;
}

async function processTrackedSeries(client, guildId, config) {
    const activeSeries = (config.series || []).filter((item) => item.enabled !== false && item.seriesId);
    if (!activeSeries.length) return { config, updated: false };

    let updated = false;
    const nextSeries = [];
    const seenThisSweep = new Set(Array.isArray(config.seenEpisodeIds) ? config.seenEpisodeIds : []);

    for (const tracked of activeSeries) {
        const copy = { ...tracked };
        try {
            const episode = await getLatestEpisodeForSeries(tracked.seriesId);
            if (!episode?.episodeId) {
                nextSeries.push(copy);
                continue;
            }

            if (!copy.title || copy.title === 'Serie') {
                copy.title = episode.seriesTitle || copy.title;
            }
            if (!copy.url) copy.url = seriesUrl(copy.seriesId, copy.title);
            if (!copy.imageUrl && episode.imageUrl) copy.imageUrl = episode.imageUrl;

            if (!copy.lastEpisodeId) {
                copy.lastEpisodeId = episode.episodeId;
                copy.lastEpisodeNumber = episode.episodeNumber;
                updated = true;
                nextSeries.push(copy);
                continue;
            }

            if (copy.lastEpisodeId === episode.episodeId || seenThisSweep.has(episode.episodeId)) {
                nextSeries.push(copy);
                continue;
            }

            const series = { ...copy, title: episode.seriesTitle || copy.title };
            const posted = await postEpisodeAlert(client, guildId, config, series, episode);
            if (posted) {
                copy.lastEpisodeId = episode.episodeId;
                copy.lastEpisodeNumber = episode.episodeNumber;
                copy.lastPostedAt = new Date().toISOString();
                seenThisSweep.add(episode.episodeId);
                updated = true;
            }
        } catch (error) {
            console.warn(`Crunchyroll ${guildId}/${tracked.seriesId}:`, error?.message || error);
        }

        nextSeries.push(copy);
    }

    return {
        config: { ...config, series: nextSeries, seenEpisodeIds: Array.from(seenThisSweep).slice(-1000) },
        updated
    };
}

async function processAllAnimeFeed(client, guildId, config) {
    const episodes = await fetchNewlyAddedEpisodes(NOTIFY_ALL_LIMIT);
    if (!episodes.length) return { config, updated: false };

    const seen = new Set(Array.isArray(config.seenEpisodeIds) ? config.seenEpisodeIds : []);
    let updated = false;
    let posts = 0;

    if (!seen.size) {
        for (const episode of episodes) {
            if (episode.episodeId) seen.add(episode.episodeId);
        }
        updated = true;
        console.log(`📺 Crunchyroll ${guildId}: feed inicial (${seen.size} episodios marcados sin avisar)`);
        return { config: { ...config, seenEpisodeIds: Array.from(seen).slice(-1000) }, updated };
    }

    const freshEpisodes = episodes.filter((ep) => ep.episodeId && !seen.has(ep.episodeId));

    for (const episode of freshEpisodes.reverse()) {
        if (posts >= NOTIFY_ALL_MAX_POSTS) break;

        const series = {
            seriesId: episode.seriesId,
            title: episode.seriesTitle || episode.title || 'Anime',
            url: episode.seriesId ? seriesUrl(episode.seriesId, episode.seriesTitle) : episode.url,
            imageUrl: episode.imageUrl
        };

        try {
            const posted = await postEpisodeAlert(client, guildId, config, series, episode);
            if (posted) {
                seen.add(episode.episodeId);
                posts += 1;
                updated = true;
                console.log(`📺 Crunchyroll ${guildId}: aviso ${series.title} ep.${episode.episodeNumber}`);
            }
        } catch (error) {
            console.warn(`Crunchyroll all-anime ${guildId}/${episode.episodeId}:`, error?.message || error);
        }
    }

    return {
        config: { ...config, seenEpisodeIds: Array.from(seen).slice(-1000) },
        updated
    };
}

async function processGuildConfig(client, guildId, config) {
    if (!config?.enabled || !config.channelId) return null;

    const activeSeries = (config.series || []).filter((item) => item.enabled !== false && item.seriesId);
    if (config.notifyAllAnime === false && !activeSeries.length) return null;

    let working = { ...config };
    let anyUpdated = false;

    if (config.notifyAllAnime !== false) {
        try {
            const allResult = await processAllAnimeFeed(client, guildId, working);
            working = allResult.config;
            if (allResult.updated) anyUpdated = true;
        } catch (error) {
            console.warn(`Crunchyroll feed ${guildId}:`, error?.message || error);
        }
    }

    if (activeSeries.length) {
        const trackedResult = await processTrackedSeries(client, guildId, working);
        working = trackedResult.config;
        if (trackedResult.updated) anyUpdated = true;
    }

    if (!anyUpdated) return null;

    const saved = await crunchyrollStore.setCrunchyrollConfig(guildId, {
        ...working,
        updatedAt: new Date().toISOString()
    });
    return saved;
}

async function runCrunchyrollSweep(client) {
    if (running || !client) return;
    running = true;
    try {
        const all = await crunchyrollStore.listAllCrunchyrollConfigs();
        for (const entry of all) {
            if (!entry?.guildId || !entry?.config?.enabled) continue;
            await processGuildConfig(client, entry.guildId, entry.config);
        }
    } catch (error) {
        console.error('Error en sweep Crunchyroll:', error?.message || error);
    } finally {
        running = false;
    }
}

function startCrunchyrollScheduler(client) {
    if (intervalRef) return;
    void runCrunchyrollSweep(client);
    intervalRef = setInterval(() => void runCrunchyrollSweep(client), CHECK_MS);
    console.log(`📺 Crunchyroll scheduler activo (cada ${Math.round(CHECK_MS / 60000)} min)`);
}

function stopCrunchyrollScheduler() {
    if (intervalRef) clearInterval(intervalRef);
    intervalRef = null;
}

module.exports = {
    parseSeriesIdFromInput,
    searchSeries,
    getSeriesDetail,
    getLatestEpisodeForSeries,
    fetchUpcomingEpisodes,
    fetchNewlyAddedEpisodes,
    buildCrunchyrollEmbed,
    postEpisodeAlert,
    processGuildConfig,
    runCrunchyrollSweep,
    startCrunchyrollScheduler,
    stopCrunchyrollScheduler
};
