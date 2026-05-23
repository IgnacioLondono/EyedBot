/**
 * Cliente mínimo Twitch Helix para alertas de directo (token app + streams por login).
 */
const FETCH_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.STREAM_ALERT_FETCH_TIMEOUT_MS || '12000', 10));

let twitchTokenCache = { accessToken: '', expiresAt: 0 };

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

async function getTwitchAppAccessToken(clientId, clientSecret) {
    if (!clientId || !clientSecret) return '';

    const now = Date.now();
    if (twitchTokenCache.accessToken && twitchTokenCache.expiresAt > now + 10_000) {
        return twitchTokenCache.accessToken;
    }

    const tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
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

function resolveTwitchThumbnailTemplate(template) {
    if (!template) return '';
    return String(template).replace('{width}', '1280').replace('{height}', '720');
}

/**
 * @returns {Promise<{ login: string, title: string, gameName: string, previewUrl: string, viewerCount: number, startedAt: string } | null>}
 */
async function fetchTwitchLiveByLogin(login) {
    const TWITCH_CLIENT_ID = String(process.env.TWITCH_CLIENT_ID || '').trim();
    const TWITCH_CLIENT_SECRET = String(process.env.TWITCH_CLIENT_SECRET || '').trim();
    const cleanLogin = String(login || '').trim().replace(/^@/, '').toLowerCase();
    if (!cleanLogin || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return null;

    try {
        const token = await getTwitchAppAccessToken(TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET);
        if (!token) return null;

        const streamsUrl = new URL('https://api.twitch.tv/helix/streams');
        streamsUrl.searchParams.set('user_login', cleanLogin);
        const streamsData = await fetchJsonWithTimeout(streamsUrl.toString(), {
            headers: {
                Authorization: `Bearer ${token}`,
                'Client-Id': TWITCH_CLIENT_ID
            }
        });
        const stream = Array.isArray(streamsData?.data) ? streamsData.data[0] : null;
        if (!stream) return null;

        let previewUrl = '';
        if (stream.thumbnail_url) {
            previewUrl = resolveTwitchThumbnailTemplate(stream.thumbnail_url);
        }
        if (!previewUrl) {
            previewUrl = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${cleanLogin}-1280x720.jpg`;
        }

        return {
            streamId: String(stream.id || ''),
            login: cleanLogin,
            title: String(stream.title || '').trim(),
            gameName: String(stream.game_name || '').trim(),
            previewUrl,
            viewerCount: Number(stream.viewer_count || 0),
            startedAt: String(stream.started_at || '')
        };
    } catch {
        return null;
    }
}

function extractTwitchLoginFromUrlOrName(source = {}) {
    const url = String(source.url || '').trim();
    if (url) {
        const match = url.match(/twitch\.tv\/([^/?#]+)/i);
        if (match?.[1]) return String(match[1]).trim().replace(/^@/, '');
    }
    return String(source.name || '').trim().replace(/^@/, '');
}

function getTwitchClientCredentials() {
    return {
        clientId: String(process.env.TWITCH_CLIENT_ID || '').trim(),
        clientSecret: String(process.env.TWITCH_CLIENT_SECRET || '').trim()
    };
}

async function twitchAppHelixRequest(path, options = {}) {
    const { clientId, clientSecret } = getTwitchClientCredentials();
    if (!clientId || !clientSecret) return null;

    const token = await getTwitchAppAccessToken(clientId, clientSecret);
    if (!token) return null;

    const cleanPath = String(path || '').replace(/^\//, '');
    const url = new URL(`https://api.twitch.tv/helix/${cleanPath}`);
    const params = options.searchParams || {};
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
            for (const entry of value) url.searchParams.append(key, String(entry));
        } else {
            url.searchParams.set(key, String(value));
        }
    }

    return fetchJsonWithTimeout(url.toString(), {
        method: options.method || 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            'Client-Id': clientId,
            'Content-Type': 'application/json'
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    });
}

module.exports = {
    fetchTwitchLiveByLogin,
    extractTwitchLoginFromUrlOrName,
    resolveTwitchThumbnailTemplate,
    getTwitchClientCredentials,
    twitchAppHelixRequest,
    cacheBustPreviewUrl(url) {
        const raw = String(url || '').trim();
        if (!raw) return '';
        try {
            const u = new URL(raw);
            if (/twitch\.tv|jtvnw\.net/i.test(u.hostname)) {
                u.searchParams.set('t', String(Date.now()));
                return u.toString();
            }
        } catch {
            return raw;
        }
        return raw;
    }
};
