const { EmbedBuilder } = require('discord.js');
const streamAlertStore = require('./stream-alert-store');
const {
    fetchTwitchLiveByLogin,
    extractTwitchLoginFromUrlOrName,
    cacheBustPreviewUrl
} = require('./twitch-stream-api');
const {
    parseFeedLatestItem,
    deriveYouTubeFeedUrl,
    extractYouTubeChannelIdFromUrl,
    extractTikTokUsernameFromSource,
    looksLikeLiveStreamTitle
} = require('./stream-alert-feed');
const {
    resolveYouTubeChannelId,
    fetchYouTubeChannelLiveViaApi
} = require('./stream-youtube-api');

function isAnyStreamPushConfigured() {
    try {
        return require('./twitch-eventsub').isTwitchEventSubConfigured()
            || require('./youtube-websub').isYouTubeWebSubConfigured()
            || require('./feed-websub').isFeedWebSubConfigured();
    } catch {
        return false;
    }
}

function resolveStreamAlertCheckMs() {
    const fallback = isAnyStreamPushConfigured() ? '900000' : '120000';
    return Math.max(120_000, Number.parseInt(process.env.STREAM_ALERT_CHECK_MS || fallback, 10));
}
const FETCH_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.STREAM_ALERT_FETCH_TIMEOUT_MS || '12000', 10));

let intervalRef = null;
let running = false;
const liveState = new Map();
const liveSessionState = new Map();

function applyTemplate(template = '', values = {}) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
        const value = values[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'EyedBot/1.0 (stream-alerts)'
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } finally {
        clearTimeout(timer);
    }
}

function resolveFeedUrl(source) {
    if (String(source.platform) === 'youtube') {
        return deriveYouTubeFeedUrl(source);
    }

    return String(source.feedUrl || '').trim();
}

function isYouTubeHandledByWebSub() {
    try {
        return require('./youtube-websub').isYouTubeWebSubConfigured();
    } catch {
        return false;
    }
}

function isTikTokHandledByPush() {
    try {
        const feedWebSub = require('./feed-websub').isFeedWebSubConfigured();
        return feedWebSub;
    } catch {
        return false;
    }
}

async function resolveYouTubeLive(source) {
    const channelId = extractYouTubeChannelIdFromUrl(source.url || '')
        || extractYouTubeChannelIdFromUrl(deriveYouTubeFeedUrl(source))
        || await resolveYouTubeChannelId(source);
    if (!channelId) return null;

    const liveInfo = await fetchYouTubeChannelLiveViaApi(channelId, source.name);
    if (!liveInfo) return null;

    const videoId = String(liveInfo.videoId || '');
    const stateKey = `youtube:${channelId}`;
    const wasLive = liveState.get(stateKey) === true;
    liveState.set(stateKey, true);

    let sessionId = liveSessionState.get(stateKey);
    if (!sessionId || (videoId && !sessionId.includes(videoId))) {
        sessionId = `youtube-live-${channelId}-${videoId || Date.now()}`;
        liveSessionState.set(stateKey, sessionId);
    }

    return {
        itemId: sessionId,
        title: liveInfo.title,
        description: liveInfo.description,
        url: liveInfo.url,
        imageUrl: liveInfo.imageUrl || String(source.imageUrl || '').trim(),
        publishedAt: liveInfo.publishedAt,
        skipIfAlreadySeen: wasLive
    };
}

async function resolveTwitchLiveViaApi(source) {
    const login = extractTwitchLoginFromUrlOrName(source);
    if (!login) return null;

    try {
        const live = await fetchTwitchLiveByLogin(login);
        const stateKey = `twitch:${login}`;
        if (!live) {
            liveState.set(stateKey, false);
            liveSessionState.delete(stateKey);
            return null;
        }

        const wasLive = liveState.get(stateKey) === true;
        liveState.set(stateKey, true);
        const streamId = String(live.streamId || '');
        let sessionId = liveSessionState.get(stateKey);
        if (!sessionId || (streamId && !sessionId.includes(streamId))) {
            sessionId = streamId ? `twitch-live-${login}-${streamId}` : `twitch-live-${login}-${Date.now()}`;
            liveSessionState.set(stateKey, sessionId);
        }

        const staticFallback = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`;
        const customFallback = String(source.imageUrl || '').trim();
        const previewRaw = live.previewUrl || customFallback || staticFallback;

        return {
            itemId: sessionId,
            title: live.title || String(`${source.name || login} está en directo`),
            description: `En vivo en Twitch (${live.gameName || 'Sin categoría'})${live.viewerCount ? ` · ~${live.viewerCount} espectadores` : ''}`,
            url: String(source.url || `https://twitch.tv/${login}`),
            imageUrl: cacheBustPreviewUrl(previewRaw),
            publishedAt: String(live.startedAt || new Date().toISOString()),
            skipIfAlreadySeen: wasLive
        };
    } catch {
        return null;
    }
}

async function resolveTwitchLive(source) {
    const fromApi = await resolveTwitchLiveViaApi(source);
    if (fromApi) return fromApi;

    const login = extractTwitchLoginFromUrlOrName(source);
    if (!login) return null;

    try {
        const uptimeRaw = await fetchWithTimeout(`https://decapi.me/twitch/uptime/${encodeURIComponent(login)}`);
        const uptimeText = String(uptimeRaw || '').trim().toLowerCase();
        const stateKey = `twitch:${login}`;

        if (!uptimeText || uptimeText.includes('offline')) {
            liveState.set(stateKey, false);
            liveSessionState.delete(stateKey);
            return null;
        }

        const wasLive = liveState.get(stateKey) === true;
        liveState.set(stateKey, true);
        let sessionId = liveSessionState.get(stateKey);
        if (!sessionId) {
            sessionId = `twitch-live-${login}-${Date.now()}`;
            liveSessionState.set(stateKey, sessionId);
        }

        let liveTitle = '';
        try {
            const titleRaw = await fetchWithTimeout(`https://decapi.me/twitch/title/${encodeURIComponent(login)}`);
            const normalizedTitle = String(titleRaw || '').trim();
            if (normalizedTitle && !normalizedTitle.toLowerCase().includes('offline')) {
                liveTitle = normalizedTitle;
            }
        } catch {
            // fallback title below
        }

        const staticFallback = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`;
        const customImg = String(source.imageUrl || '').trim();
        return {
            itemId: sessionId,
            title: liveTitle || `${source.name || login} está en directo`,
            description: `En vivo en Twitch (${uptimeRaw.trim()})`,
            url: String(source.url || `https://twitch.tv/${login}`),
            imageUrl: cacheBustPreviewUrl(customImg || staticFallback),
            publishedAt: new Date().toISOString(),
            skipIfAlreadySeen: wasLive
        };
    } catch {
        return null;
    }
}

function isTwitchHandledByEventSub() {
    try {
        return require('./twitch-eventsub').isTwitchEventSubConfigured();
    } catch {
        return false;
    }
}

async function resolveLatestItemFromSource(source) {
    if (source.enabled === false) return null;

    if (String(source.platform) === 'twitch' && !String(source.feedUrl || '').trim()) {
        if (isTwitchHandledByEventSub()) return null;
        return resolveTwitchLive(source);
    }

    const platform = String(source.platform || '').toLowerCase();

    if (platform === 'youtube') {
        if (!isYouTubeHandledByWebSub()) {
            const youtubeLive = await resolveYouTubeLive(source);
            if (youtubeLive) return youtubeLive;
        }
        return null;
    }

    if (platform === 'tiktok') {
        if (isTikTokHandledByPush() && String(source.feedUrl || '').trim()) return null;
        return null;
    }

    const feedUrl = resolveFeedUrl(source);
    if (!feedUrl) return null;

    try {
        const xml = await fetchWithTimeout(feedUrl);
        return parseFeedLatestItem(xml);
    } catch {
        return null;
    }
}

function isLiveStreamSessionItem(source, item) {
    const itemId = String(item?.itemId || '');
    const plat = String(source?.platform || '').toLowerCase();
    if (plat === 'twitch') return itemId.startsWith('twitch-live-');
    if (plat === 'youtube') return itemId.startsWith('youtube-live-');
    if (plat === 'tiktok') return itemId.startsWith('tiktok-live-');
    return false;
}

function resolveEmbedPreviewUrl(source, item) {
    let imageUrl = String(item?.imageUrl || source?.imageUrl || '').trim();
    const plat = String(source?.platform || '').toLowerCase();

    if (!imageUrl && plat === 'twitch') {
        const login = extractTwitchLoginFromUrlOrName(source);
        if (login) {
            imageUrl = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`;
        }
    }

    if (!imageUrl && plat === 'youtube' && item?.url) {
        const videoId = String(item.url).match(/[?&]v=([A-Za-z0-9_-]{6,})/)?.[1];
        if (videoId) imageUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }

    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return '';
    return cacheBustPreviewUrl(imageUrl);
}

function buildEmbed(config, source, item) {
    const values = {
        platform: (source.platform || 'custom').toUpperCase(),
        name: source.name || source.url || 'Fuente',
        title: item.title || 'Nuevo stream',
        url: item.url || source.url || '',
        description: item.description || ''
    };

    const titleFromTemplate = applyTemplate(config.titleTemplate || '🔴 {platform}: {name} en directo', values).trim();
    const streamTitle = String(item.title || '').trim();
    const title = (streamTitle || titleFromTemplate || 'Directo detectado').slice(0, 256);
    const description = applyTemplate(config.descriptionTemplate || '{title}\n{url}', values).slice(0, 4000);

    const embed = new EmbedBuilder()
        .setColor(`#${String(config.color || '7c4dff').replace('#', '')}`)
        .setTitle(title || 'Directo detectado')
        .setDescription(description || null)
        .setTimestamp(new Date());

    const url = String(item.url || source.url || '').trim();
    if (url) embed.setURL(url);

    const imageUrl = resolveEmbedPreviewUrl(source, item);
    if (imageUrl) {
        if (config.embedLargePreview === true) embed.setImage(imageUrl);
        else embed.setThumbnail(imageUrl);
    }

    const footerText = String(config.footerText || '').trim();
    if (footerText) embed.setFooter({ text: footerText.slice(0, 200) });

    return embed;
}

async function postAlert(client, guildId, config, source, item) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return false;

    const channel = guild.channels.cache.get(config.channelId) || await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) return false;

    const embed = buildEmbed(config, source, item);
    const mentionText = String(config.mentionText || '').trim();

    await channel.send({
        content: mentionText || undefined,
        embeds: [embed]
    });

    return true;
}

async function processGuildConfig(client, guildId, config) {
    if (!config || config.enabled !== true) return;
    if (!config.channelId) return;

    const sources = Array.isArray(config.sources) ? config.sources.filter((src) => src && src.enabled !== false) : [];
    if (!sources.length) return;

    let updated = false;

    for (const source of sources) {
        const item = await resolveLatestItemFromSource(source);
        if (!item || !item.itemId) continue;

        const currentLast = String(source.lastItemId || '');
        if (!currentLast) {
            if (isLiveStreamSessionItem(source, item)) {
                const posted = await postAlert(client, guildId, config, source, item).catch(() => false);
                if (posted) {
                    source.lastItemId = item.itemId;
                    source.lastPostedAt = new Date().toISOString();
                    updated = true;
                }
                continue;
            }

            source.lastItemId = item.itemId;
            updated = true;
            continue;
        }

        if (currentLast === item.itemId || item.skipIfAlreadySeen === true) continue;

        const posted = await postAlert(client, guildId, config, source, item).catch(() => false);
        if (!posted) continue;

        source.lastItemId = item.itemId;
        source.lastPostedAt = new Date().toISOString();
        updated = true;
    }

    if (updated) {
        config.updatedAt = new Date().toISOString();
        await streamAlertStore.setStreamAlertConfig(guildId, config);
    }
}

async function runStreamAlertSweep(client) {
    if (running) return;
    running = true;

    try {
        const all = await streamAlertStore.listAllStreamAlertConfigs();
        for (const item of all) {
            const guildId = String(item.guildId || '');
            if (!guildId) continue;
            await processGuildConfig(client, guildId, item.config || {});
        }
    } catch (error) {
        console.error('Error en stream alert sweep:', error?.message || error);
    } finally {
        running = false;
    }
}

async function dispatchStreamAlertToMatchingSources(client, matcher, item) {
    const all = await streamAlertStore.listAllStreamAlertConfigs();

    for (const entry of all) {
        const guildId = String(entry.guildId || '');
        const config = entry.config;
        if (!guildId || !config || config.enabled !== true || !config.channelId) continue;

        let updated = false;
        for (const source of config.sources || []) {
            if (!source || source.enabled === false) continue;
            if (!matcher(source)) continue;
            if (String(source.lastItemId || '') === item.itemId) continue;

            const posted = await postAlert(client, guildId, config, source, item).catch(() => false);
            if (!posted) continue;

            source.lastItemId = item.itemId;
            source.lastPostedAt = new Date().toISOString();
            updated = true;
        }

        if (updated) {
            config.updatedAt = new Date().toISOString();
            await streamAlertStore.setStreamAlertConfig(guildId, config);
        }
    }
}

async function handleYouTubeLiveEvent(client, event = {}) {
    if (!client) return;

    const channelId = String(event.channelId || '').trim();
    const videoId = String(event.videoId || '').trim();
    const sessionId = videoId && channelId
        ? `youtube-live-${channelId}-${videoId}`
        : `youtube-live-${channelId || 'unknown'}-${Date.now()}`;

    const item = {
        itemId: sessionId,
        title: event.title || 'Directo en YouTube',
        description: event.description || 'En vivo en YouTube',
        url: event.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''),
        imageUrl: event.imageUrl || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
        publishedAt: event.publishedAt || new Date().toISOString()
    };

    await dispatchStreamAlertToMatchingSources(client, (source) => {
        if (String(source.platform || '').toLowerCase() !== 'youtube') return false;
        const sourceChannelId = extractYouTubeChannelIdFromUrl(source.url || '')
            || extractYouTubeChannelIdFromUrl(deriveYouTubeFeedUrl(source));
        if (channelId && sourceChannelId) return sourceChannelId === channelId;
        if (videoId && source.url && source.url.includes(videoId)) return true;
        return !channelId && !sourceChannelId;
    }, item);
}

async function handleTikTokLiveEvent(client, event = {}) {
    if (!client) return;

    const username = String(event.username || '').toLowerCase();
    if (!username) return;

    const sessionId = `tiktok-live-${username}-${event.roomId || Date.now()}`;
    const item = {
        itemId: sessionId,
        title: event.title || `${username} está en directo`,
        description: 'En vivo en TikTok',
        url: event.url || `https://www.tiktok.com/@${username}/live`,
        imageUrl: event.imageUrl || '',
        publishedAt: new Date().toISOString()
    };

    await dispatchStreamAlertToMatchingSources(client, (source) => {
        if (String(source.platform || '').toLowerCase() !== 'tiktok') return false;
        const sourceUser = extractTikTokUsernameFromSource(source);
        return sourceUser === username;
    }, item);
}

async function handleFeedPushEvent(client, payload = {}) {
    if (!client) return;

    const topicUrl = String(payload.topicUrl || '').trim();
    const entry = payload.item;
    if (!entry?.itemId) return;

    const normalizedTopic = (() => {
        try {
            return topicUrl ? new URL(topicUrl).toString() : '';
        } catch {
            return topicUrl;
        }
    })();

    await dispatchStreamAlertToMatchingSources(client, (source) => {
        const platform = String(source.platform || '').toLowerCase();
        if (!['tiktok', 'custom'].includes(platform)) return false;

        const feedUrl = String(source.feedUrl || '').trim();
        if (!feedUrl) return false;

        let topicMatches = true;
        if (normalizedTopic) {
            try {
                topicMatches = new URL(feedUrl).toString() === normalizedTopic;
            } catch {
                topicMatches = feedUrl === normalizedTopic;
            }
        }
        if (!topicMatches) return false;

        if (platform === 'tiktok') {
            const username = extractTikTokUsernameFromSource(source);
            const urlOk = username && entry.url && entry.url.toLowerCase().includes(username);
            return looksLikeLiveStreamTitle(entry.title) || urlOk || /\/live\b/i.test(entry.url || '');
        }

        return true;
    }, {
        itemId: entry.itemId,
        title: entry.title,
        description: entry.description
            || (looksLikeLiveStreamTitle(entry.title) ? 'En directo' : 'Nueva publicación en el feed'),
        url: entry.url,
        imageUrl: entry.imageUrl,
        publishedAt: entry.publishedAt
    });
}

async function handleTwitchStreamOnlineEvent(client, event = {}) {
    if (!client) return;

    const login = String(event.login || '').toLowerCase();
    if (!login) return;

    const { fetchTwitchLiveByLogin, extractTwitchLoginFromUrlOrName, cacheBustPreviewUrl } = require('./twitch-stream-api');
    const live = await fetchTwitchLiveByLogin(login).catch(() => null);
    const streamId = String(event.streamId || live?.streamId || Date.now());
    const sessionId = `twitch-live-${login}-${streamId}`;
    const staticFallback = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`;
    const previewRaw = live?.previewUrl || staticFallback;

    const item = {
        itemId: sessionId,
        title: live?.title || `${event.broadcasterDisplayName || login} está en directo`,
        description: live
            ? `En vivo en Twitch (${live.gameName || 'Sin categoría'})${live.viewerCount ? ` · ~${live.viewerCount} espectadores` : ''}`
            : 'En vivo en Twitch',
        url: `https://twitch.tv/${login}`,
        imageUrl: cacheBustPreviewUrl(previewRaw),
        publishedAt: String(event.startedAt || live?.startedAt || new Date().toISOString())
    };

    await dispatchStreamAlertToMatchingSources(client, (source) => {
        if (String(source.platform || '').toLowerCase() !== 'twitch') return false;
        const sourceLogin = extractTwitchLoginFromUrlOrName(source);
        return sourceLogin.toLowerCase() === login;
    }, item);
}

function startStreamAlertScheduler(client) {
    if (!client || intervalRef) return;
    const checkMs = resolveStreamAlertCheckMs();

    intervalRef = setInterval(() => {
        runStreamAlertSweep(client).catch(() => null);
    }, checkMs);

    runStreamAlertSweep(client).catch(() => null);
    const pushActive = isAnyStreamPushConfigured();
    if (pushActive) {
        console.log(`📡 Directos push: Twitch/YouTube/feed WebSub activos. Respaldo cada ${Math.round(checkMs / 1000)}s`);
    } else {
        console.log(`📡 Stream alerts scheduler cada ${Math.round(checkMs / 1000)}s (configura WEB_PUBLIC_ORIGIN HTTPS para push instantáneo)`);
    }

    try {
        const { startTikTokLiveMonitor } = require('./tiktok-live-monitor');
        startTikTokLiveMonitor(client);
    } catch (err) {
        console.warn('TikTok live monitor no iniciado:', err?.message || err);
    }
}

function stopStreamAlertScheduler() {
    if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
    }
    try {
        const { stopTikTokLiveMonitor } = require('./tiktok-live-monitor');
        stopTikTokLiveMonitor();
    } catch {
        // ignore
    }
}

module.exports = {
    startStreamAlertScheduler,
    stopStreamAlertScheduler,
    runStreamAlertSweep,
    buildStreamAlertEmbed: buildEmbed,
    handleTwitchStreamOnlineEvent,
    handleYouTubeLiveEvent,
    handleTikTokLiveEvent,
    handleFeedPushEvent
};
