// Servicio para obtener juegos gratis (Epic Games y Steam) y notificar a
// los servidores configurados. Incluye el scheduler y el helper para
// construir el embed de Discord.

const { EmbedBuilder } = require('discord.js');
const freeGamesStore = require('./free-games-store');

const CHECK_MS = Math.max(5 * 60_000, Number.parseInt(process.env.FREE_GAMES_CHECK_MS || `${30 * 60_000}`, 10));
const FETCH_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.FREE_GAMES_FETCH_TIMEOUT_MS || '15000', 10));

const CACHE_MS = 10 * 60_000;
const STEAM_STORE_UA = 'Mozilla/5.0 (compatible; EyedBot/1.0; +https://eyedcomun.me)';
const STEAM_DETAILS_BATCH = Math.max(4, Number.parseInt(process.env.FREE_GAMES_STEAM_DETAILS_BATCH || '16', 10));

/** Iconos de autor en embeds (deben ser PNG/JPG públicos; Discord no puede usar el CDN de Unreal). */
const STORE_BRAND_ICON_URLS = {
    epic: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Epic_Games_logo.svg/120px-Epic_Games_logo.svg.png',
    steam: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/120px-Steam_icon_logo.svg.png'
};

let intervalRef = null;
let running = false;
const listCache = { data: null, expiresAt: 0, minDiscount: 100 };
let lastFetchAudit = null;

// ============================================================
// Utilidades
// ============================================================

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
            headers: {
                'User-Agent': STEAM_STORE_UA,
                'Accept': 'application/json, text/plain;q=0.8',
                ...(options.headers || {})
            }
        });
    } finally {
        clearTimeout(timer);
    }
}

function safeNumber(n, fallback = 0) {
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
}

function formatCurrency(amountMinor, currency = 'USD') {
    const value = safeNumber(amountMinor, 0) / 100;
    try {
        return value.toLocaleString('es-ES', { style: 'currency', currency });
    } catch {
        return `${value.toFixed(2)} ${currency}`;
    }
}

function daysBetween(from, to) {
    const a = new Date(from);
    const b = new Date(to);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function describeTimeLeft(endsAt) {
    if (!endsAt) return '';
    const end = new Date(endsAt);
    if (Number.isNaN(end.getTime())) return '';
    const now = Date.now();
    const ms = end.getTime() - now;
    if (ms <= 0) return 'Finalizado';
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (days === 0 && minutes > 0) parts.push(`${minutes}m`);
    return parts.join(' ') || '<1m';
}

// ============================================================
// Epic Games
// ============================================================

function readEpicCustomAttrs(el) {
    const attrs = {};
    for (const a of el.customAttributes || []) {
        if (a?.key) attrs[a.key] = String(a.value || '');
    }
    return attrs;
}

/** Slug limpio para la URL pública de la tienda (sin /home ni placeholders). */
function cleanEpicSlug(raw) {
    const s = String(raw || '').trim();
    if (!s || s === '[]') return '';
    return s.replace(/\/home$/i, '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0] || '';
}

/**
 * Epic suele poner en urlSlug códigos de promoción (megasale-mysterygame-…)
 * que devuelven 404. Priorizamos pageSlug del offer y productSlug real.
 */
function resolveEpicStoreSlug(el) {
    const attrs = readEpicCustomAttrs(el);

    const offerPage = cleanEpicSlug(el.offerMappings?.[0]?.pageSlug);
    if (offerPage) return offerPage;

    const mapPage = cleanEpicSlug(el.catalogNs?.mappings?.[0]?.pageSlug);
    if (mapPage) return mapPage;

    const custom = cleanEpicSlug(attrs['com.epicgames.app.productSlug']);
    if (custom) return custom;

    const product = cleanEpicSlug(el.productSlug);
    if (product) return product;

    const urlSlug = cleanEpicSlug(el.urlSlug);
    if (urlSlug && !/^megasale-/i.test(urlSlug) && !/mysterygame/i.test(urlSlug)) {
        return urlSlug;
    }

    return '';
}

function buildEpicStoreUrl(el, locale = 'es-ES') {
    const slug = resolveEpicStoreSlug(el);
    if (!slug) return `https://store.epicgames.com/${locale}/free-games`;
    return `https://store.epicgames.com/${locale}/p/${slug}`;
}

async function fetchEpicFreeGames() {
    const url = 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=es-ES&country=ES&allowCountries=ES';
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`Epic API ${res.status}`);
    const data = await res.json();
    const elements = data?.data?.Catalog?.searchStore?.elements || [];
    const games = [];

    for (const el of elements) {
        try {
            const promotions = el.promotions || {};
            const active = promotions.promotionalOffers?.[0]?.promotionalOffers || [];
            const upcoming = promotions.upcomingPromotionalOffers?.[0]?.promotionalOffers || [];
            const bestActive = active.find((p) => Number(p.discountSetting?.discountPercentage ?? 100) === 0);
            const bestUpcoming = upcoming.find((p) => Number(p.discountSetting?.discountPercentage ?? 100) === 0);
            const offer = bestActive || bestUpcoming;
            if (!offer) continue;

            const startsAt = offer.startDate || '';
            const endsAt = offer.endDate || '';
            const isUpcoming = !bestActive;

            const priceInfo = el.price?.totalPrice || {};
            const originalPriceMinor = safeNumber(priceInfo.originalPrice, 0);
            const currency = priceInfo.currencyCode || 'EUR';
            const discountPercent = originalPriceMinor > 0 ? 100 : 100;

            const image = (el.keyImages || []).find((k) =>
                ['OfferImageWide', 'DieselStoreFrontWide', 'DieselGameBoxTall', 'OfferImageTall'].includes(k.type)
            ) || el.keyImages?.[0];
            const thumb = (el.keyImages || []).find((k) => k.type === 'Thumbnail') || image;

            const storeUrl = buildEpicStoreUrl(el, 'es-ES');

            games.push({
                id: `epic_${el.id}`,
                source: 'epic',
                sourceLabel: 'Epic Games',
                title: String(el.title || 'Juego').slice(0, 256),
                description: String(el.description || '').slice(0, 500),
                imageUrl: image?.url || '',
                thumbnailUrl: thumb?.url || image?.url || '',
                originalPriceMinor,
                currency,
                originalPrice: originalPriceMinor > 0 ? formatCurrency(originalPriceMinor, currency) : 'Gratis',
                discountPercent,
                startsAt,
                endsAt,
                isUpcoming,
                storeUrl,
                tags: (el.tags || []).slice(0, 5).map((t) => String(t.name || '').trim()).filter(Boolean),
                publisher: el.seller?.name || 'Desconocido'
            });
        } catch {
            // continue
        }
    }

    return games;
}

// ============================================================
// Steam (promociones 100% y listado oficial de gratis)
// ============================================================

function extractSteamAppIdFromLogo(logo) {
    const match = String(logo || '').match(/\/apps\/(\d+)\//);
    return match ? match[1] : '';
}

function extractSteamSearchAppIds(payload) {
    const ids = new Map();
    for (const item of payload?.items || []) {
        const id = String(item.appid || item.id || extractSteamAppIdFromLogo(item.logo) || '').trim();
        if (id) ids.set(id, String(item.name || '').trim());
    }
    const html = String(payload?.results_html || '');
    for (const match of html.matchAll(/data-ds-appid="(\d+)"/g)) {
        if (!ids.has(match[1])) ids.set(match[1], '');
    }
    return ids;
}

function isSteamGameType(data) {
    return String(data?.type || '').toLowerCase() === 'game';
}

/**
 * Clasifica si un juego de Steam debe listarse.
 * - promo: descuento temporal con precio final 0
 * - store_free: gratis permanente en el listado oficial de Steam
 */
function classifySteamListing(data, minDiscount = 100) {
    if (!data || !isSteamGameType(data)) return null;
    const po = data.price_overview;
    if (po) {
        const finalPrice = safeNumber(po.final, -1);
        const discount = safeNumber(po.discount_percent, 0);
        const initial = safeNumber(po.initial, 0);
        if (finalPrice === 0 && discount >= minDiscount) return 'promo';
        if (finalPrice === 0 && initial > 0) return 'promo';
    }
    if (data.is_free && !po) return 'store_free';
    return null;
}

function normalizeSteamItem(item, listingKind = 'promo') {
    const id = String(item.id || item.appid || item._appid || '');
    const originalPriceMinor = safeNumber(item.original_price ?? item.originalPriceMinor, 0);
    const currency = item.currency || 'EUR';
    const image = item.header_image
        || item.large_capsule_image
        || item.small_capsule_image
        || (id ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg` : '');

    const description = listingKind === 'store_free' && !item.description
        ? 'Disponible gratis en Steam.'
        : String(item.description || '');

    return sanitizePublicGame({
        _appid: id,
        id: `steam_${id}`,
        source: 'steam',
        sourceLabel: 'Steam',
        title: String(item.name || item.title || 'Juego').slice(0, 256),
        description: description.slice(0, 500),
        imageUrl: image,
        thumbnailUrl: item.small_capsule_image || image,
        originalPriceMinor,
        currency,
        originalPrice: originalPriceMinor > 0 ? formatCurrency(originalPriceMinor, currency) : 'Gratis',
        discountPercent: safeNumber(item.discount_percent, 100),
        startsAt: item.startsAt || '',
        endsAt: item.endsAt || item.discount_expiration
            ? new Date(safeNumber(item.discount_expiration, 0) * 1000).toISOString()
            : '',
        isUpcoming: false,
        storeUrl: id ? `https://store.steampowered.com/app/${id}` : 'https://store.steampowered.com/search/?maxprice=free&specials=1',
        tags: Array.isArray(item.tags) ? item.tags : [],
        publisher: String(item.publisher || ''),
        listingKind
    });
}

function buildSteamGameFromDetails(appId, data, listingKind, seed = {}) {
    const po = data.price_overview;
    return normalizeSteamItem({
        id: appId,
        appid: appId,
        header_image: data.header_image,
        small_capsule_image: data.capsule_imagev5 || data.capsule_image,
        description: data.short_description,
        original_price: po?.initial,
        discount_percent: po?.discount_percent ?? 100,
        currency: po?.currency || 'EUR',
        publisher: (data.publishers && data.publishers[0]) || '',
        tags: (data.genres || []).slice(0, 5).map((genre) => genre.description).filter(Boolean),
        name: data.name || seed.name,
    }, listingKind);
}

async function fetchSteamAppDetails(appId) {
    const res = await fetchWithTimeout(
        `https://store.steampowered.com/api/appdetails?appids=${encodeURIComponent(appId)}&cc=ES&l=spanish`,
        {},
        8000
    );
    if (!res.ok) return null;
    const json = await res.json();
    const payload = json?.[appId];
    return payload?.success ? payload.data : null;
}

async function collectSteamFeaturedGames(results, minDiscount, audit) {
    try {
        const res = await fetchWithTimeout('https://store.steampowered.com/api/featuredcategories?cc=ES&l=spanish');
        if (!res.ok) {
            audit.errors.push(`featuredcategories HTTP ${res.status}`);
            return;
        }
        const data = await res.json();
        for (const section of Object.values(data || {})) {
            const items = section?.items;
            if (!Array.isArray(items)) continue;
            for (const item of items) {
                audit.featuredScanned += 1;
                if (item.type !== 0 && item.type !== undefined) continue;
                const discount = safeNumber(item.discount_percent, 0);
                const finalPrice = safeNumber(item.final_price, -1);
                if (discount < minDiscount || finalPrice !== 0) continue;
                const id = String(item.id || item.appid || '');
                if (!id || results.has(id)) continue;
                results.set(id, normalizeSteamItem(item, 'promo'));
                audit.featuredMatched += 1;
            }
        }
    } catch (err) {
        audit.errors.push(`featuredcategories: ${err.message}`);
    }
}

async function collectSteamSearchCandidates(minDiscount, audit) {
    const candidateIds = new Map();
    const searchUrls = [
        'https://store.steampowered.com/search/results/?query&start=0&count=50&specials=1&maxprice=free&json=1&infinite=1&cc=ES&l=spanish',
        'https://store.steampowered.com/search/results/?query&start=0&count=50&specials=1&json=1&infinite=1&cc=ES&l=spanish'
    ];

    for (const url of searchUrls) {
        try {
            const res = await fetchWithTimeout(url);
            if (!res.ok) {
                audit.errors.push(`search HTTP ${res.status}`);
                continue;
            }
            const payload = await res.json();
            for (const [id, name] of extractSteamSearchAppIds(payload)) {
                if (!candidateIds.has(id)) candidateIds.set(id, name);
            }
        } catch (err) {
            audit.errors.push(`search: ${err.message}`);
        }
    }

    audit.searchCandidates = candidateIds.size;
    return candidateIds;
}

async function verifySteamCandidates(candidateIds, results, minDiscount, audit) {
    const pending = [...candidateIds.entries()]
        .filter(([id]) => !results.has(id))
        .slice(0, STEAM_DETAILS_BATCH);

    await Promise.all(pending.map(async ([appId, seedName]) => {
        audit.detailsChecked += 1;
        try {
            const data = await fetchSteamAppDetails(appId);
            const listingKind = classifySteamListing(data, minDiscount);
            if (!listingKind) return;
            results.set(appId, buildSteamGameFromDetails(appId, data, listingKind, { name: seedName }));
            audit.detailsMatched += 1;
        } catch (err) {
            audit.errors.push(`appdetails ${appId}: ${err.message}`);
        }
    }));
}

async function fetchSteamFreeGames(minDiscount = 100) {
    const audit = {
        featuredScanned: 0,
        featuredMatched: 0,
        searchCandidates: 0,
        detailsChecked: 0,
        detailsMatched: 0,
        errors: []
    };
    const results = new Map();

    await collectSteamFeaturedGames(results, minDiscount, audit);
    const candidateIds = await collectSteamSearchCandidates(minDiscount, audit);
    await verifySteamCandidates(candidateIds, results, minDiscount, audit);

    const games = [...results.values()];
    audit.total = games.length;
    return { games, audit };
}

function sanitizePublicGame(game) {
    const copy = { ...game };
    delete copy._appid;
    delete copy.listingKind;
    return copy;
}

function applyMinDiscountFilter(games, minDiscount = 100) {
    return games.filter((game) => safeNumber(game.discountPercent, 0) >= minDiscount);
}

// ============================================================
// Agregacion
// ============================================================

async function fetchAllFreeGames({ includeEpic = true, includeSteam = true, force = false, minDiscount = 100 } = {}) {
    const discountFloor = Math.max(0, Math.min(100, safeNumber(minDiscount, 100)));
    const audit = {
        fetchedAt: new Date().toISOString(),
        minDiscount: discountFloor,
        epic: { count: 0, error: null },
        steam: {
            count: 0,
            featuredScanned: 0,
            featuredMatched: 0,
            searchCandidates: 0,
            detailsChecked: 0,
            detailsMatched: 0,
            errors: [],
            error: null
        }
    };

    if (!force && listCache.data && listCache.expiresAt > Date.now() && listCache.minDiscount === discountFloor) {
        lastFetchAudit = audit;
        return filterBySources(applyMinDiscountFilter(listCache.data, discountFloor), { includeEpic, includeSteam });
    }

    const epicPromise = includeEpic
        ? fetchEpicFreeGames().catch((e) => {
            audit.epic.error = e.message;
            console.warn('Epic fetch err:', e.message);
            return [];
        })
        : Promise.resolve([]);

    const steamPromise = includeSteam
        ? fetchSteamFreeGames(discountFloor).catch((e) => {
            audit.steam.error = e.message;
            console.warn('Steam fetch err:', e.message);
            return { games: [], audit: { errors: [e.message] } };
        })
        : Promise.resolve({ games: [], audit: {} });

    const [epicRaw, steamResult] = await Promise.all([epicPromise, steamPromise]);
    const epic = applyMinDiscountFilter(epicRaw, discountFloor).map(sanitizePublicGame);
    const steam = applyMinDiscountFilter(steamResult.games || [], discountFloor).map(sanitizePublicGame);

    audit.epic.count = epic.length;
    audit.steam = {
        ...audit.steam,
        count: steam.length,
        featuredScanned: steamResult.audit?.featuredScanned || 0,
        featuredMatched: steamResult.audit?.featuredMatched || 0,
        searchCandidates: steamResult.audit?.searchCandidates || 0,
        detailsChecked: steamResult.audit?.detailsChecked || 0,
        detailsMatched: steamResult.audit?.detailsMatched || 0,
        errors: steamResult.audit?.errors || []
    };

    const combined = [...epic, ...steam];
    if (includeEpic && includeSteam) {
        listCache.data = combined;
        listCache.expiresAt = Date.now() + CACHE_MS;
        listCache.minDiscount = discountFloor;
    }

    lastFetchAudit = audit;
    return combined;
}

function getLastFreeGamesAudit() {
    return lastFetchAudit;
}

function filterBySources(list, { includeEpic, includeSteam }) {
    return list.filter((g) => {
        if (g.source === 'epic' && !includeEpic) return false;
        if (g.source === 'steam' && !includeSteam) return false;
        return true;
    });
}

// ============================================================
// Discord embed
// ============================================================

function parseHexColor(input, fallback = 0x4ccb81) {
    const hex = String(input || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;
    return parseInt(hex, 16);
}

function buildFreeGameEmbed(game, cfg = {}) {
    const colorHex = cfg.color || (game.source === 'epic' ? '2b90d9' : '4ccb81');
    const color = parseHexColor(colorHex);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎮 ${game.title}`)
        .setURL(game.storeUrl)
        .setAuthor({
            name: game.sourceLabel,
            iconURL: game.source === 'epic' ? STORE_BRAND_ICON_URLS.epic : STORE_BRAND_ICON_URLS.steam
        });

    const desc = [];
    if (game.description) desc.push(game.description);
    if (desc.length) embed.setDescription(desc.join('\n\n').slice(0, 2000));

    if (game.imageUrl) embed.setImage(game.imageUrl);
    if (game.thumbnailUrl && game.thumbnailUrl !== game.imageUrl) embed.setThumbnail(game.thumbnailUrl);

    const fields = [];

    // Precio original tachado / ahora gratis
    const priceField = game.originalPriceMinor > 0
        ? `~~${game.originalPrice}~~ → **GRATIS**`
        : '**GRATIS**';
    fields.push({ name: '💰 Precio', value: priceField, inline: true });

    // Descuento
    fields.push({ name: '🔥 Descuento', value: `${game.discountPercent || 100}%`, inline: true });

    // Tiempo restante
    if (game.endsAt) {
        const end = new Date(game.endsAt);
        if (!Number.isNaN(end.getTime())) {
            const left = describeTimeLeft(game.endsAt);
            const unix = Math.floor(end.getTime() / 1000);
            fields.push({
                name: game.isUpcoming ? '📅 Disponible en' : '⏳ Tiempo restante',
                value: `${left}\n<t:${unix}:F>`,
                inline: true
            });
        }
    } else if (game.source === 'steam') {
        fields.push({ name: '⏳ Duración', value: 'Disponible por tiempo limitado', inline: true });
    }

    if (game.publisher) fields.push({ name: '🏢 Editor', value: game.publisher, inline: true });
    if (game.tags?.length) fields.push({ name: '🏷️ Categorías', value: game.tags.slice(0, 4).join(' · '), inline: true });

    fields.push({ name: '🛒 Tienda', value: `[Reclamar gratis](${game.storeUrl})`, inline: false });

    embed.addFields(fields);

    embed.setFooter({ text: cfg.footerText || 'EyedBot · Juegos gratis' });
    embed.setTimestamp();

    return embed;
}

function normalizeGameTitle(title) {
    return String(title || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isFreeGameBotEmbed(embed, config = {}) {
    if (!embed) return false;
    const footer = String(embed.footer?.text || '').toLowerCase();
    const cfgFooter = String(config.footerText || 'EyedBot · Juegos gratis').toLowerCase();
    if (footer && (footer.includes('juegos gratis') || footer === cfgFooter)) return true;
    return String(embed.title || '').startsWith('🎮');
}

function upsertEmbedMessage(config, entry) {
    const list = Array.isArray(config.embedMessages) ? [...config.embedMessages] : [];
    const idx = list.findIndex((row) => row.gameId === entry.gameId && row.channelId === entry.channelId);
    if (idx >= 0) list[idx] = entry;
    else list.push(entry);
    config.embedMessages = list.slice(-200);
}

/**
 * Edita mensajes del bot en el canal de avisos con datos y enlaces actuales.
 */
async function refreshFreeGameEmbedsInChannel(channel, config, botUserId, options = {}) {
    if (!channel?.messages?.fetch || !botUserId) {
        throw new Error('Canal o bot no disponible');
    }

    const includeEpic = config.sources?.epic !== false;
    const includeSteam = config.sources?.steam !== false;
    const games = await fetchAllFreeGames({ includeEpic, includeSteam, force: true, minDiscount: config.minDiscount });
    const gamesById = new Map(games.map((g) => [g.id, g]));
    const gamesByTitle = new Map(games.map((g) => [normalizeGameTitle(g.title), g]));

    const updatedIds = new Set();
    let updated = 0;
    let failed = 0;
    let notMatched = 0;

    const stored = Array.isArray(config.embedMessages) ? config.embedMessages : [];
    for (const row of stored) {
        if (String(row.channelId) !== String(channel.id)) continue;
        const game = gamesById.get(row.gameId);
        if (!game) continue;
        try {
            const msg = await channel.messages.fetch(row.messageId).catch(() => null);
            if (!msg) continue;
            await msg.edit({ embeds: [buildFreeGameEmbed(game, config)] });
            updated += 1;
            updatedIds.add(msg.id);
        } catch {
            failed += 1;
        }
    }

    const scanLimit = Math.min(100, Math.max(20, Number(options.scanLimit) || 100));
    const messages = await channel.messages.fetch({ limit: scanLimit });

    for (const msg of messages.values()) {
        if (msg.author?.id !== botUserId) continue;
        if (updatedIds.has(msg.id)) continue;
        const embed = msg.embeds?.[0];
        if (!isFreeGameBotEmbed(embed, config)) continue;

        const titleKey = normalizeGameTitle(String(embed.title || '').replace(/^🎮\s*/, ''));
        const game = gamesByTitle.get(titleKey);
        if (!game) {
            notMatched += 1;
            continue;
        }

        try {
            await msg.edit({ embeds: [buildFreeGameEmbed(game, config)] });
            upsertEmbedMessage(config, {
                gameId: game.id,
                messageId: msg.id,
                channelId: channel.id
            });
            updated += 1;
            updatedIds.add(msg.id);
        } catch {
            failed += 1;
        }
    }

    return { updated, failed, notMatched, scanned: messages.size, gamesAvailable: games.length };
}

// ============================================================
// Scheduler
// ============================================================

async function processGuildConfig(client, guildId, config) {
    if (!config?.enabled) return;
    if (!config.channelId) return;

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = guild.channels.cache.get(config.channelId)
        || await guild.channels.fetch(config.channelId).catch(() => null);
    if (!channel || typeof channel.send !== 'function') return;

    const games = await fetchAllFreeGames({
        includeEpic: config.sources?.epic !== false,
        includeSteam: config.sources?.steam !== false,
        minDiscount: config.minDiscount
    }).catch(() => []);

    if (!games.length) return;

    const notified = new Set(Array.isArray(config.notifiedIds) ? config.notifiedIds : []);
    const newOnes = games.filter((g) => !notified.has(g.id) && !g.isUpcoming);
    if (!newOnes.length) return;

    const mention = String(config.mentionText || '').trim();
    const embedMessages = Array.isArray(config.embedMessages) ? [...config.embedMessages] : [];

    for (const game of newOnes) {
        try {
            const embed = buildFreeGameEmbed(game, config);
            const sent = await channel.send({
                content: mention || undefined,
                embeds: [embed],
                allowedMentions: { parse: ['users', 'roles', 'everyone'] }
            });
            notified.add(game.id);
            if (sent?.id) {
                const idx = embedMessages.findIndex(
                    (row) => row.gameId === game.id && row.channelId === channel.id
                );
                const entry = { gameId: game.id, messageId: sent.id, channelId: channel.id };
                if (idx >= 0) embedMessages[idx] = entry;
                else embedMessages.push(entry);
            }
        } catch (err) {
            console.warn(`Error enviando juego gratis a ${guildId}/${config.channelId}:`, err.message);
        }
    }

    // Persistir ids notificados (ultimos 400)
    const updated = {
        ...config,
        notifiedIds: Array.from(notified).slice(-400),
        embedMessages: embedMessages.slice(-200),
        updatedAt: new Date().toISOString()
    };
    await freeGamesStore.setFreeGamesConfig(guildId, updated).catch(() => null);
}

async function runFreeGamesSweep(client) {
    if (running) return;
    running = true;
    try {
        const all = await freeGamesStore.listAllFreeGamesConfigs();
        for (const item of all) {
            const guildId = String(item.guildId || '');
            if (!guildId) continue;
            await processGuildConfig(client, guildId, item.config || {});
        }
    } catch (err) {
        console.error('Error en free games sweep:', err.message);
    } finally {
        running = false;
    }
}

function startFreeGamesScheduler(client) {
    if (!client || intervalRef) return;
    intervalRef = setInterval(() => {
        runFreeGamesSweep(client).catch(() => null);
    }, CHECK_MS);

    // Dispara la primera comprobacion en 30s para no saturar el arranque
    setTimeout(() => runFreeGamesSweep(client).catch(() => null), 30_000);
    console.log(`🎮 Free Games scheduler activo cada ${Math.round(CHECK_MS / 60_000)} minutos`);
}

function stopFreeGamesScheduler() {
    if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
    }
}

module.exports = {
    fetchAllFreeGames,
    fetchEpicFreeGames,
    fetchSteamFreeGames,
    buildFreeGameEmbed,
    refreshFreeGameEmbedsInChannel,
    resolveEpicStoreSlug,
    buildEpicStoreUrl,
    getLastFreeGamesAudit,
    classifySteamListing,
    extractSteamSearchAppIds,
    startFreeGamesScheduler,
    stopFreeGamesScheduler,
    runFreeGamesSweep
};
