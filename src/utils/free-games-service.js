// Servicio para obtener juegos gratis (Epic Games y Steam) y notificar a
// los servidores configurados. Incluye el scheduler y el helper para
// construir el embed de Discord.

const { EmbedBuilder } = require('discord.js');
const freeGamesStore = require('./free-games-store');

const CHECK_MS = Math.max(5 * 60_000, Number.parseInt(process.env.FREE_GAMES_CHECK_MS || `${30 * 60_000}`, 10));
const FETCH_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.FREE_GAMES_FETCH_TIMEOUT_MS || '15000', 10));

const CACHE_MS = 10 * 60_000;

/** Iconos de autor en embeds (deben ser PNG/JPG públicos; Discord no puede usar el CDN de Unreal). */
const STORE_BRAND_ICON_URLS = {
    epic: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Epic_Games_logo.svg/120px-Epic_Games_logo.svg.png',
    steam: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/120px-Steam_icon_logo.svg.png'
};

let intervalRef = null;
let running = false;
const listCache = { data: null, expiresAt: 0 };

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
                'User-Agent': 'EyedBot/1.0 (+https://eyedbot.local)',
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
// Steam (solo juegos 100% off actualmente)
// ============================================================

async function fetchSteamFreeGames() {
    // Usamos la API interna de Steam: featuredcategories entrega "specials"
    // y hay que filtrar por discount_percent === 100 para juegos gratis
    // temporalmente. Tambien probamos search para capturar mas.
    const results = new Map();

    // 1) Specials -> filtramos 100%
    try {
        const res = await fetchWithTimeout('https://store.steampowered.com/api/featuredcategories?cc=ES&l=spanish');
        if (res.ok) {
            const data = await res.json();
            const specials = data?.specials?.items || [];
            for (const item of specials) {
                if (Number(item.discount_percent || 0) !== 100) continue;
                if (item.type !== 0 && item.type !== undefined) continue; // type 0 = juego
                const id = String(item.id || item.appid || '');
                if (!id) continue;
                results.set(id, normalizeSteamItem(item));
            }
        }
    } catch {
        // continue con busqueda fallback
    }

    // 2) Busqueda adicional: store.steampowered.com/search/?maxprice=free&specials=1
    // (Aunque no JSON, la API store search devuelve JSON con flag snr:
    // https://store.steampowered.com/search/results?query&start=0&count=40&maxprice=free&specials=1&json=1)
    try {
        const res = await fetchWithTimeout('https://store.steampowered.com/search/results/?query&start=0&count=50&specials=1&maxprice=free&json=1&cc=ES&l=spanish');
        if (res.ok) {
            const data = await res.json();
            const items = Array.isArray(data?.items) ? data.items : [];
            for (const item of items) {
                const id = String(item.appid || '');
                if (!id || results.has(id)) continue;
                // item: { name, logo, appid, discount_percent, original_price, final_price }
                if (Number(item.discount_percent || 0) !== 100) continue;
                results.set(id, normalizeSteamItem({
                    id,
                    appid: id,
                    name: item.name,
                    header_image: item.logo,
                    small_capsule_image: item.logo,
                    discount_percent: item.discount_percent,
                    original_price: item.original_price,
                    final_price: item.final_price,
                    currency: 'EUR'
                }));
            }
        }
    } catch {
        // ok
    }

    const games = Array.from(results.values());

    // Enriquecer opcionalmente el primer batch con appdetails (solo algunos, para
    // no abusar). Best-effort.
    await Promise.all(games.slice(0, 8).map(async (g) => {
        try {
            const res = await fetchWithTimeout(`https://store.steampowered.com/api/appdetails?appids=${g._appid}&cc=ES&l=spanish`, {}, 8000);
            if (!res.ok) return;
            const json = await res.json();
            const payload = json?.[g._appid];
            if (!payload?.success || !payload.data) return;
            const d = payload.data;
            g.description = String(d.short_description || g.description || '').slice(0, 500);
            g.imageUrl = d.header_image || g.imageUrl;
            g.thumbnailUrl = d.capsule_imagev5 || d.capsule_image || g.thumbnailUrl;
            g.publisher = (d.publishers && d.publishers[0]) || g.publisher;
            if (d.price_overview) {
                const po = d.price_overview;
                g.originalPriceMinor = safeNumber(po.initial, g.originalPriceMinor);
                g.currency = po.currency || g.currency;
                g.originalPrice = po.initial > 0 ? formatCurrency(po.initial, po.currency) : 'Gratis';
                g.discountPercent = Number(po.discount_percent || 100);
            }
            g.tags = (d.genres || []).slice(0, 5).map((x) => x.description).filter(Boolean);
        } catch {
            // ignore
        }
    }));

    return games;
}

function normalizeSteamItem(item) {
    const id = String(item.id || item.appid || '');
    const originalPriceMinor = safeNumber(item.original_price, 0);
    const currency = item.currency || 'EUR';
    const image = item.header_image
        || item.large_capsule_image
        || item.small_capsule_image
        || (id ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg` : '');

    return {
        _appid: id,
        id: `steam_${id}`,
        source: 'steam',
        sourceLabel: 'Steam',
        title: String(item.name || 'Juego').slice(0, 256),
        description: '',
        imageUrl: image,
        thumbnailUrl: image,
        originalPriceMinor,
        currency,
        originalPrice: originalPriceMinor > 0 ? formatCurrency(originalPriceMinor, currency) : 'Gratis',
        discountPercent: 100,
        startsAt: '',
        endsAt: '', // Steam no expone fecha de fin facilmente
        isUpcoming: false,
        storeUrl: id ? `https://store.steampowered.com/app/${id}` : 'https://store.steampowered.com/search/?maxprice=free&specials=1',
        tags: [],
        publisher: ''
    };
}

// ============================================================
// Agregacion
// ============================================================

async function fetchAllFreeGames({ includeEpic = true, includeSteam = true, force = false } = {}) {
    if (!force && listCache.data && listCache.expiresAt > Date.now()) {
        return filterBySources(listCache.data, { includeEpic, includeSteam });
    }

    const [epic, steam] = await Promise.all([
        includeEpic ? fetchEpicFreeGames().catch((e) => { console.warn('Epic fetch err:', e.message); return []; }) : Promise.resolve([]),
        includeSteam ? fetchSteamFreeGames().catch((e) => { console.warn('Steam fetch err:', e.message); return []; }) : Promise.resolve([])
    ]);

    // Para cache, guardamos la union de lo pedido
    const combined = [...epic, ...steam];
    if (includeEpic && includeSteam) {
        listCache.data = combined;
        listCache.expiresAt = Date.now() + CACHE_MS;
    }

    return combined;
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
    const games = await fetchAllFreeGames({ includeEpic, includeSteam, force: true });
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
        includeSteam: config.sources?.steam !== false
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
    startFreeGamesScheduler,
    stopFreeGamesScheduler,
    runFreeGamesSweep
};
