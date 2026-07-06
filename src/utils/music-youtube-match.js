const YouTube = require('youtube-sr').default;
const config = require('../config');

const MIN_MATCH_SCORE = Number.parseFloat(process.env.MUSIC_MIN_MATCH_SCORE || '0.48');
const DURATION_TOLERANCE_RATIO = Number.parseFloat(process.env.MUSIC_DURATION_TOLERANCE || '0.15');
const DURATION_TOLERANCE_MS = Number.parseInt(process.env.MUSIC_DURATION_TOLERANCE_MS || '12000', 10);

function normalizeText(input) {
    return (input || '')
        .toString()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenSet(input) {
    const set = new Set();
    normalizeText(input).split(' ').forEach((t) => {
        if (t && t.length > 1) set.add(t);
    });
    return set;
}

function jaccard(a, b) {
    if (!a.size && !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union ? inter / union : 0;
}

function overlapRatio(target, candidate) {
    if (!target.size) return 0;
    let inter = 0;
    for (const token of target) if (candidate.has(token)) inter++;
    return inter / target.size;
}

function parseDurationToMs(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 10000 ? Math.round(value) : Math.round(value * 1000);
    }
    const raw = value.toString().trim();
    if (/^\d+$/.test(raw)) {
        const n = Number.parseInt(raw, 10);
        return n > 10000 ? n : n * 1000;
    }
    const parts = raw.split(':').map((p) => Number.parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p))) return 0;
    if (parts.length === 3) return ((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000;
    if (parts.length === 2) return ((parts[0] * 60) + parts[1]) * 1000;
    return 0;
}

function durationScore(expectedMs, candidateMs) {
    if (!expectedMs || !candidateMs) return 0;
    const diff = Math.abs(expectedMs - candidateMs);
    const allowed = Math.max(DURATION_TOLERANCE_MS, expectedMs * DURATION_TOLERANCE_RATIO);
    if (diff <= allowed) return 0.35;
    if (diff <= allowed * 2) return 0.1;
    if (diff > allowed * 3) return -0.45;
    return -0.15;
}

function scoreYoutubeCandidate(video, title, artist, expectedDurationMs = 0) {
    const vTitle = video?.title || '';
    const vAuthor = video?.channel?.name || video?.author || '';

    const titleScore = jaccard(tokenSet(title), tokenSet(vTitle));
    const artistScore = artist
        ? jaccard(tokenSet(artist), tokenSet(`${vAuthor} ${vTitle}`))
        : 0;

    const tNorm = normalizeText(vTitle);
    const aNorm = normalizeText(vAuthor);
    const queryNorm = normalizeText(`${title} ${artist}`);
    const artistTokens = tokenSet(artist);
    const candidateTokens = tokenSet(`${vAuthor} ${vTitle}`);
    const artistOverlap = overlapRatio(artistTokens, candidateTokens);
    const shortTitle = tokenSet(title).size <= 2;

    const heavyPenalty = (tNorm.includes('not full') ? 1.2 : 0)
        + (tNorm.includes('short') && !queryNorm.includes('short') ? 0.8 : 0)
        + (tNorm.includes('edit') && !queryNorm.includes('edit') ? 0.7 : 0)
        + (tNorm.includes('amv') ? 0.9 : 0)
        + (tNorm.includes('x ') ? 0.35 : 0)
        + (tNorm.includes('nightcore') ? 0.9 : 0)
        + (tNorm.includes('slowed') ? 0.6 : 0)
        + (tNorm.includes('sped up') ? 0.6 : 0)
        + (tNorm.includes('reverb') ? 0.3 : 0)
        + (tNorm.includes('bass boost') ? 0.5 : 0)
        + (tNorm.includes(' 8d ') || tNorm.includes(' 8 d ') ? 0.5 : 0)
        + (tNorm.includes('tiktok') && !queryNorm.includes('tiktok') ? 0.4 : 0)
        + (tNorm.includes('remix') && !queryNorm.includes('remix') ? 0.45 : 0)
        + (tNorm.includes('cover') && !queryNorm.includes('cover') ? 0.75 : 0)
        + (tNorm.includes('guitar cover') ? 0.6 : 0)
        + (tNorm.includes('piano cover') ? 0.6 : 0)
        + (tNorm.includes('karaoke') && !queryNorm.includes('karaoke') ? 0.8 : 0)
        + (tNorm.includes('instrumental') && !queryNorm.includes('instrumental') ? 0.35 : 0)
        + (tNorm.includes('reaction') ? 0.7 : 0)
        + (tNorm.includes(' live ') && !queryNorm.includes('live') ? 0.25 : 0)
        + (artistTokens.size && artistOverlap === 0 ? 1.4 : 0)
        + (artistTokens.size && artistOverlap > 0 && artistOverlap < 0.34 ? 0.45 : 0)
        + (artistTokens.size && shortTitle && artistOverlap < 0.34 ? 0.65 : 0);

    const bonus = (tNorm.includes('official') ? 0.2 : 0)
        + (aNorm.includes('topic') ? 0.45 : 0)
        + (aNorm.includes('vevo') ? 0.25 : 0)
        + (tNorm.includes('official audio') ? 0.25 : 0)
        + (tNorm.includes('official music video') ? 0.2 : 0)
        + (tNorm.includes('audio') ? 0.1 : 0);

    const candidateMs = parseDurationToMs(video?.duration ?? video?.durationFormatted);
    const durBonus = durationScore(expectedDurationMs, candidateMs);

    return (titleScore * 1.3 + artistScore * 1.0) + bonus + durBonus - heavyPenalty;
}

function hasArtistSignal(video, artist) {
    const artistTokens = tokenSet(artist);
    if (!artistTokens.size) return true;
    const candidateTokens = tokenSet(`${video?.channel?.name || video?.author || ''} ${video?.title || ''}`);
    return overlapRatio(artistTokens, candidateTokens) >= 0.34;
}

function isLikelyBadUploadTitle(title) {
    const t = normalizeText(title);
    if (!t) return false;
    return t.includes('not full')
        || t.includes('short')
        || t.includes('preview')
        || t.includes('teaser')
        || t.includes('amv')
        || t.includes('clip');
}

function isConfidentMatch(video, title, artist, score, options = {}) {
    const strictArtist = options.strictArtistMatch ?? config.musicStrictArtistMatch;
    const expectedDurationMs = options.durationMs || 0;

    if (score < MIN_MATCH_SCORE) return false;
    if (artist && strictArtist && !hasArtistSignal(video, artist)) return false;

    if (expectedDurationMs > 0) {
        const candidateMs = parseDurationToMs(video?.duration ?? video?.durationFormatted);
        if (candidateMs > 0) {
            const diff = Math.abs(expectedDurationMs - candidateMs);
            const allowed = Math.max(DURATION_TOLERANCE_MS, expectedDurationMs * DURATION_TOLERANCE_RATIO);
            if (diff > allowed * 2.5) return false;
        }
    }

    const titleOverlap = overlapRatio(tokenSet(title), tokenSet(video?.title || ''));
    if (title && titleOverlap < 0.2 && score < MIN_MATCH_SCORE + 0.15) return false;

    return true;
}

function mapVideoResult(video, score, confident) {
    return {
        url: video.url || (video.id ? `https://www.youtube.com/watch?v=${video.id}` : null),
        title: video.title,
        author: video?.channel?.name || video?.author || null,
        durationFormatted: video.durationFormatted || video.duration || null,
        durationMs: parseDurationToMs(video?.duration ?? video?.durationFormatted),
        thumbnail: video?.thumbnail?.url || video?.thumbnail || null,
        score,
        confident
    };
}

function buildSearchQueries(title, artist, isrc) {
    const queries = [];
    if (isrc) {
        queries.push(isrc);
        queries.push(`${artist} ${title} ${isrc}`.trim());
    }
    if (artist && title) {
        queries.push(`${artist} - ${title} official audio`);
        queries.push(`${artist} ${title} topic`);
        queries.push(`${artist} ${title} official`);
        queries.push(`${artist} ${title}`);
        queries.push(`${title} ${artist}`);
    }
    if (title) queries.push(title);
    return [...new Set(queries.map((q) => q.trim()).filter(Boolean))];
}

/**
 * @param {string} title
 * @param {string} [artist]
 * @param {{ durationMs?: number, isrc?: string, strictArtistMatch?: boolean }} [options]
 */
async function findBestYoutubeMatch(title, artist = '', options = {}) {
    if (!title) return null;

    const expectedDurationMs = Number(options.durationMs) || 0;
    const strictArtistMatch = options.strictArtistMatch ?? config.musicStrictArtistMatch;
    const queries = buildSearchQueries(title, artist, options.isrc);

    const seen = new Set();
    let best = null;
    let bestScore = -Infinity;
    let strictBest = null;
    let strictBestScore = -Infinity;

    for (const q of queries) {
        if (seen.has(q)) continue;
        seen.add(q);

        const videos = await YouTube.search(q, {
            type: 'video',
            limit: 15,
            safeSearch: false
        }).catch(() => []);

        for (const v of videos || []) {
            if (isLikelyBadUploadTitle(v?.title || '')) continue;
            const score = scoreYoutubeCandidate(v, title, artist, expectedDurationMs);
            const matchOpts = { strictArtistMatch, durationMs: expectedDurationMs };

            if (artist && hasArtistSignal(v, artist) && score > strictBestScore) {
                strictBestScore = score;
                strictBest = v;
            }
            if (score > bestScore) {
                bestScore = score;
                best = v;
            }
        }
    }

    const chosen = strictBest || best;
    if (!chosen) return null;

    const finalScore = strictBest ? strictBestScore : bestScore;
    const confident = isConfidentMatch(chosen, title, artist, finalScore, {
        strictArtistMatch,
        durationMs: expectedDurationMs
    });

    return mapVideoResult(chosen, finalScore, confident);
}

module.exports = {
    normalizeText,
    tokenSet,
    jaccard,
    overlapRatio,
    parseDurationToMs,
    scoreYoutubeCandidate,
    hasArtistSignal,
    isLikelyBadUploadTitle,
    isConfidentMatch,
    findBestYoutubeMatch,
    MIN_MATCH_SCORE
};
