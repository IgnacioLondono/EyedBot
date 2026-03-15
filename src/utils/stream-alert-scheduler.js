const { EmbedBuilder } = require('discord.js');
const streamAlertStore = require('./stream-alert-store');

const STREAM_ALERT_CHECK_MS = Math.max(30_000, Number.parseInt(process.env.STREAM_ALERT_CHECK_MS || '120000', 10));
const FETCH_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.STREAM_ALERT_FETCH_TIMEOUT_MS || '12000', 10));

let intervalRef = null;
let running = false;
const liveState = new Map();

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

function extractTwitchLogin(source) {
    const url = String(source.url || '').trim();
    if (!url) return String(source.name || '').trim().replace(/^@/, '');

    const match = url.match(/twitch\.tv\/([^/?#]+)/i);
    if (match?.[1]) return String(match[1]).trim().replace(/^@/, '');
    return String(source.name || '').trim().replace(/^@/, '');
}

async function resolveTwitchLive(source) {
    const login = extractTwitchLogin(source);
    if (!login) return null;

    try {
        const uptimeRaw = await fetchWithTimeout(`https://decapi.me/twitch/uptime/${encodeURIComponent(login)}`);
        const uptimeText = String(uptimeRaw || '').trim().toLowerCase();
        const stateKey = `twitch:${login}`;

        if (!uptimeText || uptimeText.includes('offline')) {
            liveState.set(stateKey, false);
            return null;
        }

        const wasLive = liveState.get(stateKey) === true;
        liveState.set(stateKey, true);

        return {
            itemId: `twitch-live-${login}`,
            title: `${source.name || login} está en directo`,
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

    const title = applyTemplate(config.titleTemplate || '🔴 {platform}: {name} en directo', values).slice(0, 256);
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
