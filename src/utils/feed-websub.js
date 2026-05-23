const { URLSearchParams } = require('url');
const { parseFeedAllItems } = require('./stream-alert-feed');
const { buildWebhookUrl, isStreamPushConfigured } = require('./stream-push-common');

const HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';
const LEASE_SECONDS = Math.max(3600, Number.parseInt(process.env.FEED_WEBSUB_LEASE_SECONDS || '864000', 10));
const SYNC_DEBOUNCE_MS = 2500;

let syncTimer = null;
let syncInFlight = false;

function isFeedWebSubConfigured() {
    return isStreamPushConfigured();
}

function resolveCallbackUrl() {
    return buildWebhookUrl('webhooks/feed/websub');
}

async function collectFeedTopics() {
    const streamAlertStore = require('./stream-alert-store');
    const topics = new Map();

    const all = await streamAlertStore.listAllStreamAlertConfigs();
    for (const entry of all) {
        const config = entry?.config;
        if (!config || config.enabled !== true || !config.channelId) continue;

        for (const source of config.sources || []) {
            if (!source || source.enabled === false) continue;
            const platform = String(source.platform || '').toLowerCase();
            if (!['tiktok', 'custom'].includes(platform)) continue;

            const feedUrl = String(source.feedUrl || '').trim();
            if (!feedUrl || !/^https?:\/\//i.test(feedUrl)) continue;
            topics.set(feedUrl, platform);
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
            'User-Agent': 'EyedBot/1.0 (feed-websub)'
        },
        body: body.toString()
    });

    return response.ok || response.status === 202 || response.status === 204;
}

async function syncFeedWebSubSubscriptions() {
    if (!isFeedWebSubConfigured()) return { skipped: true };
    if (syncInFlight) return { skipped: true, reason: 'busy' };
    syncInFlight = true;

    try {
        const topics = await collectFeedTopics();
        let ok = 0;
        for (const topic of topics.keys()) {
            const subscribed = await hubRequest(topic, 'subscribe').catch(() => false);
            if (subscribed) ok += 1;
        }
        console.log(`📰 Feed WebSub sync: ${ok}/${topics.size} feed(s) (TikTok/custom)`);
        return { topics: topics.size, subscribed: ok };
    } finally {
        syncInFlight = false;
    }
}

function scheduleFeedWebSubSync() {
    if (!isFeedWebSubConfigured()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        syncTimer = null;
        syncFeedWebSubSubscriptions().catch((err) => {
            console.error('Error sincronizando Feed WebSub:', err?.message || err);
        });
    }, SYNC_DEBOUNCE_MS);
}

function normalizeTopicUrl(url = '') {
    try {
        return new URL(String(url || '').trim()).toString();
    } catch {
        return String(url || '').trim();
    }
}

async function processFeedNotificationXml(xml, topicUrl = '') {
    const entries = parseFeedAllItems(xml);
    if (!entries.length) return;

    const { handleFeedPushEvent } = require('./stream-alert-scheduler');
    const client = require('./stream-push-runtime').getDiscordClient();
    if (!client) return;

    const entry = entries[0];
    const normalizedTopic = normalizeTopicUrl(topicUrl);

    await handleFeedPushEvent(client, {
        topicUrl: normalizedTopic,
        item: {
            itemId: `feed-push-${entry.itemId}`,
            title: entry.title,
            description: entry.description || 'Nueva publicación en el feed',
            url: entry.url,
            imageUrl: entry.imageUrl,
            publishedAt: entry.publishedAt
        }
    });
}

function handleFeedWebSubHttpRequest(req, res) {
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
    res.status(204).end();
    processFeedNotificationXml(rawBody, topic).catch((err) => {
        console.error('Error procesando Feed WebSub:', err?.message || err);
    });
}

module.exports = {
    isFeedWebSubConfigured,
    resolveCallbackUrl,
    scheduleFeedWebSubSync,
    syncFeedWebSubSubscriptions,
    handleFeedWebSubHttpRequest
};
