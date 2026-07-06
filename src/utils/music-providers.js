const axios = require('axios');
const YouTube = require('youtube-sr').default;

const SPOTIFY_EMBED_TIMEOUT = 10000;
const APPLE_LOOKUP_TIMEOUT = 10000;
const APPLE_SCRAPE_TIMEOUT = 12000;

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9,es;q=0.8'
};

function normalizeUrlForProvider(input) {
    let s = (input || '').toString().trim();
    while (s && /[-)>.,\]]$/.test(s)) s = s.slice(0, -1);
    return s;
}

function isUrl(input) {
    return /^https?:\/\//i.test((input || '').toString().trim());
}

function detectProvider(url) {
    if (!isUrl(url)) return null;
    const lower = url.toLowerCase();
    if (lower.includes('music.apple.com') || lower.includes('itunes.apple.com')) return 'apple';
    if (lower.includes('spotify.com')) return 'spotify';
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
    if (lower.includes('soundcloud.com')) return 'soundcloud';
    return null;
}

function safeJsonParse(raw) {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function pickFirst(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
}

function formatDurationMs(ms) {
    const total = Math.max(0, Math.floor(Number(ms) || 0) / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = Math.floor(total % 60);
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function parseSpotifyUrl(url) {
    try {
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        const typeIndex = parts.findIndex((part) => ['track', 'playlist', 'album', 'artist', 'show', 'episode'].includes(part));
        if (typeIndex === -1) return null;
        const type = parts[typeIndex];
        const id = (parts[typeIndex + 1] || '').split('?')[0];
        if (!id) return null;
        return { type, id };
    } catch {
        return null;
    }
}

async function fetchSpotifyEmbedData(type, id) {
    const embedUrl = `https://open.spotify.com/embed/${type}/${encodeURIComponent(id)}`;
    const { data: html } = await axios.get(embedUrl, {
        timeout: SPOTIFY_EMBED_TIMEOUT,
        headers: BROWSER_HEADERS,
        responseType: 'text',
        transformResponse: [(v) => v]
    });
    if (!html || typeof html !== 'string') return null;

    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match) return null;
    const parsed = safeJsonParse(match[1]);
    if (!parsed) return null;

    const entity = parsed?.props?.pageProps?.state?.data?.entity
        || parsed?.props?.pageProps?.entity
        || parsed?.props?.pageProps?.data
        || null;

    return entity;
}

function mapSpotifyTrackEntity(item) {
    if (!item) return null;
    const artistArr = Array.isArray(item.artists) && item.artists.length
        ? item.artists.map((a) => a?.name).filter(Boolean)
        : (item.subtitle ? [item.subtitle] : []);
    const cover = item?.visualIdentity?.image?.[0]?.url
        || item?.visualIdentity?.image?.[item?.visualIdentity?.image?.length - 1]?.url
        || item?.coverArt?.sources?.[0]?.url
        || item?.images?.[0]?.url
        || item?.album?.images?.[0]?.url
        || null;
    return {
        title: item?.name || item?.title || 'Sin titulo',
        artist: artistArr.join(', ') || 'Desconocido',
        durationMs: Number(item?.duration_ms || item?.durationMs || item?.duration) || 0,
        album: item?.album?.name || null,
        thumbnail: cover,
        isrc: item?.external_ids?.isrc || null,
        sourceUrl: item?.external_urls?.spotify || null,
        provider: 'spotify'
    };
}

function collectSpotifyTracksFromEntity(entity) {
    const tracks = [];
    if (!entity) return tracks;

    if (entity.type === 'track' || entity.__type === 'track' || entity.name) {
        const single = mapSpotifyTrackEntity(entity);
        if (single && single.title) tracks.push(single);
    }

    const inlineList = entity?.trackList || entity?.tracks?.items || entity?.tracks || [];
    if (Array.isArray(inlineList) && inlineList.length) {
        for (const entry of inlineList) {
            const item = entry?.track || entry?.item || entry;
            if (!item) continue;
            const mapped = mapSpotifyTrackEntity(item);
            if (mapped && mapped.title && mapped.title !== 'Sin titulo') {
                tracks.push(mapped);
            } else if (entry?.title && entry?.subtitle) {
                tracks.push({
                    title: entry.title,
                    artist: entry.subtitle,
                    durationMs: Number(entry?.duration || entry?.duration_ms) || 0,
                    album: null,
                    thumbnail: entry?.visualIdentity?.image?.[0]?.url || null,
                    isrc: null,
                    sourceUrl: entry?.uri ? `https://open.spotify.com/${(entry.uri || '').replace('spotify:', '').replace(':', '/')}` : null,
                    provider: 'spotify'
                });
            }
        }
    }

    return tracks;
}

async function resolveSpotifyUrl(url) {
    const parsed = parseSpotifyUrl(url);
    if (!parsed) return null;

    if (parsed.type === 'artist' || parsed.type === 'show' || parsed.type === 'episode') {
        return {
            provider: 'spotify',
            type: parsed.type,
            unsupported: true,
            url
        };
    }

    const entity = await fetchSpotifyEmbedData(parsed.type, parsed.id).catch(() => null);
    if (!entity) {
        const { data } = await axios.get('https://open.spotify.com/oembed', {
            timeout: SPOTIFY_EMBED_TIMEOUT,
            params: { url }
        }).catch(() => ({ data: null }));
        if (!data) return null;
        const rawTitle = (data?.title || '').toString().trim();
        const rawArtist = (data?.author_name || '').toString().trim();
        let title = rawTitle;
        let artist = rawArtist;
        if (!artist && rawTitle.includes(' - ')) {
            const parts = rawTitle.split(' - ').map((p) => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                title = parts[0];
                artist = parts.slice(1).join(' - ');
            }
        }
        return {
            provider: 'spotify',
            type: parsed.type === 'playlist' ? 'playlist' : parsed.type === 'album' ? 'album' : 'track',
            title: rawTitle || 'Spotify',
            author: rawArtist || null,
            thumbnail: data?.thumbnail_url || null,
            url,
            tracks: title ? [{
                title,
                artist,
                durationMs: 0,
                album: null,
                thumbnail: data?.thumbnail_url || null,
                isrc: null,
                sourceUrl: url,
                provider: 'spotify'
            }] : []
        };
    }

    const tracks = collectSpotifyTracksFromEntity(entity);
    const entityTitle = pickFirst(entity?.title, entity?.name, 'Spotify');
    const entityAuthor = pickFirst(entity?.subtitle, entity?.artists?.[0]?.name, entity?.owner?.displayName, null);
    const entityThumb = pickFirst(
        entity?.visualIdentity?.image?.[0]?.url,
        entity?.coverArt?.sources?.[0]?.url,
        entity?.images?.[0]?.url
    );

    const mappedType = parsed.type === 'playlist' ? 'playlist'
        : parsed.type === 'album' ? 'album'
        : 'track';

    return {
        provider: 'spotify',
        type: mappedType,
        title: entityTitle,
        author: entityAuthor,
        thumbnail: entityThumb,
        url,
        tracks
    };
}

function parseAppleUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        if (!host.includes('music.apple.com') && !host.includes('itunes.apple.com')) return null;

        const parts = u.pathname.split('/').filter(Boolean);
        const storefront = parts[0] && /^[a-z]{2}$/i.test(parts[0]) ? parts[0].toLowerCase() : null;
        const typeIndex = parts.findIndex((p) => ['album', 'playlist', 'song', 'music-video'].includes(p));
        const type = typeIndex === -1 ? null : parts[typeIndex];
        const trackId = u.searchParams.get('i') || null;

        let itemId = null;
        for (let i = parts.length - 1; i >= 0; i--) {
            if (/^pl\.[\w-]+$/i.test(parts[i])) { itemId = parts[i]; break; }
            if (/^\d{6,}$/.test(parts[i])) { itemId = parts[i]; break; }
        }

        const slug = parts
            .slice()
            .reverse()
            .find((p) => p && !/^\d+$/.test(p) && !/^pl\./i.test(p) && !['album', 'playlist', 'song', 'music', 'music-video'].includes(p.toLowerCase()));

        return {
            storefront,
            type,
            itemId,
            trackId,
            guessedTitle: slug ? decodeURIComponent(slug).replace(/-/g, ' ').trim() : null,
            raw: url
        };
    } catch {
        return null;
    }
}

async function fetchItunesLookup(id, entity, country) {
    const params = new URLSearchParams();
    params.set('id', id);
    if (entity) params.set('entity', entity);
    if (country) params.set('country', country);
    params.set('limit', '200');

    const { data } = await axios.get(`https://itunes.apple.com/lookup?${params.toString()}`, {
        timeout: APPLE_LOOKUP_TIMEOUT,
        headers: BROWSER_HEADERS
    }).catch(() => ({ data: null }));

    if (!data || !Array.isArray(data.results)) return null;
    return data.results;
}

async function fetchAppleHtmlTracks(url) {
    const { data: html } = await axios.get(url, {
        timeout: APPLE_SCRAPE_TIMEOUT,
        headers: BROWSER_HEADERS,
        responseType: 'text',
        transformResponse: [(v) => v]
    }).catch(() => ({ data: null }));

    if (!html || typeof html !== 'string') return null;

    const results = [];
    const scriptRegex = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html))) {
        const parsed = safeJsonParse(match[1]);
        if (!parsed) continue;
        results.push(parsed);
    }

    let collectedTracks = [];
    let titleOut = null;
    let authorOut = null;
    let thumbOut = null;

    for (const block of results) {
        const arr = Array.isArray(block) ? block : [block];
        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const type = (item['@type'] || '').toString().toLowerCase();
            if (type.includes('musicplaylist') || type.includes('musicalbum') || type.includes('itemlist') || type.includes('musicrelease')) {
                titleOut = titleOut || item.name || null;
                authorOut = authorOut || item.byArtist?.name || item.author?.name || null;
                thumbOut = thumbOut || (Array.isArray(item.image) ? item.image[0] : item.image) || null;
                const tracks = item.track || item.itemListElement || [];
                if (Array.isArray(tracks)) {
                    for (const rawTrack of tracks) {
                        const t = rawTrack?.item || rawTrack;
                        if (!t) continue;
                        const artistName = t?.byArtist?.name
                            || (Array.isArray(t?.byArtist) ? t.byArtist.map((a) => a?.name).filter(Boolean).join(', ') : null)
                            || t?.artist
                            || 'Desconocido';
                        const title = t?.name || t?.title;
                        if (!title) continue;
                        collectedTracks.push({
                            title,
                            artist: artistName,
                            durationMs: 0,
                            album: item.inAlbum?.name || item.name || null,
                            thumbnail: thumbOut,
                            isrc: null,
                            sourceUrl: t?.url || null,
                            provider: 'apple'
                        });
                    }
                }
            } else if (type.includes('musicrecording') || type.includes('song')) {
                const artistName = item?.byArtist?.name || item?.artist || 'Desconocido';
                const title = item?.name || item?.title;
                if (title) {
                    collectedTracks.push({
                        title,
                        artist: artistName,
                        durationMs: 0,
                        album: item?.inAlbum?.name || null,
                        thumbnail: Array.isArray(item.image) ? item.image[0] : item.image,
                        isrc: null,
                        sourceUrl: item?.url || null,
                        provider: 'apple'
                    });
                }
            }
        }
    }

    if (!titleOut) {
        const titleMatch = html.match(/<meta\s+property="og:title"[^>]+content="([^"]+)"/i);
        if (titleMatch) titleOut = titleMatch[1];
    }
    if (!thumbOut) {
        const imageMatch = html.match(/<meta\s+property="og:image"[^>]+content="([^"]+)"/i);
        if (imageMatch) thumbOut = imageMatch[1];
    }

    return {
        title: titleOut,
        author: authorOut,
        thumbnail: thumbOut,
        tracks: collectedTracks
    };
}

async function resolveAppleUrl(url) {
    const parsed = parseAppleUrl(url);
    if (!parsed) return null;

    if (parsed.trackId) {
        const results = await fetchItunesLookup(parsed.trackId, null, parsed.storefront);
        const track = results?.find((r) => r?.wrapperType === 'track' && r?.kind === 'song') || results?.[0];
        if (track?.trackName) {
            return {
                provider: 'apple',
                type: 'track',
                title: track.trackName,
                author: track.artistName,
                thumbnail: track.artworkUrl100 || track.artworkUrl60 || null,
                url,
                tracks: [{
                    title: track.trackName,
                    artist: track.artistName || 'Desconocido',
                    durationMs: Number(track.trackTimeMillis) || 0,
                    album: track.collectionName || null,
                    thumbnail: (track.artworkUrl100 || '').replace('100x100', '600x600') || null,
                    isrc: null,
                    sourceUrl: track.trackViewUrl || url,
                    provider: 'apple'
                }]
            };
        }
    }

    if (parsed.type === 'album' && parsed.itemId && /^\d+$/.test(parsed.itemId)) {
        const results = await fetchItunesLookup(parsed.itemId, 'song', parsed.storefront);
        if (Array.isArray(results) && results.length) {
            const collection = results.find((r) => r?.wrapperType === 'collection' || r?.collectionType === 'Album');
            const tracks = results.filter((r) => r?.wrapperType === 'track' && r?.kind === 'song')
                .sort((a, b) => (a.trackNumber || 0) - (b.trackNumber || 0))
                .map((t) => ({
                    title: t.trackName,
                    artist: t.artistName || 'Desconocido',
                    durationMs: Number(t.trackTimeMillis) || 0,
                    album: t.collectionName || null,
                    thumbnail: (t.artworkUrl100 || '').replace('100x100', '600x600') || null,
                    isrc: null,
                    sourceUrl: t.trackViewUrl || null,
                    provider: 'apple'
                }))
                .filter((t) => t.title);

            if (tracks.length) {
                return {
                    provider: 'apple',
                    type: 'album',
                    title: collection?.collectionName || parsed.guessedTitle || 'Apple Music Album',
                    author: collection?.artistName || null,
                    thumbnail: (collection?.artworkUrl100 || '').replace('100x100', '600x600') || null,
                    url,
                    tracks
                };
            }
        }
    }

    const scraped = await fetchAppleHtmlTracks(url).catch(() => null);
    if (scraped && (scraped.tracks?.length || parsed.guessedTitle)) {
        const mappedType = parsed.type === 'playlist' ? 'playlist'
            : parsed.type === 'album' ? 'album'
            : (scraped.tracks.length > 1 ? 'playlist' : 'track');
        return {
            provider: 'apple',
            type: mappedType,
            title: scraped.title || parsed.guessedTitle || 'Apple Music',
            author: scraped.author,
            thumbnail: scraped.thumbnail,
            url,
            tracks: scraped.tracks
        };
    }

    if (parsed.guessedTitle) {
        return {
            provider: 'apple',
            type: 'track',
            title: parsed.guessedTitle,
            author: null,
            thumbnail: null,
            url,
            tracks: [{
                title: parsed.guessedTitle,
                artist: 'Desconocido',
                durationMs: 0,
                album: null,
                thumbnail: null,
                isrc: null,
                sourceUrl: url,
                provider: 'apple'
            }]
        };
    }

    return null;
}

async function resolveSoundCloudUrl(url) {
    const cleaned = normalizeUrlForProvider(url);
    const lower = cleaned.toLowerCase();
    const isPlaylist = lower.includes('/sets/') || lower.includes('/playlists/');

    const { data } = await axios.get('https://soundcloud.com/oembed', {
        timeout: 8000,
        params: { format: 'json', url: cleaned }
    }).catch(() => ({ data: null }));

    if (isPlaylist) {
        return {
            provider: 'soundcloud',
            type: 'playlist',
            title: data?.title || 'SoundCloud Playlist',
            author: data?.author_name || null,
            thumbnail: data?.thumbnail_url || null,
            url: cleaned,
            lavalinkNative: true,
            tracks: []
        };
    }

    const rawTitle = (data?.title || '').toString().trim();
    const rawArtist = (data?.author_name || '').toString().trim();

    return {
        provider: 'soundcloud',
        type: 'track',
        title: rawTitle || 'SoundCloud',
        author: rawArtist || null,
        thumbnail: data?.thumbnail_url || null,
        url: cleaned,
        tracks: [{
            title: rawTitle || 'SoundCloud',
            artist: rawArtist || 'Desconocido',
            durationMs: 0,
            album: null,
            thumbnail: data?.thumbnail_url || null,
            isrc: null,
            sourceUrl: cleaned,
            provider: 'soundcloud'
        }]
    };
}

function parseYoutubeUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname.toLowerCase();
        const listId = u.searchParams.get('list');
        const videoId = host.includes('youtu.be')
            ? u.pathname.split('/').filter(Boolean)[0]
            : u.searchParams.get('v');
        const pathParts = u.pathname.split('/').filter(Boolean);
        const isPlaylistPath = pathParts[0] === 'playlist' || (listId && !videoId);
        return {
            videoId: videoId || null,
            playlistId: listId || null,
            isPlaylistUrl: isPlaylistPath
        };
    } catch {
        return null;
    }
}

async function resolveYoutubeUrl(url) {
    const parsed = parseYoutubeUrl(url);
    if (!parsed) return null;

    const { videoId, playlistId, isPlaylistUrl } = parsed;

    if (playlistId && (isPlaylistUrl || !videoId)) {
        const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
        const playlist = await YouTube.getPlaylist(playlistUrl, { fetchAll: true }).catch(() => null);
        if (playlist && Array.isArray(playlist.videos)) {
            const tracks = playlist.videos.map((v) => ({
                title: v.title || 'Sin titulo',
                artist: v?.channel?.name || 'Desconocido',
                durationMs: Number(v.duration) || 0,
                album: null,
                thumbnail: v?.thumbnail?.url || v?.thumbnail || null,
                isrc: null,
                sourceUrl: v.url || (v.id ? `https://www.youtube.com/watch?v=${v.id}` : null),
                provider: 'youtube'
            })).filter((t) => t.sourceUrl);

            return {
                provider: 'youtube',
                type: 'playlist',
                title: playlist.title || 'YouTube Playlist',
                author: playlist?.channel?.name || null,
                thumbnail: playlist?.thumbnail?.url || null,
                url,
                tracks
            };
        }
    }

    if (videoId) {
        const video = await YouTube.getVideo(`https://www.youtube.com/watch?v=${videoId}`).catch(() => null);
        if (video) {
            return {
                provider: 'youtube',
                type: 'track',
                title: video.title,
                author: video?.channel?.name || null,
                thumbnail: video?.thumbnail?.url || null,
                url,
                tracks: [{
                    title: video.title,
                    artist: video?.channel?.name || 'Desconocido',
                    durationMs: Number(video.duration) || 0,
                    album: null,
                    thumbnail: video?.thumbnail?.url || null,
                    isrc: null,
                    sourceUrl: video.url || `https://www.youtube.com/watch?v=${videoId}`,
                    provider: 'youtube'
                }]
            };
        }
    }

    return null;
}

async function resolveProviderUrl(url) {
    const cleaned = normalizeUrlForProvider(url);
    const provider = detectProvider(cleaned);
    if (!provider) return null;

    try {
        if (provider === 'spotify') return await resolveSpotifyUrl(cleaned);
        if (provider === 'apple') return await resolveAppleUrl(cleaned);
        if (provider === 'youtube') return await resolveYoutubeUrl(cleaned);
        if (provider === 'soundcloud') return await resolveSoundCloudUrl(cleaned);
    } catch (error) {
        return {
            provider,
            type: 'error',
            error: error?.message || 'Error desconocido',
            url
        };
    }

    return null;
}

module.exports = {
    detectProvider,
    parseSpotifyUrl,
    parseAppleUrl,
    parseYoutubeUrl,
    resolveSpotifyUrl,
    resolveAppleUrl,
    resolveYoutubeUrl,
    resolveSoundCloudUrl,
    resolveProviderUrl,
    formatDurationMs
};
