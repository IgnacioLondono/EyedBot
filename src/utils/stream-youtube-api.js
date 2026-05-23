const FETCH_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.STREAM_ALERT_FETCH_TIMEOUT_MS || '12000', 10));
const YOUTUBE_API_KEY = String(process.env.YOUTUBE_API_KEY || '').trim();
const channelIdCache = new Map();

async function fetchJsonWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'User-Agent': 'EyedBot/1.0 (stream-alerts)' }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

async function resolveYouTubeChannelId(source = {}) {
    const {
        extractYouTubeChannelIdFromUrl,
        extractYouTubeHandleFromUrl,
        deriveYouTubeFeedUrl
    } = require('./stream-alert-feed');

    const fromUrl = extractYouTubeChannelIdFromUrl(source.url || '');
    if (fromUrl) return fromUrl;

    const feedUrl = deriveYouTubeFeedUrl(source);
    const fromFeed = extractYouTubeChannelIdFromUrl(feedUrl);
    if (fromFeed) return fromFeed;

    if (!YOUTUBE_API_KEY) return '';

    const handle = extractYouTubeHandleFromUrl(source.url || '');
    if (!handle) return '';

    const cacheKey = `handle:${handle.toLowerCase()}`;
    if (channelIdCache.has(cacheKey)) return channelIdCache.get(cacheKey);

    try {
        const url = new URL('https://www.googleapis.com/youtube/v3/channels');
        url.searchParams.set('part', 'id');
        url.searchParams.set('forHandle', handle);
        url.searchParams.set('key', YOUTUBE_API_KEY);
        const data = await fetchJsonWithTimeout(url.toString());
        const channelId = String(data?.items?.[0]?.id || '');
        if (channelId) channelIdCache.set(cacheKey, channelId);
        return channelId;
    } catch {
        return '';
    }
}

async function fetchYouTubeVideoLiveInfo(videoId) {
    if (!YOUTUBE_API_KEY || !videoId) return null;

    try {
        const url = new URL('https://www.googleapis.com/youtube/v3/videos');
        url.searchParams.set('part', 'snippet,liveStreamingDetails');
        url.searchParams.set('id', String(videoId));
        url.searchParams.set('key', YOUTUBE_API_KEY);
        const data = await fetchJsonWithTimeout(url.toString());
        const video = Array.isArray(data?.items) ? data.items[0] : null;
        if (!video) return null;

        const live = String(video?.snippet?.liveBroadcastContent || '').toLowerCase();
        if (live !== 'live') return null;

        const thumbs = video?.snippet?.thumbnails || {};
        const thumbnail = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || '';
        const channelId = String(video?.snippet?.channelId || '');
        const channelTitle = String(video?.snippet?.channelTitle || '');

        return {
            videoId: String(videoId),
            channelId,
            title: String(video?.snippet?.title || 'Directo en YouTube'),
            description: channelTitle ? `${channelTitle} está en directo en YouTube` : 'Directo activo en YouTube',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            imageUrl: thumbnail,
            publishedAt: String(video?.snippet?.publishedAt || new Date().toISOString()),
            viewerCount: Number(video?.liveStreamingDetails?.concurrentViewers || 0)
        };
    } catch {
        return null;
    }
}

async function fetchYouTubeChannelLiveViaApi(channelId, sourceName = 'Canal') {
    if (!YOUTUBE_API_KEY || !channelId) return null;

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

        return fetchYouTubeVideoLiveInfo(String(liveItem.id.videoId));
    } catch {
        return null;
    }
}

module.exports = {
    resolveYouTubeChannelId,
    fetchYouTubeVideoLiveInfo,
    fetchYouTubeChannelLiveViaApi
};
