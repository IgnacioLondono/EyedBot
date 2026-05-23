const { URLSearchParams } = require('url');
const {
    deriveYouTubeFeedUrl,
    parseFeedAllItems,
    looksLikeLiveStreamTitle
} = require('./stream-alert-feed');
const { resolveYouTubeChannelId, fetchYouTubeVideoLiveInfo } = require('./stream-youtube-api');
const { buildWebhookUrl, isStreamPushConfigured } = require('./stream-push-common');

const HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';
const LEASE_SECONDS = Math.max(3600, Number.parseInt(process.env.YOUTUBE_WEBSUB_LEASE_SECONDS || '864000', 10));
const SYNC_DEBOUNCE_MS = 2500;

let syncTimer = null;
let syncInFlight = false;

function isYouTubeWebSubConfigured() {
    return isStreamPushConfigured();
}

function resolveCallbackUrl() {
    return buildWebhookUrl('webhooks/youtube/websub');
}

async function collectYouTubeTopics() {
    const streamAlertStore = require('./stream-alert-store');
    const topics = new Map();

    const all = await streamAlertStore.listAllStreamAlertConfigs();
    for (const entry of all) {
        const config = entry?.config;
        if (!config || config.enabled !== true || !config.channelId) continue;

        for (const source of config.sources || []) {
            if (!source || source.enabled === false) continue;
            if (String(source.platform || '').toLowerCase() !== 'youtube') continue;

            const channelId = await resolveYouTubeChannelId(source);
            const topic = channelId
                ? `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
                : deriveYouTubeFeedUrl(source);
            if (!topic) continue;
            topics.set(topic, channelId || '');
        }
    }

    return topics;
}

async function hubRequest(topic, mode = 'subscribe') {
    const callback = resolveCallbackUrl();
    if (!callback || !topic) return false;

    const body = new URLSearchParams({
        'hub.mode': mode,
        'hub.topic': topic,
        'hub.callback': callback,
        'hub.verify': 'async',
        'hub.lease_seconds': String(LEASE_SECONDS)
    });

    const response = await fetch(HUB_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'EyedBot/1.0 (youtube-websub)'
        },
        body: body.toString()
    });

    return response.ok || response.status === 202 || response.status === 204;
}

async function syncYouTubeWebSubSubscriptions() {
    if (!isYouTubeWebSubConfigured()) return { skipped: true };

    if (syncInFlight) return { skipped: true, reason: 'busy' };
    syncInFlight = true;

    try {
        const topics = await collectYouTubeTopics();
        let ok = 0;
        for (const topic of topics.keys()) {
            const subscribed = await hubRequest(topic, 'subscribe').catch(() => false);
            if (subscribed) ok += 1;
        }
        console.log(`📺 YouTube WebSub sync: ${ok}/${topics.size} feed(s)`);
        return { topics: topics.size, subscribed: ok };
    } finally {
        syncInFlight = false;
    }
}

function scheduleYouTubeWebSubSync() {
    if (!isYouTubeWebSubConfigured()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        syncTimer = null;
        syncYouTubeWebSubSubscriptions().catch((err) => {
            console.error('Error sincronizando YouTube WebSub:', err?.message || err);
        });
    }, SYNC_DEBOUNCE_MS);
}

async function processYouTubeNotificationXml(xml, hintedChannelId = '') {
    const entries = parseFeedAllItems(xml);
    if (!entries.length) return;

    const { handleYouTubeLiveEvent } = require('./stream-alert-scheduler');
    const client = require('./stream-push-runtime').getDiscordClient();
    if (!client) return;

    for (const entry of entries.slice(0, 3)) {
        const videoId = String(entry.videoId || '').trim()
            || String(entry.url || '').match(/[?&]v=([A-Za-z0-9_-]{6,})/)?.[1]
            || '';
        const channelId = String(entry.channelId || hintedChannelId || '').trim();

        let liveInfo = null;
        if (videoId) {
            liveInfo = await fetchYouTubeVideoLiveInfo(videoId);
        }

        if (!liveInfo && !videoId && looksLikeLiveStreamTitle(entry.title)) {
            liveInfo = {
                videoId: '',
                channelId,
                title: entry.title,
                description: entry.description || 'Nuevo directo en YouTube',
                url: entry.url,
                imageUrl: entry.imageUrl,
                publishedAt: entry.publishedAt || new Date().toISOString(),
                viewerCount: 0
            };
        }

        if (!liveInfo) continue;

        await handleYouTubeLiveEvent(client, {
            channelId: liveInfo.channelId || channelId,
            videoId: liveInfo.videoId || videoId,
            title: liveInfo.title,
            description: liveInfo.description,
            url: liveInfo.url || entry.url,
            imageUrl: liveInfo.imageUrl || entry.imageUrl,
            publishedAt: liveInfo.publishedAt,
            viewerCount: liveInfo.viewerCount
        });
        break;
    }
}

function handleYouTubeWebSubHttpRequest(req, res) {
    const query = req.query || {};
    const challenge = query['hub.challenge'] || query.hub?.challenge;
    if (challenge) {
        return res.status(200).type('text/plain').send(String(challenge));
    }

    if (req.method === 'GET') {
        return res.status(200).send('ok');
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    if (!rawBody.trim()) {
        return res.status(204).end();
    }

    const topic = String(query['hub.topic'] || '');
    const channelIdMatch = topic.match(/channel_id=([A-Za-z0-9_-]+)/i);
    const hintedChannelId = channelIdMatch?.[1] || '';

    res.status(204).end();
    processYouTubeNotificationXml(rawBody, hintedChannelId).catch((err) => {
        console.error('Error procesando YouTube WebSub:', err?.message || err);
    });
}

module.exports = {
    isYouTubeWebSubConfigured,
    resolveCallbackUrl,
    scheduleYouTubeWebSubSync,
    syncYouTubeWebSubSubscriptions,
    handleYouTubeWebSubHttpRequest
};
