const ANILIST_URL = 'https://graphql.anilist.co';
const UA = process.env.GIF_USER_AGENT || 'EyedBot (https://github.com/IgnacioLondono/EyedBot)';

const SEASON_MAP = {
    winter: 'WINTER',
    spring: 'SPRING',
    summer: 'SUMMER',
    fall: 'FALL'
};

const GENRE_NAME_BY_VALUE = {
    accion: 'Action',
    aventura: 'Adventure',
    comedia: 'Comedy',
    drama: 'Drama',
    fantasia: 'Fantasy',
    terror: 'Horror',
    romance: 'Romance',
    ciencia_ficcion: 'Sci-Fi',
    misterio: 'Mystery',
    deportes: 'Sports',
    vida_cotidiana: 'Slice of Life',
    sobrenatural: 'Supernatural'
};

function pickRandom(items) {
    if (!Array.isArray(items) || !items.length) return null;
    return items[Math.floor(Math.random() * items.length)];
}

function stripHtml(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?i>/gi, '')
        .replace(/<\/?b>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function anilistQuery(query, variables = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    try {
        const response = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'User-Agent': UA
            },
            body: JSON.stringify({ query, variables }),
            signal: controller.signal
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(`AniList HTTP ${response.status}`);
        }
        if (payload?.errors?.length) {
            throw new Error(payload.errors[0]?.message || 'AniList error');
        }
        return payload?.data || null;
    } finally {
        clearTimeout(timer);
    }
}

function normalizeAnime(media) {
    if (!media) return null;
    const title =
        media.title?.english
        || media.title?.romaji
        || media.title?.native
        || 'Anime recomendado';

    return {
        title,
        url: media.siteUrl || null,
        coverUrl: media.coverImage?.extraLarge || media.coverImage?.large || null,
        synopsis: stripHtml(media.description) || 'Sin resumen disponible.',
        score: media.averageScore != null ? (media.averageScore / 10).toFixed(1) : null,
        episodes: media.episodes ?? '—',
        year: media.seasonYear || 'No definido',
        season: media.season || null,
        status: media.status || null,
        genres: Array.isArray(media.genres) ? media.genres : [],
        studios: (media.studios?.nodes || []).map((s) => s.name).filter(Boolean),
        duration: media.duration ? `${media.duration} min` : null,
        source: 'AniList'
    };
}

async function fetchRandomAnime({ genreValue = null, year = null, season = null } = {}) {
    const genre = genreValue ? GENRE_NAME_BY_VALUE[genreValue] || null : null;
    const seasonEnum = season ? SEASON_MAP[season] || null : null;
    const randomPage = 1 + Math.floor(Math.random() * 40);

    const query = `
      query ($page: Int, $genre: String, $seasonYear: Int, $season: MediaSeason) {
        Page(page: $page, perPage: 25) {
          pageInfo { lastPage }
          media(
            type: ANIME
            sort: POPULARITY_DESC
            isAdult: false
            genre: $genre
            seasonYear: $seasonYear
            season: $season
          ) {
            id
            title { romaji english native }
            averageScore
            coverImage { extraLarge large }
            description(asHtml: false)
            episodes
            status
            seasonYear
            season
            genres
            studios { nodes { name } }
            siteUrl
            duration
          }
        }
      }
    `;

    let data = await anilistQuery(query, {
        page: randomPage,
        genre,
        seasonYear: year || null,
        season: seasonEnum
    });

    let media = data?.Page?.media || [];
    if (!media.length && randomPage > 1) {
        data = await anilistQuery(query, {
            page: 1,
            genre,
            seasonYear: year || null,
            season: seasonEnum
        });
        media = data?.Page?.media || [];
    }

    return normalizeAnime(pickRandom(media));
}

function roleLabelEs(role) {
    const map = {
        MAIN: 'Principal (protagonista)',
        SUPPORTING: 'Secundario',
        BACKGROUND: 'Secundario menor',
        Main: 'Principal (protagonista)',
        Supporting: 'Secundario',
        Background: 'Secundario menor'
    };
    return map[role] || role || 'No indicado';
}

function isLikelyVillain(text) {
    const about = String(text || '').toLowerCase();
    if (!about) return false;
    return ['villain', 'antagonist', 'enemigo', 'malvado', 'evil', 'villano'].some((w) => about.includes(w));
}

function normalizeCharacter(node, preferredRole = null) {
    if (!node) return null;
    const edges = node.media?.edges || [];
    let edge = null;
    if (preferredRole) {
        edge = edges.find((e) => String(e.characterRole || '').toUpperCase() === preferredRole) || null;
    }
    if (!edge) edge = edges[0] || null;

    const animeTitle =
        edge?.node?.title?.english
        || edge?.node?.title?.romaji
        || edge?.node?.title?.native
        || 'Sin obra enlazada';

    return {
        name: node.name?.full || node.name?.native || 'Personaje desconocido',
        url: node.siteUrl || null,
        imageUrl: node.image?.large || node.image?.medium || null,
        about: stripHtml(node.description) || '',
        animeName: animeTitle,
        role: edge?.characterRole || 'Unknown',
        source: 'AniList'
    };
}

async function fetchRandomCharacterFromAniList(type = 'cualquiera') {
    const wantedRole =
        type === 'protagonista' ? 'MAIN'
            : type === 'secundario' ? 'SUPPORTING'
                : null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const page = 1 + Math.floor(Math.random() * 80);
        const query = `
          query ($page: Int) {
            Page(page: $page, perPage: 15) {
              characters(sort: FAVOURITES_DESC) {
                id
                name { full native }
                image { large medium }
                description(asHtml: false)
                siteUrl
                media(type: ANIME, sort: POPULARITY_DESC, perPage: 6) {
                  edges {
                    characterRole
                    node { title { romaji english native } }
                  }
                }
              }
            }
          }
        `;
        const data = await anilistQuery(query, { page });
        let chars = data?.Page?.characters || [];
        if (!chars.length) continue;

        if (type === 'villano') {
            chars = chars.filter((c) => isLikelyVillain(c.description));
        } else if (wantedRole) {
            chars = chars.filter((c) =>
                (c.media?.edges || []).some((e) => String(e.characterRole || '').toUpperCase() === wantedRole)
            );
        }

        const picked = pickRandom(chars);
        if (picked) return normalizeCharacter(picked, wantedRole);
    }

    return null;
}

async function fetchCharacterFromAnimeAniList(animeName, type = 'cualquiera') {
    const searchQuery = `
      query ($search: String) {
        Page(page: 1, perPage: 8) {
          media(type: ANIME, search: $search, sort: POPULARITY_DESC, isAdult: false) {
            id
            title { romaji english native }
            characters(sort: ROLE, perPage: 25) {
              edges {
                role
                node {
                  id
                  name { full native }
                  image { large medium }
                  description(asHtml: false)
                  siteUrl
                }
              }
            }
          }
        }
      }
    `;

    const data = await anilistQuery(searchQuery, { search: animeName });
    const mediaList = data?.Page?.media || [];
    const media = mediaList[0];
    if (!media) return null;

    let edges = media.characters?.edges || [];
    if (type === 'protagonista') edges = edges.filter((e) => e.role === 'MAIN');
    if (type === 'secundario') edges = edges.filter((e) => e.role === 'SUPPORTING');

    if (type === 'villano') {
        const villainEdges = edges.filter((e) => isLikelyVillain(e.node?.description));
        if (villainEdges.length) edges = villainEdges;
    }

    const picked = pickRandom(edges);
    if (!picked?.node) return null;

    const animeTitle =
        media.title?.english || media.title?.romaji || media.title?.native || animeName;

    return {
        name: picked.node.name?.full || picked.node.name?.native || 'Personaje desconocido',
        url: picked.node.siteUrl || null,
        imageUrl: picked.node.image?.large || picked.node.image?.medium || null,
        about: stripHtml(picked.node.description) || '',
        animeName: animeTitle,
        role: picked.role || 'Unknown',
        source: 'AniList'
    };
}

async function fetchRandomCharacter({ animeName = null, type = 'cualquiera' } = {}) {
    if (animeName) {
        const fromAnime = await fetchCharacterFromAnimeAniList(animeName, type);
        if (fromAnime) return fromAnime;
    }
    return fetchRandomCharacterFromAniList(type);
}

module.exports = {
    fetchRandomAnime,
    fetchRandomCharacter,
    roleLabelEs,
    GENRE_NAME_BY_VALUE,
    SEASON_MAP
};
