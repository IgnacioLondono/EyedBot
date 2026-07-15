const UA = process.env.GIF_USER_AGENT || 'EyedBot (https://github.com/IgnacioLondono/EyedBot)';

/** Steam store tag IDs usable in search/results */
const GENRE_TAG_BY_VALUE = {
    accion: 19,
    aventura: 21,
    rpg: 122,
    estrategia: 9,
    simulacion: 599,
    deportes: 701,
    carreras: 699,
    terror: 1667,
    indie: 492,
    ciencia_ficcion: 3942,
    multijugador: 3859,
    plataformas: 1625
};

const GENRE_LABEL_ES = {
    accion: 'Accion',
    aventura: 'Aventura',
    rpg: 'RPG',
    estrategia: 'Estrategia',
    simulacion: 'Simulacion',
    deportes: 'Deportes',
    carreras: 'Carreras',
    terror: 'Terror',
    indie: 'Indie',
    ciencia_ficcion: 'Ciencia Ficcion',
    multijugador: 'Multijugador',
    plataformas: 'Plataformas'
};

function pickRandom(items) {
    if (!Array.isArray(items) || !items.length) return null;
    return items[Math.floor(Math.random() * items.length)];
}

function stripHtml(text) {
    return String(text || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/?[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fetchJson(url, { timeoutMs = 14000, headers = {} } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': UA,
                ...headers
            },
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

function parseReleaseYear(dateText) {
    const match = String(dateText || '').match(/(19|20)\d{2}/);
    return match ? Number.parseInt(match[0], 10) : null;
}

function normalizeSteamGame(data) {
    if (!data) return null;
    const genres = Array.isArray(data.genres)
        ? data.genres.map((g) => g.description || g.name).filter(Boolean)
        : [];
    const developers = Array.isArray(data.developers) ? data.developers.filter(Boolean) : [];
    const publishers = Array.isArray(data.publishers) ? data.publishers.filter(Boolean) : [];
    const year = parseReleaseYear(data.release_date?.date);
    const score = data.metacritic?.score != null ? Number(data.metacritic.score) : null;

    return {
        title: data.name || 'Juego recomendado',
        url: data.steam_appid
            ? `https://store.steampowered.com/app/${data.steam_appid}`
            : (data.website || null),
        coverUrl: data.header_image || data.capsule_image || null,
        synopsis: stripHtml(data.short_description) || 'Sin resumen disponible.',
        score,
        year: year || 'No definido',
        status: data.release_date?.coming_soon ? 'Proximamente' : 'Disponible',
        genres,
        studios: developers.length ? developers : publishers,
        platforms: Object.entries(data.platforms || {})
            .filter(([, enabled]) => enabled)
            .map(([name]) => String(name).toUpperCase()),
        source: 'Steam'
    };
}

async function fetchSteamAppDetails(appId) {
    const id = String(appId || '').trim();
    if (!id) return null;
    const payload = await fetchJson(
        `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(id)}&l=spanish`
    );
    const entry = payload?.[id];
    if (!entry?.success || !entry.data) return null;
    if (entry.data.type && entry.data.type !== 'game') return null;
    return normalizeSteamGame(entry.data);
}

function extractAppIdFromSteamItem(item) {
    if (!item || typeof item !== 'object') return null;
    const direct = item.id ?? item.appid ?? item.appId;
    if (direct != null && String(direct).trim()) return String(direct).trim();

    const fromLogo = String(item.logo || item.tiny_image || item.header_image || '');
    const match = fromLogo.match(/\/apps\/(\d+)\//);
    return match?.[1] || null;
}

async function searchSteamAppIds({ tagId = null, year = null, pageStart = 0 } = {}) {
    const url = new URL('https://store.steampowered.com/search/results/');
    url.searchParams.set('query', '');
    url.searchParams.set('start', String(Math.max(0, pageStart)));
    url.searchParams.set('count', '25');
    url.searchParams.set('filter', 'globaltopsellers');
    url.searchParams.set('category1', '998'); // games
    url.searchParams.set('cc', 'us');
    url.searchParams.set('l', 'spanish');
    url.searchParams.set('json', '1');
    if (tagId) url.searchParams.set('tags', String(tagId));
    if (year) {
        url.searchParams.set('as-releaseyearstart', String(year));
        url.searchParams.set('as-releaseyearend', String(year));
    }

    const payload = await fetchJson(url.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 EyedBot/1.0' }
    });
    const items = Array.isArray(payload?.items) ? payload.items : [];
    return items.map(extractAppIdFromSteamItem).filter(Boolean);
}

async function fetchFeaturedSteamAppIds() {
    const payload = await fetchJson(
        'https://store.steampowered.com/api/featuredcategories/?l=spanish&cc=us',
        { headers: { 'User-Agent': 'Mozilla/5.0 EyedBot/1.0' } }
    );
    const buckets = ['top_sellers', 'specials', 'new_releases', 'coming_soon'];
    const ids = [];
    for (const key of buckets) {
        const items = payload?.[key]?.items;
        if (!Array.isArray(items)) continue;
        for (const item of items) {
            const id = extractAppIdFromSteamItem(item);
            if (id) ids.push(id);
        }
    }
    return [...new Set(ids)];
}

async function fetchRandomGame({ genreValue = null, year = null } = {}) {
    const tagId = genreValue ? GENRE_TAG_BY_VALUE[genreValue] || null : null;
    const attempts = [];

    if (tagId || year) {
        for (let i = 0; i < 4; i += 1) {
            attempts.push({ tagId, year, pageStart: i * 25 });
        }
        // Year filter via Steam params can be flaky: retry without year then filter locally.
        if (year) {
            for (let i = 0; i < 3; i += 1) {
                attempts.push({ tagId, year: null, pageStart: i * 25, localYear: year });
            }
        }
    } else {
        attempts.push({ featured: true });
        for (let i = 0; i < 3; i += 1) {
            attempts.push({ tagId: null, year: null, pageStart: i * 25 });
        }
    }

    for (const attempt of attempts) {
        try {
            let ids = [];
            if (attempt.featured) {
                ids = await fetchFeaturedSteamAppIds();
            } else {
                ids = await searchSteamAppIds({
                    tagId: attempt.tagId,
                    year: attempt.year,
                    pageStart: attempt.pageStart
                });
            }
            if (!ids.length) continue;

            // Shuffle a bit so retries don't always hit the same title.
            for (let n = 0; n < Math.min(6, ids.length); n += 1) {
                const appId = pickRandom(ids);
                const game = await fetchSteamAppDetails(appId);
                if (!game) continue;
                if (attempt.localYear && Number(game.year) !== Number(attempt.localYear)) continue;
                if (year && !attempt.localYear && Number(game.year) !== Number(year) && attempt.year) {
                    // Steam year param may return near matches; enforce exact when possible.
                    continue;
                }
                return game;
            }
        } catch {
            // try next attempt
        }
    }

    return null;
}

function isLikelyVillain(text) {
    const about = String(text || '').toLowerCase();
    if (!about) return false;
    return ['villain', 'antagonist', 'enemigo', 'malvado', 'evil', 'villano', 'antagonista'].some((w) => about.includes(w));
}

function isLikelyProtagonist(text) {
    const about = String(text || '').toLowerCase();
    if (!about) return false;
    return ['protagonist', 'protagonista', 'main character', 'hero', 'heroe', 'héroe'].some((w) => about.includes(w));
}

function commonsImageUrl(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;
    if (/special:filepath/i.test(value)) {
        return value.replace(/^http:/i, 'https:') + (value.includes('?') ? '' : '?width=512');
    }
    const fileMatch = value.match(/\/(?:wiki\/)?File:(.+)$/i);
    if (fileMatch?.[1]) {
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(decodeURIComponent(fileMatch[1]))}?width=512`;
    }
    if (value.startsWith('http')) return value;
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(value)}?width=512`;
}

function roleLabelEs(role) {
    const map = {
        MAIN: 'Principal (protagonista)',
        SUPPORTING: 'Secundario',
        VILLAIN: 'Villano',
        UNKNOWN: 'No indicado'
    };
    return map[role] || role || 'No indicado';
}

function inferRole(desc, type) {
    if (type === 'villano' || isLikelyVillain(desc)) return 'VILLAIN';
    if (type === 'protagonista' || isLikelyProtagonist(desc)) return 'MAIN';
    if (type === 'secundario') return 'SUPPORTING';
    return 'UNKNOWN';
}

function bindingValue(row, key) {
    return row?.[key]?.value || null;
}

async function wikidataSparql(query) {
    const url = new URL('https://query.wikidata.org/sparql');
    url.searchParams.set('format', 'json');
    url.searchParams.set('query', query);
    return fetchJson(url.toString(), {
        timeoutMs: 18000,
        headers: {
            Accept: 'application/sparql-results+json',
            'User-Agent': UA
        }
    });
}

function mapCharacterRow(row, type = 'cualquiera') {
    const qid = String(bindingValue(row, 'item') || '').split('/').pop();
    const name = bindingValue(row, 'itemLabel') || 'Personaje desconocido';
    const about = bindingValue(row, 'desc') || '';
    const gameName = bindingValue(row, 'gameLabel') || 'Videojuego';
    const imageUrl = commonsImageUrl(bindingValue(row, 'image'));

    return {
        name,
        url: qid ? `https://www.wikidata.org/wiki/${qid}` : null,
        imageUrl,
        about,
        gameName,
        role: inferRole(about, type),
        source: 'Wikidata'
    };
}

function filterRowsByType(rows, type) {
    if (!type || type === 'cualquiera') return rows;
    if (type === 'villano') {
        const villains = rows.filter((r) => isLikelyVillain(bindingValue(r, 'desc')));
        return villains.length ? villains : rows;
    }
    if (type === 'protagonista') {
        const mains = rows.filter((r) => isLikelyProtagonist(bindingValue(r, 'desc')));
        return mains.length ? mains : rows;
    }
    if (type === 'secundario') {
        const supporting = rows.filter((r) => {
            const desc = bindingValue(r, 'desc');
            return !isLikelyProtagonist(desc) && !isLikelyVillain(desc);
        });
        return supporting.length ? supporting : rows;
    }
    return rows;
}

async function fetchCharacterFromGame(gameName, type = 'cualquiera') {
    const escaped = String(gameName || '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .trim();
    if (!escaped) return null;

    const query = `
      SELECT DISTINCT ?item ?itemLabel ?desc ?image ?gameLabel WHERE {
        ?item wdt:P31/wdt:P279* wd:Q1569167 .
        ?item wdt:P1441 ?game .
        ?game rdfs:label ?gameLabel .
        FILTER(LANG(?gameLabel) = "en" || LANG(?gameLabel) = "es")
        FILTER(CONTAINS(LCASE(?gameLabel), LCASE("${escaped}")))
        OPTIONAL { ?item wdt:P18 ?image . }
        OPTIONAL {
          ?item schema:description ?desc .
          FILTER(LANG(?desc) = "es" || LANG(?desc) = "en")
        }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
      }
      LIMIT 40
    `;

    const data = await wikidataSparql(query);
    let rows = data?.results?.bindings || [];
    if (!rows.length) return null;

    // Prefer one row per character (first game match).
    const byName = new Map();
    for (const row of rows) {
        const label = bindingValue(row, 'itemLabel');
        if (!label || byName.has(label)) continue;
        byName.set(label, row);
    }
    rows = [...byName.values()];
    rows = filterRowsByType(rows, type);
    const picked = pickRandom(rows);
    return picked ? mapCharacterRow(picked, type) : null;
}

async function fetchRandomCharacterGlobal(type = 'cualquiera') {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const offset = Math.floor(Math.random() * 400);
        const query = `
          SELECT ?item ?itemLabel ?desc ?image ?gameLabel WHERE {
            ?item wdt:P31 wd:Q1569167 .
            OPTIONAL { ?item wdt:P18 ?image . }
            OPTIONAL {
              ?item schema:description ?desc .
              FILTER(LANG(?desc) = "es" || LANG(?desc) = "en")
            }
            OPTIONAL {
              ?item wdt:P1441 ?game .
              ?game rdfs:label ?gameLabel .
              FILTER(LANG(?gameLabel) = "en" || LANG(?gameLabel) = "es")
            }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
          }
          LIMIT 30
          OFFSET ${offset}
        `;

        try {
            const data = await wikidataSparql(query);
            let rows = data?.results?.bindings || [];
            if (!rows.length) continue;

            const byName = new Map();
            for (const row of rows) {
                const label = bindingValue(row, 'itemLabel');
                if (!label || byName.has(label)) continue;
                byName.set(label, row);
            }
            rows = filterRowsByType([...byName.values()], type);
            const withImage = rows.filter((r) => bindingValue(r, 'image'));
            const pool = withImage.length ? withImage : rows;
            const picked = pickRandom(pool);
            if (picked) return mapCharacterRow(picked, type);
        } catch {
            // retry
        }
    }
    return null;
}

async function fetchRandomCharacter({ gameName = null, type = 'cualquiera' } = {}) {
    if (gameName) {
        const fromGame = await fetchCharacterFromGame(gameName, type);
        if (fromGame) return fromGame;
    }
    return fetchRandomCharacterGlobal(type);
}

module.exports = {
    fetchRandomGame,
    fetchRandomCharacter,
    roleLabelEs,
    GENRE_TAG_BY_VALUE,
    GENRE_LABEL_ES
};
