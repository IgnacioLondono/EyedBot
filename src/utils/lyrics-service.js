const axios = require('axios');

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9,es;q=0.8'
};

function cacheKey(title, artist) {
    return `${(artist || '').toLowerCase().trim()}::${(title || '').toLowerCase().trim()}`;
}

function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        cache.delete(key);
        return null;
    }
    return hit.value;
}

function cacheSet(key, value) {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function decodeHtmlEntities(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&ndash;/g, '–')
        .replace(/&mdash;/g, '—')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(Number.parseInt(n, 16)));
}

function cleanTitle(rawTitle) {
    if (!rawTitle) return '';
    return rawTitle
        .replace(/\[[^\]]+\]/g, ' ')
        .replace(/\([^)]*(official|audio|video|lyrics|lyric|hd|4k|mv|mvid|lyric video|visualizer)[^)]*\)/gi, ' ')
        .replace(/\s+-\s+(official|audio|video|lyrics|lyric|hd|4k|mv|topic).*$/gi, ' ')
        .replace(/feat\.?|ft\.?/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanArtist(rawArtist) {
    if (!rawArtist) return '';
    return rawArtist
        .replace(/\s*-?\s*topic\s*$/gi, '')
        .replace(/VEVO/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function stripHtmlTags(html, lineBreakTags = ['br', 'p', 'div']) {
    if (!html) return '';
    let out = html;
    for (const tag of lineBreakTags) {
        out = out.replace(new RegExp(`</${tag}[^>]*>`, 'gi'), '\n');
        out = out.replace(new RegExp(`<${tag}[^>]*/?>`, 'gi'), '\n');
    }
    out = out.replace(/<[^>]+>/g, '');
    out = decodeHtmlEntities(out);
    out = out.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return out;
}

async function fetchLyricsOvh(title, artist) {
    if (!title || !artist) return null;
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const { data } = await axios.get(url, { timeout: 10000 }).catch(() => ({ data: null }));
    if (!data || typeof data !== 'object') return null;
    const lyrics = (data.lyrics || '').toString().trim();
    if (!lyrics || lyrics.length < 20) return null;
    return {
        source: 'lyrics.ovh',
        artist,
        title,
        lyrics: lyrics.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    };
}

async function searchGeniusPath(title, artist) {
    const query = [artist, title].filter(Boolean).join(' ').trim();
    if (!query) return null;

    const { data } = await axios.get('https://genius.com/api/search/multi', {
        timeout: 10000,
        params: { q: query, per_page: 5 },
        headers: BROWSER_HEADERS
    }).catch(() => ({ data: null }));

    const sections = data?.response?.sections || [];
    let best = null;
    for (const section of sections) {
        if (section.type !== 'song' && section.type !== 'top_hit') continue;
        for (const hit of section.hits || []) {
            const result = hit?.result;
            if (!result?.path) continue;
            if (result.type && result.type !== 'song') continue;
            if (!best) best = result;

            const titleMatch = (result.title || '').toLowerCase().includes((title || '').toLowerCase());
            const artistMatch = (result.primary_artist?.name || '').toLowerCase().includes((artist || '').toLowerCase());
            if (titleMatch && artistMatch) {
                best = result;
                break;
            }
        }
        if (best && (best.title || '').toLowerCase().includes((title || '').toLowerCase())) break;
    }

    if (!best?.path) return null;
    return {
        url: `https://genius.com${best.path}`,
        geniusTitle: best.title,
        geniusArtist: best.primary_artist?.name || null,
        thumbnail: best.song_art_image_thumbnail_url || best.header_image_thumbnail_url || null
    };
}

async function fetchGeniusLyrics(title, artist) {
    const path = await searchGeniusPath(title, artist).catch(() => null);
    if (!path?.url) return null;

    const { data: html } = await axios.get(path.url, {
        timeout: 12000,
        responseType: 'text',
        transformResponse: [(v) => v],
        headers: BROWSER_HEADERS
    }).catch(() => ({ data: null }));

    if (!html || typeof html !== 'string') return null;

    const containers = [];
    const regex = /<div[^>]+data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
    let match;
    while ((match = regex.exec(html))) {
        containers.push(match[1]);
    }

    if (!containers.length) {
        const legacyMatch = html.match(/<div[^>]+class="lyrics"[^>]*>([\s\S]*?)<\/div>/i);
        if (legacyMatch) containers.push(legacyMatch[1]);
    }

    if (!containers.length) return null;

    const cleaned = containers
        .map((chunk) => stripHtmlTags(chunk))
        .join('\n\n')
        .split('\n')
        .map((line) => line.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (!cleaned || cleaned.length < 20) return null;

    return {
        source: 'genius',
        artist: path.geniusArtist || artist,
        title: path.geniusTitle || title,
        lyrics: cleaned,
        thumbnail: path.thumbnail,
        sourceUrl: path.url
    };
}

async function getLyrics({ title, artist } = {}) {
    const cleanTitleStr = cleanTitle(title || '');
    const cleanArtistStr = cleanArtist(artist || '');
    if (!cleanTitleStr && !cleanArtistStr) {
        throw new Error('Necesito al menos título o artista para buscar la letra.');
    }

    const key = cacheKey(cleanTitleStr, cleanArtistStr);
    const cached = cacheGet(key);
    if (cached) return cached;

    const geniusResult = await fetchGeniusLyrics(cleanTitleStr, cleanArtistStr).catch(() => null);
    if (geniusResult) {
        cacheSet(key, geniusResult);
        return geniusResult;
    }

    const ovhResult = await fetchLyricsOvh(cleanTitleStr, cleanArtistStr).catch(() => null);
    if (ovhResult) {
        cacheSet(key, ovhResult);
        return ovhResult;
    }

    if (cleanArtistStr) {
        const reversedArtist = cleanArtistStr.split(',')[0].trim();
        if (reversedArtist && reversedArtist !== cleanArtistStr) {
            const fallback = await fetchLyricsOvh(cleanTitleStr, reversedArtist).catch(() => null);
            if (fallback) {
                cacheSet(key, fallback);
                return fallback;
            }
        }
    }

    return null;
}

function splitLyricsIntoLines(lyrics) {
    if (!lyrics) return [];
    return lyrics
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !/^\[(?:verse|chorus|bridge|intro|outro|hook|pre-chorus|refrain|instrumental|guitar|solo|interlude)/i.test(line));
}

function chunkLyrics(lyrics, maxChars = 1800) {
    const chunks = [];
    if (!lyrics) return chunks;
    const lines = lyrics.split('\n');
    let current = '';
    for (const line of lines) {
        const candidate = current ? `${current}\n${line}` : line;
        if (candidate.length > maxChars && current) {
            chunks.push(current);
            current = line;
        } else {
            current = candidate;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

module.exports = {
    getLyrics,
    cleanTitle,
    cleanArtist,
    splitLyricsIntoLines,
    chunkLyrics
};
