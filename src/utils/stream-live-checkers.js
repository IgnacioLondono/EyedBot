/**
 * Comprobación de directos sin API keys (adaptado de streamer-alerts-discord-bot).
 * Fallback cuando no hay Twitch Helix / YouTube API / EventSub configurados.
 */

const FETCH_TIMEOUT_MS = Math.max(5000, Number.parseInt(process.env.STREAM_ALERT_FETCH_TIMEOUT_MS || '15000', 10));
const TWITCH_GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';

const TWITCH_GQL_QUERY = `
  query GetUserStream($login: String!) {
    user(login: $login) {
      login displayName description profileImageURL(width: 300)
      followers { totalCount }
      roles { isPartner }
      stream {
        id title viewersCount createdAt language
        previewImageURL(width: 640, height: 360)
        game { name displayName boxArtURL(width: 144, height: 192) }
        tags { localizedName }
      }
    }
  }
`;

function parseFormattedNumber(raw) {
    const s = String(raw || '').trim().toUpperCase();
    const m = s.match(/^([\d.]+)\s*([KMB])?$/i);
    if (!m) return Number.parseInt(s.replace(/,/g, ''), 10) || undefined;
    let n = Number.parseFloat(m[1]);
    const u = (m[2] || '').toUpperCase();
    if (u === 'K') n *= 1000;
    if (u === 'M') n *= 1_000_000;
    if (u === 'B') n *= 1_000_000_000;
    return Math.round(n);
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EyedBot/1.0',
                ...(options.headers || {})
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return options.json === false ? response.text() : response.json();
    } finally {
        clearTimeout(timer);
    }
}

function baseStatus(platform, username, url) {
    return { isLive: false, platform, username, url };
}

async function checkTwitchLiveGql(username) {
    const login = String(username || '').replace(/^@/, '').trim().toLowerCase();
    const url = `https://twitch.tv/${login}`;
    const base = baseStatus('twitch', login, url);
    if (!login) return base;

    try {
        const data = await fetchWithTimeout('https://gql.twitch.tv/gql', {
            method: 'POST',
            headers: { 'Client-ID': TWITCH_GQL_CLIENT_ID, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: TWITCH_GQL_QUERY, variables: { login } })
        });
        const user = data?.data?.user;
        if (!user?.stream || user.stream.type !== 'live') return base;

        const stream = user.stream;
        return {
            isLive: true,
            platform: 'twitch',
            username: user.login || login,
            title: stream.title,
            viewers: stream.viewersCount,
            followers: user.followers?.totalCount,
            thumbnail: stream.previewImageURL,
            profileImage: user.profileImageURL,
            startedAt: stream.createdAt,
            url,
            verified: user.roles?.isPartner === true,
            category: stream.game?.displayName || stream.game?.name,
            categoryIcon: stream.game?.boxArtURL,
            tags: (stream.tags || []).map((t) => t.localizedName),
            language: stream.language
        };
    } catch {
        return base;
    }
}

async function checkYouTubeLiveHtml(username) {
    const handle = String(username || '').replace(/^@/, '').trim();
    const channelUrl = `https://www.youtube.com/@${handle}`;
    const liveUrl = `https://www.youtube.com/@${handle}/live`;
    const base = baseStatus('youtube', handle, channelUrl);
    if (!handle) return base;

    try {
        const html = await fetchWithTimeout(liveUrl, { json: false });
        const dataMatch = html.match(/var ytInitialData = ({.*?});/s);
        if (!dataMatch) {
            if (html.includes('"isLive":true')) return { ...base, isLive: true, url: liveUrl };
            return base;
        }

        const data = JSON.parse(dataMatch[1]);
        const contents = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
        if (!contents) return base;

        let primaryInfo;
        let secondaryInfo;
        for (const item of contents) {
            if (item.videoPrimaryInfoRenderer) primaryInfo = item.videoPrimaryInfoRenderer;
            if (item.videoSecondaryInfoRenderer) secondaryInfo = item.videoSecondaryInfoRenderer;
        }

        const viewCountRenderer = primaryInfo?.viewCount?.videoViewCountRenderer;
        if (viewCountRenderer?.isLive !== true) return base;

        const title = primaryInfo?.title?.runs?.[0]?.text;
        const viewers = viewCountRenderer?.originalViewCount
            ? Number.parseInt(viewCountRenderer.originalViewCount, 10)
            : undefined;
        const owner = secondaryInfo?.owner?.videoOwnerRenderer;
        const subsText = owner?.subscriberCountText?.simpleText || '';
        const subsMatch = subsText.match(/([\d.]+[KMB]?)/i);
        const thumbnails = owner?.thumbnail?.thumbnails;
        const videoIdMatch = html.match(/"videoId":"([^"]+)"/);
        const videoId = videoIdMatch?.[1];
        const streamUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : channelUrl;

        return {
            isLive: true,
            platform: 'youtube',
            username: owner?.title?.runs?.[0]?.text || handle,
            title,
            viewers,
            followers: subsMatch ? parseFormattedNumber(subsMatch[1]) : undefined,
            thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined,
            profileImage: thumbnails?.[thumbnails.length - 1]?.url,
            url: streamUrl
        };
    } catch {
        return base;
    }
}

async function checkKickLive(username) {
    const slug = String(username || '').replace(/^@/, '').trim().toLowerCase();
    const url = `https://kick.com/${slug}`;
    const base = baseStatus('kick', slug, url);
    if (!slug) return base;

    try {
        const data = await fetchWithTimeout(`https://kick.com/api/v2/channels/${slug}`, {
            headers: { Accept: 'application/json' }
        });
        if (!data?.livestream?.is_live) {
            return {
                ...base,
                followers: data?.followers_count,
                profileImage: data?.user?.profile_pic,
                verified: data?.verified === true
            };
        }

        const category = data.livestream?.categories?.[0];
        return {
            isLive: true,
            platform: 'kick',
            username: data.user?.username || slug,
            title: data.livestream.session_title,
            viewers: data.livestream.viewer_count,
            followers: data.followers_count,
            profileImage: data.user?.profile_pic,
            startedAt: data.livestream.start_time,
            url,
            verified: data.verified === true,
            category: category?.name,
            categoryIcon: data.recent_categories?.[0]?.banner?.url,
            tags: data.livestream.tags,
            language: data.livestream.language,
            isMature: data.livestream.is_mature
        };
    } catch {
        return base;
    }
}

async function checkRumbleLive(username) {
    const slug = String(username || '').replace(/^@/, '').trim().toLowerCase();
    const channelUrl = `https://rumble.com/c/${slug}`;
    const base = baseStatus('rumble', slug, channelUrl);
    if (!slug) return base;

    try {
        const html = await fetchWithTimeout(channelUrl, { json: false });
        const profileMatch = html.match(/class=["']channel-header--img["'][^>]*src=["']([^"']+)["']/);
        const nameMatch = html.match(/<h1>([^<]+)<\/h1>/);
        const verified = html.includes('channel-header--verified');
        const followersMatch = html.match(/([\d,]+)\s*Followers/);
        const followers = followersMatch?.[1]
            ? parseFormattedNumber(followersMatch[1].replace(/,/g, ''))
            : undefined;

        const isLive = html.includes('videostream__status--live') || html.includes('thumbnail__thumb--live');
        if (!isLive) {
            return { ...base, username: nameMatch?.[1]?.trim() || slug, followers, profileImage: profileMatch?.[1], verified };
        }

        const titleMatch = html.match(/class=["']thumbnail__title[^"']*["'][^>]*>([^<]+)/);
        const viewersMatch = html.match(/videostream__views-ppv["'][^>]*>[\s\S]*?<span class=["']videostream__number["']>\s*(\d+)/);
        const thumbMatch = html.match(/class=["']thumbnail__image[^"']*["'][^>]*src=["']([^"']+)["']/);
        const urlMatch = html.match(/class=["']videostream__link[^"']*["'][^>]*href=["']([^"']+)["']/);
        const streamUrl = urlMatch?.[1] ? `https://rumble.com${urlMatch[1].split('?')[0]}` : channelUrl;

        return {
            isLive: true,
            platform: 'rumble',
            username: nameMatch?.[1]?.trim() || slug,
            title: titleMatch?.[1]?.trim(),
            viewers: viewersMatch?.[1] ? Number.parseInt(viewersMatch[1], 10) : undefined,
            followers,
            thumbnail: thumbMatch?.[1],
            profileImage: profileMatch?.[1],
            url: streamUrl,
            verified
        };
    } catch {
        return base;
    }
}

function liveStatusToAlertItem(status, source, stateKeyPrefix) {
    if (!status?.isLive) return null;

    const sessionId = `${stateKeyPrefix}-${Date.now()}`;
    const login = status.username || source.name;

    return {
        itemId: sessionId,
        title: status.title || `${login} está en directo`,
        description: [
            status.category ? `**${status.category}**` : null,
            status.viewers != null ? `👀 ${status.viewers} espectadores` : null,
            status.followers != null ? `👥 ${status.followers} seguidores` : null
        ].filter(Boolean).join(' · ') || `En vivo en ${status.platform}`,
        url: status.url || source.url,
        imageUrl: status.thumbnail || status.profileImage || source.imageUrl,
        publishedAt: status.startedAt || new Date().toISOString(),
        liveStatus: status
    };
}

module.exports = {
    checkTwitchLiveGql,
    checkYouTubeLiveHtml,
    checkKickLive,
    checkRumbleLive,
    liveStatusToAlertItem,
    parseFormattedNumber
};
