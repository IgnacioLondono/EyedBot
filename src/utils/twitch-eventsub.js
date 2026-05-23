const crypto = require('crypto');
const {
    twitchAppHelixRequest,
    getTwitchClientCredentials
} = require('./twitch-stream-api');

const EVENTSUB_TYPE = 'stream.online';
const EVENTSUB_VERSION = '1';
const SYNC_DEBOUNCE_MS = 2500;

let syncTimer = null;
let syncInFlight = false;

function envValue(name, fallback = '') {
    const raw = process.env[name];
    if (raw === undefined || raw === null) return fallback;
    return String(raw).trim();
}

function resolveEventSubSecret() {
    return envValue('TWITCH_EVENTSUB_SECRET') || envValue('TWITCH_CLIENT_SECRET');
}

function resolveCallbackUrl() {
    const explicit = envValue('TWITCH_EVENTSUB_CALLBACK_URL');
    if (explicit) return explicit;

    const origin = envValue('WEB_PUBLIC_ORIGIN')
        || envValue('PUBLIC_WEB_URL')
        || envValue('WEB_PUBLIC_BASE_URL');
    if (!origin) return '';

    const base = origin.replace(/\/$/, '');
    return `${base}/webhooks/twitch/eventsub`;
}

function isTwitchEventSubConfigured() {
    const { clientId, clientSecret } = getTwitchClientCredentials();
    const callback = resolveCallbackUrl();
    const secret = resolveEventSubSecret();
    const disabled = envValue('TWITCH_EVENTSUB_ENABLED').toLowerCase() === 'false';
    if (disabled) return false;
    return Boolean(clientId && clientSecret && callback && secret && /^https:\/\//i.test(callback));
}

function verifyMessageSignature(secret, messageId, timestamp, rawBody, signatureHeader) {
    if (!secret || !messageId || !timestamp || !signatureHeader || !rawBody) return false;
    const payload = Buffer.concat([
        Buffer.from(String(messageId)),
        Buffer.from(String(timestamp)),
        Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody))
    ]);
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(payload).digest('hex')}`;
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signatureHeader)));
    } catch {
        return false;
    }
}

async function collectDesiredBroadcasterLogins() {
    const streamAlertStore = require('./stream-alert-store');
    const { extractTwitchLoginFromUrlOrName } = require('./twitch-stream-api');
    const logins = new Set();

    const all = await streamAlertStore.listAllStreamAlertConfigs();
    for (const entry of all) {
        const config = entry?.config;
        if (!config || config.enabled !== true || !config.channelId) continue;

        for (const source of config.sources || []) {
            if (!source || source.enabled === false) continue;
            if (String(source.platform || '').toLowerCase() !== 'twitch') continue;
            const login = extractTwitchLoginFromUrlOrName(source);
            if (login) logins.add(login.toLowerCase());
        }
    }

    return logins;
}

async function resolveBroadcasterUserIds(logins) {
    const list = Array.from(logins);
    const map = new Map();
    if (!list.length) return map;

    for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100);
        const data = await twitchAppHelixRequest('users', {
            searchParams: { login: chunk }
        });
        for (const user of data?.data || []) {
            const login = String(user.login || '').toLowerCase();
            const id = String(user.id || '');
            if (login && id) map.set(login, id);
        }
    }

    return map;
}

async function listStreamOnlineSubscriptions() {
    const subs = [];
    let cursor = '';

    do {
        const data = await twitchAppHelixRequest('eventsub/subscriptions', {
            searchParams: {
                type: EVENTSUB_TYPE,
                ...(cursor ? { after: cursor } : {})
            }
        });
        for (const row of data?.data || []) {
            subs.push(row);
        }
        cursor = data?.pagination?.cursor || '';
    } while (cursor);

    return subs;
}

async function createStreamOnlineSubscription(broadcasterUserId) {
    const callback = resolveCallbackUrl();
    const secret = resolveEventSubSecret();
    return twitchAppHelixRequest('eventsub/subscriptions', {
        method: 'POST',
        body: {
            type: EVENTSUB_TYPE,
            version: EVENTSUB_VERSION,
            condition: { broadcaster_user_id: String(broadcasterUserId) },
            transport: {
                method: 'webhook',
                callback,
                secret
            }
        }
    });
}

async function deleteSubscription(subscriptionId) {
    if (!subscriptionId) return;
    await twitchAppHelixRequest('eventsub/subscriptions', {
        method: 'DELETE',
        searchParams: { id: subscriptionId }
    });
}

async function syncTwitchEventSubSubscriptions() {
    if (!isTwitchEventSubConfigured()) return { skipped: true };

    if (syncInFlight) return { skipped: true, reason: 'busy' };
    syncInFlight = true;

    try {
        const desiredLogins = await collectDesiredBroadcasterLogins();
        const loginToUserId = await resolveBroadcasterUserIds(desiredLogins);
        const desiredUserIds = new Set(loginToUserId.values());

        const existing = await listStreamOnlineSubscriptions();
        const existingByUserId = new Map();
        for (const sub of existing) {
            const userId = String(sub?.condition?.broadcaster_user_id || '');
            if (!userId) continue;
            existingByUserId.set(userId, sub);
        }

        let removed = 0;
        for (const [userId, sub] of existingByUserId.entries()) {
            if (desiredUserIds.has(userId)) continue;
            await deleteSubscription(sub.id).catch(() => null);
            removed += 1;
        }

        let created = 0;
        for (const userId of desiredUserIds) {
            if (existingByUserId.has(userId)) continue;
            const result = await createStreamOnlineSubscription(userId).catch((err) => {
                console.warn('EventSub create failed:', err?.message || err);
                return null;
            });
            if (result?.data?.length) created += 1;
        }

        console.log(`📡 Twitch EventSub sync: ${desiredUserIds.size} canal(es), +${created} suscripción(es), -${removed}`);
        return { desired: desiredUserIds.size, created, removed };
    } finally {
        syncInFlight = false;
    }
}

function scheduleTwitchEventSubSync() {
    if (!isTwitchEventSubConfigured()) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        syncTimer = null;
        syncTwitchEventSubSubscriptions().catch((err) => {
            console.error('Error sincronizando Twitch EventSub:', err?.message || err);
        });
    }, SYNC_DEBOUNCE_MS);
}

function setDiscordClient(client) {
    require('./stream-push-runtime').setDiscordClient(client);
}

async function processStreamOnlineNotification(body) {
    const event = body?.event;
    if (!event) return;

    const login = String(event.broadcaster_user_login || '').toLowerCase();
    const client = require('./stream-push-runtime').getDiscordClient();
    if (!login || !client) return;

    const { handleTwitchStreamOnlineEvent } = require('./stream-alert-scheduler');
    await handleTwitchStreamOnlineEvent(client, {
        streamId: String(event.id || ''),
        login,
        broadcasterUserId: String(event.broadcaster_user_id || ''),
        broadcasterDisplayName: String(event.broadcaster_user_name || login),
        startedAt: String(event.started_at || new Date().toISOString()),
        type: String(event.type || 'live')
    });
}

function handleTwitchEventSubHttpRequest(req, res) {
    const secret = resolveEventSubSecret();
    const messageId = req.headers['twitch-eventsub-message-id'];
    const timestamp = req.headers['twitch-eventsub-message-timestamp'];
    const signature = req.headers['twitch-eventsub-message-signature'];
    const messageType = req.headers['twitch-eventsub-message-type'];
    const rawBody = req.body;

    if (!verifyMessageSignature(secret, messageId, timestamp, rawBody, signature)) {
        return res.status(403).send('Forbidden');
    }

    let body = {};
    try {
        body = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '{}'));
    } catch {
        return res.status(400).send('Bad Request');
    }

    if (messageType === 'webhook_callback_verification') {
        return res.status(200).type('text/plain').send(String(body.challenge || ''));
    }

    if (messageType === 'notification' && body.subscription?.type === EVENTSUB_TYPE) {
        res.status(204).end();
        processStreamOnlineNotification(body).catch((err) => {
            console.error('Error procesando stream.online:', err?.message || err);
        });
        return;
    }

    if (messageType === 'revocation') {
        console.warn('⚠️ Twitch EventSub revocado:', body.subscription?.id, body.subscription?.status);
        scheduleTwitchEventSubSync();
    }

    return res.status(204).end();
}

module.exports = {
    isTwitchEventSubConfigured,
    resolveCallbackUrl,
    setDiscordClient,
    scheduleTwitchEventSubSync,
    syncTwitchEventSubSubscriptions,
    handleTwitchEventSubHttpRequest
};
