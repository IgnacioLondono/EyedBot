const { EmbedBuilder } = require('discord.js');
const streamAlertStore = require('./stream-alert-store');

const STREAM_ALERT_CHECK_MS = Math.max(30_000, Number.parseInt(process.env.STREAM_ALERT_CHECK_MS || '120000', 10));
const FETCH_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.STREAM_ALERT_FETCH_TIMEOUT_MS || '12000', 10));
const TWITCH_CLIENT_ID = String(process.env.TWITCH_CLIENT_ID || '').trim();
const TWITCH_CLIENT_SECRET = String(process.env.TWITCH_CLIENT_SECRET || '').trim();
const YOUTUBE_API_KEY = String(process.env.YOUTUBE_API_KEY || '').trim();

let intervalRef = null;
let running = false;
const liveState = new Map();
const liveSessionState = new Map();
let twitchTokenCache = { accessToken: '', expiresAt: 0 };

function applyTemplate(template = '', values = {}) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
        const value = values[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

function parseXmlTag(xml = '', tagName = '') {
    const safe = String(tagName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`<${safe}[^>]*>([\\s\\S]*?)</${safe}>`, 'i');
    const match = String(xml || '').match(regex);
    return match?.[1] ? String(match[1]).trim() : '';
}

function decodeXmlEntities(text = '') {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function extractFirstLink(block = '') {
    const attrMatch = String(block || '').match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
    if (attrMatch?.[1]) return attrMatch[1];

    const textMatch = String(block || '').match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (textMatch?.[1]) return decodeXmlEntities(textMatch[1].trim());
    return '';
}

function extractFirstThumbnail(block = '') {
    const mediaMatch = String(block || '').match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i);
    if (mediaMatch?.[1]) return mediaMatch[1];

    const enclosureMatch = String(block || '').match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
    if (enclosureMatch?.[1]) return enclosureMatch[1];

    const imgMatch = String(block || '').match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
    if (imgMatch?.[1]) return imgMatch[1];

    return '';
}

function parseFeedLatestItem(xml = '') {
    const raw = String(xml || '');
    const itemMatch = raw.match(/<item[\s\S]*?<\/item>/i);
    const entryMatch = raw.match(/<entry[\s\S]*?<\/entry>/i);
    const block = itemMatch?.[0] || entryMatch?.[0] || '';
    if (!block) return null;

    const guid = parseXmlTag(block, 'guid') || parseXmlTag(block, 'id');
    const title = decodeXmlEntities(parseXmlTag(block, 'title'));
    const description = decodeXmlEntities(parseXmlTag(block, 'description') || parseXmlTag(block, 'summary'));
    const link = decodeXmlEntities(extractFirstLink(block));
    const thumbnail = decodeXmlEntities(extractFirstThumbnail(block));
    const publishedAt = parseXmlTag(block, 'pubDate') || parseXmlTag(block, 'published') || parseXmlTag(block, 'updated');

    const itemId = guid || link || `${title}:${publishedAt}`;
    if (!itemId) return null;

    return {
        itemId: String(itemId).slice(0, 500),
        title: String(title || 'Nuevo directo'),
        description: String(description || '').slice(0, 1500),
        url: String(link || ''),
        imageUrl: String(thumbnail || ''),
        publishedAt: String(publishedAt || '')
    };
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

async function fetchJsonWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'EyedBot/1.0 (stream-alerts)',
                ...(options.headers || {})
            },
            body: options.body
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

function deriveYouTubeFeedUrl(source) {
    const directFeed = String(source.feedUrl || '').trim();
    if (directFeed) return directFeed;

    const rawUrl = String(source.url || '').trim();
    if (!rawUrl) return '';

    const channelIdMatch = rawUrl.match(/(?:channel\/)([A-Za-z0-9_-]{10,})/i);
    if (channelIdMatch?.[1]) {
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
    }

    const queryIdMatch = rawUrl.match(/[?&]channel_id=([A-Za-z0-9_-]{10,})/i);
    if (queryIdMatch?.[1]) {
        return `https://www.youtube.com/feeds/videos.xml?channel_id=${queryIdMatch[1]}`;
    }

    return '';
}

function resolveFeedUrl(source) {
    if (String(source.platform) === 'youtube') {
        return deriveYouTubeFeedUrl(source);
    }

    return String(source.feedUrl || '').trim();
}

function extractYouTubeChannelId(source) {
    const rawUrl = String(source.url || '').trim();
    if (!rawUrl) return '';

    const channelIdMatch = rawUrl.match(/(?:channel\/)([A-Za-z0-9_-]{10,})/i);
    if (channelIdMatch?.[1]) return channelIdMatch[1];

    const queryIdMatch = rawUrl.match(/[?&]channel_id=([A-Za-z0-9_-]{10,})/i);
    if (queryIdMatch?.[1]) return queryIdMatch[1];

    return '';
}

async function resolveYouTubeLive(source) {
    if (!YOUTUBE_API_KEY) return null;

    const channelId = extractYouTubeChannelId(source);
    if (!channelId) return null;

    try {
        const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
        searchUrl.searchParams.set('part', 'id,snippet');
        searchUrl.searchParams.set('channelId', channelId);
        searchUrl.searchParams.set('eventType', 'live');
        searchUrl.searchParams.set('type', 'video');
        searchUrl.searchParams.set('order', 'date');
        searchUrl.searchParams.set('maxResults', '1');
        searchUrl.searchParams.set('key', YOUTUBE_API_KEY);
        const searchData = await fetchJsonWithTimeout(searchUrl.toString());
        const liveItem = Array.isArray(searchData?.items) ? searchData.items[0] : null;
        if (!liveItem?.id?.videoId) return null;

        const videoId = String(liveItem.id.videoId);
        const stateKey = `youtube:${channelId}`;
        const wasLive = liveState.get(stateKey) === true;
        liveState.set(stateKey, true);

        let sessionId = liveSessionState.get(stateKey);
        if (!sessionId || !sessionId.includes(videoId)) {
            sessionId = `youtube-live-${channelId}-${videoId}`;
            liveSessionState.set(stateKey, sessionId);
        }

        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const title = String(liveItem?.snippet?.title || `${source.name || 'Canal'} en directo`).trim();
        const channelTitle = String(liveItem?.snippet?.channelTitle || source.name || '').trim();
        const thumbnail = liveItem?.snippet?.thumbnails?.high?.url
            || liveItem?.snippet?.thumbnails?.medium?.url
            || liveItem?.snippet?.thumbnails?.default?.url
            || '';

        return {
            itemId: sessionId,
            title,
            description: channelTitle ? `${channelTitle} está en directo en YouTube` : 'Directo activo en YouTube',
            url: videoUrl,
            imageUrl: source.imageUrl || thumbnail,
            publishedAt: String(liveItem?.snippet?.publishedAt || new Date().toISOString()),
            skipIfAlreadySeen: wasLive
        };
    } catch {
        return null;
    }
}

function extractTwitchLogin(source) {
    const url = String(source.url || '').trim();
    if (!url) return String(source.name || '').trim().replace(/^@/, '');

    const match = url.match(/twitch\.tv\/([^/?#]+)/i);
    if (match?.[1]) return String(match[1]).trim().replace(/^@/, '');
    return String(source.name || '').trim().replace(/^@/, '');
}

async function getTwitchAppAccessToken() {
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return '';

    const now = Date.now();
    if (twitchTokenCache.accessToken && twitchTokenCache.expiresAt > now + 10_000) {
        return twitchTokenCache.accessToken;
    }

    const tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
    tokenUrl.searchParams.set('client_id', TWITCH_CLIENT_ID);
    tokenUrl.searchParams.set('client_secret', TWITCH_CLIENT_SECRET);
    tokenUrl.searchParams.set('grant_type', 'client_credentials');
    const tokenData = await fetchJsonWithTimeout(tokenUrl.toString(), { method: 'POST' });

    const accessToken = String(tokenData?.access_token || '');
    const expiresInSec = Math.max(60, Number.parseInt(String(tokenData?.expires_in || '0'), 10) || 3600);
    if (!accessToken) return '';

    twitchTokenCache = {
        accessToken,
        expiresAt: now + (expiresInSec * 1000)
    };
    return accessToken;
}

async function resolveTwitchLiveViaApi(source) {
    const login = extractTwitchLogin(source);
    if (!login || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return null;

    try {
        const token = await getTwitchAppAccessToken();
        if (!token) return null;

        const streamsUrl = new URL('https://api.twitch.tv/helix/streams');
        streamsUrl.searchParams.set('user_login', login);
        const streamsData = await fetchJsonWithTimeout(streamsUrl.toString(), {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Client-Id': TWITCH_CLIENT_ID
            }
        });
        const stream = Array.isArray(streamsData?.data) ? streamsData.data[0] : null;

        const stateKey = `twitch:${login}`;
        if (!stream) {
            liveState.set(stateKey, false);
            liveSessionState.delete(stateKey);
            return null;
        }

        const wasLive = liveState.get(stateKey) === true;
        liveState.set(stateKey, true);
        const streamId = String(stream.id || '');
        let sessionId = liveSessionState.get(stateKey);
        if (!sessionId || (streamId && !sessionId.includes(streamId))) {
            sessionId = streamId ? `twitch-live-${login}-${streamId}` : `twitch-live-${login}-${Date.now()}`;
            liveSessionState.set(stateKey, sessionId);
        }

        let previewUrl = '';
        if (stream.thumbnail_url) {
            previewUrl = String(stream.thumbnail_url)
                .replace('{width}', '1280')
                .replace('{height}', '720');
        }

        return {
            itemId: sessionId,
            title: String(stream.title || `${source.name || login} está en directo`),
            description: `En vivo en Twitch (${String(stream.game_name || 'Sin categoría')})`,
            url: String(source.url || `https://twitch.tv/${login}`),
            imageUrl: source.imageUrl || previewUrl || `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`,
            publishedAt: String(stream.started_at || new Date().toISOString()),
            skipIfAlreadySeen: wasLive
        };
    } catch {
        return null;
    }
}

async function resolveTwitchLive(source) {
    const fromApi = await resolveTwitchLiveViaApi(source);
    if (fromApi) return fromApi;

    const login = extractTwitchLogin(source);
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

        return {
            itemId: sessionId,
            title: liveTitle || `${source.name || login} está en directo`,
            description: `En vivo en Twitch (${uptimeRaw.trim()})`,
            url: String(source.url || `https://twitch.tv/${login}`),
            imageUrl: source.imageUrl || `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`,
            publishedAt: new Date().toISOString(),
            skipIfAlreadySeen: wasLive
        };
    } catch {
        return null;
    }
}

async function resolveLatestItemFromSource(source) {
    if (source.enabled === false) return null;

    if (String(source.platform) === 'twitch' && !String(source.feedUrl || '').trim()) {
        return resolveTwitchLive(source);
    }

    if (String(source.platform) === 'youtube') {
        const youtubeLive = await resolveYouTubeLive(source);
        if (youtubeLive) return youtubeLive;
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

    const imageUrl = String(item.imageUrl || source.imageUrl || '').trim();
    if (imageUrl) embed.setImage(imageUrl);

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
            if (String(source.platform || '').toLowerCase() === 'twitch') {
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

function startStreamAlertScheduler(client) {
    if (!client || intervalRef) return;
    intervalRef = setInterval(() => {
        runStreamAlertSweep(client).catch(() => null);
    }, STREAM_ALERT_CHECK_MS);

    runStreamAlertSweep(client).catch(() => null);
    console.log(`📡 Stream alerts scheduler activo cada ${Math.round(STREAM_ALERT_CHECK_MS / 1000)}s`);
}

function stopStreamAlertScheduler() {
    if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
    }
}

module.exports = {
    startStreamAlertScheduler,
    stopStreamAlertScheduler,
    runStreamAlertSweep
};
