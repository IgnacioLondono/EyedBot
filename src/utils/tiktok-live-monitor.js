const { extractTikTokUsernameFromSource } = require('./stream-alert-feed');
const { isFeedWebSubConfigured } = require('./feed-websub');

const CHECK_MS = Math.max(20_000, Number.parseInt(process.env.TIKTOK_LIVE_CHECK_MS || '40000', 10));
const FETCH_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.STREAM_ALERT_FETCH_TIMEOUT_MS || '12000', 10));

let intervalRef = null;
let clientRef = null;
const liveState = new Map();

async function fetchTextWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                Accept: 'text/html,application/json'
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.text();
    } finally {
        clearTimeout(timer);
    }
}

async function checkTikTokUserLive(username) {
    const user = String(username || '').trim().replace(/^@/, '').toLowerCase();
    if (!user) return null;

    const urls = [
        `https://www.tiktok.com/@${encodeURIComponent(user)}/live`,
        `https://www.tiktok.com/@${encodeURIComponent(user)}`
    ];

    for (const url of urls) {
        try {
            const html = await fetchTextWithTimeout(url);
            const isLive = /"isLive":\s*true/i.test(html)
                || /"liveRoomStatus":\s*2/i.test(html)
                || /"status":\s*2/i.test(html)
                || /"roomId":"\d{6,}"/i.test(html);
            if (!isLive) continue;

            const titleMatch = html.match(/"title":"([^"\\]+)"/i);
            const roomMatch = html.match(/"roomId":"(\d+)"/i);
            const avatarMatch = html.match(/"avatarLarger":"([^"\\]+)"/i)
                || html.match(/"avatarMedium":"([^"\\]+)"/i);

            return {
                username: user,
                roomId: roomMatch?.[1] || '',
                title: titleMatch?.[1] ? titleMatch[1].replace(/\\u0026/g, '&') : `${user} está en directo`,
                url: `https://www.tiktok.com/@${user}/live`,
                imageUrl: avatarMatch?.[1] ? avatarMatch[1].replace(/\\u002F/g, '/') : ''
            };
        } catch {
            // try next url
        }
    }

    return null;
}

async function collectTikTokUsernames() {
    const streamAlertStore = require('./stream-alert-store');
    const users = new Set();
    const all = await streamAlertStore.listAllStreamAlertConfigs();

    for (const entry of all) {
        const config = entry?.config;
        if (!config || config.enabled !== true || !config.channelId) continue;

        for (const source of config.sources || []) {
            if (!source || source.enabled === false) continue;
            if (String(source.platform || '').toLowerCase() !== 'tiktok') continue;
            if (String(source.feedUrl || '').trim() && isFeedWebSubConfigured()) continue;

            const username = extractTikTokUsernameFromSource(source);
            if (username) users.add(username);
        }
    }

    return users;
}

async function runTikTokLiveSweep() {
    if (!clientRef) return;

    const users = await collectTikTokUsernames();
    if (!users.size) return;

    const { handleTikTokLiveEvent } = require('./stream-alert-scheduler');

    for (const username of users) {
        const live = await checkTikTokUserLive(username).catch(() => null);
        const stateKey = `tiktok:${username}`;
        const wasLive = liveState.get(stateKey) === true;

        if (!live) {
            liveState.set(stateKey, false);
            continue;
        }

        liveState.set(stateKey, true);
        if (wasLive) continue;

        await handleTikTokLiveEvent(clientRef, live);
    }
}

function startTikTokLiveMonitor(client) {
    if (!client || intervalRef) return;
    clientRef = client;
    intervalRef = setInterval(() => {
        runTikTokLiveSweep().catch(() => null);
    }, CHECK_MS);

    runTikTokLiveSweep().catch(() => null);
    console.log(`🎵 TikTok live monitor cada ${Math.round(CHECK_MS / 1000)}s (sin feed WebSub)`);
}

function stopTikTokLiveMonitor() {
    if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
    }
    clientRef = null;
}

module.exports = {
    startTikTokLiveMonitor,
    stopTikTokLiveMonitor,
    checkTikTokUserLive,
    runTikTokLiveSweep
};
