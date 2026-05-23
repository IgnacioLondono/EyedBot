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

function parseFeedItemBlock(block = '') {
    if (!block) return null;

    const guid = parseXmlTag(block, 'guid') || parseXmlTag(block, 'id');
    const title = decodeXmlEntities(parseXmlTag(block, 'title'));
    const description = decodeXmlEntities(parseXmlTag(block, 'description') || parseXmlTag(block, 'summary'));
    const link = decodeXmlEntities(extractFirstLink(block));
    const thumbnail = decodeXmlEntities(extractFirstThumbnail(block));
    const publishedAt = parseXmlTag(block, 'pubDate') || parseXmlTag(block, 'published') || parseXmlTag(block, 'updated');
    const videoId = parseXmlTag(block, 'yt:videoId')
        || (String(guid || '').match(/yt:video:([A-Za-z0-9_-]+)/i)?.[1] || '');
    const channelId = parseXmlTag(block, 'yt:channelId') || '';

    const itemId = guid || link || `${title}:${publishedAt}`;
    if (!itemId) return null;

    return {
        itemId: String(itemId).slice(0, 500),
        title: String(title || 'Nuevo directo'),
        description: String(description || '').slice(0, 1500),
        url: String(link || ''),
        imageUrl: String(thumbnail || ''),
        publishedAt: String(publishedAt || ''),
        videoId: String(videoId || ''),
        channelId: String(channelId || '')
    };
}

function parseFeedLatestItem(xml = '') {
    const entries = parseFeedAllItems(xml);
    return entries[0] || null;
}

function parseFeedAllItems(xml = '') {
    const raw = String(xml || '');
    const blocks = [
        ...(raw.match(/<item[\s\S]*?<\/item>/gi) || []),
        ...(raw.match(/<entry[\s\S]*?<\/entry>/gi) || [])
    ];
    const items = [];
    for (const block of blocks) {
        const parsed = parseFeedItemBlock(block);
        if (parsed) items.push(parsed);
    }
    return items;
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

function extractYouTubeChannelIdFromUrl(url = '') {
    const rawUrl = String(url || '').trim();
    if (!rawUrl) return '';

    const channelIdMatch = rawUrl.match(/(?:channel\/)([A-Za-z0-9_-]{10,})/i);
    if (channelIdMatch?.[1]) return channelIdMatch[1];

    const queryIdMatch = rawUrl.match(/[?&]channel_id=([A-Za-z0-9_-]{10,})/i);
    if (queryIdMatch?.[1]) return queryIdMatch[1];

    return '';
}

function extractYouTubeHandleFromUrl(url = '') {
    const rawUrl = String(url || '').trim();
    const handleMatch = rawUrl.match(/youtube\.com\/@([A-Za-z0-9._-]{2,})/i);
    return handleMatch?.[1] || '';
}

function extractTikTokUsernameFromSource(source = {}) {
    const feed = String(source.feedUrl || '').trim();
    const url = String(source.url || '').trim();
    const name = String(source.name || '').trim().replace(/^@/, '');

    for (const raw of [url, feed, name]) {
        if (!raw) continue;
        const match = raw.match(/tiktok\.com\/@([A-Za-z0-9._-]+)/i);
        if (match?.[1]) return match[1].toLowerCase();
    }

    if (name && /^[A-Za-z0-9._-]{2,}$/.test(name)) return name.toLowerCase();
    return '';
}

function looksLikeLiveStreamTitle(title = '') {
    const t = String(title || '').toLowerCase();
    return /\b(en\s+)?directo\b/.test(t)
        || /\blive\b/.test(t)
        || /\blivestream\b/.test(t)
        || /\bstreaming\b/.test(t)
        || /\b🔴\b/.test(t);
}

module.exports = {
    parseFeedLatestItem,
    parseFeedAllItems,
    parseFeedItemBlock,
    deriveYouTubeFeedUrl,
    extractYouTubeChannelIdFromUrl,
    extractYouTubeHandleFromUrl,
    extractTikTokUsernameFromSource,
    looksLikeLiveStreamTitle
};
