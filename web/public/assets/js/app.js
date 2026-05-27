// Estado de la aplicación
let currentUser = null;
let isOwnerUser = false;
let currentGuilds = [];
let embedFields = [];
let currentEmbedTemplates = [];
let uploadedImageFile = null;
let uploadedImagePreviewUrl = '';
let uploadedThumbnailFile = null;
let uploadedThumbnailPreviewUrl = '';
let currentWelcomeConfig = null;
let currentGoodbyeConfig = null;
let currentServerGuildId = '';
let currentServerGuilds = [];
let welcomeImageFile = null;
let welcomeImagePreviewUrl = '';
let welcomeCardPreviewTimer = null;
let welcomeCardPreviewObjectUrl = '';
/** Vista previa del recorte en el editor de imagen de bienvenida */
let welcomeCropVisualTimer = null;
let welcomeCropVisualCache = { src: '', img: null };
let currentGreetingMode = 'welcome';

/** Revoca blob de archivo pendiente y limpia el input file (la URL del campo se mantiene). */
function clearWelcomeImagePendingPreview() {
    if (welcomeImagePreviewUrl) {
        try {
            URL.revokeObjectURL(welcomeImagePreviewUrl);
        } catch (_) {
            /* ignore */
        }
        welcomeImagePreviewUrl = '';
    }
    welcomeImageFile = null;
    const fi = document.getElementById('welcomeImageFile');
    if (fi) fi.value = '';
}

/** URL absoluta para img/canvas: rutas `/uploads/...` respecto al origen del panel. */
function resolveWelcomePreviewMediaUrl(raw) {
    const u = String(raw || '').trim();
    if (!u) return '';
    if (/^(https?:|blob:|data:)/i.test(u)) return u;
    if (u.startsWith('/')) {
        try {
            return new URL(u, window.location.origin).href;
        } catch (_) {
            return `${window.location.origin}${u}`;
        }
    }
    return u;
}
if (typeof window !== 'undefined') {
    window.resolveWelcomePreviewMediaUrl = resolveWelcomePreviewMediaUrl;
}

/** Canales de texto del servidor activo (para insertar {#nombre} en embeds). */
let panelGuildTextChannels = [];

function setPanelGuildTextChannels(channels) {
    panelGuildTextChannels = Array.isArray(channels)
        ? channels.filter((c) => c && (c.type === 0 || c.type === 5))
        : [];
    refreshEmbedChannelVarSelects();
}

function refreshEmbedChannelVarSelects() {
    const host = document.getElementById('embedChannelVarSelects');
    if (!host) return;
    if (!panelGuildTextChannels.length) {
        host.innerHTML = '<span class="dpx-field-hint" style="margin:0;">Selecciona un servidor</span>';
        return;
    }
    host.innerHTML = [
        renderChannelVarSelectHtml('embedTitle'),
        renderChannelVarSelectHtml('embedDescription'),
        renderChannelVarSelectHtml('embedFooter')
    ].join('');
    bindChannelVarSelects(host.parentElement || document);
}

function renderChannelVarSelectHtml(targetInputId) {
    if (!panelGuildTextChannels.length) return '';
    const opts = panelGuildTextChannels
        .map((c) => `<option value="{#${escapeHtmlForValue(c.name)}}">#${escapeHtml(c.name)}</option>`)
        .join('');
    return `<select class="embed-channel-var-select form-control" data-target-input="${escapeHtmlForValue(targetInputId)}" title="Insertar mención de canal"><option value="">+ Canal</option>${opts}</select>`;
}

function insertTextAtCursor(el, text) {
    if (!el || !text) return;
    const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
    const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
    el.value = `${el.value.slice(0, start)}${text}${el.value.slice(end)}`;
    const caret = start + text.length;
    el.focus();
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

function bindChannelVarSelects(root) {
    const scope = root || document;
    scope.querySelectorAll('.embed-channel-var-select').forEach((select) => {
        if (select._channelVarBound) return;
        select._channelVarBound = true;
        select.addEventListener('change', () => {
            const token = select.value;
            if (!token) return;
            const target = document.getElementById(select.dataset.targetInput || '');
            insertTextAtCursor(target, token);
            select.value = '';
            if (currentServerGuildId) updateWelcomePreviewPanel(currentServerGuildId);
            updateEmbedPreview();
        });
    });
}

function resolveChannelMentionsPreview(text) {
    const raw = String(text || '');
    if (!raw || !panelGuildTextChannels.length) return raw;

    const linkFor = (name) => `<span class="discord-channel-preview">#${escapeHtml(name)}</span>`;

    return raw
        .replace(/\{channel:([^}]+)\}/gi, (match, ref) => {
            const refStr = String(ref).trim().replace(/^#/, '');
            const ch = panelGuildTextChannels.find((c) =>
                c.id === refStr || c.name?.toLowerCase() === refStr.toLowerCase()
            );
            return ch ? linkFor(ch.name) : match;
        })
        .replace(/\{#([^}]+)\}/gi, (match, name) => {
            const refStr = String(name).trim().replace(/^#/, '');
            const ch = panelGuildTextChannels.find((c) => c.name?.toLowerCase() === refStr.toLowerCase());
            return ch ? linkFor(ch.name) : match;
        });
}

const gatedNavButtonIds = [];
let serverFeaturesUnlocked = false;
let currentServerPaneId = 'serverPaneOverview';
let pendingAutomationDpxTab = null;
/** Evita dos loadGuildsForServer en paralelo (showSection + restore a los 100ms). */
let loadGuildsForServerPromise = null;
/** Ignora respuestas viejas si se dispara otra carga del generador de canales. */
let channelSetupFetchGeneration = 0;
let dashboardGuildsCache = [];
let dashboardGuildSearchQuery = '';
const DASHBOARD_GUILD_FAVORITES_STORAGE = 'eyedbot.dashboard.guildFavorites';

function getDashboardFavoritesStorageKey() {
    const userId = String(currentUser?.id || 'guest');
    return `${DASHBOARD_GUILD_FAVORITES_STORAGE}.${userId}`;
}

function readDashboardFavoriteGuildIds() {
    try {
        const raw = localStorage.getItem(getDashboardFavoritesStorageKey());
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function writeDashboardFavoriteGuildIds(ids) {
    try {
        const unique = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id)).filter(Boolean))];
        localStorage.setItem(getDashboardFavoritesStorageKey(), JSON.stringify(unique));
    } catch (error) {
        console.warn('No se pudieron guardar favoritos de servidores:', error);
    }
}

function isDashboardGuildFavorite(guildId) {
    return readDashboardFavoriteGuildIds().includes(String(guildId || ''));
}

function toggleDashboardGuildFavorite(guildId) {
    const id = String(guildId || '');
    if (!id) return;

    const favorites = new Set(readDashboardFavoriteGuildIds());
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    writeDashboardFavoriteGuildIds([...favorites]);
    displayGuilds(getFilteredDashboardGuilds());
}

function partitionDashboardGuilds(guilds) {
    const favoriteIds = new Set(readDashboardFavoriteGuildIds());
    const favorites = [];
    const others = [];

    (Array.isArray(guilds) ? guilds : []).forEach((guild) => {
        const bucket = favoriteIds.has(String(guild?.id || '')) ? favorites : others;
        bucket.push(guild);
    });

    return { favorites, others };
}
const serverActivityCharts = new Map();
let serverActivityChartMode = 'week';
let botInviteUrl = '';
let serverSwitcherGuilds = [];
let serverSwitcherIndex = 0;
let serverSwitcherTouchStartX = 0;
let serverSwitcherTouchDeltaX = 0;
let themeSettings = null;
let currentSettingsPaneId = 'settingsPaneAccount';
let aboutCarouselBound = false;
let revealObserver = null;
let commandsCatalog = [];
let commandsFilterQuery = '';
let commandsFilterCategory = 'all';
let currentServerInfo = null;
let currentServerInsightView = 'overview';
let currentServerInsightPayload = null;
let serverSummaryRefreshInterval = null;
let isSwitchingServer = false;
let currentBillingState = {
    active: false,
    status: 'inactive',
    customerId: '',
    subscriptionId: '',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false
};
let premiumUpsellLock = false;
let guildAccessResetLock = false;

/** Marca de suscripción del panel (UI). */
const EYED_PLUS_BRAND = 'EyedPlus+';
const EYED_PLUS_ACTIVATE_LABEL = `Activar ${EYED_PLUS_BRAND}`;
const EYED_PLUS_UNLOCK_HINT = `Activa ${EYED_PLUS_BRAND} para tickets, anti-raid, gacha, juegos gratis y personalización.`;
const EYED_PLUS_ACTIVE_HINT = `Tienes acceso ${EYED_PLUS_BRAND} a módulos avanzados.`;

const THEME_STORAGE_KEY = 'eyedbot_theme_settings_v1';
let lastThemeSettingsDiskJson = null;
/** Data URL en JSON (legacy); IndexedDB lleva el archivo pesado */
const WALLPAPER_MAX_INLINE_URL_CHARS = 5_000_000;
const WALLPAPER_MAX_VIDEO_BYTES = 180 * 1024 * 1024;
/** Original raster/SVG/GIF si no se puede comprimir a JPEG */
const WALLPAPER_MAX_RAW_IMAGE_BYTES = 45 * 1024 * 1024;
const WALLPAPER_VIDEO_NAME_HINT = /\.(mp4|webm|ogg|ogv|mov|mkv|m4v|avi)(\?|$)/i;
const WALLPAPER_IMAGE_NAME_HINT = /\.(gif|png|jpe?g|webp|bmp|svg|avif|ico|heic|heif)(\?|$)/i;
/** Data URLs más largas que esto se mueven a IndexedDB para aliviar localStorage */
const LEGACY_INLINE_WALLPAPER_MIN_CHARS = 64 * 1024;

const WALLPAPER_IDB_NAME = 'EyedBotWallpaper';
const WALLPAPER_IDB_VERSION = 1;
const WALLPAPER_IDB_STORE = 'wallpaper';
const WALLPAPER_IDB_RECORD_ID = 'panel-bg';

/** @type {Promise<IDBDatabase> | null} */
let wallpaperDbPromise = null;
/** @type {string[]} */
const wallpaperObjectUrls = [];

function wallpaperDbOpen() {
    if (!wallpaperDbPromise) {
        wallpaperDbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(WALLPAPER_IDB_NAME, WALLPAPER_IDB_VERSION);
            req.onerror = () => reject(req.error || new Error('IndexedDB'));
            req.onsuccess = () => resolve(req.result);
            req.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(WALLPAPER_IDB_STORE)) {
                    db.createObjectStore(WALLPAPER_IDB_STORE, { keyPath: 'id' });
                }
            };
        });
    }
    return wallpaperDbPromise;
}

/** @returns {Promise<void>} */
function wallpaperIdbPut(blob, mime, kind) {
    return wallpaperDbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(WALLPAPER_IDB_STORE, 'readwrite');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('IndexedDB write'));
                tx.objectStore(WALLPAPER_IDB_STORE).put({
                    id: WALLPAPER_IDB_RECORD_ID,
                    blob,
                    mime: mime || '',
                    kind: kind === 'video' ? 'video' : 'image',
                    updatedAt: Date.now()
                });
            })
    );
}

/** @returns {Promise<{ blob: Blob, mime: string, kind: string } | null>} */
function wallpaperIdbGet() {
    return wallpaperDbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(WALLPAPER_IDB_STORE, 'readonly');
                const req = tx.objectStore(WALLPAPER_IDB_STORE).get(WALLPAPER_IDB_RECORD_ID);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error || new Error('IndexedDB read'));
            })
    );
}

/** @returns {Promise<void>} */
function wallpaperIdbDelete() {
    return wallpaperDbOpen().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(WALLPAPER_IDB_STORE, 'readwrite');
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error || new Error('IndexedDB delete'));
                tx.objectStore(WALLPAPER_IDB_STORE).delete(WALLPAPER_IDB_RECORD_ID);
            })
    );
}

function revokeWallpaperObjectUrls() {
    while (wallpaperObjectUrls.length) {
        const u = wallpaperObjectUrls.pop();
        try {
            URL.revokeObjectURL(u);
        } catch {
            /* ignore */
        }
    }
}

/** @param {string} url */
function registerWallpaperObjectUrl(url) {
    wallpaperObjectUrls.push(url);
}

/** @param {ReturnType<normalizeThemeSettings>} n */
function hasWallpaperMediaSync(n) {
    if (n.wallpaperEnabled !== true) return false;
    if (n.wallpaperStorage === 'indexeddb') {
        return n.wallpaperKind === 'image' || n.wallpaperKind === 'video';
    }
    if (n.wallpaperStorage === 'inline') {
        return (n.wallpaperUrl?.length || 0) > 64;
    }
    return false;
}

/** @param {Record<string, unknown>} normalized */
function applyWallpaperVeilCss(normalized) {
    const root = document.documentElement;
    const patternStrength = clampNumber(Number(normalized.atmosphere) / 100, 0, 1);
    const wpTint = hasWallpaperMediaSync(normalized);

    if (wpTint) {
        const bloomNorm = clampNumber(Number(normalized.wallpaperBloom) / 100, 0, 1);
        const veilNorm = clampNumber(Number(normalized.wallpaperVeil) / 100, 0, 1);
        const bloomBoost = bloomNorm * (0.45 + patternStrength * 0.55);
        root.style.setProperty('--user-wallpaper-blur', `${28 + bloomBoost * 76}px`);
        root.style.setProperty('--user-wallpaper-bloom-opacity', String(0.14 + bloomBoost * 0.52));
        const veilStrength = veilNorm * (0.55 + patternStrength * 0.45);
        root.style.setProperty('--wallpaper-veil-t', String(0.18 + veilStrength * 0.5));
        root.style.setProperty('--wallpaper-veil-m', String(0.14 + veilStrength * 0.44));
        root.style.setProperty('--wallpaper-veil-accent', String(0.05 + veilStrength * patternStrength * 0.18));
        root.style.setProperty('--wallpaper-veil-layer-opacity', String(0.72 + veilNorm * 0.22));
    } else {
        root.style.setProperty('--user-wallpaper-url', 'none');
        root.style.removeProperty('--user-wallpaper-blur');
        root.style.removeProperty('--user-wallpaper-bloom-opacity');
        root.style.removeProperty('--wallpaper-veil-t');
        root.style.removeProperty('--wallpaper-veil-m');
        root.style.removeProperty('--wallpaper-veil-accent');
        root.style.removeProperty('--wallpaper-veil-layer-opacity');
    }

    const wpLayer = document.getElementById('userWallpaperLayer');
    if (wpLayer) {
        wpLayer.classList.toggle('is-off', !wpTint);
        wpLayer.setAttribute('aria-hidden', wpTint ? 'false' : 'true');
    }
}

async function hydrateWallpaperLayer(normalized) {
    const root = document.documentElement;
    const layer = document.getElementById('userWallpaperLayer');
    const vBloom = document.getElementById('userWallpaperVideoBloom');
    const vSharp = document.getElementById('userWallpaperVideoSharp');

    revokeWallpaperObjectUrls();

    const pauseAndClearVideos = () => {
        [vBloom, vSharp].forEach((v) => {
            if (!(v instanceof HTMLVideoElement)) return;
            v.pause();
            v.removeAttribute('src');
            v.load?.();
        });
    };
    pauseAndClearVideos();

    if (layer) {
        layer.classList.remove('is-video');
        layer.classList.add('is-image');
    }

    const baseActive = hasWallpaperMediaSync(normalized);

    if (!baseActive) {
        root.style.setProperty('--user-wallpaper-url', 'none');
        applyWallpaperVeilCss(normalized);
        return;
    }

    root.style.setProperty('--user-wallpaper-url', 'none');

    const applyOrphan = () => {
        root.style.setProperty('--user-wallpaper-url', 'none');
        pauseAndClearVideos();
        applyWallpaperVeilCss({ ...normalized, wallpaperEnabled: false });
    };

    try {
        if (normalized.wallpaperStorage === 'inline') {
            const safeUrl = (normalized.wallpaperUrl || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            root.style.setProperty('--user-wallpaper-url', safeUrl ? `url("${safeUrl}")` : 'none');
            applyWallpaperVeilCss(normalized);
            return;
        }

        if (normalized.wallpaperStorage === 'indexeddb') {
            const rec = await wallpaperIdbGet();
            if (!rec?.blob || !(rec.blob instanceof Blob)) {
                applyOrphan();
                return;
            }

            const blobUrl = URL.createObjectURL(rec.blob);
            registerWallpaperObjectUrl(blobUrl);
            const kind = rec.kind === 'video' ? 'video' : 'image';

            if (kind === 'video' && vBloom instanceof HTMLVideoElement && vSharp instanceof HTMLVideoElement) {
                root.style.setProperty('--user-wallpaper-url', 'none');
                layer?.classList.add('is-video');
                layer?.classList.remove('is-image');
                vBloom.src = blobUrl;
                vSharp.src = blobUrl;
                const tryPlay = () => {
                    Promise.all([vBloom.play().catch(() => {}), vSharp.play().catch(() => {})]).catch(() => {});
                };
                tryPlay();
                applyWallpaperVeilCss(normalized);
                return;
            }

            const safeUrl = blobUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            root.style.setProperty('--user-wallpaper-url', `url("${safeUrl}")`);
            applyWallpaperVeilCss(normalized);
        }
    } catch (e) {
        console.warn('hydrateWallpaperLayer', e);
        applyOrphan();
    }
}

/**
 * @param {File} file
 * @param {number} maxEdge
 * @param {number} quality
 * @returns {Promise<Blob | null>}
 */
function resizeImageFileToJpegBlob(file, maxEdge = 2400, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(objUrl);
            let { width, height } = img;
            const ratio = Math.min(1, maxEdge / Math.max(width, height));
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Canvas no disponible'));
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
                (blob) => resolve(blob && blob.size > 0 ? blob : null),
                'image/jpeg',
                quality
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(objUrl);
            reject(new Error('No se pudo leer la imagen'));
        };
        img.src = objUrl;
    });
}

/** @param {string} dataUrl */
function parseDataUrlMime(dataUrl) {
    const match = /^data:([^;,]+)/i.exec(dataUrl);
    return match ? match[1].trim() : '';
}

let legacyWallpaperMigrationScheduled = false;

async function migrateLegacyInlineWallpaperToIdbIfNeeded() {
    const cur = normalizeThemeSettings(themeSettings || {});
    if (!cur.wallpaperEnabled || cur.wallpaperStorage !== 'inline') return;
    const url = cur.wallpaperUrl;
    if (!url || url.length < LEGACY_INLINE_WALLPAPER_MIN_CHARS || !url.startsWith('data:')) return;

    try {
        const res = await fetch(url);
        const blob = await res.blob();
        if (!blob || blob.size === 0) return;
        if (blob.size > WALLPAPER_MAX_VIDEO_BYTES) {
            console.warn('[EyedBot] Migración de fondo omitida: archivo demasiado grande.');
            return;
        }

        let mime = blob.type || parseDataUrlMime(url);
        if (!mime) mime = 'application/octet-stream';
        const kind = mime.startsWith('video/') ? 'video' : 'image';

        await wallpaperIdbPut(blob, mime, kind);

        applyThemeSettings(
            normalizeThemeSettings({
                ...cur,
                wallpaperStorage: 'indexeddb',
                wallpaperKind: kind,
                wallpaperMime: mime,
                wallpaperUrl: '',
                wallpaperEnabled: true
            }),
            { persist: true }
        );
        showToast('Fondo migrado a IndexedDB para liberar espacio en localStorage.', 'success');
    } catch (e) {
        console.warn('migrateLegacyInlineWallpaperToIdbIfNeeded', e);
    }
}

function scheduleLegacyWallpaperMigration() {
    if (legacyWallpaperMigrationScheduled) return;
    legacyWallpaperMigrationScheduled = true;
    const run = () => void migrateLegacyInlineWallpaperToIdbIfNeeded();
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(run, { timeout: 4500 });
    } else {
        setTimeout(run, 400);
    }
}

const THEME_PRESETS = {
    midnight: {
        accentPrimary: '#9a6dff',
        accentSecondary: '#ff78d1',
        bgPrimary: '#090512',
        bgSecondary: '#150c26',
        bgCard: '#1a1030',
        textPrimary: '#f4eeff',
        textSecondary: '#cbb7f6',
        borderColor: '#be9bff',
        atmosphere: 55,
        borderStrength: 28
    },
    aurora: {
        accentPrimary: '#39d98a',
        accentSecondary: '#7bdcff',
        bgPrimary: '#071218',
        bgSecondary: '#0f1f2f',
        bgCard: '#13263a',
        textPrimary: '#effeff',
        textSecondary: '#b9e5f7',
        borderColor: '#7bdcff',
        atmosphere: 62,
        borderStrength: 25
    },
    ember: {
        accentPrimary: '#ff8a4c',
        accentSecondary: '#ff4d7d',
        bgPrimary: '#150905',
        bgSecondary: '#27110c',
        bgCard: '#301617',
        textPrimary: '#fff3ed',
        textSecondary: '#ffd1bf',
        borderColor: '#ff8a4c',
        atmosphere: 58,
        borderStrength: 30
    },
    ocean: {
        accentPrimary: '#4aa3ff',
        accentSecondary: '#22d3ee',
        bgPrimary: '#06111a',
        bgSecondary: '#102438',
        bgCard: '#14293d',
        textPrimary: '#eff8ff',
        textSecondary: '#c7e5ff',
        borderColor: '#4aa3ff',
        atmosphere: 60,
        borderStrength: 26
    },
    forest: {
        accentPrimary: '#48d37c',
        accentSecondary: '#9ee37d',
        bgPrimary: '#07150c',
        bgSecondary: '#102517',
        bgCard: '#153122',
        textPrimary: '#f2fff5',
        textSecondary: '#cdecd6',
        borderColor: '#48d37c',
        atmosphere: 57,
        borderStrength: 24
    },
    mono: {
        accentPrimary: '#d4d4d8',
        accentSecondary: '#a1a1aa',
        bgPrimary: '#0a0a0f',
        bgSecondary: '#15151d',
        bgCard: '#1a1a24',
        textPrimary: '#f8fafc',
        textSecondary: '#cbd5e1',
        borderColor: '#cbd5e1',
        atmosphere: 40,
        borderStrength: 18
    },
    /** OLED: negro total y tipografía clara */
    void: {
        accentPrimary: '#ffffff',
        accentSecondary: '#e5e5e5',
        bgPrimary: '#000000',
        bgSecondary: '#000000',
        bgCard: '#0d0d0d',
        textPrimary: '#ffffff',
        textSecondary: '#d4d4d4',
        borderColor: '#2a2a2a',
        atmosphere: 22,
        borderStrength: 16
    },
    ruby: {
        accentPrimary: '#ff3d3d',
        accentSecondary: '#ff8080',
        bgPrimary: '#0c0202',
        bgSecondary: '#170707',
        bgCard: '#221010',
        textPrimary: '#fff5f5',
        textSecondary: '#fecaca',
        borderColor: '#ff3d3d',
        atmosphere: 54,
        borderStrength: 30
    },
    gold: {
        accentPrimary: '#f59e0b',
        accentSecondary: '#fcd34d',
        bgPrimary: '#0c0a03',
        bgSecondary: '#171206',
        bgCard: '#221c0c',
        textPrimary: '#fffbeb',
        textSecondary: '#fde68a',
        borderColor: '#f59e0b',
        atmosphere: 52,
        borderStrength: 26
    },
    indigo: {
        accentPrimary: '#7c8cff',
        accentSecondary: '#b794f6',
        bgPrimary: '#070614',
        bgSecondary: '#0e0c22',
        bgCard: '#14122c',
        textPrimary: '#eef2ff',
        textSecondary: '#c7d2fe',
        borderColor: '#7c8cff',
        atmosphere: 56,
        borderStrength: 27
    }
};

const THEME_DEFAULTS = {
    preset: 'midnight',
    ...THEME_PRESETS.midnight,
    autoContrast: true,
    /** Orbes animados (.gradients-container) detrás del contenido */
    backgroundBubbles: true,
    wallpaperEnabled: false,
    wallpaperStorage: 'none',
    wallpaperKind: 'none',
    wallpaperMime: '',
    wallpaperUrl: '',
    wallpaperBloom: 42,
    wallpaperVeil: 38
};

const NAV_ICON_STROKE = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

const DASHBOARD_ICON = `
    <span class="nav-icon-shell">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" ${NAV_ICON_STROKE} aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5"></rect>
            <rect x="14" y="3" width="7" height="7" rx="1.5"></rect>
            <rect x="3" y="14" width="7" height="7" rx="1.5"></rect>
            <rect x="14" y="14" width="7" height="7" rx="1.5"></rect>
        </svg>
    </span>
`;

const HOME_ICON = `
    <span class="nav-icon-shell">
        <svg class="nav-icon" viewBox="0 0 24 24" fill="none" ${NAV_ICON_STROKE} aria-hidden="true">
            <path d="M15 18l-6-6 6-6"></path>
        </svg>
    </span>
`;

function registerGatedNavigationButtons() {
    const ids = ['serverBtn', 'embedBtn', 'statsBtn', 'logsBtn', 'commandsBtn'];
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (!gatedNavButtonIds.includes(id)) gatedNavButtonIds.push(id);
    });
}

function updateDashboardButtonState() {
    const dashboardBtn = document.getElementById('dashboardBtn');
    if (!dashboardBtn) return;

    if (hasSelectedGuildContext()) {
        dashboardBtn.innerHTML = `${HOME_ICON}<span>Volver a inicio</span>`;
    } else {
        dashboardBtn.innerHTML = `${DASHBOARD_ICON}<span>Dashboard</span>`;
    }
}

function setServerFeaturesNavigationVisible(isVisible) {
    gatedNavButtonIds.forEach((id) => {
        const button = document.getElementById(id);
        if (!button) return;
        button.classList.toggle('nav-hidden', !isVisible);
    });
    updateDashboardButtonState();
}

function hasSelectedGuildContext() {
    return serverFeaturesUnlocked && Boolean(currentServerGuildId);
}

function updateServerMenuIdentity() {
    const guildNameEl = document.getElementById('serverMenuGuildName');
    const guildIconEl = document.getElementById('serverMenuGuildIcon');
    if (!guildNameEl || !guildIconEl) return;

    if (!hasSelectedGuildContext()) {
        guildNameEl.textContent = 'Sin servidor seleccionado';
        guildIconEl.style.display = 'none';
        guildIconEl.src = '';
        updateContextStrip();
        return;
    }

    const selectedGuild = currentServerGuilds.find((g) => String(g.id) === String(currentServerGuildId));
    if (!selectedGuild) {
        guildNameEl.textContent = 'Servidor activo';
        guildIconEl.style.display = 'none';
        guildIconEl.src = '';
        updateContextStrip();
        return;
    }

    guildNameEl.textContent = selectedGuild.name || 'Servidor activo';
    if (selectedGuild.icon) {
        guildIconEl.style.display = 'block';
        guildIconEl.loading = 'eager';
        guildIconEl.decoding = 'async';
        guildIconEl.src = selectedGuild.icon;
    } else {
        guildIconEl.style.display = 'none';
        guildIconEl.src = '';
    }

    updateContextStrip();
    applySideMenuCollapsedState();
}

function updateContextStrip() {
    const strip = document.getElementById('contextStrip');
    const nameEl = document.getElementById('contextGuildName');
    const iconEl = document.getElementById('contextGuildIcon');
    if (!strip || !nameEl || !iconEl) return;

    if (!hasSelectedGuildContext()) {
        strip.classList.remove('active');
        strip.setAttribute('aria-hidden', 'true');
        nameEl.textContent = 'Sin servidor seleccionado';
        iconEl.style.display = 'none';
        iconEl.src = '';
        return;
    }

    strip.classList.add('active');
    strip.setAttribute('aria-hidden', 'false');

    const selectedGuild = currentServerGuilds.find((g) => String(g.id) === String(currentServerGuildId));
    nameEl.textContent = selectedGuild?.name || 'Servidor activo';
    if (selectedGuild?.icon) {
        iconEl.style.display = 'block';
        iconEl.loading = 'eager';
        iconEl.decoding = 'async';
        iconEl.src = selectedGuild.icon;
    } else {
        iconEl.style.display = 'none';
        iconEl.src = '';
    }
}

function setServerSwitchingState(isLoading) {
    isSwitchingServer = isLoading;
    const trigger = document.getElementById('changeServerBtn');
    const selectBtn = document.getElementById('serverSwitcherSelect');
    const dialog = document.querySelector('.server-switcher-dialog');

    if (trigger) trigger.classList.toggle('is-loading', isLoading);
    if (selectBtn) {
        selectBtn.disabled = isLoading;
        selectBtn.textContent = isLoading ? 'Cargando...' : 'Seleccionar';
    }
    if (dialog) dialog.classList.toggle('is-loading', isLoading);
}

function updateBackToServerButtonsVisibility(sectionId = '') {
    const isVisible = hasSelectedGuildContext() && ['embedSection', 'statsSection', 'logsSection', 'nukeSection'].includes(sectionId);
    ['backToServerFromEmbed', 'backToServerFromStats', 'backToServerFromLogs', 'backToServerFromNuke', 'backToServerFromCommands'].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.style.display = isVisible ? 'inline-flex' : 'none';
    });
}

const SERVER_UI_PREFS_KEY = 'eyedbot_server_ui_prefs_v1';

function getServerUIPreferences() {
    try {
        const raw = localStorage.getItem(SERVER_UI_PREFS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function getServerPreference(guildId, key, fallback = {}) {
    const prefs = getServerUIPreferences();
    const guildPrefs = prefs[String(guildId)] || {};
    const value = guildPrefs[key];
    if (!value || typeof value !== 'object') return { ...fallback };
    return { ...fallback, ...value };
}

function setServerPreference(guildId, key, value) {
    const prefs = getServerUIPreferences();
    const guildKey = String(guildId);
    if (!prefs[guildKey] || typeof prefs[guildKey] !== 'object') prefs[guildKey] = {};
    prefs[guildKey][key] = value;
    localStorage.setItem(SERVER_UI_PREFS_KEY, JSON.stringify(prefs));
}

function clearServerBoundSectionState() {
    const channelSelect = document.getElementById('channelSelect');
    if (channelSelect) {
        channelSelect.disabled = true;
        channelSelect.innerHTML = '<option value="">Selecciona un servidor desde el Dashboard</option>';
    }

    const guildSelect = document.getElementById('guildSelect');
    if (guildSelect) {
        guildSelect.disabled = true;
        guildSelect.innerHTML = '<option value="">Selecciona un servidor en el Dashboard</option>';
    }

    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
        templateSelect.disabled = true;
        templateSelect.innerHTML = '<option value="">Selecciona un servidor para cargar plantillas</option>';
    }

    const serverSelect = document.getElementById('serverSelect');
    if (serverSelect) {
        serverSelect.disabled = true;
        serverSelect.innerHTML = '<option value="">Selecciona un servidor desde el Dashboard</option>';
    }

    const containerIds = ['serverTabs', 'serverInfoContainer', 'moderationContainer', 'welcomeContainer', 'verifyContainer', 'ticketContainer', 'levelsContainer', 'voiceCreatorContainer', 'automationContainer', 'securityContainer', 'notificationsContainer', 'freeGamesContainer', 'channelSetupContainer'];
    containerIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

function resetServerContextToDashboard() {
    serverFeaturesUnlocked = false;
    currentServerGuildId = '';
    currentServerGuilds = [];
    setServerFeaturesNavigationVisible(false);
    clearServerBoundSectionState();
    updateServerMenuIdentity();
    updateBackToServerButtonsVisibility('dashboard');
    updateDashboardButtonState();
    applySideMenuCollapsedState();
    saveState();
}

function applySideMenuCollapsedState() {
    const menu = document.getElementById('serverSideMenu');
    if (!menu) return;

    const prefs = hasSelectedGuildContext()
        ? getServerPreference(currentServerGuildId, 'collapsedGroups', {})
        : {};

    menu.querySelectorAll('.side-menu-group[data-group]').forEach((group) => {
        const groupId = group.dataset.group || '';
        const isCollapsed = Boolean(prefs[groupId]);
        group.classList.toggle('collapsed', isCollapsed);
    });
}

function toggleSideMenuGroupCollapsed(groupId) {
    if (!groupId) return;
    if (!hasSelectedGuildContext()) return;

    const current = getServerPreference(currentServerGuildId, 'collapsedGroups', {});
    current[groupId] = !current[groupId];
    setServerPreference(currentServerGuildId, 'collapsedGroups', current);
    applySideMenuCollapsedState();
}

function ensureServerPaneHeadStructure(head, meta = {}) {
    if (!head) return;

    head.classList.add('server-pane-head--structured');
    if (meta.tone) {
        head.dataset.paneTone = meta.tone;
    }

    const actions = head.querySelector('.server-pane-head-actions, .ticket-manage-actions');
    let main = head.querySelector('.server-pane-head-main');
    if (!main) {
        main = document.createElement('div');
        main.className = 'server-pane-head-main';
        const firstBlock = head.querySelector(':scope > div:not(.server-pane-head-actions):not(.ticket-manage-actions)');
        if (firstBlock) {
            main.appendChild(firstBlock);
        }
        head.prepend(main);
    }

    if (actions && actions.parentElement === main) {
        head.appendChild(actions);
    }

    const firstBlock = main.querySelector('.server-pane-head-copy')
        || main.querySelector(':scope > div:not(.server-pane-head-actions):not(.ticket-manage-actions)');
    if (firstBlock && !firstBlock.classList.contains('server-pane-head-copy')) {
        firstBlock.classList.add('server-pane-head-copy');
    }

    if (actions && !actions.classList.contains('server-pane-head-actions')) {
        actions.classList.add('server-pane-head-actions');
    }

}

function decorateServerConfigNavigation() {
    Object.entries(SERVER_PANE_META).forEach(([paneId, meta]) => {
        const button = document.querySelector(`.side-menu-btn[data-server-pane="${paneId}"]`);
        if (!button) return;

        if (meta.tone) {
            button.dataset.paneTone = meta.tone;
        }

        const label = button.querySelector('.side-menu-label');
        if (!label) return;

        const title = label.querySelector('.side-menu-label-title');
        if (title) {
            label.textContent = title.textContent.trim();
        }

        label.querySelectorAll('.side-menu-label-hint').forEach((hint) => hint.remove());
    });
}

function applyServerConfigPaneMeta() {
    Object.entries(SERVER_PANE_META).forEach(([paneId, meta]) => {
        const pane = document.getElementById(paneId);
        if (!pane) return;
        ensureServerPaneHeadStructure(pane.querySelector('.server-pane-head'), meta);
    });
}

function initializeServerConfigShell() {
    const section = document.getElementById('serverSection');
    if (!section) return;
    section.classList.add('server-config-shell');
    decorateServerConfigNavigation();
    applyServerConfigPaneMeta();
    refreshPremiumLocks();
}

function activateServerSideButton(button) {
    const allButtons = document.querySelectorAll('.side-menu-btn');
    allButtons.forEach((btn) => btn.classList.remove('active'));
    if (button) button.classList.add('active');
}

function switchServerPane(paneId, button = null) {
    if (!paneId) return;

    if (paneId === 'serverPaneChannelSetup') {
        pendingAutomationDpxTab = 'channelsetup';
        paneId = 'serverPaneAutomation';
    }

    const panes = document.querySelectorAll('.server-pane');
    panes.forEach((pane) => pane.classList.remove('active'));

    let targetPane = document.getElementById(paneId);
    if (!targetPane) {
        paneId = 'serverPaneOverview';
        targetPane = document.getElementById(paneId);
        if (!targetPane) return;
    }
    targetPane.classList.add('active');
    currentServerPaneId = paneId;

    // No hacer scroll automático - mantener posición del usuario
    // const contentArea = document.querySelector('.server-content-area');
    // if (contentArea) contentArea.scrollTop = 0;
    // targetPane.scrollTop = 0;

    if (button) {
        activateServerSideButton(button);
    } else {
        const targetButton = document.querySelector(`.side-menu-btn[data-server-pane="${paneId}"]`);
        activateServerSideButton(targetButton);
    }

    // Hook: cargar datos especificos al abrir ciertos panes
    if (paneId === 'serverPaneTicketsManage' && typeof openTicketsManagePane === 'function') {
        try { openTicketsManagePane(); } catch (e) { console.error('openTicketsManagePane error', e); }
    } else if (typeof stopTicketsManageAutoRefresh === 'function') {
        stopTicketsManageAutoRefresh();
    }

    if (paneId === 'serverPaneFreeGames' && typeof openFreeGamesPane === 'function') {
        if (hasPremiumAccess()) {
            try { openFreeGamesPane(); } catch (e) { console.error('openFreeGamesPane error', e); }
        }
    }

    if (paneId === 'serverPaneAutomation' && pendingAutomationDpxTab) {
        const tabKey = pendingAutomationDpxTab;
        pendingAutomationDpxTab = null;
        queueMicrotask(() => {
            const ac = document.getElementById('automationContainer');
            const tabBtn = ac?.querySelector(`[data-dpx-tab="${tabKey}"]`);
            if (tabBtn) tabBtn.click();
        });
    }

    if (isPremiumPane(paneId) && hasSelectedGuildContext()) {
        if (hasPremiumAccess()) {
            loadPremiumPaneData(paneId, currentServerGuildId);
        } else {
            injectPremiumPreview(paneId);
        }
    }
    enforceAllPremiumLocks();

    window.EyedBotMobile?.onServerPaneChange?.(paneId);
}

function handleServerSideAction(button) {
    if (!button) return;

    const paneId = button.dataset.serverPane || '';
    const quickSection = button.dataset.quickSection || '';

    if (paneId) {
        const serverSection = document.getElementById('serverSection');
        const alreadyOnServer = serverSection?.classList.contains('active');
        if (alreadyOnServer && hasSelectedGuildContext()) {
            switchServerPane(paneId, button);
            saveState();
            return;
        }
        showSection('serverSection', {
            skipServerDataLoad: hasSelectedGuildContext(),
            serverPaneAfterLoad: paneId,
            serverPaneAfterLoadButton: button
        });
        return;
    }

    if (quickSection) {
        activateServerSideButton(button);
        showSection(quickSection);
        const quickName = (button.textContent || '').trim();
        if (quickName) {
            showToast(`Abriendo atajo rapido: ${quickName}`, 'success');
        }
    }
}

function getServerSwitcherGuildIcon(guild) {
    if (guild?.icon) {
        return `<img class="server-switcher-icon" src="${guild.icon}" alt="${escapeHtml(guild.name || 'Servidor')}">`;
    }

    return `
        <span class="server-switcher-icon server-switcher-icon--fallback" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
        </span>
    `;
}

function renderServerSwitcherSlides() {
    const track = document.getElementById('serverSwitcherTrack');
    const currentIndexEl = document.getElementById('serverSwitcherCurrentIndex');
    const totalEl = document.getElementById('serverSwitcherTotal');
    const selectBtn = document.getElementById('serverSwitcherSelect');
    if (!track || !currentIndexEl || !totalEl || !selectBtn) return;

    const total = serverSwitcherGuilds.length;
    if (!total) {
        track.innerHTML = '<div class="server-switcher-slide"><p class="server-switcher-meta">No hay servidores disponibles.</p></div>';
        currentIndexEl.textContent = '0';
        totalEl.textContent = '0';
        selectBtn.disabled = true;
        return;
    }

    track.innerHTML = serverSwitcherGuilds.map((guild) => {
        const memberCount = guild?.botGuild?.memberCount || 0;
        return `
            <article class="server-switcher-slide" data-guild-id="${guild.id}">
                <div class="server-switcher-server">
                    ${getServerSwitcherGuildIcon(guild)}
                    <div>
                        <h4 class="server-switcher-name">${escapeHtml(guild.name || 'Servidor')}</h4>
                        <p class="server-switcher-meta">${memberCount} miembros</p>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    serverSwitcherIndex = Math.max(0, Math.min(serverSwitcherIndex, total - 1));
    track.style.transform = `translateX(-${serverSwitcherIndex * 100}%)`;
    currentIndexEl.textContent = String(serverSwitcherIndex + 1);
    totalEl.textContent = String(total);
    selectBtn.disabled = false;
}

function moveServerSwitcher(direction = 1) {
    if (!serverSwitcherGuilds.length) return;
    const total = serverSwitcherGuilds.length;
    serverSwitcherIndex = (serverSwitcherIndex + direction + total) % total;

    const track = document.getElementById('serverSwitcherTrack');
    const currentIndexEl = document.getElementById('serverSwitcherCurrentIndex');
    if (track) {
        track.style.transform = `translateX(-${serverSwitcherIndex * 100}%)`;
    }
    if (currentIndexEl) {
        currentIndexEl.textContent = String(serverSwitcherIndex + 1);
    }
}

function startServerSwitcherSwipe(touchX) {
    serverSwitcherTouchStartX = Number(touchX) || 0;
    serverSwitcherTouchDeltaX = 0;
}

function updateServerSwitcherSwipe(touchX) {
    const currentX = Number(touchX) || 0;
    serverSwitcherTouchDeltaX = currentX - serverSwitcherTouchStartX;
}

function endServerSwitcherSwipe() {
    const threshold = 42;
    if (Math.abs(serverSwitcherTouchDeltaX) < threshold) {
        serverSwitcherTouchStartX = 0;
        serverSwitcherTouchDeltaX = 0;
        return;
    }

    if (serverSwitcherTouchDeltaX < 0) {
        moveServerSwitcher(1);
    } else {
        moveServerSwitcher(-1);
    }

    serverSwitcherTouchStartX = 0;
    serverSwitcherTouchDeltaX = 0;
}

function closeServerSwitcherModal() {
    const modal = document.getElementById('serverSwitcherModal');
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
}

async function openServerSwitcherModal() {
    const modal = document.getElementById('serverSwitcherModal');
    try {
        if (Array.isArray(currentServerGuilds) && currentServerGuilds.length) {
            serverSwitcherGuilds = currentServerGuilds;
            const selectedIndex = serverSwitcherGuilds.findIndex((g) => String(g.id) === String(currentServerGuildId));
            serverSwitcherIndex = selectedIndex >= 0 ? selectedIndex : 0;
            renderServerSwitcherSlides();
            if (modal) {
                modal.classList.add('show');
                modal.setAttribute('aria-hidden', 'false');
            }
        }

        setServerSwitchingState(true);
        const response = await fetchWithCredentials('/api/guilds');
        if (!response.ok) {
            showToast('No se pudieron cargar los servidores', 'error');
            return;
        }

        const guilds = await response.json();
        serverSwitcherGuilds = Array.isArray(guilds) ? guilds : [];
        currentServerGuilds = serverSwitcherGuilds;

        if (!serverSwitcherGuilds.length) {
            showToast('No hay servidores disponibles', 'warning');
            return;
        }

        const selectedIndex = serverSwitcherGuilds.findIndex((g) => String(g.id) === String(currentServerGuildId));
        serverSwitcherIndex = selectedIndex >= 0 ? selectedIndex : 0;
        renderServerSwitcherSlides();

        if (!modal) return;
        modal.classList.add('show');
        modal.setAttribute('aria-hidden', 'false');
    } catch (error) {
        console.error('Error abriendo selector de servidores:', error);
        showToast('No se pudo abrir el selector de servidores', 'error');
    } finally {
        setServerSwitchingState(false);
    }
}

async function confirmServerSwitcherSelection() {
    const selectedGuild = serverSwitcherGuilds[serverSwitcherIndex];
    if (!selectedGuild) {
        showToast('Servidor no valido', 'warning');
        return;
    }

    setServerSwitchingState(true);
    closeServerSwitcherModal();
    try {
        await window.selectGuild(selectedGuild.id);
    } finally {
        setServerSwitchingState(false);
    }
}

window.showSection = showSection;
window.openServerSwitcherModal = openServerSwitcherModal;
window.closeServerSwitcherModal = closeServerSwitcherModal;
window.moveServerSwitcher = moveServerSwitcher;
window.confirmServerSwitcherSelection = confirmServerSwitcherSelection;

// Función auxiliar para fetch con credenciales
async function fetchWithCredentials(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        credentials: 'include' // Siempre incluir cookies
    });

    const normalizedUrl = String(url || '');
    const isBillingEndpoint = normalizedUrl.startsWith('/api/billing/');
    if (!isBillingEndpoint && (response.status === 402 || response.status === 403)) {
        const payload = await response.clone().json().catch(() => ({}));
        const routeGuildId = normalizedUrl.match(/^\/api\/guild\/([^/]+)/)?.[1] || '';
        const deniedManagement = response.status === 403
            && routeGuildId
            && String(routeGuildId) === String(currentServerGuildId)
            && /permisos|acceso|gestionar/i.test(String(payload?.error || ''));

        if (deniedManagement && !guildAccessResetLock) {
            guildAccessResetLock = true;
            resetServerContextToDashboard();
            showToast('El servidor seleccionado ya no está disponible para gestionar. Selecciona otro desde Dashboard.', 'warning');
            setTimeout(() => {
                guildAccessResetLock = false;
            }, 3000);
        }

        if (payload?.code === 'premium_required') {
            if (isPremiumPane(currentServerPaneId)) {
                enforceAllPremiumLocks();
            }
            if (!premiumUpsellLock) {
                premiumUpsellLock = true;
                showToast(`Este módulo requiere ${EYED_PLUS_BRAND}. Activa Mercado Pago para desbloquearlo.`, 'warning');
                ensureBillingPanel();
                setTimeout(() => {
                    premiumUpsellLock = false;
                }, 1500);
            }
        }
    }

    return response;
}

function billingStatusLabel(status = '') {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'active') return 'Activa';
    if (normalized === 'trialing') return 'En prueba';
    if (normalized === 'past_due') return 'Pago pendiente';
    if (normalized === 'canceled') return 'Cancelada';
    if (normalized === 'unpaid') return 'Impaga';
    if (normalized === 'incomplete') return 'Incompleta';
    return 'Inactiva';
}

function renderBillingState() {
    const statusNode = document.getElementById('billingStatusValue');
    const periodNode = document.getElementById('billingPeriodValue');
    const actionNode = document.getElementById('billingActionHint');
    const manageBtn = document.getElementById('billingManageBtn');
    if (!statusNode || !periodNode || !actionNode || !manageBtn) return;

    const status = String(currentBillingState?.status || 'inactive').toLowerCase();
    const isActive = currentBillingState?.active === true;
    const period = currentBillingState?.currentPeriodEnd
        ? new Date(currentBillingState.currentPeriodEnd).toLocaleDateString('es-ES')
        : 'Sin fecha';

    statusNode.textContent = billingStatusLabel(status);
    statusNode.dataset.billingState = isActive ? 'active' : 'inactive';
    periodNode.textContent = isActive ? `Renueva el ${period}` : period;

    if (isActive) {
        actionNode.textContent = currentBillingState?.cancelAtPeriodEnd
            ? 'Tu suscripción finalizará al terminar el período actual.'
            : EYED_PLUS_ACTIVE_HINT;
        manageBtn.hidden = false;
    } else {
        actionNode.textContent = EYED_PLUS_UNLOCK_HINT;
        manageBtn.hidden = true;
    }

    document.querySelectorAll('[data-billing-status]').forEach((node) => {
        node.textContent = billingStatusLabel(status);
        node.dataset.billingState = isActive ? 'active' : 'inactive';
    });
    document.querySelectorAll('[data-billing-period]').forEach((node) => {
        node.textContent = isActive ? `Renueva el ${period}` : period;
    });
    document.querySelectorAll('[data-billing-hint]').forEach((node) => {
        node.textContent = isActive
            ? (currentBillingState?.cancelAtPeriodEnd
                ? 'Tu suscripción finalizará al terminar el período actual.'
                : EYED_PLUS_ACTIVE_HINT)
            : EYED_PLUS_UNLOCK_HINT;
    });
    document.querySelectorAll('[data-billing-manage]').forEach((node) => {
        node.hidden = !isActive;
    });
}

function ensureBillingPanel() {
    const pane = document.getElementById('settingsPaneAccount');
    if (!pane) return;
    if (document.getElementById('billingPanelCard')) {
        renderBillingState();
        return;
    }

    const host = pane.querySelector('.settings-pane-body');
    if (!host) return;

    const wrapper = document.createElement('article');
    wrapper.id = 'billingPanelCard';
    wrapper.className = 'billing-panel-card';
    wrapper.innerHTML = `
        <header class="billing-panel-head">
            <div>
                <h4>${EYED_PLUS_BRAND}</h4>
                <p>Gestiona tu suscripción mensual con Mercado Pago.</p>
            </div>
            <span class="billing-badge" id="billingStatusValue" data-billing-status data-billing-state="inactive">Inactiva</span>
        </header>
        <div class="billing-panel-body">
            <div class="billing-meta-row">
                <span>Periodo</span>
                <strong id="billingPeriodValue" data-billing-period>Sin fecha</strong>
            </div>
            <p id="billingActionHint" data-billing-hint>${EYED_PLUS_UNLOCK_HINT}</p>
            <div class="billing-actions">
                <button type="button" id="billingUpgradeBtn" class="btn btn-primary">${EYED_PLUS_ACTIVATE_LABEL}</button>
                <button type="button" id="billingManageBtn" class="btn btn-secondary" data-billing-manage hidden>Cancelar suscripción</button>
            </div>
        </div>
    `;

    host.appendChild(wrapper);
    ensurePremiumSectionBillingPanel();
    const upgradeBtn = document.getElementById('billingUpgradeBtn');
    const manageBtn = document.getElementById('billingManageBtn');
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', () => {
            void startPremiumCheckout();
        });
    }
    if (manageBtn) {
        manageBtn.addEventListener('click', () => {
            void openBillingPortal();
        });
    }
    renderBillingState();
}

function ensurePremiumSectionBillingPanel() {
    const host = document.getElementById('premiumSectionBillingHost');
    if (!host || document.getElementById('billingPanelCardPremium')) return;

    const wrapper = document.createElement('article');
    wrapper.id = 'billingPanelCardPremium';
    wrapper.className = 'billing-panel-card billing-panel-card--page';
    wrapper.innerHTML = `
        <header class="billing-panel-head">
            <div>
                <h4>Tu suscripción</h4>
                <p>Plan mensual con Mercado Pago. El estado se actualiza automáticamente.</p>
            </div>
            <span class="billing-badge" data-billing-status data-billing-state="inactive">Inactiva</span>
        </header>
        <div class="billing-panel-body">
            <div class="billing-meta-row">
                <span>Periodo</span>
                <strong data-billing-period>Sin fecha</strong>
            </div>
            <p data-billing-hint>${EYED_PLUS_UNLOCK_HINT}</p>
            <div class="billing-actions">
                <button type="button" id="billingUpgradeBtnPremium" class="btn btn-primary">${EYED_PLUS_ACTIVATE_LABEL}</button>
                <button type="button" id="billingManageBtnPremium" class="btn btn-secondary" data-billing-manage hidden>Cancelar suscripción</button>
            </div>
        </div>
    `;
    host.appendChild(wrapper);

    document.getElementById('billingUpgradeBtnPremium')?.addEventListener('click', () => {
        void startPremiumCheckout();
    });
    document.getElementById('billingManageBtnPremium')?.addEventListener('click', () => {
        void openBillingPortal();
    });
    renderBillingState();
}

async function loadBillingStatus() {
    try {
        const response = await fetchWithCredentials('/api/billing/status');
        if (!response.ok) return;
        const data = await response.json();
        currentBillingState = {
            active: isOwnerUser || data?.active === true,
            status: isOwnerUser ? 'active' : String(data?.status || 'inactive'),
            customerId: String(data?.customerId || ''),
            subscriptionId: String(data?.subscriptionId || ''),
            currentPeriodEnd: data?.currentPeriodEnd || null,
            cancelAtPeriodEnd: data?.cancelAtPeriodEnd === true
        };
        renderBillingState();
        refreshPremiumLocks();
        handleActivePremiumPaneAfterBillingChange();
    } catch (error) {
        console.warn('No se pudo cargar estado premium:', error);
    }
}

async function startPremiumCheckout() {
    try {
        const response = await fetchWithCredentials('/api/billing/checkout-session', {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.url) {
            showToast(data.error || `No se pudo iniciar el checkout de ${EYED_PLUS_BRAND}`, 'error');
            return;
        }
        window.location.assign(data.url);
    } catch (error) {
        console.error('Error iniciando checkout premium:', error);
        showToast(`Error iniciando pago de ${EYED_PLUS_BRAND}`, 'error');
    }
}

async function openBillingPortal() {
    try {
        const response = await fetchWithCredentials('/api/billing/portal', {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo gestionar la suscripción', 'error');
            return;
        }
        showToast(data.message || 'Suscripción actualizada', 'success');
        await loadBillingStatus();
        handleActivePremiumPaneAfterBillingChange();
    } catch (error) {
        console.error('Error gestionando suscripción premium:', error);
        showToast(`Error gestionando suscripción ${EYED_PLUS_BRAND}`, 'error');
    }
}

function handleBillingQueryFeedback() {
    const params = new URLSearchParams(window.location.search || '');
    const billingState = String(params.get('billing') || '').trim().toLowerCase();
    if (!billingState) return;
    if (billingState === 'success') {
        showToast(`Pago completado. Actualizando ${EYED_PLUS_BRAND}...`, 'success');
        void loadBillingStatus();
    }
    if (billingState === 'cancelled') showToast('Pago cancelado. Puedes reintentarlo cuando quieras.', 'warning');
    if (billingState === 'portal_return') showToast('Suscripción actualizada.', 'success');
    params.delete('billing');
    const query = params.toString();
    const target = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState({}, '', target);
}

const PREMIUM_PANE_CONFIG = {
    serverPaneTicketsManage: {
        preview: 'tickets',
        title: 'Gestión de tickets',
        hint: 'Cola, historial y panel de soporte en tiempo real.'
    },
    serverPaneSecurity: {
        preview: 'antiraid',
        title: 'Centro anti-raid',
        hint: 'Protección automática contra raids y spam masivo.'
    },
    serverPaneGacha: {
        preview: 'gacha',
        title: 'Gacha / economía',
        hint: 'Rolls, tienda, mercado y ranking de tu servidor.'
    },
    serverPaneFreeGames: {
        preview: 'freegames',
        title: 'Juegos gratis',
        hint: 'Avisos automáticos de Epic Games y Steam en tu servidor.'
    }
};

const PREMIUM_SETTINGS_PANE_CONFIG = {
    settingsPaneTheme: {
        preview: 'theme',
        title: 'Personalización del panel',
        hint: `Temas, colores y fondos personalizados con ${EYED_PLUS_BRAND}.`
    }
};

function hasPremiumAccess() {
    return isOwnerUser === true || currentBillingState?.active === true;
}

function isPremiumPane(paneId) {
    return Boolean(PREMIUM_PANE_CONFIG[String(paneId || '')]);
}

function getPremiumContentHost(pane) {
    if (!pane?.id) return null;
    const cfg = PREMIUM_PANE_CONFIG[pane.id];
    if (!cfg) return null;
    if (pane.id === 'serverPaneTicketsManage') {
        return pane.querySelector('#ticketManageContainer');
    }
    return pane.querySelector('.moderation-container');
}

function ensurePremiumLockStructure(pane) {
    const surface = pane?.querySelector('.server-pane-surface');
    const host = getPremiumContentHost(pane);
    if (!surface || !host) return null;

    surface.classList.add('premium-lock-shell');
    host.classList.add('premium-lock-content-host');

    let body = surface.querySelector('.premium-lock-body');
    if (!body) {
        body = document.createElement('div');
        body.className = 'premium-lock-body';
        const head = surface.querySelector('.server-pane-head');
        if (head && head.nextSibling) {
            surface.insertBefore(body, head.nextSibling);
        } else {
            surface.appendChild(body);
        }
        body.appendChild(host);
    }

    return { surface, body, host };
}

function buildPremiumOverlayHtml(meta = {}) {
    const title = escapeHtml(meta.title || `Módulo ${EYED_PLUS_BRAND}`);
    const hint = escapeHtml(meta.hint || `Activa ${EYED_PLUS_BRAND} para desbloquear este módulo.`);
    return `
        <div class="premium-lock-card" role="dialog" aria-labelledby="premiumLockTitle">
            <div class="premium-lock-badge" aria-hidden="true">${escapeHtml(EYED_PLUS_BRAND)}</div>
            <h3 id="premiumLockTitle" class="premium-lock-title">${title}</h3>
            <p class="premium-lock-desc">${hint}</p>
            <div class="premium-lock-actions">
                <button type="button" class="btn btn-primary premium-lock-activate-btn">${escapeHtml(EYED_PLUS_ACTIVATE_LABEL)}</button>
                <button type="button" class="btn btn-secondary premium-lock-settings-btn">Ver ${escapeHtml(EYED_PLUS_BRAND)}</button>
            </div>
        </div>
    `;
}

function wirePremiumOverlayActions(overlay) {
    if (!overlay || overlay.dataset.wired === '1') return;
    overlay.dataset.wired = '1';
    overlay.querySelector('.premium-lock-activate-btn')?.addEventListener('click', () => {
        void startPremiumCheckout();
    });
    overlay.querySelector('.premium-lock-settings-btn')?.addEventListener('click', () => {
        showSection('premiumSection');
        ensurePremiumSectionBillingPanel();
    });
}

function getPremiumPreviewHtml(previewKey = '') {
    if (previewKey === 'tickets') {
        return `
            <div class="premium-preview premium-preview--tickets" aria-hidden="true">
                <div class="premium-preview-stats">
                    <div class="premium-preview-stat"></div>
                    <div class="premium-preview-stat"></div>
                    <div class="premium-preview-stat"></div>
                </div>
                <div class="premium-preview-toolbar"></div>
                <div class="premium-preview-list">
                    <div class="premium-preview-row"></div>
                    <div class="premium-preview-row"></div>
                    <div class="premium-preview-row"></div>
                    <div class="premium-preview-row"></div>
                </div>
            </div>
        `;
    }
    if (previewKey === 'antiraid') {
        return `
            <div class="premium-preview premium-preview--antiraid" aria-hidden="true">
                <div class="premium-preview-hero"></div>
                <div class="premium-preview-grid">
                    <div class="premium-preview-card"></div>
                    <div class="premium-preview-card"></div>
                    <div class="premium-preview-card wide"></div>
                </div>
                <div class="premium-preview-form">
                    <div class="premium-preview-line long"></div>
                    <div class="premium-preview-line"></div>
                    <div class="premium-preview-line short"></div>
                </div>
            </div>
        `;
    }
    if (previewKey === 'freegames') {
        return `
            <div class="premium-preview premium-preview--freegames" aria-hidden="true">
                <div class="premium-preview-stats">
                    <div class="premium-preview-stat"></div>
                    <div class="premium-preview-stat"></div>
                    <div class="premium-preview-stat"></div>
                </div>
                <div class="premium-preview-tabs">
                    <span></span><span></span><span></span>
                </div>
                <div class="premium-preview-list">
                    <div class="premium-preview-row"></div>
                    <div class="premium-preview-row"></div>
                    <div class="premium-preview-row"></div>
                </div>
            </div>
        `;
    }
    if (previewKey === 'theme') {
        return `
            <div class="premium-preview premium-preview--theme" aria-hidden="true">
                <div class="premium-preview-hero"></div>
                <div class="premium-preview-grid">
                    <div class="premium-preview-card"></div>
                    <div class="premium-preview-card"></div>
                    <div class="premium-preview-card wide"></div>
                </div>
                <div class="premium-preview-tabs">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;
    }
    return `
        <div class="premium-preview premium-preview--gacha" aria-hidden="true">
            <div class="premium-preview-tabs">
                <span></span><span></span><span></span><span></span>
            </div>
            <div class="premium-preview-grid">
                <div class="premium-preview-card tall"></div>
                <div class="premium-preview-card"></div>
                <div class="premium-preview-card"></div>
                <div class="premium-preview-card"></div>
            </div>
            <div class="premium-preview-table">
                <div class="premium-preview-row"></div>
                <div class="premium-preview-row"></div>
                <div class="premium-preview-row"></div>
            </div>
        </div>
    `;
}

function shouldReplaceWithPremiumPreview(host) {
    if (!host) return true;
    const text = String(host.textContent || '').trim();
    if (!text) return true;
    if (host.querySelector('.premium-preview')) return false;
    if (host.querySelector('.loading, .tm-list-empty, [style*="error"]')) return true;
    return false;
}

function injectPremiumPreview(paneId) {
    const pane = document.getElementById(paneId);
    const cfg = PREMIUM_PANE_CONFIG[paneId];
    const structure = ensurePremiumLockStructure(pane);
    if (!structure || !cfg) return;
    if (shouldReplaceWithPremiumPreview(structure.host)) {
        structure.host.innerHTML = getPremiumPreviewHtml(cfg.preview);
    }
}

function updatePremiumOverlayContent(overlay, cfg) {
    if (!overlay || !cfg) return;
    const titleEl = overlay.querySelector('.premium-lock-title');
    const descEl = overlay.querySelector('.premium-lock-desc');
    if (titleEl) titleEl.textContent = cfg.title;
    if (descEl) descEl.textContent = cfg.hint;
}

function ensurePremiumOverlay(surface, cfg, visible) {
    if (!surface || !cfg) return null;
    let overlay = surface.querySelector(':scope > .premium-lock-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'premium-lock-overlay';
        overlay.innerHTML = buildPremiumOverlayHtml(cfg);
        surface.appendChild(overlay);
        wirePremiumOverlayActions(overlay);
    } else {
        updatePremiumOverlayContent(overlay, cfg);
    }
    overlay.classList.toggle('is-overlay-visible', visible === true);
    return overlay;
}

function syncPremiumPaneLock(paneId) {
    const pane = document.getElementById(paneId);
    if (!pane || !isPremiumPane(paneId)) return;

    const cfg = PREMIUM_PANE_CONFIG[paneId];
    const structure = ensurePremiumLockStructure(pane);
    if (!structure) return;

    const locked = !hasPremiumAccess();
    const isActive = pane.classList.contains('active');
    pane.classList.toggle('is-premium-locked', locked);

    if (locked) {
        if (isActive) {
            injectPremiumPreview(paneId);
        }
        ensurePremiumOverlay(structure.surface, cfg, isActive);
        if (isActive) {
            structure.host?.setAttribute('aria-hidden', 'true');
        } else {
            structure.host?.removeAttribute('aria-hidden');
        }
    } else {
        structure.surface.querySelector('.premium-lock-overlay')?.remove();
        structure.host?.removeAttribute('aria-hidden');
    }
}

function isPremiumSettingsPane(paneId) {
    return Boolean(PREMIUM_SETTINGS_PANE_CONFIG[String(paneId || '')]);
}

function ensurePremiumSettingsLockStructure(pane) {
    const surface = pane?.querySelector('.settings-pane-shell');
    const host = pane?.querySelector('.settings-pane-body');
    if (!surface || !host) return null;

    surface.classList.add('premium-lock-shell');
    host.classList.add('premium-lock-content-host');
    return { surface, host };
}

let themePaneBodyStashHtml = '';

function getSettingsContentArea() {
    return document.querySelector('#profileSettingsSection .settings-content');
}

function lockThemePaneContent(host) {
    if (!host || hasPremiumAccess()) return;
    const shell = host.closest('.settings-pane-shell');
    shell?.setAttribute('inert', '');
    document.getElementById('themeLab')?.setAttribute('aria-hidden', 'true');

    if (host.dataset.premiumLocked === '1') return;
    if (host.querySelector('.settings-theme-studio')) {
        themePaneBodyStashHtml = host.innerHTML;
        host.dataset.premiumLocked = '1';
        host.innerHTML = getPremiumPreviewHtml('theme');
    } else if (shouldReplaceWithPremiumPreview(host)) {
        host.dataset.premiumLocked = '1';
        host.innerHTML = getPremiumPreviewHtml('theme');
    }
}

function unlockThemePaneContent(host) {
    if (!host) return;
    const shell = host.closest('.settings-pane-shell');
    shell?.removeAttribute('inert');
    document.getElementById('themeLab')?.removeAttribute('aria-hidden');

    if (host.dataset.premiumLocked !== '1') return;
    if (themePaneBodyStashHtml) {
        host.innerHTML = themePaneBodyStashHtml;
        themePaneBodyStashHtml = '';
    }
    delete host.dataset.premiumLocked;
    if (hasPremiumAccess()) {
        syncThemeControls(themeSettings);
    }
}

function refreshSettingsPremiumContentLock() {
    const contentArea = getSettingsContentArea();
    const themePane = document.getElementById('settingsPaneTheme');
    const locked = !hasPremiumAccess();
    const isActiveTheme = themePane?.classList.contains('active') && currentSettingsPaneId === 'settingsPaneTheme';
    contentArea?.classList.toggle('is-premium-theme-locked', locked && isActiveTheme);
}

function syncPremiumSettingsPaneLock(paneId) {
    const pane = document.getElementById(paneId);
    if (!pane || !isPremiumSettingsPane(paneId)) return;

    const cfg = PREMIUM_SETTINGS_PANE_CONFIG[paneId];
    const structure = ensurePremiumSettingsLockStructure(pane);
    if (!structure) return;

    const locked = !hasPremiumAccess();
    const isActive = pane.classList.contains('active');
    pane.classList.toggle('is-premium-locked', locked);

    const contentArea = getSettingsContentArea();
    structure.surface.querySelector(':scope > .premium-lock-overlay')?.remove();

    if (locked) {
        lockThemePaneContent(structure.host);
        if (contentArea) {
            let overlay = contentArea.querySelector('.premium-lock-overlay--settings-full');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.className = 'premium-lock-overlay premium-lock-overlay--settings-full';
                overlay.innerHTML = buildPremiumOverlayHtml(cfg);
                contentArea.appendChild(overlay);
                wirePremiumOverlayActions(overlay);
            } else {
                updatePremiumOverlayContent(overlay, cfg);
            }
            overlay.classList.toggle('is-overlay-visible', isActive);
        }
        refreshSettingsPremiumContentLock();
    } else {
        unlockThemePaneContent(structure.host);
        contentArea?.querySelector('.premium-lock-overlay--settings-full')?.remove();
        refreshSettingsPremiumContentLock();
    }
}

function enforceAllPremiumLocks() {
    if (!hasPremiumAccess()) {
        Object.keys(PREMIUM_SETTINGS_PANE_CONFIG).forEach((paneId) => syncPremiumSettingsPaneLock(paneId));
        Object.keys(PREMIUM_PANE_CONFIG).forEach((paneId) => syncPremiumPaneLock(paneId));
    } else {
        Object.keys(PREMIUM_SETTINGS_PANE_CONFIG).forEach((paneId) => {
            const host = document.getElementById(paneId)?.querySelector('.settings-pane-body');
            unlockThemePaneContent(host);
            syncPremiumSettingsPaneLock(paneId);
        });
        Object.keys(PREMIUM_PANE_CONFIG).forEach((paneId) => syncPremiumPaneLock(paneId));
    }
    refreshSettingsPremiumContentLock();
}

function canCustomizeTheme() {
    return hasPremiumAccess();
}

function guardPremiumThemeAccess() {
    if (canCustomizeTheme()) return true;
    enforceAllPremiumLocks();
    if (currentSettingsPaneId === 'settingsPaneTheme') {
        showToast(`Personalización bloqueada. ${EYED_PLUS_ACTIVATE_LABEL} para continuar.`, 'warning');
    }
    return false;
}

function refreshPremiumLocks() {
    enforceAllPremiumLocks();

    document.querySelectorAll('.settings-side-btn[data-settings-pane]').forEach((button) => {
        const paneId = button.dataset.settingsPane || '';
        const isPremium = isPremiumSettingsPane(paneId);
        button.classList.toggle('is-premium-settings-nav', isPremium);
        button.classList.toggle('is-premium-locked-nav', isPremium && !hasPremiumAccess());

        let badge = button.querySelector('.side-menu-premium-tag');
        if (isPremium && !hasPremiumAccess()) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'side-menu-premium-tag';
                badge.textContent = EYED_PLUS_BRAND;
                button.appendChild(badge);
            }
        } else {
            badge?.remove();
        }
    });

    document.querySelectorAll('.side-menu-btn[data-server-pane]').forEach((button) => {
        const paneId = button.dataset.serverPane || '';
        const isPremium = isPremiumPane(paneId);
        button.classList.toggle('is-premium-nav', isPremium);
        button.classList.toggle('is-premium-locked-nav', isPremium && !hasPremiumAccess());

        let badge = button.querySelector('.side-menu-premium-tag');
        if (isPremium && !hasPremiumAccess()) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'side-menu-premium-tag';
                badge.textContent = EYED_PLUS_BRAND;
                button.appendChild(badge);
            }
        } else {
            badge?.remove();
        }
    });
}

function loadPremiumPaneData(paneId, guildId) {
    const gid = String(guildId || currentServerGuildId || '').trim();
    if (!gid || !hasPremiumAccess()) return;

    if (paneId === 'serverPaneTicketsManage') {
        openTicketsManagePane();
        return;
    }
    if (paneId === 'serverPaneSecurity') {
        void loadSecurityPanel(gid);
        return;
    }
    if (paneId === 'serverPaneGacha') {
        void loadGachaPanel(gid);
        return;
    }
    if (paneId === 'serverPaneFreeGames') {
        void openFreeGamesPane();
    }
}

function handleActivePremiumPaneAfterBillingChange() {
    enforceAllPremiumLocks();
    const paneId = currentServerPaneId;
    if (isPremiumPane(paneId) && hasSelectedGuildContext() && hasPremiumAccess()) {
        loadPremiumPaneData(paneId, currentServerGuildId);
    }
    if (currentSettingsPaneId === 'settingsPaneTheme' && hasPremiumAccess()) {
        const host = document.getElementById('settingsPaneTheme')?.querySelector('.settings-pane-body');
        unlockThemePaneContent(host);
        syncThemeControls(themeSettings);
    }
}

const apiGetCache = new Map();
const API_CACHE_TTL = {
    guilds: 10000,
    channels: 8000,
    templates: 6000
};

function debounce(fn, delay = 180) {
    let timeoutId = null;
    return (...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/** Aplica el tema como máximo una vez por frame (sliders que disparan muchos `input`). */
let _themeControlsApplyRaf = 0;
function scheduleThemeControlsApply() {
    if (!canCustomizeTheme()) return;
    if (_themeControlsApplyRaf) return;
    _themeControlsApplyRaf = requestAnimationFrame(() => {
        _themeControlsApplyRaf = 0;
        applyThemeSettings(getThemeControlsState(), { persist: true });
    });
}

/** Re-render del bloque de niveles (curva, hitos, ladder) coalescado por frame. */
const _levelsDerivedRefreshByContainer = new WeakMap();
function scheduleLevelsDerivedRefresh(container, initialConfig, context) {
    if (!container) return;
    let slot = _levelsDerivedRefreshByContainer.get(container);
    if (!slot) {
        slot = { rafId: 0 };
        _levelsDerivedRefreshByContainer.set(container, slot);
    }
    if (slot.rafId) return;
    slot.rafId = requestAnimationFrame(() => {
        slot.rafId = 0;
        refreshLevelsDerivedViews(container, initialConfig, context);
    });
}

async function fetchCachedGetJSON(url, ttlMs = 30000, options = {}) {
    const now = Date.now();
    const cached = apiGetCache.get(url);
    if (cached && cached.expiresAt > now) {
        return cached.data;
    }

    const response = await fetchWithCredentials(url, options);
    if (!response.ok) {
        const error = new Error(`GET ${url} failed (${response.status})`);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    apiGetCache.set(url, { data, expiresAt: now + ttlMs });
    return data;
}

function invalidateGetCache(prefix = '') {
    if (!prefix) {
        apiGetCache.clear();
        return;
    }
    for (const key of apiGetCache.keys()) {
        if (key.startsWith(prefix)) {
            apiGetCache.delete(key);
        }
    }
}

// Clave para localStorage
const STORAGE_KEY = 'tulabot_panel_state';
let _lastPersistedPanelStateJson = null;

// Guardar estado en localStorage
function saveState() {
    const state = {
        activeSection: document.querySelector('.section.active')?.id || 'dashboard',
        embedForm: {
            guildId: document.getElementById('guildSelect')?.value || '',
            channelId: document.getElementById('channelSelect')?.value || '',
            title: document.getElementById('embedTitle')?.value || '',
            description: document.getElementById('embedDescription')?.value || '',
            color: document.getElementById('embedColor')?.value || '#C41E3A',
            footer: document.getElementById('embedFooter')?.value || '',
            image: document.getElementById('embedImage')?.value || '',
            thumbnail: document.getElementById('embedThumbnail')?.value || '',
            imageScale: Number.parseInt(document.getElementById('embedImageScale')?.value || '100', 10),
            thumbnailScale: Number.parseInt(document.getElementById('embedThumbnailScale')?.value || '100', 10),
            imageCropX: Number.parseInt(document.getElementById('embedImageCropX')?.value || '0', 10),
            imageCropY: Number.parseInt(document.getElementById('embedImageCropY')?.value || '0', 10),
            imageCropW: Number.parseInt(document.getElementById('embedImageCropW')?.value || '100', 10),
            imageCropH: Number.parseInt(document.getElementById('embedImageCropH')?.value || '100', 10),
            thumbnailCropX: Number.parseInt(document.getElementById('embedThumbnailCropX')?.value || '0', 10),
            thumbnailCropY: Number.parseInt(document.getElementById('embedThumbnailCropY')?.value || '0', 10),
            thumbnailCropW: Number.parseInt(document.getElementById('embedThumbnailCropW')?.value || '100', 10),
            thumbnailCropH: Number.parseInt(document.getElementById('embedThumbnailCropH')?.value || '100', 10),
            timestamp: document.getElementById('embedTimestamp')?.checked || false,
            targetMessageId: document.getElementById('embedTargetMessageId')?.value?.trim() || '',
            fields: []
        },
        serverSection: {
            selectedGuildId: document.getElementById('serverSelect')?.value || currentServerGuildId || '',
            activePaneId: currentServerPaneId || 'serverPaneOverview',
            insightView: currentServerInsightView || 'overview',
            insightPayload: currentServerInsightPayload || null
        },
        logs: {
            levelFilter: document.getElementById('logLevelFilter')?.value || '',
            autoScroll: autoScroll !== undefined ? autoScroll : true
        }
    };

    // Guardar campos del embed
    document.querySelectorAll('.field-item').forEach(field => {
        const name = field.querySelector('.field-name')?.value || '';
        const value = field.querySelector('.field-value')?.value || '';
        const inline = field.querySelector('.field-inline')?.checked || false;
        if (name || value) {
            state.embedForm.fields.push({ name, value, inline });
        }
    });

    try {
        const json = JSON.stringify(state);
        if (json === _lastPersistedPanelStateJson) return;
        _lastPersistedPanelStateJson = json;
        localStorage.setItem(STORAGE_KEY, json);
    } catch (e) {
        console.warn('No se pudo guardar el estado:', e);
    }
}

// Cargar estado desde localStorage
function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        return JSON.parse(saved);
    } catch (e) {
        console.warn('No se pudo cargar el estado:', e);
        return null;
    }
}

function getActiveSectionId() {
    return document.querySelector('.section.active')?.id || 'dashboard';
}

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const candidate = value.trim();
    return /^#[0-9a-fA-F]{6}$/.test(candidate) ? candidate : fallback;
}

function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex, '#000000');
    return {
        r: Number.parseInt(normalized.slice(1, 3), 16),
        g: Number.parseInt(normalized.slice(3, 5), 16),
        b: Number.parseInt(normalized.slice(5, 7), 16)
    };
}

function rgbaFromHex(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${clampNumber(Number(alpha) || 0, 0, 1)})`;
}

function mixHexColors(startHex, endHex, ratio = 0.5) {
    const start = hexToRgb(startHex);
    const end = hexToRgb(endHex);
    const weight = clampNumber(Number(ratio) || 0, 0, 1);
    const r = Math.round(start.r + ((end.r - start.r) * weight));
    const g = Math.round(start.g + ((end.g - start.g) * weight));
    const b = Math.round(start.b + ((end.b - start.b) * weight));
    return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function srgbToLinear(channel) {
    const normalized = clampNumber(channel / 255, 0, 1);
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function getRelativeLuminance(hex) {
    const { r, g, b } = hexToRgb(hex);
    const rl = srgbToLinear(r);
    const gl = srgbToLinear(g);
    const bl = srgbToLinear(b);
    return (0.2126 * rl) + (0.7152 * gl) + (0.0722 * bl);
}

function getContrastRatio(foregroundHex, backgroundHex) {
    const l1 = getRelativeLuminance(foregroundHex);
    const l2 = getRelativeLuminance(backgroundHex);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
}

function ensureReadableColor(baseHex, backgroundHex, minContrast = 4.5) {
    const initial = normalizeHexColor(baseHex, '#ffffff');
    const background = normalizeHexColor(backgroundHex, '#000000');
    if (getContrastRatio(initial, background) >= minContrast) return initial;

    const bgLuminance = getRelativeLuminance(background);
    const preferredTarget = bgLuminance < 0.45 ? '#ffffff' : '#000000';
    const secondaryTarget = preferredTarget === '#ffffff' ? '#000000' : '#ffffff';

    for (let step = 1; step <= 20; step += 1) {
        const mixRatio = step / 20;
        const candidate = mixHexColors(initial, preferredTarget, mixRatio);
        if (getContrastRatio(candidate, background) >= minContrast) {
            return candidate;
        }
    }

    for (let step = 1; step <= 20; step += 1) {
        const mixRatio = step / 20;
        const candidate = mixHexColors(initial, secondaryTarget, mixRatio);
        if (getContrastRatio(candidate, background) >= minContrast) {
            return candidate;
        }
    }

    const whiteContrast = getContrastRatio('#ffffff', background);
    const blackContrast = getContrastRatio('#000000', background);
    return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
}

function loadThemeSettings() {
    try {
        const raw = localStorage.getItem(THEME_STORAGE_KEY);
        if (!raw) return { ...THEME_DEFAULTS };
        const saved = JSON.parse(raw);
        return normalizeThemeSettings(saved);
    } catch {
        return { ...THEME_DEFAULTS };
    }
}

function normalizeThemeSettings(input = {}) {
    const presetId = Object.prototype.hasOwnProperty.call(THEME_PRESETS, input.preset) ? input.preset : THEME_DEFAULTS.preset;
    const preset = THEME_PRESETS[presetId] || THEME_DEFAULTS;
    const autoContrastFallback = typeof preset.autoContrast === 'boolean' ? preset.autoContrast : THEME_DEFAULTS.autoContrast;

    let wallpaperUrl = typeof input.wallpaperUrl === 'string' ? input.wallpaperUrl.trim() : '';
    if (wallpaperUrl.length > WALLPAPER_MAX_INLINE_URL_CHARS) {
        wallpaperUrl = '';
    }

    let wallpaperStorage = typeof input.wallpaperStorage === 'string' ? input.wallpaperStorage.trim() : '';
    if (!['none', 'inline', 'indexeddb'].includes(wallpaperStorage)) {
        wallpaperStorage = wallpaperUrl.length > 64 ? 'inline' : 'none';
    }
    if (wallpaperStorage === 'none' && wallpaperUrl.length > 64) {
        wallpaperStorage = 'inline';
    }

    let wallpaperKind = typeof input.wallpaperKind === 'string' ? input.wallpaperKind.trim() : '';
    if (!['none', 'image', 'video'].includes(wallpaperKind)) {
        wallpaperKind = 'none';
    }
    if (wallpaperStorage === 'indexeddb') {
        wallpaperKind = wallpaperKind === 'video' ? 'video' : 'image';
    } else if (wallpaperStorage === 'inline' && wallpaperUrl.length > 64) {
        wallpaperKind = 'image';
    } else {
        wallpaperKind = 'none';
    }

    let wallpaperMime =
        typeof input.wallpaperMime === 'string' ? input.wallpaperMime.trim().slice(0, 160) : '';
    if (wallpaperStorage !== 'indexeddb') {
        wallpaperMime = '';
    }

    if (wallpaperStorage === 'indexeddb') {
        wallpaperUrl = '';
    }

    return {
        preset: presetId,
        accentPrimary: normalizeHexColor(input.accentPrimary, preset.accentPrimary),
        accentSecondary: normalizeHexColor(input.accentSecondary, preset.accentSecondary),
        bgPrimary: normalizeHexColor(input.bgPrimary, preset.bgPrimary),
        bgSecondary: normalizeHexColor(input.bgSecondary, preset.bgSecondary),
        bgCard: normalizeHexColor(input.bgCard, preset.bgCard),
        textPrimary: normalizeHexColor(input.textPrimary, preset.textPrimary),
        textSecondary: normalizeHexColor(input.textSecondary, preset.textSecondary),
        borderColor: normalizeHexColor(input.borderColor, preset.borderColor),
        atmosphere: clampNumber(Number.parseInt(input.atmosphere ?? preset.atmosphere, 10) || preset.atmosphere, 0, 100),
        borderStrength: clampNumber(Number.parseInt(input.borderStrength ?? preset.borderStrength, 10) || preset.borderStrength, 0, 100),
        autoContrast: typeof input.autoContrast === 'boolean' ? input.autoContrast : autoContrastFallback,
        backgroundBubbles:
            typeof input.backgroundBubbles === 'boolean'
                ? input.backgroundBubbles
                : THEME_DEFAULTS.backgroundBubbles,
        wallpaperEnabled: input.wallpaperEnabled === true,
        wallpaperStorage,
        wallpaperKind,
        wallpaperMime,
        wallpaperUrl,
        wallpaperBloom: clampNumber(Number.parseInt(input.wallpaperBloom ?? THEME_DEFAULTS.wallpaperBloom, 10) || THEME_DEFAULTS.wallpaperBloom, 0, 100),
        wallpaperVeil: clampNumber(Number.parseInt(input.wallpaperVeil ?? THEME_DEFAULTS.wallpaperVeil, 10) || THEME_DEFAULTS.wallpaperVeil, 0, 100)
    };
}

function saveThemeSettings(theme = themeSettings) {
    if (!canCustomizeTheme()) return;
    const normalized = normalizeThemeSettings(theme);
    themeSettings = normalized;
    try {
        const forDisk = { ...normalized };
        if (forDisk.wallpaperStorage === 'indexeddb') {
            forDisk.wallpaperUrl = '';
        }
        const json = JSON.stringify(forDisk);
        if (json === lastThemeSettingsDiskJson) return;
        lastThemeSettingsDiskJson = json;
        localStorage.setItem(THEME_STORAGE_KEY, json);
    } catch (error) {
        console.warn('No se pudo guardar la personalizacion visual:', error);
        const code = error?.code;
        const name = error?.name || '';
        if (name === 'QuotaExceededError' || code === 22) {
            showToast('Espacio del navegador lleno: prueba otra imagen más pequeña o quita el fondo.', 'error');
        }
    }
}

function setThemeCssVariables(theme = themeSettings) {
    const normalized = normalizeThemeSettings(theme);
    const root = document.documentElement;
    const patternStrength = clampNumber(normalized.atmosphere / 100, 0, 1);
    const borderStrength = clampNumber(normalized.borderStrength / 100, 0, 1);
    const shouldUseAutoContrast = normalized.autoContrast !== false;
    const textPrimaryAuto = shouldUseAutoContrast
        ? ensureReadableColor(normalized.textPrimary, normalized.bgPrimary, 4.5)
        : normalized.textPrimary;
    const textSecondaryBase = shouldUseAutoContrast
        ? ensureReadableColor(normalized.textSecondary, normalized.bgSecondary, 3.4)
        : normalized.textSecondary;
    const textSecondaryAuto = shouldUseAutoContrast
        ? ensureReadableColor(textSecondaryBase, normalized.bgCard, 3.2)
        : textSecondaryBase;
    const textMutedSeed = shouldUseAutoContrast
        ? mixHexColors(textSecondaryAuto, normalized.bgPrimary, 0.35)
        : mixHexColors(normalized.textSecondary, '#7f6bb0', 0.45);
    const textMutedAuto = shouldUseAutoContrast
        ? ensureReadableColor(textMutedSeed, normalized.bgPrimary, 2.4)
        : textMutedSeed;

    root.style.setProperty('--iris-900', mixHexColors(normalized.bgPrimary, '#000000', 0.12));
    root.style.setProperty('--iris-800', mixHexColors(normalized.bgSecondary, normalized.accentPrimary, 0.06));
    root.style.setProperty('--iris-700', mixHexColors(normalized.bgCard, normalized.accentPrimary, 0.1));
    root.style.setProperty('--iris-500', normalized.accentPrimary);
    root.style.setProperty('--iris-400', normalized.accentSecondary);
    root.style.setProperty('--iris-300', mixHexColors(normalized.accentPrimary, '#ffffff', 0.45));
    root.style.setProperty('--lavender', mixHexColors(textPrimaryAuto, normalized.accentPrimary, 0.1));
    root.style.setProperty('--fuchsia', normalized.accentSecondary);
    root.style.setProperty('--bg-primary', normalized.bgPrimary);
    root.style.setProperty('--bg-secondary', normalized.bgSecondary);
    root.style.setProperty('--bg-card', normalized.bgCard);
    root.style.setProperty('--bg-card-hover', mixHexColors(normalized.bgCard, normalized.accentPrimary, 0.12));
    root.style.setProperty('--bg-overlay', rgbaFromHex(normalized.bgPrimary, 0.82));
    root.style.setProperty('--text-primary', textPrimaryAuto);
    root.style.setProperty('--text-secondary', textSecondaryAuto);
    root.style.setProperty('--text-muted', textMutedAuto);
    root.style.setProperty('--border-color', rgbaFromHex(normalized.borderColor, 0.16 + (borderStrength * 0.24)));
    root.style.setProperty('--border-glow', rgbaFromHex(normalized.borderColor, 0.18 + (borderStrength * 0.25)));
    root.style.setProperty('--accent-blue', normalized.accentPrimary);
    root.style.setProperty('--accent-gold', normalized.accentSecondary);
    root.style.setProperty('--shadow-blue', `0 8px 32px ${rgbaFromHex(normalized.accentPrimary, 0.22 + (borderStrength * 0.12))}`);
    root.style.setProperty('--shadow-gold', `0 8px 32px ${rgbaFromHex(normalized.accentSecondary, 0.18 + (borderStrength * 0.1))}`);
    root.style.setProperty('--shadow-card', `0 10px 26px ${rgbaFromHex(normalized.bgPrimary, 0.52)}`);
    root.style.setProperty('--glow-blue', `0 0 20px ${rgbaFromHex(normalized.accentPrimary, 0.2 + (patternStrength * 0.22))}`);
    root.style.setProperty('--glow-gold', `0 0 20px ${rgbaFromHex(normalized.accentSecondary, 0.2 + (patternStrength * 0.18))}`);
    root.style.setProperty('--saber-blue', normalized.accentPrimary);
    root.style.setProperty('--saber-blue-light', mixHexColors(normalized.accentPrimary, '#ffffff', 0.42));
    root.style.setProperty('--saber-blue-dark', mixHexColors(normalized.bgSecondary, normalized.accentPrimary, 0.28));
    root.style.setProperty('--saber-gold', normalized.accentSecondary);
    root.style.setProperty('--fate-red', normalized.accentPrimary);
    root.style.setProperty('--fate-gold', mixHexColors(textPrimaryAuto, normalized.accentSecondary, 0.28));
    root.style.setProperty('--theme-pattern-primary', rgbaFromHex(normalized.accentPrimary, 0.06 + (patternStrength * 0.18)));
    root.style.setProperty('--theme-pattern-secondary', rgbaFromHex(normalized.accentSecondary, 0.05 + (patternStrength * 0.14)));
    root.style.setProperty('--theme-pattern-tertiary', rgbaFromHex(normalized.borderColor, 0.04 + (patternStrength * 0.1)));
    root.style.setProperty('--theme-glow-color', rgbaFromHex(normalized.accentPrimary, 0.12 + (patternStrength * 0.32)));
    root.style.setProperty('--theme-lines-opacity', String(0.1 + (patternStrength * 0.22)));

    const gradientBgEl = document.querySelector('.gradient-bg');
    if (gradientBgEl) {
        gradientBgEl.classList.toggle('gradient-bg--no-bubbles', normalized.backgroundBubbles === false);
    }

    applyWallpaperVeilCss(normalized);

    const rgbAccentPrimary = hexToRgb(normalized.accentPrimary);
    const rgbAccentSecondary = hexToRgb(normalized.accentSecondary);
    const rgbTextPrimary = hexToRgb(textPrimaryAuto);
    const rgbBorder = hexToRgb(normalized.borderColor);
    const rgbBgPrimary = hexToRgb(normalized.bgPrimary);
    const rgbBgSecondary = hexToRgb(normalized.bgSecondary);
    const rgbBgCard = hexToRgb(normalized.bgCard);

    root.style.setProperty('--color-bg1', mixHexColors(normalized.bgPrimary, normalized.accentPrimary, 0.28));
    root.style.setProperty('--color-bg2', mixHexColors(normalized.bgSecondary, normalized.accentSecondary, 0.18));
    root.style.setProperty('--accent-primary-rgb', `${rgbAccentPrimary.r}, ${rgbAccentPrimary.g}, ${rgbAccentPrimary.b}`);
    root.style.setProperty('--accent-secondary-rgb', `${rgbAccentSecondary.r}, ${rgbAccentSecondary.g}, ${rgbAccentSecondary.b}`);
    root.style.setProperty('--border-rgb', `${rgbBorder.r}, ${rgbBorder.g}, ${rgbBorder.b}`);
    root.style.setProperty('--bg-primary-rgb', `${rgbBgPrimary.r}, ${rgbBgPrimary.g}, ${rgbBgPrimary.b}`);
    root.style.setProperty('--bg-secondary-rgb', `${rgbBgSecondary.r}, ${rgbBgSecondary.g}, ${rgbBgSecondary.b}`);
    root.style.setProperty('--bg-card-rgb', `${rgbBgCard.r}, ${rgbBgCard.g}, ${rgbBgCard.b}`);
    root.style.setProperty('--color1', `${rgbAccentPrimary.r}, ${rgbAccentPrimary.g}, ${rgbAccentPrimary.b}`);
    root.style.setProperty('--color2', `${rgbAccentSecondary.r}, ${rgbAccentSecondary.g}, ${rgbAccentSecondary.b}`);
    root.style.setProperty('--color3', `${rgbTextPrimary.r}, ${rgbTextPrimary.g}, ${rgbTextPrimary.b}`);
    root.style.setProperty('--color4', `${rgbBorder.r}, ${rgbBorder.g}, ${rgbBorder.b}`);
    root.style.setProperty('--color5', `${rgbAccentPrimary.r}, ${rgbAccentSecondary.g}, ${rgbTextPrimary.b}`);
    root.style.setProperty('--color-interactive', `${rgbAccentSecondary.r}, ${rgbAccentPrimary.g}, ${rgbBorder.b}`);

    const pattern = document.querySelector('.bg-pattern');
    if (pattern) {
        pattern.style.opacity = String(0.7 + (patternStrength * 0.3));
    }

    const glow = document.querySelector('.bg-glow');
    if (glow) {
        glow.style.opacity = String(0.45 + (patternStrength * 0.55));
    }
}

/** Parpadeo CSS + pupila que sigue el cursor en el logo del navbar */
function initBrandEyeAnimation() {
    const svg = document.querySelector('.nav-brand .brand-icon');
    const pupil = svg?.querySelector('.brand-eye-pupil');
    if (!svg || !pupil) return;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduceMotion) return;

    const maxMove = 2.15;
    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let rafId = 0;

    const tick = () => {
        rafId = 0;
        if (document.visibilityState === 'hidden') return;

        curX += (targetX - curX) * 0.22;
        curY += (targetY - curY) * 0.22;
        pupil.setAttribute('transform', `translate(${curX.toFixed(3)}, ${curY.toFixed(3)})`);

        const dx = targetX - curX;
        const dy = targetY - curY;
        if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) {
            rafId = requestAnimationFrame(tick);
        }
    };

    const scheduleTick = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(tick);
    };

    const onMove = (e) => {
        const rect = svg.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let nx = (e.clientX - cx) / (rect.width * 0.42);
        let ny = (e.clientY - cy) / (rect.height * 0.42);
        nx = Math.max(-1, Math.min(1, nx));
        ny = Math.max(-1, Math.min(1, ny));
        targetX = nx * maxMove;
        targetY = ny * maxMove;
        scheduleTick();
    };

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        } else if (document.visibilityState === 'visible') {
            const dx = targetX - curX;
            const dy = targetY - curY;
            if (Math.abs(dx) > 0.002 || Math.abs(dy) > 0.002) {
                scheduleTick();
            }
        }
    });
}

function initializeInteractiveGradient() {
    const interactive = document.getElementById('interactiveGradient');
    if (!(interactive instanceof HTMLElement)) return;

    let currentX = window.innerWidth * 0.5;
    let currentY = window.innerHeight * 0.5;
    let targetX = currentX;
    let targetY = currentY;
    let rafId = 0;

    interactive.style.transform = `translate(${Math.round(currentX)}px, ${Math.round(currentY)}px)`;

    const loop = () => {
        rafId = 0;
        if (document.visibilityState === 'hidden') return;

        currentX += (targetX - currentX) * 0.035;
        currentY += (targetY - currentY) * 0.035;
        interactive.style.transform = `translate(${Math.round(currentX)}px, ${Math.round(currentY)}px)`;

        if (Math.abs(targetX - currentX) > 0.75 || Math.abs(targetY - currentY) > 0.75) {
            rafId = requestAnimationFrame(loop);
        }
    };

    const kick = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(loop);
    };

    window.addEventListener(
        'pointermove',
        (event) => {
            targetX = event.clientX;
            targetY = event.clientY;
            kick();
        },
        { passive: true }
    );

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        } else if (document.visibilityState === 'visible') {
            if (Math.abs(targetX - currentX) > 0.75 || Math.abs(targetY - currentY) > 0.75) {
                kick();
            }
        }
    });
}

function getThemeControlsState() {
    const baseWp = themeSettings || {};
    return normalizeThemeSettings({
        preset: document.querySelector('.theme-preset-btn.active')?.dataset.themePreset || themeSettings?.preset || THEME_DEFAULTS.preset,
        accentPrimary: document.getElementById('themeAccentPrimary')?.value,
        accentSecondary: document.getElementById('themeAccentSecondary')?.value,
        bgPrimary: document.getElementById('themeBgPrimary')?.value,
        bgSecondary: document.getElementById('themeBgSecondary')?.value,
        bgCard: document.getElementById('themeBgCard')?.value,
        textPrimary: document.getElementById('themeTextPrimary')?.value,
        textSecondary: document.getElementById('themeTextSecondary')?.value,
        borderColor: document.getElementById('themeBorderColor')?.value,
        atmosphere: document.getElementById('themeAtmosphere')?.value,
        borderStrength: document.getElementById('themeBorderStrength')?.value,
        autoContrast: document.getElementById('themeAutoContrast')?.checked,
        backgroundBubbles:
            document.getElementById('themeBackgroundBubbles') != null
                ? Boolean(document.getElementById('themeBackgroundBubbles').checked)
                : baseWp.backgroundBubbles !== false,
        wallpaperEnabled: document.getElementById('themeWallpaperEnabled')?.checked ?? baseWp.wallpaperEnabled,
        wallpaperStorage: baseWp.wallpaperStorage ?? THEME_DEFAULTS.wallpaperStorage,
        wallpaperKind: baseWp.wallpaperKind ?? THEME_DEFAULTS.wallpaperKind,
        wallpaperMime: baseWp.wallpaperMime ?? THEME_DEFAULTS.wallpaperMime,
        wallpaperUrl: baseWp.wallpaperUrl ?? '',
        wallpaperBloom: document.getElementById('themeWallpaperBloom')?.value ?? baseWp.wallpaperBloom,
        wallpaperVeil: document.getElementById('themeWallpaperVeil')?.value ?? baseWp.wallpaperVeil
    });
}

function syncThemeControls(theme = themeSettings) {
    const normalized = normalizeThemeSettings(theme);
    const controlMap = {
        themeAccentPrimary: normalized.accentPrimary,
        themeAccentSecondary: normalized.accentSecondary,
        themeBgPrimary: normalized.bgPrimary,
        themeBgSecondary: normalized.bgSecondary,
        themeBgCard: normalized.bgCard,
        themeTextPrimary: normalized.textPrimary,
        themeTextSecondary: normalized.textSecondary,
        themeBorderColor: normalized.borderColor,
        themeAtmosphere: String(normalized.atmosphere),
        themeBorderStrength: String(normalized.borderStrength)
    };

    Object.entries(controlMap).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el && el.value !== value) {
            el.value = value;
        }
    });

    const autoContrastInput = document.getElementById('themeAutoContrast');
    if (autoContrastInput && autoContrastInput.checked !== normalized.autoContrast) {
        autoContrastInput.checked = normalized.autoContrast;
    }

    const bubblesInput = document.getElementById('themeBackgroundBubbles');
    if (bubblesInput && bubblesInput.checked !== normalized.backgroundBubbles) {
        bubblesInput.checked = normalized.backgroundBubbles;
    }

    const atmosphereValue = document.getElementById('themeAtmosphereValue');
    if (atmosphereValue) atmosphereValue.textContent = `${normalized.atmosphere}%`;
    const borderStrengthValue = document.getElementById('themeBorderStrengthValue');
    if (borderStrengthValue) borderStrengthValue.textContent = `${normalized.borderStrength}%`;

    const wpEnabled = document.getElementById('themeWallpaperEnabled');
    if (wpEnabled) wpEnabled.checked = normalized.wallpaperEnabled === true;
    const wpBloom = document.getElementById('themeWallpaperBloom');
    if (wpBloom) wpBloom.value = String(normalized.wallpaperBloom);
    const wpBloomVal = document.getElementById('themeWallpaperBloomValue');
    if (wpBloomVal) wpBloomVal.textContent = `${normalized.wallpaperBloom}%`;
    const wpVeil = document.getElementById('themeWallpaperVeil');
    if (wpVeil) wpVeil.value = String(normalized.wallpaperVeil);
    const wpVeilVal = document.getElementById('themeWallpaperVeilValue');
    if (wpVeilVal) wpVeilVal.textContent = `${normalized.wallpaperVeil}%`;

    document.querySelectorAll('.theme-preset-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.themePreset === normalized.preset);
    });

    const swatchValues = {
        accentPrimary: normalized.accentPrimary,
        accentSecondary: normalized.accentSecondary,
        bgPrimary: normalized.bgPrimary,
        bgCard: normalized.bgCard
    };

    Object.entries(swatchValues).forEach(([name, value]) => {
        document.querySelectorAll(`[data-theme-swatch="${name}"]`).forEach((swatch) => {
            swatch.style.background = value;
        });
    });
}

function applyThemeSettings(theme = themeSettings, options = {}) {
    if (options.persist !== false && !canCustomizeTheme()) return;
    const normalized = normalizeThemeSettings(theme);
    themeSettings = normalized;
    setThemeCssVariables(normalized);
    syncThemeControls(normalized);
    void hydrateWallpaperLayer(normalized);

    if (options.persist !== false) {
        saveThemeSettings(normalized);
    }
}

function setThemePreset(presetId) {
    if (!guardPremiumThemeAccess()) return;
    const preset = THEME_PRESETS[presetId] || THEME_PRESETS[THEME_DEFAULTS.preset];
    const cur = normalizeThemeSettings(themeSettings || {});
    applyThemeSettings({
        preset: presetId,
        ...preset,
        backgroundBubbles: cur.backgroundBubbles,
        wallpaperEnabled: cur.wallpaperEnabled,
        wallpaperStorage: cur.wallpaperStorage,
        wallpaperKind: cur.wallpaperKind,
        wallpaperMime: cur.wallpaperMime,
        wallpaperUrl: cur.wallpaperUrl,
        wallpaperBloom: cur.wallpaperBloom,
        wallpaperVeil: cur.wallpaperVeil
    });
    showToast(`Tema aplicado: ${presetId}`, 'success');
}

async function resetThemeSettings() {
    if (!guardPremiumThemeAccess()) return;
    await wallpaperIdbDelete().catch(() => {});
    revokeWallpaperObjectUrls();
    applyThemeSettings({ ...THEME_DEFAULTS }, { persist: true });
    showToast('Personalizacion restablecida', 'success');
}

const SETTINGS_PANE_STORAGE_KEY = 'eyedbot:settings:activePane';

function switchSettingsPane(paneId, options = {}) {
    const pane = document.getElementById(paneId);
    if (!pane) return;

    currentSettingsPaneId = paneId;

    document.querySelectorAll('.settings-pane').forEach((el) => {
        el.classList.toggle('active', el.id === paneId);
    });

    document.querySelectorAll('.settings-side-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.settingsPane === paneId);
    });

    enforceAllPremiumLocks();

    try {
        sessionStorage.setItem(SETTINGS_PANE_STORAGE_KEY, paneId);
    } catch (_) { /* noop */ }

    if (!options.silent) {
        const container = document.querySelector('#profileSettingsSection > .container');
        if (container) container.scrollTop = 0;
    }
}

function bindSettingsPaneNavigation() {
    document.querySelectorAll('.settings-side-btn').forEach((button) => {
        button.addEventListener('click', () => {
            const paneId = button.dataset.settingsPane;
            if (!paneId) return;
            switchSettingsPane(paneId);
        });
    });

    let initialPane = currentSettingsPaneId;
    try {
        const stored = sessionStorage.getItem(SETTINGS_PANE_STORAGE_KEY);
        if (stored && document.getElementById(stored)) initialPane = stored;
    } catch (_) { /* noop */ }

    switchSettingsPane(initialPane, { silent: true });
}

function bindThemeControls() {
    const controlIds = [
        'themeAccentPrimary',
        'themeAccentSecondary',
        'themeBgPrimary',
        'themeBgSecondary',
        'themeBgCard',
        'themeTextPrimary',
        'themeTextSecondary',
        'themeBorderColor',
        'themeAtmosphere',
        'themeBorderStrength',
        'themeAutoContrast',
        'themeBackgroundBubbles',
        'themeWallpaperBloom',
        'themeWallpaperVeil'
    ];

    controlIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => {
            if (id === 'themeWallpaperBloom') {
                const lab = document.getElementById('themeWallpaperBloomValue');
                if (lab) lab.textContent = `${el.value}%`;
            }
            if (id === 'themeWallpaperVeil') {
                const lab = document.getElementById('themeWallpaperVeilValue');
                if (lab) lab.textContent = `${el.value}%`;
            }
            scheduleThemeControlsApply();
        });
    });

    const wpToggle = document.getElementById('themeWallpaperEnabled');
    if (wpToggle) {
        wpToggle.addEventListener('change', () => {
            if (!guardPremiumThemeAccess()) return;
            applyThemeSettings(getThemeControlsState(), { persist: true });
        });
    }

    const wpFile = document.getElementById('themeWallpaperFile');
    if (wpFile) {
        wpFile.addEventListener('change', async () => {
            if (!guardPremiumThemeAccess()) return;
            const file = wpFile.files?.[0];
            if (!file) return;

            let isVideo = false;
            let isImage = false;
            if (file.type.startsWith('video/')) isVideo = true;
            else if (file.type.startsWith('image/')) isImage = true;
            else if (WALLPAPER_VIDEO_NAME_HINT.test(file.name)) isVideo = true;
            else if (WALLPAPER_IMAGE_NAME_HINT.test(file.name)) isImage = true;

            if (!isVideo && !isImage) {
                showToast('Formato no admitido. Usa imagen o vídeo.', 'warning');
                wpFile.value = '';
                return;
            }

            try {
                if (isVideo) {
                    if (file.size > WALLPAPER_MAX_VIDEO_BYTES) {
                        showToast(`El vídeo supera el límite (~${Math.round(WALLPAPER_MAX_VIDEO_BYTES / (1024 * 1024))} MB).`, 'warning');
                        wpFile.value = '';
                        return;
                    }
                    await wallpaperIdbPut(file, file.type || 'video/mp4', 'video');
                    applyThemeSettings(
                        normalizeThemeSettings({
                            ...getThemeControlsState(),
                            wallpaperStorage: 'indexeddb',
                            wallpaperKind: 'video',
                            wallpaperMime: file.type || 'video/mp4',
                            wallpaperUrl: '',
                            wallpaperEnabled: true
                        }),
                        { persist: true }
                    );
                    showToast('Vídeo de fondo aplicado', 'success');
                } else {
                    const forceRaw =
                        /^image\/gif/i.test(file.type) ||
                        /\.gif$/i.test(file.name) ||
                        /^image\/svg/i.test(file.type) ||
                        /\.svg$/i.test(file.name);

                    let blobToStore = null;
                    let mimeOut = file.type || 'image/jpeg';

                    if (!forceRaw) {
                        try {
                            const jpegBlob = await resizeImageFileToJpegBlob(file);
                            if (jpegBlob && jpegBlob.size > 0) {
                                blobToStore = jpegBlob;
                                mimeOut = 'image/jpeg';
                            }
                        } catch {
                            /* usar original */
                        }
                    }

                    if (!blobToStore) {
                        if (file.size > WALLPAPER_MAX_RAW_IMAGE_BYTES) {
                            showToast(
                                `Imagen demasiado grande sin poder comprimirla (máx. ~${Math.round(WALLPAPER_MAX_RAW_IMAGE_BYTES / (1024 * 1024))} MB).`,
                                'warning'
                            );
                            wpFile.value = '';
                            return;
                        }
                        blobToStore = file;
                        mimeOut = file.type || 'application/octet-stream';
                    }

                    await wallpaperIdbPut(blobToStore, mimeOut, 'image');
                    applyThemeSettings(
                        normalizeThemeSettings({
                            ...getThemeControlsState(),
                            wallpaperStorage: 'indexeddb',
                            wallpaperKind: 'image',
                            wallpaperMime: mimeOut,
                            wallpaperUrl: '',
                            wallpaperEnabled: true
                        }),
                        { persist: true }
                    );
                    showToast(forceRaw ? 'Imagen aplicada (sin recomprimir para conservar animación o SVG)' : 'Fondo aplicado y optimizado', 'success');
                }

                syncThemeControls(themeSettings);
                const wt = document.getElementById('themeWallpaperEnabled');
                if (wt) wt.checked = true;
            } catch (e) {
                console.warn(e);
                showToast(e.message || 'No se pudo guardar el archivo (IndexedDB o formato no soportado)', 'error');
            }
            wpFile.value = '';
        });
    }

    const wpClear = document.getElementById('themeWallpaperClearBtn');
    if (wpClear) {
        wpClear.addEventListener('click', async () => {
            if (!guardPremiumThemeAccess()) return;
            await wallpaperIdbDelete().catch(() => {});
            revokeWallpaperObjectUrls();
            applyThemeSettings(
                normalizeThemeSettings({
                    ...getThemeControlsState(),
                    wallpaperUrl: '',
                    wallpaperEnabled: false,
                    wallpaperStorage: 'none',
                    wallpaperKind: 'none',
                    wallpaperMime: ''
                }),
                { persist: true }
            );
            syncThemeControls(themeSettings);
            showToast('Fondo quitado', 'success');
        });
    }

    document.querySelectorAll('.theme-preset-btn').forEach((button) => {
        button.addEventListener('click', () => {
            if (!guardPremiumThemeAccess()) return;
            setThemePreset(button.dataset.themePreset || THEME_DEFAULTS.preset);
        });
    });

    const saveButton = document.getElementById('themeSaveBtn');
    if (saveButton) {
        saveButton.addEventListener('click', () => {
            if (!guardPremiumThemeAccess()) return;
            applyThemeSettings(getThemeControlsState(), { persist: true });
            showToast('Personalizacion guardada', 'success');
        });
    }

    const resetButton = document.getElementById('themeResetBtn');
    if (resetButton) {
        resetButton.addEventListener('click', () => {
            if (!guardPremiumThemeAccess()) return;
            void resetThemeSettings();
        });
    }
}

themeSettings = loadThemeSettings();
applyThemeSettings(themeSettings, { persist: false });
scheduleLegacyWallpaperMigration();

function buildPanelHistoryState(sectionId = 'dashboard', guard = false) {
    return { panel: true, sectionId, guard };
}

function initializePanelHistory(sectionId = 'dashboard') {
    const currentUrl = window.location.pathname + window.location.search;
    history.replaceState(buildPanelHistoryState(sectionId, false), '', currentUrl);
    history.pushState(buildPanelHistoryState(sectionId, true), '', currentUrl);
}

function pushPanelHistory(sectionId = 'dashboard') {
    const currentUrl = window.location.pathname + window.location.search;
    const currentState = history.state;
    if (currentState?.panel && currentState?.sectionId === sectionId && currentState?.guard) return;
    history.pushState(buildPanelHistoryState(sectionId, true), '', currentUrl);
}

// Función auxiliar para escapar HTML (definida temprano)
function escapeHtmlForValue(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Restaurar estado del formulario de embed
function restoreEmbedForm(state) {
    if (!state.embedForm) return;

    const form = state.embedForm;
    
    // Restaurar valores básicos
    if (document.getElementById('embedTitle')) document.getElementById('embedTitle').value = form.title || '';
    if (document.getElementById('embedDescription')) document.getElementById('embedDescription').value = form.description || '';
    if (document.getElementById('embedColor')) document.getElementById('embedColor').value = form.color || '#C41E3A';
    if (document.getElementById('embedFooter')) document.getElementById('embedFooter').value = form.footer || '';
    if (document.getElementById('embedImage')) document.getElementById('embedImage').value = form.image || '';
    if (document.getElementById('embedThumbnail')) document.getElementById('embedThumbnail').value = form.thumbnail || '';
    if (document.getElementById('embedImageScale')) document.getElementById('embedImageScale').value = `${form.imageScale || 100}`;
    if (document.getElementById('embedThumbnailScale')) document.getElementById('embedThumbnailScale').value = `${form.thumbnailScale || 100}`;
    if (document.getElementById('embedImageScaleValue')) document.getElementById('embedImageScaleValue').textContent = `${form.imageScale || 100}%`;
    if (document.getElementById('embedThumbnailScaleValue')) document.getElementById('embedThumbnailScaleValue').textContent = `${form.thumbnailScale || 100}%`;
    if (document.getElementById('embedImageCropX')) document.getElementById('embedImageCropX').value = `${form.imageCropX || 0}`;
    if (document.getElementById('embedImageCropY')) document.getElementById('embedImageCropY').value = `${form.imageCropY || 0}`;
    if (document.getElementById('embedImageCropW')) document.getElementById('embedImageCropW').value = `${form.imageCropW || 100}`;
    if (document.getElementById('embedImageCropH')) document.getElementById('embedImageCropH').value = `${form.imageCropH || 100}`;
    if (document.getElementById('embedThumbnailCropX')) document.getElementById('embedThumbnailCropX').value = `${form.thumbnailCropX || 0}`;
    if (document.getElementById('embedThumbnailCropY')) document.getElementById('embedThumbnailCropY').value = `${form.thumbnailCropY || 0}`;
    if (document.getElementById('embedThumbnailCropW')) document.getElementById('embedThumbnailCropW').value = `${form.thumbnailCropW || 100}`;
    if (document.getElementById('embedThumbnailCropH')) document.getElementById('embedThumbnailCropH').value = `${form.thumbnailCropH || 100}`;
    if (document.getElementById('embedTimestamp')) document.getElementById('embedTimestamp').checked = form.timestamp || false;
    if (document.getElementById('embedTargetMessageId')) {
        document.getElementById('embedTargetMessageId').value = form.targetMessageId || '';
    }
    syncEmbedSendButtonLabel();

    // Restaurar servidor y canal (después de cargar los servidores)
    if (form.guildId) {
        setTimeout(async () => {
            await loadGuildsForEmbed();
            if (document.getElementById('guildSelect')) {
                document.getElementById('guildSelect').value = form.guildId;
                await handleGuildSelect();
                
                // Esperar a que se carguen los canales antes de seleccionar
                setTimeout(() => {
                    if (document.getElementById('channelSelect') && form.channelId) {
                        document.getElementById('channelSelect').value = form.channelId;
                    }
                }, 500);
            }
        }, 100);
    }

    // Restaurar campos
    if (form.fields && form.fields.length > 0) {
        const container = document.getElementById('fieldsContainer');
        if (container) {
            container.innerHTML = '';
            form.fields.forEach((field, index) => {
                const fieldId = `field_${Date.now()}_${index}`;
                const fieldName = escapeHtmlForValue(field.name || '');
                const fieldValue = escapeHtmlForValue(field.value || '');
                const fieldHTML = `
                    <div class="field-item" id="${fieldId}">
                        <div class="field-item-header">
                            <h5>Campo ${index + 1}</h5>
                            <button type="button" class="btn-remove-field" onclick="removeField('${fieldId}')">Eliminar</button>
                        </div>
                        <div class="form-group">
                            <label>Nombre</label>
                            <input type="text" class="form-control field-name" placeholder="Nombre del campo" value="${fieldName}" oninput="updateEmbedPreview(); saveState();">
                        </div>
                        <div class="form-group">
                            <label>Valor</label>
                            <textarea class="form-control field-value" rows="2" placeholder="Valor del campo" oninput="updateEmbedPreview(); saveState();">${fieldValue}</textarea>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" class="field-inline" ${field.inline ? 'checked' : ''} onchange="updateEmbedPreview(); saveState();"> Inline
                            </label>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', fieldHTML);
            });
            updateEmbedPreview();
            updateEmbedStats();
            syncEmbedTextCounters();
        }
    }
}

// Restaurar estado de logs
function restoreLogsState(state) {
    if (!state.logs) return;
    
    if (document.getElementById('logLevelFilter') && state.logs.levelFilter) {
        document.getElementById('logLevelFilter').value = state.logs.levelFilter;
    }
    
    if (state.logs.autoScroll !== undefined) {
        autoScroll = state.logs.autoScroll;
        if (document.getElementById('autoScrollText')) {
            document.getElementById('autoScrollText').textContent = `Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`;
        }
    }
}

// Restaurar estado de servidor
function restoreServerState(state) {
    if (!state.serverSection || !state.serverSection.selectedGuildId) return;

    if (state.serverSection.activePaneId) {
        currentServerPaneId = state.serverSection.activePaneId;
    }
    if (currentServerPaneId === 'serverPaneChannelSetup') {
        pendingAutomationDpxTab = 'channelsetup';
        currentServerPaneId = 'serverPaneAutomation';
    }
    currentServerInsightView = state.serverSection.insightView || 'overview';
    currentServerInsightPayload = state.serverSection.insightPayload || null;
    
    setTimeout(async () => {
        await loadGuildsForServer();
        if (!hasSelectedGuildContext()) {
            return;
        }

        if (document.getElementById('serverSelect') && state.serverSection.selectedGuildId) {
            document.getElementById('serverSelect').value = state.serverSection.selectedGuildId;
            // Disparar evento change para cargar la informacion
            const event = new Event('change');
            document.getElementById('serverSelect').dispatchEvent(event);
        }
        // Tras la segunda carga (restore), volver a aplicar el panel activo (p. ej. generador de canales).
        if (typeof getActiveSectionId === 'function' && getActiveSectionId() === 'serverSection') {
            switchServerPane(currentServerPaneId || 'serverPaneOverview');
        }
    }, 100);
}

// Inicialización (espera pantallas parciales si screen-loader.js está activo)
async function bootEyedBotPanel() {
    if (window.__appScreensReady) {
        await window.__appScreensReady;
    }
    console.log('🚀 Panel DOM listo');
    try {
        initAppDialog();
        console.log('✅ initAppDialog completado');

        initializeInteractiveGradient();
        console.log('✅ initializeInteractiveGradient completado');
        
        initBrandEyeAnimation();
        console.log('✅ initBrandEyeAnimation completado');

        const isAuthenticated = await checkAuth();
        console.log('✅ checkAuth completado:', isAuthenticated);
        
        // Solo continuar si el usuario está autenticado
        if (!isAuthenticated) {
            console.warn('⚠️ Usuario no autenticado, retornando');
            return; // No cargar datos si no hay autenticación
        }

        handleBillingQueryFeedback();
        ensureBillingPanel();
        ensurePremiumSectionBillingPanel();
        await loadBillingStatus();
        
        registerGatedNavigationButtons();
        console.log('✅ registerGatedNavigationButtons completado');
        
        setupEventListeners();
        console.log('✅ setupEventListeners completado');

        initializeServerConfigShell();
        
        initializeScrollReveal();
        console.log('✅ initializeScrollReveal completado');
        
        // Cargar estado guardado
        const savedState = loadState();
        serverFeaturesUnlocked = false;
        currentServerGuildId = '';

        if (savedState?.serverSection?.selectedGuildId) {
            currentServerGuildId = savedState.serverSection.selectedGuildId;
            serverFeaturesUnlocked = true;
            if (savedState.serverSection.activePaneId) {
                currentServerPaneId = savedState.serverSection.activePaneId;
            }
            if (currentServerPaneId === 'serverPaneChannelSetup') {
                pendingAutomationDpxTab = 'channelsetup';
                currentServerPaneId = 'serverPaneAutomation';
            }
        }

        setServerFeaturesNavigationVisible(false);
        if (serverFeaturesUnlocked) {
            setServerFeaturesNavigationVisible(true);
        }
        updateServerMenuIdentity();
        updateDashboardButtonState();
        
        console.log('📋 Cargando guilds...');
        await loadGuilds();
        console.log('✅ loadGuilds completado');
        
        await loadStats();
        console.log('✅ loadStats completado');
        
        await loadAboutOverview();
        console.log('✅ loadAboutOverview completado');
        // setupServerSummaryAutoRefresh(); // Deshabilitado: no cargar automáticamente, solo al actualizar página
        
        const initialSection = savedState?.activeSection || 'dashboard';
        showSection(initialSection, { skipHistory: true });
        console.log('✅ showSection completado:', initialSection);
        
        initializePanelHistory(initialSection);
        refreshActiveSectionReveal();
        
        // Restaurar estados específicos
        if (savedState) {
            restoreEmbedForm(savedState);
            restoreLogsState(savedState);
            restoreServerState(savedState);
        }
        
        console.log('✅ Inicialización completada exitosamente');
        // Guardar estado periódicamente y en eventos
        setInterval(saveState, 2000); // Guardar cada 2 segundos
    } catch (error) {
        console.error('❌ Error fatal durante inicialización:', error);
        console.error('Stack:', error?.stack);
        const guildsList = document.getElementById('guildsList');
        if (guildsList) {
            guildsList.innerHTML = `<div class="loading"><p>Error: ${escapeHtml(String(error?.message || 'Error desconocido'))}</p></div>`;
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        void bootEyedBotPanel();
    });
} else {
    void bootEyedBotPanel();
}

// Verificar autenticación
async function checkAuth() {
    try {
        console.log('🔐 Verificando autenticación en /api/user...');
        const response = await fetchWithCredentials('/api/user');
        console.log('📊 Respuesta de /api/user:', response.status, response.statusText);
        
        if (response.ok) {
            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            if (!contentType.includes('application/json')) {
                console.error('❌ Respuesta no es JSON:', contentType);
                window.location.replace('/login.html');
                return false;
            }

            const data = await response.json();
            console.log('✅ Datos del usuario cargados:', data?.user?.username);
            
            if (!data || !data.user) {
                console.error('❌ No hay datos de usuario en la respuesta');
                window.location.replace('/login.html');
                return false;
            }

            currentUser = data.user;
            isOwnerUser = Boolean(data.isOwner);
            currentGuilds = data.guilds || [];
            botInviteUrl = String(data.inviteUrl || '').trim();
            console.log('✅ Usuario autenticado:', currentUser.username, '| Guilds en sesión:', currentGuilds.length);
            updateUserUI();
            return true;
        }

        if (response.status === 401) {
            console.warn('⚠️ No autenticado (401)');
            const data = await response.json().catch(() => ({}));
            const target = data.redirect || '/login.html';
            window.location.replace(target);
            return false;
        }

        console.error('❌ Error verificando autenticación:', response.status);
        if (!window.location.pathname.includes('login')) {
            window.location.replace('/login.html');
        }
        return false;
    } catch (error) {
        console.error('❌ Excepción verificando autenticación:', error);
        console.error('Stack:', error?.stack);
        if (!window.location.pathname.includes('login')) {
            window.location.replace('/login.html');
        }
        return false;
    }
}

// Actualizar UI del usuario
function detectBrowserName() {
    const ua = navigator.userAgent || '';
    if (ua.includes('Edg/')) return 'Microsoft Edge';
    if (ua.includes('Chrome/')) return 'Google Chrome';
    if (ua.includes('Firefox/')) return 'Mozilla Firefox';
    if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
    return 'Navegador no identificado';
}

function updateProfileSettingsData() {
    const accountName = document.getElementById('settingsAccountName');
    const accountId = document.getElementById('settingsAccountId');
    const accountAvatar = document.getElementById('settingsAccountAvatar');
    const accountAvatarImg = document.getElementById('settingsAccountAvatarImg');
    const webHost = document.getElementById('settingsWebHost');
    const webPath = document.getElementById('settingsWebPath');
    const webBrowser = document.getElementById('settingsWebBrowser');
    const webTimezone = document.getElementById('settingsWebTimezone');

    const accountHandle = document.getElementById('settingsAccountHandle');
    const accountIdCard = document.getElementById('settingsAccountIdCard');
    const accountAvatarCard = document.getElementById('settingsAccountAvatarCard');
    const username = currentUser?.username || '-';
    const userId = currentUser?.id || '-';
    const avatarLabel = currentUser?.avatar ? 'Avatar personalizado en Discord' : 'Avatar predeterminado de Discord';

    if (accountName) {
        accountName.textContent = username;
    }
    if (accountId) {
        accountId.textContent = userId;
    }
    if (accountHandle) {
        accountHandle.textContent = username;
    }
    if (accountIdCard) {
        accountIdCard.textContent = userId;
    }
    if (accountAvatarCard) {
        accountAvatarCard.textContent = avatarLabel;
    }
    if (accountAvatarImg) {
        const avatarUrl = getDashboardUserAvatarUrl();
        if (avatarUrl) {
            accountAvatarImg.src = avatarUrl;
            accountAvatarImg.alt = currentUser?.username ? `Avatar de ${currentUser.username}` : 'Avatar de Discord';
            accountAvatarImg.hidden = false;
        } else {
            accountAvatarImg.removeAttribute('src');
            accountAvatarImg.hidden = true;
        }
    }
    if (accountAvatar) {
        accountAvatar.textContent = avatarLabel;
    }
    if (webHost) {
        webHost.textContent = window.location.host || '-';
    }
    if (webPath) {
        webPath.textContent = window.location.pathname || '/';
    }
    if (webBrowser) {
        webBrowser.textContent = detectBrowserName();
    }
    if (webTimezone) {
        try {
            webTimezone.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || '-';
        } catch {
            webTimezone.textContent = '-';
        }
    }

    ensureBillingPanel();
    ensurePremiumSectionBillingPanel();
    renderBillingState();
}

function updateUserUI() {
    if (currentUser) {
        document.getElementById('userName').textContent = currentUser.username;
        if (currentUser.avatar) {
            document.getElementById('userAvatar').src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
        } else {
            document.getElementById('userAvatar').src = `https://cdn.discordapp.com/embed/avatars/${currentUser.discriminator % 5}.png`;
        }
    }

    updateProfileSettingsData();

    const ownerRestrictedSelectors = [
        '#statsBtn',
        '#logsBtn',
        '[data-section="statsSection"]',
        '[data-section="logsSection"]',
        '[data-quick-section="statsSection"]',
        '[data-quick-section="logsSection"]',
        '[data-section="nukeSection"]',
        '[data-quick-section="nukeSection"]',
        '#executeNukeBtn',
        '#embedTabs [data-dpx-tab="attachments"]',
        '#embedSection [data-dpx-panel="attachments"]',
        '#sendOwnerAttachmentBtn'
    ];

    ownerRestrictedSelectors.forEach((selector) => {
        document.querySelectorAll(selector).forEach((el) => {
            if (!(el instanceof HTMLElement)) return;
            if (isOwnerUser) {
                el.style.display = '';
                el.classList.remove('owner-only-hidden');
                el.removeAttribute('aria-hidden');
            } else {
                el.style.display = 'none';
                el.classList.add('owner-only-hidden');
                el.setAttribute('aria-hidden', 'true');
            }
        });
    });

    const addBotBtn = document.getElementById('addBotBtn');
    if (addBotBtn) {
        if (botInviteUrl) {
            addBotBtn.href = botInviteUrl;
            addBotBtn.classList.remove('is-disabled');
            addBotBtn.setAttribute('aria-disabled', 'false');
        } else {
            addBotBtn.href = '#';
            addBotBtn.classList.add('is-disabled');
            addBotBtn.setAttribute('aria-disabled', 'true');
        }
    }
}

// Configurar event listeners
function setupEventListeners() {
    bindSettingsPaneNavigation();
    refreshPremiumLocks();
    bindThemeControls();

    window.addEventListener('popstate', (event) => {
        const state = event.state;
        if (state?.panel && state?.sectionId) {
            showSection(state.sectionId, { skipHistory: true });
            if (!state.guard) {
                pushPanelHistory(state.sectionId);
            }
            return;
        }

        // Evita volver al login de Discord con la flecha atrás.
        const activeSection = getActiveSectionId();
        history.pushState(buildPanelHistoryState(activeSection, true), '', window.location.pathname + window.location.search);
    });

    // Navegación
    document.getElementById('dashboardBtn').addEventListener('click', async () => {
        if (hasSelectedGuildContext()) {
            resetServerContextToDashboard();
        }
        showSection('dashboard');
        await loadGuilds();
    });

    document.querySelectorAll('[data-section]').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const sectionId = link.dataset.section;
            if (!sectionId) return;
            showSection(sectionId);
        });
    });

    const addBotBtn = document.getElementById('addBotBtn');
    if (addBotBtn) {
        addBotBtn.addEventListener('click', (event) => {
            if (!botInviteUrl) {
                event.preventDefault();
                showToast('No se pudo generar el enlace de invitacion del bot', 'warning');
            }
        });
    }

    const changeServerBtn = document.getElementById('changeServerBtn');
    if (changeServerBtn) {
        changeServerBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            await openServerSwitcherModal();
        });
    }

    const serverSwitcherClose = document.getElementById('serverSwitcherClose');
    if (serverSwitcherClose) {
        serverSwitcherClose.addEventListener('click', closeServerSwitcherModal);
    }

    const serverSwitcherPrev = document.getElementById('serverSwitcherPrev');
    if (serverSwitcherPrev) {
        serverSwitcherPrev.addEventListener('click', () => moveServerSwitcher(-1));
    }

    const serverSwitcherNext = document.getElementById('serverSwitcherNext');
    if (serverSwitcherNext) {
        serverSwitcherNext.addEventListener('click', () => moveServerSwitcher(1));
    }

    const serverSwitcherSelect = document.getElementById('serverSwitcherSelect');
    if (serverSwitcherSelect) {
        serverSwitcherSelect.addEventListener('click', () => {
            confirmServerSwitcherSelection();
        });
    }

    const serverSwitcherModal = document.getElementById('serverSwitcherModal');
    if (serverSwitcherModal) {
        serverSwitcherModal.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest('[data-close-server-switcher="true"]')) {
                closeServerSwitcherModal();
            }
        });
    }

    const serverSwitcherViewport = document.querySelector('.server-switcher-viewport');
    if (serverSwitcherViewport) {
        serverSwitcherViewport.addEventListener('touchstart', (event) => {
            const touch = event.touches?.[0];
            if (!touch) return;
            startServerSwitcherSwipe(touch.clientX);
        }, { passive: true });

        serverSwitcherViewport.addEventListener('touchmove', (event) => {
            const touch = event.touches?.[0];
            if (!touch) return;
            updateServerSwitcherSwipe(touch.clientX);
        }, { passive: true });

        serverSwitcherViewport.addEventListener('touchend', () => {
            endServerSwitcherSwipe();
        });
    }

    document.addEventListener('keydown', (event) => {
        const modal = document.getElementById('serverSwitcherModal');
        if (!modal || !modal.classList.contains('show')) return;

        if (event.key === 'Escape') {
            closeServerSwitcherModal();
            return;
        }

        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            moveServerSwitcher(-1);
            return;
        }

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            moveServerSwitcher(1);
        }
    });

    const serverSideMenu = document.getElementById('serverSideMenu');
    if (serverSideMenu) {
        serverSideMenu.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const title = target.closest('.side-menu-group-title');
            if (!title) return;

            const group = title.closest('.side-menu-group');
            const groupId = group?.dataset.group || '';
            if (!groupId) return;
            toggleSideMenuGroupCollapsed(groupId);
        });

        serverSideMenu.addEventListener('keydown', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const title = target.closest('.side-menu-group-title');
            if (!title) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();

            const group = title.closest('.side-menu-group');
            const groupId = group?.dataset.group || '';
            if (!groupId) return;
            toggleSideMenuGroupCollapsed(groupId);
        });
    }

    const guildSearch = document.getElementById('guildSearch');
    if (guildSearch) {
        guildSearch.addEventListener('input', (event) => {
            dashboardGuildSearchQuery = String(event.target?.value || '');
            displayGuilds(getFilteredDashboardGuilds());
        });
    }

    const commandsSearchInput = document.getElementById('commandsSearchInput');
    if (commandsSearchInput) {
        commandsSearchInput.addEventListener('input', (event) => {
            commandsFilterQuery = String(event.target?.value || '').trim().toLowerCase();
            renderFilteredCommands();
        });
    }

    const aboutTabs = Array.from(document.querySelectorAll('.about-pro-tab'));
    const aboutPanels = Array.from(document.querySelectorAll('.about-pro-panel'));
    if (aboutTabs.length && aboutPanels.length) {
        const switchAboutTab = (tabKey = '') => {
            aboutTabs.forEach((btn) => {
                const active = btn.dataset.aboutTab === tabKey;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            aboutPanels.forEach((panel) => {
                const active = panel.dataset.aboutPanel === tabKey;
                panel.classList.toggle('active', active);
                panel.hidden = !active;
            });
            refreshActiveSectionReveal();
        };

        aboutTabs.forEach((btn) => {
            btn.addEventListener('click', () => {
                switchAboutTab(btn.dataset.aboutTab || 'what');
            });
        });
        switchAboutTab(aboutTabs.find((b) => b.classList.contains('active'))?.dataset.aboutTab || 'what');
    }

    const aboutCarouselPrev = document.getElementById('aboutCarouselPrev');
    const aboutCarouselNext = document.getElementById('aboutCarouselNext');
    const aboutCarouselViewport = document.getElementById('aboutCarouselViewport');
    if (aboutCarouselPrev && aboutCarouselNext && aboutCarouselViewport && !aboutCarouselBound) {
        const moveByViewport = (dir = 1) => {
            const width = Math.max(260, Math.round(aboutCarouselViewport.clientWidth * 0.82));
            aboutCarouselViewport.scrollBy({ left: width * dir, behavior: 'smooth' });
        };

        aboutCarouselPrev.addEventListener('click', () => moveByViewport(-1));
        aboutCarouselNext.addEventListener('click', () => moveByViewport(1));

        let aboutCarouselAutoScroll = setInterval(() => moveByViewport(1), 5400);
        const pauseAboutAuto = () => {
            if (aboutCarouselAutoScroll) {
                clearInterval(aboutCarouselAutoScroll);
                aboutCarouselAutoScroll = null;
            }
        };
        const resumeAboutAuto = () => {
            if (aboutCarouselAutoScroll) return;
            aboutCarouselAutoScroll = setInterval(() => moveByViewport(1), 5400);
        };

        aboutCarouselViewport.addEventListener('mouseenter', pauseAboutAuto);
        aboutCarouselViewport.addEventListener('mouseleave', resumeAboutAuto);
        aboutCarouselViewport.addEventListener('focusin', pauseAboutAuto);
        aboutCarouselViewport.addEventListener('focusout', resumeAboutAuto);

        aboutCarouselBound = true;
    }

    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const sideBtn = target.closest('.side-menu-btn');
        if (!sideBtn) return;
        event.preventDefault();
        handleServerSideAction(sideBtn);
    });

    ['backToServerFromEmbed', 'backToServerFromStats', 'backToServerFromLogs', 'backToServerFromCommands'].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', () => {
            showSection('serverSection');
            switchServerPane('serverPaneOverview');
        });
    });

    const serverTabSearch = document.getElementById('serverTabSearch');
    if (serverTabSearch) {
        const handleServerTabSearch = debounce((event) => {
            const query = String(event.target?.value || '').trim().toLowerCase();
            document.querySelectorAll('.side-menu-btn').forEach((btn) => {
                const label = (btn.textContent || '').trim().toLowerCase();
                const isVisible = !query || label.includes(query);
                btn.classList.toggle('hidden', !isVisible);
            });

            document.querySelectorAll('.side-menu-group').forEach((group) => {
                const title = group.querySelector('.side-menu-group-title');
                const visibleButtons = group.querySelectorAll('.side-menu-btn:not(.hidden)');
                if (title) title.classList.toggle('hidden', visibleButtons.length === 0);
            });
        }, 160);
        serverTabSearch.addEventListener('input', handleServerTabSearch);
    }

    // Menú de usuario
    document.getElementById('userMenu').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('dropdownMenu').classList.toggle('show');
    });

    document.addEventListener('click', () => {
        document.getElementById('dropdownMenu').classList.remove('show');
    });

    const profileSettingsBtn = document.getElementById('profileSettingsBtn');
    if (profileSettingsBtn) {
        profileSettingsBtn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            document.getElementById('dropdownMenu').classList.remove('show');
            updateProfileSettingsData();
            switchSettingsPane(currentSettingsPaneId, { silent: true });
            showSection('profileSettingsSection');
        });
    }

    // Embed form
    document.getElementById('guildSelect').addEventListener('change', () => {
        handleGuildSelect();
        saveState();
    });
    document.getElementById('embedTitle').addEventListener('input', () => {
        syncEmbedTextCounters();
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedDescription').addEventListener('input', () => {
        syncEmbedTextCounters();
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedColor').addEventListener('input', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedFooter').addEventListener('input', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedImage').addEventListener('input', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedThumbnail').addEventListener('input', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedImageFile').addEventListener('change', (e) => {
        handleImageFileSelection(e, 'image');
    });
    document.getElementById('embedThumbnailFile').addEventListener('change', (e) => {
        handleImageFileSelection(e, 'thumbnail');
    });
    document.getElementById('embedImageScale').addEventListener('input', (e) => {
        document.getElementById('embedImageScaleValue').textContent = `${e.target.value}%`;
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedThumbnailScale').addEventListener('input', (e) => {
        document.getElementById('embedThumbnailScaleValue').textContent = `${e.target.value}%`;
        updateEmbedPreview();
        saveState();
    });
    ['embedImageCropX', 'embedImageCropY', 'embedImageCropW', 'embedImageCropH', 'embedThumbnailCropX', 'embedThumbnailCropY', 'embedThumbnailCropW', 'embedThumbnailCropH']
        .forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                updateEmbedPreview();
                saveState();
            });
        });
    document.getElementById('embedTimestamp').addEventListener('change', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('channelSelect').addEventListener('change', saveState);
    const embedTargetMid = document.getElementById('embedTargetMessageId');
    if (embedTargetMid) {
        embedTargetMid.addEventListener('input', () => {
            syncEmbedSendButtonLabel();
            saveState();
        });
    }
    syncEmbedSendButtonLabel();
    document.getElementById('previewBtn')?.addEventListener('click', updateEmbedPreview);
    document.getElementById('resetEmbedBtn').addEventListener('click', () => clearEmbedComposer({ keepDestination: true }));
    document.getElementById('sendEmbedBtn').addEventListener('click', sendEmbed);
    document.getElementById('sendOwnerAttachmentBtn')?.addEventListener('click', sendOwnerAttachmentToChannel);
    document.getElementById('executeNukeBtn')?.addEventListener('click', executeGuildNukeFromPanel);
    document.getElementById('addFieldBtn').addEventListener('click', addField);
    document.getElementById('addTitleFieldBtn').addEventListener('click', function() {
        // Agrega un field con formato de título destacado
        const container = document.getElementById('fieldsContainer');
        const fieldId = `field_${Date.now()}_${Math.floor(Math.random()*1000)}`;
        const fieldHTML = `
            <div class="field-item" id="${fieldId}">
                <div class="field-item-header">
                    <h5>Título Destacado</h5>
                    <button type="button" class="btn-remove-field" onclick="removeField('${fieldId}')">Eliminar</button>
                </div>
                <div class="form-group">
                    <label>Texto del título</label>
                    <input type="text" class="form-control field-name" placeholder="Título llamativo" value="Título llamativo" oninput="updateEmbedPreview(); saveState();">
                </div>
                <div class="form-group">
                    <label>Valor</label>
                    <textarea class="form-control field-value" rows="2" placeholder="(opcional)" oninput="updateEmbedPreview(); saveState();"></textarea>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" class="field-inline" onchange="updateEmbedPreview(); saveState();"> Inline
                    </label>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', fieldHTML);
        updateEmbedPreview();
        updateEmbedStats();
        saveState();
    });

    document.getElementById('addTitleDescBtn').addEventListener('click', function() {
        // Inserta un bloque de título en la descripción usando markdown
        const desc = document.getElementById('embedDescription');
        const cursorPos = desc.selectionStart || desc.value.length;
        const before = desc.value.substring(0, cursorPos);
        const after = desc.value.substring(cursorPos);
        const titleBlock = `\n**══════════ TÍTULO LLAMATIVO ══════════**\n`;
        desc.value = before + titleBlock + after;
        desc.focus();
        desc.selectionStart = desc.selectionEnd = before.length + titleBlock.length;
        syncEmbedTextCounters();
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('saveTemplateBtn').addEventListener('click', saveEmbedTemplate);
    document.getElementById('loadTemplateBtn').addEventListener('click', loadSelectedTemplate);
    document.getElementById('deleteTemplateBtn').addEventListener('click', deleteSelectedTemplate);
    
    // Guardar estado al cambiar de sección
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            setTimeout(saveState, 100);
        });
    });
    
    // Guardar estado en logs
    if (document.getElementById('logLevelFilter')) {
        document.getElementById('logLevelFilter').addEventListener('change', () => {
            saveState();
        });
    }
    
    if (document.getElementById('autoScrollBtn')) {
        document.getElementById('autoScrollBtn').addEventListener('click', () => {
            setTimeout(saveState, 100);
        });
    }
    
    // Guardar estado en servidor
    if (document.getElementById('serverSelect')) {
        document.getElementById('serverSelect').addEventListener('change', () => {
            saveState();
        });
    }
}

function initializeScrollReveal() {
    const elements = document.querySelectorAll('.reveal-on-scroll');
    if (!elements.length) return;

    if (!('IntersectionObserver' in window)) {
        elements.forEach((el) => el.classList.add('is-visible'));
        return;
    }

    if (revealObserver) {
        revealObserver.disconnect();
    }

    revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
        });
    }, {
        threshold: 0.16,
        rootMargin: '0px 0px -12% 0px'
    });

    elements.forEach((el) => {
        if (!el.classList.contains('is-visible')) {
            revealObserver.observe(el);
        }
    });
}

function refreshActiveSectionReveal() {
    const active = document.querySelector('.section.active');
    if (!active) return;

    const targets = active.querySelectorAll('.reveal-on-scroll');
    if (!targets.length) return;

    const viewportHeight = window.innerHeight || 900;
    targets.forEach((el) => {
        if (el.classList.contains('is-visible')) return;
        const rect = el.getBoundingClientRect();
        if (rect.top < viewportHeight * 0.86) {
            el.classList.add('is-visible');
        }
    });
}

async function loadAboutOverview() {
    try {
        const response = await fetchWithCredentials('/api/about-overview');
        if (!response.ok) return;

        const payload = await response.json();
        const totalServers = Number(payload.totalServers) || 0;
        const totalCommands = Number(payload.totalCommands) || 0;

        const totalServersEl = document.getElementById('aboutTotalServers');
        const totalCommandsEl = document.getElementById('aboutTotalCommands');

        if (totalServersEl) {
            totalServersEl.textContent = new Intl.NumberFormat('es-ES').format(totalServers);
        }
        if (totalCommandsEl) {
            totalCommandsEl.textContent = new Intl.NumberFormat('es-ES').format(totalCommands);
        }
    } catch (error) {
        console.warn('No se pudo cargar el resumen de Acerca de:', error?.message || error);
    }
}

const SERVER_PANE_META = {
    serverPaneOverview: { tone: 'sky', kicker: 'Panel del servidor', icon: 'layout', hint: 'Métricas, actividad y accesos rápidos' },
    serverPaneWelcome: { tone: 'rose', kicker: 'Comunidad', icon: 'door', hint: 'Entrada, salida y tarjetas' },
    serverPaneVerify: { tone: 'violet', kicker: 'Acceso', icon: 'check', hint: 'Roles, embed y verificación' },
    serverPaneTicketsManage: { tone: 'cyan', kicker: 'Soporte', icon: 'chat', hint: 'Cola, historial y panel' },
    serverPaneLevels: { tone: 'amber', kicker: 'Progresión', icon: 'bolt', hint: 'XP, curva y recompensas' },
    serverPaneVoiceCreator: { tone: 'teal', kicker: 'Voz', icon: 'mic', hint: 'Canales temporales y reglas' },
    serverPaneAutomation: { tone: 'violet', kicker: 'Automatización', icon: 'gear', hint: 'Anti-spam, raid y canales' },
    serverPaneGacha: { tone: 'rose', kicker: 'Economía', icon: 'sparkles', hint: 'Rolls, tienda y ranking' },
    serverPaneModeration: { tone: 'amber', kicker: 'Moderación', icon: 'shield', hint: 'Miembros, acciones y baneos' },
    serverPaneSecurity: { tone: 'violet', kicker: 'Seguridad', icon: 'shield', hint: 'Entrada, mensajes y confianza' },
    serverPaneNotifications: { tone: 'sky', kicker: 'Alertas', icon: 'bell', hint: 'Eventos, digest y directos' },
    serverPaneFreeGames: { tone: 'teal', kicker: 'Avisos', icon: 'leaf', hint: 'Epic Games y Steam gratis' }
};

const COMMAND_CATEGORY_LABELS = {
    all: 'Todos',
    config: 'Configuración',
    fun: 'Diversión',
    moderation: 'Moderación',
    music: 'Música',
    utility: 'Utilidad',
    other: 'Otros'
};

const COMMAND_CATEGORY_TONES = {
    all: 'all',
    config: 'violet',
    fun: 'rose',
    moderation: 'amber',
    music: 'cyan',
    utility: 'sky',
    other: 'slate'
};

function getCommandCategoryKey(category) {
    return String(category || 'other').toLowerCase();
}

function getCommandCategoryLabel(category) {
    const key = getCommandCategoryKey(category);
    return COMMAND_CATEGORY_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function getCommandCategoryTone(category) {
    const key = getCommandCategoryKey(category);
    return COMMAND_CATEGORY_TONES[key] || COMMAND_CATEGORY_TONES.other;
}

function getCommandCategoryIcon(category) {
    const key = getCommandCategoryKey(category);
    const icons = {
        all: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>',
        config: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v2.2"></path><path d="M12 18.8V21"></path><path d="M4.2 12H7"></path><path d="M17 12h2.8"></path><circle cx="12" cy="12" r="3.2"></circle><path d="M5.6 5.6l1.6 1.6"></path><path d="M16.8 16.8l1.6 1.6"></path><path d="M18.4 5.6l-1.6 1.6"></path><path d="M7.2 16.8l-1.6 1.6"></path></svg>',
        fun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M9 10h.01"></path><path d="M15 10h.01"></path><path d="M9.5 15a3 3 0 0 0 5 0"></path></svg>',
        moderation: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 4 6.5V11c0 4.4 3.1 8.5 8 9.5 4.9-1 8-5.1 8-9.5V6.5L12 3Z"></path><path d="m9.5 12 1.8 1.8L15.5 9.6"></path></svg>',
        music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 18V7l10-2v11"></path><circle cx="7" cy="18" r="2.5"></circle><circle cx="17" cy="16" r="2.5"></circle></svg>',
        utility: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-1.4-1.4 2.1-2.1Z"></path></svg>',
        other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3 4 6.5V11c0 4.4 3.1 8.5 8 9.5 4.9-1 8-5.1 8-9.5V6.5L12 3Z"></path><path d="M12 11v4"></path><path d="M12 8h.01"></path></svg>'
    };
    return icons[key] || icons.other;
}

function updateCommandsSummary(visible = 0, total = 0) {
    const visibleEl = document.getElementById('commandsVisibleCount');
    const totalEl = document.getElementById('commandsTotalCount');
    const formatter = new Intl.NumberFormat('es-ES');

    if (visibleEl) visibleEl.textContent = formatter.format(visible);
    if (totalEl) totalEl.textContent = formatter.format(total);
}

function buildCommandsCategoryFilters(commands = []) {
    const container = document.getElementById('commandsCategoryFilters');
    if (!container) return;

    const counts = new Map();
    commands.forEach((command) => {
        const key = getCommandCategoryKey(command.category);
        counts.set(key, (counts.get(key) || 0) + 1);
    });

    const orderedCategories = ['all', ...Array.from(counts.keys()).sort()];
    container.innerHTML = orderedCategories
        .filter((category, index) => index === 0 || counts.get(category) > 0)
        .map((category) => {
            const count = category === 'all' ? commands.length : counts.get(category) || 0;
            const active = category === commandsFilterCategory ? 'active' : '';
            const tone = getCommandCategoryTone(category);
            return `
                <button type="button" class="commands-filter-btn commands-filter-btn--${tone} ${active}" data-commands-category="${category}">
                    <span class="commands-filter-icon" aria-hidden="true">${getCommandCategoryIcon(category)}</span>
                    <span class="commands-filter-label">${getCommandCategoryLabel(category)}</span>
                    <strong>${count}</strong>
                </button>
            `;
        }).join('');

    container.querySelectorAll('[data-commands-category]').forEach((button) => {
        button.addEventListener('click', () => {
            commandsFilterCategory = button.dataset.commandsCategory || 'all';
            buildCommandsCategoryFilters(commandsCatalog);
            renderFilteredCommands();
        });
    });
}

function renderFilteredCommands() {
    const query = commandsFilterQuery;
    const category = commandsFilterCategory;

    const filtered = commandsCatalog.filter((command) => {
        const commandCategory = String(command.category || 'other').toLowerCase();
        const categoryMatch = category === 'all' || category === commandCategory;
        if (!categoryMatch) return false;

        if (!query) return true;
        const haystack = `${command.name || ''} ${command.description || ''} ${commandCategory}`.toLowerCase();
        return haystack.includes(query);
    });

    displayCommands(filtered, { total: commandsCatalog.length });
    updateCommandsSummary(filtered.length, commandsCatalog.length);
}

// Mostrar sección
function showSection(sectionId, options = {}) {
    if (!isOwnerUser && ['statsSection', 'logsSection', 'nukeSection'].includes(sectionId)) {
        showToast('Esta seccion solo esta disponible para el creador del bot', 'warning');
        sectionId = hasSelectedGuildContext() ? 'serverSection' : 'dashboard';
    }

    if (!hasSelectedGuildContext() && ['embedSection', 'statsSection', 'logsSection', 'nukeSection', 'serverSection'].includes(sectionId)) {
        showToast('Primero selecciona un servidor en el dashboard', 'warning');
        sectionId = 'dashboard';
    }

    const targetSection = document.getElementById(sectionId);
    if (!targetSection) {
        console.warn('Seccion invalida solicitada:', sectionId);
        sectionId = 'dashboard';
    }

    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId)?.classList.add('active');

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    const navIdBySection = {
        dashboard: 'dashboardBtn',
        controlCenterSection: 'controlCenterBtn',
        profileSettingsSection: 'controlCenterBtn',
        serverSection: 'serverBtn',
        embedSection: 'embedBtn',
        statsSection: 'statsBtn',
        logsSection: 'logsBtn',
        commandsSection: 'aboutCommandsBtn',
        premiumSection: 'premiumNavBtn'
    };

    const activeNavId = navIdBySection[sectionId] || navIdBySection.dashboard;
    const activeNav = document.getElementById(activeNavId);
    if (activeNav) activeNav.classList.add('active');

    if (sectionId === 'embedSection') {
        loadGuildsForEmbed();
        initEmbedPanel();
    } else if (sectionId === 'statsSection') {
        loadStats();
    } else if (sectionId === 'logsSection') {
        loadLogs();
    } else if (sectionId === 'nukeSection') {
        loadNukePanel();
    } else if (sectionId === 'commandsSection') {
        loadCommands();
    } else if (sectionId === 'serverSection') {
        const pane = options.serverPaneAfterLoad || currentServerPaneId || 'serverPaneOverview';
        const paneBtn = options.serverPaneAfterLoadButton || null;
        if (!options.skipServerDataLoad) {
            void loadGuildsForServer().then(() => {
                switchServerPane(pane, paneBtn);
            });
        } else {
            switchServerPane(pane, paneBtn);
        }
    } else if (sectionId === 'controlCenterSection') {
        loadAboutOverview();
        refreshActiveSectionReveal();
    } else if (sectionId === 'premiumSection') {
        ensurePremiumSectionBillingPanel();
        void loadBillingStatus();
        refreshActiveSectionReveal();
    } else if (sectionId === 'profileSettingsSection') {
        updateProfileSettingsData();
        switchSettingsPane(currentSettingsPaneId, { silent: true });
    }

    if (sectionId === 'commandsSection') {
        refreshActiveSectionReveal();
    }

    updateBackToServerButtonsVisibility(sectionId);
    
    // Guardar sección activa
    saveState();
    if (!options.skipHistory) {
        pushPanelHistory(sectionId);
    }

    window.EyedBotMobile?.onSectionChange?.(sectionId);
}

// Cargar servidores
async function loadGuilds() {
    try {
        const guilds = await fetchCachedGetJSON('/api/guilds', API_CACHE_TTL.guilds);
        dashboardGuildsCache = Array.isArray(guilds) ? guilds : [];
        displayGuilds(getFilteredDashboardGuilds());
    } catch (error) {
        console.error('Error cargando servidores:', error);
        const container = document.getElementById('guildsList');
        const isAuth = error && (error.status === 401 || (error.message && error.message.toLowerCase().includes('401')));
        const msg = isAuth ? 'No autenticado. Por favor inicia sesión.' : 'Error al cargar servidores';
        if (container) {
            container.innerHTML = `<div class="loading"><p>${escapeHtml(String(msg))}</p></div>`;
        }
        showToast(msg, 'error');
    }
}

function getFilteredDashboardGuilds() {
    const query = String(dashboardGuildSearchQuery || '').trim().toLowerCase();
    if (!query) return dashboardGuildsCache;
    return dashboardGuildsCache.filter((guild) => {
        const name = String(guild?.name || '').toLowerCase();
        return name.includes(query);
    });
}

function formatDashboardMemberCount(value) {
    return new Intl.NumberFormat('es-ES').format(Number(value) || 0);
}

function updateDashboardGuildSummary(guilds = dashboardGuildsCache) {
    const countEl = document.getElementById('dashboardGuildCount');
    const membersEl = document.getElementById('dashboardMemberCount');
    if (!countEl || !membersEl) return;

    const list = Array.isArray(guilds) ? guilds : [];
    countEl.textContent = String(list.length);
    const totalMembers = list.reduce((sum, guild) => sum + (Number(guild?.botGuild?.memberCount) || 0), 0);
    membersEl.textContent = formatDashboardMemberCount(totalMembers);
}

function renderDashboardGuildCard(guild) {
    const guildId = String(guild.id || '');
    const safeGuildId = guildId.replace(/'/g, "\\'");
    const guildName = escapeHtml(String(guild.name || 'Servidor'));
    const memberCount = Number(guild?.botGuild?.memberCount) || 0;
    const shortId = escapeHtml(String(guild.id || '').slice(-4));
    const isFavorite = isDashboardGuildFavorite(guildId);
    const favoriteLabel = isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos';
    const iconHtml = guild.icon
        ? `<img src="${escapeHtml(String(guild.icon))}" alt="${guildName}" loading="lazy" decoding="async">`
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';

    return `
        <article class="guild-card dashboard-guild-card${isFavorite ? ' is-favorite' : ''}" data-guild-id="${escapeHtml(guildId)}" role="button" tabindex="0" onclick="selectGuild('${safeGuildId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();selectGuild('${safeGuildId}');}">
            <span class="dashboard-guild-card__shine" aria-hidden="true"></span>
            <div class="guild-card-top dashboard-guild-card__head">
                <div class="guild-icon dashboard-guild-card__icon">${iconHtml}</div>
                <div class="dashboard-guild-card__actions">
                    <button type="button" class="dashboard-guild-card__favorite${isFavorite ? ' is-active' : ''}" aria-label="${favoriteLabel}" aria-pressed="${isFavorite ? 'true' : 'false'}" title="${favoriteLabel}" onclick="event.stopPropagation(); toggleDashboardGuildFavorite('${safeGuildId}')">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path class="dashboard-guild-card__favorite-outline" d="M12 2.5l2.86 5.8 6.39.93-4.62 4.5 1.09 6.36L12 17.9l-5.72 3.01 1.09-6.36-4.62-4.5 6.39-.93L12 2.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                            <path class="dashboard-guild-card__favorite-fill" d="M12 2.5l2.86 5.8 6.39.93-4.62 4.5 1.09 6.36L12 17.9l-5.72 3.01 1.09-6.36-4.62-4.5 6.39-.93L12 2.5z"></path>
                        </svg>
                    </button>
                    <span class="guild-pill dashboard-guild-card__status">Listo para configurar</span>
                </div>
            </div>
            <div class="dashboard-guild-card__body">
                <div class="guild-name dashboard-guild-card__name">${guildName}</div>
                <div class="guild-info dashboard-guild-card__info">Espacio principal del servidor en el panel</div>
            </div>
            <div class="guild-meta dashboard-guild-card__meta">
                <span class="guild-meta-item">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                    </svg>
                    ${formatDashboardMemberCount(memberCount)} miembros
                </span>
                <span class="guild-meta-item guild-meta-item--ghost">ID · ${shortId}</span>
            </div>
            <div class="dashboard-guild-card__cta" aria-hidden="true">
                <span>Abrir panel</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
            </div>
        </article>`;
}

function renderDashboardGuildSection(title, guilds) {
    if (!Array.isArray(guilds) || guilds.length === 0) return '';
    const cards = guilds.map((guild) => renderDashboardGuildCard(guild)).join('');
    return `
        <section class="dashboard-guild-section">
            <h3 class="dashboard-guild-section-title">${escapeHtml(title)}</h3>
            <div class="dashboard-guild-section-grid guilds-grid dashboard-guilds-grid">${cards}</div>
        </section>`;
}

// Mostrar servidores
function displayGuilds(guilds) {
    const container = document.getElementById('guildsList');
    if (!container) return;

    updateDashboardGuildSummary(dashboardGuildsCache);

    if (guilds.length === 0) {
        const emptyTitle = dashboardGuildSearchQuery ? 'Sin coincidencias' : 'Sin servidores todavía';
        const emptyText = dashboardGuildSearchQuery
            ? 'Prueba con otro nombre o borra la búsqueda para ver todas las comunidades.'
            : 'Cuando el bot esté en un servidor con permisos de administración, aparecerá aquí.';
        container.className = 'dashboard-guilds-board';
        container.innerHTML = `
            <div class="dashboard-guild-empty">
                <div class="dashboard-guild-empty__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                        <rect x="3" y="6" width="18" height="12" rx="2"></rect>
                        <path d="M7 10h10"></path>
                        <path d="M7 14h6"></path>
                    </svg>
                </div>
                <h3>${escapeHtml(emptyTitle)}</h3>
                <p>${escapeHtml(emptyText)}</p>
            </div>`;
        return;
    }

    const { favorites, others } = partitionDashboardGuilds(guilds);
    const sections = [
        renderDashboardGuildSection('Servidores favoritos', favorites),
        renderDashboardGuildSection('Servidores', others)
    ].filter(Boolean);

    container.className = 'dashboard-guilds-board';
    container.innerHTML = sections.join('');
}

// Cargar servidores para el formulario de embed
async function loadGuildsForEmbed() {
    try {
        const guilds = await fetchCachedGetJSON('/api/guilds', API_CACHE_TTL.guilds);
        const select = document.getElementById('guildSelect');
        const channelSelect = document.getElementById('channelSelect');

        if (!hasSelectedGuildContext()) {
            select.disabled = true;
            select.innerHTML = '<option value="">Selecciona un servidor en el Dashboard</option>';
            if (channelSelect) {
                channelSelect.disabled = true;
                channelSelect.innerHTML = '<option value="">Selecciona un servidor desde el Dashboard</option>';
            }
            return;
        }

        const selectedGuild = (Array.isArray(guilds) ? guilds : []).find((g) => String(g.id) === String(currentServerGuildId));
        if (!selectedGuild) {
            select.disabled = true;
            select.innerHTML = '<option value="">Servidor seleccionado no disponible</option>';
            if (channelSelect) {
                channelSelect.disabled = true;
                channelSelect.innerHTML = '<option value="">Servidor seleccionado no disponible</option>';
            }
            return;
        }

        select.disabled = true;
        select.innerHTML = `<option value="${selectedGuild.id}">${escapeHtml(selectedGuild.name)}</option>`;
        select.value = selectedGuild.id;
        await handleGuildSelect();
    } catch (error) {
        console.error('Error cargando servidores:', error);
    }
}

// Manejar selección de servidor
async function handleGuildSelect() {
    const guildId = document.getElementById('guildSelect').value;
    const channelSelect = document.getElementById('channelSelect');
    
    if (!guildId) {
        channelSelect.disabled = true;
        channelSelect.innerHTML = '<option value="">Primero selecciona un servidor</option>';
        renderTemplateSelect([]);
        return;
    }

    try {
        const channels = await fetchCachedGetJSON(`/api/guild/${guildId}/channels`, API_CACHE_TTL.channels);
        setPanelGuildTextChannels(channels);
        channelSelect.disabled = false;
        channelSelect.innerHTML = '<option value="">Selecciona un canal</option>' +
            (Array.isArray(channels) ? channels : [])
                .filter(ch => ch.type === 0) // Solo canales de texto
                .map(ch => `<option value="${ch.id}"># ${ch.name}</option>`).join('');
        await loadEmbedTemplates(guildId);
    } catch (error) {
        console.error('Error cargando canales:', error);
        showToast('Error al cargar canales', 'error');
    }
}

function renderTemplateSelect(templates) {
    const select = document.getElementById('templateSelect');
    if (!select) return;

    currentEmbedTemplates = Array.isArray(templates) ? templates : [];

    if (!currentEmbedTemplates.length) {
        select.disabled = true;
        select.innerHTML = '<option value="">No hay plantillas guardadas</option>';
        return;
    }

    select.disabled = false;
    select.innerHTML = '<option value="">Selecciona una plantilla</option>' +
        currentEmbedTemplates.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
}

async function loadEmbedTemplates(guildId) {
    if (!guildId) {
        renderTemplateSelect([]);
        return;
    }

    try {
        const templates = await fetchCachedGetJSON(`/api/embed-templates/${guildId}`, API_CACHE_TTL.templates);
        renderTemplateSelect(templates);
    } catch (error) {
        console.error('Error cargando plantillas:', error);
        renderTemplateSelect([]);
    }
}

// Agregar campo al embed
function addField() {
    const container = document.getElementById('fieldsContainer');
    const fieldId = `field_${Date.now()}`;
    
    const fieldHTML = `
        <div class="field-item" id="${fieldId}">
            <div class="field-item-header">
                <h5>Campo ${container.children.length + 1}</h5>
                <button type="button" class="btn-remove-field" onclick="removeField('${fieldId}')">Eliminar</button>
            </div>
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" class="form-control field-name" placeholder="Nombre del campo" oninput="updateEmbedPreview(); saveState();">
            </div>
            <div class="form-group">
                <label>Valor</label>
                <textarea class="form-control field-value" rows="2" placeholder="Valor del campo" oninput="updateEmbedPreview(); saveState();"></textarea>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" class="field-inline" onchange="updateEmbedPreview(); saveState();"> Inline
                </label>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', fieldHTML);
    updateEmbedPreview();
    updateEmbedStats();
    saveState();
}

// Eliminar campo
function removeField(fieldId) {
    document.getElementById(fieldId).remove();
    updateEmbedPreview();
    updateEmbedStats();
    saveState();
}

function getEmbedPayloadFromForm() {
    const embed = {
        title: document.getElementById('embedTitle').value,
        description: document.getElementById('embedDescription').value,
        color: document.getElementById('embedColor').value.replace('#', ''),
        footer: document.getElementById('embedFooter').value,
        image: document.getElementById('embedImage').value || null,
        thumbnail: document.getElementById('embedThumbnail').value || null,
        timestamp: document.getElementById('embedTimestamp').checked,
        fields: []
    };

    document.querySelectorAll('.field-item').forEach(field => {
        const name = field.querySelector('.field-name').value;
        const value = field.querySelector('.field-value').value;
        const inline = field.querySelector('.field-inline').checked;

        if (name && value) {
            embed.fields.push({ name, value, inline });
        }
    });

    return embed;
}

function applyEmbedToForm(embed = {}) {
    document.getElementById('embedTitle').value = embed.title || '';
    document.getElementById('embedDescription').value = embed.description || '';
    document.getElementById('embedColor').value = embed.color ? `#${embed.color}` : '#C41E3A';
    document.getElementById('embedFooter').value = embed.footer || '';
    document.getElementById('embedImage').value = embed.image || '';
    document.getElementById('embedThumbnail').value = embed.thumbnail || '';
    document.getElementById('embedTimestamp').checked = !!embed.timestamp;

    const container = document.getElementById('fieldsContainer');
    container.innerHTML = '';

    (embed.fields || []).forEach((field, index) => {
        const fieldId = `field_${Date.now()}_${index}`;
        const fieldHTML = `
            <div class="field-item" id="${fieldId}">
                <div class="field-item-header">
                    <h5>Campo ${index + 1}</h5>
                    <button type="button" class="btn-remove-field" onclick="removeField('${fieldId}')">Eliminar</button>
                </div>
                <div class="form-group">
                    <label>Nombre</label>
                    <input type="text" class="form-control field-name" placeholder="Nombre del campo" value="${escapeHtmlForValue(field.name || '')}" oninput="updateEmbedPreview(); saveState();">
                </div>
                <div class="form-group">
                    <label>Valor</label>
                    <textarea class="form-control field-value" rows="2" placeholder="Valor del campo" oninput="updateEmbedPreview(); saveState();">${escapeHtmlForValue(field.value || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" class="field-inline" ${field.inline ? 'checked' : ''} onchange="updateEmbedPreview(); saveState();"> Inline
                    </label>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', fieldHTML);
    });

    updateEmbedPreview();
    updateEmbedStats();
    syncEmbedTextCounters();
    saveState();
}

async function saveEmbedTemplate() {
    const guildId = document.getElementById('guildSelect').value;
    const name = document.getElementById('templateName').value.trim();
    if (!guildId) return showToast('Selecciona un servidor para guardar la plantilla', 'warning');
    if (!name) return showToast('Escribe un nombre para la plantilla', 'warning');

    try {
        const response = await fetchWithCredentials('/api/embed-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId, name, embed: getEmbedPayloadFromForm() })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) return showToast(data.error || 'No se pudo guardar la plantilla', 'error');

        showToast('Plantilla guardada', 'success');
        invalidateGetCache(`/api/embed-templates/${guildId}`);
        await loadEmbedTemplates(guildId);
    } catch (error) {
        console.error('Error guardando plantilla:', error);
        showToast('Error guardando plantilla', 'error');
    }
}

function loadSelectedTemplate() {
    const selected = document.getElementById('templateSelect').value;
    if (!selected) return showToast('Selecciona una plantilla', 'warning');
    const tpl = currentEmbedTemplates.find((t) => t.id === selected);
    if (!tpl) return showToast('Plantilla no encontrada', 'error');
    applyEmbedToForm(tpl.embed || {});
    showToast('Plantilla cargada', 'success');
}

async function deleteSelectedTemplate() {
    const guildId = document.getElementById('guildSelect').value;
    const selected = document.getElementById('templateSelect').value;
    if (!guildId || !selected) return showToast('Selecciona una plantilla para eliminar', 'warning');

    try {
        const response = await fetchWithCredentials(`/api/embed-templates/${guildId}/${selected}`, {
            method: 'DELETE'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return showToast(data.error || 'No se pudo eliminar la plantilla', 'error');
        showToast('Plantilla eliminada', 'success');
        invalidateGetCache(`/api/embed-templates/${guildId}`);
        await loadEmbedTemplates(guildId);
    } catch (error) {
        console.error('Error eliminando plantilla:', error);
        showToast('Error eliminando plantilla', 'error');
    }
}

// Actualizar vista previa del embed
function updateEmbedPreview() {
    const title = document.getElementById('embedTitle').value;
    const description = document.getElementById('embedDescription').value;
    const color = document.getElementById('embedColor').value;
    const footer = document.getElementById('embedFooter').value;
    const image = document.getElementById('embedImage').value;
    const thumbnail = document.getElementById('embedThumbnail').value;
    const imageScale = Number.parseInt(document.getElementById('embedImageScale').value || '100', 10);
    const thumbnailScale = Number.parseInt(document.getElementById('embedThumbnailScale').value || '100', 10);
    const timestamp = document.getElementById('embedTimestamp').checked;

    const imageSource = uploadedImagePreviewUrl || image;
    const thumbSource = uploadedThumbnailPreviewUrl || thumbnail;

    const preview = document.getElementById('embedPreview');
    
    if (!title && !description && !footer) {
        preview.innerHTML = '<div class="embed-placeholder">El embed aparecerá aquí</div>';
        return;
    }

    let fieldsHTML = '';
    document.querySelectorAll('.field-item').forEach(field => {
        const name = field.querySelector('.field-name').value;
        const value = field.querySelector('.field-value').value;
        const inline = field.querySelector('.field-inline').checked;
        
        if (name && value) {
            fieldsHTML += `
                <div class="discord-embed-field" style="display: ${inline ? 'inline-block' : 'block'}; width: ${inline ? '48%' : '100%'};">
                    <div class="discord-embed-field-name">${resolveChannelMentionsPreview(escapeHtml(name))}</div>
                    <div class="discord-embed-field-value">${resolveChannelMentionsPreview(escapeHtml(value))}</div>
                </div>
            `;
        }
    });

    preview.innerHTML = `
        <div class="discord-embed" style="border-left-color: ${color};">
            ${title ? `<div class="discord-embed-title">${resolveChannelMentionsPreview(escapeHtml(title))}</div>` : ''}
            ${description ? `<div class="discord-embed-description">${resolveChannelMentionsPreview(escapeHtml(description))}</div>` : ''}
            ${thumbSource ? `<img src="${thumbSource}" alt="Thumbnail" class="discord-embed-thumbnail" style="float: right; max-width: ${Math.max(30, Math.round(80 * (thumbnailScale / 100)))}px; border-radius: 4px; margin-left: 1rem;">` : ''}
            ${fieldsHTML ? `<div class="discord-embed-fields">${fieldsHTML}</div>` : ''}
            ${imageSource ? `<img src="${imageSource}" alt="Image" class="discord-embed-image" style="max-width: ${imageScale}%;">` : ''}
            ${footer || timestamp ? `<div class="discord-embed-footer">${resolveChannelMentionsPreview(escapeHtml(footer || ''))} ${timestamp ? '• ' + new Date().toLocaleString() : ''}</div>` : ''}
        </div>
    `;
}

function syncEmbedTextCounters() {
    const titleInput = document.getElementById('embedTitle');
    const descInput = document.getElementById('embedDescription');
    const titleCount = document.getElementById('embedTitleCount');
    const descCount = document.getElementById('embedDescriptionCount');

    if (titleInput && titleCount) {
        titleCount.textContent = String((titleInput.value || '').length);
    }
    if (descInput && descCount) {
        descCount.textContent = String((descInput.value || '').length);
    }
}

function clearEmbedComposer({ keepDestination = true, silent = false } = {}) {
    document.getElementById('embedTitle').value = '';
    document.getElementById('embedDescription').value = '';
    document.getElementById('embedFooter').value = '';
    document.getElementById('embedImage').value = '';
    document.getElementById('embedThumbnail').value = '';
    document.getElementById('embedImageFile').value = '';
    document.getElementById('embedThumbnailFile').value = '';
    document.getElementById('embedColor').value = '#C41E3A';
    document.getElementById('embedImageScale').value = '100';
    document.getElementById('embedThumbnailScale').value = '100';
    document.getElementById('embedImageScaleValue').textContent = '100%';
    document.getElementById('embedThumbnailScaleValue').textContent = '100%';
    document.getElementById('embedImageCropX').value = '0';
    document.getElementById('embedImageCropY').value = '0';
    document.getElementById('embedImageCropW').value = '100';
    document.getElementById('embedImageCropH').value = '100';
    document.getElementById('embedThumbnailCropX').value = '0';
    document.getElementById('embedThumbnailCropY').value = '0';
    document.getElementById('embedThumbnailCropW').value = '100';
    document.getElementById('embedThumbnailCropH').value = '100';
    document.getElementById('embedTimestamp').checked = false;
    document.getElementById('fieldsContainer').innerHTML = '';

    if (!keepDestination) {
        const channelSelect = document.getElementById('channelSelect');
        if (channelSelect) channelSelect.value = '';
    }

    if (uploadedImagePreviewUrl) URL.revokeObjectURL(uploadedImagePreviewUrl);
    if (uploadedThumbnailPreviewUrl) URL.revokeObjectURL(uploadedThumbnailPreviewUrl);
    uploadedImageFile = null;
    uploadedImagePreviewUrl = '';
    uploadedThumbnailFile = null;
    uploadedThumbnailPreviewUrl = '';

    syncEmbedTextCounters();
    updateEmbedStats();
    updateEmbedPreview();
    const mid = document.getElementById('embedTargetMessageId');
    if (mid) mid.value = '';
    syncEmbedSendButtonLabel();
    saveState();

    if (!silent) {
        showToast('Editor de embed reiniciado', 'success');
    }
}

function handleImageFileSelection(event, target) {
    const file = event.target.files?.[0] || null;
    if (!file) {
        if (target === 'image') {
            uploadedImageFile = null;
            uploadedImagePreviewUrl = '';
        } else {
            uploadedThumbnailFile = null;
            uploadedThumbnailPreviewUrl = '';
        }
        updateEmbedPreview();
        saveState();
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('Solo puedes subir archivos de imagen', 'warning');
        event.target.value = '';
        return;
    }

    const previewUrl = URL.createObjectURL(file);
    if (target === 'image') {
        uploadedImageFile = file;
        if (uploadedImagePreviewUrl) URL.revokeObjectURL(uploadedImagePreviewUrl);
        uploadedImagePreviewUrl = previewUrl;
    } else {
        uploadedThumbnailFile = file;
        if (uploadedThumbnailPreviewUrl) URL.revokeObjectURL(uploadedThumbnailPreviewUrl);
        uploadedThumbnailPreviewUrl = previewUrl;
    }

    updateEmbedPreview();
    saveState();
}

function loadNukePanel() {
    const targetEl = document.getElementById('nukeGuildTarget');
    const executeBtn = document.getElementById('executeNukeBtn');
    const resultEl = document.getElementById('nukeResult');

    if (resultEl) {
        resultEl.hidden = true;
        resultEl.textContent = '';
    }

    if (!isOwnerUser) {
        if (targetEl) {
            targetEl.textContent = 'Esta acción solo está disponible para el owner del bot.';
        }
        if (executeBtn) executeBtn.disabled = true;
        return;
    }

    if (!hasSelectedGuildContext()) {
        if (targetEl) {
            targetEl.textContent = 'Selecciona un servidor en el dashboard para habilitar esta acción.';
        }
        if (executeBtn) executeBtn.disabled = true;
        return;
    }

    const selectedGuild = currentServerGuilds.find((g) => String(g.id) === String(currentServerGuildId));
    if (targetEl) {
        targetEl.textContent = selectedGuild
            ? `Servidor objetivo: ${selectedGuild.name}`
            : 'Servidor activo no encontrado. Vuelve al dashboard y selecciona un servidor.';
    }
    if (executeBtn) executeBtn.disabled = !selectedGuild;
}

async function executeGuildNukeFromPanel() {
    if (!isOwnerUser) {
        showToast('Esta función está disponible solo para el owner', 'warning');
        return;
    }

    const guildId = String(currentServerGuildId || '').trim();
    if (!guildId) {
        showToast('Selecciona un servidor antes de ejecutar el nuke', 'warning');
        return;
    }

    const selectedGuild = currentServerGuilds.find((g) => String(g.id) === guildId);
    const guildName = selectedGuild?.name || 'este servidor';
    const confirmed = await showAppConfirm({
        title: 'Ejecutar nuke',
        message: `¿Ejecutar nuke en "${guildName}"?\n\nSe eliminarán todos los canales, el servidor pasará a llamarse eyedbot y se crearán canales con la invitación del bot.`,
        confirmLabel: 'Ejecutar nuke',
        variant: 'danger'
    });
    if (!confirmed) return;

    const executeBtn = document.getElementById('executeNukeBtn');
    const resultEl = document.getElementById('nukeResult');
    const defaultLabel = executeBtn?.querySelector('span')?.textContent || 'Ejecutar nuke';

    try {
        if (executeBtn) {
            executeBtn.disabled = true;
            const label = executeBtn.querySelector('span');
            if (label) label.textContent = 'Ejecutando…';
        }
        if (resultEl) {
            resultEl.hidden = true;
            resultEl.textContent = '';
        }

        const response = await fetchWithCredentials(`/api/guild/${encodeURIComponent(guildId)}/nuke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        let data = {};
        const raw = await response.text();
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            data = { error: raw?.slice(0, 200) || 'Respuesta inválida del servidor' };
        }

        if (!response.ok) {
            showToast(data.error || `No se pudo ejecutar el nuke (${response.status})`, 'error');
            return;
        }

        const summary = [
            data.message || 'Nuke completado.',
            `Canales eliminados: ${data.deletedCount ?? 0}.`,
            `Canales EyedBot creados: ${data.createdCount ?? 0}.`,
            data.renamed
                ? `Nombre del servidor actualizado a ${data.serverName || 'eyedbot'}.`
                : 'No se pudo cambiar el nombre del servidor.'
        ];
        if ((data.remainingChannels ?? 0) > 0) {
            summary.push(`Canales que siguen activos: ${data.remainingChannels}. Sube el rol del bot por encima del resto.`);
        }

        if (resultEl) {
            resultEl.textContent = summary.join('\n');
            resultEl.hidden = false;
        }
        showToast('Nuke completado', 'success');
    } catch (error) {
        console.error('Error ejecutando nuke desde el panel:', error);
        showToast('Error al ejecutar nuke', 'error');
    } finally {
        if (executeBtn) {
            executeBtn.disabled = false;
            const label = executeBtn.querySelector('span');
            if (label) label.textContent = defaultLabel;
        }
        loadNukePanel();
    }
}

async function sendOwnerAttachmentToChannel() {
    if (!isOwnerUser) {
        showToast('Esta función está disponible solo para el owner', 'warning');
        return;
    }

    const guildId = document.getElementById('guildSelect')?.value;
    const channelId = document.getElementById('channelSelect')?.value;
    const fileInput = document.getElementById('ownerAttachmentFile');
    const file = fileInput?.files?.[0];

    if (!guildId || !channelId) {
        showToast('Selecciona servidor y canal antes de enviar archivos', 'warning');
        return;
    }
    if (!file) {
        showToast('Selecciona un archivo para enviar', 'warning');
        return;
    }

    const maxSizeBytes = 1024 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
        showToast('El archivo supera el límite de 1 GB', 'warning');
        return;
    }

    const sendBtn = document.getElementById('sendOwnerAttachmentBtn');
    const defaultLabel = sendBtn ? sendBtn.querySelector('span')?.textContent : '';

    try {
        if (sendBtn) {
            sendBtn.disabled = true;
            const label = sendBtn.querySelector('span');
            if (label) label.textContent = 'Enviando…';
        }

        const formData = new FormData();
        formData.append('guildId', guildId);
        formData.append('channelId', channelId);
        formData.append('attachmentFile', file, file.name);

        const response = await fetchWithCredentials('/api/send-owner-attachment', {
            method: 'POST',
            body: formData
        });
        let data = {};
        const raw = await response.text();
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            data = { error: raw?.slice(0, 200) || 'Respuesta inválida del servidor' };
        }

        if (!response.ok) {
            showToast(data.error || `No se pudo enviar el archivo (${response.status})`, 'error');
            return;
        }

        showToast('Archivo enviado correctamente', 'success');
        if (fileInput) fileInput.value = '';
    } catch (error) {
        console.error('Error enviando adjunto owner:', error);
        showToast('Error al enviar archivo', 'error');
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            const label = sendBtn.querySelector('span');
            if (label && defaultLabel) label.textContent = defaultLabel;
        }
    }
}

function getCropSettings(target) {
    if (target === 'thumbnail') {
        return {
            x: Number.parseInt(document.getElementById('embedThumbnailCropX')?.value || '0', 10),
            y: Number.parseInt(document.getElementById('embedThumbnailCropY')?.value || '0', 10),
            w: Number.parseInt(document.getElementById('embedThumbnailCropW')?.value || '100', 10),
            h: Number.parseInt(document.getElementById('embedThumbnailCropH')?.value || '100', 10)
        };
    }

    return {
        x: Number.parseInt(document.getElementById('embedImageCropX')?.value || '0', 10),
        y: Number.parseInt(document.getElementById('embedImageCropY')?.value || '0', 10),
        w: Number.parseInt(document.getElementById('embedImageCropW')?.value || '100', 10),
        h: Number.parseInt(document.getElementById('embedImageCropH')?.value || '100', 10)
    };
}

function resizeImageFile(file, scalePercent = 100, maxSide = 1600, crop = { x: 0, y: 0, w: 100, h: 100 }) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) return resolve(file);

        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const cropX = Math.max(0, Math.min(100, Number(crop?.x) || 0));
                const cropY = Math.max(0, Math.min(100, Number(crop?.y) || 0));
                const cropW = Math.max(1, Math.min(100, Number(crop?.w) || 100));
                const cropH = Math.max(1, Math.min(100, Number(crop?.h) || 100));

                const sx = Math.round((cropX / 100) * img.width);
                const sy = Math.round((cropY / 100) * img.height);
                const maxCropW = img.width - sx;
                const maxCropH = img.height - sy;
                const sw = Math.max(1, Math.min(maxCropW, Math.round((cropW / 100) * img.width)));
                const sh = Math.max(1, Math.min(maxCropH, Math.round((cropH / 100) * img.height)));

                const scale = Math.max(0.25, Math.min(1, scalePercent / 100));
                let width = Math.max(1, Math.round(sw * scale));
                let height = Math.max(1, Math.round(sh * scale));

                const largest = Math.max(width, height);
                if (largest > maxSide) {
                    const ratio = maxSide / largest;
                    width = Math.max(1, Math.round(width * ratio));
                    height = Math.max(1, Math.round(height * ratio));
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (!blob) return resolve(file);
                    resolve(new File([blob], file.name.replace(/\s+/g, '_'), { type: blob.type || 'image/jpeg' }));
                }, file.type && file.type !== 'image/gif' ? file.type : 'image/jpeg', 0.9);
            };
            img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(file);
    });
}

let embedPanelInitialized = false;
function initEmbedPanel() {
    const section = document.getElementById('embedSection');
    if (!section) return;

    if (!embedPanelInitialized) {
        bindDpxTabs(section, { persistTabStorageKey: 'eyedbot:embed:activeTab' });

        if (!isOwnerUser) {
            const tabsNav = section.querySelector('#embedTabs');
            const tabs = tabsNav ? Array.from(tabsNav.querySelectorAll('[data-dpx-tab]')) : [];
            const panels = Array.from(section.querySelectorAll('[data-dpx-panel]'));
            const activeTab = tabs.find((t) => t.classList.contains('is-active'));
            if (activeTab && activeTab.getAttribute('data-dpx-tab') === 'attachments') {
                const fallbackTab = tabs.find((t) => t.getAttribute('data-dpx-tab') === 'content');
                if (fallbackTab) {
                    const key = 'content';
                    tabs.forEach((t) => t.classList.toggle('is-active', t.getAttribute('data-dpx-tab') === key));
                    panels.forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-dpx-panel') === key));
                    try { sessionStorage.setItem('eyedbot:embed:activeTab', key); } catch (_) { /* noop */ }
                }
            }
        }

        const guildSelect = document.getElementById('guildSelect');
        const channelSelect = document.getElementById('channelSelect');
        const templateSelect = document.getElementById('templateSelect');
        const fieldsContainer = document.getElementById('fieldsContainer');

        if (guildSelect) guildSelect.addEventListener('change', updateEmbedStats);
        if (channelSelect) channelSelect.addEventListener('change', updateEmbedStats);
        if (templateSelect) templateSelect.addEventListener('change', updateEmbedStats);

        if (fieldsContainer && 'MutationObserver' in window) {
            const observer = new MutationObserver(() => updateEmbedStats());
            observer.observe(fieldsContainer, { childList: true, subtree: true });
        }

        const imgScale = document.getElementById('embedImageScale');
        const imgScaleVal = document.getElementById('embedImageScaleValue');
        if (imgScale && imgScaleVal) {
            const syncImg = () => { imgScaleVal.textContent = `${imgScale.value}%`; };
            imgScale.addEventListener('input', syncImg);
            syncImg();
        }
        const thumbScale = document.getElementById('embedThumbnailScale');
        const thumbScaleVal = document.getElementById('embedThumbnailScaleValue');
        if (thumbScale && thumbScaleVal) {
            const syncThumb = () => { thumbScaleVal.textContent = `${thumbScale.value}%`; };
            thumbScale.addEventListener('input', syncThumb);
            syncThumb();
        }

        refreshEmbedChannelVarSelects();
        embedPanelInitialized = true;
    }

    syncEmbedTextCounters();
    updateEmbedStats();
}

function updateEmbedStats() {
    const fieldsContainer = document.getElementById('fieldsContainer');
    if (fieldsContainer) {
        const count = fieldsContainer.querySelectorAll('.field-row, .field-entry, [data-embed-field]').length
            || fieldsContainer.children.length;
        const fieldsUsage = document.getElementById('embedFieldsUsage');
        if (fieldsUsage) fieldsUsage.textContent = `${count} / 25 campos`;
    }
}

function syncEmbedSendButtonLabel() {
    const id = document.getElementById('embedTargetMessageId')?.value?.trim();
    const label = document.getElementById('sendEmbedBtnLabel');
    if (label) label.textContent = id ? 'Actualizar mensaje' : 'Enviar embed';
}

// Enviar embed
async function sendEmbed() {
    const guildId = document.getElementById('guildSelect').value;
    const channelId = document.getElementById('channelSelect').value;

    if (!guildId || !channelId) {
        showToast('Por favor selecciona un servidor y un canal', 'warning');
        return;
    }

    const embed = getEmbedPayloadFromForm();
    const imageScale = Number.parseInt(document.getElementById('embedImageScale').value || '100', 10);
    const thumbnailScale = Number.parseInt(document.getElementById('embedThumbnailScale').value || '100', 10);

    try {
        const formData = new FormData();
        formData.append('guildId', guildId);
        formData.append('channelId', channelId);

        const targetMessageId = document.getElementById('embedTargetMessageId')?.value?.trim() || '';
        if (targetMessageId) {
            formData.append('messageId', targetMessageId);
        }

        if (uploadedImageFile) {
            const resizedMain = await resizeImageFile(uploadedImageFile, imageScale, 1600, getCropSettings('image'));
            const imageName = `embed_image_${Date.now()}.${(resizedMain.name.split('.').pop() || 'jpg').toLowerCase()}`;
            formData.append('imageFile', resizedMain, imageName);
            embed.image = `attachment://${imageName}`;
        }

        if (uploadedThumbnailFile) {
            const resizedThumb = await resizeImageFile(uploadedThumbnailFile, thumbnailScale, 512, getCropSettings('thumbnail'));
            const thumbName = `embed_thumb_${Date.now()}.${(resizedThumb.name.split('.').pop() || 'jpg').toLowerCase()}`;
            formData.append('thumbnailFile', resizedThumb, thumbName);
            embed.thumbnail = `attachment://${thumbName}`;
        }

        formData.append('embed', JSON.stringify(embed));

        const response = await fetchWithCredentials('/api/send-embed', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            showToast(data.updated ? 'Mensaje actualizado en Discord' : 'Embed enviado correctamente', 'success');
            clearEmbedComposer({ keepDestination: true, silent: true });
        } else {
            showToast(data.error || 'Error al enviar embed', 'error');
        }
    } catch (error) {
        console.error('Error enviando embed:', error);
        showToast('Error al enviar embed', 'error');
    }
}

// Cargar estadísticas
async function loadStats() {
    const ownerPanel = document.getElementById('ownerAnalyticsPanel');
    if (!isOwnerUser) {
        if (ownerPanel) ownerPanel.style.display = 'none';
        return;
    }

    try {
        const response = await fetchWithCredentials('/api/stats');
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'Error al cargar estadísticas');
        }

        const stats = await response.json();
        document.getElementById('statGuilds').textContent = stats.guilds || 0;
        document.getElementById('statUsers').textContent = stats.users || 0;
        document.getElementById('statChannels').textContent = stats.channels || 0;
        document.getElementById('statPing').textContent = Number.isFinite(stats.ping) && stats.ping >= 0 ? stats.ping : '--';
        document.getElementById('statCommands').textContent = stats.commands || 0;

        const uptime = stats.uptime || 0;
        const days = Math.floor(uptime / 86400000);
        const hours = Math.floor((uptime % 86400000) / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        document.getElementById('statUptime').textContent = `${days}d ${hours}h ${minutes}m`;

        if (stats.memory) {
            const systemInfo = document.getElementById('systemInfo');
            systemInfo.innerHTML = `
                <div class="system-info-card">
                    <h4>Memoria</h4>
                    <div class="system-info-item">
                        <span class="system-info-label">Heap Usado</span>
                        <span class="system-info-value">${(stats.memory.heapUsed / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <div class="system-info-item">
                        <span class="system-info-label">Heap Total</span>
                        <span class="system-info-value">${(stats.memory.heapTotal / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                    <div class="system-info-item">
                        <span class="system-info-label">RSS</span>
                        <span class="system-info-value">${(stats.memory.rss / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                </div>
                <div class="system-info-card">
                    <h4>Sistema</h4>
                    <div class="system-info-item">
                        <span class="system-info-label">Node.js</span>
                        <span class="system-info-value">${stats.nodeVersion || 'N/A'}</span>
                    </div>
                    <div class="system-info-item">
                        <span class="system-info-label">Plataforma</span>
                        <span class="system-info-value">${stats.platform || 'N/A'}</span>
                    </div>
                </div>
            `;
        }

        await loadOwnerLoginRegistry();
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
        showToast(error.message || 'Error cargando estadísticas', 'error');
    }
}

// Cargar logs
let autoScroll = true;
let logsEventSource = null;
let logsInterval = null;
let logsListenersSetup = false;

async function loadLogs() {
    if (!isOwnerUser) {
        const container = document.getElementById('logsContainer');
        if (container) {
            container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p>Los logs solo estan disponibles para el creador del bot.</p></div>';
        }
        return;
    }

    const container = document.getElementById('logsContainer');
    
    try {
        container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando logs...</p></div>';
        
        const response = await fetchWithCredentials('/api/logs?limit=100');
        if (response.ok) {
            const logs = await response.json();
            if (logs && logs.length > 0) {
                displayLogs(logs);
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p>No hay logs disponibles aún</p></div>';
            }
        } else {
            const error = await response.json().catch(() => ({ error: 'Error al cargar logs' }));
            container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>${error.error || 'Error al cargar logs'}</p></div>`;
        }
        
        // Configurar auto-scroll
        container.scrollTop = container.scrollHeight;
        
        // Event listeners (solo una vez)
        if (!logsListenersSetup) {
            logsListenersSetup = true;
            
            document.getElementById('logLevelFilter').addEventListener('change', async (e) => {
                const level = e.target.value;
                const response = await fetchWithCredentials(`/api/logs?limit=100${level ? '&level=' + level : ''}`);
                if (response.ok) {
                    const logs = await response.json();
                    displayLogs(logs || []);
                }
                saveState();
            });
            
            document.getElementById('clearLogsBtn').addEventListener('click', () => {
                container.innerHTML = '';
                saveState();
            });
            
            document.getElementById('autoScrollBtn').addEventListener('click', () => {
                autoScroll = !autoScroll;
                document.getElementById('autoScrollText').textContent = `Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`;
                saveState();
            });
        }
        
        // Limpiar intervalo anterior si existe
        if (logsInterval) {
            clearInterval(logsInterval);
        }
        
        // DESHABILITADO: No actualizar logs automáticamente
        // logsInterval = setInterval(async () => {
        //     const level = document.getElementById('logLevelFilter').value;
        //     const response = await fetchWithCredentials(`/api/logs?limit=100${level ? '&level=' + level : ''}`);
        //     if (response.ok) {
        //         const logs = await response.json();
        //         if (logs && logs.length > 0) {
        //             displayLogs(logs);
        //             if (autoScroll) {
        //                 container.scrollTop = container.scrollHeight;
        //             }
        //         }
        //     }
        // }, 2000);
    } catch (error) {
        console.error('Error cargando logs:', error);
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>Error al cargar logs: ${error.message}</p></div>`;
    }
}

async function loadOwnerLoginRegistry() {
    if (!isOwnerUser) return;

    const panel = document.getElementById('ownerAnalyticsPanel');
    const summary = document.getElementById('ownerAnalyticsSummary');
    const tableBody = document.getElementById('ownerAnalyticsRows');

    if (!panel || !summary || !tableBody) return;

    try {
        const response = await fetchWithCredentials('/api/admin/login-registry');
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'No se pudo cargar el registro global');
        }

        const payload = await response.json();
        const dataSummary = payload.summary || {};
        const users = Array.isArray(payload.users) ? payload.users : [];

        panel.style.display = 'block';
        summary.innerHTML = `
            <div class="owner-analytics-pill"><strong>${dataSummary.totalLogins || 0}</strong><span>Inicios de sesión</span></div>
            <div class="owner-analytics-pill"><strong>${dataSummary.uniqueUsers || 0}</strong><span>Usuarios únicos</span></div>
            <div class="owner-analytics-pill"><strong>${dataSummary.uniqueGuildsSeen || 0}</strong><span>Servidores únicos</span></div>
        `;

        if (users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5">Sin registros por el momento.</td></tr>';
            return;
        }

        tableBody.innerHTML = users.map((entry) => {
            const safeUserId = String(entry.userId || '').replace(/[^a-zA-Z0-9_-]/g, '');
            const name = escapeHtml(entry.globalName || entry.username || 'Usuario');
            const username = escapeHtml(entry.username || 'usuario');
            const profileText = `${name} (@${username})`;
            const lastSeen = entry.lastLoginAt ? new Date(entry.lastLoginAt).toLocaleString('es-ES') : 'N/A';
            const avatarUrl = entry.avatar
                ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(entry.userId || '')}/${encodeURIComponent(entry.avatar)}.png?size=96`
                : `https://cdn.discordapp.com/embed/avatars/${(Number(entry.userId) || 0) % 5}.png`;

            const serverPreview = (entry.guilds || []).length
                ? (entry.guilds || []).map((g) => {
                    const icon = g.iconUrl
                        ? `<img src="${escapeHtml(g.iconUrl)}" alt="${escapeHtml(g.name || 'Servidor')}" class="owner-server-preview-icon">`
                        : `<div class="owner-server-preview-icon owner-server-preview-icon--fallback">${escapeHtml(String(g.name || 'S').charAt(0).toUpperCase())}</div>`;

                    return `
                        <article class="owner-server-preview-card">
                            <div class="owner-server-preview-head">
                                ${icon}
                                <div>
                                    <div class="owner-server-preview-name">${escapeHtml(g.name || 'Servidor')}</div>
                                    <div class="owner-server-preview-meta">ID • ${escapeHtml(g.idSuffix || '----')}</div>
                                </div>
                            </div>
                        </article>
                    `;
                }).join('')
                : '<div class="owner-server-preview-empty">Sin servidores administrables con bot.</div>';

            return `
                <tr>
                    <td>
                        <button type="button" class="owner-analytics-profile-btn" data-owner-user-id="${safeUserId}" aria-expanded="false">
                            ${profileText}
                        </button>
                    </td>
                    <td>${entry.loginCount || 0}</td>
                    <td>${entry.guildCount || 0}</td>
                    <td>${(entry.guilds || []).length}</td>
                    <td>${lastSeen}</td>
                </tr>
                <tr class="owner-analytics-detail-row" data-owner-detail-row="${safeUserId}" hidden>
                    <td colspan="5">
                        <div class="owner-user-preview">
                            <div class="owner-user-preview-profile">
                                <img src="${avatarUrl}" alt="${profileText}" class="owner-user-preview-avatar">
                                <div>
                                    <div class="owner-user-preview-name">${profileText}</div>
                                    <div class="owner-user-preview-meta">Servidor(es) administrable(s) con bot: ${(entry.guilds || []).length}</div>
                                </div>
                            </div>
                            <div class="owner-server-preview-grid">
                                ${serverPreview}
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        if (!tableBody.dataset.ownerRegistryBound) {
            tableBody.dataset.ownerRegistryBound = '1';
            tableBody.addEventListener('click', (event) => {
                const target = event.target;
                if (!(target instanceof Element)) return;
                const btn = target.closest('.owner-analytics-profile-btn');
                if (!(btn instanceof HTMLElement)) return;

                const userId = String(btn.dataset.ownerUserId || '').trim();
                if (!userId) return;

                const row = tableBody.querySelector(`tr[data-owner-detail-row="${userId}"]`);
                if (!(row instanceof HTMLTableRowElement)) return;

                const expanded = !row.hasAttribute('hidden');
                if (expanded) {
                    row.setAttribute('hidden', 'hidden');
                    btn.setAttribute('aria-expanded', 'false');
                } else {
                    row.removeAttribute('hidden');
                    btn.setAttribute('aria-expanded', 'true');
                }
            });
        }
    } catch (error) {
        panel.style.display = 'block';
        summary.innerHTML = '<div class="owner-analytics-pill"><span>No se pudo cargar el registro global.</span></div>';
        tableBody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message || 'Error inesperado')}</td></tr>`;
    }
}

function displayLogs(logs) {
    const container = document.getElementById('logsContainer');
    if (!logs || logs.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);"><p>No hay logs disponibles</p></div>';
        return;
    }
    
    container.innerHTML = logs.map(log => {
        const date = new Date(log.timestamp);
        const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const level = log.level || 'info';
        const levelColors = {
            'info': 'var(--fate-gold)',
            'warn': 'var(--warning-color)',
            'error': 'var(--error-color)'
        };
        
        return `
            <div class="log-entry" style="padding: 0.5rem 0; border-bottom: 1px dashed rgba(255,255,255,0.1); display: flex; gap: 1rem; align-items: flex-start;">
                <span style="color: var(--text-muted); min-width: 100px; font-size: 0.85rem;">[${timeStr}]</span>
                <span style="color: ${levelColors[level] || 'var(--text-secondary)'}; font-weight: 600; min-width: 60px; text-transform: uppercase; font-size: 0.85rem;">${level}</span>
                <span style="color: var(--text-secondary); flex-grow: 1; word-break: break-word; font-family: 'Fira Code', monospace; font-size: 0.9rem;">${escapeHtml(log.message || 'Sin mensaje')}</span>
            </div>
        `;
    }).join('');
    
    // Auto-scroll si está habilitado
    if (autoScroll) {
        container.scrollTop = container.scrollHeight;
    }
}

// Cargar comandos
async function loadCommands() {
    const container = document.getElementById('commandsContainer');
    if (!container) return;
    
    try {
        container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando comandos...</p></div>';
        
        const response = await fetchWithCredentials('/api/commands');
        if (response.ok) {
            const commands = await response.json();
            commandsCatalog = Array.isArray(commands) ? commands : [];
            commandsFilterQuery = '';
            commandsFilterCategory = 'all';

            const searchInput = document.getElementById('commandsSearchInput');
            if (searchInput) searchInput.value = '';

            buildCommandsCategoryFilters(commandsCatalog);
            renderFilteredCommands();
        } else {
            const error = await response.json().catch(() => ({ error: 'Error al cargar comandos' }));
            container.innerHTML = `<div class="commands-empty commands-empty--error"><p>${escapeHtml(error.error || 'Error al cargar comandos')}</p></div>`;
        }
    } catch (error) {
        console.error('Error cargando comandos:', error);
        container.innerHTML = `<div class="commands-empty commands-empty--error"><p>Error al cargar comandos: ${escapeHtml(error.message || 'Error inesperado')}</p></div>`;
    }
}

function displayCommands(commands, meta = {}) {
    const container = document.getElementById('commandsContainer');
    const totalCommands = Number(meta.total) || commandsCatalog.length || 0;
    const isAllCategories = commandsFilterCategory === 'all';

    updateCommandsSummary(commands?.length || 0, totalCommands);
    container.className = `commands-catalog${isAllCategories ? ' commands-catalog--all' : ''}`;

    if (!commands || commands.length === 0) {
        const message = totalCommands > 0
            ? 'No hay resultados para ese filtro.'
            : 'No hay comandos disponibles en este momento.';
        container.innerHTML = `<div class="commands-empty"><p>${message}</p></div>`;
        return;
    }
    
    const categories = {};
    commands.forEach((cmd) => {
        const category = getCommandCategoryKey(cmd.category);
        if (!categories[category]) categories[category] = [];
        categories[category].push(cmd);
    });
    
    const sortedCategories = Object.entries(categories).sort(([left], [right]) => {
        return getCommandCategoryLabel(left).localeCompare(getCommandCategoryLabel(right), 'es');
    });

    container.innerHTML = sortedCategories.map(([category, cmds]) => {
        const tone = getCommandCategoryTone(category);
        const categoryLabel = getCommandCategoryLabel(category);
        const categoryIcon = getCommandCategoryIcon(category);
        const commandCards = cmds.map((cmd) => {
            const options = Array.isArray(cmd.options) ? cmd.options : [];
            const optionCountLabel = options.length
                ? `${options.length} opción${options.length === 1 ? '' : 'es'}`
                : 'Sin opciones';
            const optionsMarkup = options.length > 0
                ? `<div class="command-catalog-options">${options.map((opt) => {
                    const requiredBadge = opt.required ? '<span class="command-catalog-option-required">Requerida</span>' : '';
                    return `<div class="command-catalog-option"><div class="command-catalog-option-top"><strong>${escapeHtml(opt.name || 'opción')}</strong>${requiredBadge}</div><span>${escapeHtml(opt.description || 'Sin descripción')}</span></div>`;
                }).join('')}</div>`
                : '';
            return `<article class="command-catalog-card"><div class="command-catalog-head"><code class="command-catalog-name">/${escapeHtml(cmd.name || 'comando')}</code><span class="command-catalog-option-count">${optionCountLabel}</span></div><p class="command-catalog-desc">${escapeHtml(cmd.description || 'Sin descripción')}</p>${optionsMarkup}</article>`;
        }).join('');

        return `<section class="commands-category-block commands-category-block--${tone}"><header class="commands-category-head"><span class="commands-category-icon" aria-hidden="true">${categoryIcon}</span><div class="commands-category-copy"><h3>${categoryLabel}</h3><p>${cmds.length} comando${cmds.length === 1 ? '' : 's'} en esta categoría</p></div><span class="commands-category-count">${cmds.length}</span></header><div class="commands-category-list">${commandCards}</div></section>`;
    }).join('');
}

// Cargar servidores para sección de servidor

function renderServerTabs(guilds, selectedGuildId = '') {
    const tabsContainer = document.getElementById('serverTabs');
    if (!tabsContainer) return;

    if (!Array.isArray(guilds) || !guilds.length) {
        tabsContainer.innerHTML = '<div class="server-tabs-empty">No hay servidores disponibles</div>';
        return;
    }

    tabsContainer.innerHTML = guilds.map((guild) => {
        const isActive = String(guild.id) === String(selectedGuildId);
        return `
            <button type="button" class="server-tab-btn ${isActive ? 'active' : ''}" data-guild-id="${guild.id}" disabled>
                ${guild.icon ? `<img class="server-tab-icon" src="${guild.icon}" alt="${escapeHtml(guild.name)}">` : '<div class="server-tab-icon server-tab-icon-placeholder">#</div>'}
                <span class="server-tab-name">${escapeHtml(guild.name)}</span>
            </button>
        `;
    }).join('');
}

async function selectServerGuild(guildId, options = {}) {
    const serverInfoContainer = document.getElementById('serverInfoContainer');
    const moderationContainer = document.getElementById('moderationContainer');
    const welcomeContainer = document.getElementById('welcomeContainer');
    const verifyContainer = document.getElementById('verifyContainer');
    const ticketContainer = document.getElementById('ticketContainer');
    const levelsContainer = document.getElementById('levelsContainer');
    const voiceCreatorContainer = document.getElementById('voiceCreatorContainer');
    const automationContainer = document.getElementById('automationContainer');
    const securityContainer = document.getElementById('securityContainer');
    const notificationsContainer = document.getElementById('notificationsContainer');
    const gachaContainer = document.getElementById('gachaContainer');
    const channelSetupContainer = document.getElementById('channelSetupContainer');
    const serverSelect = document.getElementById('serverSelect');
    const { preserveInsight = false } = options;

    if (!guildId) {
        currentServerGuildId = '';
        setServerFeaturesNavigationVisible(serverFeaturesUnlocked && hasSelectedGuildContext());
        if (serverSelect) serverSelect.value = '';
        renderServerTabs(currentServerGuilds, '');
        if (serverInfoContainer) serverInfoContainer.innerHTML = '';
        if (moderationContainer) moderationContainer.innerHTML = '';
        if (welcomeContainer) welcomeContainer.innerHTML = '';
        if (verifyContainer) verifyContainer.innerHTML = '';
        if (ticketContainer) ticketContainer.innerHTML = '';
        if (levelsContainer) levelsContainer.innerHTML = '';
        if (voiceCreatorContainer) voiceCreatorContainer.innerHTML = '';
        if (automationContainer) automationContainer.innerHTML = '';
        if (securityContainer) securityContainer.innerHTML = '';
        if (notificationsContainer) notificationsContainer.innerHTML = '';
        if (gachaContainer) gachaContainer.innerHTML = '';
        if (channelSetupContainer) channelSetupContainer.innerHTML = '';
        saveState();
        return;
    }

    setServerSwitchingState(true);
    currentServerGuildId = guildId;
    if (!preserveInsight) {
        currentServerInsightView = 'overview';
        currentServerInsightPayload = null;
    }
    setServerFeaturesNavigationVisible(serverFeaturesUnlocked && hasSelectedGuildContext());
    updateServerMenuIdentity();
    if (serverSelect) serverSelect.value = guildId;
    renderServerTabs(currentServerGuilds, guildId);

    if (serverInfoContainer) {
        serverInfoContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando información...</p></div>';
    }
    if (moderationContainer) moderationContainer.innerHTML = '';
    if (welcomeContainer) {
        welcomeContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando sistema de bienvenida...</p></div>';
    }
    if (verifyContainer) {
        verifyContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando sistema de verificación...</p></div>';
    }
    if (ticketContainer) {
        ticketContainer.innerHTML = `
            <div class="dpx-panel">
                <div class="dpx-section">
                    <h4>Tickets (movido)</h4>
                    <p>La configuración y gestión de tickets se ha movido a la pantalla "Gestión de tickets". Aquí solo se muestra un acceso rápido.</p>
                    <div style="margin-top:1rem;display:flex;gap:0.5rem;">
                        <button class="btn btn-primary" id="openTicketsManageQuickBtn">Abrir Gestión de tickets</button>
                        <button class="btn btn-secondary" id="openTicketsManageNewTabBtn">Abrir en pestaña</button>
                    </div>
                </div>
            </div>`;
        setTimeout(() => {
            const b = document.getElementById('openTicketsManageQuickBtn');
            if (b && !b._wired) { b._wired = true; b.addEventListener('click', () => openTicketsManagePane()); }
            const b2 = document.getElementById('openTicketsManageNewTabBtn');
            if (b2 && !b2._wired) { b2._wired = true; b2.addEventListener('click', () => { window.location.hash = 'tickets-manage'; openTicketsManagePane(); }); }
        }, 50);
    }
    if (levelsContainer) {
        levelsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando sistema de niveles...</p></div>';
    }
    if (voiceCreatorContainer) {
        voiceCreatorContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando canales de voz temporales...</p></div>';
    }
    if (automationContainer) {
        automationContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando opciones de automatización...</p></div>';
    }
    if (securityContainer) {
        securityContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando opciones de seguridad...</p></div>';
    }
    if (notificationsContainer) {
        notificationsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando notificaciones...</p></div>';
    }
    if (gachaContainer) {
        gachaContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando sistema gacha...</p></div>';
    }

    try {
        const loadTasks = [
            loadServerInfo(guildId),
            loadServerMembers(guildId),
            loadWelcomePanel(guildId),
            loadVerifyPanel(guildId),
            loadLevelsPanel(guildId),
            loadVoiceCreatorPanel(guildId),
            loadAutomationPanel(guildId),
            loadNotificationsPanel(guildId)
        ];
        if (hasPremiumAccess()) {
            loadTasks.push(loadSecurityPanel(guildId), loadGachaPanel(guildId));
        } else {
            injectPremiumPreview('serverPaneSecurity');
            injectPremiumPreview('serverPaneGacha');
            injectPremiumPreview('serverPaneFreeGames');
            syncPremiumPaneLock('serverPaneSecurity');
            syncPremiumPaneLock('serverPaneGacha');
            syncPremiumPaneLock('serverPaneFreeGames');
        }
        await Promise.all(loadTasks);
        refreshPremiumLocks();
        if (isPremiumPane(currentServerPaneId) && hasPremiumAccess()) {
            loadPremiumPaneData(currentServerPaneId, guildId);
        }
        saveState();
    } finally {
        setServerSwitchingState(false);
    }
}

async function loadGuildsForServer() {
    if (loadGuildsForServerPromise) {
        return loadGuildsForServerPromise;
    }
    loadGuildsForServerPromise = (async () => {
    try {
        const select = document.getElementById('serverSelect');
        const tabsContainer = document.getElementById('serverTabs');
        const serverInfoContainer = document.getElementById('serverInfoContainer');
        const moderationContainer = document.getElementById('moderationContainer');
        const welcomeContainer = document.getElementById('welcomeContainer');
        const verifyContainer = document.getElementById('verifyContainer');
        const ticketContainer = document.getElementById('ticketContainer');
        const levelsContainer = document.getElementById('levelsContainer');
        const voiceCreatorContainer = document.getElementById('voiceCreatorContainer');
        const automationContainer = document.getElementById('automationContainer');
        const securityContainer = document.getElementById('securityContainer');
        const notificationsContainer = document.getElementById('notificationsContainer');
        const gachaContainer = document.getElementById('gachaContainer');
        const channelSetupContainer = document.getElementById('channelSetupContainer');
        
        // Limpiar contenedores
        if (serverInfoContainer) serverInfoContainer.innerHTML = '';
        if (moderationContainer) moderationContainer.innerHTML = '';
        if (welcomeContainer) welcomeContainer.innerHTML = '';
        if (verifyContainer) verifyContainer.innerHTML = '';
        if (ticketContainer) ticketContainer.innerHTML = '';
        if (levelsContainer) levelsContainer.innerHTML = '';
        if (voiceCreatorContainer) voiceCreatorContainer.innerHTML = '';
        if (automationContainer) automationContainer.innerHTML = '';
        if (securityContainer) securityContainer.innerHTML = '';
        if (notificationsContainer) notificationsContainer.innerHTML = '';
        if (gachaContainer) gachaContainer.innerHTML = '';
        if (tabsContainer) tabsContainer.innerHTML = '';
        
        if (!hasSelectedGuildContext()) {
            if (select) {
                select.disabled = true;
                select.innerHTML = '<option value="">Selecciona un servidor desde el Dashboard</option>';
            }
            return;
        }

        const response = await fetchWithCredentials('/api/guilds');
        if (response.ok) {
            const guilds = await response.json();
            currentServerGuilds = Array.isArray(guilds) ? guilds : [];
            updateServerMenuIdentity();

            const selectedGuild = guilds.find((g) => String(g.id) === String(currentServerGuildId));
            if (!selectedGuild) {
                const staleGuildId = String(currentServerGuildId || '').trim();
                resetServerContextToDashboard();
                if (select) {
                    select.disabled = true;
                    select.innerHTML = '<option value="">Servidor seleccionado no disponible</option>';
                }
                if (staleGuildId) {
                    showToast('El servidor guardado ya no está disponible para esta sesión. Selecciona otro desde Dashboard.', 'warning');
                }
                return;
            }

            if (select) {
                select.disabled = true;
                select.innerHTML = `<option value="${selectedGuild.id}">${escapeHtml(selectedGuild.name)}</option>`;
                select.value = selectedGuild.id;
            }
            if (tabsContainer) {
                renderServerTabs([selectedGuild], selectedGuild.id);
            }
            await selectServerGuild(selectedGuild.id, { preserveInsight: true });
        } else {
            const error = await response.json().catch(() => ({ error: 'Error al cargar servidores' }));
            if (select) {
                select.innerHTML = '<option value="">Error al cargar servidores</option>';
            }
            showToast(error.error || 'Error al cargar servidores', 'error');
        }
    } catch (error) {
        console.error('Error cargando servidores:', error);
        showToast('Error al cargar servidores', 'error');
    } finally {
        loadGuildsForServerPromise = null;
    }
    })();
    return loadGuildsForServerPromise;
}

function collectPanelValues(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return {};
    const values = {};
    container.querySelectorAll('[data-pref-key]').forEach((el) => {
        const key = el.getAttribute('data-pref-key');
        if (!key) return;
        if (el.type === 'checkbox') {
            values[key] = !!el.checked;
        } else if (el.tagName === 'SELECT' && el.multiple) {
            values[key] = Array.from(el.selectedOptions || []).map((opt) => opt.value);
        } else {
            values[key] = el.value;
        }
    });
    return values;
}

// ====== Generic dashboard panel UI helpers (dpx-*) ======

function panelTabStorageKey(panelId, guildId) {
    return `eyedbot:panel-tab:${String(panelId)}:${String(guildId || '')}`;
}

function readPanelStoredTab(panelId, guildId, fallback, validKeys = null) {
    try {
        const stored = sessionStorage.getItem(panelTabStorageKey(panelId, guildId));
        if (!stored) return fallback;
        if (validKeys) {
            const allowed = validKeys instanceof Set ? validKeys : new Set(validKeys);
            if (!allowed.has(stored)) return fallback;
        }
        return stored;
    } catch (_) {
        return fallback;
    }
}

function bindDpxTabs(container, options = {}) {
    if (!container) return;
    const tabs = Array.from(container.querySelectorAll('[data-dpx-tab]'));
    const panels = Array.from(container.querySelectorAll('[data-dpx-panel]'));
    if (!tabs.length || !panels.length) return;

    const onTabActivate = typeof options.onTabActivate === 'function' ? options.onTabActivate : null;
    const persistTabStorageKey = typeof options.persistTabStorageKey === 'string' && options.persistTabStorageKey.trim()
        ? options.persistTabStorageKey.trim()
        : null;

    const tabKeys = new Set(tabs.map((t) => t.getAttribute('data-dpx-tab')).filter(Boolean));

    const activate = (key) => {
        if (!key || !tabKeys.has(key)) return;
        tabs.forEach((t) => t.classList.toggle('is-active', t.getAttribute('data-dpx-tab') === key));
        panels.forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-dpx-panel') === key));
        if (persistTabStorageKey) {
            try {
                sessionStorage.setItem(persistTabStorageKey, key);
            } catch (_) { /* noop */ }
        }
        if (onTabActivate) {
            try { onTabActivate(key, container); } catch (e) { console.error('bindDpxTabs onTabActivate', e); }
        }
    };

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => activate(tab.getAttribute('data-dpx-tab')));
    });

    let storedKey = null;
    if (persistTabStorageKey) {
        try {
            const stored = sessionStorage.getItem(persistTabStorageKey);
            if (stored && tabKeys.has(stored)) storedKey = stored;
        } catch (_) { /* noop */ }
    }

    const domActive = tabs.find((t) => t.classList.contains('is-active'));
    const domKey = domActive ? domActive.getAttribute('data-dpx-tab') : null;

    if (storedKey) {
        activate(storedKey);
    } else if (domKey && tabKeys.has(domKey)) {
        panels.forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-dpx-panel') === domKey));
    } else {
        activate(tabs[0].getAttribute('data-dpx-tab'));
    }
}

/** Pestañas Canales / Configuración en Directos. */
function bindStreamDirectosViewTabs(rootEl, guildId) {
    if (!rootEl) return;
    const tabs = Array.from(rootEl.querySelectorAll('[data-stream-view]'));
    const panels = Array.from(rootEl.querySelectorAll('[data-stream-view-panel]'));
    if (!tabs.length || !panels.length) return;

    const storageKey = panelTabStorageKey('notifications-stream', guildId);
    const tabKeys = new Set(tabs.map((t) => t.getAttribute('data-stream-view')).filter(Boolean));

    const activate = (key) => {
        if (!key || !tabKeys.has(key)) return;
        tabs.forEach((t) => t.classList.toggle('is-active', t.getAttribute('data-stream-view') === key));
        panels.forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-stream-view-panel') === key));
        try {
            sessionStorage.setItem(storageKey, key);
        } catch (_) { /* noop */ }
    };

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => activate(tab.getAttribute('data-stream-view')));
    });

    const storedKey = readPanelStoredTab('notifications-stream', guildId, null, tabKeys);
    if (storedKey) activate(storedKey);
    else if (!tabs.some((t) => t.classList.contains('is-active'))) activate('channels');
}

function dpxIcon(name = '', className = 'dpx-icon') {
    const paths = {
        gear: '<circle cx="10" cy="10" r="3"/><path d="M10 1v3M10 16v3M4.22 4.22l2.12 2.12M13.66 13.66l2.12 2.12M1 10h3M16 10h3M4.22 15.78l2.12-2.12M13.66 6.34l2.12-2.12"/>',
        shield: '<path d="M10 2l6 2.5v5c0 4-2.8 7.5-6 8.5-3.2-1-6-4.5-6-8.5v-5L10 2z"/>',
        book: '<path d="M4 3h9a2 2 0 012 2v12H5a1 1 0 01-1-1V3zM4 17a2 2 0 002 2h9"/>',
        bell: '<path d="M6 9a4 4 0 118 0c0 3.5 1.5 5 1.5 5h-11S6 12.5 6 9z"/><path d="M8.5 17a1.5 1.5 0 003 0"/>',
        calendar: '<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/>',
        bolt: '<path d="M11 2L4 11h5l-1 7 7-9h-5l1-7z"/>',
        chat: '<path d="M4 4h12a2 2 0 012 2v7a2 2 0 01-2 2H9l-4 3v-3H4a2 2 0 01-2-2V6a2 2 0 012-2z"/>',
        check: '<path d="M4 10l4 4 8-9"/>',
        palette: '<path d="M10 2a8 8 0 00-1 16c1.5 0 2-.7 2-1.5 0-.5-.2-.8-.5-1.1-.4-.4-.4-1 0-1.4.3-.3.7-.4 1.3-.4h1A3.7 3.7 0 0018 9.8 8 8 0 0010 2z"/><circle cx="6" cy="9" r=".9"/><circle cx="9" cy="5" r=".9"/><circle cx="13" cy="5" r=".9"/><circle cx="15" cy="9" r=".9"/>',
        image: '<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><circle cx="7.5" cy="8" r="1.5"/><path d="M2.5 13.5L7 10l4 4 3-2 3.5 3"/>',
        ban: '<circle cx="10" cy="10" r="7.5"/><path d="M4.7 4.7l10.6 10.6"/>',
        sparkles: '<path d="M10 2v4M10 14v4M2 10h4M14 10h4M4.8 4.8l2.5 2.5M12.7 12.7l2.5 2.5M4.8 15.2l2.5-2.5M12.7 7.3l2.5-2.5"/>',
        layout: '<rect x="3" y="3" width="6.5" height="14" rx="1.2"/><rect x="11.5" y="3" width="6.5" height="9" rx="1.2"/><path d="M11.5 13.5h6.5"/><path d="M11.5 17h6.5"/>',
        broadcast: '<circle cx="10" cy="10" r="2.5"/><path d="M5.7 5.7a6 6 0 000 8.6M14.3 14.3a6 6 0 000-8.6M2.8 2.8a10 10 0 000 14.4M17.2 17.2a10 10 0 000-14.4"/>',
        antenna: '<path d="M10 11v8M6 19h8M10 3v5"/><circle cx="10" cy="8" r="1.5"/><path d="M5 7.5A6 6 0 0110 3.5M15 7.5A6 6 0 0010 3.5"/>',
        leaf: '<path d="M3 17c0-8 5-13 14-13 0 9-5 14-13 14L3 17zM7 17L13 9"/>',
        sword: '<path d="M14 2l4 4-8 8M10 14l-4-4M5 13l2 2M14 2l-8 8M4 16l4-4"/><path d="M3 17l2-2 1 1-2 2H3z"/>',
        info: '<circle cx="10" cy="10" r="7.5"/><path d="M10 9v4.5M10 6.2v.5"/>',
        close: '<path d="M4 4l12 12M16 4L4 16"/>',
        edit: '<path d="M12.5 3.5l4 4-8 8-4-4 8-8z"/>',
        check: '<path d="M4 10l4 4 8-8"/>',
        twitch: '<path d="M4 3l-1 4v10h3v3h3l3-3h3l4-4V3H4zm3 2h10v8l-3 3h-3l-3 3v-3H7V5z"/><path d="M10 7v5M13 7v5"/>',
        youtube: '<rect x="2.5" y="4.5" width="15" height="11" rx="3"/><path d="M8.5 8l4 2.2-4 2.1z" fill="currentColor" stroke="none"/>',
        tiktok: '<path d="M13 3v8.5a3.5 3.5 0 11-3.5-3.5"/><path d="M13 3c.5 2 2 3.5 4 3.5"/>',
        rss: '<path d="M4 4a12 12 0 0112 12M4 10a6 6 0 016 6"/><circle cx="5" cy="15" r="1.5"/>',
        mic: '<rect x="7.5" y="3" width="5" height="9" rx="2.5"/><path d="M4 9a6 6 0 0012 0M10 15v3M7 18h6"/>',
        plus: '<path d="M10 4v12M4 10h12"/>',
        search: '<circle cx="9" cy="9" r="5"/><path d="M13 13l4 4"/>',
        trash: '<path d="M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11"/>',
        clock: '<circle cx="10" cy="10" r="7.5"/><path d="M10 6v4l3 2"/>',
        send: '<path d="M17 3L3 10l5 2 2 5L17 3zM9 11l4-4"/>',
        filter: '<path d="M3 4h14l-5 7v5l-4-2v-3L3 4z"/>',
        users: '<circle cx="7" cy="8" r="3"/><path d="M2 17a5 5 0 0110 0M14 7.5a2.5 2.5 0 110 5M13 17a5 5 0 016-5"/>',
        eye: '<path d="M2 10s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z"/><circle cx="10" cy="10" r="2.5"/>',
        radio: '<rect x="2" y="6" width="16" height="10" rx="2"/><circle cx="13" cy="11" r="2"/><path d="M6 10h3M6 13h3M4 6l10-3"/>',
        sprout: '<path d="M10 17v-6M10 11c0-3 2-5 5-5-.5 3-2 5-5 5zM10 11c0-3-2-5-5-5 .5 3 2 5 5 5z"/>',
        voice: '<path d="M5 8v4a5 5 0 0010 0V8"/><path d="M10 17v2M7 19h6"/><rect x="7.5" y="3" width="5" height="9" rx="2.5"/>',
        door: '<rect x="4.5" y="2.5" width="11" height="15" rx="1"/><circle cx="12" cy="10" r=".8" fill="currentColor" stroke="none"/>'
    };
    const path = paths[name];
    if (!path) return '';
    return `<svg class="${className}" viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

function dpxRenderToggle({ id, checked = false, title = '', description = '', dataPrefKey = '' } = {}) {
    const idAttr = id ? `id="${id}"` : '';
    const prefAttr = dataPrefKey ? `data-pref-key="${dataPrefKey}"` : '';
    return `
        <label class="dpx-toggle">
            <input type="checkbox" ${idAttr} ${prefAttr} ${checked ? 'checked' : ''}>
            <span class="dpx-toggle-switch"></span>
            <span class="dpx-toggle-info">
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(description)}</span>
            </span>
        </label>
    `;
}

function levelsRenderMainTabs(activeKey = 'config') {
    const tabs = [
        { key: 'config', label: 'Configuración', icon: 'gear' },
        { key: 'curve', label: 'Progresión', icon: 'bolt' },
        { key: 'rewards', label: 'Recompensas', icon: 'sparkles' },
        { key: 'leaderboard', label: 'Leaderboard', icon: 'users' }
    ];
    const active = tabs.some((t) => t.key === activeKey) ? activeKey : tabs[0].key;
    return `
        <nav class="dpx-tabs levels-main-tabs" role="tablist">
            ${tabs.map((tab) => `
                <button type="button" class="dpx-tab ${tab.key === active ? 'is-active' : ''}" data-levels-tab="${escapeHtml(tab.key)}" role="tab">
                    ${dpxIcon(tab.icon, 'dpx-tab-icon')}
                    <span>${escapeHtml(tab.label)}</span>
                </button>
            `).join('')}
        </nav>
    `;
}

function dpxRenderHero({ title = '', description = '', actionsHtml = '', accent = '#ff78d1', glow1 = 'rgba(124,77,255,0.18)', glow2 = 'rgba(255,120,209,0.18)' } = {}) {
    const styleAttr = `style="--dpx-hero-accent:${accent};--dpx-hero-glow-1:${glow1};--dpx-hero-glow-2:${glow2};"`;
    return `
        <header class="dpx-hero" ${styleAttr}>
            <div class="dpx-hero-main">
                <div class="dpx-hero-text">
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(description)}</p>
                </div>
            </div>
            <div class="dpx-hero-actions">${actionsHtml}</div>
        </header>
    `;
}

function dpxRenderTabs(tabs, activeKey) {
    if (!Array.isArray(tabs) || !tabs.length) return '';
    const activeKeyEffective = activeKey || tabs[0].key;
    return `
        <nav class="dpx-tabs" role="tablist">
            ${tabs.map((tab) => {
                const iconHtml = tab.iconName ? dpxIcon(tab.iconName, 'dpx-tab-icon') : '';
                return `
                <button type="button" class="dpx-tab ${tab.key === activeKeyEffective ? 'is-active' : ''}" data-dpx-tab="${escapeHtml(tab.key)}" role="tab">
                    ${iconHtml}
                    <span>${escapeHtml(tab.label)}</span>
                </button>`;
            }).join('')}
        </nav>
    `;
}

function dpxRenderStatCard({ label = '', value = '', hint = '', accent = '', accent2 = '' } = {}) {
    const styleAttr = (accent || accent2)
        ? `style="--dpx-stat-accent:${accent || 'var(--iris-400)'};--dpx-stat-accent-2:${accent2 || 'var(--fuchsia)'};"`
        : '';
    return `
        <div class="dpx-stat-card" ${styleAttr}>
            <span class="dpx-stat-label">${escapeHtml(label)}</span>
            <span class="dpx-stat-value">${value}</span>
            ${hint ? `<span class="dpx-stat-hint">${hint}</span>` : ''}
        </div>
    `;
}

async function loadVoiceCreatorPanel(guildId) {
    const container = document.getElementById('voiceCreatorContainer');
    if (!container) return;

    try {
        const [channelsResponse, configResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/temp-voice-config`)
        ]);

        if (!channelsResponse.ok || !configResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar el sistema de voz temporal.</div>';
            return;
        }

        const channels = await channelsResponse.json();
        const config = await configResponse.json();

        const voiceChannels = (Array.isArray(channels) ? channels : []).filter((c) => c.type === 2);
        const categories = (Array.isArray(channels) ? channels : []).filter((c) => c.type === 4);

        const enabled = config.enabled === true;
        const userLimitVal = Math.max(0, Number.parseInt(config.userLimit || 0, 10) || 0);
        const creatorChannelName = (voiceChannels.find((c) => String(c.id) === String(config.creatorChannelId)) || {}).name || '—';
        const categoryName = (categories.find((c) => String(c.id) === String(config.categoryId)) || {}).name || 'Igual que el creador';

        const heroHtml = dpxRenderHero({
            kicker: 'Voz dinámica',
            title: 'Canales de Voz Temporales',
            description: 'Al entrar al canal creador, el bot genera un canal de voz personal y lo elimina automáticamente cuando queda vacío.',
            accent: '#ff78d1',
            iconName: 'mic',
            actionsHtml: `
                <span class="dpx-status-chip ${enabled ? 'is-on' : 'is-off'}"><span class="dot"></span>${enabled ? 'Activo' : 'Desactivado'}</span>
                <button type="button" id="saveTempVoiceBtn" class="btn btn-primary">Guardar cambios</button>
            `
        });

        const statsHtml = `
            <div class="dpx-stats-grid">
                ${dpxRenderStatCard({ label: 'Estado', value: `<span class="dpx-stat-pill ${enabled ? 'is-on' : 'is-off'}">${enabled ? 'Activo' : 'Inactivo'}</span>`, hint: enabled ? 'Sistema operativo' : 'Activa el toggle para empezar' })}
                ${dpxRenderStatCard({ label: 'Canal creador', value: escapeHtml(creatorChannelName), hint: 'Voz que dispara la creación', accent: '#7c4dff' })}
                ${dpxRenderStatCard({ label: 'Categoría destino', value: escapeHtml(categoryName), hint: 'Donde aparecen los canales creados', accent: '#9a6dff' })}
                ${dpxRenderStatCard({ label: 'Límite de usuarios', value: userLimitVal === 0 ? 'Sin límite' : `${userLimitVal} pers.`, hint: 'Cupo por canal generado', accent: '#ff78d1', accent2: '#ffb778' })}
            </div>
        `;

        const tabsHtml = dpxRenderTabs([
            { key: 'config', label: 'Configuración', iconName: 'gear' },
            { key: 'rules', label: 'Reglas', iconName: 'shield' },
            { key: 'guide', label: 'Guía & comandos', iconName: 'book' }
        ], 'config');

        container.innerHTML = `
            <div class="dpx-panel">
                ${heroHtml}
                ${statsHtml}
                ${tabsHtml}

                <section class="dpx-tab-panel is-active" data-dpx-panel="config">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Canales y categorías</h4>
                                <p>Selecciona el canal de voz que actuará como creador y donde aparecerán los canales generados.</p>
                            </div>
                        </div>
                        <div class="dpx-field-grid">
                            <div class="dpx-field">
                                <label for="tempVoiceCreatorChannel">Canal creador (voz)</label>
                                <select id="tempVoiceCreatorChannel" class="form-control">
                                    <option value="">Selecciona un canal de voz</option>
                                    ${voiceChannels.map((c) => `<option value="${c.id}" ${String(config.creatorChannelId || '') === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                                </select>
                                <small>Cuando alguien entre aquí se generará su canal personal.</small>
                            </div>
                            <div class="dpx-field">
                                <label for="tempVoiceCategory">Categoría destino</label>
                                <select id="tempVoiceCategory" class="form-control">
                                    <option value="">Usar la del canal creador</option>
                                    ${categories.map((c) => `<option value="${c.id}" ${String(config.categoryId || '') === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                                </select>
                                <small>Si lo dejas vacío se usa la misma categoría del creador.</small>
                            </div>
                        </div>
                    </div>

                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Personalización</h4>
                                <p>Define el formato del nombre y los límites por defecto.</p>
                            </div>
                        </div>
                        <div class="dpx-field-grid">
                            <div class="dpx-field">
                                <label for="tempVoiceTemplate">Formato del nombre</label>
                                <input type="text" id="tempVoiceTemplate" class="form-control" value="${escapeHtmlForValue(config.channelNameTemplate || 'Canal de {username}')}" placeholder="Canal de {username}">
                                <small>Variables: <code>{username}</code>, <code>{displayName}</code></small>
                            </div>
                            <div class="dpx-field">
                                <label for="tempVoiceUserLimit">Límite por canal (0 = sin límite)</label>
                                <input type="number" min="0" max="99" id="tempVoiceUserLimit" class="form-control" value="${userLimitVal}">
                                <small>Cupo máximo por canal generado (0 a 99).</small>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel" data-dpx-panel="rules">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Reglas y permisos</h4>
                                <p>Activa o desactiva el sistema y decide qué pueden hacer los usuarios.</p>
                            </div>
                        </div>
                        <div class="dpx-toggle-grid">
                            ${dpxRenderToggle({ id: 'tempVoiceEnabled', checked: enabled, title: 'Activar sistema de voz temporal', description: 'Habilita la creación automática de canales personales.' })}
                            ${dpxRenderToggle({ id: 'tempVoiceAllowCustomNames', checked: config.allowCustomNames !== false, title: 'Nombres personalizados', description: 'Los usuarios pueden cambiar el nombre con /voznombre.' })}
                            ${dpxRenderToggle({ id: 'tempVoiceSendManageEmbed', checked: config.sendManageEmbed === true, title: 'Panel de Voz', description: 'Envía el embed de control (EyedBot + foto del usuario) dentro del canal de voz temporal.' })}
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel" data-dpx-panel="guide">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Cómo lo usan los usuarios</h4>
                                <p>Comparte estos pasos con tu comunidad para sacar el máximo provecho.</p>
                            </div>
                        </div>
                        <div class="dpx-field-grid is-wide">
                            <div class="dpx-tip">${dpxIcon('door')}<div><strong>Entrar:</strong>&nbsp;Al unirse al canal creador se genera el canal personal.</div></div>
                            <div class="dpx-tip">${dpxIcon('voice')}<div><strong>Usar:</strong>&nbsp;Los miembros hablan libremente en su canal.</div></div>
                            <div class="dpx-tip">${dpxIcon('trash')}<div><strong>Cierre:</strong>&nbsp;Cuando queda vacío, el canal se elimina solo.</div></div>
                        </div>
                        <div class="dpx-field-grid is-wide" style="margin-top:1rem;">
                            <div class="dpx-tip">${dpxIcon('gear')}<div><strong>Renombrar:</strong>&nbsp;<code>/voznombre nombre:&lt;tu nombre&gt;</code></div></div>
                            <div class="dpx-tip">${dpxIcon('shield')}<div><strong>Privado/Público:</strong>&nbsp;<code>/vozprivado activar:true|false</code></div></div>
                            <div class="dpx-tip">${dpxIcon('users')}<div><strong>Invitar:</strong>&nbsp;<code>/vozinvitar usuario:@alguien</code></div></div>
                            <div class="dpx-tip">${dpxIcon('close')}<div><strong>Quitar:</strong>&nbsp;<code>/vozquitar usuario:@alguien</code></div></div>
                        </div>
                    </div>
                </section>
            </div>
        `;

        bindDpxTabs(container, { persistTabStorageKey: panelTabStorageKey('voice-creator', guildId) });

        const saveBtn = document.getElementById('saveTempVoiceBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const payload = {
                    enabled: document.getElementById('tempVoiceEnabled')?.checked ?? false,
                    allowCustomNames: document.getElementById('tempVoiceAllowCustomNames')?.checked ?? true,
                    sendManageEmbed: document.getElementById('tempVoiceSendManageEmbed')?.checked ?? false,
                    creatorChannelId: document.getElementById('tempVoiceCreatorChannel')?.value || '',
                    categoryId: document.getElementById('tempVoiceCategory')?.value || '',
                    channelNameTemplate: document.getElementById('tempVoiceTemplate')?.value || 'Canal de {username}',
                    userLimit: Math.max(0, Math.min(99, Number.parseInt(document.getElementById('tempVoiceUserLimit')?.value || '0', 10) || 0))
                };

                if (!payload.creatorChannelId) {
                    showToast('Selecciona el canal creador de voz', 'warning');
                    return;
                }

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/temp-voice-config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo guardar el sistema de voz temporal', 'error');
                        return;
                    }
                    showToast('Sistema de voz temporal guardado', 'success');
                    await loadVoiceCreatorPanel(guildId);
                } catch (error) {
                    console.error('Error guardando voz temporal:', error);
                    showToast('Error guardando voz temporal', 'error');
                }
            });
        }
    } catch (error) {
        console.error('Error cargando sistema de voz temporal:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando sistema de voz temporal.</div>';
    }
}

async function loadAutomationPanel(guildId) {
    const container = document.getElementById('automationContainer');
    if (!container) return;

    const defaults = {
        antiSpamEnabled: true,
        spamMessages: '6',
        spamWindow: '10',
        antiLinksEnabled: true,
        antiCapsEnabled: false,
        antiInvitesEnabled: true,
        antiFloodAttachments: false,
        maxMentions: '5',
        raidMode: 'balanced',
        punishmentMode: 'mute'
    };
    const prefs = getServerPreference(guildId, 'automation', defaults);

    const filtersActive = ['antiSpamEnabled', 'antiLinksEnabled', 'antiCapsEnabled', 'antiInvitesEnabled', 'antiFloodAttachments'].filter((k) => prefs[k]).length;
    const raidProfileLabels = { soft: 'Suave', balanced: 'Equilibrado', strict: 'Estricto' };
    const punishLabels = { warn: 'Advertir', mute: 'Silenciar', kick: 'Expulsar' };

    const heroHtml = dpxRenderHero({
        kicker: 'Automatización',
        title: 'Centro de Automatización',
        description: 'Reglas contra spam, enlaces, mayúsculas, invitaciones y modo anti-raid para reaccionar sin que tu equipo tenga que estar 24/7 al chat.',
        accent: '#ffb778',
        glow1: 'rgba(255,183,120,0.18)',
        glow2: 'rgba(124,77,255,0.22)',
        iconName: 'gear',
        actionsHtml: `
            <span class="dpx-status-chip ${prefs.antiSpamEnabled ? 'is-on' : 'is-off'}"><span class="dot"></span>${filtersActive} filtros activos</span>
            <button type="button" class="btn btn-primary" id="saveAutomationBtn">Guardar filtros</button>
        `
    });

    const statsHtml = `
        <div class="dpx-stats-grid">
            ${dpxRenderStatCard({ label: 'Filtros activos', value: `${filtersActive}<span class="dpx-stat-pill">/ 5</span>`, hint: 'Anti-spam, links, caps, invites, flood', accent: '#7c4dff' })}
            ${dpxRenderStatCard({ label: 'Modo anti-raid', value: raidProfileLabels[prefs.raidMode] || 'Equilibrado', hint: `Acción: ${punishLabels[prefs.punishmentMode] || 'Silenciar'}`, accent: '#ff9c9c' })}
            ${dpxRenderStatCard({ label: 'Directos y fuentes', value: 'Notif.', hint: 'Configúralos en Notificaciones → Directos', accent: '#9a6dff' })}
        </div>
    `;

    const tabsHtml = dpxRenderTabs([
        { key: 'antispam', label: 'Anti-spam', iconName: 'ban' },
        { key: 'content', label: 'Contenido', iconName: 'sparkles' },
        { key: 'raid', label: 'Modo anti-raid', iconName: 'shield' },
        { key: 'channelsetup', label: 'Generador de canales', iconName: 'layout' }
    ], 'antispam');

    container.innerHTML = `
        <div class="dpx-panel">
            ${heroHtml}
            ${statsHtml}
            ${tabsHtml}

            <section class="dpx-tab-panel is-active" data-dpx-panel="antispam">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Anti-spam</h4>
                            <p>Detecta y silencia usuarios que envían mensajes en ráfaga.</p>
                        </div>
                    </div>
                    <div class="dpx-toggle-grid">
                        ${dpxRenderToggle({ dataPrefKey: 'antiSpamEnabled', checked: !!prefs.antiSpamEnabled, title: 'Activar anti-spam', description: 'Filtra mensajes repetitivos en ventana corta.' })}
                    </div>
                    <div class="dpx-field-grid" style="margin-top:1rem;">
                        <div class="dpx-field">
                            <label for="autoSpamMessages">Mensajes límite</label>
                            <input type="number" min="3" max="20" class="form-control" id="autoSpamMessages" data-pref-key="spamMessages" value="${escapeHtmlForValue(prefs.spamMessages)}">
                            <small>Cantidad de mensajes en la ventana antes de penalizar.</small>
                        </div>
                        <div class="dpx-field">
                            <label for="autoSpamWindow">Ventana (segundos)</label>
                            <input type="number" min="3" max="60" class="form-control" id="autoSpamWindow" data-pref-key="spamWindow" value="${escapeHtmlForValue(prefs.spamWindow)}">
                            <small>Segundos contados para evaluar el ritmo.</small>
                        </div>
                    </div>
                </div>
            </section>

            <section class="dpx-tab-panel" data-dpx-panel="content">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Filtros de contenido</h4>
                            <p>Bloquea links, mayúsculas, invitaciones externas y abuso de adjuntos.</p>
                        </div>
                    </div>
                    <div class="dpx-toggle-grid">
                        ${dpxRenderToggle({ dataPrefKey: 'antiLinksEnabled', checked: !!prefs.antiLinksEnabled, title: 'Bloquear enlaces sospechosos', description: 'Acortadores y dominios maliciosos conocidos.' })}
                        ${dpxRenderToggle({ dataPrefKey: 'antiCapsEnabled', checked: !!prefs.antiCapsEnabled, title: 'Bloquear exceso de mayúsculas', description: 'Mensajes con porcentaje alto de CAPS.' })}
                        ${dpxRenderToggle({ dataPrefKey: 'antiInvitesEnabled', checked: !!prefs.antiInvitesEnabled, title: 'Bloquear invitaciones externas', description: 'Elimina links discord.gg/.com de otros servers.' })}
                        ${dpxRenderToggle({ dataPrefKey: 'antiFloodAttachments', checked: !!prefs.antiFloodAttachments, title: 'Limitar flood de adjuntos', description: 'Bloquea ráfagas de imágenes/videos.' })}
                    </div>
                    <div class="dpx-field-grid" style="margin-top:1rem;">
                        <div class="dpx-field">
                            <label for="autoMaxMentions">Máximo menciones por mensaje</label>
                            <input type="number" min="1" max="25" class="form-control" id="autoMaxMentions" data-pref-key="maxMentions" value="${escapeHtmlForValue(prefs.maxMentions)}">
                            <small>Mensajes que excedan esta cifra serán bloqueados.</small>
                        </div>
                    </div>
                </div>
            </section>

            <section class="dpx-tab-panel" data-dpx-panel="raid">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Modo anti-raid rápido</h4>
                            <p>Aplica un perfil predefinido y ajusta la acción automática que se aplicará a infractores.</p>
                        </div>
                    </div>
                    <div class="dpx-chip-row" style="margin-bottom:0.85rem;">
                        <button type="button" class="dpx-chip" id="presetSoftAutomationBtn">${dpxIcon('leaf')} Preset Suave</button>
                        <button type="button" class="dpx-chip" id="presetStrictAutomationBtn">${dpxIcon('sword')} Preset Estricto</button>
                    </div>
                    <div class="dpx-field-grid">
                        <div class="dpx-field">
                            <label for="autoRaidMode">Perfil</label>
                            <select class="form-control" id="autoRaidMode" data-pref-key="raidMode">
                                <option value="soft" ${prefs.raidMode === 'soft' ? 'selected' : ''}>Suave</option>
                                <option value="balanced" ${prefs.raidMode === 'balanced' ? 'selected' : ''}>Equilibrado</option>
                                <option value="strict" ${prefs.raidMode === 'strict' ? 'selected' : ''}>Estricto</option>
                            </select>
                            <small>Influye en la sensibilidad global del sistema.</small>
                        </div>
                        <div class="dpx-field">
                            <label for="autoPunishmentMode">Acción automática</label>
                            <select class="form-control" id="autoPunishmentMode" data-pref-key="punishmentMode">
                                <option value="warn" ${prefs.punishmentMode === 'warn' ? 'selected' : ''}>Advertir</option>
                                <option value="mute" ${prefs.punishmentMode === 'mute' ? 'selected' : ''}>Silenciar</option>
                                <option value="kick" ${prefs.punishmentMode === 'kick' ? 'selected' : ''}>Expulsar</option>
                            </select>
                            <small>Aplicada a usuarios detectados por los filtros.</small>
                        </div>
                    </div>
                </div>
            </section>

            <section class="dpx-tab-panel" data-dpx-panel="channelsetup">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Generador de canales</h4>
                            <p>Crea categorías y canales de texto y voz con plantillas. Ideal para servidores nuevos. El bot necesita permiso de gestionar canales; no borra canales existentes.</p>
                        </div>
                    </div>
                    <div id="channelSetupContainer" class="moderation-container"></div>
                </div>
            </section>
        </div>
    `;

    bindDpxTabs(container, {
        persistTabStorageKey: panelTabStorageKey('automation', guildId),
        onTabActivate: (key) => {
            if (key === 'channelsetup') {
                void openChannelSetupPane();
            }
        }
    });

    const presetSoftBtn = document.getElementById('presetSoftAutomationBtn');
    const presetStrictBtn = document.getElementById('presetStrictAutomationBtn');
    if (presetSoftBtn) {
        presetSoftBtn.addEventListener('click', () => {
            const softPreset = {
                antiSpamEnabled: true,
                spamMessages: '8',
                spamWindow: '12',
                antiLinksEnabled: false,
                antiCapsEnabled: false,
                antiInvitesEnabled: true,
                antiFloodAttachments: false,
                maxMentions: '8',
                raidMode: 'soft',
                punishmentMode: 'warn'
            };
            setServerPreference(guildId, 'automation', softPreset);
            showToast('Preset suave aplicado', 'success');
            loadAutomationPanel(guildId);
        });
    }
    if (presetStrictBtn) {
        presetStrictBtn.addEventListener('click', () => {
            const strictPreset = {
                antiSpamEnabled: true,
                spamMessages: '4',
                spamWindow: '8',
                antiLinksEnabled: true,
                antiCapsEnabled: true,
                antiInvitesEnabled: true,
                antiFloodAttachments: true,
                maxMentions: '3',
                raidMode: 'strict',
                punishmentMode: 'mute'
            };
            setServerPreference(guildId, 'automation', strictPreset);
            showToast('Preset estricto aplicado', 'success');
            loadAutomationPanel(guildId);
        });
    }

    const saveBtn = document.getElementById('saveAutomationBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const values = collectPanelValues('automationContainer');
            setServerPreference(guildId, 'automation', values);
            showToast('Opciones de automatizacion guardadas', 'success');
        });
    }
}

async function loadSecurityPanel(guildId) {
    const container = document.getElementById('securityContainer');
    if (!container) return;

    if (!hasPremiumAccess()) {
        enforceAllPremiumLocks();
        return;
    }

    try {
        const [infoResponse, channelsResponse, configResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/info`),
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/anti-raid-config`)
        ]);

        if (!infoResponse.ok || !channelsResponse.ok || !configResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar la configuración anti-raid.</div>';
            return;
        }

        const info = await infoResponse.json();
        const cfg = await configResponse.json();
        const channels = (await channelsResponse.json()).filter((c) => c.type === 0);
        const roles = (Array.isArray(info?.roles) ? info.roles : []).filter((r) => r && r.id && r.name && r.name !== '@everyone');
        const verificationLevel = String(info?.verificationLevel ?? 'unknown');
        const trustedSet = new Set(Array.isArray(cfg.trustedRoleIds) ? cfg.trustedRoleIds.map(String) : []);

        const enabled = cfg.enabled !== false;
        const actionMode = cfg.actionMode || 'timeout';
        const alertChannelName = (channels.find((c) => String(c.id) === String(cfg.alertChannelId)) || {}).name || '—';
        const trustedRoleNames = roles.filter((r) => trustedSet.has(String(r.id))).slice(0, 8);
        const trustedCount = roles.filter((r) => trustedSet.has(String(r.id))).length;

        const heroHtml = dpxRenderHero({
            kicker: 'Moderación · Anti-Raid',
            title: 'Centro de seguridad',
            description: 'Protege tu servidor contra spam, raids masivos de joins y cambios destructivos de canales o roles en segundos.',
            accent: '#ff9c9c',
            glow1: 'rgba(255,99,99,0.18)',
            glow2: 'rgba(124,77,255,0.22)',
            iconName: 'shield',
            actionsHtml: `
                <span class="dpx-status-chip ${enabled ? 'is-on' : 'is-off'}"><span class="dot"></span>${enabled ? 'Protegido' : 'Sin protección'}</span>
                <button type="button" id="saveAntiRaidBtn" class="btn btn-primary">Guardar cambios</button>
            `
        });

        const actionLabels = { timeout: 'Timeout', kick: 'Expulsar', ban: 'Banear' };
        const statsHtml = `
            <div class="dpx-stats-grid">
                ${dpxRenderStatCard({ label: 'Estado anti-raid', value: `<span class="dpx-stat-pill ${enabled ? 'is-on' : 'is-off'}">${enabled ? 'Activo' : 'Inactivo'}</span>`, hint: enabled ? 'Vigilando entradas y mensajes' : 'Activa el sistema para empezar', accent: '#7ef0b4', accent2: '#7c4dff' })}
                ${dpxRenderStatCard({ label: 'Acción automática', value: actionLabels[actionMode] || 'Timeout', hint: actionMode === 'timeout' ? `${Math.max(1, Number.parseInt(cfg.timeoutMinutes || 30, 10) || 30)} min` : 'Aplicada al detectar abuso', accent: '#ff78d1' })}
                ${dpxRenderStatCard({ label: 'Verificación Discord', value: escapeHtml(verificationLevel), hint: 'Nivel nativo del servidor', accent: '#9a6dff' })}
                ${dpxRenderStatCard({ label: 'Roles confiables', value: `${trustedCount}`, hint: trustedCount ? 'Exentos del anti-raid' : 'Sin roles configurados', accent: '#7c4dff', accent2: '#ff78d1' })}
                ${dpxRenderStatCard({ label: 'Canal de alertas', value: cfg.alertChannelId ? `# ${escapeHtml(alertChannelName)}` : 'Sin canal', hint: cfg.alertChannelId ? 'Reportes en vivo' : 'No se enviarán alertas', accent: '#ff9c9c' })}
            </div>
        `;

        const tabsHtml = dpxRenderTabs([
            { key: 'state', label: 'Estado y acción', iconName: 'bolt' },
            { key: 'messages', label: 'Mensajes', iconName: 'chat' },
            { key: 'entry', label: 'Entrada y destrucción', iconName: 'shield' },
            { key: 'trusted', label: 'Roles confiables', iconName: 'check' }
        ], 'state');

        const trustedChipsHtml = trustedRoleNames.length
            ? `<div class="dpx-role-chip-list">${trustedRoleNames.map((r) => `<span class="dpx-role-chip"><span class="role-dot" style="--role-color:#9a6dff;"></span>${escapeHtml(r.name)}</span>`).join('')}</div>`
            : '<small style="color:var(--text-muted); display:block; margin-top:0.5rem;">Selecciona roles abajo para excluirlos del anti-raid.</small>';

        container.innerHTML = `
            <div class="dpx-panel">
                ${heroHtml}
                ${statsHtml}
                ${tabsHtml}

                <section class="dpx-tab-panel is-active" data-dpx-panel="state">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Estado y acción</h4>
                                <p>Activa el sistema, define la acción automática y dónde recibir las alertas.</p>
                            </div>
                        </div>
                        <div class="dpx-toggle-grid">
                            ${dpxRenderToggle({ id: 'antiRaidEnabled', checked: enabled, title: 'Activar anti-raid', description: 'Habilita la vigilancia continua y reacciones automáticas.' })}
                        </div>
                        <div class="dpx-field-grid" style="margin-top:1rem;">
                            <div class="dpx-field">
                                <label for="antiRaidActionMode">Acción automática</label>
                                <select id="antiRaidActionMode" class="form-control">
                                    <option value="timeout" ${actionMode === 'timeout' ? 'selected' : ''}>Timeout</option>
                                    <option value="kick" ${actionMode === 'kick' ? 'selected' : ''}>Kick</option>
                                    <option value="ban" ${actionMode === 'ban' ? 'selected' : ''}>Ban</option>
                                </select>
                                <small>Acción aplicada al detectar abuso por usuario.</small>
                            </div>
                            <div class="dpx-field">
                                <label for="antiRaidTimeoutMinutes">Minutos de timeout</label>
                                <input type="number" min="1" max="40320" id="antiRaidTimeoutMinutes" class="form-control" value="${Math.max(1, Number.parseInt(cfg.timeoutMinutes || 30, 10) || 30)}">
                                <small>Solo se aplica si la acción es Timeout.</small>
                            </div>
                            <div class="dpx-field is-full">
                                <label for="antiRaidAlertChannelId">Canal de alertas</label>
                                <select id="antiRaidAlertChannelId" class="form-control">
                                    <option value="">Sin alertas</option>
                                    ${channels.map((c) => `<option value="${c.id}" ${String(cfg.alertChannelId || '') === String(c.id) ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                                </select>
                                <small>El bot reportará aquí cada incidente y acción tomada.</small>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel" data-dpx-panel="messages">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Protección de mensajes</h4>
                                <p>Filtra spam, invitaciones, enlaces sospechosos y abuso de menciones.</p>
                            </div>
                        </div>
                        <div class="dpx-toggle-grid">
                            ${dpxRenderToggle({ id: 'antiRaidSpamEnabled', checked: cfg.antiSpamEnabled !== false, title: 'Anti-spam', description: 'Detecta usuarios que envían mensajes en ráfaga.' })}
                            ${dpxRenderToggle({ id: 'antiRaidBlockInvites', checked: cfg.blockInvites !== false, title: 'Bloquear invitaciones', description: 'Elimina mensajes con invitaciones a otros servidores.' })}
                            ${dpxRenderToggle({ id: 'antiRaidBlockLinks', checked: cfg.blockLinks === true, title: 'Bloquear enlaces sospechosos', description: 'Filtra acortadores y dominios maliciosos conocidos.' })}
                        </div>
                        <div class="dpx-field-grid" style="margin-top:1rem;">
                            <div class="dpx-field">
                                <label for="antiRaidSpamMessages">Mensajes límite</label>
                                <input type="number" min="3" max="40" id="antiRaidSpamMessages" class="form-control" value="${Math.max(3, Number.parseInt(cfg.spamMessages || 7, 10) || 7)}">
                                <small>Cuántos mensajes en la ventana antes de aplicar la acción.</small>
                            </div>
                            <div class="dpx-field">
                                <label for="antiRaidSpamWindowSec">Ventana (segundos)</label>
                                <input type="number" min="3" max="120" id="antiRaidSpamWindowSec" class="form-control" value="${Math.max(3, Number.parseInt(cfg.spamWindowSec || 8, 10) || 8)}">
                                <small>Segundos contados para evaluar el ritmo.</small>
                            </div>
                            <div class="dpx-field">
                                <label for="antiRaidMaxMentions">Máx. menciones por mensaje</label>
                                <input type="number" min="1" max="50" id="antiRaidMaxMentions" class="form-control" value="${Math.max(1, Number.parseInt(cfg.maxMentions || 6, 10) || 6)}">
                                <small>Mensajes con más menciones se bloquean.</small>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel" data-dpx-panel="entry">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Entrada y acciones destructivas</h4>
                                <p>Detecta oleadas de joins y cambios masivos en canales o roles.</p>
                            </div>
                        </div>
                        <div class="dpx-tip">${dpxIcon('info')}<div>Verificación Discord actual: <strong>${escapeHtml(verificationLevel)}</strong>. Sube este nivel desde Discord si recibes raids constantes.</div></div>
                        <div class="dpx-field-grid" style="margin-top:1rem;">
                            <div class="dpx-field">
                                <label for="antiRaidJoinRateThreshold">Joins por minuto (umbral raid)</label>
                                <input type="number" min="2" max="60" id="antiRaidJoinRateThreshold" class="form-control" value="${Math.max(2, Number.parseInt(cfg.joinRateThreshold || 8, 10) || 8)}">
                                <small>Si entran más miembros por minuto se activa modo raid.</small>
                            </div>
                            <div class="dpx-field">
                                <label for="antiRaidAccountAgeDays">Edad mínima de cuenta (días)</label>
                                <input type="number" min="0" max="365" id="antiRaidAccountAgeDays" class="form-control" value="${Math.max(0, Number.parseInt(cfg.accountAgeDays || 3, 10) || 3)}">
                                <small>Cuentas más nuevas serán filtradas en modo raid.</small>
                            </div>
                            <div class="dpx-field">
                                <label for="antiRaidDestructiveActionThreshold">Acciones destructivas permitidas</label>
                                <input type="number" min="1" max="30" id="antiRaidDestructiveActionThreshold" class="form-control" value="${Math.max(1, Number.parseInt(cfg.destructiveActionThreshold || 3, 10) || 3)}">
                                <small>Antes de bloquear cambios masivos.</small>
                            </div>
                            <div class="dpx-field">
                                <label for="antiRaidActionWindowSec">Ventana (segundos)</label>
                                <input type="number" min="10" max="300" id="antiRaidActionWindowSec" class="form-control" value="${Math.max(10, Number.parseInt(cfg.actionWindowSec || 60, 10) || 60)}">
                                <small>Lapso para contar acciones destructivas.</small>
                            </div>
                        </div>
                        <div class="dpx-toggle-grid" style="margin-top:1rem;">
                            ${dpxRenderToggle({ id: 'antiRaidProtectChannels', checked: cfg.protectChannels !== false, title: 'Proteger canales', description: 'Bloquea creación/eliminación masiva de canales.' })}
                            ${dpxRenderToggle({ id: 'antiRaidProtectRoles', checked: cfg.protectRoles !== false, title: 'Proteger roles', description: 'Bloquea creación/eliminación masiva de roles.' })}
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel" data-dpx-panel="trusted">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Roles confiables</h4>
                                <p>Estos roles quedan exentos del anti-raid (mods, admins, bots).</p>
                            </div>
                        </div>
                        ${trustedChipsHtml}
                        <div class="dpx-field-grid" style="margin-top:1rem;">
                            <div class="dpx-field is-full">
                                <label for="antiRaidTrustedRoles">Selecciona roles (Ctrl/Cmd para multi)</label>
                                <select id="antiRaidTrustedRoles" class="form-control" multiple>
                                    ${roles.map((role) => `<option value="${role.id}" ${trustedSet.has(String(role.id)) ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}
                                </select>
                                <small>Asegúrate de incluir tus roles de moderación.</small>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        `;

        bindDpxTabs(container, { persistTabStorageKey: panelTabStorageKey('security', guildId) });

        const saveBtn = document.getElementById('saveAntiRaidBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const trustedRolesEl = document.getElementById('antiRaidTrustedRoles');
                const trustedRoleIds = trustedRolesEl
                    ? Array.from(trustedRolesEl.selectedOptions || []).map((opt) => opt.value)
                    : [];

                const payload = {
                    enabled: document.getElementById('antiRaidEnabled')?.checked ?? true,
                    antiSpamEnabled: document.getElementById('antiRaidSpamEnabled')?.checked ?? true,
                    spamMessages: Number.parseInt(document.getElementById('antiRaidSpamMessages')?.value || '7', 10) || 7,
                    spamWindowSec: Number.parseInt(document.getElementById('antiRaidSpamWindowSec')?.value || '8', 10) || 8,
                    blockInvites: document.getElementById('antiRaidBlockInvites')?.checked ?? true,
                    blockLinks: document.getElementById('antiRaidBlockLinks')?.checked ?? false,
                    maxMentions: Number.parseInt(document.getElementById('antiRaidMaxMentions')?.value || '6', 10) || 6,
                    joinRateThreshold: Number.parseInt(document.getElementById('antiRaidJoinRateThreshold')?.value || '8', 10) || 8,
                    accountAgeDays: Number.parseInt(document.getElementById('antiRaidAccountAgeDays')?.value || '3', 10) || 3,
                    actionMode: document.getElementById('antiRaidActionMode')?.value || 'timeout',
                    timeoutMinutes: Number.parseInt(document.getElementById('antiRaidTimeoutMinutes')?.value || '30', 10) || 30,
                    protectChannels: document.getElementById('antiRaidProtectChannels')?.checked ?? true,
                    protectRoles: document.getElementById('antiRaidProtectRoles')?.checked ?? true,
                    destructiveActionThreshold: Number.parseInt(document.getElementById('antiRaidDestructiveActionThreshold')?.value || '3', 10) || 3,
                    actionWindowSec: Number.parseInt(document.getElementById('antiRaidActionWindowSec')?.value || '60', 10) || 60,
                    trustedRoleIds,
                    alertChannelId: document.getElementById('antiRaidAlertChannelId')?.value || ''
                };

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/anti-raid-config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo guardar anti-raid', 'error');
                        return;
                    }
                    showToast('Configuración anti-raid guardada', 'success');
                    await loadSecurityPanel(guildId);
                } catch (error) {
                    console.error('Error guardando anti-raid:', error);
                    showToast('Error guardando anti-raid', 'error');
                }
            });
        }
    } catch (error) {
        console.error('Error cargando anti-raid:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando centro de seguridad anti-raid.</div>';
    }
}

/**
 * Lógica del editor de avisos de directo (Twitch, YouTube, etc.) en la pestaña Directos.
 */
function initStreamAlertEditor(guildId, initialSourceRows, editorOpts = {}) {
    const raw = Array.isArray(initialSourceRows) ? initialSourceRows.slice(0, 20) : [];
    const streamLimitPerPlatform = Number(editorOpts.streamLimitPerPlatform) || 10;
    const streamState = {
        sources: raw.map((s) => ({ ...s, _previewUrl: s._previewUrl || '' })),
        modalEditIndex: -1
    };
    let streamSourcesSearchQuery = '';
    let selectedRowIndexes = new Set();

    const platformIconNames = { twitch: 'twitch', youtube: 'youtube', tiktok: 'tiktok', custom: 'rss' };
    const platformLabels = { twitch: 'Twitch', youtube: 'YouTube', tiktok: 'TikTok', custom: 'Custom / RSS' };

    const streamUrlPlaceholders = {
        twitch: 'https://www.twitch.tv/usuario',
        youtube: 'https://www.youtube.com/channel/UC… o /@usuario',
        tiktok: 'https://www.tiktok.com/@usuario (o feed RSS/WebSub)',
        custom: 'https://ejemplo.com/página-con-feed'
    };

    function extractTwitchLoginClient(url, name) {
        const u = String(url || '').trim();
        const match = u.match(/twitch\.tv\/([^/?#]+)/i);
        if (match?.[1]) return String(match[1]).replace(/^@/, '').trim().toLowerCase();
        return String(name || '').replace(/^@/, '').trim().toLowerCase();
    }

    function extractSourceHandle(source) {
        const platform = String(source.platform || 'custom');
        const url = String(source.url || '');
        const name = String(source.name || '').replace(/^@/, '');
        if (platform === 'twitch') {
            const login = extractTwitchLoginClient(url, name);
            return login ? login : name || 'twitch';
        }
        if (platform === 'youtube') {
            const handle = url.match(/youtube\.com\/@([A-Za-z0-9._-]+)/i)?.[1];
            if (handle) return `@${handle}`;
            const ch = url.match(/channel\/([A-Za-z0-9_-]+)/i)?.[1];
            return ch ? ch.slice(0, 12) + '…' : (name || 'youtube');
        }
        if (platform === 'tiktok') {
            const user = url.match(/tiktok\.com\/@([A-Za-z0-9._-]+)/i)?.[1];
            return user ? `@${user}` : (name ? `@${name}` : 'tiktok');
        }
        return name || 'feed';
    }

    function getDiscordChannelLabel() {
        const sel = document.getElementById('streamAlertsChannel');
        if (!sel || !sel.value) return 'Sin canal';
        const opt = sel.options[sel.selectedIndex];
        return opt ? opt.textContent.trim() : 'Sin canal';
    }

    function countPlatform(platform, excludeIndex = -1) {
        return streamState.sources.filter(
            (s, i) => i !== excludeIndex && String(s.platform) === platform && s.enabled !== false
        ).length;
    }

    function updateUsageStatsCard() {
        const card = document.getElementById('streamUsageStatsCard');
        if (!card) return;
        const rows = [
            { key: 'twitch', label: 'Notificaciones Twitch', cls: '' },
            { key: 'youtube', label: 'Notificaciones YouTube', cls: 'is-youtube' },
            { key: 'tiktok', label: 'Notificaciones TikTok', cls: 'is-tiktok' }
        ];
        const inner = rows.map(({ key, label, cls }) => {
            const n = countPlatform(key);
            const pct = Math.min(100, (n / streamLimitPerPlatform) * 100);
            return `
            <div class="sc-stream-stat-row">
                <div class="sc-stream-stat-head"><strong>${label}</strong><span>${n} / ${streamLimitPerPlatform}</span></div>
                <div class="sc-stream-stat-bar ${cls}"><span style="width:${pct}%"></span></div>
            </div>`;
        }).join('');
        card.innerHTML = `<h3>Uso</h3>${inner}`;
    }

    function updateDeleteSelectedUi() {
        const btn = document.getElementById('streamDeleteSelectedBtn');
        const n = selectedRowIndexes.size;
        if (btn) {
            btn.disabled = n === 0;
            btn.textContent = `Eliminar seleccionados (${n})`;
        }
    }

    function sourceTableRowHtml(source, index) {
        const platform = String(source.platform || 'custom');
        const platformIconName = platformIconNames[platform] || 'rss';
        const displayName = String(source.name || 'Sin nombre').trim() || 'Sin nombre';
        const handle = extractSourceHandle(source);
        const channelLabel = getDiscordChannelLabel();
        const lastLabel = source.lastPostedAt ? formatRelativeTime(source.lastPostedAt) : 'Nunca';
        const paused = source.enabled === false;
        const preview = source._previewUrl || source.imageUrl || '';
        const avatarInner = preview && platform === 'twitch'
            ? `<img src="${escapeHtmlForValue(preview)}" alt="">`
            : dpxIcon(platformIconName, 'dpx-icon');

        return `
        <tr class="sc-stream-row${paused ? ' is-paused' : ''}" data-index="${index}" data-search="${escapeHtml(`${displayName} ${handle} ${platform} ${source.url || ''}`.toLowerCase())}">
            <td><input type="checkbox" class="sc-stream-row-check" data-row-index="${index}" aria-label="Seleccionar"></td>
            <td>
                <div class="sc-stream-name-cell">
                    <div class="sc-stream-avatar platform-${platform}">${avatarInner}</div>
                    <div>
                        <span class="sc-stream-display-name">${escapeHtml(displayName)}</span>
                        <span class="sc-stream-handle">${dpxIcon(platformIconName, 'dpx-icon')} ${escapeHtml(handle)}</span>
                    </div>
                </div>
            </td>
            <td><span class="sc-stream-channel-pill" title="${escapeHtml(channelLabel)}">${escapeHtml(channelLabel)}</span></td>
            <td class="sc-stream-last">${escapeHtml(lastLabel)}</td>
            <td style="text-align:right"><button type="button" class="sc-stream-edit-btn" data-edit-index="${index}" aria-label="Editar">${dpxIcon('edit', 'dpx-icon')}</button></td>
        </tr>`;
    }

    function renderStreamSources() {
        const tbody = document.getElementById('streamSourcesList');
        const emptyEl = document.getElementById('streamSourcesEmpty');
        if (!tbody) return;

        selectedRowIndexes = new Set();
        tbody.innerHTML = streamState.sources.map((source, index) => sourceTableRowHtml(source, index)).join('');

        if (emptyEl) emptyEl.hidden = streamState.sources.length > 0;

        tbody.querySelectorAll('.sc-stream-edit-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const idx = Number.parseInt(btn.getAttribute('data-edit-index') || '-1', 10);
                if (idx >= 0) openStreamModal(idx);
            });
        });

        tbody.querySelectorAll('.sc-stream-row-check').forEach((cb) => {
            cb.addEventListener('change', () => {
                const idx = Number.parseInt(cb.getAttribute('data-row-index') || '-1', 10);
                if (idx < 0) return;
                if (cb.checked) selectedRowIndexes.add(idx);
                else selectedRowIndexes.delete(idx);
                updateDeleteSelectedUi();
            });
        });

        applyStreamSourcesFilter(streamSourcesSearchQuery);
        updateUsageStatsCard();
        updateDeleteSelectedUi();
        refreshAllTwitchPreviews();
    }

    function applyStreamSourcesFilter(query = '') {
        const normalizedQuery = String(query || '').trim().toLowerCase();
        document.querySelectorAll('#streamSourcesList .sc-stream-row').forEach((row) => {
            if (!normalizedQuery) {
                row.style.display = '';
                return;
            }
            const haystack = row.getAttribute('data-search') || '';
            row.style.display = haystack.includes(normalizedQuery) ? '' : 'none';
        });
    }

    function collectStreamSourcesFromDom() {
        return streamState.sources.map((source) => ({
            id: source.id,
            enabled: source.enabled !== false,
            platform: source.platform || 'custom',
            name: source.name || 'Fuente',
            url: source.url || '',
            feedUrl: source.feedUrl || '',
            imageUrl: source.imageUrl || '',
            lastItemId: source.lastItemId || '',
            lastPostedAt: source.lastPostedAt || ''
        }));
    }

    async function refreshModalTwitchPreview() {
        const row = document.getElementById('streamModalTwitchPreview');
        const platform = document.getElementById('streamModalPlatform')?.value;
        if (!row || platform !== 'twitch') {
            if (row) row.style.display = 'none';
            return;
        }
        row.style.display = '';
        const url = document.getElementById('streamModalUrl')?.value || '';
        const name = document.getElementById('streamModalName')?.value || '';
        const login = extractTwitchLoginClient(url, name);
        const img = document.getElementById('streamModalTwitchImg');
        const badge = document.getElementById('streamModalTwitchBadge');
        const hint = document.getElementById('streamModalTwitchHint');
        if (!login) {
            if (img) img.removeAttribute('src');
            if (badge) { badge.textContent = ''; badge.classList.remove('is-live'); }
            if (hint) hint.textContent = 'Indica la URL de Twitch.';
            return;
        }
        if (hint) hint.textContent = 'Cargando…';
        try {
            const qs = new URLSearchParams({ login });
            const response = await fetchWithCredentials(`/api/guild/${guildId}/twitch-live-preview?${qs}`);
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error();
            if (img && data.previewUrl) img.src = data.previewUrl;
            if (badge) {
                badge.textContent = data.live ? 'EN VIVO' : 'Offline';
                badge.classList.toggle('is-live', !!data.live);
            }
            if (hint) hint.textContent = data.live && data.title ? data.title : (data.live ? 'En directo' : 'Sin emisión ahora');
        } catch {
            if (img) img.src = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg?t=${Date.now()}`;
            if (hint) hint.textContent = 'Vista previa estática';
        }
    }

    const bumpModalTwitchPreview = debounce(refreshModalTwitchPreview, 450);

    async function refreshAllTwitchPreviews() {
        for (let i = 0; i < streamState.sources.length; i++) {
            const source = streamState.sources[i];
            if (String(source.platform) !== 'twitch') continue;
            const login = extractTwitchLoginClient(source.url, source.name);
            if (!login) continue;
            try {
                const qs = new URLSearchParams({ login });
                const response = await fetchWithCredentials(`/api/guild/${guildId}/twitch-live-preview?${qs}`);
                const data = await response.json().catch(() => ({}));
                if (response.ok && data.previewUrl) {
                    source._previewUrl = data.previewUrl;
                }
            } catch {
                source._previewUrl = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`;
            }
        }
        const tbody = document.getElementById('streamSourcesList');
        if (tbody && streamState.sources.length) {
            tbody.innerHTML = streamState.sources.map((s, i) => sourceTableRowHtml(s, i)).join('');
            tbody.querySelectorAll('.sc-stream-edit-btn').forEach((btn) => {
                btn.addEventListener('click', () => {
                    const idx = Number.parseInt(btn.getAttribute('data-edit-index') || '-1', 10);
                    if (idx >= 0) openStreamModal(idx);
                });
            });
            tbody.querySelectorAll('.sc-stream-row-check').forEach((cb) => {
                cb.addEventListener('change', () => {
                    const idx = Number.parseInt(cb.getAttribute('data-row-index') || '-1', 10);
                    if (idx < 0) return;
                    if (cb.checked) selectedRowIndexes.add(idx);
                    else selectedRowIndexes.delete(idx);
                    updateDeleteSelectedUi();
                });
            });
            applyStreamSourcesFilter(streamSourcesSearchQuery);
        }
    }

    function openStreamModal(editIndex = -1) {
        const backdrop = document.getElementById('streamSourceModalBackdrop');
        if (!backdrop) return;
        streamState.modalEditIndex = editIndex;
        const isEdit = editIndex >= 0;
        const source = isEdit ? streamState.sources[editIndex] : {
            id: `src_${Date.now()}`,
            enabled: true,
            platform: 'twitch',
            name: '',
            url: '',
            feedUrl: '',
            imageUrl: ''
        };

        document.getElementById('streamSourceModalTitle').textContent = isEdit ? 'Editar notificación' : 'Nueva notificación';
        document.getElementById('streamModalPlatform').value = source.platform || 'twitch';
        document.getElementById('streamModalName').value = source.name || '';
        document.getElementById('streamModalUrl').value = source.url || '';
        document.getElementById('streamModalFeed').value = source.feedUrl || '';
        document.getElementById('streamModalImage').value = source.imageUrl || '';
        document.getElementById('streamModalEnabled').checked = source.enabled !== false;

        const platform = source.platform || 'twitch';
        document.getElementById('streamModalUrl').placeholder = streamUrlPlaceholders[platform] || streamUrlPlaceholders.custom;
        backdrop.hidden = false;
        refreshModalTwitchPreview();
    }

    function closeStreamModal() {
        const backdrop = document.getElementById('streamSourceModalBackdrop');
        if (backdrop) backdrop.hidden = true;
        streamState.modalEditIndex = -1;
    }

    function saveStreamModal() {
        const platform = document.getElementById('streamModalPlatform')?.value || 'twitch';
        const isEdit = streamState.modalEditIndex >= 0;
        const prev = isEdit ? streamState.sources[streamState.modalEditIndex] : null;
        const excludeIdx = isEdit ? streamState.modalEditIndex : -1;
        const count = countPlatform(platform, excludeIdx);
        if (count >= streamLimitPerPlatform) {
            showToast(`Límite de ${streamLimitPerPlatform} notificaciones ${platformLabels[platform] || platform}`, 'warning');
            return;
        }

        const entry = {
            id: isEdit ? prev.id : `src_${Date.now()}`,
            enabled: document.getElementById('streamModalEnabled')?.checked !== false,
            platform,
            name: document.getElementById('streamModalName')?.value?.trim() || 'Canal',
            url: document.getElementById('streamModalUrl')?.value?.trim() || '',
            feedUrl: document.getElementById('streamModalFeed')?.value?.trim() || '',
            imageUrl: document.getElementById('streamModalImage')?.value?.trim() || '',
            lastItemId: prev?.lastItemId || '',
            lastPostedAt: prev?.lastPostedAt || '',
            _previewUrl: prev?._previewUrl || ''
        };

        if (isEdit) streamState.sources[streamState.modalEditIndex] = entry;
        else streamState.sources.push(entry);

        closeStreamModal();
        renderStreamSources();
    }

    function collectStreamConfigPayload() {
        return {
            enabled: document.getElementById('streamAlertsEnabled')?.checked ?? false,
            channelId: document.getElementById('streamAlertsChannel')?.value || '',
            mentionText: document.getElementById('streamAlertsMentionText')?.value || '',
            titleTemplate: document.getElementById('streamAlertsTitleTemplate')?.value || '🔴 {platform}: {name} en directo',
            descriptionTemplate: document.getElementById('streamAlertsDescriptionTemplate')?.value || '{title}\n{url}',
            color: (document.getElementById('streamAlertsColor')?.value || '#7c4dff').replace('#', ''),
            footerText: document.getElementById('streamAlertsFooter')?.value || 'EyedBot Stream Alerts',
            embedLargePreview: document.getElementById('streamAlertsEmbedLargePreview')?.checked === true,
            sources: collectStreamSourcesFromDom()
        };
    }

    renderStreamSources();

    const streamSourcesSearchInput = document.getElementById('streamSourcesSearch');
    if (streamSourcesSearchInput) {
        streamSourcesSearchInput.addEventListener('input', (event) => {
            streamSourcesSearchQuery = String(event.target?.value || '');
            applyStreamSourcesFilter(streamSourcesSearchQuery);
        });
    }

    const streamAlertsChannelSel = document.getElementById('streamAlertsChannel');
    if (streamAlertsChannelSel) {
        streamAlertsChannelSel.addEventListener('change', () => renderStreamSources());
    }

    ['streamCreateNotificationBtn', 'streamCreateNotificationBtnEmpty'].forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => openStreamModal(-1));
    });

    document.getElementById('streamSourceModalClose')?.addEventListener('click', closeStreamModal);
    document.getElementById('streamSourceModalCancel')?.addEventListener('click', closeStreamModal);
    document.getElementById('streamSourceModalSave')?.addEventListener('click', saveStreamModal);
    document.getElementById('streamSourceModalBackdrop')?.addEventListener('click', (e) => {
        if (e.target?.id === 'streamSourceModalBackdrop') closeStreamModal();
    });

    document.getElementById('streamModalPlatform')?.addEventListener('change', () => {
        const p = document.getElementById('streamModalPlatform')?.value || 'custom';
        const urlIn = document.getElementById('streamModalUrl');
        if (urlIn) urlIn.placeholder = streamUrlPlaceholders[p] || streamUrlPlaceholders.custom;
        bumpModalTwitchPreview();
    });
    document.getElementById('streamModalUrl')?.addEventListener('input', bumpModalTwitchPreview);
    document.getElementById('streamModalName')?.addEventListener('input', bumpModalTwitchPreview);

    document.getElementById('streamSelectAllRows')?.addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('#streamSourcesList .sc-stream-row-check').forEach((cb) => {
            cb.checked = checked;
            const idx = Number.parseInt(cb.getAttribute('data-row-index') || '-1', 10);
            if (idx < 0) return;
            if (checked) selectedRowIndexes.add(idx);
            else selectedRowIndexes.delete(idx);
        });
        updateDeleteSelectedUi();
    });

    document.getElementById('streamDeleteSelectedBtn')?.addEventListener('click', () => {
        if (!selectedRowIndexes.size) return;
        const toRemove = Array.from(selectedRowIndexes).sort((a, b) => b - a);
        toRemove.forEach((idx) => streamState.sources.splice(idx, 1));
        selectedRowIndexes.clear();
        renderStreamSources();
    });

    const saveStreamBtn = document.getElementById('saveStreamDirectosBtn');
    if (saveStreamBtn) {
        saveStreamBtn.addEventListener('click', async () => {
            const payload = collectStreamConfigPayload();
            if (payload.enabled && !payload.channelId) {
                showToast('Selecciona un canal de texto para publicar las alertas de directo', 'warning');
                return;
            }

            try {
                const response = await fetchWithCredentials(`/api/guild/${guildId}/stream-alert-config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showToast(data.error || 'No se pudo guardar avisos de directo', 'error');
                    return;
                }
                showToast('Avisos de directo guardados', 'success');
                await loadNotificationsPanel(guildId);
            } catch (error) {
                console.error('Error guardando stream alerts:', error);
                showToast('Error guardando avisos de directo', 'error');
            }
        });
    }

    const testStreamBtn = document.getElementById('testStreamAlertsBtn');
    if (testStreamBtn) {
        testStreamBtn.addEventListener('click', async () => {
            const payload = collectStreamConfigPayload();
            if (!payload.channelId) {
                showToast('Selecciona un canal de texto para enviar la prueba', 'warning');
                return;
            }

            try {
                const response = await fetchWithCredentials(`/api/guild/${guildId}/stream-alert-test`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    showToast(data.error || 'No se pudo enviar la prueba', 'error');
                    return;
                }
                showToast('Prueba de aviso de directo enviada', 'success');
            } catch (error) {
                console.error('Error enviando prueba stream alerts:', error);
                showToast('Error enviando prueba', 'error');
            }
        });
    }
}

async function loadNotificationsPanel(guildId) {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;

    const defaults = {
        notifyChannelId: '',
        joinLeave: true,
        moderationActions: true,
        ticketAlerts: true,
        levelingAlerts: false,
        streamAlerts: false,
        dailyDigest: false,
        digestHour: '21'
    };
    const prefs = getServerPreference(guildId, 'notifications', defaults);

    const defaultStream = {
        enabled: false,
        channelId: '',
        mentionText: '',
        titleTemplate: '🔴 {platform}: {name} en directo',
        descriptionTemplate: '{title}\n{url}',
        color: '7c4dff',
        footerText: 'EyedBot Stream Alerts',
        embedLargePreview: false,
        sources: []
    };
    let streamConfig = { ...defaultStream };

    const [channelsResponse, streamConfigResponse] = await Promise.all([
        fetchWithCredentials(`/api/guild/${guildId}/channels`).catch(() => null),
        fetchWithCredentials(`/api/guild/${guildId}/stream-alert-config`).catch(() => null)
    ]);

    const channels = channelsResponse && channelsResponse.ok
        ? (await channelsResponse.json()).filter((c) => c.type === 0)
        : [];

    if (streamConfigResponse && streamConfigResponse.ok) {
        try {
            const s = await streamConfigResponse.json();
            streamConfig = {
                ...defaultStream,
                ...s,
                embedLargePreview: s.embedLargePreview === true,
                streamPush: s.streamPush && typeof s.streamPush === 'object' ? s.streamPush : null,
                twitchEventSub: s.twitchEventSub && typeof s.twitchEventSub === 'object'
                    ? s.twitchEventSub
                    : (s.streamPush?.twitch || null),
                sources: Array.isArray(s.sources) ? s.sources : defaultStream.sources
            };
        } catch (e) {
            console.warn('No se pudo leer stream-alert-config', e);
        }
    }

    const streamChannelOptionsHtml = channels
        .map((c) => `<option value="${c.id}" ${String(streamConfig.channelId || '') === String(c.id) ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`)
        .join('');

    const streamSources = Array.isArray(streamConfig.sources) ? streamConfig.sources.slice(0, 20) : [];
    const streamSourcesEnabled = streamSources.filter((s) => s.enabled !== false).length;
    const streamLimitPerPlatform = 10;
    const streamCountTwitch = streamSources.filter((s) => String(s.platform) === 'twitch' && s.enabled !== false).length;
    const streamCountYoutube = streamSources.filter((s) => String(s.platform) === 'youtube' && s.enabled !== false).length;
    const streamCountTiktok = streamSources.filter((s) => String(s.platform) === 'tiktok' && s.enabled !== false).length;
    const streamPushTipsHtml = (() => {
        const sp = streamConfig.streamPush || {};
        if (!sp.publicOriginConfigured) {
            return `<div class="dpx-tip dpx-tip-warn" style="margin-top:0.75rem;">${dpxIcon('alert')}<div>Push instantáneo: configura <code>WEB_PUBLIC_ORIGIN</code> HTTPS en el servidor.</div></div>`;
        }
        const rows = [];
        if (sp.twitch?.configured) rows.push(`Twitch EventSub activo`);
        if (sp.youtube?.configured) rows.push(`YouTube WebSub activo`);
        if (sp.feed?.configured) rows.push(`Feed WebSub (TikTok/RSS) activo`);
        if (!rows.length) rows.push('Completa credenciales en el .env del servidor');
        return `<div class="dpx-tip" style="margin-top:0.75rem;">${dpxIcon('check')}<div>${rows.join(' · ')}</div></div>`;
    })();

    const channelName = (channels.find((c) => String(c.id) === String(prefs.notifyChannelId)) || {}).name || '—';
    const eventsActive = ['joinLeave', 'moderationActions', 'ticketAlerts', 'levelingAlerts', 'streamAlerts', 'dailyDigest'].filter((k) => prefs[k]).length;
    const hasChannel = !!prefs.notifyChannelId;

    const heroHtml = dpxRenderHero({
        kicker: 'Centro de notificaciones',
        title: 'Notificaciones inteligentes',
        description: 'Un canal de control, eventos del servidor, avisos de directo (Twitch, YouTube, etc.) y resumen diario, todo en un solo sitio.',
        accent: '#7ef0b4',
        glow1: 'rgba(80,230,160,0.18)',
        glow2: 'rgba(124,77,255,0.22)',
        iconName: 'bell',
        actionsHtml: `
            <span class="dpx-status-chip ${hasChannel ? 'is-on' : 'is-off'}"><span class="dot"></span>${hasChannel ? 'Canal listo' : 'Sin canal'}</span>
            <button type="button" class="btn btn-secondary" id="testNotificationsBtn">Enviar prueba</button>
            <button type="button" class="btn btn-primary" id="saveNotificationsBtn">Guardar preferencias</button>
        `
    });

    const statsHtml = `
        <div class="dpx-stats-grid">
            ${dpxRenderStatCard({ label: 'Canal principal', value: hasChannel ? `# ${escapeHtml(channelName)}` : 'Sin configurar', hint: hasChannel ? 'Notificaciones se envían aquí' : 'Selecciona un canal de texto', accent: '#7ef0b4' })}
            ${dpxRenderStatCard({ label: 'Eventos activos', value: `${eventsActive}<span class="dpx-stat-pill">/ 6</span>`, hint: 'Tipos de aviso en la pestaña Eventos', accent: '#7c4dff' })}
            ${dpxRenderStatCard({ label: 'Directos', value: `<span class="dpx-stat-pill ${streamConfig.enabled ? 'is-on' : 'is-off'}">${streamConfig.enabled ? 'Activos' : 'Inactivos'}</span>`, hint: streamConfig.channelId ? `${streamSourcesEnabled} fuente(s) activa(s)` : 'Elegir canal y fuentes en la pestaña Directos', accent: '#ff78d1' })}
            ${dpxRenderStatCard({ label: 'Resumen diario', value: `<span class="dpx-stat-pill ${prefs.dailyDigest ? 'is-on' : 'is-off'}">${prefs.dailyDigest ? 'Activo' : 'Inactivo'}</span>`, hint: prefs.dailyDigest ? `Se envía a las ${prefs.digestHour}:00` : 'No se enviará un digest diario', accent: '#9a6dff' })}
        </div>
    `;

    const tabsHtml = dpxRenderTabs([
        { key: 'channel', label: 'Canal', iconName: 'antenna' },
        { key: 'events', label: 'Eventos', iconName: 'bell' },
        { key: 'stream-directos', label: 'Directos', iconName: 'broadcast' },
        { key: 'digest', label: 'Resumen', iconName: 'calendar' }
    ], 'channel');

    container.innerHTML = `
        <div class="dpx-panel">
            ${heroHtml}
            ${statsHtml}
            ${tabsHtml}

            <section class="dpx-tab-panel is-active" data-dpx-panel="channel">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Canal principal</h4>
                            <p>Todas las notificaciones se publican en este canal. Puedes refinar los eventos en la siguiente pestaña.</p>
                        </div>
                    </div>
                    <div class="dpx-field-grid is-wide">
                        <div class="dpx-field is-full">
                            <label for="notifyChannelSelect">Canal de notificaciones</label>
                            <select id="notifyChannelSelect" class="form-control" data-pref-key="notifyChannelId">
                                <option value="">Selecciona un canal</option>
                                ${channels.map((c) => `<option value="${c.id}" ${String(prefs.notifyChannelId) === String(c.id) ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                            </select>
                            <small>Asegúrate de que el bot pueda enviar mensajes y embeds en ese canal.</small>
                        </div>
                    </div>
                </div>
            </section>

            <section class="dpx-tab-panel" data-dpx-panel="events">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Eventos a notificar</h4>
                            <p>Activa solo lo que tu equipo necesita ver. Menos ruido, más contexto.</p>
                        </div>
                    </div>
                    <div class="dpx-toggle-grid">
                        ${dpxRenderToggle({ dataPrefKey: 'joinLeave', checked: !!prefs.joinLeave, title: 'Entradas / salidas', description: 'Cuando un miembro entra o se va del servidor.' })}
                        ${dpxRenderToggle({ dataPrefKey: 'moderationActions', checked: !!prefs.moderationActions, title: 'Acciones de moderación', description: 'Bans, kicks, timeouts y warns automáticos.' })}
                        ${dpxRenderToggle({ dataPrefKey: 'ticketAlerts', checked: !!prefs.ticketAlerts, title: 'Tickets', description: 'Aperturas, cierres y eventos relevantes de tickets.' })}
                        ${dpxRenderToggle({ dataPrefKey: 'levelingAlerts', checked: !!prefs.levelingAlerts, title: 'Subidas de nivel', description: 'Cuando un miembro alcanza un nuevo nivel.' })}
                        ${dpxRenderToggle({ dataPrefKey: 'streamAlerts', checked: !!prefs.streamAlerts, title: 'Avisos de directo (canal de notif.)', description: 'Incluir avisos de directo en el canal de notificaciones. El embed, canal y fuentes se configuran en la pestaña Directos.' })}
                    </div>
                </div>
            </section>

            <section class="dpx-tab-panel" data-dpx-panel="stream-directos">
                <div id="streamDirectosRoot" class="stream-directos-root sc-stream-page">
                    <div class="sc-stream-view-tabs" role="tablist">
                        <button type="button" class="sc-stream-view-tab is-active" data-stream-view="channels" role="tab">${dpxIcon('broadcast', 'dpx-icon')} Canales</button>
                        <button type="button" class="sc-stream-view-tab" data-stream-view="settings" role="tab">${dpxIcon('layout', 'dpx-icon')} Configuración</button>
                    </div>

                    <div class="sc-stream-view is-active" data-stream-view-panel="channels">
                        <div class="sc-stream-hero-grid">
                            <div class="sc-stream-intro-card">
                                <h3>Avisos de directo</h3>
                                <p>Recibe un mensaje en Discord cuando un creador empiece a transmitir en Twitch, YouTube o TikTok.</p>
                                <a href="#" class="sc-learn-link" onclick="return false;">Más información</a>
                                <button type="button" class="sc-stream-btn-primary" id="streamCreateNotificationBtn">${dpxIcon('plus', 'dpx-icon')} Crear notificación</button>
                            </div>
                            <div class="sc-stream-stats-card" id="streamUsageStatsCard">
                                <h3>Uso</h3>
                                <div class="sc-stream-stat-row">
                                    <div class="sc-stream-stat-head"><strong>Notificaciones Twitch</strong><span>${streamCountTwitch} / ${streamLimitPerPlatform}</span></div>
                                    <div class="sc-stream-stat-bar"><span style="width:${Math.min(100, (streamCountTwitch / streamLimitPerPlatform) * 100)}%"></span></div>
                                </div>
                                <div class="sc-stream-stat-row">
                                    <div class="sc-stream-stat-head"><strong>Notificaciones YouTube</strong><span>${streamCountYoutube} / ${streamLimitPerPlatform}</span></div>
                                    <div class="sc-stream-stat-bar is-youtube"><span style="width:${Math.min(100, (streamCountYoutube / streamLimitPerPlatform) * 100)}%"></span></div>
                                </div>
                                <div class="sc-stream-stat-row">
                                    <div class="sc-stream-stat-head"><strong>Notificaciones TikTok</strong><span>${streamCountTiktok} / ${streamLimitPerPlatform}</span></div>
                                    <div class="sc-stream-stat-bar is-tiktok"><span style="width:${Math.min(100, (streamCountTiktok / streamLimitPerPlatform) * 100)}%"></span></div>
                                </div>
                            </div>
                        </div>

                        <div class="sc-stream-toolbar">
                            <div class="dpx-field">
                                <label class="sc-stream-toolbar-label" for="streamAlertsChannel">Canal de Discord</label>
                                <select id="streamAlertsChannel" class="form-control">
                                    <option value="">Selecciona canal</option>
                                    ${streamChannelOptionsHtml}
                                </select>
                            </div>
                            <label class="dpx-toggle" style="padding:0.5rem 0;">
                                <input type="checkbox" id="streamAlertsEnabled" ${streamConfig.enabled ? 'checked' : ''}>
                                <span class="dpx-toggle-switch"></span>
                                <span class="dpx-toggle-info"><strong>Activar avisos</strong></span>
                            </label>
                        </div>

                        <div class="sc-stream-table-panel">
                            <div class="sc-stream-table-toolbar">
                                <div class="sc-stream-search-wrap">
                                    ${dpxIcon('search', 'dpx-icon')}
                                    <input type="search" id="streamSourcesSearch" placeholder="Buscar notificaciones" autocomplete="off">
                                </div>
                                <button type="button" class="sc-stream-delete-selected" id="streamDeleteSelectedBtn" disabled>Eliminar seleccionados (0)</button>
                            </div>
                            <table class="sc-stream-table">
                                <thead>
                                    <tr>
                                        <th><input type="checkbox" id="streamSelectAllRows" aria-label="Seleccionar todos"></th>
                                        <th>Nombre</th>
                                        <th>Canal</th>
                                        <th>Último aviso</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody id="streamSourcesList"></tbody>
                            </table>
                            <div class="sc-stream-empty" id="streamSourcesEmpty" ${streamSources.length ? 'hidden' : ''}>
                                ${dpxIcon('broadcast', 'dpx-icon')}
                                <h4>Sin notificaciones</h4>
                                <p>Añade un canal de Twitch, YouTube o TikTok para avisar cuando empiece un directo.</p>
                                <button type="button" class="sc-stream-btn-primary" id="streamCreateNotificationBtnEmpty">Crear notificación</button>
                            </div>
                        </div>
                    </div>

                    <div class="sc-stream-view" data-stream-view-panel="settings">
                        <div class="sc-stream-intro-card" style="margin-bottom:1rem;">
                            <h3>Plantilla y opciones</h3>
                            <p>Personaliza el embed que se publica en Discord y las opciones avanzadas.</p>
                        </div>
                        <div class="dpx-toggle-grid">
                            ${dpxRenderToggle({ id: 'streamAlertsEmbedLargePreview', checked: streamConfig.embedLargePreview === true, title: 'Imagen grande en el embed', description: 'Por defecto la miniatura va en la esquina (thumbnail).' })}
                        </div>
                        <div class="dpx-field-grid" style="margin-top:1rem;">
                            <div class="dpx-field">
                                <label for="streamAlertsColor">Color del embed</label>
                                <input type="color" id="streamAlertsColor" class="form-control color-input" value="#${String(streamConfig.color || '7c4dff').replace('#', '')}">
                            </div>
                            <div class="dpx-field is-full">
                                <label for="streamAlertsMentionText">Mensaje encima del embed</label>
                                <input type="text" id="streamAlertsMentionText" class="form-control" value="${escapeHtmlForValue(streamConfig.mentionText || '')}" placeholder="@everyone · ¡En directo!">
                            </div>
                            <div class="dpx-field is-full">
                                <label for="streamAlertsTitleTemplate">Título del embed</label>
                                <input type="text" id="streamAlertsTitleTemplate" class="form-control" value="${escapeHtmlForValue(streamConfig.titleTemplate || '🔴 {platform}: {name} en directo')}">
                            </div>
                            <div class="dpx-field is-full">
                                <label for="streamAlertsDescriptionTemplate">Cuerpo</label>
                                <textarea id="streamAlertsDescriptionTemplate" class="form-control" rows="3">${escapeHtmlForValue(streamConfig.descriptionTemplate || '{title}\n{url}')}</textarea>
                            </div>
                            <div class="dpx-field is-full">
                                <label for="streamAlertsFooter">Pie (footer)</label>
                                <input type="text" id="streamAlertsFooter" class="form-control" value="${escapeHtmlForValue(streamConfig.footerText || 'EyedBot — Directos')}">
                            </div>
                        </div>
                        ${streamPushTipsHtml}
                        <div class="sc-stream-settings-actions">
                            <button type="button" class="btn btn-secondary" id="testStreamAlertsBtn">Enviar prueba</button>
                            <button type="button" class="btn btn-primary" id="saveStreamDirectosBtn">Guardar cambios</button>
                        </div>
                        <div class="dpx-tip" style="margin-top:1rem;">${dpxIcon('info')}<div>Variables: <code>{platform}</code>, <code>{name}</code>, <code>{title}</code>, <code>{url}</code>, <code>{description}</code></div></div>
                    </div>

                    <div class="sc-stream-modal-backdrop" id="streamSourceModalBackdrop" hidden>
                        <div class="sc-stream-modal" role="dialog" aria-labelledby="streamSourceModalTitle">
                            <div class="sc-stream-modal-head">
                                <h3 id="streamSourceModalTitle">Nueva notificación</h3>
                                <button type="button" class="sc-stream-modal-close" id="streamSourceModalClose" aria-label="Cerrar">${dpxIcon('close', 'dpx-icon')}</button>
                            </div>
                            <div class="sc-stream-modal-body">
                                <div class="dpx-field-grid">
                                    <div class="dpx-field">
                                        <label>Plataforma</label>
                                        <select class="form-control" id="streamModalPlatform">
                                            <option value="twitch">Twitch</option>
                                            <option value="youtube">YouTube</option>
                                            <option value="tiktok">TikTok</option>
                                            <option value="custom">Custom / RSS</option>
                                        </select>
                                    </div>
                                    <div class="dpx-field">
                                        <label>Nombre visible</label>
                                        <input type="text" class="form-control" id="streamModalName" placeholder="Nombre del creador">
                                    </div>
                                    <div class="dpx-field is-full">
                                        <label>URL del canal</label>
                                        <input type="url" class="form-control" id="streamModalUrl" placeholder="https://…">
                                    </div>
                                    <div class="dpx-field is-full">
                                        <label>Feed RSS (opcional)</label>
                                        <input type="url" class="form-control" id="streamModalFeed" placeholder="https://…/feed.xml">
                                    </div>
                                    <div class="dpx-field is-full" id="streamModalImageRow">
                                        <label>Imagen fallback (opcional)</label>
                                        <input type="url" class="form-control" id="streamModalImage" placeholder="https://…/image.jpg">
                                    </div>
                                </div>
                                <div class="stream-twitch-preview-row" id="streamModalTwitchPreview" style="display:none;margin-top:0.75rem;">
                                    <div class="stream-twitch-preview-inner">
                                        <div class="stream-twitch-preview-thumb-wrap">
                                            <img class="stream-twitch-preview-img" id="streamModalTwitchImg" alt="" width="320" height="180">
                                            <span class="stream-twitch-preview-badge" id="streamModalTwitchBadge"></span>
                                        </div>
                                        <p class="stream-twitch-preview-hint" id="streamModalTwitchHint"></p>
                                    </div>
                                </div>
                                <label class="dpx-toggle" style="margin-top:0.75rem;">
                                    <input type="checkbox" id="streamModalEnabled" checked>
                                    <span class="dpx-toggle-switch"></span>
                                    <span class="dpx-toggle-info"><strong>Notificación activa</strong></span>
                                </label>
                            </div>
                            <div class="sc-stream-modal-foot">
                                <button type="button" class="btn btn-secondary" id="streamSourceModalCancel">Cancelar</button>
                                <button type="button" class="btn btn-primary sc-stream-btn-primary" id="streamSourceModalSave">Guardar</button>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section class="dpx-tab-panel" data-dpx-panel="digest">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Resumen diario</h4>
                            <p>Envía un resumen automático del día a la hora que prefieras.</p>
                        </div>
                    </div>
                    <div class="dpx-toggle-grid">
                        ${dpxRenderToggle({ dataPrefKey: 'dailyDigest', checked: !!prefs.dailyDigest, title: 'Activar resumen diario', description: 'Recibe un mensaje con métricas y eventos relevantes.' })}
                    </div>
                    <div class="dpx-field-grid" style="margin-top:0.85rem;">
                        <div class="dpx-field">
                            <label for="digestHourInput">Hora del resumen (0-23)</label>
                            <input type="number" min="0" max="23" class="form-control" id="digestHourInput" data-pref-key="digestHour" value="${escapeHtmlForValue(prefs.digestHour)}">
                            <small>Hora local del servidor donde corre el bot.</small>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;

    bindDpxTabs(container, { persistTabStorageKey: panelTabStorageKey('notifications', guildId) });

    initStreamAlertEditor(guildId, streamConfig.sources, {
        channels,
        streamLimitPerPlatform
    });
    bindStreamDirectosViewTabs(container.querySelector('#streamDirectosRoot'), guildId);

    const saveBtn = document.getElementById('saveNotificationsBtn');
    const testBtn = document.getElementById('testNotificationsBtn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            const values = collectPanelValues('notificationsContainer');
            const channelId = values.notifyChannelId ? `#${values.notifyChannelId}` : 'sin canal';
            showToast(`Prueba enviada (simulada) en ${channelId}`, 'success');
        });
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const values = collectPanelValues('notificationsContainer');
            setServerPreference(guildId, 'notifications', values);
            showToast('Opciones de notificaciones guardadas', 'success');
        });
    }
}

function gachaRarityMeta(rarity = 'N') {
    const key = String(rarity || 'N').toUpperCase();
    const map = {
        SSR: { label: 'SSR', color: '#f1c40f' },
        SR: { label: 'SR', color: '#9b59b6' },
        R: { label: 'R', color: '#3498db' },
        N: { label: 'N', color: '#95a5a6' }
    };
    return map[key] || map.N;
}

function renderGachaRarityBadge(rarity, size = 'sm') {
    const meta = gachaRarityMeta(rarity);
    return `<span class="levels-tier-badge levels-tier-badge--${size}" style="--tier-color:${meta.color};">${meta.label}</span>`;
}

function renderGachaLeaderboardPodium(entries) {
    const order = [entries[1], entries[0], entries[2]];
    return `
        <div class="levels-podium">
            ${order.map((entry) => {
                if (!entry) return '<div class="levels-podium-slot is-empty"></div>';
                const realRank = entries.indexOf(entry) + 1;
                const positionClass = realRank === 1 ? 'levels-podium-slot--first' : realRank === 2 ? 'levels-podium-slot--second' : 'levels-podium-slot--third';
                const rarity = gachaRarityMeta(entry.bestRarity);
                const progress = Math.max(0, Math.min(100, Number(entry.progressPercent) || 0));
                return `
                    <div class="levels-podium-slot ${positionClass}">
                        ${renderPodiumAvatarWrap(realRank, entry.avatar
                            ? `<img src="${entry.avatar}" alt="avatar" class="levels-podium-avatar" style="--tier-color:${rarity.color};">`
                            : `<div class="levels-podium-avatar levels-podium-avatar--placeholder" style="--tier-color:${rarity.color};">${(entry.tag || 'U').charAt(0).toUpperCase()}</div>`
                        )}
                        <div class="levels-podium-name">${escapeHtml(entry.tag || entry.username || 'Usuario')}</div>
                        <div class="levels-podium-level">${levelingFormatNumber(entry.coins)} monedas</div>
                        <div class="levels-podium-progress">
                            <div class="levels-podium-progress-bar" style="width:${progress}%; --tier-color:${rarity.color};"></div>
                        </div>
                        <div class="levels-podium-xp">${levelingFormatNumber(entry.collectionCount)} ítems · ${levelingFormatNumber(entry.totalClaims)} claims</div>
                        ${renderGachaRarityBadge(entry.bestRarity, 'sm')}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function buildGachaLeaderboardHtml(payload) {
    const rows = Array.isArray(payload?.leaderboard) ? payload.leaderboard : [];
    if (!rows.length) {
        return `
            <div class="levels-empty-card">
                <div class="levels-empty-icon">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                </div>
                <div>
                    <h5>Todavía no hay datos</h5>
                    <p>Cuando los miembros empiecen a usar la economía y el gacha aparecerán aquí.</p>
                </div>
            </div>
        `;
    }

    const top3 = rows.slice(0, 3);
    const rest = rows.slice(3, 15);
    const restHtml = rest.map((item, idx) => {
        const rank = idx + 4;
        const progress = Math.max(0, Math.min(100, Number(item.progressPercent) || 0));
        const rarity = gachaRarityMeta(item.bestRarity);
        return `
            <div class="levels-rank-row" style="--tier-color:${rarity.color};">
                <div class="levels-rank-number">#${rank}</div>
                ${item.avatar ? `<img src="${item.avatar}" alt="avatar" class="levels-rank-avatar">` : `<div class="levels-rank-avatar levels-rank-avatar--placeholder">${(item.tag || 'U').charAt(0).toUpperCase()}</div>`}
                <div class="levels-rank-body">
                    <div class="levels-rank-head">
                        <span class="levels-rank-name">${escapeHtml(item.tag || item.username || 'Usuario')}</span>
                        <div class="levels-rank-head-tags">
                            ${renderGachaRarityBadge(item.bestRarity, 'sm')}
                            <span class="levels-rank-level">${levelingFormatNumber(item.coins)} monedas</span>
                        </div>
                    </div>
                    <div class="levels-rank-progress">
                        <div class="levels-rank-progress-bar" style="width:${progress}%; --tier-color:${rarity.color};"></div>
                    </div>
                    <div class="levels-rank-meta">
                        <span>${levelingFormatNumber(item.totalClaims)} claims</span>
                        <span>${levelingFormatNumber(item.collectionCount)} colección</span>
                        <span>${levelingFormatNumber(item.totalRolls)} rolls</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    return `
        ${renderGachaLeaderboardPodium(top3)}
        <div class="levels-rank-list">
            ${restHtml || '<div class="levels-rank-empty">Solo hay ' + rows.length + ' miembro(s) con actividad gacha.</div>'}
        </div>
    `;
}

const GACHA_PANEL_TAB_KEYS = Object.freeze([
    'gacha-config',
    'gacha-economy',
    'gacha-shop',
    'gacha-inventory',
    'gacha-market',
    'gacha-top'
]);

function gachaPanelActiveTabStorageKey(guildId) {
    return `eyedbot:gacha:${String(guildId)}:dpxActiveTab`;
}

function readGachaPanelStoredTab(guildId) {
    try {
        const stored = sessionStorage.getItem(gachaPanelActiveTabStorageKey(guildId));
        if (stored && GACHA_PANEL_TAB_KEYS.includes(stored)) return stored;
    } catch (_) { /* noop */ }
    return 'gacha-config';
}

function buildGachaCatalogThumbSrc(guildId, row, imageUrl = '') {
    if (row?.catalogDbImage) {
        return `/api/guild/${guildId}/gacha-catalog/${encodeURIComponent(row.id)}/image?t=${Date.now()}`;
    }
    const s = String(imageUrl || '').trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (s.startsWith('/uploads/')) return s;
    return '';
}

function renderGachaCatalogThumbMarkup(thumbSrc) {
    if (!thumbSrc) {
        return '<div class="gacha-catalog-thumb-ph" role="img" aria-label="">Sin imagen</div>';
    }
    if (String(thumbSrc).startsWith('/api/')) {
        return `<img class="gacha-catalog-thumb-img" alt="" loading="lazy" decoding="async" data-auth-thumb="1" data-thumb-src="${escapeHtml(thumbSrc)}" src=""/>`;
    }
    return `<img class="gacha-catalog-thumb-img" alt="" loading="lazy" decoding="async" src="${escapeHtml(thumbSrc)}"/>`;
}

function revokeGachaCatalogThumbBlobs(root) {
    if (!root) return;
    root.querySelectorAll('img.gacha-catalog-thumb-img[data-blob-url]').forEach((img) => {
        const blobUrl = img.getAttribute('data-blob-url');
        if (blobUrl) {
            try { URL.revokeObjectURL(blobUrl); } catch (_) { /* noop */ }
        }
    });
}

async function hydrateGachaCatalogThumbs(root) {
    if (!root) return;
    const imgs = root.querySelectorAll('img.gacha-catalog-thumb-img[data-auth-thumb="1"]');
    await Promise.all([...imgs].map(async (img) => {
        const src = img.getAttribute('data-thumb-src');
        if (!src) return;
        try {
            const response = await fetchWithCredentials(src);
            if (!response.ok) {
                const ph = document.createElement('div');
                ph.className = 'gacha-catalog-thumb-ph';
                ph.setAttribute('role', 'img');
                ph.textContent = 'Sin imagen';
                img.replaceWith(ph);
                return;
            }
            const blob = await response.blob();
            const prev = img.getAttribute('data-blob-url');
            if (prev) {
                try { URL.revokeObjectURL(prev); } catch (_) { /* noop */ }
            }
            const objectUrl = URL.createObjectURL(blob);
            img.src = objectUrl;
            img.setAttribute('data-blob-url', objectUrl);
            img.removeAttribute('data-auth-thumb');
        } catch {
            /* noop */
        }
    }));
}

async function loadGachaPanel(guildId) {
    const container = document.getElementById('gachaContainer');
    if (!container) return;

    if (!hasPremiumAccess()) {
        enforceAllPremiumLocks();
        return;
    }

    revokeGachaCatalogThumbBlobs(container);

    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando economía y gacha...</p></div>';

    try {
        const [channelsResponse, configResponse, statsResponse, myInventoryResponse, marketResponse, shopResponse, leaderboardResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/channels`).catch(() => null),
            fetchWithCredentials(`/api/guild/${guildId}/gacha-config`).catch(() => null),
            fetchWithCredentials(`/api/guild/${guildId}/gacha-stats`).catch(() => null),
            fetchWithCredentials(`/api/guild/${guildId}/gacha-inventory?limit=300`).catch(() => null),
            fetchWithCredentials(`/api/guild/${guildId}/gacha-market`).catch(() => null),
            fetchWithCredentials(`/api/guild/${guildId}/gacha-shop`).catch(() => null),
            fetchWithCredentials(`/api/guild/${guildId}/gacha-leaderboard`).catch(() => null)
        ]);

        const channels = channelsResponse && channelsResponse.ok
            ? (await channelsResponse.json()).filter((c) => c.type === 0)
            : [];

        const defaultConfig = {
            enabled: false,
            channelId: '',
            rollCooldownSec: 60,
            claimCooldownSec: 30,
            claimWindowSec: 120,
            pityThreshold: 30,
            coinsPerClaim: 10,
            economyEnabled: false,
            shopEnabled: true,
            coinsPerXp: 1,
            coinsPerLevelUp: 75,
            coinsPerVoiceMinute: 1,
            shopPriceMultiplier: 2,
            minigameCoinflipReward: 8,
            minigameDiceReward: 6,
            minigameTriviaReward: 18,
            minigameCooldownSec: 45
        };
        let config = { ...defaultConfig };
        if (configResponse && configResponse.ok) {
            const cfg = await configResponse.json().catch(() => ({}));
            config = { ...defaultConfig, ...(cfg || {}) };
        }

        let stats = {
            totalUsers: 0,
            totalRolls: 0,
            totalClaims: 0,
            totalCollection: 0,
            topClaimers: []
        };
        if (statsResponse && statsResponse.ok) {
            const payload = await statsResponse.json().catch(() => ({}));
            stats = { ...stats, ...(payload.stats || {}) };
        }
        const myInventory = myInventoryResponse && myInventoryResponse.ok
            ? await myInventoryResponse.json().catch(() => ({ items: [] }))
            : { items: [] };
        const marketPayload = marketResponse && marketResponse.ok
            ? await marketResponse.json().catch(() => ({ listings: [] }))
            : { listings: [] };
        const marketListings = Array.isArray(marketPayload.listings) ? marketPayload.listings : [];
        const shopPayload = shopResponse && shopResponse.ok
            ? await shopResponse.json().catch(() => ({ items: [] }))
            : { items: [] };
        const shopItems = Array.isArray(shopPayload.items) ? shopPayload.items : [];
        const shopEditorLimit = 120;
        const shopEditorItems = shopItems.slice(0, shopEditorLimit);
        const shopCatalogSummary = shopItems.length > shopEditorLimit
            ? `Mostrando ${shopEditorItems.length} de ${shopItems.length} artículos.`
            : `${shopItems.length} artículo(s) en el catálogo.`;
        const visibleShopCount = Number.isFinite(Number(shopPayload.visibleShopCount))
            ? Number(shopPayload.visibleShopCount)
            : shopItems.filter((row) => !row.shopHidden).length;
        const removedCatalogCount = Number.isFinite(Number(shopPayload.removedFromCatalogCount))
            ? Number(shopPayload.removedFromCatalogCount)
            : shopItems.filter((row) => row.catalogRemoved === true).length;

        const gachaLeaderboard = leaderboardResponse && leaderboardResponse.ok
            ? await leaderboardResponse.json().catch(() => ({ leaderboard: [] }))
            : { leaderboard: [] };
        const gachaLeaderboardHtml = buildGachaLeaderboardHtml(gachaLeaderboard);

        const gachaDpxActive = readGachaPanelStoredTab(guildId);

        container.innerHTML = `
            <div class="dpx-panel">
                ${dpxRenderHero({
                    kicker: 'Economía y Gacha',
                    title: 'Tienda, inventario, mercado y recompensas',
                    description: 'Configura gacha, economía por XP, tienda en Discord y minijuegos con monedas desde un panel organizado.',
                    accent: '#f6c244',
                    glow1: 'rgba(246,194,68,0.22)',
                    glow2: 'rgba(124,77,255,0.24)',
                    iconName: 'sparkles',
                    actionsHtml: `
                        <span class="dpx-status-chip ${config.enabled ? 'is-on' : 'is-off'}"><span class="dot"></span>${config.enabled ? 'Activo' : 'Inactivo'}</span>
                        <button type="button" class="btn btn-secondary" id="refreshGachaPanelBtn">Actualizar</button>
                        <button type="button" class="btn btn-primary" id="saveGachaConfigBtn">Guardar</button>
                    `
                })}
                <div class="dpx-stats-grid">
                    ${dpxRenderStatCard({ label: 'Usuarios', value: Number(stats.totalUsers || 0).toLocaleString('es-ES'), hint: 'Perfiles con actividad gacha', accent: '#7c4dff' })}
                    ${dpxRenderStatCard({ label: 'Rolls totales', value: Number(stats.totalRolls || 0).toLocaleString('es-ES'), hint: 'Rolls registrados', accent: '#ff78d1' })}
                    ${dpxRenderStatCard({ label: 'Claims totales', value: Number(stats.totalClaims || 0).toLocaleString('es-ES'), hint: 'Personajes reclamados', accent: '#7ef0b4' })}
                    ${dpxRenderStatCard({ label: 'Colección global', value: Number(stats.totalCollection || 0).toLocaleString('es-ES'), hint: 'Suma de colecciones del servidor', accent: '#f6c244' })}
                    ${dpxRenderStatCard({ label: 'Artículos visibles (/tienda)', value: visibleShopCount.toLocaleString('es-ES'), hint: `Ocultos: ${Math.max(0, shopItems.length - visibleShopCount)} · Eliminados: ${removedCatalogCount} · Total: ${shopItems.length}`, accent: '#8fd3ff' })}
                </div>
                ${dpxRenderTabs([
                    { key: 'gacha-config', label: 'Gacha', iconName: 'gear' },
                    { key: 'gacha-economy', label: 'Economía', iconName: 'sparkles' },
                    { key: 'gacha-shop', label: 'Tienda', iconName: 'book' },
                    { key: 'gacha-inventory', label: 'Inventario', iconName: 'book' },
                    { key: 'gacha-market', label: 'Mercado', iconName: 'users' },
                    { key: 'gacha-top', label: 'Ranking', iconName: 'users' }
                ], gachaDpxActive)}

                <section class="dpx-tab-panel ${gachaDpxActive === 'gacha-config' ? 'is-active' : ''}" data-dpx-panel="gacha-config">
                    <div class="dpx-section">
                        <div class="dpx-toggle-grid">
                            ${dpxRenderToggle({ id: 'gachaEnabled', checked: !!config.enabled, title: 'Activar sistema gacha', description: 'Permite /gacha roll, /gacha claim, perfiles y top.' })}
                        </div>
                        <div class="dpx-field-grid" style="margin-top:1rem;">
                            <div class="dpx-field is-full">
                                <label for="gachaChannelId">Canal de gacha</label>
                                <select id="gachaChannelId" class="form-control">
                                    <option value="">Selecciona un canal</option>
                                    ${channels.map((c) => `<option value="${c.id}" ${String(config.channelId || '') === String(c.id) ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="dpx-field">
                                <label for="gachaRollCooldownSec">Cooldown roll (s)</label>
                                <input id="gachaRollCooldownSec" class="form-control" type="number" min="10" max="3600" value="${Number(config.rollCooldownSec || 60)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaClaimCooldownSec">Cooldown claim (s)</label>
                                <input id="gachaClaimCooldownSec" class="form-control" type="number" min="5" max="1800" value="${Number(config.claimCooldownSec || 30)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaClaimWindowSec">Ventana claim (s)</label>
                                <input id="gachaClaimWindowSec" class="form-control" type="number" min="30" max="600" value="${Number(config.claimWindowSec || 120)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaPityThreshold">Pity SSR</label>
                                <input id="gachaPityThreshold" class="form-control" type="number" min="5" max="200" value="${Number(config.pityThreshold || 30)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaCoinsPerClaim">Monedas por claim</label>
                                <input id="gachaCoinsPerClaim" class="form-control" type="number" min="1" max="1000" value="${Number(config.coinsPerClaim || 10)}">
                            </div>
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel ${gachaDpxActive === 'gacha-economy' ? 'is-active' : ''}" data-dpx-panel="gacha-economy">
                    <div class="dpx-section">
                        <div class="dpx-toggle-grid">
                            ${dpxRenderToggle({ id: 'gachaEconomyEnabled', checked: !!config.economyEnabled, title: 'Activar economía', description: 'Habilita monedas por XP, tienda /tienda y recompensas de minijuegos.' })}
                            ${dpxRenderToggle({ id: 'gachaShopEnabled', checked: config.shopEnabled !== false, title: 'Activar tienda', description: 'Permite comprar personajes con monedas desde /tienda.' })}
                        </div>
                        <div class="dpx-field-grid" style="margin-top:1rem;">
                            <div class="dpx-field">
                                <label for="gachaCoinsPerXp">Monedas por XP</label>
                                <input id="gachaCoinsPerXp" class="form-control" type="number" min="0" max="100" value="${Number(config.coinsPerXp ?? 1)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaCoinsPerLevelUp">Monedas por subida de nivel</label>
                                <input id="gachaCoinsPerLevelUp" class="form-control" type="number" min="0" max="5000" value="${Number(config.coinsPerLevelUp ?? 75)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaCoinsPerVoiceMinute">Monedas por minuto en voz</label>
                                <input id="gachaCoinsPerVoiceMinute" class="form-control" type="number" min="0" max="100" value="${Number(config.coinsPerVoiceMinute ?? 1)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaShopPriceMultiplier">Multiplicador de precios</label>
                                <input id="gachaShopPriceMultiplier" class="form-control" type="number" min="0.5" max="10" step="0.1" value="${Number(config.shopPriceMultiplier ?? 2)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaMinigameCoinflipReward">Recompensa /coinflip</label>
                                <input id="gachaMinigameCoinflipReward" class="form-control" type="number" min="0" max="1000" value="${Number(config.minigameCoinflipReward ?? 8)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaMinigameDiceReward">Recompensa /dice</label>
                                <input id="gachaMinigameDiceReward" class="form-control" type="number" min="0" max="1000" value="${Number(config.minigameDiceReward ?? 6)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaMinigameTriviaReward">Recompensa /trivia</label>
                                <input id="gachaMinigameTriviaReward" class="form-control" type="number" min="0" max="5000" value="${Number(config.minigameTriviaReward ?? 18)}">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaMinigameCooldownSec">Cooldown minijuegos (s)</label>
                                <input id="gachaMinigameCooldownSec" class="form-control" type="number" min="5" max="3600" value="${Number(config.minigameCooldownSec ?? 45)}">
                            </div>
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel ${gachaDpxActive === 'gacha-shop' ? 'is-active' : ''}" data-dpx-panel="gacha-shop">
                    <div class="dpx-section gacha-shop-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Catálogo de tienda</h4>
                                <p class="gacha-shop-intro-lead">Este listado edita la misma base de datos que el bot: Discord <code>/tienda</code> y las compras usarán lo que guardes aquí.</p>
                                <ul class="gacha-shop-intro-list">
                                    <li><strong>Precio</strong> en blanco → automático (valor base × multiplicador × rareza).</li>
                                    <li><strong>Imagen</strong>: al <strong>subir</strong>, se guarda en <strong>MySQL</strong>; el bot y <code>/tienda</code> la leen desde la base (no depende de la carpeta del panel). Puedes usar URL externa pegando en el campo si prefieres.</li>
                                    <li><strong>Ocultar</strong> quita el artículo de <code>/tienda</code> y borra ofertas del mercado sistema para ese personaje.</li>
                                    <li><strong>Eliminar del servidor</strong> lo quita también del <strong>pool</strong> (no sale en tienda ni en mercado sistema; los rolls pueden seguir saliendo desde el archivo global hasta que filtremos gacha).</li>
                                    <li><strong>Activar en servidor</strong> vuelve a incluir personajes marcados como eliminados aquí.</li>
                                    <li><strong>Restaurar personaje</strong> elimina todas las personalizaciones guardadas para ese ID.</li>
                                </ul>
                            </div>
                        </div>
                        <div class="gacha-catalog-toolbar">
                            <span>${escapeHtml(shopCatalogSummary)}</span>
                            <span>Visibles <code>/tienda</code>: <strong>${visibleShopCount.toLocaleString('es-ES')}</strong> · Eliminados servidor: <strong>${removedCatalogCount.toLocaleString('es-ES')}</strong></span>
                        </div>
                        <div id="gachaCatalogEditor" class="dpx-item-list gacha-catalog-list">
                            ${shopEditorItems.map((item, index) => {
                                const thumbBlock = renderGachaCatalogThumbMarkup(
                                    buildGachaCatalogThumbSrc(guildId, item, item.imageUrl || '')
                                );

                                if (item.catalogRemoved === true) {
                                    return `
                                <article class="gacha-catalog-card gacha-catalog-card--removed dpx-item-row gacha-catalog-row" data-character-id="${escapeHtml(item.id)}" data-catalog-db-image="${item.catalogDbImage ? '1' : ''}">
                                    <div class="gacha-catalog-card-inner">
                                        <aside class="gacha-catalog-visual" aria-hidden="true">
                                            ${thumbBlock}
                                        </aside>
                                        <div class="gacha-catalog-body">
                                            <header class="gacha-catalog-header">
                                                <div class="gacha-catalog-meta">
                                                    <span class="badge-gacha-removed">Eliminado del servidor</span>
                                                    ${item.shopHidden === true ? '<span class="badge-gacha-hidden" title="Configuración: oculto de /tienda">Oculto</span>' : ''}
                                                    <span class="gacha-catalog-index">#${index + 1}</span>
                                                    <code class="gacha-catalog-id">${escapeHtml(item.id)}</code>
                                                </div>
                                            </header>
                                            <div class="gacha-catalog-removed-banner">
                                                <div class="gacha-catalog-removed-title">${escapeHtml(item.name || 'Sin nombre')}</div>
                                                <div class="gacha-catalog-removed-sub">${escapeHtml(item.series || '—')} · ${escapeHtml(String(item.rarity || 'N').toUpperCase())}</div>
                                                <p class="gacha-field-hint">Este personaje <strong>no está en el pool</strong> de este servidor: no aparece en <code>/tienda</code> ni en mercado sistema. Tus ajustes en base de datos se conservan (imagen, texto, precio fijo…) hasta «Restaurar personaje». Los rolls de <code>/gacha</code> pueden seguir mostrándolo si el archivo global del bot aún lo incluye.</p>
                                                <div class="gacha-catalog-actions is-compact">
                                                    <button type="button" class="btn btn-primary gacha-catalog-restore-catalog-btn" data-gacha-restore-catalog="${escapeHtml(item.id)}">Activar en servidor</button>
                                                    <button type="button" class="btn btn-ghost gacha-catalog-reset-btn" data-gacha-reset-item="${escapeHtml(item.id)}">Restaurar personaje…</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            `;
                                }

                                return `
                                <article class="gacha-catalog-card dpx-item-row gacha-catalog-row" data-character-id="${escapeHtml(item.id)}" data-catalog-db-image="${item.catalogDbImage ? '1' : ''}">
                                    <div class="gacha-catalog-card-inner">
                                        <aside class="gacha-catalog-visual" aria-hidden="true">
                                            ${thumbBlock}
                                        </aside>
                                        <div class="gacha-catalog-body">
                                            <header class="gacha-catalog-header">
                                                <div class="gacha-catalog-meta">
                                                    ${item.shopHidden === true ? '<span class="badge-gacha-hidden" title="Oculto de /tienda">Oculto</span>' : ''}
                                                    <span class="gacha-catalog-index">#${index + 1}</span>
                                                    <code class="gacha-catalog-id">${escapeHtml(item.id)}</code>
                                                </div>
                                                <div class="gacha-catalog-price-pill" title="Precio efectivo en la tienda">
                                                    <span class="gacha-catalog-price-label">Precio</span>
                                                    <strong class="gacha-catalog-price-value">${Number(item.price || 0).toLocaleString('es-ES')}</strong>
                                                    ${item.shopPriceOverride != null ? '<span class="badge-gacha-price-fixed">Fijado</span>' : ''}
                                                </div>
                                            </header>
                                            <div class="gacha-catalog-grid">
                                                <div class="gacha-catalog-block">
                                                    <h5 class="gacha-catalog-block-title">Personaje</h5>
                                                    <div class="dpx-field-grid gacha-catalog-block-grid">
                                                        <div class="dpx-field">
                                                            <label>Nombre</label>
                                                            <input class="form-control gacha-catalog-name" value="${escapeHtmlForValue(item.name || '')}">
                                                        </div>
                                                        <div class="dpx-field">
                                                            <label>Serie</label>
                                                            <input class="form-control gacha-catalog-series" value="${escapeHtmlForValue(item.series || '')}">
                                                        </div>
                                                        <div class="dpx-field">
                                                            <label>Rareza</label>
                                                            <select class="form-control gacha-catalog-rarity">
                                                                ${['SSR', 'SR', 'R', 'N'].map((rarity) => `<option value="${rarity}" ${String(item.rarity || 'N').toUpperCase() === rarity ? 'selected' : ''}>${rarity}</option>`).join('')}
                                                            </select>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="gacha-catalog-block">
                                                    <h5 class="gacha-catalog-block-title">Economía</h5>
                                                    <div class="dpx-field-grid gacha-catalog-block-grid">
                                                        <div class="dpx-field">
                                                            <label>Valor base</label>
                                                            <input class="form-control gacha-catalog-base-value" type="number" min="1" value="${Number(item.baseValue || 1)}">
                                                        </div>
                                                        <div class="dpx-field">
                                                            <label>Precio tienda (monedas)</label>
                                                            <input class="form-control gacha-catalog-shop-price" type="number" min="1" placeholder="Automático" value="${item.shopPriceOverride != null ? Number(item.shopPriceOverride) : ''}">
                                                            <p class="gacha-field-hint">Vacío: precio automático (${Number(item.shopPriceDefault ?? item.price ?? 0).toLocaleString('es-ES')} monedas con la economía actual).</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="gacha-catalog-block gacha-catalog-block--span">
                                                    <h5 class="gacha-catalog-block-title">Presentación en Discord</h5>
                                                    <div class="dpx-field-grid gacha-catalog-block-grid">
                                                        <div class="dpx-field is-full">
                                                            <label>URL de imagen</label>
                                                            <div class="gacha-catalog-image-row">
                                                                <input type="url" class="form-control gacha-catalog-image-url" placeholder="https://..." value="${escapeHtmlForValue(item.imageUrl || '')}">
                                                                <label class="btn btn-secondary gacha-catalog-upload-btn">
                                                                    Subir imagen
                                                                    <input type="file" class="gacha-catalog-upload-input" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" data-gacha-upload-character="${escapeHtml(item.id)}">
                                                                </label>
                                                            </div>
                                                            <p class="gacha-field-hint">Subir imagen → se almacena en la base de datos (y se borra la URL local antigua). Discord usa esa copia desde el bot.</p>
                                                        </div>
                                                        <div class="dpx-field is-full">
                                                            <label>Descripción (embed)</label>
                                                            <textarea class="form-control gacha-catalog-description" rows="3">${escapeHtml(item.description || '')}</textarea>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="gacha-catalog-block gacha-catalog-block--span">
                                                    <h5 class="gacha-catalog-block-title">Visibilidad y acciones</h5>
                                                    <div class="dpx-field">
                                                        <label class="checkbox-label gacha-catalog-visibility-label">
                                                            <input type="checkbox" class="gacha-catalog-shop-hidden" ${item.shopHidden === true ? 'checked' : ''}>
                                                            <span>Ocultar de <code>/tienda</code></span>
                                                        </label>
                                                        <p class="gacha-field-hint is-tight-before-actions">Ocultar también retira publicaciones del mercado sistema para este personaje.</p>
                                                    </div>
                                                    <div class="gacha-catalog-actions">
                                                        <button type="button" class="btn btn-primary gacha-catalog-save-btn" data-gacha-save-item="${escapeHtml(item.id)}">Guardar cambios</button>
                                                        <button type="button" class="btn btn-secondary gacha-catalog-clear-img-btn" data-gacha-clear-img="${escapeHtml(item.id)}">Quitar solo imagen</button>
                                                        <button type="button" class="btn btn-danger gacha-catalog-remove-server-btn" data-gacha-remove-server="${escapeHtml(item.id)}">Eliminar del servidor</button>
                                                        <button type="button" class="btn btn-ghost gacha-catalog-reset-btn" data-gacha-reset-item="${escapeHtml(item.id)}">Restaurar personaje…</button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            `;
                            }).join('') || '<div class="dpx-empty">No hay artículos en el catálogo.</div>'}
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel ${gachaDpxActive === 'gacha-top' ? 'is-active' : ''}" data-dpx-panel="gacha-top">
                    <div class="dpx-section levels-leaderboard-shell">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Ranking del servidor</h4>
                                <p>${Number(gachaLeaderboard.totalTrackedUsers || 0).toLocaleString('es-ES')} miembro(s) con actividad en economía y gacha.</p>
                            </div>
                        </div>
                        <div id="gachaLeaderboardWrap">${gachaLeaderboardHtml}</div>
                    </div>
                </section>

                <section class="dpx-tab-panel ${gachaDpxActive === 'gacha-inventory' ? 'is-active' : ''}" data-dpx-panel="gacha-inventory">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Inventario (usuario logueado)</h4>
                                <p>Filtra por rareza o serie para encontrar personajes rápidamente.</p>
                            </div>
                        </div>
                        <div class="dpx-field-grid">
                            <div class="dpx-field">
                                <label for="gachaInvRarity">Rareza</label>
                                <select id="gachaInvRarity" class="form-control">
                                    <option value="">Todas</option>
                                    <option value="SSR">SSR</option>
                                    <option value="SR">SR</option>
                                    <option value="R">R</option>
                                    <option value="N">N</option>
                                </select>
                            </div>
                            <div class="dpx-field">
                                <label for="gachaInvSeries">Serie</label>
                                <input id="gachaInvSeries" class="form-control" placeholder="Ej: Celestial Archive">
                            </div>
                            <div class="dpx-field">
                                <label>&nbsp;</label>
                                <button id="gachaInvApplyBtn" type="button" class="btn btn-secondary">Aplicar filtros</button>
                            </div>
                        </div>
                        <div id="gachaInventoryList" class="dpx-item-list" style="margin-top:1rem;">
                            ${(Array.isArray(myInventory.items) ? myInventory.items : []).slice(0, 50).map((it, i) => `
                                <div class="dpx-item-row">
                                    <div class="dpx-item-main">
                                        <div class="dpx-item-title">#${i + 1} [${escapeHtml(it.uid)}] ${escapeHtml(it.name)}</div>
                                        <div class="dpx-item-sub">${escapeHtml(it.series)} · ${escapeHtml(it.rarity)} · Valor ${Number(it.value || 0).toLocaleString('es-ES')}</div>
                                    </div>
                                </div>
                            `).join('') || '<div class="dpx-empty">No hay items en inventario.</div>'}
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel ${gachaDpxActive === 'gacha-market' ? 'is-active' : ''}" data-dpx-panel="gacha-market">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Mercado del servidor</h4>
                                <p>Compra y publica personajes entre usuarios.</p>
                            </div>
                        </div>
                        <div class="dpx-field-grid">
                            <div class="dpx-field">
                                <label for="gachaMarketItemUid">UID para publicar</label>
                                <input id="gachaMarketItemUid" class="form-control" placeholder="inv_...">
                            </div>
                            <div class="dpx-field">
                                <label for="gachaMarketPrice">Precio</label>
                                <input id="gachaMarketPrice" class="form-control" type="number" min="1" value="100">
                            </div>
                            <div class="dpx-field">
                                <label>&nbsp;</label>
                                <button id="gachaMarketPublishBtn" type="button" class="btn btn-primary">Publicar</button>
                            </div>
                        </div>
                        <div class="dpx-field-grid" style="margin-top:0.75rem;">
                            <div class="dpx-field">
                                <label for="gachaMarketListingId">Comprar por listing ID</label>
                                <input id="gachaMarketListingId" class="form-control" placeholder="mk_...">
                            </div>
                            <div class="dpx-field">
                                <label>&nbsp;</label>
                                <button id="gachaMarketBuyBtn" type="button" class="btn btn-secondary">Comprar</button>
                            </div>
                        </div>
                        <div class="dpx-item-list" style="margin-top:1rem;">
                            ${marketListings.slice(0, 30).map((row, i) => `
                                <div class="dpx-item-row">
                                    <div class="dpx-item-main">
                                        <div class="dpx-item-title">#${i + 1} [${escapeHtml(row.id)}] ${escapeHtml(row.item?.name || 'Item')}</div>
                                        <div class="dpx-item-sub">${escapeHtml(row.item?.series || '—')} · ${escapeHtml(row.item?.rarity || 'N')} · Precio ${Number(row.price || 0).toLocaleString('es-ES')}</div>
                                    </div>
                                </div>
                            `).join('') || '<div class="dpx-empty">Sin listings activos.</div>'}
                        </div>
                    </div>
                </section>
            </div>
        `;

        bindDpxTabs(container, { persistTabStorageKey: gachaPanelActiveTabStorageKey(guildId) });
        void hydrateGachaCatalogThumbs(container);

        if (container._eyedbotGachaUploadAbort) {
            try { container._eyedbotGachaUploadAbort.abort(); } catch (_) { /* noop */ }
        }
        const gachaUploadAbort = new AbortController();
        container._eyedbotGachaUploadAbort = gachaUploadAbort;

        container.addEventListener('change', async (uploadEvent) => {
            const fileInput = uploadEvent.target;
            if (!(fileInput instanceof HTMLInputElement) || !fileInput.classList.contains('gacha-catalog-upload-input')) return;
            const characterId = fileInput.getAttribute('data-gacha-upload-character');
            if (!characterId) return;

            const file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!file) return;

            if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
                showToast('El archivo debe ser imagen PNG, JPG, WebP o GIF.', 'error');
                return;
            }

            const rowPreview = Array.from(container.querySelectorAll('.gacha-catalog-row')).find(
                (r) => r.getAttribute('data-character-id') === characterId
            );
            const thumbCellPreview = rowPreview?.querySelector('.gacha-catalog-visual');
            let localPreviewUrl = '';
            if (thumbCellPreview) {
                localPreviewUrl = URL.createObjectURL(file);
                thumbCellPreview.innerHTML = `<img class="gacha-catalog-thumb-img" alt="" src="${escapeHtml(localPreviewUrl)}"/>`;
            }

            try {
                const fd = new FormData();
                fd.append('imageFile', file);
                fd.append('characterId', characterId);
                const response = await fetchWithCredentials(`/api/guild/${guildId}/gacha-catalog-upload`, {
                    method: 'POST',
                    body: fd
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    if (localPreviewUrl) {
                        try { URL.revokeObjectURL(localPreviewUrl); } catch (_) { /* noop */ }
                    }
                    showToast(data.error || data.catalogSaveError || 'No se pudo subir la imagen', 'error');
                    return;
                }
                if (localPreviewUrl) {
                    try { URL.revokeObjectURL(localPreviewUrl); } catch (_) { /* noop */ }
                }
                const url = String(data.url || '').trim();
                if (!url.startsWith('/api/') && !/^https?:\/\//i.test(url)) {
                    showToast('Respuesta de subida sin ruta de imagen', 'error');
                    return;
                }
                const row = Array.from(container.querySelectorAll('.gacha-catalog-row')).find(
                    (r) => r.getAttribute('data-character-id') === characterId
                );
                const urlField = row?.querySelector('.gacha-catalog-image-url');
                if (urlField) {
                    if (url.startsWith('/api/')) {
                        urlField.value = '';
                        urlField.placeholder = 'Imagen en MySQL (subir otra para reemplazar)';
                    } else {
                        urlField.value = url;
                        urlField.placeholder = 'https://...';
                    }
                }
                if (row) row.setAttribute('data-catalog-db-image', url.startsWith('/api/') ? '1' : '');
                const thumbCell = row?.querySelector('.gacha-catalog-visual');
                if (thumbCell) {
                    thumbCell.innerHTML = renderGachaCatalogThumbMarkup(url);
                    void hydrateGachaCatalogThumbs(thumbCell);
                }
                if (data.catalogSaved === true || data.storedInDb || data.storedOnDisk) {
                    showToast('Imagen guardada en MySQL; /tienda la mostrará desde el bot.', 'success');
                    await loadGachaPanel(guildId);
                    return;
                }
                showToast('Imagen subida pero no se vinculó al catálogo.', 'warning');
            } catch (err) {
                console.error(err);
                showToast('Error al subir imagen', 'error');
            }
        }, { signal: gachaUploadAbort.signal });

        container.querySelectorAll('.gacha-catalog-save-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const characterId = button.getAttribute('data-gacha-save-item');
                const row = button.closest('.gacha-catalog-row');
                if (!characterId || !row) return;

                const urlVal = row.querySelector('.gacha-catalog-image-url')?.value ?? '';
                const hasDb = row.getAttribute('data-catalog-db-image') === '1';

                const payload = {
                    name: row.querySelector('.gacha-catalog-name')?.value || '',
                    series: row.querySelector('.gacha-catalog-series')?.value || '',
                    rarity: row.querySelector('.gacha-catalog-rarity')?.value || 'N',
                    description: row.querySelector('.gacha-catalog-description')?.value || '',
                    baseValue: Number.parseInt(row.querySelector('.gacha-catalog-base-value')?.value || '1', 10),
                    shopHidden: row.querySelector('.gacha-catalog-shop-hidden')?.checked === true,
                    shopPrice: row.querySelector('.gacha-catalog-shop-price')?.value ?? ''
                };
                if (!(hasDb && !String(urlVal).trim())) {
                    payload.imageUrl = urlVal;
                }

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/gacha-catalog/${encodeURIComponent(characterId)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo guardar el objeto', 'error');
                        return;
                    }
                    showToast('Objeto del catálogo guardado', 'success');
                    await loadGachaPanel(guildId);
                } catch (error) {
                    console.error('Error guardando objeto del catálogo:', error);
                    showToast('Error guardando objeto del catálogo', 'error');
                }
            });
        });

        container.querySelectorAll('.gacha-catalog-clear-img-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const characterId = button.getAttribute('data-gacha-clear-img');
                if (!characterId) return;

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/gacha-catalog/${encodeURIComponent(characterId)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clearCatalogImage: true })
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo quitar la imagen', 'error');
                        return;
                    }
                    showToast('Imagen del catálogo eliminada', 'success');
                    await loadGachaPanel(guildId);
                } catch (error) {
                    console.error(error);
                    showToast('Error quitando imagen', 'error');
                }
            });
        });

        container.querySelectorAll('.gacha-catalog-reset-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const characterId = button.getAttribute('data-gacha-reset-item');
                if (!characterId) return;
                const okReset = await showAppConfirm({
                    title: 'Restaurar personaje',
                    message: '¿Restaurar este personaje al catálogo por defecto? Se borrarán personalizaciones en la base de datos (nombre, imagen, texto, etc.).',
                    confirmLabel: 'Restaurar',
                    variant: 'warning'
                });
                if (!okReset) return;

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/gacha-catalog/${encodeURIComponent(characterId)}`, {
                        method: 'DELETE'
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo restaurar', 'error');
                        return;
                    }
                    showToast('Personaje restaurado al predeterminado', 'success');
                    await loadGachaPanel(guildId);
                } catch (error) {
                    console.error(error);
                    showToast('Error al restaurar personaje', 'error');
                }
            });
        });

        container.querySelectorAll('.gacha-catalog-remove-server-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const characterId = button.getAttribute('data-gacha-remove-server');
                if (!characterId) return;
                const okRemove = await showAppConfirm({
                    title: 'Eliminar del servidor',
                    message: '¿Eliminar este producto del servidor?\n\nYa no aparecerá en la tienda ni en el mercado sistema y se quita del pool de personajes. Podrás reactivarlo con «Activar en servidor». Los rolls globales pueden seguir mostrándolo.',
                    confirmLabel: 'Eliminar',
                    variant: 'danger'
                });
                if (!okRemove) return;

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/gacha-catalog/${encodeURIComponent(characterId)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ removedFromGuildCatalog: true })
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo eliminar', 'error');
                        return;
                    }
                    showToast('Producto eliminado del servidor', 'success');
                    await loadGachaPanel(guildId);
                } catch (error) {
                    console.error(error);
                    showToast('Error al eliminar del servidor', 'error');
                }
            });
        });

        container.querySelectorAll('.gacha-catalog-restore-catalog-btn').forEach((button) => {
            button.addEventListener('click', async () => {
                const characterId = button.getAttribute('data-gacha-restore-catalog');
                if (!characterId) return;

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/gacha-catalog/${encodeURIComponent(characterId)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ restoreToGuildCatalog: true })
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo reactivar', 'error');
                        return;
                    }
                    showToast('Personaje activo en servidor de nuevo', 'success');
                    await loadGachaPanel(guildId);
                } catch (error) {
                    console.error(error);
                    showToast('Error al reactivar', 'error');
                }
            });
        });

        const refreshBtn = document.getElementById('refreshGachaPanelBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadGachaPanel(guildId));
        }

        const saveBtn = document.getElementById('saveGachaConfigBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const payload = {
                    enabled: document.getElementById('gachaEnabled')?.checked === true,
                    channelId: document.getElementById('gachaChannelId')?.value || '',
                    rollCooldownSec: Number.parseInt(document.getElementById('gachaRollCooldownSec')?.value || '60', 10),
                    claimCooldownSec: Number.parseInt(document.getElementById('gachaClaimCooldownSec')?.value || '30', 10),
                    claimWindowSec: Number.parseInt(document.getElementById('gachaClaimWindowSec')?.value || '120', 10),
                    pityThreshold: Number.parseInt(document.getElementById('gachaPityThreshold')?.value || '30', 10),
                    coinsPerClaim: Number.parseInt(document.getElementById('gachaCoinsPerClaim')?.value || '10', 10),
                    economyEnabled: document.getElementById('gachaEconomyEnabled')?.checked === true,
                    shopEnabled: document.getElementById('gachaShopEnabled')?.checked !== false,
                    coinsPerXp: Number.parseInt(document.getElementById('gachaCoinsPerXp')?.value || '1', 10),
                    coinsPerLevelUp: Number.parseInt(document.getElementById('gachaCoinsPerLevelUp')?.value || '75', 10),
                    coinsPerVoiceMinute: Number.parseInt(document.getElementById('gachaCoinsPerVoiceMinute')?.value || '1', 10),
                    shopPriceMultiplier: Number.parseFloat(document.getElementById('gachaShopPriceMultiplier')?.value || '2'),
                    minigameCoinflipReward: Number.parseInt(document.getElementById('gachaMinigameCoinflipReward')?.value || '8', 10),
                    minigameDiceReward: Number.parseInt(document.getElementById('gachaMinigameDiceReward')?.value || '6', 10),
                    minigameTriviaReward: Number.parseInt(document.getElementById('gachaMinigameTriviaReward')?.value || '18', 10),
                    minigameCooldownSec: Number.parseInt(document.getElementById('gachaMinigameCooldownSec')?.value || '45', 10)
                };

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/gacha-config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo guardar gacha', 'error');
                        return;
                    }
                    showToast('Configuración gacha guardada', 'success');
                    await loadGachaPanel(guildId);
                } catch (error) {
                    console.error('Error guardando gacha config:', error);
                    showToast('Error guardando configuración gacha', 'error');
                }
            });
        }

        const invApplyBtn = document.getElementById('gachaInvApplyBtn');
        if (invApplyBtn) {
            invApplyBtn.addEventListener('click', async () => {
                const rarity = document.getElementById('gachaInvRarity')?.value || '';
                const series = document.getElementById('gachaInvSeries')?.value || '';
                const listContainer = document.getElementById('gachaInventoryList');
                try {
                    const qs = new URLSearchParams({ limit: '150' });
                    if (rarity) qs.set('rarity', rarity);
                    if (series) qs.set('series', series);
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/gacha-inventory?${qs.toString()}`);
                    const data = await response.json().catch(() => ({ items: [] }));
                    if (!response.ok) throw new Error(data.error || 'No se pudo cargar inventario');
                    const rows = Array.isArray(data.items) ? data.items : [];
                    if (listContainer) {
                        listContainer.innerHTML = rows.length
                            ? rows.slice(0, 80).map((it, i) => `
                                <div class="dpx-item-row">
                                    <div class="dpx-item-main">
                                        <div class="dpx-item-title">#${i + 1} [${escapeHtml(it.uid)}] ${escapeHtml(it.name)}</div>
                                        <div class="dpx-item-sub">${escapeHtml(it.series)} · ${escapeHtml(it.rarity)} · Valor ${Number(it.value || 0).toLocaleString('es-ES')}</div>
                                    </div>
                                </div>
                            `).join('')
                            : '<div class="dpx-empty">Sin resultados.</div>';
                    }
                } catch (error) {
                    showToast(error.message || 'Error cargando inventario', 'error');
                }
            });
        }

        const marketPublishBtn = document.getElementById('gachaMarketPublishBtn');
        if (marketPublishBtn) {
            marketPublishBtn.addEventListener('click', async () => {
                const itemUid = document.getElementById('gachaMarketItemUid')?.value || '';
                const price = Number.parseInt(document.getElementById('gachaMarketPrice')?.value || '0', 10);
                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/gacha-market/list`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ itemUid, price })
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(data.error || 'No se pudo publicar');
                    showToast('Listing publicado', 'success');
                    await loadGachaPanel(guildId);
                } catch (error) {
                    showToast(error.message || 'Error publicando listing', 'error');
                }
            });
        }

        const marketBuyBtn = document.getElementById('gachaMarketBuyBtn');
        if (marketBuyBtn) {
            marketBuyBtn.addEventListener('click', async () => {
                const listingId = document.getElementById('gachaMarketListingId')?.value || '';
                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/gacha-market/buy`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ listingId })
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) throw new Error(data.error || 'No se pudo comprar');
                    showToast('Compra realizada', 'success');
                    await loadGachaPanel(guildId);
                } catch (error) {
                    showToast(error.message || 'Error comprando', 'error');
                }
            });
        }
    } catch (error) {
        console.error('Error cargando panel gacha:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando sistema gacha.</div>';
    }
}

function collectVerifyConfigFromForm() {
    return {
        enabled: document.getElementById('verifyEnabled')?.checked ?? true,
        channelId: document.getElementById('verifyChannelSelect')?.value || '',
        roleId: document.getElementById('verifyRoleSelect')?.value || '',
        newMemberRoleId: document.getElementById('verifyNewMemberRoleSelect')?.value || '',
        emoji: document.getElementById('verifyEmoji')?.value?.trim() || '✅',
        title: document.getElementById('verifyTitle')?.value || 'Verify',
        message: document.getElementById('verifyMessage')?.value || '¡Reacciona a este mensaje para ver los demás canales!',
        color: (document.getElementById('verifyColor')?.value || '#7c4dff').replace('#', ''),
        footer: document.getElementById('verifyFooter')?.value || '',
        imageUrl: document.getElementById('verifyImageUrl')?.value || '',
        removeRoleOnUnreact: document.getElementById('verifyRemoveOnUnreact')?.checked ?? false,
        messageId: document.getElementById('verifyMessageId')?.value || ''
    };
}

async function saveVerifyConfig(guildId, showSuccessToast = true) {
    const payload = collectVerifyConfigFromForm();
    if (!payload.channelId || !payload.roleId) {
        showToast('Selecciona canal y rol de verificación', 'warning');
        return false;
    }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/verify-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo guardar verificación', 'error');
            return false;
        }

        if (showSuccessToast) showToast('Configuración de verificación guardada', 'success');
        if (document.getElementById('verifyMessageId')) {
            document.getElementById('verifyMessageId').value = data.config?.messageId || payload.messageId || '';
        }
        return true;
    } catch (error) {
        console.error('Error guardando verify config:', error);
        showToast('Error guardando verificación', 'error');
        return false;
    }
}

async function publishVerifyEmbed(guildId) {
    const saved = await saveVerifyConfig(guildId, false);
    if (!saved) return;

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/verify-publish`, {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo publicar verify embed', 'error');
            return;
        }

        if (document.getElementById('verifyMessageId')) {
            document.getElementById('verifyMessageId').value = data.messageId || '';
        }
        if (document.getElementById('verifyEnabled')) {
            document.getElementById('verifyEnabled').checked = true;
        }

        showToast('Embed de verificación publicado', 'success');
    } catch (error) {
        console.error('Error publicando verify embed:', error);
        showToast('Error publicando verify embed', 'error');
    }
}

async function updateVerifyEmbedInDiscord(guildId) {
    const saved = await saveVerifyConfig(guildId, false);
    if (!saved) return;

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/verify-embed-update`, {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo actualizar el embed en Discord', 'error');
            return;
        }
        if (document.getElementById('verifyMessageId') && data.messageId) {
            document.getElementById('verifyMessageId').value = data.messageId;
        }
        showToast('Embed de verificación actualizado en el canal', 'success');
    } catch (error) {
        console.error('Error actualizando verify embed:', error);
        showToast('Error actualizando verify embed', 'error');
    }
}

async function uploadVerifyImage(guildId) {
    const fileInput = document.getElementById('verifyImageFile');
    const imageUrlInput = document.getElementById('verifyImageUrl');
    const status = document.getElementById('verifyImageUploadStatus');
    const file = fileInput?.files?.[0] || null;

    if (!file) {
        showToast('Selecciona una imagen primero', 'warning');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('Solo puedes subir archivos de imagen', 'warning');
        return;
    }

    if (status) status.textContent = 'Subiendo imagen...';

    try {
        const formData = new FormData();
        formData.append('imageFile', file, `verify_${Date.now()}_${file.name}`);

        const response = await fetchWithCredentials(`/api/guild/${guildId}/verify-image`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.url) {
            showToast(data.error || 'No se pudo subir la imagen de verify', 'error');
            if (status) status.textContent = '';
            return;
        }

        if (imageUrlInput) imageUrlInput.value = data.url;
        if (status) status.textContent = 'Imagen subida';
        showToast('Imagen de verify subida correctamente', 'success');
    } catch (error) {
        console.error('Error subiendo imagen verify:', error);
        showToast('Error subiendo imagen verify', 'error');
        if (status) status.textContent = '';
    }
}

async function loadVerifyPanel(guildId) {
    const container = document.getElementById('verifyContainer');
    if (!container) return;

    try {
        const [infoResponse, channelsResponse, configResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/info`),
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/verify-config`)
        ]);

        if (!infoResponse.ok || !channelsResponse.ok || !configResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar el sistema de verificación.</div>';
            return;
        }

        const info = await infoResponse.json();
        const channels = (await channelsResponse.json()).filter((c) => c.type === 0);
        setPanelGuildTextChannels(channels);
        const cfg = await configResponse.json();

        const roles = (Array.isArray(info?.roles) ? info.roles : [])
            .filter((role) => role && role.id && role.name && role.name !== '@everyone')
            .sort((a, b) => (b.position || 0) - (a.position || 0));

        const enabled = cfg.enabled === true;
        const channelName = (channels.find((c) => c.id === cfg.channelId) || {}).name || '—';
        const roleName = (roles.find((r) => r.id === cfg.roleId) || {}).name || '—';
        const newMemberRoleName = (roles.find((r) => r.id === cfg.newMemberRoleId) || {}).name || '—';
        const emojiPreview = escapeHtml(cfg.emoji || '✅');
        const isPublished = !!cfg.messageId;

        const heroHtml = dpxRenderHero({
            kicker: 'Verificación',
            title: 'Sistema de Verificación',
            description: 'Publica un embed con reacción para asignar automáticamente el rol de verificado a tus nuevos miembros.',
            accent: '#7ef0b4',
            glow1: 'rgba(80,230,160,0.18)',
            glow2: 'rgba(124,77,255,0.18)',
            iconName: 'check',
            actionsHtml: `
                <span class="dpx-status-chip ${enabled ? 'is-on' : 'is-off'}"><span class="dot"></span>${enabled ? 'Activo' : 'Inactivo'}</span>
                <button type="button" id="saveVerifyBtn" class="btn btn-secondary">Guardar</button>
                <button type="button" id="updateVerifyEmbedBtn" class="btn btn-secondary" ${isPublished ? '' : 'disabled'} title="${isPublished ? 'Edita el mensaje ya publicado (mismo Message ID)' : 'Publica primero un embed'}">Actualizar en Discord</button>
                <button type="button" id="publishVerifyBtn" class="btn btn-primary">Publicar embed</button>
            `
        });

        const statsHtml = `
            <div class="dpx-stats-grid">
                ${dpxRenderStatCard({ label: 'Estado', value: `<span class="dpx-stat-pill ${enabled ? 'is-on' : 'is-off'}">${enabled ? 'Activo' : 'Inactivo'}</span>`, hint: enabled ? 'Verificación funcionando' : 'Activa para empezar', accent: '#7ef0b4' })}
                ${dpxRenderStatCard({ label: 'Canal', value: cfg.channelId ? `# ${escapeHtml(channelName)}` : 'Sin canal', hint: cfg.channelId ? 'Donde se publica el embed' : 'Selecciona un canal', accent: '#7c4dff' })}
                ${dpxRenderStatCard({ label: 'Rol verificado', value: cfg.roleId ? escapeHtml(roleName) : 'Sin rol', hint: cfg.roleId ? 'Asignado al reaccionar' : 'Configura un rol de verificado', accent: '#9a6dff' })}
                ${dpxRenderStatCard({ label: 'Rol al entrar', value: cfg.newMemberRoleId ? escapeHtml(newMemberRoleName) : 'Sin rol', hint: cfg.newMemberRoleId ? 'Se asigna al entrar al servidor' : 'Opcional para no verificados', accent: '#6dd6ff' })}
                ${dpxRenderStatCard({ label: 'Emoji', value: emojiPreview, hint: 'Reacción que activa el rol', accent: '#ff78d1' })}
                ${dpxRenderStatCard({ label: 'Publicado', value: `<span class="dpx-stat-pill ${isPublished ? 'is-on' : 'is-off'}">${isPublished ? 'Sí' : 'No'}</span>`, hint: isPublished ? 'Embed activo en Discord' : 'Pulsa "Publicar embed"', accent: '#ffb778', accent2: '#ff78d1' })}
            </div>
        `;

        const tabsHtml = dpxRenderTabs([
            { key: 'config', label: 'Configuración', iconName: 'gear' },
            { key: 'embed', label: 'Apariencia', iconName: 'palette' },
            { key: 'media', label: 'Imagen y publicación', iconName: 'image' }
        ], 'config');

        container.innerHTML = `
            <div class="dpx-panel">
                ${heroHtml}
                ${statsHtml}
                ${tabsHtml}

                <section class="dpx-tab-panel is-active" data-dpx-panel="config">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Canal y rol</h4>
                                <p>Define dónde se publica el embed, qué rol se da al verificar y cuál rol inicial tendrá un usuario nuevo.</p>
                            </div>
                        </div>
                        <div class="dpx-field-grid is-wide">
                            <div class="dpx-field">
                                <label for="verifyChannelSelect">Canal de verificación</label>
                                <select id="verifyChannelSelect" class="form-control">
                                    <option value="">Selecciona un canal</option>
                                    ${channels.map((c) => `<option value="${c.id}" ${cfg.channelId === c.id ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="dpx-field">
                                <label for="verifyRoleSelect">Rol de verificado</label>
                                <select id="verifyRoleSelect" class="form-control">
                                    <option value="">Selecciona un rol</option>
                                    ${roles.map((r) => `<option value="${r.id}" ${cfg.roleId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="dpx-field">
                                <label for="verifyNewMemberRoleSelect">Rol al entrar (opcional)</label>
                                <select id="verifyNewMemberRoleSelect" class="form-control">
                                    <option value="">Ninguno</option>
                                    ${roles.map((r) => `<option value="${r.id}" ${cfg.newMemberRoleId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                                </select>
                                <small>Se asigna al unirse; al verificar, este rol se elimina automáticamente.</small>
                            </div>
                        </div>
                        <div class="dpx-toggle-grid" style="margin-top:1rem;">
                            ${dpxRenderToggle({ id: 'verifyEnabled', checked: enabled, title: 'Activar sistema de verificación', description: 'Necesario para que el bot otorgue el rol al reaccionar.' })}
                            ${dpxRenderToggle({ id: 'verifyRemoveOnUnreact', checked: !!cfg.removeRoleOnUnreact, title: 'Quitar rol al quitar reacción', description: 'Si se quita la reacción, también se retira el rol.' })}
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel" data-dpx-panel="embed">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Apariencia del embed</h4>
                                <p>Personaliza el mensaje, color, emoji y texto del pie.</p>
                            </div>
                        </div>
                        <div class="dpx-split">
                            <div>
                                <div class="dpx-field-grid">
                                    <div class="dpx-field">
                                        <label for="verifyEmoji">Emoji de reacción</label>
                                        <input type="text" id="verifyEmoji" class="form-control" value="${escapeHtmlForValue(cfg.emoji || '✅')}" placeholder="✅ o <:emoji:id>">
                                        <small>Acepta unicode o personalizado <code>&lt;:nombre:id&gt;</code>.</small>
                                    </div>
                                    <div class="dpx-field">
                                        <label for="verifyColor">Color del embed</label>
                                        <input type="color" id="verifyColor" class="form-control color-input" value="#${(cfg.color || '7c4dff').replace('#', '')}">
                                    </div>
                                </div>
                                <div class="dpx-field-grid is-wide" style="margin-top:1rem;">
                                    <div class="dpx-field is-full">
                                        <label for="verifyTitle">Título</label>
                                        <input type="text" id="verifyTitle" class="form-control" value="${escapeHtmlForValue(cfg.title || 'Verify')}">
                                    </div>
                                    <div class="dpx-field is-full">
                                        <label for="verifyMessage">Mensaje</label>
                                        <textarea id="verifyMessage" class="form-control" rows="4">${escapeHtmlForValue(cfg.message || '¡Reacciona a este mensaje para ver los demás canales!')}</textarea>
                                        <div class="greeting-var-strip" style="margin-top:0.5rem;">
                                            ${renderChannelVarSelectHtml('verifyMessage')}
                                            ${renderChannelVarSelectHtml('verifyTitle')}
                                            ${renderChannelVarSelectHtml('verifyFooter')}
                                        </div>
                                        <small class="dpx-field-hint">Canales: <code>{#nombre}</code> o «+ Canal»</small>
                                    </div>
                                    <div class="dpx-field is-full">
                                        <label for="verifyFooter">Footer</label>
                                        <input type="text" id="verifyFooter" class="form-control" value="${escapeHtmlForValue(cfg.footer || '')}">
                                    </div>
                                </div>
                            </div>
                            <div class="dpx-preview-card">
                                <h5>Resumen rápido</h5>
                                <div class="dpx-preview-row"><span>Canal</span><strong>${cfg.channelId ? `# ${escapeHtml(channelName)}` : 'No configurado'}</strong></div>
                                <div class="dpx-preview-row"><span>Rol verificado</span><strong>${cfg.roleId ? escapeHtml(roleName) : 'No configurado'}</strong></div>
                                <div class="dpx-preview-row"><span>Rol al entrar</span><strong>${cfg.newMemberRoleId ? escapeHtml(newMemberRoleName) : 'No configurado'}</strong></div>
                                <div class="dpx-preview-row"><span>Emoji</span><strong>${emojiPreview}</strong></div>
                                <div class="dpx-preview-row"><span>Estado</span><strong>${enabled ? 'Activo' : 'Inactivo'}</strong></div>
                                <div class="dpx-preview-row"><span>Publicado</span><strong>${isPublished ? 'Sí' : 'No'}</strong></div>
                                ${isPublished ? `<small style="color:var(--text-muted); word-break:break-all;">ID: <code>${escapeHtml(cfg.messageId)}</code></small>` : ''}
                            </div>
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel" data-dpx-panel="media">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Imagen del embed</h4>
                                <p>Añade una imagen mediante URL externa o subiéndola directamente.</p>
                            </div>
                        </div>
                        <div class="dpx-field-grid is-wide">
                            <div class="dpx-field is-full">
                                <label for="verifyImageUrl">URL de la imagen</label>
                                <input type="url" id="verifyImageUrl" class="form-control" value="${escapeHtmlForValue(cfg.imageUrl || '')}" placeholder="https://...">
                            </div>
                            <div class="dpx-field is-full">
                                <label for="verifyImageFile">O sube una imagen</label>
                                <input type="file" id="verifyImageFile" class="form-control" accept="image/*">
                                <div class="dpx-actions" style="border-top:0; padding-top:0.5rem; margin-top:0.5rem; justify-content:flex-start;">
                                    <button type="button" id="verifyUploadImageBtn" class="btn btn-secondary">Subir imagen</button>
                                    <small id="verifyImageUploadStatus" style="color:var(--text-muted); align-self:center;"></small>
                                </div>
                            </div>
                            <div class="dpx-field is-full">
                                <label for="verifyMessageId">Message ID publicado</label>
                                <input type="text" id="verifyMessageId" class="form-control" value="${escapeHtmlForValue(cfg.messageId || '')}" readonly>
                                <small>Se rellena automáticamente al publicar el embed.</small>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        `;

        bindDpxTabs(container, { persistTabStorageKey: panelTabStorageKey('verify', guildId) });
        bindChannelVarSelects(container);

        const saveBtn = document.getElementById('saveVerifyBtn');
        const publishBtn = document.getElementById('publishVerifyBtn');
        const uploadBtn = document.getElementById('verifyUploadImageBtn');
        const updateVerifyBtn = document.getElementById('updateVerifyEmbedBtn');
        if (saveBtn) saveBtn.addEventListener('click', () => saveVerifyConfig(guildId, true));
        if (publishBtn) publishBtn.addEventListener('click', () => publishVerifyEmbed(guildId));
        if (updateVerifyBtn) updateVerifyBtn.addEventListener('click', () => updateVerifyEmbedInDiscord(guildId));
        if (uploadBtn) uploadBtn.addEventListener('click', () => uploadVerifyImage(guildId));
    } catch (error) {
        console.error('Error cargando panel de verificación:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando sistema de verificación.</div>';
    }
}

function collectTicketConfigFromForm() {
    const adminRoleSelect = document.getElementById('ticketAdminRoles');
    const adminRoleIds = adminRoleSelect
        ? Array.from(adminRoleSelect.selectedOptions || []).map((opt) => opt.value).filter(Boolean)
        : [];

    return {
        enabled: document.getElementById('ticketEnabled')?.checked ?? true,
        panelChannelId: document.getElementById('ticketChannelSelect')?.value || '',
        requestChannelId: document.getElementById('ticketRequestChannelSelect')?.value || '',
        receiptHistoryChannelId: document.getElementById('ticketReceiptHistoryChannelSelect')?.value || '',
        adminRoleIds,
        title: document.getElementById('ticketTitle')?.value || 'Soporte',
        message: document.getElementById('ticketMessage')?.value || 'Presiona el boton para abrir un ticket y explica el motivo de tu solicitud.',
        color: (document.getElementById('ticketColor')?.value || '#7c4dff').replace('#', ''),
        footer: document.getElementById('ticketFooter')?.value || '',
        buttonLabel: document.getElementById('ticketButtonLabel')?.value || 'Solicitar ticket',
        messageId: document.getElementById('ticketMessageId')?.value || ''
    };
}

function getOptionsFromEditor(editorId) {
    const container = document.getElementById(editorId);
    if (!container) return [];
    const rows = Array.from(container.querySelectorAll('.option-row'));
    return rows.map((row) => {
        const label = (row.querySelector('.option-label')?.value || '').toString().trim().slice(0, 100);
        const description = (row.querySelector('.option-desc')?.value || '').toString().trim().slice(0, 200);
        return { label, description };
    }).filter((o) => o.label);
}

function collectTicketConfigFromForm_withOptions() {
    const base = collectTicketConfigFromForm();
    return {
        ...base,
        ticketCategories: getOptionsFromEditor('ticketCategoriesEditor'),
        commonProblems: getOptionsFromEditor('ticketCommonProblemsEditor'),
        minecraftServers: getOptionsFromEditor('ticketMinecraftServersEditor')
    };
}

async function saveTicketConfig(guildId, showSuccessToast = true) {
    const payload = collectTicketConfigFromForm_withOptions();
    if (!payload.panelChannelId) {
        showToast('Selecciona el canal donde se publicara el panel de tickets', 'warning');
        return false;
    }
    if (!payload.adminRoleIds.length) {
        showToast('Selecciona al menos un rol administrador para ver tickets', 'warning');
        return false;
    }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/ticket-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo guardar el sistema de tickets', 'error');
            return false;
        }

        if (document.getElementById('ticketMessageId')) {
            document.getElementById('ticketMessageId').value = data.config?.messageId || payload.messageId || '';
        }
        if (showSuccessToast) showToast('Configuracion de tickets guardada', 'success');
        return true;
    } catch (error) {
        console.error('Error guardando ticket config:', error);
        showToast('Error guardando configuracion de tickets', 'error');
        return false;
    }
}

async function publishTicketPanel(guildId) {
    const saved = await saveTicketConfig(guildId, false);
    if (!saved) return;

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/ticket-publish`, {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo publicar el panel de tickets', 'error');
            return;
        }

        if (document.getElementById('ticketMessageId')) {
            document.getElementById('ticketMessageId').value = data.messageId || '';
        }
        if (document.getElementById('ticketEnabled')) {
            document.getElementById('ticketEnabled').checked = true;
        }
        showToast('Panel de tickets publicado', 'success');
    } catch (error) {
        console.error('Error publicando panel de tickets:', error);
        showToast('Error publicando panel de tickets', 'error');
    }
}

async function updateTicketPanelInDiscord(guildId) {
    const saved = await saveTicketConfig(guildId, false);
    if (!saved) return;

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/ticket-embed-update`, {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo actualizar el panel en Discord', 'error');
            return;
        }
        if (document.getElementById('ticketMessageId') && data.messageId) {
            document.getElementById('ticketMessageId').value = data.messageId;
        }
        showToast('Panel de tickets actualizado en el canal', 'success');
    } catch (error) {
        console.error('Error actualizando panel de tickets:', error);
        showToast('Error actualizando panel de tickets', 'error');
    }
}

async function loadTicketPanel(guildId) {
    const container = document.getElementById('ticketContainer');
    if (!container) return;

    try {
        const [channelsResponse, infoResponse, configResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/info`),
            fetchWithCredentials(`/api/guild/${guildId}/ticket-config`)
        ]);

        if (!channelsResponse.ok || !infoResponse.ok || !configResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar el sistema de tickets.</div>';
            return;
        }

        const channels = (await channelsResponse.json()).filter((c) => c.type === 0);
        setPanelGuildTextChannels(channels);
        const info = await infoResponse.json();
        const cfg = await configResponse.json();
        const selectedRoleIds = new Set(Array.isArray(cfg.adminRoleIds) ? cfg.adminRoleIds.map(String) : []);

        const roles = (Array.isArray(info?.roles) ? info.roles : [])
            .filter((role) => role && role.id && role.name && role.name !== '@everyone')
            .sort((a, b) => (b.position || 0) - (a.position || 0));

        const ticketPanelPublished = !!cfg.messageId;
        const panelChannelName = cfg.panelChannelId ? (channels.find((c) => c.id === cfg.panelChannelId)?.name || 'Desconocido') : 'No configurado';
        const requestChannelName = cfg.requestChannelId
            ? (channels.find((c) => c.id === cfg.requestChannelId)?.name || 'Desconocido')
            : (cfg.panelChannelId ? (channels.find((c) => c.id === cfg.panelChannelId)?.name || 'Mismo canal del panel') : 'No configurado');
        const receiptChannelName = cfg.receiptHistoryChannelId ? (channels.find((c) => c.id === cfg.receiptHistoryChannelId)?.name || 'Desconocido') : 'No configurado';

        const heroHtml = dpxRenderHero({
            kicker: 'Tickets',
            title: 'Centro de Soporte',
            description: 'Diseña el panel de tickets con interfaz moderna, tabs y flujo de solicitud guiada para tus miembros.',
            accent: '#a070ff',
            glow1: 'rgba(160,112,255,0.22)',
            glow2: 'rgba(255,102,196,0.2)',
            iconName: 'chat',
            actionsHtml: `
                <span class="dpx-status-chip ${cfg.enabled ? 'is-on' : 'is-off'}"><span class="dot"></span>${cfg.enabled ? 'Sistema activo' : 'Sistema inactivo'}</span>
                <button type="button" id="saveTicketBtn" class="btn btn-secondary">Guardar configuración</button>
                <button type="button" id="updateTicketPanelBtn" class="btn btn-secondary" ${ticketPanelPublished ? '' : 'disabled'} title="${ticketPanelPublished ? 'Edita el mensaje ya publicado (mismo Message ID)' : 'Publica primero el panel'}">Actualizar en Discord</button>
                <button type="button" id="publishTicketBtn" class="btn btn-primary">Publicar panel</button>
            `
        });

        const statsHtml = `
            <div class="dpx-stats-grid">
                ${dpxRenderStatCard({ label: 'Canal panel', value: cfg.panelChannelId ? `# ${escapeHtml(panelChannelName)}` : 'Sin configurar', hint: 'Donde se publica el embed interactivo', accent: '#a070ff' })}
                ${dpxRenderStatCard({ label: 'Canal solicitudes', value: requestChannelName ? `# ${escapeHtml(requestChannelName)}` : 'No configurado', hint: 'Bandeja de peticiones pendientes', accent: '#7c4dff' })}
                ${dpxRenderStatCard({ label: 'Roles staff', value: `${selectedRoleIds.size}<span class="dpx-stat-pill"> seleccionados</span>`, hint: 'Roles con permisos para gestionar tickets', accent: '#ff78d1' })}
                ${dpxRenderStatCard({ label: 'Estado panel', value: `<span class="dpx-stat-pill ${cfg.messageId ? 'is-on' : 'is-off'}">${cfg.messageId ? 'Publicado' : 'Sin publicar'}</span>`, hint: cfg.messageId ? `Message ID: ${escapeHtml(cfg.messageId)}` : 'Publica el panel para habilitarlo', accent: '#9a6dff' })}
            </div>
        `;

        const tabsHtml = dpxRenderTabs([
            { key: 'ticket-panel', label: 'Panel', iconName: 'sparkles' },
            { key: 'ticket-roles', label: 'Roles y canales', iconName: 'shield' },
            { key: 'ticket-preview', label: 'Vista previa', iconName: 'info' },
            { key: 'ticket-labs', label: 'Labs', iconName: 'calendar' }
        ], 'ticket-panel');

        container.innerHTML = `
            <div class="dpx-panel">
                ${heroHtml}
                ${statsHtml}
                ${tabsHtml}

                <section class="dpx-tab-panel is-active" data-dpx-panel="ticket-panel">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Contenido del embed</h4>
                                <p>Configura el texto principal que verá el usuario antes de abrir una solicitud.</p>
                            </div>
                        </div>
                        <div class="dpx-toggle-grid">
                            ${dpxRenderToggle({ id: 'ticketEnabled', checked: !!cfg.enabled, title: 'Activar sistema de tickets', description: 'Permite procesar solicitudes y crear canales privados.' })}
                        </div>
                        <div class="dpx-field-grid" style="margin-top:1rem;">
                            <div class="dpx-field">
                                <label for="ticketColor">Color del embed</label>
                                <input type="color" id="ticketColor" class="form-control color-input" value="#${(cfg.color || '7c4dff').replace('#', '')}">
                            </div>
                            <div class="dpx-field is-full">
                                <label for="ticketTitle">Título</label>
                                <input type="text" id="ticketTitle" class="form-control" value="${escapeHtmlForValue(cfg.title || 'Soporte')}">
                            </div>
                            <div class="dpx-field is-full">
                                <label for="ticketMessage">Mensaje</label>
                                <textarea id="ticketMessage" class="form-control" rows="4">${escapeHtmlForValue(cfg.message || 'Presiona el boton para abrir un ticket y explica el motivo de tu solicitud.')}</textarea>
                                <div class="greeting-var-strip" style="margin-top:0.5rem;">
                                    ${renderChannelVarSelectHtml('ticketMessage')}
                                    ${renderChannelVarSelectHtml('ticketTitle')}
                                    ${renderChannelVarSelectHtml('ticketFooter')}
                                </div>
                                <small class="dpx-field-hint">Canales: <code>{#nombre}</code> o «+ Canal»</small>
                            </div>
                            <div class="dpx-field is-full">
                                <label>Opciones - Categorías</label>
                                <div id="ticketCategoriesEditor" class="options-editor"></div>
                                <small class="muted">Edita las etiquetas y descripciones que aparecen en el menú desplegable del ticket.</small>
                            </div>
                            <div class="dpx-field is-full">
                                <label>Opciones - Problemas comunes</label>
                                <div id="ticketCommonProblemsEditor" class="options-editor"></div>
                                <small class="muted">Opciones rápidas que los usuarios pueden seleccionar al crear un ticket.</small>
                            </div>
                            <div class="dpx-field is-full">
                                <label>Opciones - Servidores Minecraft</label>
                                <div id="ticketMinecraftServersEditor" class="options-editor"></div>
                                <small class="muted">Lista de servidores/mapas para solicitudes relacionadas con Minecraft.</small>
                            </div>
                            <div class="dpx-field">
                                <label for="ticketButtonLabel">Texto del botón</label>
                                <input type="text" id="ticketButtonLabel" class="form-control" value="${escapeHtmlForValue(cfg.buttonLabel || 'Solicitar ticket')}" maxlength="80">
                            </div>
                            <div class="dpx-field">
                                <label for="ticketFooter">Footer</label>
                                <input type="text" id="ticketFooter" class="form-control" value="${escapeHtmlForValue(cfg.footer || 'Sistema de Tickets')}">
                            </div>
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel" data-dpx-panel="ticket-roles">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Canales y permisos</h4>
                                <p>Define dónde se publica el panel, dónde llegan solicitudes y qué roles pueden gestionarlas.</p>
                            </div>
                        </div>
                        <div class="dpx-field-grid">
                            <div class="dpx-field">
                                <label for="ticketChannelSelect">Canal para publicar panel</label>
                                <select id="ticketChannelSelect" class="form-control">
                                    <option value="">Selecciona un canal</option>
                                    ${channels.map((c) => `<option value="${c.id}" ${cfg.panelChannelId === c.id ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="dpx-field">
                                <label for="ticketRequestChannelSelect">Canal para peticiones pendientes</label>
                                <select id="ticketRequestChannelSelect" class="form-control">
                                    <option value="">Usar canal del panel</option>
                                    ${channels.map((c) => `<option value="${c.id}" ${cfg.requestChannelId === c.id ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="dpx-field is-full">
                                <label for="ticketReceiptHistoryChannelSelect">Canal de historial de comprobantes</label>
                                <select id="ticketReceiptHistoryChannelSelect" class="form-control">
                                    <option value="">No reenviar al servidor</option>
                                    ${channels.map((c) => `<option value="${c.id}" ${cfg.receiptHistoryChannelId === c.id ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                                </select>
                            </div>
                            <div class="dpx-field is-full">
                                <label for="ticketAdminRoles">Roles que pueden gestionar solicitudes</label>
                                <select id="ticketAdminRoles" class="form-control" multiple size="7">
                                    ${roles.map((r) => `<option value="${r.id}" ${selectedRoleIds.has(String(r.id)) ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                                </select>
                                <small>Mantén <code>Ctrl</code> (o <code>Cmd</code>) para seleccionar varios roles.</small>
                            </div>
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel" data-dpx-panel="ticket-preview">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Vista rápida de configuración</h4>
                                <p>Resumen actual para validar que todo está listo antes de publicar.</p>
                            </div>
                        </div>
                        <div class="dpx-field-grid is-wide">
                            <div class="dpx-field"><label>Canal panel</label><input class="form-control" value="# ${escapeHtmlForValue(panelChannelName)}" readonly></div>
                            <div class="dpx-field"><label>Canal solicitudes</label><input class="form-control" value="# ${escapeHtmlForValue(requestChannelName)}" readonly></div>
                            <div class="dpx-field"><label>Canal historial</label><input class="form-control" value="# ${escapeHtmlForValue(receiptChannelName)}" readonly></div>
                            <div class="dpx-field"><label>Roles staff</label><input class="form-control" value="${selectedRoleIds.size}" readonly></div>
                            <div class="dpx-field is-full"><label>Message ID publicado</label><input type="text" id="ticketMessageId" class="form-control" value="${escapeHtmlForValue(cfg.messageId || '')}" readonly></div>
                        </div>
                    </div>
                </section>

                <section class="dpx-tab-panel" data-dpx-panel="ticket-labs">
                    <div class="dpx-section">
                        <div class="dpx-section-head">
                            <div class="dpx-section-head-text">
                                <h4>Funciones en construcción</h4>
                                <p>Estamos preparando mejoras avanzadas para tickets con automatizaciones más inteligentes.</p>
                            </div>
                        </div>
                        <div class="dpx-tip">
                            ${dpxIcon('sparkles')}
                            <div>
                                <strong>Próximamente:</strong> formularios dinámicos por categoría, SLA por prioridad, auto-asignación por turno y plantillas por tipo de ticket.
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        `;

        bindDpxTabs(container, { persistTabStorageKey: panelTabStorageKey('ticket', guildId) });
        bindChannelVarSelects(container);

        const saveBtn = document.getElementById('saveTicketBtn');
        const publishBtn = document.getElementById('publishTicketBtn');
        const updateTicketBtn = document.getElementById('updateTicketPanelBtn');
        if (saveBtn) saveBtn.addEventListener('click', () => saveTicketConfig(guildId, true));
        if (publishBtn) publishBtn.addEventListener('click', () => publishTicketPanel(guildId));
        if (updateTicketBtn) updateTicketBtn.addEventListener('click', () => updateTicketPanelInDiscord(guildId));
    } catch (error) {
        console.error('Error cargando panel de tickets:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando sistema de tickets.</div>';
    }
}

function getLevelingRewardRows() {
    return Array.from(document.querySelectorAll('#levelRewardRows .level-reward-card')).map((row) => {
        const levelInput = row.querySelector('.level-reward-level');
        const roleSelect = row.querySelector('.level-reward-role');
        return {
            level: Math.max(1, Number.parseInt(levelInput?.value || '1', 10) || 1),
            roleId: roleSelect?.value || ''
        };
    }).filter((item) => item.roleId);
}

function collectLevelingConfigFromForm() {
    return {
        enabled: document.getElementById('levelingEnabled')?.checked ?? false,
        messageXpEnabled: document.getElementById('levelingMessageEnabled')?.checked ?? true,
        voiceXpEnabled: document.getElementById('levelingVoiceEnabled')?.checked ?? true,
        messageCooldownMs: Math.max(10000, (Number.parseInt(document.getElementById('levelingMsgCooldown')?.value || '45', 10) || 45) * 1000),
        messageXpMin: Math.max(1, Number.parseInt(document.getElementById('levelingMsgXpMin')?.value || '10', 10) || 10),
        messageXpMax: Math.max(1, Number.parseInt(document.getElementById('levelingMsgXpMax')?.value || '16', 10) || 16),
        voiceXpPerMinute: Math.max(1, Number.parseInt(document.getElementById('levelingVoiceXp')?.value || '6', 10) || 6),
        voiceRequirePeers: document.getElementById('levelingVoicePeers')?.checked ?? true,
        xpMultiplier: levelingSanitizeXpMultiplier(document.getElementById('levelingXpMultiplierCustom')?.value ?? 1),
        difficulty: {
            baseXp: Math.max(50, Number.parseInt(document.getElementById('levelingBaseXp')?.value || '280', 10) || 280),
            exponent: Math.max(1.2, Number.parseFloat(document.getElementById('levelingExponent')?.value || '2.08') || 2.08)
        },
        roleRewards: getLevelingRewardRows(),
        levelUpAnnounceChannelId: document.getElementById('levelUpAnnounceChannelId')?.value || ''
    };
}

function renderLevelRewardRows(roles, rewards) {
    const rows = Array.isArray(rewards) ? rewards : [];
    if (!rows.length) {
        return `
            <div class="levels-empty-card">
                <div class="levels-empty-icon">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 15l-3 3m6-3l3 3M6 9V5a2 2 0 012-2h8a2 2 0 012 2v4"/>
                        <path d="M5 9h14l-1 7a3 3 0 01-3 3H9a3 3 0 01-3-3L5 9z"/>
                    </svg>
                </div>
                <div>
                    <h5>Aún no hay roles por nivel</h5>
                    <p>Agrega recompensas automáticas para premiar a quienes alcancen cierto nivel.</p>
                </div>
            </div>
        `;
    }

    return rows.map((reward, index) => renderLevelRewardCard(roles, reward, index)).join('');
}

function renderLevelRewardCard(roles, reward, index) {
    const level = Math.max(1, Number.parseInt(reward?.level || '1', 10) || 1);
    const selectedRole = roles.find((r) => String(r.id) === String(reward?.roleId));
    const roleColor = selectedRole?.color ? `#${Number(selectedRole.color).toString(16).padStart(6, '0')}` : '#9a6dff';

    return `
        <div class="level-reward-card" data-index="${index}">
            <div class="level-reward-card-badge" style="--reward-color:${roleColor};">Nv ${level}</div>
            <div class="level-reward-card-fields">
                <div class="level-reward-field">
                    <label>Nivel requerido</label>
                    <input type="number" min="1" max="500" class="form-control level-reward-level" value="${level}">
                </div>
                <div class="level-reward-field level-reward-field--role">
                    <label>Rol a otorgar</label>
                    <select class="form-control level-reward-role">
                        <option value="">Selecciona un rol</option>
                        ${roles.map((role) => {
                            const color = role.color ? `#${Number(role.color).toString(16).padStart(6, '0')}` : null;
                            const style = color ? ` style="color:${color};"` : '';
                            return `<option value="${role.id}"${style} ${String(reward?.roleId) === String(role.id) ? 'selected' : ''}>${escapeHtml(role.name)}</option>`;
                        }).join('')}
                    </select>
                </div>
            </div>
            <button type="button" class="level-reward-remove" title="Eliminar recompensa" aria-label="Eliminar recompensa">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
            </button>
        </div>
    `;
}

/* ==== Leveling math mirror (client-side) ======================= */
const LEVEL_CURVE_PRESETS = [
    {
        id: 'casual',
        name: 'Casual',
        baseXp: 120,
        exponent: 1.6,
        description: 'Progresión amable. Subir el nivel 10 en pocos días de actividad.'
    },
    {
        id: 'balanced',
        name: 'Equilibrado',
        baseXp: 200,
        exponent: 1.95,
        description: 'Balance entre accesibilidad y desafío. Recomendado por defecto.'
    },
    {
        id: 'challenging',
        name: 'Exigente',
        baseXp: 280,
        exponent: 2.2,
        description: 'Los niveles altos requieren semanas reales de actividad constante.'
    },
    {
        id: 'odyssey',
        name: 'Odisea',
        baseXp: 400,
        exponent: 2.5,
        description: 'Hardcore. Llegar al Núcleo es un logro de meses. Premia activismo real.'
    }
];

const LEVEL_TIERS = [
    { id: 'iniciado', name: 'Iniciado', minLevel: 1, maxLevel: 4, color: '#94a3b8', accent: 'rgba(148, 163, 184, 0.55)', icon: 'seed', tagline: 'Primeros pasos' },
    { id: 'explorador', name: 'Explorador', minLevel: 5, maxLevel: 14, color: '#38bdf8', accent: 'rgba(56, 189, 248, 0.55)', icon: 'compass', tagline: 'Conociendo el servidor' },
    { id: 'guardian', name: 'Guardián', minLevel: 15, maxLevel: 29, color: '#a78bfa', accent: 'rgba(167, 139, 250, 0.55)', icon: 'shield', tagline: 'Miembro consistente' },
    { id: 'nucleo', name: 'Núcleo', minLevel: 30, maxLevel: 49, color: '#f472b6', accent: 'rgba(244, 114, 182, 0.55)', icon: 'atom', tagline: 'Columna de la comunidad' },
    { id: 'arcano', name: 'Arcano', minLevel: 50, maxLevel: 74, color: '#f59e0b', accent: 'rgba(245, 158, 11, 0.55)', icon: 'diamond', tagline: 'Veterano de élite' },
    { id: 'leyenda', name: 'Leyenda', minLevel: 75, maxLevel: Infinity, color: '#ef4444', accent: 'rgba(239, 68, 68, 0.6)', icon: 'flame', tagline: 'Presencia mítica' }
];

function tierForLevel(level) {
    const lvl = Math.max(1, Number.parseInt(level, 10) || 1);
    return LEVEL_TIERS.find((tier) => lvl >= tier.minLevel && lvl <= tier.maxLevel) || LEVEL_TIERS[0];
}

function renderTierIcon(iconId, size = 20) {
    const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
    switch (iconId) {
        case 'seed':
            return `<svg ${common}><path d="M12 22V10"/><path d="M12 10c-3 0-5-2-5-5 3 0 5 2 5 5z"/><path d="M12 10c3 0 5-2 5-5-3 0-5 2-5 5z"/></svg>`;
        case 'compass':
            return `<svg ${common}><circle cx="12" cy="12" r="9"/><polygon points="16 8 13.5 13.5 8 16 10.5 10.5 16 8" fill="currentColor" stroke="none"/></svg>`;
        case 'shield':
            return `<svg ${common}><path d="M12 2l8 3v6c0 5-3.5 9.5-8 11-4.5-1.5-8-6-8-11V5l8-3z"/><path d="M9 12l2 2 4-4"/></svg>`;
        case 'atom':
            return `<svg ${common}><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)"/></svg>`;
        case 'diamond':
            return `<svg ${common}><path d="M6 3h12l4 6-10 12L2 9z"/><path d="M8 9h8"/><path d="M6 3l4 6 2 12"/><path d="M18 3l-4 6-2 12"/></svg>`;
        case 'flame':
            return `<svg ${common}><path d="M12 2s4 5 4 9a4 4 0 01-8 0c0-2 1-3 1-3s-3 2-3 6a6 6 0 0012 0c0-6-6-12-6-12z"/></svg>`;
        default:
            return '';
    }
}

function renderPodiumMedal(rank) {
    if (![1, 2, 3].includes(Number(rank))) return '';
    const titles = { 1: '1.er lugar', 2: '2.º lugar', 3: '3.er lugar' };
    const crown = rank === 1
        ? `<span class="podium-ribbon__crown" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M5 17l-1-9 5 3 3-5 3 5 5-3-1 9H5z"/></svg>
           </span>`
        : '';
    return `
        <div class="podium-ribbon podium-ribbon--${rank}" role="img" aria-label="${titles[rank]}">
            ${crown}
            <div class="podium-ribbon__badge">
                <span class="podium-ribbon__shine" aria-hidden="true"></span>
                <span class="podium-ribbon__num">${rank}</span>
            </div>
            <div class="podium-ribbon__tails" aria-hidden="true">
                <span class="podium-ribbon__tail podium-ribbon__tail--left"></span>
                <span class="podium-ribbon__tail podium-ribbon__tail--right"></span>
            </div>
        </div>
    `;
}

function renderPodiumAvatarWrap(rank, avatarMarkup) {
    return `
        <div class="levels-podium-avatar-wrap">
            <div class="levels-podium-avatar-ring">
                ${avatarMarkup}
                ${renderPodiumMedal(rank)}
            </div>
        </div>
    `;
}

function renderTierBadge(tier, size = 'sm') {
    if (!tier) return '';
    const iconSize = size === 'lg' ? 28 : size === 'md' ? 18 : 14;
    return `
        <span class="levels-tier-badge levels-tier-badge--${size}" style="--tier-color:${tier.color}; --tier-accent:${tier.accent};" title="${escapeHtml(tier.tagline)}">
            <span class="levels-tier-badge-icon">${renderTierIcon(tier.icon, iconSize)}</span>
            <span class="levels-tier-badge-name">${tier.name}</span>
        </span>
    `;
}

function levelingSanitizeDifficulty(raw) {
    const baseXp = Math.max(50, Math.min(5000, Number.parseInt(raw?.baseXp ?? 280, 10) || 280));
    const exponentRaw = Number.parseFloat(raw?.exponent ?? 2.08);
    const exponent = Number.isFinite(exponentRaw) ? Math.max(1.2, Math.min(3.5, exponentRaw)) : 2.08;
    return { baseXp, exponent };
}

const LEVEL_XP_MULTIPLIER_PRESETS = [
    { value: 1, name: '1× Normal', description: 'Sin bonificación extra.' },
    { value: 2, name: '2× Doble', description: 'El doble de XP por mensajes y voz.' },
    { value: 3, name: '3× Triple', description: 'Ideal para eventos de fin de semana.' },
    { value: 5, name: '5× Boost', description: 'Subida muy rápida; úsalo con moderación.' }
];

function levelingSanitizeXpMultiplier(raw) {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(20, Math.max(0.5, Math.round(parsed * 100) / 100));
}

function levelingFormatXpMultiplier(mult) {
    const safe = levelingSanitizeXpMultiplier(mult);
    if (safe === 1) return '1×';
    const label = safe % 1 === 0 ? String(safe) : String(safe).replace(/\.?0+$/, '');
    return `${label}×`;
}

function isXpMultiplierPresetActive(current, presetValue) {
    return Math.abs(levelingSanitizeXpMultiplier(current) - presetValue) < 0.01;
}

function renderXpMultiplierPresets(currentMultiplier) {
    const current = levelingSanitizeXpMultiplier(currentMultiplier);
    return `
        <div class="levels-presets levels-xp-mult-presets" id="levelsXpMultiplierWrap">
            ${LEVEL_XP_MULTIPLIER_PRESETS.map((preset) => {
                const isActive = isXpMultiplierPresetActive(current, preset.value);
                return `
                    <button type="button" class="levels-preset ${isActive ? 'is-active' : ''}" data-xp-mult="${preset.value}">
                        <div class="levels-preset-head">
                            <span class="levels-preset-name">${escapeHtml(preset.name)}</span>
                            ${isActive ? '<span class="levels-preset-dot"></span>' : ''}
                        </div>
                        <div class="levels-preset-desc">${escapeHtml(preset.description)}</div>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

function levelingXpForLevel(level, difficulty) {
    const d = levelingSanitizeDifficulty(difficulty);
    const n = Math.max(1, Number.parseInt(level, 10) || 1);
    return Math.floor(d.baseXp * Math.pow(n, d.exponent));
}

function levelingTotalXpForLevel(level, difficulty) {
    const n = Math.max(0, Number.parseInt(level, 10) || 0);
    let total = 0;
    for (let i = 1; i <= n; i += 1) total += levelingXpForLevel(i, difficulty);
    return total;
}

function levelingFormatNumber(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
    return Math.round(n).toLocaleString('es-ES');
}

function levelingEstimateTimeToLevel(targetLevel, difficulty, config) {
    const totalXp = levelingTotalXpForLevel(targetLevel, difficulty);
    const mult = levelingSanitizeXpMultiplier(config?.xpMultiplier ?? 1);
    const msgMin = Math.max(1, Number.parseInt(config?.messageXpMin || 10, 10) || 10);
    const msgMax = Math.max(msgMin, Number.parseInt(config?.messageXpMax || 16, 10) || 16);
    const avgMsgXp = ((msgMin + msgMax) / 2) * mult;
    const cooldownSec = Math.max(10, Math.round((config?.messageCooldownMs || 45000) / 1000));
    const msgsNeeded = Math.ceil(totalXp / avgMsgXp);
    const msgHours = (msgsNeeded * cooldownSec) / 3600;

    const voiceXpPerMin = Math.max(1, Number.parseInt(config?.voiceXpPerMinute || 6, 10) || 6) * mult;
    const voiceHours = totalXp / voiceXpPerMin / 60;

    return { totalXp, msgsNeeded, msgHours, voiceHours, xpMultiplier: mult };
}

function renderLevelCurveSvg(difficulty, maxLevel = 75) {
    const width = 560;
    const height = 200;
    const padding = { top: 18, right: 12, bottom: 26, left: 40 };
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const points = [];
    let maxY = 0;
    for (let lvl = 1; lvl <= maxLevel; lvl += 1) {
        const xp = levelingXpForLevel(lvl, difficulty);
        points.push({ lvl, xp });
        if (xp > maxY) maxY = xp;
    }
    if (maxY <= 0) maxY = 1;

    const xStep = innerW / (maxLevel - 1);
    const pathData = points.map((p, i) => {
        const x = padding.left + i * xStep;
        const y = padding.top + innerH - (p.xp / maxY) * innerH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const areaPath = `${pathData} L${padding.left + innerW},${padding.top + innerH} L${padding.left},${padding.top + innerH} Z`;

    const yTicks = [0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = padding.top + innerH - innerH * ratio;
        const label = levelingFormatNumber(maxY * ratio);
        return `
            <line x1="${padding.left}" y1="${y}" x2="${padding.left + innerW}" y2="${y}" class="levels-curve-grid"/>
            <text x="${padding.left - 6}" y="${y + 3}" class="levels-curve-axis" text-anchor="end">${label}</text>
        `;
    }).join('');

    const tierMarkers = LEVEL_TIERS
        .filter((tier) => tier.minLevel > 1 && tier.minLevel <= maxLevel)
        .map((tier) => {
            const i = tier.minLevel - 1;
            const x = padding.left + i * xStep;
            return `
                <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + innerH}" stroke="${tier.color}" stroke-opacity="0.35" stroke-dasharray="3 3" stroke-width="1"/>
                <rect x="${x - 18}" y="${padding.top - 14}" width="36" height="14" rx="7" fill="${tier.color}" fill-opacity="0.18" stroke="${tier.color}" stroke-opacity="0.55"/>
                <text x="${x}" y="${padding.top - 4}" text-anchor="middle" class="levels-curve-tier-label" fill="${tier.color}">${tier.name}</text>
            `;
        }).join('');

    const xTickLevels = [1, Math.round(maxLevel * 0.25), Math.round(maxLevel * 0.5), Math.round(maxLevel * 0.75), maxLevel];
    const xTicks = xTickLevels.map((lvl) => {
        const i = lvl - 1;
        const x = padding.left + i * xStep;
        return `<text x="${x}" y="${height - 8}" class="levels-curve-axis" text-anchor="middle">Nv ${lvl}</text>`;
    }).join('');

    return `
        <svg class="levels-curve-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Curva de dificultad">
            <defs>
                <linearGradient id="levelsCurveFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="rgba(154, 109, 255, 0.55)"/>
                    <stop offset="100%" stop-color="rgba(154, 109, 255, 0.02)"/>
                </linearGradient>
                <linearGradient id="levelsCurveStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#9a6dff"/>
                    <stop offset="100%" stop-color="#ff78d1"/>
                </linearGradient>
            </defs>
            ${yTicks}
            <path d="${areaPath}" fill="url(#levelsCurveFill)"/>
            <path d="${pathData}" fill="none" stroke="url(#levelsCurveStroke)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
            ${tierMarkers}
            ${xTicks}
        </svg>
    `;
}

function renderCurvePresets(currentDifficulty) {
    const current = levelingSanitizeDifficulty(currentDifficulty);
    return `
        <div class="levels-presets">
            ${LEVEL_CURVE_PRESETS.map((preset) => {
                const isActive = Math.abs(current.baseXp - preset.baseXp) <= 5 && Math.abs(current.exponent - preset.exponent) <= 0.05;
                return `
                    <button type="button" class="levels-preset ${isActive ? 'is-active' : ''}" data-preset="${preset.id}" data-base="${preset.baseXp}" data-exp="${preset.exponent}">
                        <div class="levels-preset-head">
                            <span class="levels-preset-name">${preset.name}</span>
                            ${isActive ? '<span class="levels-preset-dot"></span>' : ''}
                        </div>
                        <div class="levels-preset-values">base ${preset.baseXp} · exp ${preset.exponent.toFixed(2)}</div>
                        <div class="levels-preset-desc">${escapeHtml(preset.description)}</div>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

function levelingRoleColorHex(role) {
    if (!role) return null;
    const raw = Number(role.color || 0);
    if (!raw) return null;
    return `#${raw.toString(16).padStart(6, '0')}`;
}

function tierRolesMap(rewards, roles) {
    const map = {};
    const rewardList = Array.isArray(rewards) ? rewards.filter((r) => r && r.roleId) : [];
    for (const tier of LEVEL_TIERS) {
        const matching = rewardList
            .filter((r) => {
                const lvl = Number(r.level) || 0;
                return lvl >= tier.minLevel && lvl <= tier.maxLevel;
            })
            .sort((a, b) => Number(a.level) - Number(b.level));
        if (matching.length) {
            const reward = matching[0];
            const role = (roles || []).find((r) => String(r.id) === String(reward.roleId));
            if (role) map[tier.id] = { role, reward, extra: matching.length - 1 };
        }
    }
    return map;
}

function tierStatsFromLeaderboard(leaderboard) {
    const stats = { total: 0, perTier: {}, sumLevel: 0, avgLevel: 0, maxLevel: 0 };
    const rows = Array.isArray(leaderboard?.leaderboard) ? leaderboard.leaderboard : [];
    stats.total = rows.length;
    for (const row of rows) {
        const lvl = Math.max(1, Number(row?.level) || 1);
        const tier = tierForLevel(lvl);
        stats.perTier[tier.id] = (stats.perTier[tier.id] || 0) + 1;
        stats.sumLevel += lvl;
        if (lvl > stats.maxLevel) stats.maxLevel = lvl;
    }
    if (rows.length) stats.avgLevel = stats.sumLevel / rows.length;
    return stats;
}

function renderTierLadder(difficulty, options = {}) {
    const { config = {}, leaderboard = null, roles = [] } = options;
    const rewards = Array.isArray(config.roleRewards) ? config.roleRewards : [];
    const roleMap = tierRolesMap(rewards, roles);
    const stats = tierStatsFromLeaderboard(leaderboard);
    const totalUsers = stats.total;
    const hasLeaderboard = Array.isArray(leaderboard?.leaderboard);

    const cards = LEVEL_TIERS.map((tier) => {
        const xp = levelingTotalXpForLevel(tier.minLevel, difficulty);
        const rangeLabel = tier.maxLevel === Infinity ? `Nv ${tier.minLevel}+` : `Nv ${tier.minLevel}–${tier.maxLevel}`;
        const countInTier = stats.perTier[tier.id] || 0;
        const percent = totalUsers ? (countInTier / totalUsers) * 100 : 0;

        const roleInfo = roleMap[tier.id];
        const roleHex = levelingRoleColorHex(roleInfo?.role) || tier.color;
        const rolePillHtml = roleInfo
            ? `
                <span class="levels-tier-role is-set" style="--tier-role-color:${roleHex};" title="Rol asignado a este rango">
                    <span class="levels-tier-role-dot"></span>
                    <span class="levels-tier-role-name">@${escapeHtml(roleInfo.role.name)}</span>
                    <span class="levels-tier-role-lvl">Nv ${roleInfo.reward.level}</span>
                    ${roleInfo.extra > 0 ? `<span class="levels-tier-role-extra">+${roleInfo.extra}</span>` : ''}
                </span>
            `
            : `
                <span class="levels-tier-role is-empty" title="No hay rol asignado en este rango">
                    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M7 13l6-6M7 7l6 6"/></svg>
                    Sin rol asignado
                </span>
            `;

        const distributionHtml = hasLeaderboard
            ? `
                <div class="levels-tier-card-dist">
                    <div class="levels-tier-card-dist-head">
                        <span><strong>${countInTier}</strong> ${countInTier === 1 ? 'miembro' : 'miembros'}</span>
                        <span>${totalUsers ? percent.toFixed(0) : 0}%</span>
                    </div>
                    <div class="levels-tier-card-dist-bar">
                        <div class="levels-tier-card-dist-fill" style="width:${Math.min(100, percent)}%;"></div>
                    </div>
                </div>
            `
            : '';

        return `
            <div class="levels-tier-card ${roleInfo ? 'has-role' : 'no-role'}" style="--tier-color:${tier.color}; --tier-accent:${tier.accent};">
                <div class="levels-tier-card-icon">${renderTierIcon(tier.icon, 26)}</div>
                <div class="levels-tier-card-body">
                    <div class="levels-tier-card-name">${tier.name}</div>
                    <div class="levels-tier-card-range">${rangeLabel}</div>
                    <div class="levels-tier-card-tagline">${escapeHtml(tier.tagline)}</div>
                    ${rolePillHtml}
                    ${distributionHtml}
                </div>
                <div class="levels-tier-card-threshold">
                    <span class="levels-tier-card-threshold-label">Umbral</span>
                    <span class="levels-tier-card-threshold-value">${levelingFormatNumber(xp)} XP</span>
                </div>
            </div>
        `;
    }).join('');

    const assigned = Object.keys(roleMap).length;
    const ladderSummary = `
        <div class="levels-tier-ladder-summary">
            <span class="levels-tier-sum-pill ${assigned === LEVEL_TIERS.length ? 'is-complete' : assigned > 0 ? 'is-partial' : 'is-empty'}">
                ${assigned}/${LEVEL_TIERS.length} rangos con rol
            </span>
            ${hasLeaderboard ? `<span class="levels-tier-sum-pill">${totalUsers} miembros rastreados</span>` : ''}
            ${stats.maxLevel ? `<span class="levels-tier-sum-pill">Nivel máximo actual: Nv ${stats.maxLevel}</span>` : ''}
        </div>
    `;

    return `${ladderSummary}<div class="levels-tier-ladder">${cards}</div>`;
}

function renderLevelMilestones(difficulty, config) {
    const milestones = [5, 10, 25, 50].map((lvl) => {
        const info = levelingEstimateTimeToLevel(lvl, difficulty, config);
        const tier = tierForLevel(lvl);
        return `
            <div class="levels-milestone-card" style="--tier-color:${tier.color};--tier-accent:${tier.accent};">
                <div class="levels-milestone-level">Nv ${lvl}</div>
                <div class="levels-milestone-xp">${levelingFormatNumber(info.totalXp)} XP</div>
                <div class="levels-milestone-estimates">
                    <span title="Tiempo aprox. solo con mensajes al ritmo de cooldown"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> ${info.msgHours < 1 ? `${Math.round(info.msgHours * 60)}min` : `${info.msgHours.toFixed(1)}h`}</span>
                    <span title="Tiempo aprox. solo en voz"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> ${info.voiceHours < 1 ? `${Math.round(info.voiceHours * 60)}min` : `${info.voiceHours.toFixed(1)}h`}</span>
                </div>
            </div>
        `;
    }).join('');

    return `<div class="levels-milestones">${milestones}</div>`;
}

function renderLevelsStatsHeader(config, leaderboard, roles = []) {
    const enabled = config?.enabled === true;
    const totalUsers = Number(leaderboard?.totalTrackedUsers || (Array.isArray(leaderboard?.leaderboard) ? leaderboard.leaderboard.length : 0));
    const topUser = Array.isArray(leaderboard?.leaderboard) ? leaderboard.leaderboard[0] : null;
    const msgOn = config?.messageXpEnabled !== false;
    const voiceOn = config?.voiceXpEnabled !== false;
    const diff = levelingSanitizeDifficulty(config?.difficulty);
    const xpMult = levelingSanitizeXpMultiplier(config?.xpMultiplier ?? 1);

    const rewards = Array.isArray(config?.roleRewards) ? config.roleRewards.filter((r) => r && r.roleId) : [];
    const roleMap = tierRolesMap(rewards, roles);
    const tiersAssigned = Object.keys(roleMap).length;
    const stats = tierStatsFromLeaderboard(leaderboard);
    const avgLevelLabel = stats.avgLevel ? `Nv ${stats.avgLevel.toFixed(1)}` : 'Nv —';
    const topTierResolved = topUser ? tierForLevel(topUser.level) : null;

    return `
        <div class="levels-stats-grid dpx-stats-grid">
            <div class="levels-stat-card ${enabled ? 'is-active' : 'is-inactive'}">
                <div class="levels-stat-label">Estado</div>
                <div class="levels-stat-value">
                    <span class="levels-stat-pill">${enabled ? '✓ Activo' : '○ Desactivado'}</span>
                </div>
                <div class="levels-stat-hint">${enabled ? 'Los miembros están ganando XP' : 'Activa el sistema para empezar a contar XP'}</div>
            </div>
            <div class="levels-stat-card">
                <div class="levels-stat-label">Fuentes de XP</div>
                <div class="levels-stat-value levels-stat-sources">
                    <span class="levels-source-chip ${msgOn ? 'is-on' : ''}" title="XP por mensajes">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                        Mensajes
                    </span>
                    <span class="levels-source-chip ${voiceOn ? 'is-on' : ''}" title="XP por voz">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                        Voz
                    </span>
                </div>
            </div>
            <div class="levels-stat-card">
                <div class="levels-stat-label">Usuarios rastreados</div>
                <div class="levels-stat-value">${levelingFormatNumber(totalUsers)}</div>
                <div class="levels-stat-hint">${stats.avgLevel ? `Nivel promedio ${avgLevelLabel}` : 'Miembros con XP acumulado'}</div>
            </div>
            <div class="levels-stat-card levels-stat-card--top${topTierResolved ? ' has-tier-accent' : ''}"${topTierResolved ? ` style="--tier-color:${topTierResolved.color};--tier-accent:${topTierResolved.accent};"` : ''}>
                <div class="levels-stat-label">Top actual</div>
                ${topUser ? `
                    <div class="levels-top-user" style="--tier-color:${topTierResolved.color};">
                        ${topUser.avatar ? `<img src="${topUser.avatar}" alt="avatar">` : `<div class="levels-top-user-placeholder">${(topUser.tag || 'U').charAt(0).toUpperCase()}</div>`}
                        <div>
                            <div class="levels-top-user-name">${escapeHtml(topUser.tag || topUser.username || 'Usuario')}</div>
                            <div class="levels-top-user-meta">Nv ${topUser.level} · ${levelingFormatNumber(topUser.xp)} XP</div>
                            ${renderTierBadge(topTierResolved, 'sm')}
                        </div>
                    </div>
                    ` : `<div class="levels-stat-hint">Aún sin ranking</div>`}
            </div>
            <div class="levels-stat-card levels-stat-card--rewards">
                <div class="levels-stat-label">Rangos con rol</div>
                <div class="levels-stat-value">
                    <span class="levels-stat-pill ${tiersAssigned === LEVEL_TIERS.length ? 'is-complete' : tiersAssigned > 0 ? '' : 'is-empty'}">${tiersAssigned}/${LEVEL_TIERS.length}</span>
                </div>
                <div class="levels-stat-hint">${rewards.length} recompensa${rewards.length === 1 ? '' : 's'} configurada${rewards.length === 1 ? '' : 's'}</div>
            </div>
            <div class="levels-stat-card levels-stat-card--diff">
                <div class="levels-stat-label">Dificultad</div>
                <div class="levels-stat-value">base ${levelingFormatNumber(diff.baseXp)} · exp ${diff.exponent.toFixed(2)}</div>
                <div class="levels-stat-hint">XP Nv 10 ≈ ${levelingFormatNumber(levelingTotalXpForLevel(10, diff))}</div>
            </div>
            <div class="levels-stat-card ${xpMult > 1 ? 'is-active' : ''}">
                <div class="levels-stat-label">Multiplicador XP</div>
                <div class="levels-stat-value"><span class="levels-stat-pill ${xpMult > 1 ? '' : 'is-empty'}">${levelingFormatXpMultiplier(xpMult)}</span></div>
                <div class="levels-stat-hint">${xpMult > 1 ? 'Boost activo en mensajes y voz' : 'Sin bonificación (1×)'}</div>
            </div>
        </div>
    `;
}

function renderLeaderboardPodium(entries) {
    const order = [entries[1], entries[0], entries[2]];
    return `
        <div class="levels-podium">
            ${order.map((entry) => {
                if (!entry) return '<div class="levels-podium-slot is-empty"></div>';
                const realRank = entries.indexOf(entry) + 1;
                const positionClass = realRank === 1 ? 'levels-podium-slot--first' : realRank === 2 ? 'levels-podium-slot--second' : 'levels-podium-slot--third';
                const tier = tierForLevel(entry.level);
                const progress = Math.max(0, Math.min(100, Number(entry.progressPercent) || 0));
                return `
                        <div class="levels-podium-slot ${positionClass}">
                        ${renderPodiumAvatarWrap(realRank, entry.avatar
                            ? `<img src="${entry.avatar}" alt="avatar" class="levels-podium-avatar" style="--tier-color:${tier.color};">`
                            : `<div class="levels-podium-avatar levels-podium-avatar--placeholder" style="--tier-color:${tier.color};">${(entry.tag || 'U').charAt(0).toUpperCase()}</div>`
                        )}
                        <div class="levels-podium-name">${escapeHtml(entry.tag || entry.username || 'Usuario')}</div>
                        <div class="levels-podium-level">Nivel ${entry.level}</div>
                        <div class="levels-podium-progress-wrap">
                            <div class="levels-podium-progress">
                                <div class="levels-podium-progress-bar" style="width:${progress}%; --tier-color:${tier.color};"></div>
                            </div>
                            <span class="levels-podium-progress-pct">${formatLeaderboardProgressPercent(progress)}</span>
                        </div>
                        <div class="levels-podium-xp">${levelingFormatNumber(entry.xp)} XP</div>
                        ${renderTierBadge(tier, 'sm')}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function formatLeaderboardProgressPercent(value) {
    const p = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    return `${p}%`;
}

function buildLeaderboardHtml(payload) {
    const rows = Array.isArray(payload?.leaderboard) ? payload.leaderboard : [];
    if (!rows.length) {
        return `
            <div class="levels-empty-card">
                <div class="levels-empty-icon">
                    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                    </svg>
                </div>
                <div>
                    <h5>Todavía no hay datos</h5>
                    <p>Cuando los miembros empiecen a ganar XP aparecerán aquí.</p>
                </div>
            </div>
        `;
    }

    const top3 = rows.slice(0, 3);
    const rest = rows.slice(3);

    const restHtml = rest.map((item, idx) => {
        const rank = idx + 4;
        const progress = Math.max(0, Math.min(100, Number(item.progressPercent) || 0));
        const progressLabel = formatLeaderboardProgressPercent(progress);
        const tier = tierForLevel(item.level);
        return `
            <div class="levels-rank-row" style="--tier-color:${tier.color};">
                <div class="levels-rank-number">#${rank}</div>
                ${item.avatar ? `<img src="${item.avatar}" alt="avatar" class="levels-rank-avatar">` : `<div class="levels-rank-avatar levels-rank-avatar--placeholder">${(item.tag || 'U').charAt(0).toUpperCase()}</div>`}
                <div class="levels-rank-body">
                    <div class="levels-rank-head">
                        <span class="levels-rank-name">${escapeHtml(item.tag || item.username || 'Usuario')}</span>
                        <div class="levels-rank-head-tags">
                            ${renderTierBadge(tier, 'sm')}
                            <span class="levels-rank-level">Nv ${item.level}</span>
                        </div>
                    </div>
                    <div class="levels-rank-progress-wrap">
                        <div class="levels-rank-progress">
                            <div class="levels-rank-progress-bar" style="width:${progress}%; --tier-color:${tier.color};"></div>
                        </div>
                        <span class="levels-rank-progress-pct">${progressLabel}</span>
                    </div>
                    <div class="levels-rank-meta">
                        <span>${levelingFormatNumber(item.xp)} XP</span>
                        <span>${levelingFormatNumber(item.messageCount)} msgs</span>
                        <span>${levelingFormatNumber(item.voiceMinutes)} min voz</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    return `
        ${renderLeaderboardPodium(top3)}
        <div class="levels-rank-list">
            ${restHtml || '<div class="levels-rank-empty">Solo hay ' + rows.length + ' miembro(s) con XP. ¡Invita a más gente a participar!</div>'}
        </div>
    `;
}

async function loadLevelsPanel(guildId) {
    const container = document.getElementById('levelsContainer');
    if (!container) return;

    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando sistema de niveles...</p></div>';

    try {
        const [infoResponse, configResponse, leaderboardResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/info`),
            fetchWithCredentials(`/api/guild/${guildId}/leveling-config`),
            fetchWithCredentials(`/api/guild/${guildId}/leveling-leaderboard`)
        ]);

        if (!infoResponse.ok || !configResponse.ok || !leaderboardResponse.ok) {
            container.innerHTML = '<div class="levels-error">No se pudo cargar el sistema de niveles.</div>';
            return;
        }

        const info = await infoResponse.json();
        const config = await configResponse.json();
        const leaderboard = await leaderboardResponse.json();

        const roles = (Array.isArray(info?.roles) ? info.roles : [])
            .filter((role) => role && role.id && role.name && role.name !== '@everyone')
            .sort((a, b) => (b.position || 0) - (a.position || 0));

        const rewards = Array.isArray(config.roleRewards) ? config.roleRewards : [];
        const difficulty = levelingSanitizeDifficulty(config.difficulty || {});

        const levelsHeroHtml = dpxRenderHero({
            kicker: 'Niveles',
            title: 'Niveles y recompensas',
            description: 'Premia la actividad real de tu servidor con XP por mensajes y por tiempo en voz. Diseñado para que subir de nivel sea un logro, no una rutina.',
            iconName: 'bolt',
            actionsHtml: `
                <span id="levelsHeroStatusChip" class="dpx-status-chip ${config.enabled ? 'is-on' : 'is-off'}"><span class="dot"></span>${config.enabled ? 'Sistema activo' : 'Sistema inactivo'}</span>
                <div class="levels-hero-buttons">
                    <button type="button" class="btn btn-secondary" id="levelsRefreshBtn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10"/><path d="M20.49 15a9 9 0 01-14.85 3.36L1 14"/></svg>
                        Recargar
                    </button>
                    <button type="button" class="btn btn-primary" id="saveLevelingBtn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        Guardar cambios
                    </button>
                </div>
            `
        });

        container.innerHTML = `
            <div class="dpx-panel levels-panel">
                ${levelsHeroHtml}

                <div id="levelsStatsHeaderWrap">${renderLevelsStatsHeader(config, leaderboard, roles)}</div>

                ${levelsRenderMainTabs(readPanelStoredTab('levels', guildId, 'config'))}

                <div class="levels-tab-panel is-active" data-levels-panel="config">
                    <input type="hidden" id="levelUpAnnounceChannelId" value="${escapeHtml(String(config.levelUpAnnounceChannelId || '').trim())}">
                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Estado general</h4>
                            <p>Activa el sistema y decide qué fuentes de XP están habilitadas.</p>
                        </div>
                        <div class="levels-toggle-grid">
                            <label class="levels-toggle">
                                <input type="checkbox" id="levelingEnabled" ${config.enabled ? 'checked' : ''}>
                                <span class="levels-toggle-switch"></span>
                                <span class="levels-toggle-info">
                                    <strong>Sistema activo</strong>
                                    <span>Enciende o apaga los niveles para todo el servidor.</span>
                                </span>
                            </label>
                            <label class="levels-toggle">
                                <input type="checkbox" id="levelingMessageEnabled" ${config.messageXpEnabled !== false ? 'checked' : ''}>
                                <span class="levels-toggle-switch"></span>
                                <span class="levels-toggle-info">
                                    <strong>XP por mensajes</strong>
                                    <span>Cada mensaje válido otorga XP (respeta el cooldown).</span>
                                </span>
                            </label>
                            <label class="levels-toggle">
                                <input type="checkbox" id="levelingVoiceEnabled" ${config.voiceXpEnabled !== false ? 'checked' : ''}>
                                <span class="levels-toggle-switch"></span>
                                <span class="levels-toggle-info">
                                    <strong>XP por voz</strong>
                                    <span>Tiempo en canales de voz suma XP automáticamente.</span>
                                </span>
                            </label>
                            <label class="levels-toggle">
                                <input type="checkbox" id="levelingVoicePeers" ${config.voiceRequirePeers !== false ? 'checked' : ''}>
                                <span class="levels-toggle-switch"></span>
                                <span class="levels-toggle-info">
                                    <strong>Voz requiere acompañantes</strong>
                                    <span>Exige al menos 2 usuarios conectados para sumar XP.</span>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Multiplicador de XP (farmeo)</h4>
                            <p>Aumenta la XP ganada por mensajes y voz. No afecta los ajustes manuales con <code>/xp</code>.</p>
                        </div>
                        ${renderXpMultiplierPresets(config.xpMultiplier ?? 1)}
                        <div class="levels-field-grid levels-xp-mult-custom">
                            <div class="levels-field">
                                <label for="levelingXpMultiplierCustom">Multiplicador personalizado</label>
                                <div class="levels-input-with-suffix">
                                    <input type="number" min="0.5" max="20" step="0.1" id="levelingXpMultiplierCustom" class="form-control" value="${levelingSanitizeXpMultiplier(config.xpMultiplier ?? 1)}">
                                    <span>×</span>
                                </div>
                                <small>Entre 0.5× y 20×. Usa los botones rápidos o escribe un valor (ej. 2.5).</small>
                            </div>
                        </div>
                        <p id="levelingXpEffectiveHint" class="levels-xp-effective-hint" aria-live="polite"></p>
                    </div>

                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Mensajes</h4>
                            <p>Controla cuánto XP da cada mensaje y cada cuánto tiempo.</p>
                        </div>
                        <div class="levels-field-grid">
                            <div class="levels-field">
                                <label for="levelingMsgCooldown">Cooldown entre mensajes</label>
                                <div class="levels-input-with-suffix">
                                    <input type="number" min="10" max="300" id="levelingMsgCooldown" class="form-control" value="${Math.max(10, Math.round((config.messageCooldownMs || 45000) / 1000))}">
                                    <span>segundos</span>
                                </div>
                                <small>Entre 10 y 300 s. Evita farmear XP con spam.</small>
                            </div>
                            <div class="levels-field">
                                <label for="levelingMsgXpMin">XP mínimo por mensaje</label>
                                <input type="number" min="1" max="300" id="levelingMsgXpMin" class="form-control" value="${Math.max(1, Number.parseInt(config.messageXpMin || 10, 10) || 10)}">
                                <small>Se elige un valor aleatorio entre min y max.</small>
                            </div>
                            <div class="levels-field">
                                <label for="levelingMsgXpMax">XP máximo por mensaje</label>
                                <input type="number" min="1" max="500" id="levelingMsgXpMax" class="form-control" value="${Math.max(1, Number.parseInt(config.messageXpMax || 16, 10) || 16)}">
                                <small>Debe ser ≥ al mínimo.</small>
                            </div>
                        </div>
                    </div>

                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Voz</h4>
                            <p>XP por cada minuto que un miembro pase conectado.</p>
                        </div>
                        <div class="levels-field-grid">
                            <div class="levels-field">
                                <label for="levelingVoiceXp">XP por minuto en voz</label>
                                <div class="levels-input-with-suffix">
                                    <input type="number" min="1" max="100" id="levelingVoiceXp" class="form-control" value="${Math.max(1, Number.parseInt(config.voiceXpPerMinute || 6, 10) || 6)}">
                                    <span>XP / min</span>
                                </div>
                                <small>Típico: 4–10 XP por minuto.</small>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="levels-tab-panel" data-levels-panel="curve">
                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Presets de curva</h4>
                            <p>Elige un perfil preconfigurado. Usa <strong>Odisea</strong> si quieres una progresión exponencial dura donde llegar a Núcleo sea una verdadera proeza.</p>
                        </div>
                        <div id="levelsPresetsWrap">${renderCurvePresets(difficulty)}</div>
                    </div>

                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Ajuste manual</h4>
                            <p>Afina la fórmula <code>XP = base × nivel<sup>exp</sup></code>. La curva, hitos y umbrales se actualizan en tiempo real.</p>
                        </div>
                        <div class="levels-field-grid">
                            <div class="levels-field">
                                <label for="levelingBaseXp">XP base del nivel 1</label>
                                <input type="number" min="50" max="5000" id="levelingBaseXp" class="form-control" value="${difficulty.baseXp}">
                                <small>Entre 50 y 5000. Sugerido: 200–400 para servidores serios.</small>
                            </div>
                            <div class="levels-field">
                                <label for="levelingExponent">Exponente de dificultad</label>
                                <input type="number" min="1.2" max="3.5" step="0.01" id="levelingExponent" class="form-control" value="${difficulty.exponent.toFixed(2)}">
                                <small>1.6 suave · 2.0 equilibrado · 2.3 exigente · 2.5+ odisea.</small>
                            </div>
                        </div>
                    </div>

                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Curva de experiencia</h4>
                            <p>XP por nivel y fronteras de cada rango. Las marcas de colores señalan cuándo se desbloquea cada rango.</p>
                        </div>
                        <div class="levels-curve-wrap" id="levelsCurveWrap">
                            ${renderLevelCurveSvg(difficulty)}
                        </div>
                    </div>

                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Rangos y umbrales</h4>
                            <p>Así se traducen tus niveles a rangos visuales (con insignia) que verán los miembros.</p>
                        </div>
                        <div id="levelsTierLadderWrap">
                            ${renderTierLadder(difficulty, { config, leaderboard, roles })}
                        </div>
                    </div>

                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Hitos clave</h4>
                            <p>Tiempo estimado para alcanzar cada nivel usando solo una fuente (mensajes o voz continua).</p>
                        </div>
                        <div id="levelsMilestonesWrap">
                            ${renderLevelMilestones(difficulty, config)}
                        </div>
                    </div>
                </div>

                <div class="levels-tab-panel" data-levels-panel="rewards">
                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Recompensas por nivel</h4>
                            <p>Asigna roles automáticamente cuando un miembro llega al nivel especificado. <strong>Quitar rol anterior al adquirir el nuevo:</strong> al subir de hito, se retira el rol de recompensa del nivel inferior y solo queda el del nivel más alto alcanzado.</p>
                        </div>
                        <div class="levels-rewards-list" id="levelRewardRows">${renderLevelRewardRows(roles, rewards)}</div>
                        <div class="levels-rewards-actions">
                            <button type="button" id="addLevelRewardBtn" class="btn btn-primary">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Agregar recompensa
                            </button>
                        </div>
                    </div>
                </div>

                <div class="levels-tab-panel" data-levels-panel="leaderboard">
                    <div class="levels-section">
                        <div class="levels-section-head">
                            <h4>Top del servidor</h4>
                            <p>${leaderboard.totalTrackedUsers || 0} miembro(s) con XP acumulado.</p>
                        </div>
                        <div id="levelingLeaderboardWrap">${buildLeaderboardHtml(leaderboard)}</div>
                    </div>
                </div>
            </div>
        `;

        bindLevelsTabs(container, guildId);
        bindLevelsCurveLive(container, config, { roles, leaderboard });
        bindLevelsXpMultiplier(container, { roles, leaderboard, initialConfig: config });
        bindLevelsPresets(container, config);
        bindLevelsRewardsLive(container, { roles, leaderboard, initialConfig: config });

        const refreshBtn = container.querySelector('#levelsRefreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => loadLevelsPanel(guildId));
        }

        const rewardRows = container.querySelector('#levelRewardRows');
        const addRewardBtn = container.querySelector('#addLevelRewardBtn');
        const saveBtn = container.querySelector('#saveLevelingBtn');

        if (rewardRows) {
            rewardRows.addEventListener('click', (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;
                const removeBtn = target.closest('.level-reward-remove');
                if (!removeBtn) return;
                const row = removeBtn.closest('.level-reward-card');
                if (row) {
                    row.classList.add('is-removing');
                    setTimeout(() => row.remove(), 180);
                }
            });

            rewardRows.addEventListener('change', (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;
                if (target.classList.contains('level-reward-role')) {
                    updateRewardCardBadge(target.closest('.level-reward-card'), roles);
                } else if (target.classList.contains('level-reward-level')) {
                    updateRewardCardBadge(target.closest('.level-reward-card'), roles);
                }
            });
        }

        if (addRewardBtn) {
            addRewardBtn.addEventListener('click', () => {
                const wrapper = container.querySelector('#levelRewardRows');
                if (!wrapper) return;

                const empty = wrapper.querySelector('.levels-empty-card');
                if (empty) wrapper.innerHTML = '';

                const nextLevel = Array.from(wrapper.querySelectorAll('.level-reward-level'))
                    .map((input) => Number(input.value) || 0)
                    .reduce((max, n) => Math.max(max, n), 0) + 5 || 5;

                const holder = document.createElement('div');
                holder.innerHTML = renderLevelRewardCard(roles, { level: nextLevel, roleId: '' }, wrapper.children.length);
                const card = holder.firstElementChild;
                if (card) {
                    wrapper.appendChild(card);
                    card.classList.add('is-entering');
                    requestAnimationFrame(() => card.classList.remove('is-entering'));
                }
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const payload = collectLevelingConfigFromForm();
                if (payload.messageXpMax < payload.messageXpMin) {
                    showToast('El XP máximo por mensaje no puede ser menor que el mínimo', 'warning');
                    return;
                }

                saveBtn.disabled = true;
                saveBtn.classList.add('is-loading');
                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/leveling-config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo guardar el sistema de niveles', 'error');
                        return;
                    }
                    showToast('Sistema de niveles guardado', 'success');
                    await loadLevelsPanel(guildId);
                } catch (error) {
                    console.error('Error guardando sistema de niveles:', error);
                    showToast('Error guardando sistema de niveles', 'error');
                } finally {
                    saveBtn.disabled = false;
                    saveBtn.classList.remove('is-loading');
                }
            });
        }
    } catch (error) {
        console.error('Error cargando panel de niveles:', error);
        container.innerHTML = '<div class="levels-error">Error cargando sistema de niveles.</div>';
    }
}

function bindLevelsTabs(container, guildId) {
    const tabs = Array.from(container.querySelectorAll('[data-levels-tab][role="tab"]'));
    const panels = Array.from(container.querySelectorAll('[data-levels-panel]'));
    if (!tabs.length || !panels.length) return;

    const storageKey = panelTabStorageKey('levels', guildId);
    const tabKeys = new Set(tabs.map((t) => t.getAttribute('data-levels-tab')).filter(Boolean));

    const activate = (key) => {
        if (!key || !tabKeys.has(key)) return;
        tabs.forEach((t) => t.classList.toggle('is-active', t.getAttribute('data-levels-tab') === key));
        panels.forEach((panel) => {
            panel.classList.toggle('is-active', panel.getAttribute('data-levels-panel') === key);
        });
        try {
            sessionStorage.setItem(storageKey, key);
        } catch (_) { /* noop */ }
    };

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => activate(tab.getAttribute('data-levels-tab')));
    });

    const storedKey = readPanelStoredTab('levels', guildId, null, tabKeys);
    if (storedKey) {
        activate(storedKey);
    } else if (!tabs.some((t) => t.classList.contains('is-active'))) {
        activate(tabs[0].getAttribute('data-levels-tab'));
    }
}

function readLevelingLiveConfig(container, initialConfig) {
    const baseInput = container.querySelector('#levelingBaseXp');
    const expInput = container.querySelector('#levelingExponent');
    return {
        ...initialConfig,
        enabled: container.querySelector('#levelingEnabled')?.checked ?? initialConfig?.enabled,
        messageXpEnabled: container.querySelector('#levelingMessageEnabled')?.checked ?? initialConfig?.messageXpEnabled,
        voiceXpEnabled: container.querySelector('#levelingVoiceEnabled')?.checked ?? initialConfig?.voiceXpEnabled,
        messageXpMin: Number(container.querySelector('#levelingMsgXpMin')?.value) || initialConfig?.messageXpMin,
        messageXpMax: Number(container.querySelector('#levelingMsgXpMax')?.value) || initialConfig?.messageXpMax,
        messageCooldownMs: (Number(container.querySelector('#levelingMsgCooldown')?.value) || 45) * 1000,
        voiceXpPerMinute: Number(container.querySelector('#levelingVoiceXp')?.value) || initialConfig?.voiceXpPerMinute,
        xpMultiplier: levelingSanitizeXpMultiplier(
            container.querySelector('#levelingXpMultiplierCustom')?.value ?? initialConfig?.xpMultiplier ?? 1
        ),
        difficulty: {
            baseXp: Number(baseInput?.value) || initialConfig?.difficulty?.baseXp || 280,
            exponent: Number(expInput?.value) || initialConfig?.difficulty?.exponent || 2.08
        },
        roleRewards: typeof getLevelingRewardRows === 'function' ? getLevelingRewardRows() : (initialConfig?.roleRewards || [])
    };
}

function refreshLevelsDerivedViews(container, initialConfig, context = {}) {
    const { roles = [], leaderboard = null } = context;
    const config = readLevelingLiveConfig(container, initialConfig);
    const difficulty = levelingSanitizeDifficulty(config.difficulty);

    const curveWrap = container.querySelector('#levelsCurveWrap');
    const milestonesWrap = container.querySelector('#levelsMilestonesWrap');
    const ladderWrap = container.querySelector('#levelsTierLadderWrap');
    const presetsWrap = container.querySelector('#levelsPresetsWrap');
    const statsWrap = container.querySelector('#levelsStatsHeaderWrap');

    if (curveWrap) curveWrap.innerHTML = renderLevelCurveSvg(difficulty);
    if (milestonesWrap) milestonesWrap.innerHTML = renderLevelMilestones(difficulty, config);
    if (ladderWrap) ladderWrap.innerHTML = renderTierLadder(difficulty, { config, leaderboard, roles });
    if (statsWrap) statsWrap.innerHTML = renderLevelsStatsHeader(config, leaderboard, roles);

    const heroChip = container.querySelector('#levelsHeroStatusChip');
    if (heroChip) {
        heroChip.classList.toggle('is-on', !!config.enabled);
        heroChip.classList.toggle('is-off', !config.enabled);
        heroChip.innerHTML = `<span class="dot"></span>${config.enabled ? 'Sistema activo' : 'Sistema inactivo'}`;
    }

    if (presetsWrap) {
        presetsWrap.innerHTML = renderCurvePresets(difficulty);
        attachPresetHandlers(container, presetsWrap);
    }
}

function bindLevelsCurveLive(container, initialConfig, context = {}) {
    const baseInput = container.querySelector('#levelingBaseXp');
    const expInput = container.querySelector('#levelingExponent');
    const curveWrap = container.querySelector('#levelsCurveWrap');
    if (!baseInput || !expInput || !curveWrap) return;

    const refresh = () => scheduleLevelsDerivedRefresh(container, initialConfig, context);

    ['input', 'change'].forEach((evt) => {
        baseInput.addEventListener(evt, refresh);
        expInput.addEventListener(evt, refresh);
    });

    const otherInputs = [
        container.querySelector('#levelingMsgCooldown'),
        container.querySelector('#levelingMsgXpMin'),
        container.querySelector('#levelingMsgXpMax'),
        container.querySelector('#levelingVoiceXp'),
        container.querySelector('#levelingEnabled'),
        container.querySelector('#levelingMessageEnabled'),
        container.querySelector('#levelingVoiceEnabled'),
        container.querySelector('#levelingVoicePeers')
    ].filter(Boolean);

    otherInputs.forEach((input) => {
        input.addEventListener('input', refresh);
        input.addEventListener('change', refresh);
    });
}

function bindLevelsRewardsLive(container, context = {}) {
    const rewardsWrap = container.querySelector('#levelRewardRows');
    if (!rewardsWrap) return;
    const refresh = () => scheduleLevelsDerivedRefresh(container, context.initialConfig, context);

    let rewardsRefreshRaf = 0;
    const scheduleRewardsRefresh = () => {
        if (rewardsRefreshRaf) return;
        rewardsRefreshRaf = requestAnimationFrame(() => {
            rewardsRefreshRaf = 0;
            refresh();
        });
    };

    const observer = new MutationObserver(() => scheduleRewardsRefresh());
    observer.observe(rewardsWrap, { childList: true, subtree: false });

    rewardsWrap.addEventListener('input', (event) => {
        const target = event.target;
        if (target && (target.classList.contains('level-reward-level') || target.classList.contains('level-reward-role'))) {
            scheduleRewardsRefresh();
        }
    });
    rewardsWrap.addEventListener('change', (event) => {
        const target = event.target;
        if (target && (target.classList.contains('level-reward-level') || target.classList.contains('level-reward-role'))) {
            scheduleRewardsRefresh();
        }
    });
}

function refreshXpMultiplierPresetButtons(container) {
    const custom = container.querySelector('#levelingXpMultiplierCustom');
    const wrap = container.querySelector('#levelsXpMultiplierWrap');
    if (!custom || !wrap) return;

    const current = levelingSanitizeXpMultiplier(custom.value);
    wrap.querySelectorAll('[data-xp-mult]').forEach((btn) => {
        const val = Number(btn.getAttribute('data-xp-mult'));
        const active = isXpMultiplierPresetActive(current, val);
        btn.classList.toggle('is-active', active);
        const head = btn.querySelector('.levels-preset-head');
        const dot = btn.querySelector('.levels-preset-dot');
        if (active && head && !dot) {
            head.insertAdjacentHTML('beforeend', '<span class="levels-preset-dot"></span>');
        } else if (!active && dot) {
            dot.remove();
        }
    });
}

function refreshXpMultiplierEffectiveHint(container) {
    const hint = container.querySelector('#levelingXpEffectiveHint');
    const custom = container.querySelector('#levelingXpMultiplierCustom');
    if (!hint || !custom) return;

    const mult = levelingSanitizeXpMultiplier(custom.value);
    if (mult === 1) {
        hint.textContent = '';
        hint.classList.remove('is-active');
        return;
    }

    const min = Number(container.querySelector('#levelingMsgXpMin')?.value) || 10;
    const max = Number(container.querySelector('#levelingMsgXpMax')?.value) || 16;
    const voice = Number(container.querySelector('#levelingVoiceXp')?.value) || 6;
    const effMin = Math.max(1, Math.round(min * mult));
    const effMax = Math.max(effMin, Math.round(max * mult));
    const effVoice = Math.max(1, Math.round(voice * mult));
    hint.textContent = `Con ${levelingFormatXpMultiplier(mult)}: mensajes ${effMin}–${effMax} XP · voz ${effVoice} XP/min`;
    hint.classList.add('is-active');
}

function bindLevelsXpMultiplier(container, context = {}) {
    const wrap = container.querySelector('#levelsXpMultiplierWrap');
    const custom = container.querySelector('#levelingXpMultiplierCustom');
    if (!wrap || !custom) return;

    const refreshDerived = () => scheduleLevelsDerivedRefresh(container, context.initialConfig, context);

    const applyMult = (value) => {
        custom.value = String(levelingSanitizeXpMultiplier(value));
        refreshXpMultiplierPresetButtons(container);
        refreshXpMultiplierEffectiveHint(container);
        refreshDerived();
    };

    wrap.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-xp-mult]');
        if (!btn) return;
        applyMult(btn.getAttribute('data-xp-mult'));
        showToast(`Multiplicador ${levelingFormatXpMultiplier(btn.getAttribute('data-xp-mult'))}`, 'success');
    });

    custom.addEventListener('input', () => {
        refreshXpMultiplierPresetButtons(container);
        refreshXpMultiplierEffectiveHint(container);
        refreshDerived();
    });

    ['#levelingMsgXpMin', '#levelingMsgXpMax', '#levelingVoiceXp'].forEach((sel) => {
        const input = container.querySelector(sel);
        if (!input) return;
        input.addEventListener('input', () => refreshXpMultiplierEffectiveHint(container));
    });

    refreshXpMultiplierEffectiveHint(container);
}

function bindLevelsPresets(container) {
    const presetsWrap = container.querySelector('#levelsPresetsWrap');
    if (!presetsWrap) return;
    attachPresetHandlers(container, presetsWrap);
}

function attachPresetHandlers(container, presetsWrap) {
    presetsWrap.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const baseXp = Number(btn.getAttribute('data-base'));
            const exponent = Number(btn.getAttribute('data-exp'));
            const baseInput = container.querySelector('#levelingBaseXp');
            const expInput = container.querySelector('#levelingExponent');
            if (!baseInput || !expInput) return;
            baseInput.value = String(baseXp);
            expInput.value = exponent.toFixed(2);
            baseInput.dispatchEvent(new Event('input', { bubbles: true }));
            expInput.dispatchEvent(new Event('input', { bubbles: true }));
            showToast(`Preset aplicado: ${btn.querySelector('.levels-preset-name')?.textContent || ''}`, 'success');
        });
    });
}

function updateRewardCardBadge(card, roles) {
    if (!card) return;
    const levelInput = card.querySelector('.level-reward-level');
    const roleSelect = card.querySelector('.level-reward-role');
    const badge = card.querySelector('.level-reward-card-badge');
    if (!badge) return;

    const level = Math.max(1, Number(levelInput?.value) || 1);
    const selectedRole = roles.find((r) => String(r.id) === String(roleSelect?.value));
    const color = selectedRole?.color ? `#${Number(selectedRole.color).toString(16).padStart(6, '0')}` : '#9a6dff';
    badge.textContent = `Nv ${level}`;
    badge.style.setProperty('--reward-color', color);
}

// Cargar información del servidor
async function loadServerInfo(guildId, options = {}) {
    const container = document.getElementById('serverInfoContainer');
    const { silent = false } = options;
    
    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/info`);
        if (response.ok) {
            const info = await response.json();
            currentServerInfo = info;
            displayServerInfoEnhanced(info);
        } else {
            const error = await response.json().catch(() => ({ error: 'Error al cargar información' }));
            container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>${error.error || 'Error al cargar información del servidor'}</p></div>`;
        }
    } catch (error) {
        console.error('Error cargando información del servidor:', error);
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>Error al cargar información: ${error.message}</p></div>`;
    }
}

function formatServerMetric(value, options = {}) {
    const numeric = Number(value || 0);
    const digits = Number.parseInt(options.maximumFractionDigits ?? 0, 10);
    return new Intl.NumberFormat('es-ES', {
        maximumFractionDigits: Number.isNaN(digits) ? 0 : digits,
        minimumFractionDigits: 0
    }).format(Number.isFinite(numeric) ? numeric : 0);
}

function formatIsoDate(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('es-ES');
}

function formatChartShortDate(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

function formatHoursFromMinutes(minutes) {
    const numeric = Number(minutes || 0);
    return `${formatServerMetric(numeric / 60, { maximumFractionDigits: 2 })} h`;
}

function getServerTopUsers(info) {
    return Array.isArray(info?.activity?.topUsers) ? info.activity.topUsers : [];
}

function renderTopUsersMarkup(topUsers = [], options = {}) {
    const {
        limit = topUsers.length,
        detailed = false
    } = options;

    const usersToRender = topUsers.slice(0, limit);
    if (!usersToRender.length) {
        return '<div class="summary-top-users-empty">Todavia no hay usuarios con actividad registrada.</div>';
    }

    return usersToRender.map((user, index) => {
        const safeTag = escapeHtml(user?.tag || 'Desconocido');
        const messageCount = Number.parseInt(user?.messageCount || 0, 10) || 0;
        const voiceMinutes = Number.parseInt(user?.voiceMinutes || 0, 10) || 0;
        const totalScore = messageCount + voiceMinutes;
        const avatar = user?.avatar
            ? `<img src="${user.avatar}" alt="${safeTag}" class="summary-top-user-avatar">`
            : `<div class="summary-top-user-avatar summary-top-user-avatar--placeholder">${safeTag.charAt(0).toUpperCase()}</div>`;

        return `
            <div class="summary-top-user-item">
                <div class="summary-top-user-rank">${summaryRankBadge(index)}</div>
                ${avatar}
                <div class="summary-top-user-copy">
                    <div class="summary-top-user-name">${safeTag}</div>
                    <div class="summary-top-user-meta">
                        ${formatServerMetric(messageCount)} msgs • ${formatServerMetric(voiceMinutes)} min voz
                        ${detailed ? ` • ${formatHoursFromMinutes(voiceMinutes)} • Score ${formatServerMetric(totalScore)}` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderServerProfileList(items = [], options = {}) {
    const {
        emptyText = 'Sin elementos disponibles.',
        secondaryKey = 'meta'
    } = options;

    if (!items.length) {
        return `<div class="summary-top-users-empty">${emptyText}</div>`;
    }

    return items.map((item, index) => {
        const safeTitle = escapeHtml(String(item?.title || item?.tag || item?.name || 'Elemento'));
        const safeMeta = escapeHtml(String(item?.[secondaryKey] || ''));
        const avatar = item?.avatar
            ? `<img src="${item.avatar}" alt="${safeTitle}" class="summary-top-user-avatar">`
            : `<div class="summary-top-user-avatar summary-top-user-avatar--placeholder">${safeTitle.charAt(0).toUpperCase()}</div>`;

        return `
            <div class="summary-top-user-item">
                <div class="summary-top-user-rank">${summaryRankBadge(index)}</div>
                ${avatar}
                <div class="summary-top-user-copy">
                    <div class="summary-top-user-name">${safeTitle}</div>
                    <div class="summary-top-user-meta">${safeMeta}</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderServerTextList(items = [], options = {}) {
    const { emptyText = 'Sin datos disponibles.' } = options;
    if (!items.length) {
        return `<div class="summary-top-users-empty">${emptyText}</div>`;
    }

    return items.map((item) => `
        <article class="server-detail-list-item">
            <div class="server-detail-list-title">${escapeHtml(String(item?.name || 'Sin nombre'))}</div>
            <div class="server-detail-list-meta">${escapeHtml(String(item?.meta || ''))}</div>
            ${item?.extra ? `<div class="server-detail-list-extra">${escapeHtml(String(item.extra))}</div>` : ''}
        </article>
    `).join('');
}

function renderServerPreviewSection(title, items = [], sectionType, mapper, emptyText) {
    const previewItems = items.slice(0, 3).map(mapper);
    const hasMore = items.length > 3;

    return `
        <section class="server-insight-section">
            <div class="server-insight-section-head">
                <h4>${escapeHtml(title)}</h4>
                ${hasMore ? `<button type="button" class="summary-link-btn" data-server-channel-section="${escapeHtml(sectionType)}">Ver mas</button>` : ''}
            </div>
            <div class="server-detail-list">
                ${renderServerTextList(previewItems, { emptyText })}
            </div>
        </section>
    `;
}

function renderVoiceChannelCards(items = [], options = {}) {
    const { limit = items.length, emptyText = 'No hay canales de voz para mostrar.' } = options;
    const channels = items.slice(0, limit);
    if (!channels.length) {
        return `<div class="summary-top-users-empty">${emptyText}</div>`;
    }

    return channels.map((channel) => `
        <article class="server-detail-list-item">
            <div class="server-detail-list-title">${escapeHtml(String(channel?.name || 'Canal de voz'))}</div>
            <div class="server-detail-list-meta">${escapeHtml(String(channel?.type || 'Voz'))} • ${formatServerMetric(channel?.userCount || 0)} usuarios</div>
            <div class="server-detail-list-extra">${escapeHtml(String(channel?.parentName || 'Sin categoria'))}</div>
            <div class="summary-top-users-list summary-top-users-list--compact">
                ${renderServerProfileList((Array.isArray(channel?.users) ? channel.users : []).map((user) => ({
                    title: user.tag,
                    avatar: user.avatar,
                    meta: `ID ${user.id}`
                })), { emptyText: 'Sin usuarios conectados.' })}
            </div>
        </article>
    `).join('');
}

function renderServerChipList(items = [], emptyText = 'Sin datos adicionales.') {
    if (!items.length) {
        return `<div class="summary-top-users-empty">${emptyText}</div>`;
    }

    return `
        <div class="server-chip-list">
            ${items.map((item) => `<span class="server-chip">${escapeHtml(String(item))}</span>`).join('')}
        </div>
    `;
}

function destroyServerActivityChart(canvasId = 'serverActivityChart') {
    const existingChart = serverActivityCharts.get(canvasId);
    if (existingChart) {
        existingChart.destroy();
        serverActivityCharts.delete(canvasId);
    }
}

async function refreshServerSummaryIfVisible() {
    const serverSection = document.getElementById('serverSection');
    if (!serverSection || !serverSection.classList.contains('active') || !currentServerGuildId) return;
    await loadServerInfo(currentServerGuildId, { silent: true });
}

function setupServerSummaryAutoRefresh() {
    if (serverSummaryRefreshInterval) {
        clearInterval(serverSummaryRefreshInterval);
    }

    serverSummaryRefreshInterval = setInterval(() => {
        refreshServerSummaryIfVisible().catch((error) => {
            console.warn('No se pudo refrescar el resumen del servidor:', error?.message || error);
        });
    }, 60000);
}

function summaryIcon(type = 'server') {
    const s = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    const icons = {
        owner:    `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M3 20l3-8 6 4 6-4 3 8"></path><circle cx="12" cy="7" r="3.5"></circle><path d="M8 5l-1-2"></path><path d="M16 5l1-2"></path></svg>`,
        members:  `<svg viewBox="0 0 24 24" fill="none" ${s}><circle cx="9" cy="8" r="3.5"></circle><circle cx="17" cy="9.5" r="2.5"></circle><path d="M2.5 20v-1.5A3.5 3.5 0 0 1 6 15h6a3.5 3.5 0 0 1 3.5 3.5V20"></path><path d="M16 20v-1a3 3 0 0 0-1.3-2.5"></path><path d="M22 20v-1a3 3 0 0 0-2.3-2.9"></path></svg>`,
        channels: `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M6.5 3l-1 18"></path><path d="M14.5 3l-1 18"></path><path d="M3 8.5h18"></path><path d="M3 15.5h18"></path></svg>`,
        roles:    `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M12 2l3 6 6 .9-4.5 4.4 1 6.2L12 17l-5.5 2.5 1-6.2L3 8.9 9 8z"></path></svg>`,
        messages: `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path></svg>`,
        voice:    `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3z"></path><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path><path d="M9 21h6"></path></svg>`,
        flow:     `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M4 8h10"></path><path d="M11 5l3 3-3 3"></path><path d="M20 16H10"></path><path d="M13 13l-3 3 3 3"></path></svg>`,
        peak:     `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M3 20h18"></path><path d="M5 20V12"></path><path d="M10 20V7"></path><path d="M15 20v-9"></path><path d="M20 20V5"></path><path d="M3 11l5-5 4 2 4-6 5 2"></path></svg>`,
        live:     `<svg viewBox="0 0 24 24" fill="none" ${s}><circle cx="12" cy="12" r="3"></circle><path d="M7.8 7.8a6 6 0 0 0 0 8.5"></path><path d="M16.2 7.8a6 6 0 0 1 0 8.5"></path><path d="M4.7 4.7a10 10 0 0 0 0 14.6"></path><path d="M19.3 4.7a10 10 0 0 1 0 14.6"></path></svg>`,
        age:      `<svg viewBox="0 0 24 24" fill="none" ${s}><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2.5 2.5"></path><path d="M9 2h6"></path><path d="M12 2v3"></path></svg>`,
        core:     `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M12 2l2.2 4.6 5 .7-3.6 3.6.9 5-4.5-2.4-4.5 2.4.9-5L4.8 7.3l5-.7z"></path><path d="M8 22l1.5-5"></path><path d="M16 22l-1.5-5"></path></svg>`,
        created:  `<svg viewBox="0 0 24 24" fill="none" ${s}><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 10h18"></path><circle cx="12" cy="15.5" r="1.2"></circle></svg>`,
        activity: `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M3 12h3l2-7 4 14 2-7h7"></path></svg>`,
        chart:    `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M4 4v16h16"></path><path d="M7 15l3-4 3 2 5-7"></path><circle cx="7" cy="15" r="1.2" fill="currentColor"></circle><circle cx="10" cy="11" r="1.2" fill="currentColor"></circle><circle cx="13" cy="13" r="1.2" fill="currentColor"></circle><circle cx="18" cy="6" r="1.2" fill="currentColor"></circle></svg>`
    };

    return icons[type] || icons.chart;
}

function summaryTitle(label, iconType, tone = 'violet') {
    return `
        <div class="summary-head">
            <span class="summary-icon summary-icon--${tone}">${summaryIcon(iconType)}</span>
            <div class="summary-label">${label}</div>
        </div>
    `;
}

function summaryRankBadge(index) {
    const rank = Number(index) + 1;
    const icons = [
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"></circle><path d="M9.5 14.5 8 21l4-2 4 2-1.5-6.5"></path><path d="M12 3v2"></path><path d="M9 6l-2-2"></path><path d="M15 6l2-2"></path></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"></circle><path d="M9.5 14.5 8 21l4-2 4 2-1.5-6.5"></path><path d="M9 6.5 7 4.5"></path><path d="M15 6.5 17 4.5"></path></svg>',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="5"></circle><path d="M9.5 14.5 8 21l4-2 4 2-1.5-6.5"></path><path d="M8.5 6.5 6.5 5"></path><path d="M15.5 6.5 17.5 5"></path></svg>'
    ];

    if (index >= 0 && index < icons.length) {
        return `<span class="summary-top-user-rank-icon summary-top-user-rank-icon--${rank}">${icons[index]}</span>`;
    }

    return `<span class="summary-top-user-rank-number">#${rank}</span>`;
}

function createServerActivityChartDatasets(points = []) {
    return {
        labels: points.map((point) => point.label),
        datasets: [
            {
                label: 'Entradas',
                data: points.map((point) => point.joins),
                borderColor: '#5da8ff',
                backgroundColor: 'rgba(93, 168, 255, 0.15)',
                pointRadius: 2.5,
                tension: 0.35,
                borderWidth: 2
            },
            {
                label: 'Salidas',
                data: points.map((point) => point.leaves),
                borderColor: '#ff7ccf',
                backgroundColor: 'rgba(255, 124, 207, 0.12)',
                pointRadius: 2.5,
                tension: 0.35,
                borderWidth: 2
            },
            {
                label: 'Mensajes',
                data: points.map((point) => point.messages),
                borderColor: '#b68dff',
                backgroundColor: 'rgba(182, 141, 255, 0.12)',
                pointRadius: 2.5,
                tension: 0.35,
                borderWidth: 2
            },
            {
                label: 'Voz (min)',
                data: points.map((point) => point.voiceMinutes),
                borderColor: '#ffa968',
                backgroundColor: 'rgba(255, 169, 104, 0.12)',
                pointRadius: 2.5,
                tension: 0.35,
                borderWidth: 2
            }
        ]
    };
}

function buildServerActivityPoints(info, mode = 'week') {
    if (mode === 'since') {
        const weekly = Array.isArray(info?.activity?.timeline?.weekly) ? info.activity.timeline.weekly : [];
        return weekly.map((entry) => ({
            label: `Sem ${entry.week}`,
            joins: Number.parseInt(entry.joins || 0, 10) || 0,
            leaves: Number.parseInt(entry.leaves || 0, 10) || 0,
            messages: Number.parseInt(entry.messages || 0, 10) || 0,
            voiceMinutes: Number.parseInt(entry.voiceMinutes || 0, 10) || 0
        }));
    }

    const daily = Array.isArray(info?.activity?.timeline?.daily) ? info.activity.timeline.daily : [];
    return daily.map((entry) => ({
        label: formatChartShortDate(entry.date),
        joins: Number.parseInt(entry.joins || 0, 10) || 0,
        leaves: Number.parseInt(entry.leaves || 0, 10) || 0,
        messages: Number.parseInt(entry.messages || 0, 10) || 0,
        voiceMinutes: Number.parseInt(entry.voiceMinutes || 0, 10) || 0
    }));
}

function renderServerActivityChart(info, options = {}) {
    const canvasId = options.canvasId || 'serverActivityChart';
    const canvas = document.getElementById(canvasId);
    const rangeSelect = document.getElementById(options.selectId || 'serverActivityRange');
    const emptyState = document.getElementById(options.emptyId || 'serverActivityChartEmpty');
    if (!canvas || !rangeSelect) return;

    if (typeof Chart === 'undefined') {
        if (emptyState) {
            emptyState.style.display = 'block';
            emptyState.textContent = 'No se pudo cargar la libreria de graficas.';
        }
        return;
    }

    const renderByMode = (mode) => {
        serverActivityChartMode = mode;
        const points = buildServerActivityPoints(info, mode);
        const hasData = points.some((point) => point.joins > 0 || point.leaves > 0 || point.messages > 0 || point.voiceMinutes > 0);

        destroyServerActivityChart(canvasId);

        if (!hasData) {
            if (emptyState) {
                emptyState.style.display = 'block';
                emptyState.textContent = mode === 'since'
                    ? 'Sin datos historicos suficientes desde la creacion.'
                    : 'Aun no hay actividad registrada en los ultimos 7 dias.';
            }
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        const chartData = createServerActivityChartDatasets(points);
        const chart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                    axis: 'x'
                },
                plugins: {
                    legend: {
                        labels: {
                            color: '#cbb7f6',
                            boxWidth: 12,
                            boxHeight: 12
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                hover: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    x: {
                        ticks: { color: '#a48fd0' },
                        grid: { color: 'rgba(154, 109, 255, 0.12)' }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: '#a48fd0' },
                        grid: { color: 'rgba(154, 109, 255, 0.12)' }
                    }
                }
            }
        });
        serverActivityCharts.set(canvasId, chart);
    };

    rangeSelect.value = serverActivityChartMode;
    rangeSelect.onchange = (event) => {
        renderByMode(event.target.value);
    };

    renderByMode(serverActivityChartMode);
}

function renderServerInsightStat(label, value, detail = '') {
    return `
        <article class="server-insight-stat">
            <span class="server-insight-stat-label">${label}</span>
            <strong class="server-insight-stat-value">${value}</strong>
            ${detail ? `<span class="server-insight-stat-detail">${detail}</span>` : ''}
        </article>
    `;
}

function buildServerInsightDetailMarkup(info, insightId) {
    const ownerTag = escapeHtml(info.owner?.tag || 'Desconocido');
    const createdDate = formatIsoDate(info.createdAt);
    const ageDays = Number.parseInt(info.activity?.ageDays || 0, 10) || 0;
    const trackedUsers = Number.parseInt(info.activity?.trackedUsers || 0, 10) || 0;
    const totalMessages = Number.parseInt(info.activity?.messages?.totalTracked || 0, 10) || 0;
    const avgMessagesPerDay = Number(info.activity?.messages?.avgPerDay || 0);
    const topMessageTag = escapeHtml(info.activity?.messages?.topUser?.tag || 'N/A');
    const topMessageCount = Number.parseInt(info.activity?.messages?.topUser?.count || 0, 10) || 0;
    const totalVoiceMinutes = Number.parseInt(info.activity?.voice?.totalMinutes || 0, 10) || 0;
    const avgVoiceHoursPerDay = Number(info.activity?.voice?.avgHoursPerDay || 0);
    const topVoiceTag = escapeHtml(info.activity?.voice?.topUser?.tag || 'N/A');
    const topVoiceMinutes = Number.parseInt(info.activity?.voice?.topUser?.minutes || 0, 10) || 0;
    const liveVoiceUsers = Number.parseInt(info.activity?.voice?.live?.currentUsers || 0, 10) || 0;
    const liveTopChannelName = escapeHtml(info.activity?.voice?.live?.topChannel?.name || 'Sin actividad');
    const liveTopChannelUsers = Number.parseInt(info.activity?.voice?.live?.topChannel?.users || 0, 10) || 0;
    const totalJoins = Number.parseInt(info.activity?.memberFlow?.totalJoins || 0, 10) || 0;
    const totalLeaves = Number.parseInt(info.activity?.memberFlow?.totalLeaves || 0, 10) || 0;
    const flowNet = Number.parseInt(info.activity?.memberFlow?.net || 0, 10) || 0;
    const peakJoinDate = formatIsoDate(info.activity?.memberFlow?.peakJoinsDay?.date);
    const peakJoinCount = Number.parseInt(info.activity?.memberFlow?.peakJoinsDay?.count || 0, 10) || 0;
    const peakLeaveDate = formatIsoDate(info.activity?.memberFlow?.peakLeavesDay?.date);
    const peakLeaveCount = Number.parseInt(info.activity?.memberFlow?.peakLeavesDay?.count || 0, 10) || 0;
    const topUsers = getServerTopUsers(info);
    const dailyTimeline = Array.isArray(info.activity?.timeline?.daily) ? info.activity.timeline.daily : [];
    const weeklyTimeline = Array.isArray(info.activity?.timeline?.weekly) ? info.activity.timeline.weekly : [];
    const activeDays = dailyTimeline.filter((entry) => (Number.parseInt(entry.messages || 0, 10) || 0) > 0 || (Number.parseInt(entry.voiceMinutes || 0, 10) || 0) > 0 || (Number.parseInt(entry.joins || 0, 10) || 0) > 0 || (Number.parseInt(entry.leaves || 0, 10) || 0) > 0).length;
    const averageVoiceMinutesPerTrackedUser = trackedUsers > 0 ? totalVoiceMinutes / trackedUsers : 0;
    const averageMessagesPerTrackedUser = trackedUsers > 0 ? totalMessages / trackedUsers : 0;
    const humanMembers = Number.parseInt(info.members?.humans || 0, 10) || 0;
    const botMembers = Number.parseInt(info.members?.bots || 0, 10) || 0;
    const textChannels = Array.isArray(info.channels?.items?.text) ? info.channels.items.text : [];
    const voiceChannels = Array.isArray(info.channels?.items?.voice) ? info.channels.items.voice : [];
    const categoryChannels = Array.isArray(info.channels?.items?.category) ? info.channels.items.category : [];
    const rolesDetailed = Array.isArray(info.roles) ? info.roles.filter((role) => role.name !== '@everyone').slice(0, 10) : [];
    const allRolesDetailed = Array.isArray(info.roles) ? info.roles.filter((role) => role.name !== '@everyone') : [];
    const messageLeaders = Array.isArray(info.activity?.messages?.leaders) ? info.activity.messages.leaders : [];
    const voiceLeaders = Array.isArray(info.activity?.voice?.leaders) ? info.activity.voice.leaders : [];
    const liveVoiceChannels = Array.isArray(info.activity?.voice?.live?.channels) ? info.activity.voice.live.channels : [];
    const featureList = Array.isArray(info.features) ? info.features : [];
    const selectedRole = allRolesDetailed.find((role) => String(role.id) === String(currentServerInsightPayload?.roleId || ''));
    const selectedChannelSection = String(currentServerInsightPayload?.channelSection || '');
    const channelSectionMap = {
        text: {
            title: 'Canales de texto',
            items: textChannels,
            emptyText: 'No hay canales de texto para mostrar.',
            mapItem: (channel) => ({
                name: `# ${channel.name}`,
                meta: `${channel.type} • ${channel.parentName}`,
                extra: channel.topic || 'Sin descripcion'
            })
        },
        voice: {
            title: 'Canales de voz',
            items: voiceChannels,
            emptyText: 'No hay canales de voz para mostrar.',
            mapItem: (channel) => ({
                name: channel.name,
                meta: `${channel.type} • ${formatServerMetric(channel.userCount || 0)} usuarios`,
                extra: channel.parentName
            })
        },
        category: {
            title: 'Categorias',
            items: categoryChannels,
            emptyText: 'No hay categorias para mostrar.',
            mapItem: (channel) => ({
                name: channel.name,
                meta: `Posicion ${formatServerMetric(channel.position || 0)}`,
                extra: channel.parentName
            })
        }
    };
    const selectedChannelConfig = channelSectionMap[selectedChannelSection] || null;

    const ownerAvatar = info.owner?.avatar
        ? `<img src="${info.owner.avatar}" alt="${ownerTag}" class="summary-owner-avatar">`
        : `<div class="summary-owner-avatar summary-owner-avatar--placeholder">${ownerTag.charAt(0).toUpperCase()}</div>`;

    const detailMap = {
        owner: {
            title: 'Propietario del servidor',
            copy: 'Datos de la cuenta propietaria y referencia principal del servidor.',
            body: `
                <div class="server-insight-hero">
                    <div class="summary-owner-row">
                        ${ownerAvatar}
                        <div>
                            <div class="summary-value">${ownerTag}</div>
                            <div class="summary-subvalue">ID ${escapeHtml(String(info.owner?.id || 'N/A'))}</div>
                        </div>
                    </div>
                </div>
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Servidor', escapeHtml(info.name || 'Servidor'), 'Nombre visible actual')}
                    ${renderServerInsightStat('Creado', createdDate, `${formatServerMetric(ageDays)} dias de antiguedad`)}
                    ${renderServerInsightStat('Nivel premium', `Nivel ${Number(info.premiumTier || 0)}`, `${Number(info.premiumSubscriptionCount || 0)} boosts`)}
                    ${renderServerInsightStat('Verificacion', escapeHtml(String(info.verificationLevel ?? 'N/A')), 'Seguridad activa del servidor')}
                </div>
                ${renderServerChipList(featureList, 'Sin features especiales activas.')}
            `
        },
        members: {
            title: 'Miembros',
            copy: 'Resumen de tamano y actividad general de la comunidad.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Miembros totales', formatServerMetric(info.memberCount || 0), 'Comunidad actual del servidor')}
                    ${renderServerInsightStat('Usuarios reales', formatServerMetric(humanMembers), 'Usuarios reales en el servidor')}
                    ${renderServerInsightStat('Bots', formatServerMetric(botMembers), 'Bots conectados al servidor')}
                    ${renderServerInsightStat('Usuarios con historial', formatServerMetric(trackedUsers), 'Usuarios con mensajes o voz registrados')}
                    ${renderServerInsightStat('Usuarios en voz ahora', formatServerMetric(liveVoiceUsers), `${liveTopChannelName} (${formatServerMetric(liveTopChannelUsers)})`)}
                    ${renderServerInsightStat('Dias con actividad', formatServerMetric(activeDays), 'Dias recientes con movimiento registrado')}
                </div>
                <section class="server-insight-section">
                    <h4>Usuarios mas activos</h4>
                    <div class="summary-top-users-list summary-top-users-list--detail">
                        ${renderTopUsersMarkup(topUsers, { limit: 6, detailed: true })}
                    </div>
                </section>
            `
        },
        channels: {
            title: 'Canales',
            copy: 'Distribucion actual de canales del servidor.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Canales totales', formatServerMetric(info.channelCount || 0), 'Suma de texto, voz y categorias')}
                    ${renderServerInsightStat('Texto', formatServerMetric(info.channels?.text || 0), 'Canales de texto')}
                    ${renderServerInsightStat('Voz', formatServerMetric(info.channels?.voice || 0), 'Canales de voz')}
                    ${renderServerInsightStat('Categorias', formatServerMetric(info.channels?.category || 0), 'Organizacion actual')}
                </div>
                <div class="server-insight-columns">
                    ${renderServerPreviewSection('Canales de texto', textChannels, 'text', channelSectionMap.text.mapItem, 'No hay canales de texto para mostrar.')}
                    <section class="server-insight-section">
                        <div class="server-insight-section-head">
                            <h4>Canales de voz</h4>
                            ${voiceChannels.length > 3 ? '<button type="button" class="summary-link-btn" data-server-channel-section="voice">Ver mas</button>' : ''}
                        </div>
                        <div class="server-detail-list">
                            ${renderVoiceChannelCards(voiceChannels, { limit: 3, emptyText: 'No hay canales de voz para mostrar.' })}
                        </div>
                    </section>
                    ${renderServerPreviewSection('Categorias', categoryChannels, 'category', channelSectionMap.category.mapItem, 'No hay categorias para mostrar.')}
                </div>
            `
        },
        roles: {
            title: 'Roles',
            copy: 'Volumen de roles y estructura de permisos del servidor.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Roles totales', formatServerMetric(info.roleCount || 0), 'Jerarquia y permisos')}
                    ${renderServerInsightStat('Boost level', `Nivel ${Number(info.premiumTier || 0)}`, `${Number(info.premiumSubscriptionCount || 0)} boosts`)}
                </div>
                <section class="server-insight-section">
                    <h4>Roles principales</h4>
                    <div class="server-detail-list">
                        ${rolesDetailed.length ? rolesDetailed.map((role) => `
                            <button type="button" class="server-detail-list-item server-detail-list-item--button" data-server-role-id="${role.id}">
                                <div class="server-detail-list-title">${escapeHtml(role.name)}</div>
                                <div class="server-detail-list-meta">${formatServerMetric(role.members)} miembros • Posicion ${formatServerMetric(role.position)}</div>
                                <div class="server-detail-list-extra">${escapeHtml(role.color && role.color !== '#000000' ? role.color : 'Color por defecto')}</div>
                            </button>
                        `).join('') : '<div class="summary-top-users-empty">No hay roles destacados para mostrar.</div>'}
                    </div>
                </section>
            `
        },
        messages: {
            title: 'Actividad de mensajes',
            copy: 'Mensajes acumulados por usuarios rastreados del servidor.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Mensajes totales', `${formatServerMetric(totalMessages)} msgs`, 'Solo usuarios con historial')}
                    ${renderServerInsightStat('Promedio diario', formatServerMetric(avgMessagesPerDay, { maximumFractionDigits: 2 }), 'Desde la creacion del servidor')}
                    ${renderServerInsightStat('Usuario top', topMessageTag, `${formatServerMetric(topMessageCount)} mensajes`)}
                    ${renderServerInsightStat('Promedio por usuario', formatServerMetric(averageMessagesPerTrackedUser, { maximumFractionDigits: 2 }), 'Mensajes por usuario con historial')}
                </div>
                <section class="server-insight-section">
                    <h4>Ranking por mensajes</h4>
                    <div class="summary-top-users-list summary-top-users-list--detail">
                        ${renderServerProfileList(messageLeaders.map((user) => ({
                            title: user.tag,
                            avatar: user.avatar,
                            meta: `${formatServerMetric(user.messageCount)} mensajes • ${formatServerMetric(user.voiceMinutes)} min voz`
                        })), { emptyText: 'No hay usuarios con mensajes registrados.' })}
                    </div>
                </section>
            `
        },
        voice: {
            title: 'Actividad de voz',
            copy: 'Tiempo de voz acumulado y usuario con mas minutos registrados.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Minutos totales', `${formatServerMetric(totalVoiceMinutes)} min`, 'Tiempo acumulado de voz')}
                    ${renderServerInsightStat('Promedio diario', `${formatServerMetric(avgVoiceHoursPerDay, { maximumFractionDigits: 2 })} h`, 'Horas por dia desde la creacion')}
                    ${renderServerInsightStat('Usuario top', topVoiceTag, `${formatServerMetric(topVoiceMinutes)} min`)}
                    ${renderServerInsightStat('Promedio por usuario', `${formatServerMetric(averageVoiceMinutesPerTrackedUser, { maximumFractionDigits: 2 })} min`, 'Voz promedio por usuario con historial')}
                </div>
                <div class="server-insight-columns">
                    <section class="server-insight-section">
                        <h4>Ranking por voz</h4>
                        <div class="summary-top-users-list summary-top-users-list--detail">
                            ${renderServerProfileList(voiceLeaders.map((user) => ({
                                title: user.tag,
                                avatar: user.avatar,
                                meta: `${formatServerMetric(user.voiceMinutes)} min voz • ${formatServerMetric(user.messageCount)} mensajes`
                            })), { emptyText: 'No hay usuarios con voz registrada.' })}
                        </div>
                    </section>
                    <section class="server-insight-section">
                        <h4>Canales de voz activos</h4>
                        <div class="server-detail-list">
                            ${renderServerTextList(liveVoiceChannels.map((channel) => ({
                                name: channel.name,
                                meta: `${formatServerMetric(channel.userCount || 0)} usuarios conectados`,
                                extra: channel.parentName
                            })), { emptyText: 'Ahora mismo no hay canales de voz activos.' })}
                        </div>
                    </section>
                </div>
            `
        },
        flow: {
            title: 'Entradas y salidas',
            copy: 'Movimiento historico de miembros que entran o salen.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Entradas', formatServerMetric(totalJoins), `Pico ${formatServerMetric(peakJoinCount)} el ${peakJoinDate}`)}
                    ${renderServerInsightStat('Salidas', formatServerMetric(totalLeaves), `Pico ${formatServerMetric(peakLeaveCount)} el ${peakLeaveDate}`)}
                    ${renderServerInsightStat('Balance neto', `${flowNet >= 0 ? '+' : ''}${formatServerMetric(flowNet)}`, 'Entradas menos salidas')}
                    ${renderServerInsightStat('Semanas registradas', formatServerMetric(weeklyTimeline.length), 'Historial agregado disponible')}
                </div>
                <section class="server-insight-section">
                    <h4>Ultimos 7 dias</h4>
                    <div class="server-detail-list">
                        ${renderServerTextList(dailyTimeline.map((day) => ({
                            name: day.label || formatChartShortDate(day.date),
                            meta: `Entradas ${formatServerMetric(day.joins)} • Salidas ${formatServerMetric(day.leaves)}`,
                            extra: `Mensajes ${formatServerMetric(day.messages)} • Voz ${formatServerMetric(day.voiceMinutes)} min`
                        })), { emptyText: 'No hay datos recientes de flujo.' })}
                    </div>
                </section>
            `
        },
        peak: {
            title: 'Pico de salidas',
            copy: 'Dia con mayor volumen de salidas registrado.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Pico de salidas', formatServerMetric(peakLeaveCount), `Fecha ${peakLeaveDate}`)}
                    ${renderServerInsightStat('Pico de entradas', formatServerMetric(peakJoinCount), `Fecha ${peakJoinDate}`)}
                </div>
            `
        },
        live: {
            title: 'Voz en vivo',
            copy: 'Estado en tiempo real de usuarios conectados en voz.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Usuarios conectados', formatServerMetric(liveVoiceUsers), 'En canales de voz ahora mismo')}
                    ${renderServerInsightStat('Canal mas activo', liveTopChannelName, `${formatServerMetric(liveTopChannelUsers)} usuarios`)}
                </div>
                <section class="server-insight-section">
                    <h4>Canales con usuarios conectados</h4>
                    <div class="server-detail-list">
                        ${renderServerTextList(liveVoiceChannels.map((channel) => ({
                            name: channel.name,
                            meta: `${formatServerMetric(channel.userCount || 0)} usuarios`,
                            extra: channel.parentName
                        })), { emptyText: 'Nadie esta conectado en voz ahora mismo.' })}
                    </div>
                </section>
            `
        },
        age: {
            title: 'Edad y base',
            copy: 'Antiguedad del servidor y base historica de usuarios rastreados.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Antiguedad', `${formatServerMetric(ageDays)} dias`, `Creado ${createdDate}`)}
                    ${renderServerInsightStat('Usuarios con historial', formatServerMetric(trackedUsers), 'Usuarios con actividad guardada')}
                </div>
            `
        },
        core: {
            title: 'Estadisticas core',
            copy: 'Datos estructurales del servidor y configuracion central.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Nivel premium', `Nivel ${Number(info.premiumTier || 0)}`, `${Number(info.premiumSubscriptionCount || 0)} boosts`)}
                    ${renderServerInsightStat('Verificacion', escapeHtml(String(info.verificationLevel ?? 'N/A')), 'Nivel de verificacion activo')}
                </div>
                ${renderServerChipList(featureList, 'Sin funciones premium o especiales visibles.')}
            `
        },
        created: {
            title: 'Fecha de creacion',
            copy: 'Fecha base del servidor y recursos visuales actuales.',
            body: `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Creado', createdDate, `${formatServerMetric(ageDays)} dias desde entonces`)}
                    ${renderServerInsightStat('Emojis', formatServerMetric(info.emojis || 0), `${formatServerMetric(info.stickers || 0)} stickers`)}
                </div>
                <section class="server-insight-section">
                    <h4>Datos base del servidor</h4>
                    <div class="server-detail-list">
                        ${renderServerTextList([
                            { name: 'Servidor', meta: String(info.name || 'Servidor'), extra: `ID ${String(info.id || 'N/A')}` },
                            { name: 'Propietario', meta: ownerTag, extra: `ID ${escapeHtml(String(info.owner?.id || 'N/A'))}` }
                        ], { emptyText: 'Sin datos base disponibles.' })}
                    </div>
                </section>
            `
        },
        activity: {
            title: 'Usuarios activos',
            copy: 'Usuarios con mas mensajes y minutos de voz acumulados.',
            body: `
                <div class="summary-top-users-list">
                    ${topUsers.length ? topUsers.map((user, index) => {
                        const safeTag = escapeHtml(user?.tag || 'Desconocido');
                        const avatar = user?.avatar
                            ? `<img src="${user.avatar}" alt="${safeTag}" class="summary-top-user-avatar">`
                            : `<div class="summary-top-user-avatar summary-top-user-avatar--placeholder">${safeTag.charAt(0).toUpperCase()}</div>`;
                        return `
                            <div class="summary-top-user-item">
                                <div class="summary-top-user-rank">${summaryRankBadge(index)}</div>
                                ${avatar}
                                <div class="summary-top-user-copy">
                                    <div class="summary-top-user-name">${safeTag}</div>
                                    <div class="summary-top-user-meta">${formatServerMetric(Number.parseInt(user?.messageCount || 0, 10) || 0)} msgs • ${formatServerMetric(Number.parseInt(user?.voiceMinutes || 0, 10) || 0)} min voz</div>
                                </div>
                            </div>
                        `;
                    }).join('') : '<div class="summary-top-users-empty">Todavia no hay usuarios con actividad registrada.</div>'}
                </div>
            `
        },
        chart: {
            title: 'Graficas de actividad',
            copy: 'Vista ampliada del historico de entradas, salidas, mensajes y voz.',
            body: `
                <div class="summary-chart-head">
                    <div>
                        <div class="summary-subvalue">Explora la actividad reciente o desde la creacion.</div>
                    </div>
                    <select id="serverActivityRangeDetail" class="summary-chart-select">
                        <option value="week">Por semana (7 dias)</option>
                        <option value="since">Desde creacion (por semanas)</option>
                    </select>
                </div>
                <div class="summary-chart-wrap summary-chart-wrap--detail">
                    <canvas id="serverActivityChartDetail"></canvas>
                    <div id="serverActivityChartEmptyDetail" class="summary-chart-empty" style="display:none;"></div>
                </div>
            `
        },
        roleMembers: {
            title: selectedRole ? `Rol: ${escapeHtml(selectedRole.name)}` : 'Miembros del rol',
            copy: selectedRole
                ? 'Usuarios que actualmente pertenecen a este rol.'
                : 'Selecciona un rol desde la pantalla de roles para ver sus miembros.',
            body: selectedRole ? `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Miembros del rol', formatServerMetric(selectedRole.members || 0), 'Usuarios asignados actualmente')}
                    ${renderServerInsightStat('Posicion', formatServerMetric(selectedRole.position || 0), 'Ubicacion en la jerarquia')}
                    ${renderServerInsightStat('Color', escapeHtml(selectedRole.color && selectedRole.color !== '#000000' ? selectedRole.color : 'Por defecto'), 'Color visible del rol')}
                </div>
                <section class="server-insight-section">
                    <h4>Usuarios del rol</h4>
                    <div class="summary-top-users-list summary-top-users-list--detail">
                        ${renderServerProfileList((Array.isArray(selectedRole.users) ? selectedRole.users : []).map((user) => ({
                            title: user.tag,
                            avatar: user.avatar,
                            meta: `ID ${user.id}`
                        })), { emptyText: 'Este rol no tiene usuarios visibles en cache.' })}
                    </div>
                </section>
            ` : `
                <div class="summary-top-users-empty">No se encontro el rol seleccionado.</div>
            `
        },
        channelList: {
            title: selectedChannelConfig ? selectedChannelConfig.title : 'Canales',
            copy: selectedChannelConfig
                ? 'Vista completa de esta seccion del servidor.'
                : 'Selecciona una seccion de canales para ver la lista completa.',
            body: selectedChannelConfig ? `
                <div class="server-insight-grid">
                    ${renderServerInsightStat('Elementos', formatServerMetric(selectedChannelConfig.items.length), 'Listado completo de la seccion')}
                </div>
                <section class="server-insight-section">
                    <h4>${escapeHtml(selectedChannelConfig.title)}</h4>
                    <div class="server-detail-list server-detail-list--scroll">
                        ${selectedChannelSection === 'voice'
                            ? renderVoiceChannelCards(selectedChannelConfig.items, { emptyText: selectedChannelConfig.emptyText })
                            : renderServerTextList(selectedChannelConfig.items.map(selectedChannelConfig.mapItem), {
                                emptyText: selectedChannelConfig.emptyText
                            })}
                    </div>
                </section>
            ` : `
                <div class="summary-top-users-empty">No se encontro la seccion seleccionada.</div>
            `
        }
    };

    detailMap.activity = {
        title: 'Usuarios activos',
        copy: 'Usuarios con mas mensajes y minutos de voz acumulados.',
        body: `
            <div class="server-insight-grid">
                ${renderServerInsightStat('Usuarios destacados', formatServerMetric(topUsers.length), 'Ranking actual por actividad')}
                ${renderServerInsightStat('Top mensajes', topMessageTag, `${formatServerMetric(topMessageCount)} mensajes`)}
                ${renderServerInsightStat('Top voz', topVoiceTag, `${formatServerMetric(topVoiceMinutes)} min voz`)}
            </div>
            <div class="summary-top-users-list summary-top-users-list--detail">
                ${renderTopUsersMarkup(topUsers, { detailed: true })}
            </div>
        `
    };

    detailMap.chart = {
        title: 'Graficas de actividad',
        copy: 'Vista ampliada del historico de entradas, salidas, mensajes y voz.',
        body: `
            <div class="server-insight-grid">
                ${renderServerInsightStat('Dias activos recientes', formatServerMetric(activeDays), 'Dias con eventos registrados')}
                ${renderServerInsightStat('Semanas en historico', formatServerMetric(weeklyTimeline.length), 'Puntos agrupados para la vista extendida')}
                ${renderServerInsightStat('Usuarios rastreados', formatServerMetric(trackedUsers), 'Base usada para mensajes y voz')}
            </div>
            <div class="summary-chart-head">
                <div>
                    <div class="summary-subvalue">Explora la actividad reciente o desde la creacion.</div>
                </div>
                <select id="serverActivityRangeDetail" class="summary-chart-select">
                    <option value="week">Por semana (7 dias)</option>
                    <option value="since">Desde creacion (por semanas)</option>
                </select>
            </div>
            <div class="summary-chart-wrap summary-chart-wrap--detail">
                <canvas id="serverActivityChartDetail"></canvas>
                <div id="serverActivityChartEmptyDetail" class="summary-chart-empty" style="display:none;"></div>
            </div>
        `
    };

    return detailMap[insightId] || detailMap.members;
}

function bindServerSummaryCardEvents() {
    const container = document.getElementById('serverInfoContainer');
    if (!container) return;

    container.querySelectorAll('[data-server-insight]').forEach((card) => {
        card.addEventListener('click', (event) => {
            if (event.target.closest('select, option, canvas, button')) return;
            openServerInsight(card.dataset.serverInsight);
        });

        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openServerInsight(card.dataset.serverInsight);
            }
        });
    });

    const backButton = container.querySelector('[data-server-insight-back]');
    if (backButton) {
        backButton.addEventListener('click', () => closeServerInsight());
    }

    const showMoreButton = container.querySelector('[data-server-insight-more-users]');
    if (showMoreButton) {
        showMoreButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openServerInsight('activity');
        });
    }

    container.querySelectorAll('[data-server-role-id]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openServerInsight('roleMembers', {
                roleId: button.dataset.serverRoleId || '',
                parentInsight: 'roles'
            });
        });
    });

    container.querySelectorAll('[data-server-channel-section]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openServerInsight('channelList', {
                channelSection: button.dataset.serverChannelSection || '',
                parentInsight: 'channels'
            });
        });
    });
}

function openServerInsight(insightId, payload = null) {
    if (!currentServerInfo || !insightId) return;
    currentServerInsightView = insightId;
    currentServerInsightPayload = payload;
    displayServerInfoEnhanced(currentServerInfo);
    saveState();
}

function closeServerInsight() {
    if (!currentServerInfo) return;
    const parentInsight = String(currentServerInsightPayload?.parentInsight || '').trim();
    if (parentInsight) {
        currentServerInsightView = parentInsight;
        currentServerInsightPayload = null;
        displayServerInfoEnhanced(currentServerInfo);
        saveState();
        return;
    }
    currentServerInsightView = 'overview';
    currentServerInsightPayload = null;
    displayServerInfoEnhanced(currentServerInfo);
    saveState();
}

function getServerInsightBackLabel() {
    const parentInsight = String(currentServerInsightPayload?.parentInsight || '').trim();
    const insightLabels = {
        overview: 'resumen',
        owner: 'Propietario',
        members: 'Miembros',
        channels: 'Canales',
        roles: 'Roles',
        messages: 'Mensajes',
        voice: 'Voz',
        flow: 'Entradas y salidas',
        peak: 'Picos',
        live: 'Voz en vivo',
        age: 'Edad y base',
        core: 'Estadisticas core',
        created: 'Fecha de creacion',
        activity: 'Usuarios activos',
        chart: 'Graficas'
    };

    if (parentInsight && insightLabels[parentInsight]) {
        return `Volver a ${insightLabels[parentInsight]}`;
    }

    return 'Volver al resumen';
}

function renderServerOverviewMarkup(info, topUsersMarkup, ownerTag, ownerAvatar, createdDate, ageDays, trackedUsers, totalMessages, avgMessagesPerDay, topMessageTag, topMessageCount, totalVoiceMinutes, avgVoiceHoursPerDay, topVoiceTag, topVoiceMinutes, totalJoins, totalLeaves, flowNet, peakJoinCount, peakJoinDate, peakLeaveCount, peakLeaveDate, liveVoiceUsers, liveTopChannelName, liveTopChannelUsers) {
    const topUsers = getServerTopUsers(info);
    const topUsersPreviewMarkup = renderTopUsersMarkup(topUsers, { limit: 5 });
    const showMoreUsersButton = topUsers.length > 5
        ? `<button type="button" class="summary-link-btn" data-server-insight-more-users>Ver todos los usuarios</button>`
        : '';

    const humanMembers = Number.parseInt(info.members?.humans || 0, 10) || 0;
    const botMembers = Number.parseInt(info.members?.bots || 0, 10) || 0;
    const verification = escapeHtml(String(info.verificationLevel ?? 'N/A'));
    const boostTier = Number(info.premiumTier || 0);
    const boostCount = Number(info.premiumSubscriptionCount || 0);
    const flowSign = flowNet >= 0 ? '+' : '';
    const flowClass = flowNet >= 0 ? 'is-positive' : 'is-negative';

    const serverName = escapeHtml(info.name || 'Servidor');
    const serverIcon = info.icon
        ? `<img src="${escapeHtml(info.icon)}" alt="${serverName}" class="overview-hero-icon-img">`
        : `<span class="overview-hero-icon-placeholder">${serverName.charAt(0).toUpperCase()}</span>`;

    const kpiChip = (label, value, tone, iconType) => `
        <div class="overview-hero-chip overview-hero-chip--${tone}">
            <span class="overview-hero-chip-icon">${summaryIcon(iconType)}</span>
            <div>
                <div class="overview-hero-chip-value">${value}</div>
                <div class="overview-hero-chip-label">${label}</div>
            </div>
        </div>`;

    return `
        <div class="server-overview-layout">

            <!-- Hero: identidad del servidor -->
            <article class="overview-hero">
                <div class="overview-hero-bg"></div>
                <div class="overview-hero-content">
                    <div class="overview-hero-identity">
                        <div class="overview-hero-icon">${serverIcon}</div>
                        <div class="overview-hero-meta">
                            <h2 class="overview-hero-title">${serverName}</h2>
                            <div class="overview-hero-sub">Creado el ${escapeHtml(createdDate)} • ${formatServerMetric(ageDays)} días de historia</div>
                        </div>
                    </div>
                    <div class="overview-hero-owner summary-card--interactive" data-server-insight="owner" tabindex="0" role="button" aria-label="Ver propietario">
                        ${ownerAvatar}
                        <div>
                            <div class="overview-hero-owner-label">Propietario</div>
                            <div class="overview-hero-owner-name">${ownerTag}</div>
                            <div class="overview-hero-owner-id">ID ${escapeHtml(String(info.owner?.id || 'N/A'))}</div>
                        </div>
                        <span class="overview-hero-owner-arrow" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"></path></svg>
                        </span>
                    </div>
                </div>
                <div class="overview-hero-chips">
                    ${kpiChip('Miembros', formatServerMetric(info.memberCount || 0), 'blue', 'members')}
                    ${kpiChip('Canales', formatServerMetric(info.channelCount || 0), 'teal', 'channels')}
                    ${kpiChip('Roles', formatServerMetric(info.roleCount || 0), 'violet', 'roles')}
                    ${kpiChip('Boosts', `Nivel ${boostTier} · ${boostCount}`, 'gold', 'core')}
                </div>
            </article>




                        <!-- Seccion: KPIs principales -->
            <section class="overview-section">
                <header class="overview-section-head">
                    <div class="overview-section-title">
                        <span class="overview-section-dot overview-section-dot--blue"></span>
                        <h4>Resumen del servidor</h4>
                    </div>
                    <span class="overview-section-hint">Toca cualquier tarjeta para ver el detalle</span>
                </header>
                <div class="overview-kpi-grid">
                    <article class="summary-card summary-card--kpi summary-card--interactive tone-blue" data-server-insight="members" tabindex="0" role="button">
                        ${summaryTitle('Miembros', 'members', 'blue')}
                        <div class="summary-value summary-value--xl">${formatServerMetric(info.memberCount || 0)}</div>
                        <div class="summary-subvalue">${formatServerMetric(humanMembers)} humanos · ${formatServerMetric(botMembers)} bots</div>
                    </article>
                    <article class="summary-card summary-card--kpi summary-card--interactive tone-teal" data-server-insight="channels" tabindex="0" role="button">
                        ${summaryTitle('Canales', 'channels', 'teal')}
                        <div class="summary-value summary-value--xl">${formatServerMetric(info.channelCount || 0)}</div>
                        <div class="summary-subvalue">${info.channels?.text || 0} texto · ${info.channels?.voice || 0} voz · ${info.channels?.category || 0} categorías</div>
                    </article>
                    <article class="summary-card summary-card--kpi summary-card--interactive tone-violet" data-server-insight="roles" tabindex="0" role="button">
                        ${summaryTitle('Roles', 'roles', 'violet')}
                        <div class="summary-value summary-value--xl">${formatServerMetric(info.roleCount || 0)}</div>
                        <div class="summary-subvalue">Gestión de permisos y jerarquía</div>
                    </article>
                    <article class="summary-card summary-card--kpi summary-card--interactive tone-gold" data-server-insight="core" tabindex="0" role="button">
                        ${summaryTitle('Premium', 'core', 'gold')}
                        <div class="summary-value summary-value--xl">Nivel ${boostTier}</div>
                        <div class="summary-subvalue">${boostCount} boosts · Verificación ${verification}</div>
                    </article>
                </div>
            </section>

            <!-- Seccion: Actividad -->
            <section class="overview-section">
                <header class="overview-section-head">
                    <div class="overview-section-title">
                        <span class="overview-section-dot overview-section-dot--pink"></span>
                        <h4>Actividad de la comunidad</h4>
                    </div>
                    <span class="overview-section-hint">Desde la creación del servidor</span>
                </header>
                <div class="overview-dual-grid">
                    <article class="summary-card summary-card--big summary-card--interactive tone-pink" data-server-insight="messages" tabindex="0" role="button">
                        ${summaryTitle('Mensajes', 'messages', 'pink')}
                        <div class="summary-value summary-value--xl">${formatServerMetric(totalMessages)}</div>
                        <div class="summary-subvalue">${formatServerMetric(avgMessagesPerDay, { maximumFractionDigits: 2 })} por día</div>
                        <div class="summary-highlight">
                            <span class="summary-highlight-label">Top</span>
                            <span class="summary-highlight-value">${topMessageTag}</span>
                            <span class="summary-highlight-meta">${formatServerMetric(topMessageCount)} msgs</span>
                        </div>
                    </article>
                    <article class="summary-card summary-card--big summary-card--interactive tone-orange" data-server-insight="voice" tabindex="0" role="button">
                        ${summaryTitle('Voz', 'voice', 'orange')}
                        <div class="summary-value summary-value--xl">${formatServerMetric(totalVoiceMinutes)} <span class="summary-value-unit">min</span></div>
                        <div class="summary-subvalue">${formatServerMetric(avgVoiceHoursPerDay, { maximumFractionDigits: 2 })} h por día</div>
                        <div class="summary-highlight">
                            <span class="summary-highlight-label">Top</span>
                            <span class="summary-highlight-value">${topVoiceTag}</span>
                            <span class="summary-highlight-meta">${formatServerMetric(topVoiceMinutes)} min</span>
                        </div>
                    </article>
                </div>
            </section>

            <!-- Seccion: Flujo de miembros -->
            <section class="overview-section">
                <header class="overview-section-head">
                    <div class="overview-section-title">
                        <span class="overview-section-dot overview-section-dot--teal"></span>
                        <h4>Flujo de miembros</h4>
                    </div>
                </header>
                <div class="overview-dual-grid">
                    <article class="summary-card summary-card--interactive tone-blue" data-server-insight="flow" tabindex="0" role="button">
                        ${summaryTitle('Entradas / Salidas', 'flow', 'blue')}
                        <div class="summary-flow-row">
                            <div class="summary-flow-item summary-flow-item--joins">
                                <span class="summary-flow-label">Entradas</span>
                                <span class="summary-flow-value">${formatServerMetric(totalJoins)}</span>
                            </div>
                            <div class="summary-flow-divider"></div>
                            <div class="summary-flow-item summary-flow-item--leaves">
                                <span class="summary-flow-label">Salidas</span>
                                <span class="summary-flow-value">${formatServerMetric(totalLeaves)}</span>
                            </div>
                        </div>
                        <div class="summary-flow-balance ${flowClass}">Balance ${flowSign}${formatServerMetric(flowNet)}</div>
                    </article>
                    <article class="summary-card summary-card--interactive tone-pink" data-server-insight="peak" tabindex="0" role="button">
                        ${summaryTitle('Picos del período', 'peak', 'pink')}
                        <div class="summary-peak-row">
                            <div class="summary-peak-item">
                                <span class="summary-peak-dot summary-peak-dot--up"></span>
                                <span class="summary-peak-meta">
                                    <strong>${formatServerMetric(peakJoinCount)}</strong> entradas
                                    <span>${peakJoinDate}</span>
                                </span>
                            </div>
                            <div class="summary-peak-item">
                                <span class="summary-peak-dot summary-peak-dot--down"></span>
                                <span class="summary-peak-meta">
                                    <strong>${formatServerMetric(peakLeaveCount)}</strong> salidas
                                    <span>${peakLeaveDate}</span>
                                </span>
                            </div>
                        </div>
                    </article>
                </div>
            </section>

            <!-- Seccion: En vivo + detalles -->
            <section class="overview-section">
                <header class="overview-section-head">
                    <div class="overview-section-title">
                        <span class="overview-section-dot overview-section-dot--live"></span>
                        <h4>En vivo y detalles</h4>
                    </div>
                    <span class="overview-live-indicator">
                        <span class="overview-live-pulse"></span>
                        <span>Live</span>
                    </span>
                </header>
                <div class="overview-dual-grid">
                    <article class="summary-card summary-card--interactive tone-teal summary-card--live" data-server-insight="live" tabindex="0" role="button">
                        ${summaryTitle('Voz en vivo', 'live', 'teal')}
                        <div class="summary-value summary-value--xl">${formatServerMetric(liveVoiceUsers)} <span class="summary-value-unit">conectados</span></div>
                        <div class="summary-subvalue">Canal top ahora · <strong>${liveTopChannelName}</strong> (${formatServerMetric(liveTopChannelUsers)})</div>
                    </article>
                    <article class="summary-card summary-card--interactive tone-gold" data-server-insight="created" tabindex="0" role="button">
                        ${summaryTitle('Detalles y estilos', 'created', 'gold')}
                        <div class="summary-detail-row">
                            <div><span>Emojis</span><strong>${formatServerMetric(info.emojis || 0)}</strong></div>
                            <div><span>Stickers</span><strong>${formatServerMetric(info.stickers || 0)}</strong></div>
                            <div><span>Edad</span><strong>${formatServerMetric(ageDays)} d</strong></div>
                            <div><span>Usuarios con historial</span><strong>${formatServerMetric(trackedUsers)}</strong></div>
                        </div>
                    </article>
                </div>
            </section>

            <!-- Seccion: Top usuarios + grafica -->
            <section class="overview-section">
                <header class="overview-section-head">
                    <div class="overview-section-title">
                        <span class="overview-section-dot overview-section-dot--violet"></span>
                        <h4>Rendimiento</h4>
                    </div>
                </header>
                <div class="overview-bottom-grid">
                    <article class="summary-card summary-card--top-users summary-card--interactive tone-teal" data-server-insight="activity" tabindex="0" role="button">
                        ${summaryTitle('Usuarios destacados', 'activity', 'teal')}
                        <div class="summary-subvalue">Mensajes y tiempo de voz acumulado</div>
                        <div class="summary-top-users-list">
                            ${topUsersPreviewMarkup}
                        </div>
                        ${showMoreUsersButton}
                    </article>

                    <article class="summary-card summary-card--chart summary-card--interactive tone-blue" data-server-insight="chart" tabindex="0" role="button">
                        <div class="summary-chart-head">
                            <div>
                                ${summaryTitle('Gráficas de actividad', 'chart', 'blue')}
                                <div class="summary-subvalue">Entradas, salidas, mensajes y voz</div>
                            </div>
                            <select id="serverActivityRange" class="summary-chart-select">
                                <option value="week">Por semana (7 días)</option>
                                <option value="since">Desde creación</option>
                            </select>
                        </div>
                        <div class="summary-chart-wrap">
                            <canvas id="serverActivityChart"></canvas>
                            <div id="serverActivityChartEmpty" class="summary-chart-empty" style="display:none;"></div>
                        </div>
                    </article>
                </div>
            </section>

        </div>
    `;
}

function displayServerInfo(info) {
    const container = document.getElementById('serverInfoContainer');
    
    if (!info) {
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>Error al cargar información del servidor</p></div>';
        return;
    }
    
    const ownerTag = escapeHtml(info.owner?.tag || 'Desconocido');
    const createdDate = formatIsoDate(info.createdAt);
    const ageDays = Number.parseInt(info.activity?.ageDays || 0, 10) || 0;
    const trackedUsers = Number.parseInt(info.activity?.trackedUsers || 0, 10) || 0;

    const totalMessages = Number.parseInt(info.activity?.messages?.totalTracked || 0, 10) || 0;
    const avgMessagesPerDay = Number(info.activity?.messages?.avgPerDay || 0);
    const topMessageTag = escapeHtml(info.activity?.messages?.topUser?.tag || 'N/A');
    const topMessageCount = Number.parseInt(info.activity?.messages?.topUser?.count || 0, 10) || 0;

    const totalVoiceMinutes = Number.parseInt(info.activity?.voice?.totalMinutes || 0, 10) || 0;
    const avgVoiceHoursPerDay = Number(info.activity?.voice?.avgHoursPerDay || 0);
    const topVoiceTag = escapeHtml(info.activity?.voice?.topUser?.tag || 'N/A');
    const topVoiceMinutes = Number.parseInt(info.activity?.voice?.topUser?.minutes || 0, 10) || 0;
    const liveVoiceUsers = Number.parseInt(info.activity?.voice?.live?.currentUsers || 0, 10) || 0;
    const liveTopChannelName = escapeHtml(info.activity?.voice?.live?.topChannel?.name || 'Sin actividad');
    const liveTopChannelUsers = Number.parseInt(info.activity?.voice?.live?.topChannel?.users || 0, 10) || 0;

    const totalJoins = Number.parseInt(info.activity?.memberFlow?.totalJoins || 0, 10) || 0;
    const totalLeaves = Number.parseInt(info.activity?.memberFlow?.totalLeaves || 0, 10) || 0;
    const flowNet = Number.parseInt(info.activity?.memberFlow?.net || 0, 10) || 0;
    const peakJoinDate = formatIsoDate(info.activity?.memberFlow?.peakJoinsDay?.date);
    const peakJoinCount = Number.parseInt(info.activity?.memberFlow?.peakJoinsDay?.count || 0, 10) || 0;
    const peakLeaveDate = formatIsoDate(info.activity?.memberFlow?.peakLeavesDay?.date);
    const peakLeaveCount = Number.parseInt(info.activity?.memberFlow?.peakLeavesDay?.count || 0, 10) || 0;
    const topUsers = Array.isArray(info.activity?.topUsers) ? info.activity.topUsers : [];

    const ownerAvatar = info.owner?.avatar
        ? `<img src="${info.owner.avatar}" alt="${ownerTag}" class="summary-owner-avatar">`
        : `<div class="summary-owner-avatar summary-owner-avatar--placeholder">${ownerTag.charAt(0).toUpperCase()}</div>`;

    const topUsersMarkup = topUsers.length
        ? topUsers.map((user, index) => {
            const safeTag = escapeHtml(user?.tag || 'Desconocido');
            const avatar = user?.avatar
                ? `<img src="${user.avatar}" alt="${safeTag}" class="summary-top-user-avatar">`
                : `<div class="summary-top-user-avatar summary-top-user-avatar--placeholder">${safeTag.charAt(0).toUpperCase()}</div>`;

            return `
                <div class="summary-top-user-item">
                    <div class="summary-top-user-rank">${summaryRankBadge(index)}</div>
                    ${avatar}
                    <div class="summary-top-user-copy">
                        <div class="summary-top-user-name">${safeTag}</div>
                        <div class="summary-top-user-meta">${formatServerMetric(Number.parseInt(user?.messageCount || 0, 10) || 0)} msgs • ${formatServerMetric(Number.parseInt(user?.voiceMinutes || 0, 10) || 0)} min voz</div>
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="summary-top-users-empty">Todavia no hay usuarios con actividad registrada.</div>';

    container.innerHTML = `
        <div class="server-summary-grid">
            <article class="summary-card summary-card--owner">
                ${summaryTitle('Propietario', 'owner', 'gold')}
                <div class="summary-owner-row">
                    ${ownerAvatar}
                    <div>
                        <div class="summary-value">${ownerTag}</div>
                        <div class="summary-subvalue">ID • ${escapeHtml(String(info.owner?.id || 'N/A'))}</div>
                    </div>
                </div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Miembros', 'members', 'blue')}
                <div class="summary-value">${formatServerMetric(info.memberCount || 0)}</div>
                <div class="summary-subvalue">Comunidad actual del servidor</div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Entradas de Canales', 'channels', 'teal')}
                <div class="summary-value">${formatServerMetric(info.channelCount || 0)}</div>
                <div class="summary-subvalue">${info.channels?.text || 0} texto • ${info.channels?.voice || 0} voz • ${info.channels?.category || 0} categorias</div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Roles', 'roles', 'violet')}
                <div class="summary-value">${formatServerMetric(info.roleCount || 0)}</div>
                <div class="summary-subvalue">Gestion de permisos y jerarquia</div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Actividad (Mensajes)', 'messages', 'pink')}
                <div class="summary-value">${formatServerMetric(totalMessages)} msgs</div>
                <div class="summary-subvalue">${formatServerMetric(avgMessagesPerDay, { maximumFractionDigits: 2 })} por dia desde creacion • Top ${topMessageTag} (${formatServerMetric(topMessageCount)})</div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Actividad (Voz)', 'voice', 'orange')}
                <div class="summary-value">${formatServerMetric(totalVoiceMinutes)} min</div>
                <div class="summary-subvalue">${formatServerMetric(avgVoiceHoursPerDay, { maximumFractionDigits: 2 })} h por dia • Top ${topVoiceTag} (${formatServerMetric(topVoiceMinutes)} min)</div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Entradas / Salidas', 'flow', 'blue')}
                <div class="summary-value">${formatServerMetric(totalJoins)} / ${formatServerMetric(totalLeaves)}</div>
                <div class="summary-subvalue">Balance ${flowNet >= 0 ? '+' : ''}${formatServerMetric(flowNet)} • Pico entradas ${formatServerMetric(peakJoinCount)} (${peakJoinDate})</div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Pico de Salidas', 'peak', 'pink')}
                <div class="summary-value">${formatServerMetric(peakLeaveCount)}</div>
                <div class="summary-subvalue">Dia con mas salidas: ${peakLeaveDate}</div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Voz en Vivo', 'live', 'teal')}
                <div class="summary-value">${formatServerMetric(liveVoiceUsers)} conectados</div>
                <div class="summary-subvalue">Canal top ahora: ${liveTopChannelName} (${formatServerMetric(liveTopChannelUsers)})</div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Edad y Base', 'age', 'orange')}
                <div class="summary-value">${formatServerMetric(ageDays)} dias</div>
                <div class="summary-subvalue">Creado ${createdDate} • ${formatServerMetric(trackedUsers)} usuarios con historial</div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Estadisticas Core', 'core', 'violet')}
                <div class="summary-value">Nivel ${Number(info.premiumTier || 0)}</div>
                <div class="summary-subvalue">Boosts ${Number(info.premiumSubscriptionCount || 0)} • Verificacion ${escapeHtml(String(info.verificationLevel ?? 'N/A'))}</div>
            </article>

            <article class="summary-card">
                ${summaryTitle('Creado', 'created', 'gold')}
                <div class="summary-value">${createdDate}</div>
                <div class="summary-subvalue">Emojis ${info.emojis || 0} • Stickers ${info.stickers || 0}</div>
            </article>

            <article class="summary-card summary-card--top-users">
                ${summaryTitle('Usuarios Activos', 'activity', 'teal')}
                <div class="summary-subvalue">Mensajes y tiempo de voz acumulado</div>
                <div class="summary-top-users-list">
                    ${topUsersMarkup}
                </div>
            </article>

            <article class="summary-card summary-card--chart">
                <div class="summary-chart-head">
                    <div>
                        ${summaryTitle('Graficas de actividad', 'chart', 'blue')}
                        <div class="summary-subvalue">Lineas de entradas, salidas, mensajes y voz</div>
                    </div>
                    <select id="serverActivityRange" class="summary-chart-select">
                        <option value="week">Por semana (7 dias)</option>
                        <option value="since">Desde creacion (por semanas)</option>
                    </select>
                </div>
                <div class="summary-chart-wrap">
                    <canvas id="serverActivityChart"></canvas>
                    <div id="serverActivityChartEmpty" class="summary-chart-empty" style="display:none;"></div>
                </div>
            </article>
        </div>
    `;

    renderServerActivityChart(info);
}

function displayServerInfoEnhanced(info) {
    const container = document.getElementById('serverInfoContainer');

    if (!info) {
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>Error al cargar informacion del servidor</p></div>';
        return;
    }

    const ownerTag = escapeHtml(info.owner?.tag || 'Desconocido');
    const createdDate = formatIsoDate(info.createdAt);
    const ageDays = Number.parseInt(info.activity?.ageDays || 0, 10) || 0;
    const trackedUsers = Number.parseInt(info.activity?.trackedUsers || 0, 10) || 0;
    const totalMessages = Number.parseInt(info.activity?.messages?.totalTracked || 0, 10) || 0;
    const avgMessagesPerDay = Number(info.activity?.messages?.avgPerDay || 0);
    const topMessageTag = escapeHtml(info.activity?.messages?.topUser?.tag || 'N/A');
    const topMessageCount = Number.parseInt(info.activity?.messages?.topUser?.count || 0, 10) || 0;
    const totalVoiceMinutes = Number.parseInt(info.activity?.voice?.totalMinutes || 0, 10) || 0;
    const avgVoiceHoursPerDay = Number(info.activity?.voice?.avgHoursPerDay || 0);
    const topVoiceTag = escapeHtml(info.activity?.voice?.topUser?.tag || 'N/A');
    const topVoiceMinutes = Number.parseInt(info.activity?.voice?.topUser?.minutes || 0, 10) || 0;
    const liveVoiceUsers = Number.parseInt(info.activity?.voice?.live?.currentUsers || 0, 10) || 0;
    const liveTopChannelName = escapeHtml(info.activity?.voice?.live?.topChannel?.name || 'Sin actividad');
    const liveTopChannelUsers = Number.parseInt(info.activity?.voice?.live?.topChannel?.users || 0, 10) || 0;
    const totalJoins = Number.parseInt(info.activity?.memberFlow?.totalJoins || 0, 10) || 0;
    const totalLeaves = Number.parseInt(info.activity?.memberFlow?.totalLeaves || 0, 10) || 0;
    const flowNet = Number.parseInt(info.activity?.memberFlow?.net || 0, 10) || 0;
    const peakJoinDate = formatIsoDate(info.activity?.memberFlow?.peakJoinsDay?.date);
    const peakJoinCount = Number.parseInt(info.activity?.memberFlow?.peakJoinsDay?.count || 0, 10) || 0;
    const peakLeaveDate = formatIsoDate(info.activity?.memberFlow?.peakLeavesDay?.date);
    const peakLeaveCount = Number.parseInt(info.activity?.memberFlow?.peakLeavesDay?.count || 0, 10) || 0;
    const topUsers = Array.isArray(info.activity?.topUsers) ? info.activity.topUsers : [];

    const ownerAvatar = info.owner?.avatar
        ? `<img src="${info.owner.avatar}" alt="${ownerTag}" class="summary-owner-avatar">`
        : `<div class="summary-owner-avatar summary-owner-avatar--placeholder">${ownerTag.charAt(0).toUpperCase()}</div>`;

    const topUsersMarkup = topUsers.length
        ? topUsers.map((user, index) => {
            const safeTag = escapeHtml(user?.tag || 'Desconocido');
            const avatar = user?.avatar
                ? `<img src="${user.avatar}" alt="${safeTag}" class="summary-top-user-avatar">`
                : `<div class="summary-top-user-avatar summary-top-user-avatar--placeholder">${safeTag.charAt(0).toUpperCase()}</div>`;
            return `
                <div class="summary-top-user-item">
                    <div class="summary-top-user-rank">#${index + 1}</div>
                    ${avatar}
                    <div class="summary-top-user-copy">
                        <div class="summary-top-user-name">${safeTag}</div>
                        <div class="summary-top-user-meta">${formatServerMetric(Number.parseInt(user?.messageCount || 0, 10) || 0)} msgs • ${formatServerMetric(Number.parseInt(user?.voiceMinutes || 0, 10) || 0)} min voz</div>
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="summary-top-users-empty">Todavia no hay usuarios con actividad registrada.</div>';

    if (currentServerInsightView !== 'overview') {
        const detail = buildServerInsightDetailMarkup(info, currentServerInsightView);
        const backLabel = getServerInsightBackLabel();
        container.innerHTML = `
            <section class="server-insight-view">
                <button type="button" class="chip-btn server-insight-back" data-server-insight-back>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M15 18l-6-6 6-6"></path>
                    </svg>
                    <span>${escapeHtml(backLabel)}</span>
                </button>
                <header class="server-insight-header">
                    <div class="server-insight-kicker">Detalle</div>
                    <h3>${detail.title}</h3>
                    <p>${detail.copy}</p>
                </header>
                <div class="server-insight-body">
                    ${detail.body}
                </div>
            </section>
        `;
        bindServerSummaryCardEvents();
        if (currentServerInsightView === 'chart') {
            renderServerActivityChart(info, {
                canvasId: 'serverActivityChartDetail',
                selectId: 'serverActivityRangeDetail',
                emptyId: 'serverActivityChartEmptyDetail'
            });
        }
        return;
    }

    container.innerHTML = renderServerOverviewMarkup(
        info,
        topUsersMarkup,
        ownerTag,
        ownerAvatar,
        createdDate,
        ageDays,
        trackedUsers,
        totalMessages,
        avgMessagesPerDay,
        topMessageTag,
        topMessageCount,
        totalVoiceMinutes,
        avgVoiceHoursPerDay,
        topVoiceTag,
        topVoiceMinutes,
        totalJoins,
        totalLeaves,
        flowNet,
        peakJoinCount,
        peakJoinDate,
        peakLeaveCount,
        peakLeaveDate,
        liveVoiceUsers,
        liveTopChannelName,
        liveTopChannelUsers
    );

    bindServerSummaryCardEvents();
    renderServerActivityChart(info);
}

// Cargar miembros del servidor
async function loadServerMembers(guildId) {
    const container = document.getElementById('moderationContainer');
    if (!container) return;

    try {
        container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando miembros...</p></div>';

        const response = await fetchWithCredentials(`/api/guild/${guildId}/members`);
        if (response.ok) {
            const members = await response.json();
            if (members && members.length > 0) {
                displayMembers(members, guildId, '');
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p>No hay miembros disponibles</p></div>';
            }
        } else {
            const error = await response.json().catch(() => ({ error: 'Error al cargar miembros' }));
            container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>${error.error || 'Error al cargar miembros'}</p></div>`;
        }
    } catch (error) {
        console.error('Error cargando miembros:', error);
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>Error al cargar miembros: ${error.message}</p></div>`;
    }
}

function renderModerationMemberCards(members, guildId) {
    if (!Array.isArray(members) || !members.length) {
        return `
            <div class="modx-empty">
                <div class="modx-empty-icon">${dpxIcon('users')}</div>
                <h4>Sin resultados</h4>
                <p>No hay miembros que coincidan con la búsqueda actual.</p>
            </div>
        `;
    }

    return members.map((member) => `
        <article class="modx-member-card">
            <div class="modx-member-avatar-wrap">
                <img src="${escapeHtml(member.avatar || '')}" alt="${escapeHtml(member.tag || 'Miembro')}" class="modx-member-avatar">
            </div>
            <div class="modx-member-body">
                <div class="modx-member-top">
                    <h4>${escapeHtml(member.tag || 'Usuario')}</h4>
                    <span class="modx-member-id">ID ${escapeHtml(member.id || '')}</span>
                </div>
                <div class="modx-member-actions">
                    <button class="modx-action-btn is-timeout" onclick="moderateUser('${guildId}', '${member.id}', 'timeout')">
                        <span class="modx-action-icon">${dpxIcon('clock')}</span>
                        <span>Mute</span>
                    </button>
                    <button class="modx-action-btn is-kick" onclick="moderateUser('${guildId}', '${member.id}', 'kick')">
                        <span class="modx-action-icon">${dpxIcon('close')}</span>
                        <span>Kick</span>
                    </button>
                    <button class="modx-action-btn is-ban" onclick="moderateUser('${guildId}', '${member.id}', 'ban')">
                        <span class="modx-action-icon">${dpxIcon('ban')}</span>
                        <span>Ban</span>
                    </button>
                </div>
            </div>
        </article>
    `).join('');
}

function renderModerationBanRows(rows, guildId) {
    if (!Array.isArray(rows) || !rows.length) {
        return `
            <div class="modx-empty">
                <div class="modx-empty-icon">${dpxIcon('ban')}</div>
                <h4>Sin baneos registrados</h4>
                <p>No hay usuarios baneados actualmente en este servidor.</p>
            </div>
        `;
    }

    return rows.map((row) => {
        const reason = String(row.reason || 'Sin razón especificada');
        return `
            <article class="modx-ban-card">
                <div class="modx-ban-head">
                    <div class="modx-ban-user">
                        <div class="modx-ban-avatar">${escapeHtml(String(row.username || 'U').slice(0, 1).toUpperCase())}</div>
                        <div>
                            <h4>${escapeHtml(row.tag || row.username || row.userId || 'Usuario')}</h4>
                            <p>ID: ${escapeHtml(row.userId || '')}</p>
                        </div>
                    </div>
                    <button class="modx-action-btn is-unban" onclick="unbanUser('${guildId}', '${row.userId}')">
                        <span class="modx-action-icon">${dpxIcon('check')}</span>
                        <span>Desbanear</span>
                    </button>
                </div>
                <div class="modx-ban-reason">${escapeHtml(reason)}</div>
            </article>
        `;
    }).join('');
}

async function loadModerationBanHistory(guildId) {
    const wrap = document.getElementById('modBanHistoryList');
    if (!wrap) return;

    wrap.innerHTML = '<div class="modx-inline-loading"><div class="loading-spinner"></div><p>Cargando baneados...</p></div>';
    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/bans`);
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            wrap.innerHTML = `<div class="modx-empty"><h4>Error</h4><p>${escapeHtml(data.error || 'No se pudo cargar historial de baneos')}</p></div>`;
            return;
        }

        const rows = await response.json().catch(() => []);
        wrap.innerHTML = renderModerationBanRows(rows, guildId);
    } catch (error) {
        wrap.innerHTML = '<div class="modx-empty"><h4>Error</h4><p>Error cargando historial de baneos.</p></div>';
    }
}

function displayMembers(members, guildId, initialQuery = '') {
    const container = document.getElementById('moderationContainer');
    if (!container) return;

    const safeMembers = Array.isArray(members) ? members : [];
    const totalMembers = safeMembers.length;
    const withAvatar = safeMembers.filter((m) => String(m.avatar || '').trim()).length;
    const actionSummary = 'Timeout · Kick · Ban';

    const heroHtml = dpxRenderHero({
        kicker: 'Moderación',
        title: 'Centro de Moderación',
        description: 'Busca usuarios y aplica acciones rápidas con una interfaz visual por pestañas para que el staff actúe más rápido.',
        accent: '#ff8b8b',
        glow1: 'rgba(255,139,139,0.2)',
        glow2: 'rgba(124,77,255,0.2)',
        iconName: 'shield',
        actionsHtml: `
            <span class="dpx-status-chip is-on"><span class="dot"></span>${totalMembers} miembros cargados</span>
            <button type="button" class="btn btn-secondary" id="modRefreshBtn">${dpxIcon('sparkles')}Actualizar</button>
        `
    });

    const statsHtml = `
        <div class="dpx-stats-grid">
            ${dpxRenderStatCard({ label: 'Miembros visibles', value: `${totalMembers}`, hint: 'Listado cargado para moderación rápida', accent: '#ff8b8b' })}
            ${dpxRenderStatCard({ label: 'Acciones rápidas', value: actionSummary, hint: 'Operaciones disponibles por usuario', accent: '#ffb778' })}
            ${dpxRenderStatCard({ label: 'Perfiles con avatar', value: `${withAvatar}<span class="dpx-stat-pill"> / ${totalMembers || 1}</span>`, hint: 'Mejor identificación visual del miembro', accent: '#7c4dff' })}
            ${dpxRenderStatCard({ label: 'Estado del módulo', value: '<span class="dpx-stat-pill is-on">Activo</span>', hint: 'Moderación online y lista para uso', accent: '#9a6dff' })}
        </div>
    `;

    const tabsHtml = dpxRenderTabs([
        { key: 'mod-members', label: 'Miembros', iconName: 'users' },
        { key: 'mod-actions', label: 'Acciones', iconName: 'shield' },
        { key: 'mod-bans', label: 'Baneados', iconName: 'ban' },
        { key: 'mod-guide', label: 'Guía', iconName: 'info' }
    ], 'mod-members');

    container.innerHTML = `
        <div class="dpx-panel">
            ${heroHtml}
            ${statsHtml}
            ${tabsHtml}

            <section class="dpx-tab-panel is-active" data-dpx-panel="mod-members">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Listado de miembros</h4>
                            <p>Busca por nombre o tag para ejecutar acciones con iconos grandes y color por tipo de sanción.</p>
                        </div>
                    </div>
                    <div class="dpx-field-grid is-wide">
                        <div class="dpx-field is-full">
                            <label for="moderationSearchInput">Buscar miembro</label>
                            <input type="text" id="moderationSearchInput" class="form-control" placeholder="Ej: usuario#1234 o parte del nombre..." value="${escapeHtmlForValue(initialQuery)}">
                            <small>Tip: la búsqueda se actualiza automáticamente.</small>
                        </div>
                    </div>
                    <div class="modx-members-grid" id="moderationMemberList">${renderModerationMemberCards(safeMembers, guildId)}</div>
                </div>
            </section>

            <section class="dpx-tab-panel" data-dpx-panel="mod-actions">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Acciones rápidas del staff</h4>
                            <p>Atajos y criterios de uso para aplicar medidas sin fricción en incidentes comunes.</p>
                        </div>
                    </div>
                    <div class="modx-action-grid">
                        <article class="modx-action-card is-timeout">
                            <div class="modx-action-card-icon">${dpxIcon('clock')}</div>
                            <h5>Timeout</h5>
                            <p>Úsalo para spam, flood o conductas temporales que requieren enfriar el chat.</p>
                        </article>
                        <article class="modx-action-card is-kick">
                            <div class="modx-action-card-icon">${dpxIcon('close')}</div>
                            <h5>Kick</h5>
                            <p>Expulsión inmediata sin veto permanente, ideal para reincidencias leves.</p>
                        </article>
                        <article class="modx-action-card is-ban">
                            <div class="modx-action-card-icon">${dpxIcon('ban')}</div>
                            <h5>Ban</h5>
                            <p>Bloqueo permanente para infracciones graves o ataques al servidor.</p>
                        </article>
                    </div>
                </div>
            </section>

            <section class="dpx-tab-panel" data-dpx-panel="mod-bans">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Historial de usuarios baneados</h4>
                            <p>Consulta baneos activos, revisa la razón registrada y revoca el ban desde aquí.</p>
                        </div>
                        <button type="button" class="btn btn-secondary" id="modRefreshBansBtn">${dpxIcon('sparkles')}Actualizar baneos</button>
                    </div>
                    <div id="modBanHistoryList"></div>
                </div>
            </section>

            <section class="dpx-tab-panel" data-dpx-panel="mod-guide">
                <div class="dpx-section">
                    <div class="dpx-section-head">
                        <div class="dpx-section-head-text">
                            <h4>Guía de operación</h4>
                            <p>Buenas prácticas para mantener consistencia en decisiones de moderación.</p>
                        </div>
                    </div>
                    <div class="dpx-tip">${dpxIcon('info')}<div>Antes de aplicar una sanción, registra siempre una razón clara y verificable. Esto ayuda al equipo a auditar casos y mantener coherencia en apelaciones.</div></div>
                    <div class="dpx-tip" style="margin-top:0.7rem;">${dpxIcon('sparkles')}<div>Próximamente: historial por usuario, presets de sanción y panel de apelaciones integrado.</div></div>
                </div>
            </section>
        </div>
    `;

    bindDpxTabs(container, { persistTabStorageKey: panelTabStorageKey('moderation', guildId) });

    const refreshBtn = document.getElementById('modRefreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadServerMembers(guildId));
    }
    const refreshBansBtn = document.getElementById('modRefreshBansBtn');
    if (refreshBansBtn) {
        refreshBansBtn.addEventListener('click', () => loadModerationBanHistory(guildId));
    }

    const searchInput = document.getElementById('moderationSearchInput');
    let searchTimer = null;
    if (searchInput) {
        searchInput.addEventListener('input', async (e) => {
            const query = String(e.target.value || '').trim();
            clearTimeout(searchTimer);
            searchTimer = setTimeout(async () => {
                const response = await fetchWithCredentials(`/api/guild/${guildId}/members?q=${encodeURIComponent(query)}`);
                if (!response.ok) return;
                const filtered = await response.json().catch(() => []);
                const list = document.getElementById('moderationMemberList');
                if (list) list.innerHTML = renderModerationMemberCards(filtered, guildId);
            }, 220);
        });
    }

    // Mantener compatibilidad con flujo anterior de búsqueda por query inicial
    if (initialQuery) {
        fetchWithCredentials(`/api/guild/${guildId}/members?q=${encodeURIComponent(initialQuery)}`).then(async (response) => {
            if (!response.ok) return;
            const filtered = await response.json().catch(() => []);
            const list = document.getElementById('moderationMemberList');
            if (list) list.innerHTML = renderModerationMemberCards(filtered, guildId);
        }).catch(() => null);
    }

    loadModerationBanHistory(guildId);
}

function getGreetingPanelMeta(mode) {
    if (mode === 'goodbye') {
        return {
            key: 'goodbye',
            panelTitle: 'Sistema de Despedidas',
            subtitle: 'Configura el mensaje de salida para cuando un usuario abandone el servidor.',
            channelLabel: 'Canal de despedida',
            toggleLabel: 'Activar despedidas',
            saveButton: 'Guardar Despedida',
            testButton: 'Guardar y Enviar Prueba',
            uploadSuccess: 'Imagen de despedida subida correctamente',
            saveSuccess: 'Configuración de despedida guardada',
            testSuccess: 'Prueba de despedida enviada',
            channelRequired: 'Selecciona un canal para la despedida',
            defaultTitle: 'Hasta pronto',
            defaultMessage: '{username} ha salido de **{server}**. Ahora somos {memberCount} miembros.',
            defaultColor: 'ff5f9e',
            defaultFooter: 'EyedBot Goodbye System',
            disabledText: 'Despedidas desactivadas'
        };
    }

    return {
        key: 'welcome',
        panelTitle: 'Sistema de Bienvenidas',
        subtitle: 'Elige embed clásico o <strong>tarjeta PNG</strong> (fondo + avatar + textos). Variables: <code>{user}</code>, <code>{username}</code>, <code>{server}</code>, <code>{memberCount}</code>.',
        channelLabel: 'Canal de bienvenida',
        toggleLabel: 'Activar bienvenidas',
        saveButton: 'Guardar Bienvenida',
        testButton: 'Guardar y Enviar Prueba',
        uploadSuccess: 'Imagen de bienvenida subida correctamente',
        saveSuccess: 'Configuración de bienvenida guardada',
        testSuccess: 'Prueba de bienvenida enviada',
        channelRequired: 'Selecciona un canal para la bienvenida',
        defaultTitle: '¡Bienvenido!',
        defaultMessage: '¡Hola {user}! Bienvenido a {server}.',
        defaultColor: '7c4dff',
        defaultFooter: 'EyedBot Welcome System',
        disabledText: 'Bienvenidas desactivadas'
    };
}

function getCurrentGreetingConfig(mode) {
    return mode === 'goodbye' ? currentGoodbyeConfig : currentWelcomeConfig;
}

function setCurrentGreetingConfig(mode, config) {
    if (mode === 'goodbye') {
        currentGoodbyeConfig = config;
        return;
    }
    currentWelcomeConfig = config;
}

function saveCurrentGreetingDraft() {
    const formExists = document.getElementById('welcomeChannelSelect');
    if (!formExists) return;
    setCurrentGreetingConfig(currentGreetingMode, collectWelcomeConfigFromForm());
}

function bindWelcomeEditorSectionTabs(container, guildId, mode = 'welcome') {
    const tabs = Array.from(container.querySelectorAll('[data-welcome-section-tab]'));
    const panes = Array.from(container.querySelectorAll('[data-welcome-pane]'));
    if (!tabs.length || !panes.length) return;

    const panelId = `welcome-section-${mode}`;
    const storageKey = panelTabStorageKey(panelId, guildId);
    const tabKeys = new Set(tabs.map((t) => t.getAttribute('data-welcome-section-tab')).filter(Boolean));

    const activate = (key) => {
        if (!key || !tabKeys.has(key)) return;
        tabs.forEach((t) => {
            const k = t.getAttribute('data-welcome-section-tab');
            const on = k === key;
            t.classList.toggle('is-active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        panes.forEach((p) => {
            p.classList.toggle('is-active', p.getAttribute('data-welcome-pane') === key);
        });
        try {
            sessionStorage.setItem(storageKey, key);
        } catch (_) { /* noop */ }
    };

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => activate(tab.getAttribute('data-welcome-section-tab')));
    });

    const storedKey = readPanelStoredTab(panelId, guildId, null, tabKeys);
    if (storedKey) {
        activate(storedKey);
    } else if (!tabs.some((t) => t.classList.contains('is-active'))) {
        activate(tabs[0].getAttribute('data-welcome-section-tab'));
    }
}

function renderGreetingPanel(guildId, channels, mode) {
    const container = document.getElementById('welcomeContainer');
    if (!container) return;

    const meta = getGreetingPanelMeta(mode);
    const cfg = getCurrentGreetingConfig(mode) || {};
    const subtitleHtml = mode === 'welcome' ? meta.subtitle : escapeHtml(meta.subtitle);

    const heroHtml = dpxRenderHero({
        kicker: 'Saludos automáticos',
        title: 'Bienvenida y despedida',
        description: 'Mismo flujo para entrada y salida: canal, embed con variables, miniatura e imagen, y DM opcional. La vista previa se actualiza en vivo.',
        accent: '#c4b5fd',
        glow1: 'rgba(196,181,253,0.18)',
        glow2: 'rgba(167,139,250,0.22)',
        iconName: 'door',
        actionsHtml: ''
    });

    const modeTabsHtml = `
        <nav class="dpx-tabs welcome-mode-tabs" role="tablist" aria-label="Tipo de mensaje">
            <button type="button" class="dpx-tab ${mode === 'welcome' ? 'is-active' : ''}" data-greeting-tab="welcome" role="tab" aria-selected="${mode === 'welcome' ? 'true' : 'false'}">
                ${dpxIcon('sprout', 'dpx-tab-icon')}<span>Bienvenida</span>
            </button>
            <button type="button" class="dpx-tab ${mode === 'goodbye' ? 'is-active' : ''}" data-greeting-tab="goodbye" role="tab" aria-selected="${mode === 'goodbye' ? 'true' : 'false'}">
                ${dpxIcon('door', 'dpx-tab-icon')}<span>Despedida</span>
            </button>
        </nav>`;

    const sectionTabsHtml = `
        <nav class="dpx-tabs welcome-section-tabs" role="tablist" aria-label="Apartados del editor">
            <button type="button" class="dpx-tab is-active" data-welcome-section-tab="general" role="tab">${dpxIcon('gear', 'dpx-tab-icon')}<span>General</span></button>
            <button type="button" class="dpx-tab" data-welcome-section-tab="message" role="tab">${dpxIcon('chat', 'dpx-tab-icon')}<span>Mensaje</span></button>
            <button type="button" class="dpx-tab" data-welcome-section-tab="media" role="tab">${dpxIcon('image', 'dpx-tab-icon')}<span>Imágenes</span></button>
            <button type="button" class="dpx-tab" data-welcome-section-tab="dm" role="tab">${dpxIcon('send', 'dpx-tab-icon')}<span>DM</span></button>
        </nav>`;

    container.innerHTML = `
        <div class="greeting-page welcome-dpx-root" data-greeting-mode="${mode}">
        <div class="dpx-panel welcome-dpx-panel">
            ${heroHtml}
            ${modeTabsHtml}
            <p class="welcome-mode-subtitle">${subtitleHtml}</p>
            <div class="welcome-layout">
            <div class="welcome-editor greeting-editor">
                ${sectionTabsHtml}
                <div class="welcome-editor-pane-stack">
                <div class="welcome-editor-pane is-active" data-welcome-pane="general">
                <section class="greeting-card" aria-labelledby="greeting-section-basics">
                    <div class="greeting-card__head">
                        <h4 id="greeting-section-basics" class="greeting-card__title">Canal y apariencia</h4>
                        <span class="greeting-card__badge">Esencial</span>
                    </div>
                    <div class="form-grid greeting-card__grid">
                        <div class="form-group">
                            <label for="welcomeChannelSelect">${escapeHtml(meta.channelLabel)}</label>
                            <select id="welcomeChannelSelect" class="form-control">
                                <option value="">Selecciona un canal</option>
                                ${channels.map((c) => `<option value="${c.id}" ${cfg.channelId === c.id ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="welcomeColor">Color del embed</label>
                            <input type="color" id="welcomeColor" class="form-control color-input" value="#${(cfg.color || meta.defaultColor).replace('#', '')}">
                        </div>
                    </div>
                    <div class="greeting-toggle-row" role="group" aria-label="Opciones del mensaje">
                        <div class="greeting-toggle-card">
                            <div class="form-group checkbox-group greeting-toggle">
                                <label><input type="checkbox" id="welcomeEnabled" ${cfg.enabled !== false ? 'checked' : ''}> <span>${escapeHtml(meta.toggleLabel)}</span></label>
                            </div>
                        </div>
                        <div class="greeting-toggle-card">
                            <div class="form-group checkbox-group greeting-toggle">
                                <label><input type="checkbox" id="welcomeDmEnabled" ${cfg.dmEnabled ? 'checked' : ''}> <span>Enviar DM al usuario</span></label>
                            </div>
                        </div>
                        <div class="greeting-toggle-card">
                            <div class="form-group checkbox-group greeting-toggle">
                                <label><input type="checkbox" id="welcomeMentionUser" ${cfg.mentionUser ? 'checked' : ''}> <span>Mencionar al usuario en el canal</span></label>
                            </div>
                        </div>
                    </div>
                </section>

                ${mode === 'welcome' ? `
                <section class="greeting-card greeting-card--welcome-style" aria-labelledby="greeting-section-welcome-style">
                    <div class="greeting-card__head">
                        <div class="greeting-card__title-row">
                            <h4 id="greeting-section-welcome-style" class="greeting-card__title">Estilo de bienvenida</h4>
                            <button type="button" id="welcomeOpenStudioBtn" class="btn btn-primary wc-studio-launch-btn" style="display:none;" title="Editor profesional a pantalla completa">
                                <span class="wc-studio-launch-icon" aria-hidden="true">✦</span>
                                Abrir Eyed Studio
                            </button>
                        </div>
                        <p class="greeting-card__hint greeting-card__hint--style" data-welcome-style-hint>La bienvenida se envía como un <strong>embed</strong> clásico de Discord (borde de color, miniatura e imagen).</p>
                    </div>
                    <div class="form-group greeting-style-field">
                        <span class="greeting-var-strip__label greeting-style-field__label">Formato del mensaje</span>
                        <div class="greeting-style-options greeting-style-segment" role="radiogroup" aria-label="Formato del mensaje de bienvenida">
                            <label class="greeting-style-option">
                                <input type="radio" name="welcomeStyle" value="embed" ${(cfg.welcomeStyle || 'embed') !== 'card' ? 'checked' : ''}>
                                <span class="greeting-style-option__body">
                                    <span class="greeting-style-option__title">Embed clásico</span>
                                    <span class="greeting-style-option__desc">Mensaje con borde de color, como en Discord</span>
                                </span>
                            </label>
                            <label class="greeting-style-option">
                                <input type="radio" name="welcomeStyle" value="card" ${cfg.welcomeStyle === 'card' ? 'checked' : ''}>
                                <span class="greeting-style-option__body">
                                    <span class="greeting-style-option__title">Imagen con fondo</span>
                                    <span class="greeting-style-option__desc">Tarjeta PNG 920×520 con editor visual, fuentes y colores</span>
                                </span>
                            </label>
                        </div>
                    </div>
                    <div id="welcomeCardColorFields" class="greeting-card__body-card-extra" style="display:none">
                        <div class="form-grid greeting-card__grid">
                        <div class="form-group">
                            <label for="welcomeCardFont">Fuente del texto</label>
                            <select id="welcomeCardFont" class="form-control">
                                <option value="system" ${(cfg.cardFontKey || 'system') === 'system' ? 'selected' : ''}>Sans (Arial)</option>
                                <option value="serif" ${cfg.cardFontKey === 'serif' ? 'selected' : ''}>Serif (Georgia)</option>
                                <option value="mono" ${cfg.cardFontKey === 'mono' ? 'selected' : ''}>Monoespacio (Consolas)</option>
                                <option value="rounded" ${cfg.cardFontKey === 'rounded' ? 'selected' : ''}>Redondeada (Verdana)</option>
                                <option value="elegant" ${cfg.cardFontKey === 'elegant' ? 'selected' : ''}>Elegante (Times)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="welcomeCardAccent">Color del aro del avatar</label>
                            <input type="color" id="welcomeCardAccent" class="form-control color-input" value="#${(cfg.cardAccentColor || '4ade80').replace('#', '')}">
                        </div>
                        <div class="form-group">
                            <label for="welcomeCardTitle">Color del título grande</label>
                            <input type="color" id="welcomeCardTitle" class="form-control color-input" value="#${(cfg.cardTitleColor || 'ffffff').replace('#', '')}">
                        </div>
                        <div class="form-group">
                            <label for="welcomeCardName">Color de la línea central</label>
                            <input type="color" id="welcomeCardName" class="form-control color-input" value="#${(cfg.cardNameColor || 'f8fafc').replace('#', '')}">
                        </div>
                        <div class="form-group">
                            <label for="welcomeCardSubtitle">Color del subtítulo</label>
                            <input type="color" id="welcomeCardSubtitle" class="form-control color-input" value="#${(cfg.cardSubtitleColor || 'e2e8f0').replace('#', '')}">
                        </div>
                        </div>
                        <div class="form-group">
                            <label for="welcomeCardNameLine">Línea central (nombre o texto libre)</label>
                            <input type="text" id="welcomeCardNameLine" class="form-control" value="${escapeHtmlForValue(cfg.cardNameTemplate != null ? cfg.cardNameTemplate : '{username}')}" placeholder="{username} o texto fijo">
                            <small class="greeting-card__hint">Variables: {user}, {username}, {server}, {memberCount}. En la imagen las menciones se muestran como @nombre.</small>
                        </div>
                        <div class="form-group">
                            <label for="welcomeCardOverlay">Texto extra sobre la imagen</label>
                            <textarea id="welcomeCardOverlay" class="form-control" rows="2" placeholder="Ej.: ¡Gracias por unirte! o {server}">${escapeHtmlForValue(cfg.cardOverlayText || '')}</textarea>
                        </div>
                        <div class="form-group">
                            <label for="welcomeCardOverlayColor">Color del texto extra</label>
                            <input type="color" id="welcomeCardOverlayColor" class="form-control color-input" value="#${(cfg.cardOverlayColor || 'ffffff').replace('#', '')}">
                            <small class="greeting-card__hint">Se dibuja abajo a la derecha sobre el fondo.</small>
                        </div>
                        <p class="greeting-card__hint greeting-card__hint--action"><a href="#" id="welcomeScrollToBg" class="greeting-anchor-down">Ir a imagen de fondo</a></p>
                    </div>
                </section>
                ` : ''}

                </div>
                <div class="welcome-editor-pane" data-welcome-pane="message">
                <section class="greeting-card" aria-labelledby="greeting-section-embed">
                    <div class="greeting-card__head">
                        <h4 id="greeting-section-embed" class="greeting-card__title">${mode === 'welcome' ? 'Texto del mensaje' : 'Texto del embed'}</h4>
                        ${mode === 'welcome' ? '<p class="greeting-card__hint">Modo tarjeta: <strong>Título</strong> = línea grande arriba; <strong>Descripción</strong> = subtítulo bajo la línea central. La línea central se edita en «Estilo de bienvenida».</p>' : ''}
                    </div>
                    <div class="form-group">
                        <label for="welcomeTitle">${mode === 'welcome' ? 'Título (línea grande en tarjeta)' : 'Título'}</label>
                        <input type="text" id="welcomeTitle" class="form-control" value="${escapeHtmlForValue(cfg.title || meta.defaultTitle)}">
                    </div>
                    <div class="form-group">
                        <label for="welcomeMessage">${mode === 'welcome' ? 'Descripción (subtítulo en tarjeta)' : 'Descripción'}</label>
                        <textarea id="welcomeMessage" class="form-control greeting-textarea-main" rows="5">${escapeHtmlForValue(cfg.message || meta.defaultMessage)}</textarea>
                    </div>
                    <div class="greeting-var-strip" role="group" aria-label="Insertar variables en la descripción">
                        <span class="greeting-var-strip__label">Insertar</span>
                        <button type="button" class="greeting-var-chip" data-var="{user}" title="Mención del miembro">{user}</button>
                        <button type="button" class="greeting-var-chip" data-var="{username}" title="Nombre de usuario">{username}</button>
                        <button type="button" class="greeting-var-chip" data-var="{server}" title="Nombre del servidor">{server}</button>
                        <button type="button" class="greeting-var-chip" data-var="{memberCount}" title="Número de miembros">{memberCount}</button>
                        ${renderChannelVarSelectHtml('welcomeMessage')}
                    </div>
                    <small class="dpx-field-hint">Canales: escribe <code>{#nombre}</code> o elige «+ Canal». También <code>{channel:id}</code>.</small>
                    <div class="greeting-var-strip greeting-var-strip--compact" role="group" aria-label="Insertar canal en título o pie">
                        <span class="greeting-var-strip__label">Canal en</span>
                        ${renderChannelVarSelectHtml('welcomeTitle')}
                        ${renderChannelVarSelectHtml('welcomeFooter')}
                    </div>
                    <div class="form-group">
                        <label for="welcomeFooter">Pie del embed</label>
                        <input type="text" id="welcomeFooter" class="form-control" value="${escapeHtmlForValue(cfg.footer || meta.defaultFooter)}">
                    </div>
                </section>
                </div>

                <div class="welcome-editor-pane" data-welcome-pane="media">
                <section class="greeting-card greeting-card--media" id="welcomeBgImageSection" aria-labelledby="greeting-section-thumb">
                    <div class="greeting-card__head">
                        <h4 id="greeting-section-thumb" class="greeting-card__title">Miniatura y fondo</h4>
                        <p class="greeting-card__hint">${mode === 'welcome' ? 'En <strong>tarjeta PNG</strong>, la imagen principal cubre todo el fondo. En embed, la miniatura va arriba a la derecha y la imagen debajo del texto.' : 'La miniatura aparece arriba a la derecha; la imagen grande va debajo del texto.'}</p>
                    </div>
                    <div class="form-row greeting-thumb-row">
                        <div class="form-group">
                            <label for="welcomeThumbnailMode">Modo de miniatura</label>
                            <select id="welcomeThumbnailMode" class="form-control">
                                <option value="avatar" ${cfg.thumbnailMode === 'avatar' ? 'selected' : ''}>Avatar del usuario</option>
                                <option value="url" ${cfg.thumbnailMode === 'url' ? 'selected' : ''}>URL personalizada</option>
                                <option value="none" ${cfg.thumbnailMode === 'none' ? 'selected' : ''}>Sin miniatura</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="welcomeThumbnailUrl">URL de miniatura</label>
                            <input type="url" id="welcomeThumbnailUrl" class="form-control" value="${escapeHtmlForValue(cfg.thumbnailUrl || '')}" placeholder="https://...">
                        </div>
                    </div>

                    <div class="welcome-image-editor greeting-image-tools">
                        <div class="greeting-card__head greeting-card__head--nested">
                            <h4 class="greeting-card__title greeting-card__title--sm">Fondo / imagen principal</h4>
                            <p class="greeting-card__hint">Pega una URL o elige archivo; en modo tarjeta es el fondo completo. Puedes recortar y escalar antes de subir.</p>
                        </div>
                        <div class="form-group">
                            <label for="welcomeImageUrl">URL de imagen</label>
                            <input type="url" id="welcomeImageUrl" class="form-control" value="${escapeHtmlForValue(cfg.imageUrl || '')}" placeholder="https://...">
                        </div>
                        <div class="form-group">
                            <label for="welcomeImageFile">Archivo local</label>
                            <input type="file" id="welcomeImageFile" class="form-control" accept="image/*">
                        </div>
                        <div class="form-group">
                            <label for="welcomeImageScale">Escala</label>
                            <input type="range" id="welcomeImageScale" class="form-control" min="25" max="100" step="5" value="100">
                            <small id="welcomeImageScaleValue">100%</small>
                        </div>
                        <div class="form-row greeting-crop-grid">
                            <div class="form-group">
                                <label for="welcomeImageCropX">Recorte X (%)</label>
                                <input type="range" id="welcomeImageCropX" class="form-control" min="0" max="80" step="1" value="0">
                            </div>
                            <div class="form-group">
                                <label for="welcomeImageCropY">Recorte Y (%)</label>
                                <input type="range" id="welcomeImageCropY" class="form-control" min="0" max="80" step="1" value="0">
                            </div>
                            <div class="form-group">
                                <label for="welcomeImageCropW">Ancho (%)</label>
                                <input type="range" id="welcomeImageCropW" class="form-control" min="20" max="100" step="1" value="100">
                            </div>
                            <div class="form-group">
                                <label for="welcomeImageCropH">Alto (%)</label>
                                <input type="range" id="welcomeImageCropH" class="form-control" min="20" max="100" step="1" value="100">
                            </div>
                        </div>
                        <div class="welcome-crop-visual-panel" aria-labelledby="welcome-crop-visual-label">
                            <div class="welcome-crop-visual-head">
                                <span id="welcome-crop-visual-label" class="welcome-crop-visual-title">Vista previa del recorte</span>
                                <div class="welcome-crop-presets" role="group" aria-label="Ajustes rápidos de recorte">
                                    <button type="button" class="welcome-crop-preset-btn" id="welcomeCropPresetFull" title="Usar toda la imagen">Marco completo</button>
                                    <button type="button" class="welcome-crop-preset-btn" id="welcomeCropPresetCenter" title="Recorte central al 80%">Centro 80%</button>
                                    <button type="button" class="welcome-crop-preset-btn" id="welcomeCropPresetBanner" title="Banda superior tipo banner">Banda superior</button>
                                </div>
                            </div>
                            <canvas id="welcomeCropCanvas" class="welcome-crop-canvas" width="360" height="200" role="img" aria-label="Aproximación de la zona recortada"></canvas>
                            <p class="welcome-crop-visual-hint" id="welcomeCropVisualHint"></p>
                        </div>
                        <div class="form-actions welcome-editor-actions greeting-upload-row">
                            <button type="button" id="welcomeUploadImageBtn" class="btn btn-secondary">Procesar y subir imagen</button>
                            <small id="welcomeImageUploadStatus"></small>
                        </div>
                    </div>
                </section>
                </div>

                <div class="welcome-editor-pane" data-welcome-pane="dm">
                <section class="greeting-card" aria-labelledby="greeting-section-dm">
                    <div class="greeting-card__head">
                        <h4 id="greeting-section-dm" class="greeting-card__title">Mensaje directo</h4>
                        <p class="greeting-card__hint">Opcional. Solo se envía si activas «Enviar DM al usuario».</p>
                    </div>
                    <div class="form-group">
                        <label for="welcomeDmMessage">Texto del DM</label>
                        <textarea id="welcomeDmMessage" class="form-control" rows="3" placeholder="Ej.: Lee las reglas en #reglas">${escapeHtmlForValue(cfg.dmMessage || '')}</textarea>
                    </div>
                </section>
                </div>
                </div>

                <footer class="greeting-actions-bar form-actions">
                    <div class="greeting-actions-bar__inner">
                        <p class="greeting-actions-bar__hint">Los cambios no se aplican al servidor hasta que guardes. La prueba usa la configuración guardada.</p>
                        <div class="greeting-actions-bar__buttons">
                            <button type="button" id="saveWelcomeBtn" class="btn btn-primary">${escapeHtml(meta.saveButton)}</button>
                            <button type="button" id="testWelcomeBtn" class="btn btn-secondary">${escapeHtml(meta.testButton)}</button>
                        </div>
                    </div>
                </footer>
            </div>

            <aside class="welcome-preview-panel">
                <div class="welcome-preview-panel__top" id="welcomePreviewHeadingEmbed">
                    <h4 class="welcome-preview-heading">Vista previa del embed</h4>
                    <p class="welcome-preview-panel__sub">Se actualiza al cambiar título, descripción, color o imágenes.</p>
                </div>
                <div class="welcome-preview-panel__top" id="welcomePreviewHeadingCard" style="display:none;">
                    <h4 class="welcome-preview-heading">Vista previa de la tarjeta</h4>
                    <p class="welcome-preview-panel__sub">PNG que enviará el bot al unirse un miembro (mismas variables en título y descripción).</p>
                </div>
                <div class="welcome-preview-stage" aria-label="Vista previa de bienvenida o despedida">
                    <div id="welcomeEmbedPreviewWrap">
                        <div id="welcomePreviewCard" class="embed-preview"></div>
                    </div>
                    ${mode === 'welcome' ? `
                    <div id="welcomeCardPreviewWrap" class="welcome-card-preview-wrap" style="display:none;text-align:center;">
                        <div id="welcomeCardPreviewStatus" class="welcome-card-preview-status" aria-live="polite"></div>
                        <img id="welcomeCardPreviewImg" class="welcome-card-preview-img" alt="Vista previa de tarjeta PNG" decoding="async">
                    </div>
                    ` : ''}
                </div>
            </aside>
        </div>
        </div>
        </div>
    `;

    const previewListeners = [
        'welcomeChannelSelect',
        'welcomeColor',
        'welcomeEnabled',
        'welcomeDmEnabled',
        'welcomeMentionUser',
        'welcomeTitle',
        'welcomeMessage',
        'welcomeFooter',
        'welcomeImageUrl',
        'welcomeThumbnailMode',
        'welcomeThumbnailUrl',
        'welcomeDmMessage',
        'welcomeImageScale',
        'welcomeImageCropX',
        'welcomeImageCropY',
        'welcomeImageCropW',
        'welcomeImageCropH',
        'welcomeCardAccent',
        'welcomeCardTitle',
        'welcomeCardName',
        'welcomeCardSubtitle',
        'welcomeCardFont',
        'welcomeCardNameLine',
        'welcomeCardOverlay',
        'welcomeCardOverlayColor'
    ];

    previewListeners.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const eventName = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(eventName, () => {
            if (id === 'welcomeImageScale') {
                const value = Number.parseInt(el.value || '100', 10);
                const label = document.getElementById('welcomeImageScaleValue');
                if (label) label.textContent = `${value}%`;
            }

            if (id === 'welcomeThumbnailMode') {
                const thumbUrlInput = document.getElementById('welcomeThumbnailUrl');
                if (thumbUrlInput) thumbUrlInput.disabled = String(el.value || 'avatar') !== 'url';
            }

            updateWelcomePreviewPanel(guildId);
            scheduleWelcomeCropVisualUpdate();
        });
    });

    container.querySelectorAll('input[name="welcomeStyle"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            syncWelcomeStyleUI(guildId);
            scheduleWelcomeCropVisualUpdate();
        });
    });
    if (mode === 'welcome') syncWelcomeStyleUI(guildId);

    const bindWelcomeCropPreset = (btnId, apply) => {
        document.getElementById(btnId)?.addEventListener('click', () => {
            apply();
            updateWelcomePreviewPanel(guildId);
            scheduleWelcomeCropVisualUpdate();
        });
    };
    bindWelcomeCropPreset('welcomeCropPresetFull', () => setWelcomeImageCropSliders({ x: 0, y: 0, w: 100, h: 100 }));
    bindWelcomeCropPreset('welcomeCropPresetCenter', () => setWelcomeImageCropSliders({ x: 10, y: 10, w: 80, h: 80 }));
    bindWelcomeCropPreset('welcomeCropPresetBanner', () => setWelcomeImageCropSliders({ x: 0, y: 0, w: 100, h: 55 }));

    container.querySelector('.greeting-var-strip')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.greeting-var-chip');
        if (!btn || !btn.dataset.var) return;
        const ta = document.getElementById('welcomeMessage');
        if (!ta) return;
        const ins = btn.dataset.var;
        const start = typeof ta.selectionStart === 'number' ? ta.selectionStart : ta.value.length;
        const end = typeof ta.selectionEnd === 'number' ? ta.selectionEnd : ta.value.length;
        ta.value = `${ta.value.slice(0, start)}${ins}${ta.value.slice(end)}`;
        ta.focus();
        const caret = start + ins.length;
        ta.setSelectionRange(caret, caret);
        updateWelcomePreviewPanel(guildId);
    });

    container.querySelectorAll('[data-greeting-tab]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
            const nextMode = tabBtn.dataset.greetingTab;
            if (!nextMode || nextMode === currentGreetingMode) return;
            saveCurrentGreetingDraft();
            currentGreetingMode = nextMode;
            try {
                sessionStorage.setItem(panelTabStorageKey('welcome-mode', guildId), nextMode);
            } catch (_) { /* noop */ }
            renderGreetingPanel(guildId, channels, currentGreetingMode);
        });
    });

    const thumbUrlInput = document.getElementById('welcomeThumbnailUrl');
    const thumbMode = document.getElementById('welcomeThumbnailMode')?.value || 'avatar';
    if (thumbUrlInput) thumbUrlInput.disabled = thumbMode !== 'url';

    const imageFileInput = document.getElementById('welcomeImageFile');
    if (imageFileInput) {
        imageFileInput.addEventListener('change', handleWelcomeImageSelection);
    }

    const uploadBtn = document.getElementById('welcomeUploadImageBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => uploadWelcomeEditedImage(guildId));
    }

    const saveBtn = document.getElementById('saveWelcomeBtn');
    const testBtn = document.getElementById('testWelcomeBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => saveWelcomeConfig(guildId));
    if (testBtn) testBtn.addEventListener('click', () => sendWelcomeTest(guildId));
    const studioBtn = document.getElementById('welcomeOpenStudioBtn');
    if (studioBtn && mode === 'welcome') {
        studioBtn.addEventListener('click', () => openWelcomeCardStudio(guildId));
    }
    container.querySelector('#welcomeScrollToBg')?.addEventListener('click', (e) => {
        e.preventDefault();
        container.querySelector('[data-welcome-section-tab="media"]')?.click();
        requestAnimationFrame(() => {
            document.getElementById('welcomeBgImageSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
    bindWelcomeEditorSectionTabs(container, guildId, mode);
    bindChannelVarSelects(container);
    updateWelcomePreviewPanel(guildId);
    scheduleWelcomeCropVisualUpdate();
}

async function loadWelcomePanel(guildId) {
    const container = document.getElementById('welcomeContainer');
    if (!container) return;

    try {
        const [channelsResponse, welcomeResponse, goodbyeResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/welcome-config`),
            fetchWithCredentials(`/api/guild/${guildId}/goodbye-config`)
        ]);

        if (!channelsResponse.ok || !welcomeResponse.ok || !goodbyeResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar la configuración de bienvenida y despedida.</div>';
            return;
        }

        const channels = (await channelsResponse.json()).filter((c) => c.type === 0);
        setPanelGuildTextChannels(channels);
        currentWelcomeConfig = await welcomeResponse.json();
        currentGoodbyeConfig = await goodbyeResponse.json();
        currentWelcomeConfig.cardLayout = welcomeMergeCardLayout(currentWelcomeConfig.cardLayout);

        clearWelcomeImagePendingPreview();
        if (welcomeCardPreviewObjectUrl) URL.revokeObjectURL(welcomeCardPreviewObjectUrl);
        welcomeCardPreviewObjectUrl = '';
        clearTimeout(welcomeCardPreviewTimer);
        welcomeCardPreviewTimer = null;
        welcomeCropVisualCache = { src: '', img: null };
        clearTimeout(welcomeCropVisualTimer);
        welcomeCropVisualTimer = null;

        const storedMode = readPanelStoredTab('welcome-mode', guildId, 'welcome', ['welcome', 'goodbye']);
        currentGreetingMode = storedMode;
        renderGreetingPanel(guildId, channels, currentGreetingMode);
    } catch (error) {
        console.error('Error cargando panel de bienvenida/despedida:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando sistema de bienvenida y despedida.</div>';
    }
}

function applyWelcomePreviewTemplate(text, sample, options = {}) {
    const uname = sample.username || 'Usuario';
    const srv = sample.server || '';
    const mc = String(sample.memberCount || '');
    const plainMention = `@${uname}`;
    const htmlMentions = options.htmlMentions === true;

    if (!htmlMentions) {
        return resolveChannelMentionsPreview(String(text || '')
            .replace(/\{user\}|\{mention\}/gi, plainMention)
            .replace(/\{username\}|\{usuario\}|\{nombre\}/gi, uname)
            .replace(/\{server\}|\{guild\}/gi, srv)
            .replace(/\{memberCount\}|\{members\}|\{member_count\}/gi, mc));
    }

    const T_M = '{{__EYED_USER_MENTION__}}';
    const T_U = '{{__EYED_USERNAME__}}';
    const T_S = '{{__EYED_SERVER__}}';
    const T_MC = '{{__EYED_MC__}}';
    let s = String(text || '')
        .replace(/\{user\}|\{mention\}/gi, T_M)
        .replace(/\{username\}|\{usuario\}|\{nombre\}/gi, T_U)
        .replace(/\{server\}|\{guild\}/gi, T_S)
        .replace(/\{memberCount\}|\{members\}|\{member_count\}/gi, T_MC);
    s = escapeHtml(s);
    const mentionSafe = `<span class="discord-mention-preview">@${escapeHtml(uname)}</span>`;
    return resolveChannelMentionsPreview(s
        .split(T_M).join(mentionSafe)
        .split(T_U).join(escapeHtml(uname))
        .split(T_S).join(escapeHtml(srv))
        .split(T_MC).join(escapeHtml(mc)));
}

function getWelcomeStyleFromForm() {
    const checked = document.querySelector('input[name="welcomeStyle"]:checked');
    return checked?.value === 'card' ? 'card' : 'embed';
}

function welcomeMergeCardLayout(raw) {
    if (typeof window.WelcomeCardStudio?.mergeCardLayout === 'function') {
        return window.WelcomeCardStudio.mergeCardLayout(raw);
    }
    const d = {
        bgFocalX: 0.5,
        bgFocalY: 0.5,
        avatarCx: 460,
        avatarCy: 168,
        avatarR: 78,
        titleX: 460,
        titleY: 262,
        nameX: 460,
        nameY: 320,
        subtitleX: 460,
        subtitleY: 368,
        overlayX: 892,
        overlayY: 498
    };
    if (!raw || typeof raw !== 'object') return { ...d };
    const num = (v, def, min, max) => {
        const x = Number(v);
        return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
    };
    return {
        bgFocalX: num(raw.bgFocalX, d.bgFocalX, 0, 1),
        bgFocalY: num(raw.bgFocalY, d.bgFocalY, 0, 1),
        avatarCx: num(raw.avatarCx, d.avatarCx, 0, 920),
        avatarCy: num(raw.avatarCy, d.avatarCy, 0, 520),
        avatarR: num(raw.avatarR, d.avatarR, 36, 150),
        titleX: num(raw.titleX, d.titleX, 0, 920),
        titleY: num(raw.titleY, d.titleY, 0, 520),
        nameX: num(raw.nameX, d.nameX, 0, 920),
        nameY: num(raw.nameY, d.nameY, 0, 520),
        subtitleX: num(raw.subtitleX, d.subtitleX, 0, 920),
        subtitleY: num(raw.subtitleY, d.subtitleY, 0, 520),
        overlayX: num(raw.overlayX, d.overlayX, 0, 920),
        overlayY: num(raw.overlayY, d.overlayY, 0, 520)
    };
}

function syncWelcomeStyleUI(guildId) {
    const style = getWelcomeStyleFromForm();
    const studioBtn = document.getElementById('welcomeOpenStudioBtn');
    const cardColors = document.getElementById('welcomeCardColorFields');
    const thumbRow = document.querySelector('#serverPaneWelcome .greeting-thumb-row');
    const styleHint = document.querySelector('[data-welcome-style-hint]');
    const footerField = document.getElementById('welcomeFooter')?.closest('.form-group');
    const colorField = document.getElementById('welcomeColor')?.closest('.form-group');

    if (studioBtn) studioBtn.style.display = style === 'card' ? '' : 'none';
    if (cardColors) cardColors.style.display = style === 'card' ? '' : 'none';
    if (thumbRow) thumbRow.style.display = style === 'card' ? 'none' : '';
    if (footerField) footerField.style.display = style === 'card' ? 'none' : '';
    if (colorField) colorField.style.display = style === 'card' ? 'none' : '';
    if (styleHint) {
        styleHint.innerHTML = style === 'card'
            ? 'La bienvenida se envía como <strong>imagen PNG</strong> con fondo a pantalla completa. Usa el <strong>Editor profesional</strong> para posicionar avatar, textos, fuentes y colores.'
            : 'La bienvenida se envía como un <strong>embed</strong> clásico de Discord (borde de color, miniatura e imagen).';
    }
    updateWelcomePreviewPanel(guildId);
}

function scheduleWelcomeCardPreview(guildId) {
    clearTimeout(welcomeCardPreviewTimer);
    welcomeCardPreviewTimer = setTimeout(() => {
        fetchWelcomeCardPreview(guildId);
    }, 420);
}

async function fetchWelcomeCardPreview(guildId) {
    const img = document.getElementById('welcomeCardPreviewImg');
    const statusEl = document.getElementById('welcomeCardPreviewStatus');
    const wrap = document.getElementById('welcomeCardPreviewWrap');
    if (!img || currentGreetingMode !== 'welcome') return;
    const payload = collectWelcomeConfigFromForm();
    if (payload.welcomeStyle !== 'card') return;

    const setBusy = (on) => {
        if (statusEl) {
            statusEl.textContent = on ? 'Generando vista previa…' : '';
            statusEl.classList.toggle('is-busy', Boolean(on));
        }
        if (wrap) wrap.classList.toggle('is-loading', Boolean(on));
    };

    setBusy(true);
    try {
        const res = await fetchWithCredentials(`/api/guild/${guildId}/welcome-card-preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const ct = String(res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            showToast(err.error || `No se pudo generar la vista previa (${res.status})`, 'error');
            setBusy(false);
            return;
        }
        if (!ct.includes('image/png')) {
            const err = await res.json().catch(() => ({}));
            showToast(err.error || 'La vista previa no devolvió una imagen PNG válida', 'error');
            setBusy(false);
            return;
        }
        const blob = await res.blob();
        if (!blob || blob.size < 64) {
            showToast('La vista previa de la tarjeta está vacía o corrupta', 'error');
            setBusy(false);
            return;
        }
        const sig = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
        const isPng = sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47;
        if (!isPng) {
            showToast('La respuesta no es un PNG (¿sesión caducada o error del servidor?)', 'error');
            setBusy(false);
            return;
        }
        if (welcomeCardPreviewObjectUrl) URL.revokeObjectURL(welcomeCardPreviewObjectUrl);
        welcomeCardPreviewObjectUrl = URL.createObjectURL(blob);
        img.onload = () => setBusy(false);
        img.onerror = () => {
            setBusy(false);
            showToast('No se pudo mostrar la imagen de vista previa', 'error');
        };
        img.src = welcomeCardPreviewObjectUrl;
        if (img.complete) setBusy(false);
    } catch (error) {
        console.error('Error cargando vista previa de tarjeta:', error);
        showToast('Error de red al cargar la vista previa de la tarjeta', 'error');
        setBusy(false);
    }
}

function updateWelcomePreviewPanel(guildId) {
    const headingEmbed = document.getElementById('welcomePreviewHeadingEmbed');
    const headingCard = document.getElementById('welcomePreviewHeadingCard');
    const embedWrap = document.getElementById('welcomeEmbedPreviewWrap');
    const cardWrap = document.getElementById('welcomeCardPreviewWrap');
    const mode = currentGreetingMode;
    const style = mode === 'welcome' ? getWelcomeStyleFromForm() : 'embed';

    if (headingEmbed && headingCard) {
        if (mode === 'welcome' && style === 'card') {
            headingEmbed.style.display = 'none';
            headingCard.style.display = '';
        } else {
            headingEmbed.style.display = '';
            headingCard.style.display = 'none';
        }
    } else if (headingEmbed) {
        headingEmbed.style.display = '';
    }

    const cardColors = document.getElementById('welcomeCardColorFields');
    if (cardColors) cardColors.style.display = mode === 'welcome' && style === 'card' ? '' : 'none';

    if (mode === 'goodbye' || style === 'embed' || !cardWrap) {
        if (embedWrap) embedWrap.style.display = '';
        if (cardWrap) cardWrap.style.display = 'none';
        renderWelcomeEmbedPreview(guildId);
        return;
    }

    if (embedWrap) embedWrap.style.display = 'none';
    cardWrap.style.display = '';
    scheduleWelcomeCardPreview(guildId);
}

function renderWelcomeEmbedPreview(guildId) {
    const preview = document.getElementById('welcomePreviewCard');
    if (!preview) return;

    const guild = currentServerGuilds.find((g) => String(g.id) === String(guildId));
    const meta = getGreetingPanelMeta(currentGreetingMode);
    const payload = collectWelcomeConfigFromForm();

    const sample = {
        username: currentUser?.username || 'NuevoUsuario',
        server: guild?.name || 'Tu Servidor',
        memberCount: guild?.botGuild?.memberCount || 123
    };

    const colorHex = (payload.color || meta.defaultColor).replace('#', '');
    const color = `#${colorHex}`;
    const previewOpts = { htmlMentions: true };
    const title = applyWelcomePreviewTemplate(payload.title, sample, previewOpts);
    const message = applyWelcomePreviewTemplate(payload.message, sample, previewOpts);
    const footer = applyWelcomePreviewTemplate(payload.footer, sample, previewOpts);

    const imageRaw = welcomeImagePreviewUrl || payload.imageUrl;
    const image = resolveWelcomePreviewMediaUrl(imageRaw);
    const showThumb = payload.thumbnailMode === 'avatar' || (payload.thumbnailMode === 'url' && payload.thumbnailUrl);
    const thumbSrcRaw = payload.thumbnailMode === 'url'
        ? payload.thumbnailUrl
        : `https://cdn.discordapp.com/embed/avatars/${(Number(currentUser?.discriminator || 0) % 5 + 5) % 5}.png`;
    const thumbSrc = resolveWelcomePreviewMediaUrl(thumbSrcRaw) || thumbSrcRaw;
    const safeThumbSrc = escapeHtmlForValue(thumbSrc);
    const safeImageSrc = escapeHtmlForValue(image);

    preview.innerHTML = `
        <div class="discord-embed welcome-discord-embed-preview" style="border-left-color:${color};">
            ${showThumb ? `<img src="${safeThumbSrc}" alt="" class="discord-embed-thumbnail" width="80" height="80" decoding="async" loading="lazy">` : ''}
            <div class="discord-embed-textblock">
                ${title ? `<div class="discord-embed-title">${title}</div>` : ''}
                ${message ? `<div class="discord-embed-description">${message}</div>` : ''}
            </div>
            ${image ? `<img src="${safeImageSrc}" alt="" class="discord-embed-image welcome-discord-embed-image" decoding="async" loading="lazy">` : ''}
            ${(footer || payload.enabled === false) ? `<div class="discord-embed-footer">${footer || ''}${payload.enabled === false ? ` - ${escapeHtml(meta.disabledText)}` : ''}</div>` : ''}
        </div>
    `;
}

function handleWelcomeImageSelection(event) {
    const file = event.target.files?.[0] || null;
    const status = document.getElementById('welcomeImageUploadStatus');

    if (!file) {
        clearWelcomeImagePendingPreview();
        if (status) status.textContent = '';
        updateWelcomePreviewPanel(currentServerGuildId);
        scheduleWelcomeCropVisualUpdate();
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('Solo puedes subir archivos de imagen', 'warning');
        event.target.value = '';
        return;
    }

    welcomeImageFile = file;
    if (welcomeImagePreviewUrl) URL.revokeObjectURL(welcomeImagePreviewUrl);
    welcomeImagePreviewUrl = URL.createObjectURL(file);
    if (status) status.textContent = `Archivo listo: ${file.name}`;
    updateWelcomePreviewPanel(currentServerGuildId);
    scheduleWelcomeCropVisualUpdate();
}

function getWelcomeImageCropSettings() {
    return {
        x: Number.parseInt(document.getElementById('welcomeImageCropX')?.value || '0', 10),
        y: Number.parseInt(document.getElementById('welcomeImageCropY')?.value || '0', 10),
        w: Number.parseInt(document.getElementById('welcomeImageCropW')?.value || '100', 10),
        h: Number.parseInt(document.getElementById('welcomeImageCropH')?.value || '100', 10)
    };
}

function setWelcomeImageCropSliders(crop) {
    const x = document.getElementById('welcomeImageCropX');
    const y = document.getElementById('welcomeImageCropY');
    const w = document.getElementById('welcomeImageCropW');
    const h = document.getElementById('welcomeImageCropH');
    if (x) x.value = String(clampNum(crop?.x ?? 0, 0, 80));
    if (y) y.value = String(clampNum(crop?.y ?? 0, 0, 80));
    if (w) w.value = String(clampNum(crop?.w ?? 100, 20, 100));
    if (h) h.value = String(clampNum(crop?.h ?? 100, 20, 100));
}

function clampNum(n, a, b) {
    const x = Number(n);
    if (!Number.isFinite(x)) return a;
    return Math.min(b, Math.max(a, x));
}

function scheduleWelcomeCropVisualUpdate() {
    clearTimeout(welcomeCropVisualTimer);
    welcomeCropVisualTimer = setTimeout(() => {
        welcomeCropVisualTimer = null;
        updateWelcomeCropVisual();
    }, 90);
}

function updateWelcomeCropVisual() {
    const canvas = document.getElementById('welcomeCropCanvas');
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const hint = document.getElementById('welcomeCropVisualHint');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssW = 360;
    const cssH = 200;
    const dpr = Math.min(2, typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const crop = getWelcomeImageCropSettings();
    const urlRaw = (welcomeImagePreviewUrl || document.getElementById('welcomeImageUrl')?.value || '').trim();
    const loadSrc = resolveWelcomePreviewMediaUrl(urlRaw);

    ctx.fillStyle = '#1e1f22';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, cssW - 1, cssH - 1);

    const drawPlaceholder = (msg) => {
        ctx.fillStyle = '#949ba4';
        ctx.font = '13px system-ui,Segoe UI,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = String(msg || '').split('\n');
        const mid = cssH / 2 - (lines.length - 1) * 8;
        lines.forEach((line, i) => ctx.fillText(line, cssW / 2, mid + i * 18));
        if (hint) hint.textContent = urlRaw ? 'No se pudo cargar la imagen para el recorte (comprueba la URL o usa un archivo).' : 'Elige una URL o un archivo para ver el recorte.';
    };

    if (!urlRaw) {
        drawPlaceholder('Sin imagen\nElige archivo o URL');
        if (hint) hint.textContent = '';
        return;
    }

    if (!loadSrc) {
        drawPlaceholder('URL de imagen no válida');
        if (hint) hint.textContent = '';
        return;
    }

    const paint = (img) => {
        const cropX = Math.max(0, Math.min(100, crop.x));
        const cropY = Math.max(0, Math.min(100, crop.y));
        const cropW = Math.max(1, Math.min(100, crop.w));
        const cropH = Math.max(1, Math.min(100, crop.h));
        const sx = Math.round((cropX / 100) * img.width);
        const sy = Math.round((cropY / 100) * img.height);
        const maxCropW = img.width - sx;
        const maxCropH = img.height - sy;
        const sw = Math.max(1, Math.min(maxCropW, Math.round((cropW / 100) * img.width)));
        const sh = Math.max(1, Math.min(maxCropH, Math.round((cropH / 100) * img.height)));

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cssW, cssH);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, cssW, cssH);
        ctx.clip();
        const scale = Math.max(cssW / sw, cssH / sh);
        const dw = sw * scale;
        const dh = sh * scale;
        const ox = (cssW - dw) / 2;
        const oy = (cssH - dh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, ox, oy, dw, dh);
        ctx.restore();

        ctx.strokeStyle = 'rgba(124, 77, 255, 0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, cssW - 2, cssH - 2);

        if (hint) {
            hint.textContent = `Zona: ${cropX}%·${cropY}% · ${cropW}%×${cropH}% del original (${sw}×${sh} px aprox.).`;
        }
    };

    if (welcomeCropVisualCache.src === loadSrc && welcomeCropVisualCache.img && welcomeCropVisualCache.img.complete) {
        paint(welcomeCropVisualCache.img);
        return;
    }

    const im = new Image();
    im.onload = () => {
        welcomeCropVisualCache = { src: loadSrc, img: im };
        paint(im);
    };
    im.onerror = () => {
        welcomeCropVisualCache = { src: '', img: null };
        drawPlaceholder('Vista previa no disponible');
    };
    im.src = loadSrc;
}

function getGreetingImageUploadSlot(kind = 'image') {
    const isGoodbye = currentGreetingMode === 'goodbye';
    if (kind === 'thumbnail') return isGoodbye ? 'goodbye_thumb' : 'welcome_thumb';
    return isGoodbye ? 'goodbye' : 'welcome';
}

async function uploadWelcomeEditedImage(guildId, opts = {}) {
    const { suppressSuccessToast = false } = opts;
    if (!welcomeImageFile) {
        showToast('Selecciona una imagen primero', 'warning');
        return false;
    }

    const uploadBtn = document.getElementById('welcomeUploadImageBtn');
    const status = document.getElementById('welcomeImageUploadStatus');
    const imageUrlInput = document.getElementById('welcomeImageUrl');
    const scale = Number.parseInt(document.getElementById('welcomeImageScale')?.value || '100', 10);

    if (uploadBtn) uploadBtn.disabled = true;
    if (status) status.textContent = 'Procesando imagen...';

    try {
        const resized = await resizeImageFile(welcomeImageFile, scale, 1600, getWelcomeImageCropSettings());
        const extension = (resized.name.split('.').pop() || 'jpg').toLowerCase();
        const uploadName = `welcome_${Date.now()}.${extension}`;

        const formData = new FormData();
        formData.append('imageFile', resized, uploadName);
        formData.append('slot', getGreetingImageUploadSlot('image'));

        const response = await fetchWithCredentials(`/api/guild/${guildId}/welcome-image`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json().catch(() => ({}));
        const persisted = data.path || data.url || '';
        if (!response.ok || !persisted) {
            showToast(data.error || 'No se pudo subir la imagen', 'error');
            return false;
        }

        if (data.config) setCurrentGreetingConfig(currentGreetingMode, data.config);
        if (imageUrlInput) imageUrlInput.value = persisted;
        welcomeImageFile = null;

        if (data.storedInDb === false) {
            showToast(data.error || 'Imagen en disco pero no en MySQL. Revisa la conexión a la base de datos.', 'warning');
        } else if (status) {
            status.textContent = 'Imagen guardada en la base de datos';
        }

        if (!suppressSuccessToast && data.storedInDb !== false) {
            showToast(getGreetingPanelMeta(currentGreetingMode).uploadSuccess, 'success');
        }
        welcomeCropVisualCache = { src: '', img: null };
        clearWelcomeImagePendingPreview();
        updateWelcomePreviewPanel(guildId);
        scheduleWelcomeCropVisualUpdate();
        return data.storedInDb !== false;
    } catch (error) {
        console.error('Error subiendo imagen de bienvenida:', error);
        showToast('Error subiendo la imagen', 'error');
        return false;
    } finally {
        if (uploadBtn) uploadBtn.disabled = false;
    }
}

async function processAndUploadWelcomeStudioBackground(guildId, file) {
    if (typeof resizeImageFile !== 'function') {
        throw new Error('Procesador de imagen no disponible');
    }
    const resized = await resizeImageFile(file, 100, 1920, { x: 0, y: 0, w: 100, h: 100 });
    const extension = (resized.name.split('.').pop() || 'jpg').toLowerCase();
    const uploadName = `welcome_studio_${Date.now()}.${extension}`;
    const formData = new FormData();
    formData.append('imageFile', resized, uploadName);
    formData.append('slot', getGreetingImageUploadSlot('image'));

    const response = await fetchWithCredentials(`/api/guild/${guildId}/welcome-image`, {
        method: 'POST',
        body: formData
    });
    const data = await response.json().catch(() => ({}));
    const persisted = data.path || data.url || '';
    if (!response.ok || !persisted) {
        throw new Error(data.error || 'No se pudo subir la imagen');
    }
    if (data.storedInDb === false) {
        throw new Error(data.error || 'No se pudo guardar la imagen en MySQL');
    }
    if (data.config) setCurrentGreetingConfig(currentGreetingMode, data.config);

    const imageUrlInput = document.getElementById('welcomeImageUrl');
    if (imageUrlInput) imageUrlInput.value = persisted;
    clearWelcomeImagePendingPreview();
    const status = document.getElementById('welcomeImageUploadStatus');
    if (status) status.textContent = 'Imagen aplicada desde el editor';

    return persisted;
}

function getWelcomeFormMediaUrl(fieldId) {
    const raw = String(document.getElementById(fieldId)?.value || '').trim();
    if (/^(blob:|data:)/i.test(raw)) {
        const cfg = getCurrentGreetingConfig(currentGreetingMode) || {};
        const key = fieldId === 'welcomeThumbnailUrl' ? 'thumbnailUrl' : 'imageUrl';
        return String(cfg[key] || '').trim();
    }
    return raw;
}

function collectWelcomeConfigFromForm() {
    const meta = getGreetingPanelMeta(currentGreetingMode);
    const mentionEl = document.getElementById('welcomeMentionUser');
    const base = {
        enabled: document.getElementById('welcomeEnabled')?.checked ?? true,
        channelId: document.getElementById('welcomeChannelSelect')?.value || '',
        mentionUser: mentionEl ? mentionEl.checked : false,
        title: document.getElementById('welcomeTitle')?.value || meta.defaultTitle,
        message: document.getElementById('welcomeMessage')?.value || meta.defaultMessage,
        color: (document.getElementById('welcomeColor')?.value || `#${meta.defaultColor}`).replace('#', ''),
        footer: document.getElementById('welcomeFooter')?.value || meta.defaultFooter,
        imageUrl: getWelcomeFormMediaUrl('welcomeImageUrl'),
        thumbnailMode: document.getElementById('welcomeThumbnailMode')?.value || 'avatar',
        thumbnailUrl: getWelcomeFormMediaUrl('welcomeThumbnailUrl'),
        dmEnabled: document.getElementById('welcomeDmEnabled')?.checked ?? false,
        dmMessage: document.getElementById('welcomeDmMessage')?.value || ''
    };
    if (currentGreetingMode === 'welcome') {
        base.welcomeStyle = getWelcomeStyleFromForm();
        base.cardAccentColor = (document.getElementById('welcomeCardAccent')?.value || '#4ade80').replace('#', '');
        base.cardTitleColor = (document.getElementById('welcomeCardTitle')?.value || '#ffffff').replace('#', '');
        base.cardNameColor = (document.getElementById('welcomeCardName')?.value || '#f8fafc').replace('#', '');
        base.cardSubtitleColor = (document.getElementById('welcomeCardSubtitle')?.value || '#e2e8f0').replace('#', '');
        base.cardFontKey = document.getElementById('welcomeCardFont')?.value || 'system';
        base.cardNameTemplate = (document.getElementById('welcomeCardNameLine')?.value || '').trim() || '{username}';
        base.cardOverlayText = document.getElementById('welcomeCardOverlay')?.value || '';
        base.cardOverlayColor = (document.getElementById('welcomeCardOverlayColor')?.value || '#ffffff').replace('#', '');
        base.cardLayout = welcomeMergeCardLayout(currentWelcomeConfig?.cardLayout);
    }
    return base;
}

async function saveWelcomeConfig(guildId, showSuccessToast = true) {
    const meta = getGreetingPanelMeta(currentGreetingMode);
    const urlFieldRaw = String(document.getElementById('welcomeImageUrl')?.value || '').trim();
    if (welcomeImageFile) {
        const uploaded = await uploadWelcomeEditedImage(guildId, { suppressSuccessToast: true });
        if (!uploaded) return false;
    } else if (/^(blob:|data:)/i.test(urlFieldRaw)) {
        showToast('Tienes una imagen pendiente: selecciona el archivo de nuevo y pulsa «Subir imagen» antes de guardar.', 'warning');
        return false;
    }

    const payload = collectWelcomeConfigFromForm();
    if (!payload.channelId) {
        showToast(meta.channelRequired, 'warning');
        return false;
    }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/${meta.key}-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || `No se pudo guardar la ${meta.key === 'welcome' ? 'bienvenida' : 'despedida'}`, 'error');
            return false;
        }

        const savedCfg = data.config || payload;
        setCurrentGreetingConfig(currentGreetingMode, savedCfg);

        const imageUrlInput = document.getElementById('welcomeImageUrl');
        if (imageUrlInput && data.config && Object.prototype.hasOwnProperty.call(data.config, 'imageUrl')) {
            imageUrlInput.value = String(data.config.imageUrl || '');
        }
        clearWelcomeImagePendingPreview();
        welcomeCropVisualCache = { src: '', img: null };
        updateWelcomePreviewPanel(guildId);
        scheduleWelcomeCropVisualUpdate();

        if (showSuccessToast) showToast(meta.saveSuccess, 'success');
        return true;
    } catch (error) {
        console.error('Error guardando configuración de greetings:', error);
        showToast(`Error guardando ${meta.key === 'welcome' ? 'bienvenida' : 'despedida'}`, 'error');
        return false;
    }
}

async function sendWelcomeTest(guildId) {
    try {
        const meta = getGreetingPanelMeta(currentGreetingMode);
        const saved = await saveWelcomeConfig(guildId, false);
        if (!saved) return;

        const response = await fetchWithCredentials(`/api/guild/${guildId}/${meta.key}-test`, {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return showToast(data.error || 'No se pudo enviar la prueba', 'error');
        showToast(meta.testSuccess, 'success');
    } catch (error) {
        console.error('Error enviando prueba:', error);
        showToast('Error enviando prueba', 'error');
    }
}

const MODERATION_DURATION_PRESETS = [
    { ms: 5 * 60 * 1000, label: '5 minutos' },
    { ms: 10 * 60 * 1000, label: '10 minutos' },
    { ms: 30 * 60 * 1000, label: '30 minutos' },
    { ms: 60 * 60 * 1000, label: '1 hora' },
    { ms: 6 * 60 * 60 * 1000, label: '6 horas' },
    { ms: 24 * 60 * 60 * 1000, label: '1 día' },
    { ms: 7 * 24 * 60 * 60 * 1000, label: '7 días' },
    { ms: 28 * 24 * 60 * 60 * 1000, label: '28 días' }
];

function getModerationDurationPresets(action) {
    if (action === 'ban') {
        return [{ ms: 0, label: 'Permanente' }, ...MODERATION_DURATION_PRESETS];
    }
    if (action === 'kick') {
        return [{ ms: 0, label: 'Inmediato' }, ...MODERATION_DURATION_PRESETS];
    }
    return MODERATION_DURATION_PRESETS;
}

function getModerationModalCopy(action) {
    const titles = { timeout: 'Silenciar (mute)', ban: 'Banear', kick: 'Expulsar (kick)' };
    const messages = {
        timeout: 'Elige la duración del silencio y el motivo.',
        ban: 'Elige duración y motivo. «Permanente» aplica ban; otras duraciones usan timeout (máx. 28 días).',
        kick: 'La expulsión es inmediata. El tiempo solo queda registrado en el motivo si lo indicas abajo.'
    };
    return {
        title: titles[action] || `Moderar: ${action}`,
        message: messages[action] || 'Indica duración y motivo.',
        variant: action === 'ban' || action === 'kick' ? 'danger' : 'default'
    };
}

async function showAppModerationPrompt(action) {
    const copy = getModerationModalCopy(action);
    const presets = getModerationDurationPresets(action);
    const defaultMs = action === 'ban' ? 0 : (presets[0]?.ms || MODERATION_DURATION_PRESETS[1].ms);

    return openAppDialog({
        mode: 'prompt',
        title: copy.title,
        message: copy.message,
        variant: copy.variant,
        confirmLabel: 'Aplicar',
        input: { required: true, label: 'Motivo', placeholder: 'Describe la razón…' },
        durationPresets: presets,
        defaultDurationMs: defaultMs,
        returnObject: true
    });
}

// Moderar usuario
async function moderateUser(guildId, userId, action) {
    let form;
    try {
        form = await showAppModerationPrompt(action);
    } catch (error) {
        console.error('Error abriendo modal de moderación:', error);
        showToast('No se pudo abrir el formulario de moderación', 'error');
        return;
    }
    if (form == null) return;

    const reason = String(form.reason || '').trim();
    const durationMs = Math.max(0, Number.parseInt(form.durationMs, 10) || 0);
    if (!reason) {
        showToast('Debes indicar un motivo', 'warning');
        return;
    }

    try {
        const response = await fetchWithCredentials('/api/moderate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                guildId,
                userId,
                action,
                reason: String(form.reason).trim(),
                duration: durationMs
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            showToast(data.message, 'success');
            await loadServerMembers(guildId);
        } else {
            showToast(data.error || 'Error al ejecutar acción', 'error');
        }
    } catch (error) {
        console.error('Error moderando usuario:', error);
        showToast('Error al ejecutar acción', 'error');
    }
}

async function unbanUser(guildId, userId) {
    const reason = await showAppPrompt({
        title: 'Desbanear usuario',
        message: 'Indica el motivo del desbaneo.',
        inputLabel: 'Motivo',
        placeholder: 'Razón del desbaneo…',
        confirmLabel: 'Desbanear'
    });
    if (reason == null || !String(reason).trim()) return;

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/unban`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, reason: String(reason).trim() })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo desbanear al usuario', 'error');
            return;
        }
        showToast(data.message || 'Usuario desbaneado', 'success');
        await loadModerationBanHistory(guildId);
    } catch (error) {
        console.error('Error desbaneando usuario:', error);
        showToast('Error al desbanear usuario', 'error');
    }
}


// Funciones globales
window.toggleDashboardGuildFavorite = toggleDashboardGuildFavorite;
window.selectGuild = async function(guildId) {
    serverFeaturesUnlocked = true;
    currentServerGuildId = guildId;
    setServerFeaturesNavigationVisible(true);
    updateDashboardButtonState();

    showSection('serverSection', { skipServerDataLoad: true });
    await loadGuildsForServer();
    switchServerPane('serverPaneOverview');
    updateServerMenuIdentity();

    saveState();
};

window.removeField = removeField;
window.moderateUser = moderateUser;
window.unbanUser = unbanUser;

/** Modal del panel (sustituye alert / confirm / prompt nativos). */
let _appDialogResolver = null;
let _appDialogMode = 'confirm';
let _appDialogReturnObject = false;

function initAppDialog() {
    const modal = document.getElementById('appDialogModal');
    if (!modal || modal.dataset.bound === '1') return;
    modal.dataset.bound = '1';

    const finish = (value) => {
        if (!_appDialogResolver) return;
        const resolve = _appDialogResolver;
        _appDialogResolver = null;
        closeAppDialog();
        resolve(value);
    };

    modal.querySelectorAll('[data-app-dialog-close]').forEach((el) => {
        el.addEventListener('click', () => finish(_appDialogMode === 'prompt' ? null : false));
    });

    const confirmBtn = document.getElementById('appDialogConfirmBtn');
    const inputEl = document.getElementById('appDialogInput');
    const selectEl = document.getElementById('appDialogSelect');

    confirmBtn?.addEventListener('click', () => {
        if (_appDialogMode === 'prompt') {
            const value = String(inputEl?.value || '').trim();
            if (inputEl?.required && !value) {
                inputEl?.focus();
                inputEl?.classList.add('is-invalid');
                return;
            }
            if (_appDialogReturnObject) {
                finish({
                    reason: value,
                    durationMs: Number.parseInt(selectEl?.value || '0', 10) || 0
                });
            } else {
                finish(value);
            }
            return;
        }
        finish(true);
    });

    inputEl?.addEventListener('input', () => inputEl.classList.remove('is-invalid'));

    inputEl?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            confirmBtn?.click();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (!modal.classList.contains('is-open')) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            finish(_appDialogMode === 'prompt' ? null : false);
        }
    });
}

function closeAppDialog() {
    const modal = document.getElementById('appDialogModal');
    if (!modal) return;
    modal.classList.remove('is-open', 'is-danger', 'is-warning');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('app-dialog-open');
}

function openAppDialog(options = {}) {
    initAppDialog();
    const modal = document.getElementById('appDialogModal');
    if (!modal) return Promise.resolve(null);

    const titleEl = document.getElementById('appDialogTitle');
    const messageEl = document.getElementById('appDialogMessage');
    const inputWrap = document.getElementById('appDialogInputWrap');
    const inputLabel = document.getElementById('appDialogInputLabel');
    const inputEl = document.getElementById('appDialogInput');
    const selectWrap = document.getElementById('appDialogSelectWrap');
    const selectLabel = document.getElementById('appDialogSelectLabel');
    const selectEl = document.getElementById('appDialogSelect');
    const cancelBtn = document.getElementById('appDialogCancelBtn');
    const confirmBtn = document.getElementById('appDialogConfirmBtn');

    const mode = options.mode || (options.input ? 'prompt' : 'confirm');
    _appDialogMode = mode;
    _appDialogReturnObject = options.returnObject === true;

    const variant = options.variant || 'default';
    modal.classList.remove('is-danger', 'is-warning');
    if (variant === 'danger') modal.classList.add('is-danger');
    if (variant === 'warning') modal.classList.add('is-warning');

    if (titleEl) titleEl.textContent = String(options.title || (mode === 'prompt' ? 'Introduce un valor' : 'Confirmar'));
    if (messageEl) {
        const msg = String(options.message || '');
        messageEl.textContent = msg;
        messageEl.hidden = !msg;
    }

    const showCancel = options.showCancel !== false && mode !== 'alert';
    if (cancelBtn) {
        cancelBtn.hidden = !showCancel;
        cancelBtn.style.display = showCancel ? '' : 'none';
        cancelBtn.textContent = options.cancelLabel || 'Cancelar';
    }

    if (confirmBtn) {
        confirmBtn.textContent = options.confirmLabel || (mode === 'alert' ? 'Entendido' : 'Aceptar');
        confirmBtn.classList.toggle('btn-danger', variant === 'danger');
        confirmBtn.classList.toggle('btn-primary', variant !== 'danger');
    }

    const inputOpts = options.input && typeof options.input === 'object' ? options.input : null;
    const durationPresets = Array.isArray(options.durationPresets) ? options.durationPresets : null;

    if (selectWrap && selectEl) {
        const showSelect = Boolean(durationPresets?.length) && mode === 'prompt';
        selectWrap.hidden = !showSelect;
        if (showSelect) {
            const selectText = options.durationLabel || 'Duración';
            if (selectLabel) {
                selectLabel.textContent = selectText;
                selectLabel.hidden = !selectText;
            }
            const defaultMs = Number(options.defaultDurationMs) || 0;
            selectEl.replaceChildren();
            durationPresets.forEach((preset) => {
                const ms = Number(preset.ms) || 0;
                const option = document.createElement('option');
                option.value = String(ms);
                option.textContent = String(preset.label || ms);
                if (ms === defaultMs) option.selected = true;
                selectEl.appendChild(option);
            });
        }
    }

    if (inputWrap && inputEl) {
        const showInput = mode === 'prompt' || Boolean(inputOpts);
        inputWrap.hidden = !showInput;
        if (showInput) {
            const label = inputOpts?.label || options.inputLabel || '';
            if (inputLabel) {
                inputLabel.textContent = label;
                inputLabel.hidden = !label;
            }
            inputEl.placeholder = inputOpts?.placeholder || options.placeholder || '';
            inputEl.value = inputOpts?.value ?? options.defaultValue ?? '';
            inputEl.required = inputOpts?.required !== false;
            inputEl.maxLength = Math.max(1, Number.parseInt(inputOpts?.maxLength || options.maxLength || 500, 10) || 500);
            inputEl.classList.remove('is-invalid');
        }
    }

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('app-dialog-open');

    return new Promise((resolve) => {
        _appDialogResolver = resolve;
        requestAnimationFrame(() => {
            if (mode === 'prompt' || inputOpts) inputEl?.focus();
            else if (showCancel) cancelBtn?.focus();
            else confirmBtn?.focus();
        });
    });
}

function showAppConfirm(options = {}) {
    return openAppDialog({ ...options, mode: 'confirm', showCancel: options.showCancel !== false });
}

function showAppPrompt(options = {}) {
    return openAppDialog({
        ...options,
        mode: 'prompt',
        input: options.input || { required: options.required !== false, placeholder: options.placeholder, label: options.inputLabel }
    });
}

function showAppAlert(options = {}) {
    return openAppDialog({ ...options, mode: 'alert', showCancel: false }).then(() => undefined);
}

window.showAppConfirm = showAppConfirm;
window.showAppPrompt = showAppPrompt;
window.showAppAlert = showAppAlert;

// Toast mini: pill discreta, una linea
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
    };

    const validType = icons[type] ? type : 'success';
    const iconSvg = icons[validType];

    const legacyToast = container.querySelector('.toast.pro-toast:not(.pro-toast--mini)');
    if (legacyToast) legacyToast.remove();

    let toast = container.querySelector('.toast.pro-toast.pro-toast--mini');
    const isExisting = Boolean(toast);

    if (!toast) {
        toast = document.createElement('div');
        toast.className = `toast pro-toast pro-toast--mini ${validType}`;
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        toast.innerHTML = `
            <span class="pro-toast-icon" aria-hidden="true">${iconSvg}</span>
            <span class="pro-toast-message"></span>
        `;
        toast.addEventListener('click', () => {
            if (toast._hideTimer) clearTimeout(toast._hideTimer);
            dismissToast(toast);
        });
        container.appendChild(toast);
    }

    // Actualizar tipo y contenido
    toast.classList.remove('success', 'error', 'warning');
    toast.classList.add(validType);

    const iconEl = toast.querySelector('.pro-toast-icon');
    const messageEl = toast.querySelector('.pro-toast-message');

    if (iconEl) iconEl.innerHTML = iconSvg;
    if (messageEl) messageEl.textContent = String(message == null ? '' : message);

    // Reset animaciones para que se vuelvan a ejecutar al actualizar
    if (isExisting) {
        toast.classList.add('pro-toast-pulse');
        // forzar reflow para reiniciar la animacion
        // eslint-disable-next-line no-unused-expressions
        void toast.offsetWidth;
    } else {
        toast.classList.add('pro-toast-enter');
    }

    // Limpiar timers previos
    if (toast._hideTimer) clearTimeout(toast._hideTimer);
    if (toast._pulseTimer) clearTimeout(toast._pulseTimer);
    if (toast._removeTimer) clearTimeout(toast._removeTimer);

    // Quitar la clase de pulse despues de la animacion para permitir repetirla
    toast._pulseTimer = setTimeout(() => {
        toast.classList.remove('pro-toast-pulse', 'pro-toast-enter');
    }, 260);

    // Auto-ocultar
    toast._hideTimer = setTimeout(() => dismissToast(toast), 2600);
}

function dismissToast(toast) {
    if (!toast || toast._dismissing) return;
    toast._dismissing = true;
    toast.classList.add('pro-toast-leave');
    toast._removeTimer = setTimeout(() => {
        if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 320);
}

// Escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ================================================================
   GESTION DE TICKETS (pane serverPaneTicketsManage)
   ================================================================ */

const TICKETS_MANAGE_AUTO_REFRESH_MS = 20000;
const TM_HISTORY_FILTER_SCOPES = [
    { id: 'all', label: 'Todo' },
    { id: 'user', label: 'Usuario' },
    { id: 'staff', label: 'Staff' },
    { id: 'report', label: 'ID informe' },
    { id: 'channel', label: 'Canal' },
    { id: 'category', label: 'Categoría' },
    { id: 'reason', label: 'Motivo' }
];

let _ticketsManageState = {
    guildId: '',
    tab: 'pending', // 'pending' | 'active' | 'history'
    activityRange: '7d', // '7d' | 'all'
    historyFilter: '',
    historyScope: 'all',
    timer: null,
    lastData: null,
    loading: false
};

function openTicketsManagePane() {
    if (!hasPremiumAccess()) {
        enforceAllPremiumLocks();
        return;
    }

    if (!hasSelectedGuildContext()) {
        const container = document.getElementById('ticketManageContainer');
        if (container) {
            container.innerHTML = `
                <div class="tm-list-empty">
                    <div class="tm-list-empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    </div>
                    <strong>Selecciona un servidor</strong>
                    <p>Elige un servidor desde el Dashboard para gestionar sus tickets.</p>
                </div>`;
        }
        return;
    }

    _ticketsManageState.guildId = String(currentServerGuildId || '');
    wireTicketsManageControls();
    loadTicketsManage({ showLoader: true });
    // DESHABILITADO: No hacer auto-refresh
    // startTicketsManageAutoRefresh();
}

function wireTicketsManageControls() {
    const refreshBtn = document.getElementById('ticketManageRefreshBtn');
    if (refreshBtn && !refreshBtn._wired) {
        refreshBtn._wired = true;
        refreshBtn.addEventListener('click', () => {
            saveTicketsManageScrollPosition();
            loadTicketsManage({ showLoader: false, force: true });
        });
    }

    /* Menú ⋯ (config / categorías): una sola vez — si se registra en cada renderTicketsManage,
       varios listeners alternan display y el menú parece roto. */
    const settingsBtn = document.getElementById('ticketManageSettingsBtn');
    const settingsMenu = document.getElementById('ticketManageSettingsMenu');
    if (settingsBtn && settingsMenu && !settingsBtn.dataset.tmDropdownWired) {
        settingsBtn.dataset.tmDropdownWired = '1';
        settingsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const open = settingsMenu.style.display === 'block';
                const nextOpen = !open;
                settingsMenu.style.display = nextOpen ? 'block' : 'none';
                settingsBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
            });
            document.addEventListener('click', (e) => {
                if (settingsMenu.style.display !== 'block') return;
                if (settingsBtn.contains(e.target) || settingsMenu.contains(e.target)) return;
                settingsMenu.style.display = 'none';
                settingsBtn.setAttribute('aria-expanded', 'false');
            });
            settingsMenu.querySelectorAll('.tm-settings-menu-item').forEach((item) => {
                item.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const newTab = item.dataset.tmTab;
                    const guildId = _ticketsManageState.guildId || currentServerGuildId;
                    if (_ticketsManageState.tab === 'config' && newTab !== 'config' && hasTicketConfigChanges(guildId)) {
                        const discard = await showAppConfirm({
                            title: 'Cambios sin guardar',
                            message: 'Hay cambios no guardados en la configuración. ¿Descartar cambios?',
                            confirmLabel: 'Descartar',
                            variant: 'warning'
                        });
                        if (!discard) return;
                        clearDraftTicketConfig(guildId);
                    }
                    _ticketsManageState.tab = newTab;
                    settingsMenu.style.display = 'none';
                    settingsBtn.setAttribute('aria-expanded', 'false');
                    saveTicketsManageScrollPosition();
                    if (_ticketsManageState.lastData) {
                        renderTicketsManage(_ticketsManageState.lastData);
                    } else {
                        loadTicketsManage({ showLoader: true, force: true });
                    }
                });
            });
    }

    // DESHABILITADO: Auto-refresh completamente desactivado
    // const autoCheckbox = document.getElementById('ticketManageAutoRefresh');
    // if (autoCheckbox && !autoCheckbox._wired) {
    //     autoCheckbox._wired = true;
    //     autoCheckbox.addEventListener('change', () => {
    //         if (autoCheckbox.checked) startTicketsManageAutoRefresh();
    //         else stopTicketsManageAutoRefresh();
    //     });
    // }
}

function startTicketsManageAutoRefresh() {
    // DESHABILITADO: Auto-refresh completamente desactivado
    return;
    /*
    stopTicketsManageAutoRefresh();
    const autoCheckbox = document.getElementById('ticketManageAutoRefresh');
    if (autoCheckbox && !autoCheckbox.checked) return;

    _ticketsManageState.timer = setInterval(() => {
        const pane = document.getElementById('serverPaneTicketsManage');
        if (!pane || !pane.classList.contains('active')) {
            stopTicketsManageAutoRefresh();
            return;
        }
        loadTicketsManage({ showLoader: false });
    }, TICKETS_MANAGE_AUTO_REFRESH_MS);
    */
}

function stopTicketsManageAutoRefresh() {
    if (_ticketsManageState.timer) {
        clearInterval(_ticketsManageState.timer);
        _ticketsManageState.timer = null;
    }
}

async function loadTicketsManage({ showLoader = false, force = false } = {}) {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    if (!guildId) return;

    const container = document.getElementById('ticketManageContainer');
    if (!container) return;

    if (_ticketsManageState.loading && !force) return;
    _ticketsManageState.loading = true;

    if (showLoader) {
        container.innerHTML = `
            <div class="ticket-manage-loading">
                <div class="loading-spinner"></div>
                <p>Cargando datos de tickets...</p>
            </div>`;
    }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/tickets/overview`);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            if (response.status === 402 || err?.code === 'premium_required') {
                enforceAllPremiumLocks();
                return;
            }
            container.innerHTML = `
                <div class="tm-list-empty">
                    <div class="tm-list-empty-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    </div>
                    <strong>No pudimos cargar los tickets</strong>
                    <p>${escapeHtml(err.error || `Codigo ${response.status}`)}</p>
                </div>`;
            return;
        }

        const data = await response.json();
        _ticketsManageState.lastData = data;
        renderTicketsManage(data);
    } catch (error) {
        console.error('Error cargando gestion de tickets:', error);
        container.innerHTML = `
            <div class="tm-list-empty">
                <div class="tm-list-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                </div>
                <strong>Error de red</strong>
                <p>No pudimos contactar el servidor.</p>
            </div>`;
    } finally {
        _ticketsManageState.loading = false;
    }
}

function renderTicketsManage(data) {
    const container = document.getElementById('ticketManageContainer');
    if (!container) return;

    const stats = data?.stats || { active: 0, pending: 0, closed: 0, total: 0, claimed: 0, unclaimed: 0, last7Days: [], activityByMonth: [] };
    const activeCount = Number(stats.active || 0);
    const pendingCount = Number(stats.pending || 0);
    const closedCount = Number(stats.closed || 0);
    const totalCount = Number(stats.total || (activeCount + pendingCount + closedCount));

    const tab = _ticketsManageState.tab;
    const histLoaded = Array.isArray(data?.history) ? data.history.length : 0;
    const histOverflowNote =
        tab === 'history' && closedCount > histLoaded
            ? histLoaded > 0
                ? `<p class="tm-history-toolbar-note">Total guardados: <strong>${closedCount}</strong>. Mostrando los <strong>${histLoaded}</strong> más recientes.</p>`
                : `<p class="tm-history-toolbar-note tm-history-toolbar-note--warn">Hay <strong>${closedCount}</strong> informes en la base pero la lista llegó vacía. Reinicia el bot y pulsa Actualizar; si sigue igual, revisa los logs del servidor.</p>`
            : '';

    container.innerHTML = `
        <div class="tm-stats-grid">
            ${renderTmStatCard('total', 'Total', totalCount, 'Todos los tickets registrados', tmIconStack())}
            ${renderTmStatCard('active', 'Activos', activeCount, activeCount === 1 ? 'Canal abierto ahora' : 'Canales abiertos ahora', tmIconActivity())}
            ${renderTmStatCard('pending', 'Pendientes', pendingCount, pendingCount === 1 ? 'Solicitud por aceptar' : 'Solicitudes por aceptar', tmIconHourglass())}
            ${renderTmStatCard('closed', 'Cerrados', closedCount, 'En historial de informes', tmIconCheck())}
            ${renderTmStatCard('claimed', 'Reclamados', stats.claimed || 0, 'Con staff asignado', tmIconShield())}
            ${renderTmStatCard('unclaimed', 'Sin asignar', stats.unclaimed || 0, 'Requieren atencion', tmIconBell())}
        </div>

        ${renderTmTrendCard(stats.last7Days || [], stats.activityByMonth || [])}

        <div class="tm-tabs" role="tablist">
            <button type="button" class="tm-tab-btn ${tab === 'pending' ? 'active' : ''}" data-tm-tab="pending">
                <span>Pendientes</span>
                <span class="tm-tab-count">${pendingCount}</span>
            </button>
            <button type="button" class="tm-tab-btn tm-tab-btn--live ${tab === 'active' ? 'active' : ''}" data-tm-tab="active">
                <span>Activos</span>
                <span class="tm-tab-count">${activeCount}</span>
            </button>
            <button type="button" class="tm-tab-btn ${tab === 'history' ? 'active' : ''}" data-tm-tab="history">
                <span>Historial</span>
                <span class="tm-tab-count">${closedCount}</span>
            </button>
        </div>

        <div id="tmHistoryToolbar" class="tm-history-toolbar ${tab === 'history' ? '' : 'is-hidden'}">
            ${histOverflowNote}
            <div class="tm-history-toolbar-scopes" role="group" aria-label="Ámbito de búsqueda">
                ${TM_HISTORY_FILTER_SCOPES.map((scope) => `
                    <button type="button" class="tm-history-scope-btn ${(_ticketsManageState.historyScope || 'all') === scope.id ? 'active' : ''}" data-tm-history-scope="${scope.id}" aria-label="${escapeHtml(scope.label)}" title="${escapeHtml(scope.label)}">
                        <span class="tm-history-scope-icon" aria-hidden="true">${tmHistoryScopeIcon(scope.id)}</span>
                    </button>
                `).join('')}
            </div>
            <div class="tm-history-toolbar-actions">
                <label class="tm-history-search-field" for="tmHistorySearch">
                    <span class="tm-history-search-icon" aria-hidden="true">${tmIconSearch()}</span>
                    <input type="search" id="tmHistorySearch" class="tm-history-search" placeholder="Buscar en el historial…" autocomplete="off" value="${escapeHtml(_ticketsManageState.historyFilter || '')}" />
                </label>
                <button type="button" class="tm-btn tm-btn-primary tm-history-apply" id="tmHistoryApplyFilter" aria-label="Buscar" title="Buscar">
                    <span class="tm-history-action-icon" aria-hidden="true">${tmIconSearch()}</span>
                </button>
                <button type="button" class="tm-btn tm-btn-ghost tm-history-reset" id="tmHistoryResetFilter" aria-label="Limpiar filtros" title="Limpiar filtros">
                    <span class="tm-history-action-icon" aria-hidden="true">${tmIconReset()}</span>
                </button>
            </div>
        </div>

        <div id="tmListContainer" class="tm-list-container"></div>
    `;

    container.querySelectorAll('.tm-tab-btn').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const newTab = btn.dataset.tmTab;
            const guildId = _ticketsManageState.guildId || currentServerGuildId;
            // Si estamos en config y hay cambios no guardados, preguntar antes de salir
            if (_ticketsManageState.tab === 'config' && newTab !== 'config' && hasTicketConfigChanges(guildId)) {
                const discard = await showAppConfirm({
                    title: 'Cambios sin guardar',
                    message: 'Hay cambios no guardados en la configuración. ¿Descartar cambios?',
                    confirmLabel: 'Descartar',
                    variant: 'warning'
                });
                if (!discard) return;
                clearDraftTicketConfig(guildId);
            }
            _ticketsManageState.tab = newTab;
            saveTicketsManageScrollPosition();
            renderTicketsManage(_ticketsManageState.lastData);
        });
    });

    container.querySelectorAll('[data-tm-activity-range]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const v = btn.getAttribute('data-tm-activity-range');
            if (v !== '7d' && v !== 'all') return;
            _ticketsManageState.activityRange = v;
            saveTicketsManageScrollPosition();
            renderTicketsManage(_ticketsManageState.lastData);
        });
    });

    const tmHistorySearch = container.querySelector('#tmHistorySearch');
    const tmHistoryApply = container.querySelector('#tmHistoryApplyFilter');
    const tmHistoryReset = container.querySelector('#tmHistoryResetFilter');
    const applyTmHistoryFilter = () => {
        if (!tmHistorySearch) return;
        _ticketsManageState.historyFilter = tmHistorySearch.value || '';
        if (_ticketsManageState.tab === 'history') refreshTmHistoryListFromState();
    };
    if (tmHistorySearch && tmHistoryApply) {
        tmHistoryApply.addEventListener('click', applyTmHistoryFilter);
        tmHistorySearch.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                applyTmHistoryFilter();
            }
        });
    }
    if (tmHistoryReset) {
        tmHistoryReset.addEventListener('click', () => {
            _ticketsManageState.historyFilter = '';
            _ticketsManageState.historyScope = 'all';
            if (tmHistorySearch) tmHistorySearch.value = '';
            if (_ticketsManageState.tab === 'history') {
                saveTicketsManageScrollPosition();
                renderTicketsManage(_ticketsManageState.lastData);
            }
        });
    }
    container.querySelectorAll('[data-tm-history-scope]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const scope = btn.getAttribute('data-tm-history-scope');
            if (!scope || !TM_HISTORY_FILTER_SCOPES.some((entry) => entry.id === scope)) return;
            _ticketsManageState.historyScope = scope;
            saveTicketsManageScrollPosition();
            renderTicketsManage(_ticketsManageState.lastData);
            if (String(_ticketsManageState.historyFilter || '').trim() && _ticketsManageState.tab === 'history') {
                refreshTmHistoryListFromState();
            }
        });
    });

    // Restaurar scroll position
    restoreTicketsManageScrollPosition();

    if (tab === 'config') {
        loadTicketManageConfig();
    } else if (tab === 'categories') {
        loadTicketManageCategories();
    } else {
        renderTmList(data, tab);
    }
}

// ===== Ticket Manage: Configuración =====
function saveDraftTicketConfig(guildId) {
    const draft = {
        enabled: document.getElementById('tm_ticketEnabled')?.checked,
        panelChannelId: document.getElementById('tm_ticketChannelSelect')?.value || '',
        requestChannelId: document.getElementById('tm_ticketRequestChannelSelect')?.value || '',
        receiptHistoryChannelId: document.getElementById('tm_ticketReceiptChannelSelect')?.value || '',
        sendDmReceipt: document.getElementById('tm_ticketSendDmReceipt')?.checked === true,
        sendDmPendingStatus: document.getElementById('tm_ticketSendDmPendingStatus')?.checked === true,
        title: document.getElementById('tm_ticketTitle')?.value || '',
        message: document.getElementById('tm_ticketMessage')?.value || '',
        footer: document.getElementById('tm_ticketFooter')?.value || '',
        buttonLabel: document.getElementById('tm_ticketButtonLabel')?.value || '',
        adminRoleIds: Array.from(document.getElementById('tm_ticketAdminRoles')?.selectedOptions||[]).map(o=>o.value),
        ticketCategories: getOptionsFromTmEditor('tm_ticketCategoriesEditor'),
        commonProblems: getOptionsFromTmEditor('tm_ticketCommonProblemsEditor'),
        minecraftServers: getOptionsFromTmEditor('tm_ticketMinecraftServersEditor'),
        timestamp: Date.now()
    };
    localStorage.setItem(`ticketConfigDraft_${guildId}`, JSON.stringify(draft));
}

function loadDraftTicketConfig(guildId) {
    try {
        const draft = localStorage.getItem(`ticketConfigDraft_${guildId}`);
        return draft ? JSON.parse(draft) : null;
    } catch (e) { return null; }
}

function clearDraftTicketConfig(guildId) {
    localStorage.removeItem(`ticketConfigDraft_${guildId}`);
}

function hasTicketConfigChanges(guildId) {
    const draft = loadDraftTicketConfig(guildId);
    if (!draft) return false;
    const hasContent = ['title', 'description', 'message', 'footer', 'buttonLabel']
        .some((key) => String(draft?.[key] || '').trim().length > 0);
    const hasArrays = ['adminRoleIds', 'ticketCategories', 'commonProblems', 'minecraftServers']
        .some((key) => Array.isArray(draft?.[key]) && draft[key].length > 0);
    return hasContent || hasArrays;
}

// Persistencia de scroll position para gestión de tickets
function saveTicketsManageScrollPosition() {
    const container = document.getElementById('ticketManageContainer');
    if (container) {
        const scrollPos = container.scrollTop || 0;
        const guildId = _ticketsManageState.guildId || currentServerGuildId;
        sessionStorage.setItem(`ticketsManageScroll_${guildId}`, JSON.stringify({ scrollPos, tab: _ticketsManageState.tab }));
    }
}

function restoreTicketsManageScrollPosition() {
    const container = document.getElementById('ticketManageContainer');
    if (container) {
        const guildId = _ticketsManageState.guildId || currentServerGuildId;
        const stored = sessionStorage.getItem(`ticketsManageScroll_${guildId}`);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                if (data.tab === _ticketsManageState.tab) {
                    setTimeout(() => {
                        container.scrollTop = data.scrollPos || 0;
                    }, 50);
                }
            } catch (e) {
                console.warn('Error restaurando scroll position:', e);
            }
        }
    }
}

async function loadTicketManageConfig() {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    const container = document.getElementById('tmListContainer');
    if (!container) return;
    container.innerHTML = `<div class="ticket-manage-loading"><div class="loading-spinner"></div><p>Cargando configuración de tickets...</p></div>`;
    try {
        const [cfgResp, channelsResp, infoResp] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/ticket-config`),
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/info`)
        ]);
        if (!cfgResp.ok) {
            const err = await cfgResp.json().catch(() => ({}));
            container.innerHTML = `<div class="tm-list-empty"><strong>Error</strong><p>${escapeHtml(err.error || 'No se pudo cargar la configuración')}</p></div>`;
            return;
        }
        const cfg = await cfgResp.json();
        const channels = await channelsResp.json().catch(() => []);
        const info = await infoResp.json().catch(() => ({}));
        window._lastGuildChannels = Array.isArray(channels) ? channels : [];
        window._lastGuildRoles = Array.isArray(info.roles) ? info.roles : (info && Array.isArray(info.guild?.roles) ? info.guild.roles : []);
        renderTicketManageConfig(cfg, guildId);
    } catch (e) {
        console.error('Error cargando config tickets en manage pane:', e);
        container.innerHTML = `<div class="tm-list-empty"><strong>Error de red</strong><p>No se pudo cargar la configuración.</p></div>`;
    }
}

function renderTicketManageConfig(cfg, guildId) {
    const container = document.getElementById('tmListContainer');
    if (!container) return;

    const channels = Array.isArray(window._lastGuildChannels) ? window._lastGuildChannels : [];
    const roles = Array.isArray(window._lastGuildRoles) ? window._lastGuildRoles : [];

    const sendDmDefault = cfg.sendDmReceipt !== false;
    const sendDmPendingDefault = cfg.sendDmPendingStatus === true;

    container.innerHTML = `
        <div class="dpx-section">
            <h4>Configuración de tickets</h4>
            <input type="hidden" id="tm_ticketMessageId" value="${escapeHtmlForValue(cfg.messageId || '')}">
            <input type="hidden" id="tm_ticketColor" value="#${escapeHtmlForValue(String(cfg.color || '7c4dff').replace(/#/g, ''))}">
            <div class="dpx-field-grid tm-ticket-cfg-grid">
                <div class="tm-switch-strip">
                    <div class="tm-switch-field tm-switch-field--compact tm-switch-field--hero">
                        <div class="tm-switch-copy">
                            <span class="tm-switch-title">Sistema activo</span>
                            <span class="tm-switch-desc">Pausa sin borrar la config.</span>
                        </div>
                        <label class="tm-switch tm-switch--accent tm-switch--xs" title="Activar o pausar tickets">
                            <input type="checkbox" id="tm_ticketEnabled" ${cfg.enabled ? 'checked' : ''}>
                            <span class="tm-switch-slider"></span>
                        </label>
                    </div>
                    <div class="tm-switch-field tm-switch-field--compact">
                        <div class="tm-switch-copy">
                            <span class="tm-switch-title">MD al cerrar</span>
                            <span class="tm-switch-desc">Transcripción al usuario.</span>
                        </div>
                        <label class="tm-switch tm-switch--mint tm-switch--xs" title="MD comprobante al cerrar">
                            <input type="checkbox" id="tm_ticketSendDmReceipt" ${sendDmDefault ? 'checked' : ''}>
                            <span class="tm-switch-slider"></span>
                        </label>
                    </div>
                    <div class="tm-switch-field tm-switch-field--compact">
                        <div class="tm-switch-copy">
                            <span class="tm-switch-title">MD solicitud</span>
                            <span class="tm-switch-desc">Aviso al crear pendiente.</span>
                        </div>
                        <label class="tm-switch tm-switch--sky tm-switch--xs" title="MD estado solicitud pendiente">
                            <input type="checkbox" id="tm_ticketSendDmPendingStatus" ${sendDmPendingDefault ? 'checked' : ''}>
                            <span class="tm-switch-slider"></span>
                        </label>
                    </div>
                </div>
                <div class="dpx-field">
                    <label for="tm_ticketChannelSelect">Canal del panel</label>
                    <select id="tm_ticketChannelSelect" class="form-control">
                        <option value="">Selecciona un canal</option>
                        ${(channels || []).map((c) => `<option value="${c.id}" ${String(cfg.panelChannelId || '') === String(c.id) ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="dpx-field">
                    <label for="tm_ticketRequestChannelSelect">Canal de peticiones</label>
                    <select id="tm_ticketRequestChannelSelect" class="form-control">
                        <option value="">Usar el mismo canal</option>
                        ${(channels || []).map((c) => `<option value="${c.id}" ${String(cfg.requestChannelId || '') === String(c.id) ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="dpx-field is-full">
                    <label for="tm_ticketReceiptChannelSelect">Historial comprobantes <span class="tm-field-hint-inline">al cerrar, solo staff</span></label>
                    <select id="tm_ticketReceiptChannelSelect" class="form-control">
                        <option value="">Sin canal dedicado</option>
                        ${(channels || []).filter((c) => c.type === 0).map((c) => `<option value="${c.id}" ${String(cfg.receiptHistoryChannelId || '') === String(c.id) ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                    </select>
                </div>
                <div class="dpx-field is-full">
                    <label>Título</label>
                    <input id="tm_ticketTitle" class="form-control" value="${escapeHtmlForValue(cfg.title || 'Soporte')}">
                </div>
                <div class="dpx-field is-full">
                    <label>Descripción</label>
                    <textarea id="tm_ticketMessage" class="form-control" rows="2" placeholder="Explicación...">${escapeHtmlForValue(cfg.message || '')}</textarea>
                </div>
                <div class="dpx-field">
                    <label>Texto del botón</label>
                    <input id="tm_ticketButtonLabel" class="form-control" placeholder="Ej: Crear ticket" value="${escapeHtmlForValue(cfg.buttonLabel || 'Solicitar ticket')}">
                </div>
                <div class="dpx-field">
                    <label>Footer</label>
                    <input id="tm_ticketFooter" class="form-control" placeholder="Ej: © 2024" value="${escapeHtmlForValue(cfg.footer || '')}">
                </div>
                <div class="dpx-field is-full">
                    <label>Roles gestores</label>
                    <p style="font-size: 0.8rem; color: rgba(255,255,255,0.6); margin: 0.25rem 0 0.5rem 0;">Ctrl+Click para múltiples</p>
                    <select id="tm_ticketAdminRoles" class="form-control tm-multi-select-compact" multiple size="3">
                        ${(roles || []).map((r) => `<option value="${r.id}" ${Array.isArray(cfg.adminRoleIds) && cfg.adminRoleIds.map(String).includes(String(r.id)) ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div style="margin-top:1.5rem;display:flex;gap:0.6rem;">
                <button class="btn btn-secondary" id="tm_saveTicketBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; margin-right: 0.4rem; vertical-align: -3px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    Guardar
                </button>
                <button class="btn btn-primary" id="tm_publishTicketBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; margin-right: 0.4rem; vertical-align: -3px;"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
                    Publicar
                </button>
            </div>
        </div>
    `;

    document.getElementById('tm_saveTicketBtn')?.addEventListener('click', () => saveTicketsManageConfig(guildId));
    document.getElementById('tm_publishTicketBtn')?.addEventListener('click', async () => {
        const saved = await saveTicketsManageConfig(guildId, false);
        if (!saved) return;
        try {
            const resp = await fetchWithCredentials(`/api/guild/${guildId}/ticket-publish`, { method: 'POST' });
            const data = await resp.json().catch(()=>({}));
            if (!resp.ok) { showToast(data.error || 'Error publicando panel', 'error'); return; }
            showToast('Panel de tickets publicado', 'success');
            clearDraftTicketConfig(guildId);
            loadTicketsManage({ showLoader: false, force: true });
        } catch (e) { showToast('Error publicando panel', 'error'); }
    });

    // Auto-save draft cuando el usuario edita
    const formInputs = container.querySelectorAll('input, textarea, select');
    formInputs.forEach(input => {
        input.addEventListener('change', () => saveDraftTicketConfig(guildId));
        input.addEventListener('input', () => saveDraftTicketConfig(guildId));
    });

    // Restaurar draft si existe
    const draft = loadDraftTicketConfig(guildId);
    if (draft) {
        setTimeout(() => {
            if (document.getElementById('tm_ticketEnabled')) {
                document.getElementById('tm_ticketEnabled').checked = draft.enabled;
                document.getElementById('tm_ticketChannelSelect').value = draft.panelChannelId;
                document.getElementById('tm_ticketRequestChannelSelect').value = draft.requestChannelId;
                const rc = document.getElementById('tm_ticketReceiptChannelSelect');
                if (rc) rc.value = draft.receiptHistoryChannelId || '';
                const dmR = document.getElementById('tm_ticketSendDmReceipt');
                if (dmR) dmR.checked = draft.sendDmReceipt !== false;
                const dmP = document.getElementById('tm_ticketSendDmPendingStatus');
                if (dmP) dmP.checked = draft.sendDmPendingStatus === true;
                document.getElementById('tm_ticketTitle').value = draft.title;
                document.getElementById('tm_ticketMessage').value = draft.message;
                document.getElementById('tm_ticketFooter').value = draft.footer;
                document.getElementById('tm_ticketButtonLabel').value = draft.buttonLabel;
                const roleSelect = document.getElementById('tm_ticketAdminRoles');
                Array.from(roleSelect.options).forEach(opt => {
                    opt.selected = draft.adminRoleIds.includes(opt.value);
                });
                showToast('Configuración recuperada de borrador anterior', 'info');
            }
        }, 100);
    }
}

async function loadTicketManageCategories() {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    const container = document.getElementById('tmListContainer');
    if (!container) return;
    container.innerHTML = `<div class="ticket-manage-loading"><div class="loading-spinner"></div><p>Cargando categorías...</p></div>`;
    try {
        const cfgResp = await fetchWithCredentials(`/api/guild/${guildId}/ticket-config`);
        if (!cfgResp.ok) {
            const err = await cfgResp.json().catch(() => ({}));
            container.innerHTML = `<div class="tm-list-empty"><strong>Error</strong><p>${escapeHtml(err.error || 'No se pudo cargar las categorías')}</p></div>`;
            return;
        }
        const cfg = await cfgResp.json();
        renderTicketManageCategories(cfg, guildId);
    } catch (e) {
        console.error('Error cargando categorías tickets:', e);
        container.innerHTML = `<div class="tm-list-empty"><strong>Error de red</strong><p>No se pudo cargar las categorías.</p></div>`;
    }
}

function renderTicketManageCategories(cfg, guildId) {
    const container = document.getElementById('tmListContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="dpx-section">
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2rem; margin-top: 1rem;">
                <!-- Categorías de tickets -->
                <div style="padding: 1rem; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <h5 style="margin-top: 0; display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m0 0H3m2 0v4m0 0H5m-2 0a2 2 0 0 0 2 2h4m0 0v4m0 0h4m0 0a2 2 0 0 0 2-2v-4m0 0h2m-2 0v-4m0 0h2m0 0a2 2 0 0 0-2-2h-4"/></svg>
                        Tipos de tickets
                    </h5>
                    <p style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin: 0 0 0.8rem 0;">Categorías que verá el usuario</p>
                    <div id="tm_ticketCategoriesEditor" class="options-editor"></div>
                </div>

                <!-- Problemas comunes -->
                <div style="padding: 1rem; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <h5 style="margin-top: 0; display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                        Problemas comunes
                    </h5>
                    <p style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin: 0 0 0.8rem 0;">FAQ rápidas</p>
                    <div id="tm_ticketCommonProblemsEditor" class="options-editor"></div>
                </div>

                <!-- Servidores -->
                <div style="padding: 1rem; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                    <h5 style="margin-top: 0; display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                        Servidores
                    </h5>
                    <p style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin: 0 0 0.8rem 0;">Survival, Creative, PvP...</p>
                    <div id="tm_ticketMinecraftServersEditor" class="options-editor"></div>
                </div>
            </div>

            <div style="margin-top:1.5rem;display:flex;gap:0.6rem;">
                <button class="btn btn-secondary" id="tm_saveTicketCatBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline; margin-right: 0.4rem; vertical-align: -3px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    Guardar
                </button>
            </div>
        </div>
    `;

    // Render option editors
    function renderTmOptionsEditor(editorId, items) {
        const container = document.getElementById(editorId);
        if (!container) return;
        container.innerHTML = '';
        
        const list = document.createElement('div');
        list.className = 'options-list';
        
        (Array.isArray(items) ? items : []).forEach((it) => {
            const row = document.createElement('div');
            row.className = 'option-row';
            row.innerHTML = `
                <div class="option-fields">
                    <input type="text" class="form-control option-label" placeholder="Nombre/Título" value="${escapeHtmlForValue(it.label || '')}" style="font-weight: 500;">
                    <input type="text" class="form-control option-desc" placeholder="Descripción" value="${escapeHtmlForValue(it.description || '')}" style="font-size: 0.9rem; opacity: 0.8;">
                </div>
                <div class="option-actions">
                    <button type="button" class="btn btn-sm option-move-up" title="Subir"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg></button>
                    <button type="button" class="btn btn-sm option-move-down" title="Bajar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
                    <button type="button" class="btn btn-sm btn-danger option-remove" title="Eliminar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg></button>
                </div>
            `;
            list.appendChild(row);
        });
        
        const footer = document.createElement('div');
        footer.className = 'options-editor-footer';
        footer.innerHTML = `<button type="button" class="btn btn-primary option-add"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 0.3rem; display: inline;"><path d="M12 5v14M5 12h14"></path></svg>Agregar</button>`;
        
        container.appendChild(list);
        container.appendChild(footer);
        
        footer.querySelector('.option-add')?.addEventListener('click', () => {
            const row = document.createElement('div');
            row.className = 'option-row';
            row.innerHTML = `
                <div class="option-fields">
                    <input type="text" class="form-control option-label" placeholder="Nombre/Título" style="font-weight: 500;">
                    <input type="text" class="form-control option-desc" placeholder="Descripción" style="font-size: 0.9rem; opacity: 0.8;">
                </div>
                <div class="option-actions">
                    <button type="button" class="btn btn-sm option-move-up" title="Subir"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg></button>
                    <button type="button" class="btn btn-sm option-move-down" title="Bajar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg></button>
                    <button type="button" class="btn btn-sm btn-danger option-remove" title="Eliminar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg></button>
                </div>
            `;
            list.appendChild(row);
            row.querySelector('.option-label').focus();
        });
        
        list.addEventListener('click', (ev) => {
            const t = ev.target;
            const row = t.closest('.option-row');
            if (!row) return;
            
            if (t.classList.contains('option-remove')) {
                row.remove();
                return;
            }
            
            if (t.classList.contains('option-move-up')) {
                const prev = row.previousElementSibling;
                if (prev) row.parentNode.insertBefore(row, prev);
                return;
            }
            
            if (t.classList.contains('option-move-down')) {
                const next = row.nextElementSibling;
                if (next) row.parentNode.insertBefore(next, row);
                return;
            }
        });
    }
    
    renderTmOptionsEditor('tm_ticketCategoriesEditor', cfg.ticketCategories || []);
    renderTmOptionsEditor('tm_ticketCommonProblemsEditor', cfg.commonProblems || []);
    renderTmOptionsEditor('tm_ticketMinecraftServersEditor', cfg.minecraftServers || []);

    document.getElementById('tm_saveTicketCatBtn')?.addEventListener('click', () => saveTicketsManageConfig(guildId));
    
    const formInputs = container.querySelectorAll('input, textarea, select');
    formInputs.forEach(input => {
        input.addEventListener('change', () => saveDraftTicketConfig(guildId));
        input.addEventListener('input', () => saveDraftTicketConfig(guildId));
    });
}

function getOptionsFromTmEditor(editorId) {
    const container = document.getElementById(editorId);
    if (!container) return [];
    const rows = Array.from(container.querySelectorAll('.option-row'));
    return rows.map((row) => ({ label: (row.querySelector('.option-label')?.value||'').toString().trim().slice(0,100), description: (row.querySelector('.option-desc')?.value||'').toString().trim().slice(0,200) })).filter(o=>o.label);
}

async function saveTicketsManageConfig(guildId, showSuccessToast = true) {
    const adminRoleSelect = document.getElementById('tm_ticketAdminRoles');
    const adminRoleIds = adminRoleSelect ? Array.from(adminRoleSelect.selectedOptions||[]).map(o=>o.value).filter(Boolean) : [];
    const payload = {
        enabled: document.getElementById('tm_ticketEnabled')?.checked === true,
        panelChannelId: document.getElementById('tm_ticketChannelSelect')?.value || '',
        requestChannelId: document.getElementById('tm_ticketRequestChannelSelect')?.value || '',
        receiptHistoryChannelId: document.getElementById('tm_ticketReceiptChannelSelect')?.value || '',
        sendDmReceipt: document.getElementById('tm_ticketSendDmReceipt')?.checked === true,
        sendDmPendingStatus: document.getElementById('tm_ticketSendDmPendingStatus')?.checked === true,
        adminRoleIds,
        title: document.getElementById('tm_ticketTitle')?.value || 'Soporte',
        message: document.getElementById('tm_ticketMessage')?.value || '',
        color: (document.getElementById('tm_ticketColor')?.value || '').replace('#','') || '7c4dff',
        footer: document.getElementById('tm_ticketFooter')?.value || '',
        buttonLabel: document.getElementById('tm_ticketButtonLabel')?.value || 'Solicitar ticket',
        ticketCategories: getOptionsFromTmEditor('tm_ticketCategoriesEditor'),
        commonProblems: getOptionsFromTmEditor('tm_ticketCommonProblemsEditor'),
        minecraftServers: getOptionsFromTmEditor('tm_ticketMinecraftServersEditor'),
        caseRoleMap: {},
        messageId: document.getElementById('tm_ticketMessageId')?.value || ''
    };
    try {
        const resp = await fetchWithCredentials(`/api/guild/${guildId}/ticket-config`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const data = await resp.json().catch(()=>({}));
        if (!resp.ok) { showToast(data.error || 'No se pudo guardar la configuración', 'error'); return false; }
        if (showSuccessToast) showToast('Configuración de tickets guardada', 'success');
        clearDraftTicketConfig(guildId);
        return true;
    } catch (e) { console.error('Error guardando config tickets:', e); showToast('Error guardando configuración', 'error'); return false; }
}

function renderTmStatCard(type, label, value, sub, iconSvg) {
    return `
        <div class="tm-stat-card is-${type}">
            <div class="tm-stat-head">
                <span class="tm-stat-icon">${iconSvg}</span>
                <span class="tm-stat-label">${escapeHtml(label)}</span>
            </div>
            <div class="tm-stat-value">${Number(value || 0).toLocaleString()}</div>
            <div class="tm-stat-sub">${escapeHtml(sub || '')}</div>
        </div>`;
}

function renderTmTrendCard(last7, byMonth) {
    const mode = _ticketsManageState.activityRange || '7d';
    const isMonth = mode === 'all';
    const arr = isMonth ? (Array.isArray(byMonth) ? byMonth : []) : (Array.isArray(last7) ? last7 : []);
    const title = isMonth
        ? 'Actividad desde la creación del servidor'
        : 'Actividad de los últimos 7 días';
    const maxVal = Math.max(1, ...arr.map((d) => Math.max(d.opened || 0, d.closed || 0)));
    const dayNames = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

    const bars = arr.map((d) => {
        const openH = Math.max(2, Math.round(((d.opened || 0) / maxVal) * 100));
        const closedH = Math.max(2, Math.round(((d.closed || 0) / maxVal) * 100));
        let label = '';
        let tip = '';
        if (isMonth) {
            const mk = d.month || '';
            const dt = mk ? new Date(`${mk}-01T12:00:00.000Z`) : null;
            label = dt && !Number.isNaN(dt.getTime())
                ? dt.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }).replace(/\./g, '')
                : '';
            tip = `${mk || ''} · Abiertos: ${d.opened || 0} · Cerrados: ${d.closed || 0}`;
        } else {
            const dt = d.date ? new Date(`${d.date}T12:00:00.000Z`) : null;
            label = dt && !Number.isNaN(dt.getTime()) ? dayNames[dt.getUTCDay()] : '';
            tip = `${d.date || ''} · Abiertos: ${d.opened || 0} · Cerrados: ${d.closed || 0}`;
        }
        return `
            <div class="tm-trend-day" title="${escapeHtml(tip)}">
                <div class="tm-trend-day-bars">
                    <div class="tm-trend-bar bar-open" style="height: ${openH}%"></div>
                    <div class="tm-trend-bar bar-closed" style="height: ${closedH}%"></div>
                </div>
                <div class="tm-trend-day-label">${escapeHtml(label)}</div>
            </div>`;
    }).join('');

    const barsWrapClass = isMonth ? 'tm-trend-bars tm-trend-bars--months' : 'tm-trend-bars';
    const emptyMsg = isMonth
        ? 'Sin datos en este periodo'
        : 'Sin datos recientes';

    return `
        <div class="tm-trend-card">
            <div class="tm-trend-head">
                <div class="tm-trend-head-left">
                    <h4>${escapeHtml(title)}</h4>
                    <div class="tm-trend-range" role="group" aria-label="Rango de actividad">
                        <button type="button" class="tm-trend-range-btn ${mode === '7d' ? 'active' : ''}" data-tm-activity-range="7d">Últimos 7 días</button>
                        <button type="button" class="tm-trend-range-btn ${mode === 'all' ? 'active' : ''}" data-tm-activity-range="all">Desde creación</button>
                    </div>
                </div>
                <div class="tm-trend-legend">
                    <span class="lg-open">Abiertos</span>
                    <span class="lg-closed">Cerrados</span>
                </div>
            </div>
            <div class="${barsWrapClass}">${bars || `<div class="tm-trend-empty">${escapeHtml(emptyMsg)}</div>`}</div>
        </div>`;
}

function getTmHistorySearchHaystack(item, scope = 'all') {
    const o = item.owner || {};
    const c = item.closer || {};
    const participants = Array.isArray(item.participants) ? item.participants.join(' ') : '';
    const scopeFields = {
        all: [
            item.reportId,
            item.channelName,
            item.category,
            item.reason,
            item.common,
            item.ownerId,
            item.closedById,
            item.closedByTag,
            o.username,
            o.tag,
            c.username,
            c.tag,
            participants
        ],
        user: [o.username, o.tag, item.ownerId, participants],
        staff: [c.username, c.tag, item.closedById, item.closedByTag],
        report: [item.reportId],
        channel: [item.channelName],
        category: [item.category],
        reason: [item.reason, item.common]
    };
    return (scopeFields[scope] || scopeFields.all).filter(Boolean).join(' ').toLowerCase();
}

function filterTmHistoryItems(items, queryRaw, scopeRaw = 'all') {
    const q = String(queryRaw || '').trim().toLowerCase();
    const scope = TM_HISTORY_FILTER_SCOPES.some((entry) => entry.id === scopeRaw) ? scopeRaw : 'all';
    if (!q) return Array.isArray(items) ? items : [];
    const needles = q.split(/\s+/).filter(Boolean);
    return (items || []).filter((item) => {
        const hay = getTmHistorySearchHaystack(item, scope);
        return needles.every((needle) => hay.includes(needle));
    });
}

function refreshTmHistoryListFromState() {
    const payload = _ticketsManageState.lastData;
    if (!payload || _ticketsManageState.tab !== 'history') return;
    renderTmList(payload, 'history');
}

function renderTmList(data, tab) {
    const container = document.getElementById('tmListContainer');
    if (!container) return;

    if (tab === 'pending') {
        container.innerHTML = renderTmPendingList(data?.pending || []);
        wireTmPendingActions();
    } else if (tab === 'active') {
        container.innerHTML = renderTmActiveList(data?.active || []);
        wireTmActiveActions();
    } else {
        const raw = data?.history || [];
        const filtered = filterTmHistoryItems(raw, _ticketsManageState.historyFilter, _ticketsManageState.historyScope);
        const filterActive = !!String(_ticketsManageState.historyFilter || '').trim();
        container.innerHTML = renderTmHistoryList(filtered, {
            filterActive,
            totalSourceCount: raw.length,
            scope: _ticketsManageState.historyScope || 'all'
        });
        wireTmHistoryActions();
    }
}

function renderTmPendingList(items) {
    if (!items?.length) return renderTmEmpty('pending');
    return `<div class="tm-list">${items.map(renderTmPendingCard).join('')}</div>`;
}

function renderTmPendingCard(item) {
    const r = item.requester || {};
    const avatar = r.avatar
        ? `<img src="${escapeHtml(r.avatar)}" alt="${escapeHtml(r.username || 'U')}">`
        : escapeHtml(String(r.username || '?').charAt(0).toUpperCase());
    const when = formatRelativeTime(item.createdAt);
    const category = escapeHtml(item.category || 'Soporte general');
    const commonIssue = escapeHtml(item.commonIssue || '');
    const reason = escapeHtml(item.reason || 'Sin motivo');

    return `
        <div class="tm-ticket-card">
            <div class="tm-ticket-avatar">${avatar}</div>
            <div class="tm-ticket-body">
                <div class="tm-ticket-title">
                    <span>${escapeHtml(r.username || 'Usuario')}</span>
                    <span class="tm-badge pending">Pendiente</span>
                    <span class="tm-badge cat">${category}</span>
                </div>
                <div class="tm-ticket-meta">
                    ${commonIssue ? `<span class="tm-ticket-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12l2 2 4-4"></path><rect x="3" y="3" width="18" height="18" rx="4"></rect></svg>${commonIssue}</span>` : ''}
                    <span class="tm-ticket-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>${escapeHtml(when)}</span>
                </div>
                <div class="tm-ticket-reason">${reason}</div>
            </div>
            <div class="tm-ticket-actions">
                <button type="button" class="tm-btn tm-btn-primary" data-tm-accept="${escapeHtml(item.requestId || '')}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"></path></svg>
                    <span>Aceptar</span>
                </button>
            </div>
        </div>`;
}

function renderTmActiveList(items) {
    if (!items?.length) return renderTmEmpty('active');
    return `<div class="tm-list">${items.map(renderTmActiveCard).join('')}</div>`;
}

function renderTmActiveCard(item) {
    const o = item.owner || {};
    const avatar = o.avatar
        ? `<img src="${escapeHtml(o.avatar)}" alt="${escapeHtml(o.username || 'U')}">`
        : escapeHtml(String(o.username || '?').charAt(0).toUpperCase());
    const when = formatRelativeTime(item.createdAt);
    const claimer = item.claimer;
    const sSmall = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    const claimedBadge = claimer
        ? `<span class="tm-badge claimed"><svg viewBox="0 0 24 24" fill="none" ${sSmall}><path d="M12 2l8 4v6c0 4.8-3.4 9-8 10-4.6-1-8-5.2-8-10V6l8-4z"></path><path d="M9 12l2.2 2.2L15 10.5"></path></svg>${escapeHtml(claimer.username || 'staff')}</span>`
        : `<span class="tm-badge active"><svg viewBox="0 0 24 24" fill="none" ${sSmall}><circle cx="12" cy="12" r="4"></circle><path d="M12 3v2"></path><path d="M12 19v2"></path><path d="M3 12h2"></path><path d="M19 12h2"></path></svg>Sin asignar</span>`;

    const claimBtn = claimer
        ? `<button type="button" class="tm-btn tm-btn-unclaim" data-tm-unclaim="${escapeHtml(item.channelId || '')}">
                <svg viewBox="0 0 24 24" fill="none" ${sSmall}><circle cx="12" cy="12" r="9"></circle><path d="M8 12h8"></path></svg>
                <span>Liberar</span>
            </button>`
        : `<button type="button" class="tm-btn tm-btn-claim" data-tm-claim="${escapeHtml(item.channelId || '')}">
                <svg viewBox="0 0 24 24" fill="none" ${sSmall}><path d="M12 2l8 4v6c0 4.8-3.4 9-8 10-4.6-1-8-5.2-8-10V6l8-4z"></path><path d="M9 12l2.2 2.2L15 10.5"></path></svg>
                <span>Reclamar</span>
            </button>`;

    return `
        <div class="tm-ticket-card">
            <div class="tm-ticket-avatar">${avatar}</div>
            <div class="tm-ticket-body">
                <div class="tm-ticket-title">
                    <span>#${escapeHtml(item.channelName || 'ticket')}</span>
                    ${claimedBadge}
                    <span class="tm-badge cat">${escapeHtml(item.category || 'Soporte general')}</span>
                </div>
                <div class="tm-ticket-meta">
                    <span class="tm-ticket-meta-item"><svg viewBox="0 0 24 24" fill="none" ${sSmall}><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"></path></svg>${escapeHtml(o.username || 'Usuario')}</span>
                    <span class="tm-ticket-meta-item"><svg viewBox="0 0 24 24" fill="none" ${sSmall}><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>${escapeHtml(when)}</span>
                </div>
                ${item.reason ? `<div class="tm-ticket-reason">${escapeHtml(item.reason)}</div>` : ''}
            </div>
            <div class="tm-ticket-actions">
                <button type="button" class="tm-btn tm-btn-chat" data-tm-chat="${escapeHtml(item.channelId || '')}" data-tm-chat-name="${escapeHtml(item.channelName || '')}" data-tm-chat-owner="${escapeHtml(o.username || 'Usuario')}" data-tm-chat-owner-avatar="${escapeHtml(o.avatar || '')}">
                    <svg viewBox="0 0 24 24" fill="none" ${sSmall}><path d="M21 11.5a8.4 8.4 0 0 1-1 4A8.5 8.5 0 0 1 12.5 20a8.4 8.4 0 0 1-4-1L3 21l1.9-5.6a8.4 8.4 0 0 1-1-4 8.5 8.5 0 0 1 4.5-7.5 8.4 8.4 0 0 1 4-1h.5a8.5 8.5 0 0 1 8 8z"></path></svg>
                    <span>Chat</span>
                </button>
                ${claimBtn}
                <button type="button" class="tm-btn tm-btn-close-ticket" data-tm-close="${escapeHtml(item.channelId || '')}">
                    <svg viewBox="0 0 24 24" fill="none" ${sSmall}><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
                    <span>Cerrar ticket</span>
                </button>
            </div>
        </div>`;
}

function renderTmHistoryList(items, meta = {}) {
    const { filterActive, totalSourceCount, scope = 'all' } = meta;
    if (!items?.length) {
        if (filterActive && totalSourceCount > 0) return renderTmEmpty('historyFiltered');
        return renderTmEmpty('history');
    }
    const scopeLabel = TM_HISTORY_FILTER_SCOPES.find((entry) => entry.id === scope)?.label || 'Todo';
    const hint =
        filterActive && typeof totalSourceCount === 'number'
            ? `<div class="tm-history-filter-hint">Coincidencias: <strong>${items.length}</strong> de <strong>${totalSourceCount}</strong> · ámbito <strong>${escapeHtml(scopeLabel)}</strong></div>`
            : '';
    return `${hint}<div class="tm-list">${items.map(renderTmHistoryCard).join('')}</div>`;
}

function renderTmHistoryCard(item) {
    const o = item.owner || {};
    const c = item.closer || {};
    const avatar = o.avatar
        ? `<img src="${escapeHtml(o.avatar)}" alt="${escapeHtml(o.username || 'U')}">`
        : escapeHtml(String(o.username || '?').charAt(0).toUpperCase());
    const when = formatRelativeTime(item.createdAt);

    return `
        <div class="tm-ticket-card is-history" data-tm-history="${escapeHtml(item.reportId || '')}">
            <div class="tm-ticket-avatar">${avatar}</div>
            <div class="tm-ticket-body">
                <div class="tm-ticket-title">
                    <span>#${escapeHtml(item.channelName || 'ticket')}</span>
                    <span class="tm-badge closed">Cerrado</span>
                    <span class="tm-badge cat">${escapeHtml(item.category || 'Soporte general')}</span>
                </div>
                <div class="tm-ticket-meta">
                    <span class="tm-ticket-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"></path></svg>${escapeHtml(o.username || 'Usuario')}</span>
                    <span class="tm-ticket-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>${escapeHtml(when)}</span>
                    <span class="tm-ticket-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 4.8-3.4 9-8 10-4.6-1-8-5.2-8-10V6l8-4z"></path><path d="M9 12l2.2 2.2L15 10.5"></path></svg>Cerrado por ${escapeHtml(c.username || 'staff')}</span>
                    <span class="tm-ticket-meta-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"></path></svg>${Number(item.messagesCount || 0)} mensajes</span>
                </div>
                ${item.reason ? `<div class="tm-ticket-reason">${escapeHtml(item.reason)}</div>` : ''}
            </div>
            <div class="tm-ticket-actions">
                <button type="button" class="tm-btn tm-btn-receipt" data-tm-view-receipt="${escapeHtml(item.reportId || '')}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M8 13h8"></path><path d="M8 17h8"></path><path d="M8 9h3"></path></svg>
                    <span>Ver comprobante</span>
                </button>
                <button type="button" class="tm-btn tm-btn-ghost" data-tm-history-toggle="${escapeHtml(item.reportId || '')}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
                    <span>Detalles</span>
                </button>
                <button type="button" class="tm-btn tm-btn-delete-report" data-tm-delete-report="${escapeHtml(item.reportId || '')}" title="Quitar del historial en la base de datos">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>
                    <span>Eliminar</span>
                </button>
            </div>
            <div class="tm-history-detail">
                <dl>
                    <dt>ID</dt><dd>${escapeHtml(item.reportId || 'SIN-ID')}</dd>
                    <dt>Usuario</dt><dd>${escapeHtml(o.username || '-')} (${escapeHtml(item.ownerId || '-')})</dd>
                    <dt>Categoría</dt><dd>${escapeHtml(item.category || 'Soporte general')}</dd>
                    <dt>Problema</dt><dd>${escapeHtml(item.common || '-')}</dd>
                    <dt>Motivo</dt><dd>${escapeHtml(item.reason || '-')}</dd>
                    <dt>Cerrado por</dt><dd>${escapeHtml(c.username || item.closedByTag || '-')}</dd>
                    <dt>Mensajes</dt><dd>${Number(item.messagesCount || 0)}</dd>
                    <dt>Participantes</dt><dd>${Array.isArray(item.participants) ? item.participants.length : 0}</dd>
                    <dt>Fecha</dt><dd>${escapeHtml(new Date(item.createdAt || 0).toLocaleString('es-ES'))}</dd>
                </dl>
            </div>
        </div>`;
}

function renderTmEmpty(tab) {
    const copy = {
        pending: { icon: tmIconHourglass(), title: 'Sin solicitudes pendientes', desc: 'Cuando alguien solicite un ticket aparecerá aquí.' },
        active: { icon: tmIconActivity(), title: 'Sin tickets activos', desc: 'No hay canales de tickets abiertos en este momento.' },
        history: { icon: tmIconCheck(), title: 'Historial vacío', desc: 'Cuando se cierren tickets los verás aquí con todos sus detalles.' },
        historyFiltered: { icon: tmIconCheck(), title: 'Sin coincidencias', desc: 'Prueba otro término, cambia el ámbito o pulsa Limpiar para ver todo el historial cargado.' }
    }[tab] || { icon: '', title: 'Sin datos', desc: '' };

    return `
        <div class="tm-list-empty">
            <div class="tm-list-empty-icon">${copy.icon}</div>
            <strong>${escapeHtml(copy.title)}</strong>
            <p>${escapeHtml(copy.desc)}</p>
        </div>`;
}

function wireTmPendingActions() {
    document.querySelectorAll('[data-tm-accept]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const requestId = btn.getAttribute('data-tm-accept');
            if (!requestId) return;
            await acceptPendingTicket(requestId, btn);
        });
    });
}

function wireTmActiveActions() {
    document.querySelectorAll('[data-tm-claim]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const channelId = btn.getAttribute('data-tm-claim');
            if (!channelId) return;
            await claimTicket(channelId, btn);
        });
    });
    document.querySelectorAll('[data-tm-unclaim]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const channelId = btn.getAttribute('data-tm-unclaim');
            if (!channelId) return;
            await unclaimTicket(channelId, btn);
        });
    });
    document.querySelectorAll('[data-tm-chat]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const channelId = btn.getAttribute('data-tm-chat');
            const channelName = btn.getAttribute('data-tm-chat-name') || '';
            const ownerName = btn.getAttribute('data-tm-chat-owner') || '';
            const ownerAvatar = btn.getAttribute('data-tm-chat-owner-avatar') || '';
            if (!channelId) return;
            openTicketChat(channelId, { channelName, ownerName, ownerAvatar });
        });
    });
    document.querySelectorAll('[data-tm-close]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const channelId = btn.getAttribute('data-tm-close');
            if (!channelId) return;
            await closeActiveTicketFromPanel(channelId, btn);
        });
    });
}

function wireTmHistoryActions() {
    document.querySelectorAll('[data-tm-history-toggle]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.tm-ticket-card.is-history');
            if (card) card.classList.toggle('expanded');
        });
    });
    document.querySelectorAll('[data-tm-view-receipt]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const reportId = btn.getAttribute('data-tm-view-receipt');
            if (reportId) openReceiptModal(reportId);
        });
    });
    document.querySelectorAll('[data-tm-delete-report]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const reportId = btn.getAttribute('data-tm-delete-report');
            if (reportId) await deleteTicketHistoryReportFromPanel(reportId, btn);
        });
    });
}

// ============================================================
// Modal visor de comprobantes (sub-pantalla)
// ============================================================
const _receiptModalState = {
    reportId: null,
    data: null,
    activeTab: 'summary',
    search: '',
    wired: false
};

function openReceiptModal(reportId) {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    if (!guildId || !reportId) return;

    _receiptModalState.reportId = reportId;
    _receiptModalState.data = null;
    _receiptModalState.activeTab = 'summary';
    _receiptModalState.search = '';

    const modal = document.getElementById('receiptModal');
    if (!modal) return;

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    wireReceiptModalControls();
    resetReceiptModalUI();
    loadReceipt(guildId, reportId);
}

function closeReceiptModal() {
    const modal = document.getElementById('receiptModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    _receiptModalState.reportId = null;
    _receiptModalState.data = null;
}

function wireReceiptModalControls() {
    if (_receiptModalState.wired) return;
    _receiptModalState.wired = true;

    const modal = document.getElementById('receiptModal');
    if (!modal) return;

    modal.querySelectorAll('[data-receipt-close]').forEach((el) => {
        el.addEventListener('click', closeReceiptModal);
    });

    modal.querySelectorAll('[data-receipt-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const tab = btn.getAttribute('data-receipt-tab');
            setReceiptTab(tab);
        });
    });

    const search = document.getElementById('receiptSearchInput');
    if (search) {
        search.addEventListener('input', (e) => {
            _receiptModalState.search = String(e.target.value || '').trim();
            if (_receiptModalState.activeTab !== 'transcript') setReceiptTab('transcript');
            else renderReceiptTranscript();
        });
    }

    const copyBtn = document.getElementById('receiptCopyBtn');
    if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
            const data = _receiptModalState.data;
            if (!data) return;
            const text = data.transcriptText || (Array.isArray(data.transcriptEntries)
                ? data.transcriptEntries.map((e) => `[${e.createdAt}] ${e.authorTag}: ${e.content}`).join('\n')
                : '');
            try {
                await navigator.clipboard.writeText(text);
                showToast('Transcripción copiada al portapapeles', 'success');
            } catch {
                showToast('No se pudo copiar. Usa el botón de descarga.', 'error');
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const m = document.getElementById('receiptModal');
            if (m && m.classList.contains('is-open')) closeReceiptModal();
        }
    });
}

function resetReceiptModalUI() {
    const title = document.getElementById('receiptModalTitle');
    if (title) title.textContent = 'Cargando comprobante...';

    const download = document.getElementById('receiptDownloadBtn');
    if (download) {
        download.setAttribute('href', '#');
        download.classList.add('is-disabled');
    }

    const search = document.getElementById('receiptSearchInput');
    if (search) search.value = '';

    document.querySelectorAll('.receipt-tab-btn').forEach((b) => {
        b.classList.toggle('is-active', b.getAttribute('data-receipt-tab') === 'summary');
    });
    document.querySelectorAll('.receipt-pane').forEach((p) => p.classList.remove('is-active'));
    const pane = document.getElementById('receiptPaneSummary');
    if (pane) {
        pane.classList.add('is-active');
        pane.innerHTML = `
            <div class="receipt-loading">
                <div class="loading-spinner"></div>
                <p>Cargando comprobante...</p>
            </div>`;
    }
    const paneT = document.getElementById('receiptPaneTranscript');
    if (paneT) paneT.innerHTML = '';
    const paneP = document.getElementById('receiptPaneParticipants');
    if (paneP) paneP.innerHTML = '';
}

function setReceiptTab(tab) {
    const valid = ['summary', 'transcript', 'participants'];
    if (!valid.includes(tab)) tab = 'summary';
    _receiptModalState.activeTab = tab;

    document.querySelectorAll('.receipt-tab-btn').forEach((b) => {
        b.classList.toggle('is-active', b.getAttribute('data-receipt-tab') === tab);
    });
    document.querySelectorAll('.receipt-pane').forEach((p) => p.classList.remove('is-active'));

    const paneMap = {
        summary: 'receiptPaneSummary',
        transcript: 'receiptPaneTranscript',
        participants: 'receiptPaneParticipants'
    };
    const el = document.getElementById(paneMap[tab]);
    if (el) el.classList.add('is-active');

    if (tab === 'summary') renderReceiptSummary();
    else if (tab === 'transcript') renderReceiptTranscript();
    else if (tab === 'participants') renderReceiptParticipants();
}

async function loadReceipt(guildId, reportId) {
    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/tickets/report/${encodeURIComponent(reportId)}`);
        const data = await response.json();
        if (!response.ok || !data?.success) {
            throw new Error(data?.error || 'No se pudo cargar el comprobante');
        }
        _receiptModalState.data = data.report;

        const title = document.getElementById('receiptModalTitle');
        if (title) title.textContent = `Comprobante ${data.report.reportId}`;

        const download = document.getElementById('receiptDownloadBtn');
        if (download) {
            download.setAttribute('href', `/api/guild/${guildId}/tickets/report/${encodeURIComponent(reportId)}/download`);
            download.classList.remove('is-disabled');
        }

        renderReceiptSummary();
    } catch (error) {
        console.error('Error cargando comprobante:', error);
        const pane = document.getElementById('receiptPaneSummary');
        if (pane) {
            pane.innerHTML = `
                <div class="receipt-empty">
                    <p><strong>Error al cargar el comprobante</strong></p>
                    <p>${escapeHtml(error.message || 'Intenta de nuevo más tarde.')}</p>
                </div>`;
        }
    }
}

function renderReceiptAvatar(user) {
    if (user && user.avatarURL) {
        return `<img src="${escapeHtml(user.avatarURL)}" alt="${escapeHtml(user.displayName || user.tag || 'U')}" loading="lazy">`;
    }
    const label = String(user?.displayName || user?.tag || user?.username || '?').charAt(0).toUpperCase();
    return escapeHtml(label);
}

function renderReceiptSummary() {
    const pane = document.getElementById('receiptPaneSummary');
    const data = _receiptModalState.data;
    if (!pane || !data) return;

    const owner = data.owner || { id: data.ownerId, displayName: 'Desconocido', tag: data.ownerId || '-' };
    const closer = data.closer || { id: data.closedById, displayName: data.closedByTag || 'Staff', tag: data.closedByTag || '-' };
    const dateStr = data.createdAt ? new Date(data.createdAt).toLocaleString('es-ES') : '-';

    pane.innerHTML = `
        <div class="receipt-summary">
            <div class="receipt-card">
                <div class="receipt-card-label">ID Comprobante</div>
                <div class="receipt-card-value">${escapeHtml(data.reportId || '-')}</div>
            </div>
            <div class="receipt-card">
                <div class="receipt-card-label">Fecha de cierre</div>
                <div class="receipt-card-value">${escapeHtml(dateStr)}</div>
            </div>
            <div class="receipt-card">
                <div class="receipt-card-label">Canal</div>
                <div class="receipt-card-value">#${escapeHtml(data.channelName || '-')}</div>
            </div>
            <div class="receipt-card">
                <div class="receipt-card-label">Categoría</div>
                <div class="receipt-card-value">${escapeHtml(data.category || 'No especificado')}</div>
            </div>
            <div class="receipt-card">
                <div class="receipt-card-label">Caso / problema</div>
                <div class="receipt-card-value">${escapeHtml(data.common || 'No especificado')}</div>
            </div>
            <div class="receipt-card">
                <div class="receipt-card-label">Mensajes</div>
                <div class="receipt-card-value">${Number(data.messagesCount || 0)} · ${Array.isArray(data.participants) ? data.participants.length : 0} participantes</div>
            </div>
            <div class="receipt-card user-card">
                <div class="receipt-user-avatar">${renderReceiptAvatar(owner)}</div>
                <div class="receipt-user-meta">
                    <div class="receipt-card-label">Abierto por</div>
                    <div class="receipt-user-tag">${escapeHtml(owner.displayName || owner.tag || 'Desconocido')}</div>
                    <div class="receipt-user-id">${escapeHtml(owner.id || '-')}</div>
                </div>
            </div>
            <div class="receipt-card user-card">
                <div class="receipt-user-avatar">${renderReceiptAvatar(closer)}</div>
                <div class="receipt-user-meta">
                    <div class="receipt-card-label">Cerrado por</div>
                    <div class="receipt-user-tag">${escapeHtml(closer.displayName || closer.tag || 'Staff')}</div>
                    <div class="receipt-user-id">${escapeHtml(closer.id || '-')}</div>
                </div>
            </div>
            ${data.reason ? `
                <div class="receipt-card receipt-summary-reason">
                    <div class="receipt-card-label">Motivo</div>
                    <div class="receipt-card-value">${escapeHtml(data.reason)}</div>
                </div>` : ''}
        </div>`;
}

function renderReceiptTranscript() {
    const pane = document.getElementById('receiptPaneTranscript');
    const data = _receiptModalState.data;
    if (!pane) return;
    if (!data) { pane.innerHTML = ''; return; }

    const entries = Array.isArray(data.transcriptEntries) ? data.transcriptEntries : [];
    const query = String(_receiptModalState.search || '').toLowerCase();

    if (entries.length === 0) {
        const plain = typeof data.transcriptText === 'string' ? data.transcriptText.trim() : '';
        if (plain) {
            pane.innerHTML = `
                <div class="receipt-transcript">
                    <div class="receipt-transcript-head">
                        <span><strong>Texto plano</strong> (sin mensajes estructurados)</span>
                        <span>También puedes usar <em>Copiar</em> o <em>Descargar</em></span>
                    </div>
                    <pre class="receipt-transcript-plain">${escapeHtml(plain)}</pre>
                </div>`;
            return;
        }
        pane.innerHTML = `
            <div class="receipt-empty">
                <p><strong>Sin transcripción</strong></p>
                <p>No hay mensajes guardados en este comprobante. Si existe archivo, prueba <em>Descargar</em>.</p>
            </div>`;
        return;
    }

    const matches = [];
    const html = entries.map((entry) => {
        const content = String(entry.content || '');
        const contentLc = content.toLowerCase();
        const isMatch = !!(query && contentLc.includes(query));
        if (isMatch) matches.push(entry.id);

        const time = entry.createdAt ? new Date(entry.createdAt).toLocaleString('es-ES') : '';
        const authorName = escapeHtml(entry.authorDisplayName || entry.authorTag || 'Desconocido');
        const botTag = entry.authorBot ? '<span class="receipt-msg-bot-tag">BOT</span>' : '';

        const avatarHtml = entry.authorAvatarURL
            ? `<img src="${escapeHtml(entry.authorAvatarURL)}" alt="${authorName}" loading="lazy">`
            : escapeHtml(String(entry.authorDisplayName || entry.authorTag || '?').charAt(0).toUpperCase());

        const contentHtml = query
            ? highlightText(content, query)
            : escapeHtml(content);

        const attachmentsHtml = Array.isArray(entry.attachments) && entry.attachments.length
            ? `<div class="receipt-msg-attach">${entry.attachments.map((a) => `
                <a href="${escapeHtml(a.url || '#')}" target="_blank" rel="noopener">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11l-9 9a5 5 0 1 1-7-7l9-9a3.5 3.5 0 1 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"></path></svg>
                    <span>${escapeHtml(a.name || 'archivo')}</span>
                </a>`).join('')}</div>`
            : '';

        return `
            <div class="receipt-msg ${entry.authorBot ? 'is-bot' : ''} ${isMatch ? 'is-match' : ''}">
                <div class="receipt-msg-avatar">${avatarHtml}</div>
                <div class="receipt-msg-body">
                    <div class="receipt-msg-head">
                        <span class="receipt-msg-author">${authorName}</span>
                        ${botTag}
                        <span class="receipt-msg-time">${escapeHtml(time)}</span>
                    </div>
                    <div class="receipt-msg-content">${contentHtml}</div>
                    ${attachmentsHtml}
                </div>
            </div>`;
    }).join('');

    const header = `
        <div class="receipt-transcript-head">
            <span><strong>${entries.length}</strong> mensajes</span>
            ${query ? `<span><strong>${matches.length}</strong> coincidencias para "${escapeHtml(_receiptModalState.search)}"</span>` : ''}
        </div>`;

    pane.innerHTML = `<div class="receipt-transcript">${header}${html}</div>`;
}

function renderReceiptParticipants() {
    const pane = document.getElementById('receiptPaneParticipants');
    const data = _receiptModalState.data;
    if (!pane) return;
    if (!data) { pane.innerHTML = ''; return; }

    const list = Array.isArray(data.participantsDetailed) && data.participantsDetailed.length
        ? data.participantsDetailed
        : (Array.isArray(data.participants) ? data.participants.map((id) => ({ id, tag: id })) : []);

    if (list.length === 0) {
        pane.innerHTML = `
            <div class="receipt-empty">
                <p>Sin participantes registrados.</p>
            </div>`;
        return;
    }

    pane.innerHTML = `
        <div class="receipt-participants">
            ${list.map((p) => `
                <div class="receipt-participant">
                    <div class="receipt-user-avatar">${renderReceiptAvatar(p)}</div>
                    <div class="receipt-user-meta">
                        <div class="receipt-participant-tag">${escapeHtml(p.displayName || p.tag || 'Desconocido')}</div>
                        <div class="receipt-participant-id">${escapeHtml(p.id || '-')}</div>
                    </div>
                </div>
            `).join('')}
        </div>`;
}

function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escapedQuery})`, 'gi');
    const safe = escapeHtml(text);
    return safe.replace(re, '<mark class="receipt-highlight">$1</mark>');
}

// ============================================================
// Chat bidireccional ticket <-> web
// ============================================================
const _ticketChatState = {
    channelId: null,
    channelName: '',
    ownerName: '',
    ownerAvatar: '',
    messages: [],
    messageIds: new Set(),
    pollTimer: null,
    wired: false,
    isOpen: false,
    lastFetchAt: 0,
    sending: false
};

function openTicketChat(channelId, meta = {}) {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    if (!guildId || !channelId) return;

    _ticketChatState.channelId = channelId;
    _ticketChatState.channelName = meta.channelName || '';
    _ticketChatState.ownerName = meta.ownerName || '';
    _ticketChatState.ownerAvatar = meta.ownerAvatar || '';
    _ticketChatState.messages = [];
    _ticketChatState.messageIds = new Set();
    _ticketChatState.isOpen = true;

    const modal = document.getElementById('ticketChatModal');
    if (!modal) return;

    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    wireTicketChatControls();
    resetTicketChatUI(meta);

    fetchTicketChatMessages({ initial: true });
    startTicketChatPolling();
}

function closeTicketChat() {
    stopTicketChatPolling();
    _ticketChatState.isOpen = false;
    _ticketChatState.channelId = null;
    _ticketChatState.messages = [];
    _ticketChatState.messageIds = new Set();

    const modal = document.getElementById('ticketChatModal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    const input = document.getElementById('ticketChatInput');
    if (input) input.value = '';
    updateTicketChatCounter();
}

function wireTicketChatControls() {
    if (_ticketChatState.wired) return;
    _ticketChatState.wired = true;

    const modal = document.getElementById('ticketChatModal');
    if (!modal) return;

    modal.querySelectorAll('[data-tchat-close]').forEach((el) => {
        el.addEventListener('click', closeTicketChat);
    });

    const refreshBtn = document.getElementById('ticketChatRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => fetchTicketChatMessages({ force: true }));

    const form = document.getElementById('ticketChatForm');
    const input = document.getElementById('ticketChatInput');
    const sendBtn = document.getElementById('ticketChatSendBtn');

    if (input) {
        input.addEventListener('input', () => {
            autoResizeTicketChatInput();
            updateTicketChatCounter();
            if (sendBtn) sendBtn.disabled = !input.value.trim() || _ticketChatState.sending;
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (form) form.requestSubmit();
            }
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await sendTicketChatMessage();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const m = document.getElementById('ticketChatModal');
            if (m && m.classList.contains('is-open')) closeTicketChat();
        }
    });
}

function resetTicketChatUI(meta = {}) {
    const title = document.getElementById('ticketChatTitle');
    if (title) title.textContent = meta.channelName ? `#${meta.channelName}` : 'Cargando ticket...';

    const subtitle = document.getElementById('ticketChatSubtitle');
    if (subtitle) subtitle.textContent = meta.ownerName ? `con ${meta.ownerName}` : '—';

    const avatar = document.getElementById('ticketChatAvatar');
    if (avatar) {
        if (meta.ownerAvatar) {
            avatar.innerHTML = `<img src="${escapeHtml(meta.ownerAvatar)}" alt="${escapeHtml(meta.ownerName || 'U')}">`;
        } else {
            avatar.textContent = String(meta.ownerName || '#').charAt(0).toUpperCase();
        }
    }

    const body = document.getElementById('ticketChatBody');
    if (body) {
        body.innerHTML = `
            <div class="ticket-chat-loading">
                <div class="loading-spinner"></div>
                <p>Cargando mensajes...</p>
            </div>`;
    }

    const status = document.getElementById('ticketChatStatus');
    if (status) { status.style.display = 'none'; status.textContent = ''; status.classList.remove('is-info'); }

    const sendBtn = document.getElementById('ticketChatSendBtn');
    if (sendBtn) sendBtn.disabled = true;

    updateTicketChatCounter();
}

function autoResizeTicketChatInput() {
    const input = document.getElementById('ticketChatInput');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(140, input.scrollHeight)}px`;
}

function updateTicketChatCounter() {
    const input = document.getElementById('ticketChatInput');
    const counter = document.getElementById('ticketChatCounter');
    if (!input || !counter) return;
    const len = input.value.length;
    counter.textContent = String(len);
    counter.parentElement?.classList.toggle('is-warning', len > 1500 && len <= 1750);
    counter.parentElement?.classList.toggle('is-danger', len > 1750);
}

function startTicketChatPolling() {
    stopTicketChatPolling();
    _ticketChatState.pollTimer = setInterval(() => {
        if (!_ticketChatState.isOpen) return;
        if (document.hidden) return;
        fetchTicketChatMessages();
    }, 3500);
}

function stopTicketChatPolling() {
    if (_ticketChatState.pollTimer) {
        clearInterval(_ticketChatState.pollTimer);
        _ticketChatState.pollTimer = null;
    }
}

function setTicketChatStatus(message, type = 'error') {
    const status = document.getElementById('ticketChatStatus');
    if (!status) return;
    if (!message) {
        status.style.display = 'none';
        status.textContent = '';
        status.classList.remove('is-info');
        return;
    }
    status.textContent = message;
    status.style.display = 'block';
    status.classList.toggle('is-info', type === 'info');
}

async function fetchTicketChatMessages({ initial = false, force = false } = {}) {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    const channelId = _ticketChatState.channelId;
    if (!guildId || !channelId) return;

    const now = Date.now();
    if (!force && !initial && now - _ticketChatState.lastFetchAt < 1500) return;
    _ticketChatState.lastFetchAt = now;

    let responseStatus = 0;
    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/tickets/active/${encodeURIComponent(channelId)}/messages?limit=60`);
        responseStatus = Number(response.status || 0);
        const data = await response.json();
        if (!response.ok || !data?.success) {
            throw new Error(data?.error || 'No se pudieron cargar los mensajes');
        }

        const headTitle = document.getElementById('ticketChatTitle');
        if (headTitle && data.channelName) headTitle.textContent = `#${data.channelName}`;

        const headSub = document.getElementById('ticketChatSubtitle');
        if (headSub) {
            const bits = [];
            if (data.category) bits.push(data.category);
            if (data.claimedBy) bits.push(`reclamado`);
            bits.push(`${data.messages.length} msgs`);
            headSub.textContent = bits.join(' · ');
        }

        const incoming = Array.isArray(data.messages) ? data.messages : [];
        const hadAny = _ticketChatState.messages.length > 0;
        const body = document.getElementById('ticketChatBody');
        const wasAtBottom = body ? isScrolledToBottom(body) : true;

        _ticketChatState.messages = incoming;
        _ticketChatState.messageIds = new Set(incoming.map((m) => m.id));

        renderTicketChatMessages(incoming);

        if (initial || wasAtBottom || !hadAny) {
            scrollTicketChatToBottom();
        }

        setTicketChatStatus('');
    } catch (error) {
        console.error('Error cargando mensajes:', error);
        if (responseStatus === 403 || responseStatus === 404) {
            stopTicketChatPolling();
            setTicketChatStatus('La conversación ya no está disponible en este servidor.');
            return;
        }
        if (initial) setTicketChatStatus(error.message || 'No se pudieron cargar los mensajes.');
    }
}

function isScrolledToBottom(el, threshold = 80) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

function scrollTicketChatToBottom(smooth = false) {
    const body = document.getElementById('ticketChatBody');
    if (!body) return;
    requestAnimationFrame(() => {
        body.scrollTo({ top: body.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
}

function renderTicketChatMessages(messages) {
    const body = document.getElementById('ticketChatBody');
    if (!body) return;

    if (!messages.length) {
        body.innerHTML = `
            <div class="ticket-chat-empty">
                <strong>Sin mensajes aún</strong>
                <p>Envia un mensaje para iniciar la conversación con el usuario.</p>
            </div>`;
        return;
    }

    const ownerId = findTicketChatOwnerId();
    let lastDay = '';
    const html = messages.map((msg) => {
        const date = msg.createdAt ? new Date(msg.createdAt) : null;
        const dayKey = date ? date.toDateString() : '';
        let sep = '';
        if (dayKey && dayKey !== lastDay) {
            lastDay = dayKey;
            sep = `<div class="ticket-chat-day-separator"><span>${escapeHtml(formatChatDayLabel(date))}</span></div>`;
        }
        return sep + renderTicketChatMessage(msg, ownerId);
    }).join('');

    body.innerHTML = html;
}

function findTicketChatOwnerId() {
    const active = Array.isArray(_ticketsManageState.lastData?.active) ? _ticketsManageState.lastData.active : [];
    const current = active.find((t) => t.channelId === _ticketChatState.channelId);
    return current?.ownerId || '';
}

function renderTicketChatMessage(msg, ownerId) {
    const isBot = !!msg.authorBot;
    const isWebhook = !!msg.webhookId;
    const isOwner = ownerId && msg.authorId === ownerId;

    const author = escapeHtml(msg.authorDisplayName || msg.authorTag || 'Desconocido');
    const avatarHtml = msg.authorAvatarURL
        ? `<img src="${escapeHtml(msg.authorAvatarURL)}" alt="${author}" loading="lazy">`
        : escapeHtml(String(msg.authorDisplayName || msg.authorTag || '?').charAt(0).toUpperCase());

    const timeStr = msg.createdAt ? formatChatTimeShort(new Date(msg.createdAt)) : '';

    const classes = ['tchat-msg'];
    if (isBot) classes.push('is-bot');
    if (isWebhook) classes.push('is-from-web');
    if (isOwner) classes.push('is-owner');

    const authorClasses = ['tchat-author'];
    if (isBot) authorClasses.push('is-bot');
    if (isOwner) authorClasses.push('is-owner');

    const badges = [];
    if (isBot) badges.push('<span class="tchat-bot-tag">BOT</span>');
    if (isWebhook && !isBot) badges.push('<span class="tchat-web-tag">WEB</span>');

    const content = formatChatContent(msg.content || '');

    const attachmentsHtml = (Array.isArray(msg.attachments) ? msg.attachments : []).map((a) => {
        const isImage = (a.contentType && a.contentType.startsWith('image/'))
            || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name || '');
        if (isImage) {
            return `<a class="tchat-attach-image" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">
                <img src="${escapeHtml(a.url)}" alt="${escapeHtml(a.name || 'imagen')}" loading="lazy">
            </a>`;
        }
        return `<a class="tchat-attach" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.4 11l-9 9a5 5 0 1 1-7-7l9-9a3.5 3.5 0 1 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"></path></svg>
            <span>${escapeHtml(a.name || 'archivo')}</span>
        </a>`;
    }).join('');
    const attachBlock = attachmentsHtml ? `<div class="tchat-attachments">${attachmentsHtml}</div>` : '';

    const embedsHtml = (Array.isArray(msg.embeds) ? msg.embeds : []).map((e) => {
        if (!e.title && !e.description) return '';
        return `<div class="tchat-embed">
            ${e.title ? `<div class="tchat-embed-title">${escapeHtml(e.title)}</div>` : ''}
            ${e.description ? `<div class="tchat-embed-desc">${formatChatContent(e.description)}</div>` : ''}
        </div>`;
    }).join('');

    return `
        <div class="${classes.join(' ')}" data-msg-id="${escapeHtml(msg.id || '')}">
            <div class="tchat-avatar">${avatarHtml}</div>
            <div class="tchat-body">
                <div class="tchat-head">
                    <span class="${authorClasses.join(' ')}">${author}</span>
                    ${badges.join('')}
                    <span class="tchat-time">${escapeHtml(timeStr)}</span>
                </div>
                <div class="tchat-content">${content}</div>
                ${attachBlock}
                ${embedsHtml}
            </div>
        </div>`;
}

function formatChatContent(text) {
    if (!text) return '';
    let safe = escapeHtml(text);
    // <@userId> -> mention
    safe = safe.replace(/&lt;@!?(\d+)&gt;/g, '<span class="tchat-mention">@usuario</span>');
    safe = safe.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="tchat-mention">@rol</span>');
    safe = safe.replace(/&lt;#(\d+)&gt;/g, '<span class="tchat-mention">#canal</span>');
    // Custom emoji <:name:id> / <a:name:id>
    safe = safe.replace(/&lt;(a?):([a-zA-Z0-9_]+):(\d+)&gt;/g, (m, a, name) => `:${name}:`);
    // Inline code `...`
    safe = safe.replace(/`([^`\n]+)`/g, '<span class="tchat-code">$1</span>');
    // URLs
    safe = safe.replace(/\b(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
    return safe;
}

function formatChatTimeShort(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `hoy · ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return `ayer · ${time}`;
    return `${date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })} · ${time}`;
}

function formatChatDayLabel(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return 'Hoy';
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Ayer';
    return date.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

async function sendTicketChatMessage() {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    const channelId = _ticketChatState.channelId;
    const input = document.getElementById('ticketChatInput');
    const sendBtn = document.getElementById('ticketChatSendBtn');
    if (!guildId || !channelId || !input) return;

    const content = input.value.trim();
    if (!content) return;
    if (_ticketChatState.sending) return;

    _ticketChatState.sending = true;
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.classList.add('is-sending');
        sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.2-8.56"></path></svg><span>Enviando...</span>`;
    }
    setTicketChatStatus('');

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/tickets/active/${encodeURIComponent(channelId)}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content })
        });
        const data = await response.json();
        if (!response.ok || !data?.success) {
            throw new Error(data?.error || 'No se pudo enviar el mensaje');
        }

        input.value = '';
        autoResizeTicketChatInput();
        updateTicketChatCounter();

        // Agregar mensaje localmente y refrescar
        if (data.message && !_ticketChatState.messageIds.has(data.message.id)) {
            _ticketChatState.messages.push(data.message);
            _ticketChatState.messageIds.add(data.message.id);
            renderTicketChatMessages(_ticketChatState.messages);
            scrollTicketChatToBottom(true);
        }

        // Forzar un fetch para sincronizar con lo que haya
        setTimeout(() => fetchTicketChatMessages({ force: true }), 800);
    } catch (error) {
        console.error('Error enviando mensaje:', error);
        setTicketChatStatus(error.message || 'No se pudo enviar el mensaje.');
    } finally {
        _ticketChatState.sending = false;
        if (sendBtn) {
            sendBtn.classList.remove('is-sending');
            sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Enviar</span>`;
            sendBtn.disabled = !input.value.trim();
        }
        input.focus();
    }
}

async function acceptPendingTicket(requestId, button) {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    if (!guildId || !requestId) return;

    if (button) {
        button.disabled = true;
        button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="tm-spin"><path d="M21 12a9 9 0 1 1-6.2-8.56"></path></svg><span>Procesando...</span>';
    }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/tickets/pending/${encodeURIComponent(requestId)}/accept`, {
            method: 'POST'
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result?.success) {
            showToast(result?.error || 'No se pudo aceptar la solicitud', 'error');
            if (button) {
                button.disabled = false;
                button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Aceptar</span>';
            }
            return;
        }

        showToast(`Ticket aceptado: #${result.channelName || result.channelId}`, 'success');
        await loadTicketsManage({ force: true });
    } catch (error) {
        console.error('Error aceptando ticket:', error);
        showToast('Error de red al aceptar el ticket', 'error');
        if (button) button.disabled = false;
    }
}

async function claimTicket(channelId, button) {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    if (!guildId || !channelId) return;

    if (button) button.disabled = true;
    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/tickets/active/${encodeURIComponent(channelId)}/claim`, {
            method: 'POST'
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
            showToast(result?.error || 'No se pudo reclamar el ticket', 'error');
            if (button) button.disabled = false;
            return;
        }
        showToast('Ticket reclamado correctamente', 'success');
        await loadTicketsManage({ force: true });
    } catch (error) {
        console.error('Error reclamando ticket:', error);
        showToast('Error de red al reclamar el ticket', 'error');
        if (button) button.disabled = false;
    }
}

async function unclaimTicket(channelId, button) {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    if (!guildId || !channelId) return;

    if (button) button.disabled = true;
    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/tickets/active/${encodeURIComponent(channelId)}/unclaim`, {
            method: 'POST'
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
            showToast(result?.error || 'No se pudo liberar el ticket', 'error');
            if (button) button.disabled = false;
            return;
        }
        showToast('Ticket liberado', 'success');
        await loadTicketsManage({ force: true });
    } catch (error) {
        console.error('Error liberando ticket:', error);
        showToast('Error de red al liberar el ticket', 'error');
        if (button) button.disabled = false;
    }
}

async function deleteTicketHistoryReportFromPanel(reportId, button) {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    if (!guildId || !reportId) return;

    const okDelete = await showAppConfirm({
        title: 'Eliminar informe',
        message: `¿Eliminar el informe ${reportId} del historial?\n\nEsto borra el registro en la base de datos (no afecta al canal en Discord, ya cerrado).`,
        confirmLabel: 'Eliminar',
        variant: 'danger'
    });
    if (!okDelete) return;

    if (button) button.disabled = true;
    try {
        const response = await fetchWithCredentials(
            `/api/guild/${guildId}/tickets/reports/${encodeURIComponent(reportId)}`,
            { method: 'DELETE' }
        );
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success !== true) {
            showToast(result?.error || 'No se pudo eliminar el informe', 'error');
            if (button) button.disabled = false;
            return;
        }
        showToast('Informe eliminado del historial', 'success');
        if (_receiptModalState.reportId === reportId) {
            closeReceiptModal();
        }
        await loadTicketsManage({ force: true });
    } catch (error) {
        console.error('Error eliminando informe:', error);
        showToast('Error de red al eliminar el informe', 'error');
        if (button) button.disabled = false;
    }
}

async function closeActiveTicketFromPanel(channelId, button) {
    const guildId = _ticketsManageState.guildId || currentServerGuildId;
    if (!guildId || !channelId) return;

    const okClose = await showAppConfirm({
        title: 'Cerrar ticket',
        message: '¿Cerrar este ticket? Se generará el comprobante (historial / MD según configuración) y se eliminará el canal en Discord.',
        confirmLabel: 'Cerrar ticket',
        variant: 'warning'
    });
    if (!okClose) return;

    if (button) button.disabled = true;
    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/tickets/active/${encodeURIComponent(channelId)}/close`, {
            method: 'POST'
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
            showToast(result?.error || 'No se pudo cerrar el ticket', 'error');
            if (button) button.disabled = false;
            return;
        }
        const rid = result.reportId ? ` · ${result.reportId}` : '';
        showToast(`Ticket cerrado${rid}`, 'success');
        if (_ticketChatState.isOpen && String(_ticketChatState.channelId) === String(channelId)) {
            closeTicketChat();
        }
        await loadTicketsManage({ force: true });
    } catch (error) {
        console.error('Error cerrando ticket:', error);
        showToast('Error de red al cerrar el ticket', 'error');
        if (button) button.disabled = false;
    }
}

function formatRelativeTime(iso) {
    const t = new Date(iso || 0).getTime();
    if (!Number.isFinite(t) || t <= 0) return '—';
    const diff = Date.now() - t;
    const abs = Math.abs(diff);
    const mins = Math.round(abs / 60000);
    if (mins < 1) return 'hace un momento';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `hace ${days} d`;
    const months = Math.round(days / 30);
    if (months < 12) return `hace ${months} meses`;
    return new Date(t).toLocaleDateString('es-ES');
}

/* ---- Iconos SVG reutilizables (estilo Lucide) ---- */
function tmIconStack()     {
    const s = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M4 6l8-4 8 4-8 4-8-4z"></path><path d="M4 12l8 4 8-4"></path><path d="M4 18l8 4 8-4"></path></svg>`;
}
function tmIconActivity()  {
    const s = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 1 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 1 0 0-4V7z"></path><path d="M13 6v3"></path><path d="M13 13v3"></path></svg>`;
}
function tmIconHourglass() {
    const s = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M6 3h12"></path><path d="M6 21h12"></path><path d="M6 3v3.5A5 5 0 0 0 9 10.8L12 12l3-1.2A5 5 0 0 0 18 6.5V3"></path><path d="M6 21v-3.5a5 5 0 0 1 3-4.3L12 12l3 1.2a5 5 0 0 1 3 4.3V21"></path></svg>`;
}
function tmIconCheck()     {
    const s = 'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg viewBox="0 0 24 24" fill="none" ${s}><circle cx="12" cy="12" r="9"></circle><path d="M8 12.5l2.8 2.8L16 10"></path></svg>`;
}
function tmIconShield()    {
    const s = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M12 2l8 4v6c0 4.8-3.4 9-8 10-4.6-1-8-5.2-8-10V6l8-4z"></path><path d="M9 12l2.2 2.2L15 10.5"></path></svg>`;
}
function tmIconBell()      {
    const s = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8z"></path><path d="M10 21a2 2 0 0 0 4 0"></path><circle cx="18" cy="5" r="2.5" fill="currentColor" opacity="0.3"></circle></svg>`;
}
function tmIconSearch() {
    const s = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg viewBox="0 0 24 24" fill="none" ${s}><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>`;
}
function tmIconReset() {
    const s = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    return `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M4 7v4h4"></path><path d="M20 17v-4h-4"></path><path d="M5.6 9.4A7 7 0 0 1 18.4 14.6"></path><path d="M18.4 14.6A7 7 0 0 1 5.6 9.4"></path></svg>`;
}
function tmHistoryScopeIcon(scopeId = 'all') {
    const s = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
    const icons = {
        all: `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M4 6h7"></path><path d="M4 12h16"></path><path d="M4 18h11"></path><circle cx="18" cy="6" r="2"></circle><circle cx="20" cy="18" r="2"></circle></svg>`,
        user: `<svg viewBox="0 0 24 24" fill="none" ${s}><circle cx="12" cy="8" r="4"></circle><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"></path></svg>`,
        staff: `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M12 2l8 4v6c0 4.8-3.4 9-8 10-4.6-1-8-5.2-8-10V6l8-4z"></path><path d="M9 12l2.2 2.2L15 10.5"></path></svg>`,
        report: `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M8 13h8"></path><path d="M8 17h8"></path><path d="M8 9h3"></path></svg>`,
        channel: `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 1 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 1 0 0-4V7z"></path><path d="M13 6v3"></path><path d="M13 13v3"></path></svg>`,
        category: `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M4 7h16"></path><path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"></path><path d="M9 11h6"></path><path d="M9 15h4"></path></svg>`,
        reason: `<svg viewBox="0 0 24 24" fill="none" ${s}><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path></svg>`
    };
    return icons[scopeId] || icons.all;
}

// ============================================================
// FREE GAMES (Epic Games / Steam) — dashboard
// ============================================================
const _freeGamesState = {
    guildId: null,
    config: null,
    games: [],
    channels: [],
    fetchedAt: null,
    loadingPreview: false,
    activeTab: 'catalog',
    searchQuery: ''
};

async function openFreeGamesPane() {
    syncPremiumPaneLock('serverPaneFreeGames');
    if (!hasPremiumAccess()) {
        enforceAllPremiumLocks();
        return;
    }

    const guildId = currentServerGuildId;
    if (!guildId) return;
    _freeGamesState.guildId = guildId;

    const container = document.getElementById('freeGamesContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="loading" style="padding:3rem;text-align:center;">
            <div class="loading-spinner"></div>
            <p>Cargando configuración y juegos gratis...</p>
        </div>`;

    try {
        const [cfgResp, chanResp] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/free-games/config`),
            fetchWithCredentials(`/api/guild/${guildId}/channels`)
        ]);
        if (cfgResp.status === 402) {
            enforceAllPremiumLocks();
            return;
        }
        const cfg = await cfgResp.json();
        const channels = await chanResp.json();
        _freeGamesState.config = cfg;
        _freeGamesState.channels = Array.isArray(channels) ? channels.filter((c) => c.type === 0) : [];
        renderFreeGamesPane();
        // Carga de juegos en paralelo
        fetchFreeGamesPreview().catch(() => null);
    } catch (error) {
        console.error('Error cargando panel de juegos gratis:', error);
        container.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--error-color);"><p>Error al cargar: ${escapeHtml(error.message || '')}</p></div>`;
    }
}

function getFreeGamesStats() {
    const games = _freeGamesState.games || [];
    const epic = games.filter((g) => g.source === 'epic' && !g.isUpcoming).length;
    const steam = games.filter((g) => g.source === 'steam' && !g.isUpcoming).length;
    const upcoming = games.filter((g) => g.isUpcoming).length;
    return { total: games.length, epic, steam, upcoming };
}

function renderFreeGamesPane() {
    const container = document.getElementById('freeGamesContainer');
    if (!container) return;
    const cfg = _freeGamesState.config || {};
    const channels = _freeGamesState.channels || [];
    const stats = getFreeGamesStats();
    const tab = _freeGamesState.activeTab || 'catalog';

    const channelOptions = channels
        .map((c) => `<option value="${c.id}" ${c.id === cfg.channelId ? 'selected' : ''}>#${escapeHtml(c.name)}</option>`)
        .join('');

    const color = String(cfg.color || '4ccb81').replace('#', '');
    const channelLabel = cfg.channelId
        ? (channels.find((c) => c.id === cfg.channelId)?.name ? `#${channels.find((c) => c.id === cfg.channelId).name}` : 'Canal configurado')
        : 'Sin canal';

    const freeGamesHeroHtml = dpxRenderHero({
        kicker: 'Promociones',
        title: 'Juegos gratis',
        description: 'Avisos automáticos de Epic Games y Steam con embed enriquecido, enlaces corregidos y herramientas para actualizar mensajes ya publicados.',
        accent: '#7ef0b4',
        glow1: 'rgba(80,230,160,0.18)',
        glow2: 'rgba(124,77,255,0.18)',
        iconName: 'leaf',
        actionsHtml: `
            <span class="dpx-status-chip ${cfg.enabled ? 'is-on' : 'is-off'}"><span class="dot"></span>${cfg.enabled ? 'Activo' : 'Desactivado'}</span>
            <span class="fg-studio-channel-pill">${escapeHtml(channelLabel)}</span>`
    });

    container.innerHTML = `
        <div class="dpx-panel fg-studio">
            ${freeGamesHeroHtml}

            <div class="fg-studio-stats">
                <div class="fg-studio-stat">
                    <span class="fg-studio-stat-value">${stats.total}</span>
                    <span class="fg-studio-stat-label">En catálogo</span>
                </div>
                <div class="fg-studio-stat is-epic">
                    <span class="fg-studio-stat-value">${stats.epic}</span>
                    <span class="fg-studio-stat-label">Epic Games</span>
                </div>
                <div class="fg-studio-stat is-steam">
                    <span class="fg-studio-stat-value">${stats.steam}</span>
                    <span class="fg-studio-stat-label">Steam</span>
                </div>
                <div class="fg-studio-stat is-muted">
                    <span class="fg-studio-stat-value">${stats.upcoming}</span>
                    <span class="fg-studio-stat-label">Próximamente</span>
                </div>
            </div>

            <nav class="fg-studio-tabs" aria-label="Secciones juegos gratis">
                <button type="button" class="fg-studio-tab ${tab === 'catalog' ? 'is-active' : ''}" data-fg-tab="catalog">Catálogo en vivo</button>
                <button type="button" class="fg-studio-tab ${tab === 'settings' ? 'is-active' : ''}" data-fg-tab="settings">Configuración</button>
            </nav>

            <section class="fg-studio-panel ${tab === 'catalog' ? '' : 'is-hidden'}" id="fgTabCatalog" aria-labelledby="fg-tab-catalog">
                <div class="fg-studio-toolbar">
                    <div class="fg-studio-search-wrap">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3-3"/></svg>
                        <input type="search" id="fgSearch" class="form-control" placeholder="Buscar juego, editor o tienda…" value="${escapeHtml(_freeGamesState.searchQuery || '')}">
                    </div>
                    <div class="fg-studio-toolbar-actions">
                        <button type="button" id="fgRefreshBtn" class="btn btn-ghost btn-sm" title="Sincronizar catálogo">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/><path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14"/></svg>
                            <span>Sincronizar</span>
                        </button>
                        <button type="button" id="fgUpdateEmbedsBtn" class="btn btn-primary btn-sm" title="Editar embeds ya enviados en el canal">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                            <span>Actualizar embeds</span>
                        </button>
                    </div>
                </div>
                <p class="fg-studio-hint">Vista previa del embed que envía el bot. Usa <strong>Actualizar embeds</strong> para corregir enlaces y datos en mensajes ya publicados (últimos 100 del canal).</p>
                <div id="fgGamesList" class="fg-games-list fg-studio-grid">
                    <div class="fg-loading">
                        <div class="loading-spinner"></div>
                        <p>Buscando juegos gratis...</p>
                    </div>
                </div>
            </section>

            <section class="fg-studio-panel ${tab === 'settings' ? '' : 'is-hidden'}" id="fgTabSettings">
                <div class="fg-layout fg-layout--settings">
                    <div class="fg-config">
                        <div class="fg-section">
                            <h4 class="fg-section-title"><span class="fg-dot"></span> Publicación automática</h4>

                            <div class="form-group fg-enable-block">
                                <label class="fg-switch-label">
                                    <span class="fg-switch" aria-hidden="true"><span class="fg-switch-knob"></span></span>
                                    <span class="fg-switch-copy">
                                        <span id="fgEnabledBadge" class="fg-status-badge ${cfg.enabled ? 'is-on' : 'is-off'}">${cfg.enabled ? 'Activado' : 'Desactivado'}</span>
                                        <span class="fg-switch-title" id="fgSwitchTitle">Enviar avisos automáticos</span>
                                        <span class="fg-switch-hint">Cada ~30 min el bot busca juegos al 100% de descuento y publica en el canal elegido.</span>
                                    </span>
                                    <input type="checkbox" id="fgEnabled" class="fg-switch-input" role="switch" ${cfg.enabled ? 'checked' : ''}>
                                </label>
                            </div>

                            <div class="form-group">
                                <label for="fgChannel">Canal de notificaciones</label>
                                <select id="fgChannel" class="form-control">
                                    <option value="">— Selecciona un canal —</option>
                                    ${channelOptions}
                                </select>
                            </div>

                            <div class="form-group">
                                <label for="fgMention">Mención opcional</label>
                                <input type="text" id="fgMention" class="form-control" placeholder="@everyone, <@&ROL_ID>"
                                    value="${escapeHtml(cfg.mentionText || '')}" maxlength="300">
                            </div>

                            <div class="form-group">
                                <label>Plataformas</label>
                                <div class="fg-sources">
                                    <label class="fg-source-chip epic ${cfg.sources?.epic !== false ? 'is-active' : ''}">
                                        <input type="checkbox" id="fgEpic" ${cfg.sources?.epic !== false ? 'checked' : ''}>
                                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16v14l-8 5-8-5V3z"/></svg>
                                        <span>Epic Games</span>
                                    </label>
                                    <label class="fg-source-chip steam ${cfg.sources?.steam !== false ? 'is-active' : ''}">
                                        <input type="checkbox" id="fgSteam" ${cfg.sources?.steam !== false ? 'checked' : ''}>
                                        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill-opacity="0.15"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="16" cy="9" r="3" fill="currentColor"/><circle cx="9" cy="15" r="2" fill="currentColor"/></svg>
                                        <span>Steam</span>
                                    </label>
                                </div>
                            </div>

                            <div class="form-row">
                                <div class="form-group" style="flex:1;">
                                    <label for="fgColor">Color del embed</label>
                                    <div class="fg-color-picker">
                                        <input type="color" id="fgColor" value="#${color}">
                                        <input type="text" id="fgColorHex" class="form-control" value="#${color}" maxlength="7">
                                    </div>
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label for="fgFooter">Footer del embed</label>
                                    <input type="text" id="fgFooter" class="form-control"
                                        value="${escapeHtml(cfg.footerText || 'EyedBot · Juegos gratis')}" maxlength="200">
                                </div>
                            </div>

                            <div class="fg-actions">
                                <button type="button" id="fgSaveBtn" class="btn btn-primary">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                                    <span>Guardar</span>
                                </button>
                                <button type="button" id="fgTestBtn" class="btn btn-ghost">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                                    <span>Enviar prueba</span>
                                </button>
                                <button type="button" id="fgUpdateEmbedsBtnSettings" class="btn btn-ghost">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                                    <span>Actualizar embeds</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="fg-info-card fg-info-card--stack">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                        <div>
                            <strong>Actualizar embeds</strong>
                            <p>Busca en el canal los mensajes del bot con avisos de juegos gratis y los edita con precios, imágenes y enlaces actuales (útil si Epic cambió URLs).</p>
                        </div>
                        <div>
                            <strong>Permisos necesarios</strong>
                            <p>El bot necesita ver el canal, enviar mensajes, insertar enlaces y leer historial de mensajes.</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    `;

    wireFreeGamesControls();
    if (_freeGamesState.games?.length) {
        renderFreeGamesList();
        updateFreeGamesStatsUi();
    }
}

function updateFreeGamesStatsUi() {
    const stats = getFreeGamesStats();
    const root = document.querySelector('.fg-studio-stats');
    if (!root) return;
    const vals = root.querySelectorAll('.fg-studio-stat-value');
    if (vals.length >= 4) {
        vals[0].textContent = String(stats.total);
        vals[1].textContent = String(stats.epic);
        vals[2].textContent = String(stats.steam);
        vals[3].textContent = String(stats.upcoming);
    }
}

function wireFreeGamesControls() {
    const saveBtn = document.getElementById('fgSaveBtn');
    const testBtn = document.getElementById('fgTestBtn');
    const refreshBtn = document.getElementById('fgRefreshBtn');
    const updateEmbedsBtn = document.getElementById('fgUpdateEmbedsBtn');
    const updateEmbedsBtnSettings = document.getElementById('fgUpdateEmbedsBtnSettings');
    const searchInput = document.getElementById('fgSearch');
    const colorInput = document.getElementById('fgColor');
    const colorHex = document.getElementById('fgColorHex');
    const epicChk = document.getElementById('fgEpic');
    const steamChk = document.getElementById('fgSteam');

    document.querySelectorAll('.fg-studio-tab').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
            _freeGamesState.activeTab = tabBtn.dataset.fgTab || 'catalog';
            renderFreeGamesPane();
        });
    });

    if (saveBtn) saveBtn.addEventListener('click', saveFreeGamesConfig);
    if (testBtn) testBtn.addEventListener('click', sendFreeGamesTest);
    if (refreshBtn) refreshBtn.addEventListener('click', () => fetchFreeGamesPreview(true));
    if (updateEmbedsBtn) updateEmbedsBtn.addEventListener('click', refreshFreeGamesEmbeds);
    if (updateEmbedsBtnSettings) updateEmbedsBtnSettings.addEventListener('click', refreshFreeGamesEmbeds);

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            _freeGamesState.searchQuery = String(searchInput.value || '').trim().toLowerCase();
            renderFreeGamesList();
        });
    }

    if (colorInput && colorHex) {
        colorInput.addEventListener('input', () => { colorHex.value = colorInput.value; });
        colorHex.addEventListener('change', () => {
            const v = String(colorHex.value || '').replace('#', '').slice(0, 6);
            if (/^[0-9a-fA-F]{6}$/.test(v)) colorInput.value = `#${v}`;
        });
    }

    [epicChk, steamChk].forEach((chk) => {
        if (!chk) return;
        chk.addEventListener('change', () => {
            const wrap = chk.closest('.fg-source-chip');
            if (wrap) wrap.classList.toggle('is-active', chk.checked);
            fetchFreeGamesPreview(true);
        });
    });

    const fgEnabled = document.getElementById('fgEnabled');
    const fgBadge = document.getElementById('fgEnabledBadge');
    const syncFgEnabledUi = () => {
        const on = !!fgEnabled?.checked;
        if (fgBadge) {
            fgBadge.textContent = on ? 'Activado' : 'Desactivado';
            fgBadge.classList.toggle('is-on', on);
            fgBadge.classList.toggle('is-off', !on);
        }
        fgEnabled?.setAttribute('aria-checked', on ? 'true' : 'false');
    };
    if (fgEnabled) {
        fgEnabled.addEventListener('change', syncFgEnabledUi);
        syncFgEnabledUi();
    }
}

function collectFreeGamesInput() {
    const enabled = !!document.getElementById('fgEnabled')?.checked;
    const channelId = String(document.getElementById('fgChannel')?.value || '').trim();
    const mentionText = String(document.getElementById('fgMention')?.value || '').trim();
    const epic = !!document.getElementById('fgEpic')?.checked;
    const steam = !!document.getElementById('fgSteam')?.checked;
    const colorHex = String(document.getElementById('fgColorHex')?.value || '4ccb81').replace('#', '');
    const footerText = String(document.getElementById('fgFooter')?.value || 'EyedBot · Juegos gratis').trim();

    return {
        enabled,
        channelId,
        mentionText,
        sources: { epic, steam },
        color: colorHex,
        footerText
    };
}

async function saveFreeGamesConfig() {
    if (!hasPremiumAccess()) {
        enforceAllPremiumLocks();
        return;
    }
    const guildId = _freeGamesState.guildId;
    if (!guildId) return;
    const body = collectFreeGamesInput();

    if (body.enabled && !body.channelId) {
        showToast('Selecciona un canal antes de activar las notificaciones', 'error');
        return;
    }

    const btn = document.getElementById('fgSaveBtn');
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/free-games/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok || !data?.success) throw new Error(data?.error || 'No se pudo guardar');
        _freeGamesState.config = data.config;
        showToast('Configuración de juegos gratis guardada', 'success');
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Error al guardar', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    }
}

async function refreshFreeGamesEmbeds() {
    if (!hasPremiumAccess()) {
        enforceAllPremiumLocks();
        return;
    }
    const guildId = _freeGamesState.guildId;
    if (!guildId) return;
    const body = collectFreeGamesInput();

    if (!body.channelId) {
        showToast('Selecciona un canal de notificaciones primero', 'error');
        _freeGamesState.activeTab = 'settings';
        renderFreeGamesPane();
        return;
    }

    const confirmed = await showAppConfirm({
        title: 'Actualizar embeds en el canal',
        message: 'Se editarán los mensajes del bot con avisos de juegos gratis (hasta los últimos 100) usando datos y enlaces actuales. ¿Continuar?',
        confirmLabel: 'Actualizar',
        cancelLabel: 'Cancelar'
    });
    if (!confirmed) return;

    const btnIds = ['fgUpdateEmbedsBtn', 'fgUpdateEmbedsBtnSettings'];
    btnIds.forEach((id) => {
        const btn = document.getElementById(id);
        if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
    });

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/free-games/refresh-embeds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok || !data?.success) throw new Error(data?.error || 'No se pudieron actualizar');

        if (data.config) _freeGamesState.config = data.config;

        const msg = data.updated > 0
            ? `${data.updated} embed(s) actualizado(s)${data.failed ? ` · ${data.failed} error(es)` : ''}`
            : 'No se encontraron embeds del bot para actualizar en ese canal';
        showToast(msg, data.updated > 0 ? 'success' : 'warning');

        await fetchFreeGamesPreview(true);
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Error al actualizar embeds', 'error');
    } finally {
        btnIds.forEach((id) => {
            const btn = document.getElementById(id);
            if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
        });
    }
}

async function sendFreeGamesTest() {
    if (!hasPremiumAccess()) {
        enforceAllPremiumLocks();
        return;
    }
    const guildId = _freeGamesState.guildId;
    if (!guildId) return;
    const body = collectFreeGamesInput();

    if (!body.channelId) {
        showToast('Selecciona un canal primero', 'error');
        return;
    }

    const btn = document.getElementById('fgTestBtn');
    if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/free-games/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok || !data?.success) throw new Error(data?.error || 'No se pudo enviar');
        showToast('Prueba enviada al canal', 'success');
    } catch (error) {
        console.error(error);
        showToast(error.message || 'Error al enviar prueba', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
    }
}

async function fetchFreeGamesPreview(force = false) {
    if (!hasPremiumAccess()) {
        enforceAllPremiumLocks();
        return;
    }
    const guildId = _freeGamesState.guildId;
    const list = document.getElementById('fgGamesList');
    if (!guildId || !list) return;

    if (_freeGamesState.loadingPreview) return;
    _freeGamesState.loadingPreview = true;

    if (force) {
        list.innerHTML = `
            <div class="fg-loading">
                <div class="loading-spinner"></div>
                <p>Buscando juegos gratis...</p>
            </div>`;
    }

    const epic = !!document.getElementById('fgEpic')?.checked;
    const steam = !!document.getElementById('fgSteam')?.checked;

    try {
        const qs = new URLSearchParams({
            epic: epic ? '1' : '0',
            steam: steam ? '1' : '0',
            force: force ? '1' : '0'
        }).toString();
        const response = await fetchWithCredentials(`/api/guild/${guildId}/free-games/preview?${qs}`);
        if (response.status === 402) {
            enforceAllPremiumLocks();
            return;
        }
        const data = await response.json();
        if (!response.ok || !data?.success) throw new Error(data?.error || 'Error al cargar juegos');
        _freeGamesState.games = data.games || [];
        _freeGamesState.fetchedAt = data.fetchedAt;
        renderFreeGamesList();
        updateFreeGamesStatsUi();
    } catch (error) {
        console.error('Error cargando juegos gratis:', error);
        list.innerHTML = `
            <div class="fg-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <strong>No se pudieron cargar los juegos</strong>
                <p>${escapeHtml(error.message || 'Intenta de nuevo en unos instantes.')}</p>
            </div>`;
    } finally {
        _freeGamesState.loadingPreview = false;
    }
}

function filterFreeGamesList(games) {
    const q = String(_freeGamesState.searchQuery || '').trim().toLowerCase();
    if (!q) return games;
    return games.filter((g) => {
        const hay = `${g.title || ''} ${g.publisher || ''} ${g.sourceLabel || ''} ${g.source || ''}`.toLowerCase();
        return hay.includes(q);
    });
}

function renderFreeGamesList() {
    const list = document.getElementById('fgGamesList');
    if (!list) return;

    const games = filterFreeGamesList(_freeGamesState.games || []);
    if (!games.length) {
        list.innerHTML = `
            <div class="fg-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                <strong>${(_freeGamesState.games || []).length ? 'Ningún resultado' : 'No hay juegos gratis ahora mismo'}</strong>
                <p>${(_freeGamesState.games || []).length ? 'Prueba otra búsqueda o sincroniza de nuevo.' : 'Revisaremos Epic Games y Steam cada 30 minutos y avisaremos en el canal configurado.'}</p>
            </div>`;
        return;
    }

    list.innerHTML = games.map(renderFreeGameCard).join('');

    // Footer con timestamp de actualización
    if (_freeGamesState.fetchedAt) {
        const date = new Date(_freeGamesState.fetchedAt);
        const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        list.insertAdjacentHTML('beforeend', `
            <div class="fg-updated">Actualizado a las ${escapeHtml(timeStr)}</div>
        `);
    }
}

function renderFreeGameDiscordPreview(game, cfg) {
    const colorHex = String(cfg?.color || (game.source === 'epic' ? '2b90d9' : '4ccb81')).replace('#', '');
    const priceLine = game.originalPriceMinor > 0
        ? `~~${escapeHtml(game.originalPrice)}~~ → **GRATIS**`
        : '**GRATIS**';
    return `
        <div class="fg-discord-preview">
            <div class="fg-discord-preview-bar" style="background:#${escapeHtml(colorHex)}"></div>
            <div class="fg-discord-preview-body">
                <div class="fg-discord-preview-author">${escapeHtml(game.sourceLabel || '')}</div>
                <div class="fg-discord-preview-title">🎮 ${escapeHtml(game.title || '')}</div>
                <div class="fg-discord-preview-fields">
                    <span><b>Precio</b> ${priceLine}</span>
                    <span><b>Descuento</b> ${Number(game.discountPercent || 100)}%</span>
                </div>
                <div class="fg-discord-preview-link">Reclamar gratis →</div>
                <div class="fg-discord-preview-footer">${escapeHtml(cfg?.footerText || 'EyedBot · Juegos gratis')}</div>
            </div>
        </div>`;
}

function renderFreeGameCard(game) {
    const sourceClass = game.source === 'epic' ? 'epic' : 'steam';
    const tags = Array.isArray(game.tags) ? game.tags.slice(0, 3) : [];
    const cfg = _freeGamesState.config || {};
    const embedPreview = renderFreeGameDiscordPreview(game, cfg);

    const countdownHtml = game.endsAt
        ? renderFreeGameCountdown(game)
        : (game.source === 'steam'
            ? '<span class="fg-meta-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>Tiempo limitado</span>'
            : '');

    const priceHtml = game.originalPriceMinor > 0
        ? `<span class="fg-price-old">${escapeHtml(game.originalPrice)}</span><span class="fg-price-new">GRATIS</span>`
        : `<span class="fg-price-new">GRATIS</span>`;

    const upcomingBadge = game.isUpcoming
        ? '<span class="fg-badge fg-badge-upcoming">Próximamente</span>'
        : '<span class="fg-badge fg-badge-live">● Disponible</span>';

    return `
        <article class="fg-card fg-card--${sourceClass}">
            <div class="fg-card-media">
                ${game.imageUrl
                    ? `<img src="${escapeHtml(game.imageUrl)}" alt="${escapeHtml(game.title)}" loading="lazy">`
                    : '<div class="fg-card-media-fallback"></div>'}
                <div class="fg-card-source fg-card-source--${sourceClass}">
                    ${game.source === 'epic'
                        ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3h16v14l-8 5-8-5V3z"/></svg>'
                        : '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" fill-opacity="0.15"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="16" cy="9" r="3" fill="currentColor"/></svg>'}
                    <span>${escapeHtml(game.sourceLabel || '')}</span>
                </div>
                <div class="fg-card-discount">-${Number(game.discountPercent || 100)}%</div>
            </div>

            <div class="fg-card-body">
                <div class="fg-card-header">
                    <h5 class="fg-card-title">${escapeHtml(game.title || '')}</h5>
                    ${upcomingBadge}
                </div>
                ${game.description ? `<p class="fg-card-desc">${escapeHtml(game.description).slice(0, 180)}${game.description.length > 180 ? '…' : ''}</p>` : ''}

                <div class="fg-card-price">
                    ${priceHtml}
                </div>

                <div class="fg-card-meta">
                    ${countdownHtml}
                    ${game.publisher ? `<span class="fg-meta-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l7-4 7 4v14"></path><path d="M9 9h1M9 13h1M14 9h1M14 13h1M9 17h6"></path></svg>${escapeHtml(game.publisher)}</span>` : ''}
                </div>

                ${tags.length ? `<div class="fg-card-tags">${tags.map((t) => `<span class="fg-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}

                ${embedPreview}

                <a class="fg-card-cta" href="${escapeHtml(game.storeUrl || '#')}" target="_blank" rel="noopener">
                    <span>Reclamar gratis</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"></path><polyline points="7 7 17 7 17 17"></polyline></svg>
                </a>
            </div>
        </article>
    `;
}

function renderFreeGameCountdown(game) {
    if (!game.endsAt) return '';
    const end = new Date(game.endsAt);
    if (Number.isNaN(end.getTime())) return '';
    const ms = end.getTime() - Date.now();
    if (ms <= 0) return '<span class="fg-meta-chip is-expired">Finalizado</span>';
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const mins = totalMinutes % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (days === 0 && mins > 0) parts.push(`${mins}m`);
    const label = parts.join(' ') || '<1m';
    const urgent = ms < 86400000; // <1 dia
    return `<span class="fg-meta-chip ${urgent ? 'is-urgent' : ''}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>
        ${game.isUpcoming ? 'Empieza en ' : 'Quedan '}${label}
    </span>`;
}

// ============================================================
// GENERADOR DE CANALES (plantillas Discord)
// ============================================================

const _channelSetupState = { guildId: '', data: null };

function chsPreviewBlocks(data, templateId) {
    const pack = data?.conflictsByTemplate?.[templateId];
    if (!pack || pack.error) {
        return {
            conflictBanner: pack?.error
                ? `<div class="chs-banner chs-banner--err">${escapeHtml(pack.error)}</div>`
                : '',
            tree: '<p class="chs-muted">Sin vista previa.</p>'
        };
    }

    const conflicts = pack.conflicts || [];
    const preview = pack.preview || [];

    const conflictBanner = conflicts.length
        ? `<div class="chs-banner chs-banner--warn"><strong>${conflicts.length} elemento(s)</strong> ya existen con el mismo nombre bajo la categoría equivalente. Se <strong>omitirán</strong> si «No crear duplicados» está activado.</div>`
        : `<div class="chs-banner chs-banner--ok">No hay coincidencias detectadas: se crearán todos los canales nuevos.</div>`;

    const byCat = {};
    preview.forEach((row) => {
        const key = row.categoryLabel || row.categorySlug || '—';
        if (!byCat[key]) byCat[key] = [];
        byCat[key].push(row);
    });

    const tree = Object.keys(byCat).length === 0
        ? '<p class="chs-muted">Esta plantilla no define canales.</p>'
        : Object.entries(byCat).map(([cat, rows]) => `
            <div class="chs-tree-cat">
                <div class="chs-tree-cat-head">${escapeHtml(cat)}</div>
                <ul class="chs-tree-ul">
                    ${rows.map((r) => `
                        <li>
                            <span class="chs-pill chs-pill--${r.type === 'voice' ? 'voice' : 'text'}">${r.type === 'voice' ? 'Voz' : 'Texto'}</span>
                            <span class="chs-tree-name">${escapeHtml(r.channelLabel)}</span>
                            ${r.topic ? `<span class="chs-tree-topic">${escapeHtml(r.topic.slice(0, 120))}${r.topic.length > 120 ? '…' : ''}</span>` : ''}
                        </li>
                    `).join('')}
                </ul>
            </div>
        `).join('');

    return { conflictBanner, tree };
}

function wireChannelSetupInteractions(guildId) {
    const select = document.getElementById('chsTemplateSelect');
    const skipDup = document.getElementById('chsSkipDup');
    const applyBtn = document.getElementById('chsApplyBtn');
    const reloadBtn = document.getElementById('chsReloadBtn');

    if (select) {
        select.addEventListener('change', () => {
            const id = select.value || 'standard';
            const { conflictBanner, tree } = chsPreviewBlocks(_channelSetupState.data, id);
            const cSlot = document.getElementById('chsConflictSlot');
            const pSlot = document.getElementById('chsPreviewSlot');
            if (cSlot) cSlot.innerHTML = conflictBanner;
            if (pSlot) pSlot.innerHTML = tree;
        });
    }

    if (skipDup) {
        skipDup.addEventListener('change', () => null);
    }

    if (applyBtn) {
        applyBtn.addEventListener('click', () => applyChannelSetupGenerate(guildId));
    }

    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => openChannelSetupPane());
    }
}

function renderChannelSetupPane() {
    const container = document.getElementById('channelSetupContainer');
    const data = _channelSetupState.data;
    const guildId = _channelSetupState.guildId;
    if (!container || !data || !guildId) return;

    const templates = data.templates || [];
    const defaultTpl = templates[0]?.id || 'standard';

    const templateOptions = templates.map((t) => `
        <option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>
    `).join('');

    const tplMeta = templates.find((t) => t.id === defaultTpl);
    const desc = tplMeta?.description || '';

    const { conflictBanner, tree } = chsPreviewBlocks(data, defaultTpl);

    container.innerHTML = `
        <h3 class="welcome-panel-title">Generador de estructura</h3>
        <p class="welcome-panel-subtitle">${escapeHtml(desc)} Requiere que el bot tenga <strong>Gestionar canales</strong>. No borra canales existentes.</p>

        <div class="chs-layout">
            <div class="chs-main fg-section">
                <h4 class="fg-section-title"><span class="fg-dot"></span> Opciones</h4>
                <div class="form-group">
                    <label for="chsTemplateSelect">Plantilla</label>
                    <select id="chsTemplateSelect" class="form-control">${templateOptions}</select>
                </div>
                <div class="form-group checkbox-group">
                    <label>
                        <input type="checkbox" id="chsSkipDup" checked>
                        <span>No crear duplicados (omitir nombre ya existente en la misma categoría)</span>
                    </label>
                </div>
                <div class="chs-actions">
                    <button type="button" id="chsApplyBtn" class="btn btn-primary">Crear categorías y canales</button>
                    <button type="button" id="chsReloadBtn" class="btn btn-secondary">Actualizar vista previa</button>
                </div>
                <p class="chs-footnote">Los nombres se adaptan al formato de Discord (minúsculas y guiones). Tras crear canales, revisa permisos y orden en la configuración del servidor.</p>
            </div>

            <aside class="chs-aside fg-section">
                <h4 class="fg-section-title"><span class="fg-dot fg-dot-live"></span> Vista previa</h4>
                <div id="chsConflictSlot">${conflictBanner}</div>
                <div id="chsPreviewSlot" class="chs-preview-slot">${tree}</div>
            </aside>
        </div>
    `;

    wireChannelSetupInteractions(guildId);
}

async function openChannelSetupPane() {
    const guildId = currentServerGuildId;
    const container = document.getElementById('channelSetupContainer');
    if (!container) return;

    if (!guildId) {
        container.innerHTML = '<div class="chs-empty"><p>Selecciona un servidor en el panel para usar el generador.</p></div>';
        return;
    }

    const myGen = ++channelSetupFetchGeneration;
    container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando plantillas...</p></div>';

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/channel-setup`);
        const payload = await response.json().catch(() => ({}));
        if (myGen !== channelSetupFetchGeneration) return;
        if (!response.ok) {
            container.innerHTML = `<div class="chs-empty chs-error"><p>${escapeHtml(payload.error || 'No se pudo cargar')}</p></div>`;
            return;
        }
        _channelSetupState.guildId = guildId;
        _channelSetupState.data = payload;
        if (myGen !== channelSetupFetchGeneration) return;
        renderChannelSetupPane();
    } catch (error) {
        if (myGen !== channelSetupFetchGeneration) return;
        console.error('openChannelSetupPane:', error);
        container.innerHTML = `<div class="chs-empty chs-error"><p>${escapeHtml(error.message || 'Error de red')}</p></div>`;
    }
}

async function applyChannelSetupGenerate(guildId) {
    const templateId = document.getElementById('chsTemplateSelect')?.value || 'standard';
    const skipExisting = document.getElementById('chsSkipDup')?.checked !== false;

    const confirmMsg = '¿Crear en este servidor las categorías y canales de la plantilla?\n\n'
        + 'No se eliminará ningún canal existente.'
        + (skipExisting ? '\nLos duplicados detectados se omitirán.' : '\nSi ya existe un canal con el mismo nombre, Discord puede rechazar la creación.');

    const okApply = await showAppConfirm({
        title: 'Crear canales',
        message: confirmMsg,
        confirmLabel: 'Crear canales'
    });
    if (!okApply) return;

    const btn = document.getElementById('chsApplyBtn');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('is-loading');
    }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/channel-setup/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ templateId, skipExisting })
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            showToast(payload.error || 'No se pudo aplicar la plantilla', 'error');
            return;
        }

        const createdN = payload.created?.length || 0;
        const skippedN = payload.skipped?.length || 0;
        showToast(`Listo: ${createdN} elemento(s) creados · ${skippedN} omitido(s).`, 'success');

        if (Array.isArray(payload.errors) && payload.errors.length) {
            showToast(payload.errors.map((e) => e.message || e.name || 'Error').slice(0, 3).join(' · '), 'warning');
        }

        await openChannelSetupPane();
    } catch (error) {
        console.error('applyChannelSetupGenerate:', error);
        showToast(error.message || 'Error al crear canales', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('is-loading');
        }
    }
}

function getDashboardUserAvatarUrl() {
    if (!currentUser?.id) return '';
    if (currentUser.avatar) {
        const ext = String(currentUser.avatar).startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.${ext}?size=256`;
    }
    const mod = Number((BigInt(currentUser.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${mod}.png`;
}

function openWelcomeCardStudio(guildId) {
    if (typeof window.WelcomeCardStudio?.open !== 'function') {
        showToast('Recarga la página para cargar el editor visual.', 'warning');
        return;
    }
    const cardRadio = document.querySelector('input[name="welcomeStyle"][value="card"]');
    if (cardRadio && !cardRadio.checked) {
        cardRadio.checked = true;
        syncWelcomeStyleUI(guildId);
    }
    saveCurrentGreetingDraft();
    currentWelcomeConfig = { ...(currentWelcomeConfig || {}) };
    window.WelcomeCardStudio.open({
        guildId,
        getWelcomeConfig: () => currentWelcomeConfig,
        applyCardLayout: (L) => {
            currentWelcomeConfig = { ...currentWelcomeConfig, cardLayout: { ...L } };
        },
        getBgUrl: () => welcomeImagePreviewUrl || document.getElementById('welcomeImageUrl')?.value || '',
        getAvatarUrl: () => getDashboardUserAvatarUrl(),
        processAndUploadBackground: (file) => processAndUploadWelcomeStudioBackground(guildId, file),
        onBackgroundUploaded: () => updateWelcomePreviewPanel(guildId),
        getRawCardTexts: () => {
            const cfg = collectWelcomeConfigFromForm();
            return {
                title: String(cfg.title != null ? cfg.title : ''),
                cardNameTemplate: String(cfg.cardNameTemplate != null ? cfg.cardNameTemplate : '{username}').trim() || '{username}',
                message: String(cfg.message != null ? cfg.message : ''),
                cardOverlayText: String(cfg.cardOverlayText != null ? cfg.cardOverlayText : '')
            };
        },
        onCardTextsUpdated: (raw) => {
            const titleEl = document.getElementById('welcomeTitle');
            const msgEl = document.getElementById('welcomeMessage');
            const nameLineEl = document.getElementById('welcomeCardNameLine');
            const overlayEl = document.getElementById('welcomeCardOverlay');
            if (titleEl && raw.title != null) titleEl.value = raw.title;
            if (msgEl && raw.message != null) msgEl.value = raw.message;
            if (nameLineEl && raw.cardNameTemplate != null) nameLineEl.value = raw.cardNameTemplate;
            if (overlayEl && raw.cardOverlayText != null) overlayEl.value = raw.cardOverlayText;
            currentWelcomeConfig = {
                ...currentWelcomeConfig,
                title: raw.title != null ? String(raw.title) : currentWelcomeConfig.title,
                message: raw.message != null ? String(raw.message) : currentWelcomeConfig.message,
                cardNameTemplate:
                    raw.cardNameTemplate != null
                        ? String(raw.cardNameTemplate).trim() || '{username}'
                        : currentWelcomeConfig.cardNameTemplate,
                cardOverlayText:
                    raw.cardOverlayText != null ? String(raw.cardOverlayText) : currentWelcomeConfig.cardOverlayText
            };
            scheduleWelcomeCardPreview(guildId);
        },
        getPreviewLines: () => {
            const cfg = collectWelcomeConfigFromForm();
            const guild = currentServerGuilds.find((g) => String(g.id) === String(guildId));
            const sample = {
                userMention: `@${currentUser?.username || 'Usuario'}`,
                username: currentUser?.username || 'Usuario',
                server: guild?.name || 'Tu servidor',
                memberCount: guild?.botGuild?.memberCount || 100
            };
            return {
                title: applyWelcomePreviewTemplate(cfg.title || '¡Bienvenido!', sample),
                name: applyWelcomePreviewTemplate((cfg.cardNameTemplate || '{username}'), sample),
                sub: applyWelcomePreviewTemplate(cfg.message || '', sample),
                overlay: applyWelcomePreviewTemplate(cfg.cardOverlayText || '', sample)
            };
        },
        onClose: () => {
            saveCurrentGreetingDraft();
            updateWelcomePreviewPanel(guildId);
        }
    });
}
