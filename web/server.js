// Cargar variables de entorno desde la raíz del proyecto
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const session = require('express-session');
const DiscordOauth2 = require('discord-oauth2');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const db = require('../src/utils/database');
const billingStore = require('../src/utils/billing-store');
const welcomeStore = require('../src/utils/welcome-config-store');
const {
    canonicalWelcomeMediaUrl,
    resolveWelcomeUploadFile: resolveLocalUploadFile,
    resolveWelcomeCardBackground,
    applyWelcomeMediaToEmbed
} = require('../src/utils/welcome-upload-resolve');
const { applyGuildEmbedText } = require('../src/utils/embed-text-template');
const greetingImageStore = require('../src/utils/greeting-image-store');
const { renderWelcomeCardPng, mergeCardLayout } = require('../src/utils/welcome-card');
const verifyStore = require('../src/utils/verify-config-store');
const ticketStore = require('../src/utils/ticket-config-store');
const levelingStore = require('../src/utils/leveling-store');
const guildActivityStore = require('../src/utils/guild-activity-store');
const tempVoiceStore = require('../src/utils/temp-voice-store');
const antiRaidStore = require('../src/utils/anti-raid-config-store');
const streamAlertStore = require('../src/utils/stream-alert-store');
const {
    fetchTwitchLiveByLogin,
    extractTwitchLoginFromUrlOrName,
    cacheBustPreviewUrl
} = require('../src/utils/twitch-stream-api');
const { buildStreamAlertEmbed } = require('../src/utils/stream-alert-scheduler');
const freeGamesStore = require('../src/utils/free-games-store');
const freeGamesService = require('../src/utils/free-games-service');
const channelSetupTemplates = require('../src/utils/channel-setup-templates');
const { executeGuildNuke } = require('../src/utils/guild-nuke');
const gachaStore = require('../src/utils/gacha-store');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const {
    ticketButtonCustomIdForGuild,
    acceptPendingFromWeb,
    claimTicketFromWeb,
    closeTicketFromWeb,
    listPendingRequests,
    listTicketReports,
    listTicketReportsWithFallback,
    listTicketReportSummaries,
    deleteTicketReportFromGuild,
    countTicketReports,
    getTicketReport,
    listActiveTicketChannels,
    listTicketChannelMessages,
    sendWebMessageToTicket
} = require('../src/events/ticket-interaction');
const { sanitizeDifficulty, sanitizeXpMultiplier, getProgress } = require('../src/utils/leveling-math');

const app = express();
const PORT = process.env.WEB_PORT || 3000;
const {
    handleTwitchEventSubHttpRequest,
    isTwitchEventSubConfigured,
    resolveCallbackUrl: resolveTwitchCallbackUrl
} = require('../src/utils/twitch-eventsub');
const {
    handleYouTubeWebSubHttpRequest,
    isYouTubeWebSubConfigured,
    resolveCallbackUrl: resolveYouTubeCallbackUrl
} = require('../src/utils/youtube-websub');
const {
    handleFeedWebSubHttpRequest,
    isFeedWebSubConfigured,
    resolveCallbackUrl: resolveFeedCallbackUrl
} = require('../src/utils/feed-websub');
const { scheduleAllStreamPushSync } = require('../src/utils/stream-push-sync');
const { isStreamPushConfigured } = require('../src/utils/stream-push-common');

app.post(
    '/webhooks/twitch/eventsub',
    express.raw({ type: 'application/json' }),
    handleTwitchEventSubHttpRequest
);

app.get('/webhooks/youtube/websub', handleYouTubeWebSubHttpRequest);
app.post(
    '/webhooks/youtube/websub',
    express.raw({ type: 'application/json' }),
    handleYouTubeWebSubHttpRequest
);

app.get('/webhooks/feed/websub', handleFeedWebSubHttpRequest);
app.post(
    '/webhooks/feed/websub',
    express.raw({ type: 'application/json' }),
    handleFeedWebSubHttpRequest
);

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!MP_ACCESS_TOKEN) {
        return res.status(503).json({ error: 'Mercado Pago no configurado' });
    }

    let payload = {};
    try {
        if (Buffer.isBuffer(req.body) && req.body.length) {
            payload = JSON.parse(req.body.toString('utf8'));
        }
    } catch {
        payload = {};
    }

    const topic = String(
        req.query.type
        || req.query.topic
        || payload.type
        || payload.topic
        || ''
    ).trim().toLowerCase();

    const resourceUrl = String(payload.resource || req.query.resource || '').trim();
    let preapprovalId = String(
        req.query['data.id']
        || req.query.id
        || payload?.data?.id
        || payload?.id
        || ''
    ).trim();

    if (!preapprovalId && resourceUrl.includes('/preapproval/')) {
        const match = resourceUrl.match(/\/preapproval\/([^/?]+)/i);
        preapprovalId = String(match?.[1] || '').trim();
    }

    if (MP_WEBHOOK_SECRET && !req.headers['x-signature']) {
        return res.status(400).json({ error: 'Firma MP faltante' });
    }

    if (!preapprovalId) {
        return res.json({ ok: true, ignored: true, reason: 'no_preapproval_id' });
    }

    try {
        const subscription = await mercadoPagoRequest('get', `/preapproval/${encodeURIComponent(preapprovalId)}`);
        const discordUserId = parseUserIdFromExternalReference(subscription?.external_reference);
        if (!discordUserId) {
            return res.json({ ok: true, ignored: true, reason: 'missing_external_reference' });
        }

        const statusKey = mapMercadoPagoStatusToBillingStatus(subscription?.status);
        const fingerprint = `mp:${preapprovalId}:${statusKey}:${String(subscription?.last_modified || subscription?.date_modified || '')}`;
        const alreadyProcessed = await billingStore.hasProcessedEvent(fingerprint);
        if (alreadyProcessed) {
            return res.json({ ok: true, ignored: true, reason: 'event_already_processed' });
        }

        await persistMercadoPagoSubscriptionForUser(discordUserId, subscription, topic || 'mp_webhook');
        await billingStore.markEventProcessed(fingerprint, { sourceEvent: topic || 'mp_webhook' });
        return res.json({ ok: true });
    } catch (error) {
        console.error('❌ Error procesando webhook Mercado Pago:', error?.response?.data || error?.message || error);
        return res.status(500).json({ error: 'No se pudo procesar webhook' });
    }
});

function buildStreamPushStatus() {
    return {
        publicOriginConfigured: isStreamPushConfigured(),
        twitch: {
            configured: isTwitchEventSubConfigured(),
            callbackUrl: resolveTwitchCallbackUrl() || null
        },
        youtube: {
            configured: isYouTubeWebSubConfigured(),
            callbackUrl: resolveYouTubeCallbackUrl() || null
        },
        feed: {
            configured: isFeedWebSubConfigured(),
            callbackUrl: resolveFeedCallbackUrl() || null
        }
    };
}

app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, service: 'web-panel' });
});

function resolveWebOrigin(req) {
    const explicit = String(WEB_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
    if (explicit) return explicit;
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    if (!host) return '';
    return `${proto}://${host}`;
}

function mapMercadoPagoStatusToBillingStatus(status = '') {
    const normalized = String(status || '').trim().toLowerCase();
    if (normalized === 'authorized') return 'active';
    if (normalized === 'paused') return 'past_due';
    if (normalized === 'cancelled' || normalized === 'canceled') return 'canceled';
    if (normalized === 'pending') return 'inactive';
    return 'inactive';
}

function buildMercadoPagoExternalReference(userId = '') {
    return `${MP_EXTERNAL_REFERENCE_PREFIX}:${String(userId || '').trim()}`;
}

function parseUserIdFromExternalReference(externalReference = '') {
    const raw = String(externalReference || '').trim();
    if (!raw) return '';
    const [prefix, ...rest] = raw.split(':');
    if (prefix !== MP_EXTERNAL_REFERENCE_PREFIX || !rest.length) return '';
    return String(rest.join(':') || '').trim();
}

async function mercadoPagoRequest(method, endpoint, body = undefined, params = undefined) {
    if (!MP_ACCESS_TOKEN) {
        throw new Error('Mercado Pago no configurado');
    }
    const url = `https://api.mercadopago.com${endpoint}`;
    const response = await axios({
        method,
        url,
        data: body,
        params,
        timeout: 15000,
        headers: {
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        }
    });
    return response.data;
}

function envValue(name, fallback = '') {
    const raw = process.env[name];
    if (raw === undefined || raw === null) return fallback;
    return String(raw).trim();
}

const CLIENT_ID = envValue('CLIENT_ID');
const CLIENT_SECRET = envValue('CLIENT_SECRET');
const OWNER_DISCORD_ID = envValue('WEB_OWNER_DISCORD_ID', '399740358101303316');
const WEB_PUBLIC_ORIGIN = envValue('WEB_PUBLIC_ORIGIN') || envValue('PUBLIC_ORIGIN');
const MP_ACCESS_TOKEN = envValue('MP_ACCESS_TOKEN');
const MP_WEBHOOK_SECRET = envValue('MP_WEBHOOK_SECRET');
const MP_REASON = envValue('MP_REASON', 'EyedBot Premium mensual');
const MP_BACK_URL = envValue('MP_BACK_URL');
const MP_CURRENCY_ID = envValue('MP_CURRENCY_ID', 'USD');
const MP_MONTHLY_AMOUNT_RAW = Number.parseFloat(envValue('MP_MONTHLY_AMOUNT', '9.99'));
const MP_MONTHLY_AMOUNT = Number.isFinite(MP_MONTHLY_AMOUNT_RAW) && MP_MONTHLY_AMOUNT_RAW > 0
    ? MP_MONTHLY_AMOUNT_RAW
    : 9.99;
const MP_EXTERNAL_REFERENCE_PREFIX = envValue('MP_EXTERNAL_REFERENCE_PREFIX', 'eyedbot');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }
});
const ownerAttachmentUploadDir = path.join(os.tmpdir(), 'eyedbot-owner-uploads');
if (!fs.existsSync(ownerAttachmentUploadDir)) fs.mkdirSync(ownerAttachmentUploadDir, { recursive: true });
const ownerAttachmentUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, ownerAttachmentUploadDir),
        filename: (_req, file, cb) => {
            const safeBase = sanitizeUploadName(path.parse(file.originalname || 'archivo').name || 'archivo');
            const ext = path.extname(file.originalname || '') || '';
            cb(null, `${Date.now()}_${safeBase}${ext.slice(0, 12)}`);
        }
    }),
    limits: { fileSize: 1024 * 1024 * 1024 }
});

function handleOwnerAttachmentUpload(req, res, next) {
    ownerAttachmentUpload.single('attachmentFile')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'El archivo supera el límite de 1 GB' });
            }
            return res.status(400).json({ error: err.message || 'Error al procesar el archivo' });
        }
        return next();
    });
}

function timeoutAfter(ms, label = 'timeout') {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(label)), ms);
    });
}

const OAUTH_REQUEST_TIMEOUT_MS = Number.parseInt(process.env.OAUTH_REQUEST_TIMEOUT_MS || '10000', 10) || 10000;

async function withOauthTimeout(promise, label) {
    return Promise.race([promise, timeoutAfter(OAUTH_REQUEST_TIMEOUT_MS, label)]);
}

async function safeDbGet(key, fallback = null, timeoutMs = 3000) {
    try {
        return await Promise.race([db.get(key), timeoutAfter(timeoutMs, `db.get timeout: ${key}`)]);
    } catch (error) {
        console.warn(`⚠️ safeDbGet fallback for ${key}:`, error.message);
        return fallback;
    }
}

async function safeDbSet(key, value, timeoutMs = 3000) {
    try {
        await Promise.race([db.set(key, value), timeoutAfter(timeoutMs, `db.set timeout: ${key}`)]);
        return true;
    } catch (error) {
        console.warn(`⚠️ safeDbSet failed for ${key}:`, error.message);
        return false;
    }
}

class MySqlSessionStore extends session.Store {
    constructor(options = {}) {
        super();
        this.prefix = options.prefix || 'session:';
    }

    get(sid, callback) {
        db.get(`${this.prefix}${sid}`)
            .then((record) => {
                if (!record || typeof record !== 'object') {
                    return callback(null, null);
                }

                if (record.expires && new Date(record.expires).getTime() <= Date.now()) {
                    return this.destroy(sid, () => callback(null, null));
                }

                return callback(null, record.session || null);
            })
            .catch((error) => callback(error));
    }

    set(sid, sessionData, callback) {
        const expires = this.getExpiration(sessionData);
        db.set(`${this.prefix}${sid}`, {
            session: sessionData,
            expires: expires ? expires.toISOString() : null
        })
            .then(() => callback && callback(null))
            .catch((error) => callback && callback(error));
    }

    destroy(sid, callback) {
        db.delete(`${this.prefix}${sid}`)
            .then(() => callback && callback(null))
            .catch((error) => callback && callback(error));
    }

    touch(sid, sessionData, callback) {
        this.set(sid, sessionData, callback);
    }

    length(callback) {
        db.all()
            .then((entries) => {
                const count = entries.filter((entry) => String(entry.ID || '').startsWith(this.prefix)).length;
                callback(null, count);
            })
            .catch((error) => callback(error));
    }

    clear(callback) {
        db.all()
            .then((entries) => Promise.all(
                entries
                    .filter((entry) => String(entry.ID || '').startsWith(this.prefix))
                    .map((entry) => db.delete(entry.ID))
            ))
            .then(() => callback && callback(null))
            .catch((error) => callback && callback(error));
    }

    getExpiration(sessionData) {
        if (sessionData?.cookie?.expires) {
            return new Date(sessionData.cookie.expires);
        }

        if (sessionData?.cookie?.maxAge) {
            return new Date(Date.now() + sessionData.cookie.maxAge);
        }

        return null;
    }
}

// Validar variables de entorno requeridas
if (!CLIENT_ID) {
    console.error('❌ ERROR: CLIENT_ID no está configurado en .env');
    console.log('💡 Agrega CLIENT_ID=tu_client_id a tu archivo .env');
}

if (!CLIENT_SECRET) {
    console.error('❌ ERROR: CLIENT_SECRET no está configurado en .env');
    console.log('💡 Agrega CLIENT_SECRET=tu_client_secret a tu archivo .env');
    console.log('💡 Obtén el CLIENT_SECRET de Discord Developer Portal > OAuth2');
}

// Configuración de OAuth2
const redirectUri = process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;
const redirectIsHttps = /^https:\/\//i.test(redirectUri);
const cookieSecure = (process.env.SESSION_COOKIE_SECURE || (redirectIsHttps ? 'true' : 'false')).toLowerCase() === 'true';

const oauth = new DiscordOauth2({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: redirectUri
});

console.log('🔐 OAuth2 configurado:');
console.log(`   Client ID: ${CLIENT_ID ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   Client Secret: ${CLIENT_SECRET ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   Redirect URI: ${redirectUri}`);
console.log(`   Session Cookie Secure: ${cookieSecure ? '✅ true' : '⚠️ false (HTTP/local)'}`);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: 0,
    etag: true,
    setHeaders: (res, filePath) => {
        if (/\.(html|js|css)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// Necesario si se usa proxy inverso para respetar cookies seguras.
app.set('trust proxy', 1);

// Configuración de sesiones
const sessionStore = new MySqlSessionStore();
app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'tu-secret-super-seguro-cambiar-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: cookieSecure,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        sameSite: 'lax' // Ayuda con redirecciones de OAuth
    },
    name: 'tulabot.session' // Nombre personalizado para la cookie
}));

// Variable global para el cliente del bot (se inyectará desde index.js)
let botClient = null;

const templatesFilePath = path.join(__dirname, '..', 'data', 'embed-templates.json');

function ensureTemplateStore() {
    const dir = path.dirname(templatesFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(templatesFilePath)) fs.writeFileSync(templatesFilePath, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
}

function readTemplateStore() {
    ensureTemplateStore();
    try {
        const raw = fs.readFileSync(templatesFilePath, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        if (!parsed || typeof parsed !== 'object') return { guilds: {} };
        if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
        return parsed;
    } catch {
        return { guilds: {} };
    }
}

function writeTemplateStore(data) {
    ensureTemplateStore();
    fs.writeFileSync(templatesFilePath, JSON.stringify(data, null, 2), 'utf8');
}

function ensureWelcomeUploadsDir() {
    const uploadsDir = path.join(__dirname, 'public', 'uploads', 'welcome');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    return uploadsDir;
}

function ensureVerifyUploadsDir() {
    const uploadsDir = path.join(__dirname, 'public', 'uploads', 'verify');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    return uploadsDir;
}

function ensureGachaCatalogUploadsDir() {
    const uploadsDir = path.join(__dirname, 'public', 'uploads', 'gacha-catalog');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    return uploadsDir;
}

function sanitizeUploadName(name = 'welcome-image') {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .slice(0, 60) || 'welcome-image';
}

function extFromMimeOrName(mimeType = '', originalName = '') {
    const mime = String(mimeType).toLowerCase();
    if (mime === 'image/png') return '.png';
    if (mime === 'image/webp') return '.webp';
    if (mime === 'image/gif') return '.gif';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';

    const fromName = path.extname(String(originalName).toLowerCase());
    return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(fromName) ? (fromName === '.jpeg' ? '.jpg' : fromName) : '.jpg';
}

/** URL absoluta para archivos bajo /public (embeds de Discord, etc.). Usa WEB_PUBLIC_ORIGIN o PUBLIC_ORIGIN si está definida. */
function buildPublicUploadUrl(req, publicPath) {
    const p = String(publicPath || '').startsWith('/') ? String(publicPath) : `/${publicPath}`;
    const fromEnv = String(process.env.WEB_PUBLIC_ORIGIN || process.env.PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
    if (fromEnv) {
        return `${fromEnv}${p}`;
    }
    const proto = String(req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    if (!host) {
        return p;
    }
    return `${proto}://${host}${p}`;
}

const LOGIN_ANALYTICS_KEY = 'web:analytics:global_logins_v1';
const LOGIN_ANALYTICS_VERSION = 1;
const LOGIN_ANALYTICS_FILE_PATH = path.join(__dirname, '..', 'data', 'web-login-registry.json');
const PERMISSION_ADMINISTRATOR = 0x8n;
const PERMISSION_MANAGE_GUILD = 0x20n;
const PERMISSION_MANAGE_CHANNELS = 0x10n;

function isOwnerUser(user = null) {
    return String(user?.id || '') === String(OWNER_DISCORD_ID);
}

function sanitizeGuildSnapshot(guild) {
    const guildId = String(guild?.id || '');
    const iconHash = String(guild?.icon || '').trim();

    return {
        name: String(guild?.name || 'Servidor sin nombre').slice(0, 120),
        id: guildId,
        idSuffix: guildId.slice(-4),
        iconUrl: guildId && iconHash
            ? `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.png?size=128`
            : null
    };
}

function hasAdminOrManageGuildPermission(guild = {}) {
    try {
        const raw = guild?.permissions;
        if (raw === undefined || raw === null || raw === '') return false;
        const permissions = BigInt(String(raw));
        return (permissions & PERMISSION_ADMINISTRATOR) !== 0n || (permissions & PERMISSION_MANAGE_GUILD) !== 0n;
    } catch {
        return false;
    }
}

/** Administrador, gestionar servidor o gestionar canales (OAuth del usuario). */
function canManageServerChannels(sessionGuild = {}) {
    try {
        const raw = sessionGuild?.permissions;
        if (raw === undefined || raw === null || raw === '') return false;
        const p = BigInt(String(raw));
        return (p & PERMISSION_ADMINISTRATOR) !== 0n
            || (p & PERMISSION_MANAGE_GUILD) !== 0n
            || (p & PERMISSION_MANAGE_CHANNELS) !== 0n;
    } catch {
        return false;
    }
}

function sessionGuildAllowsManagement(sessionGuilds = [], guildId = '') {
    return (Array.isArray(sessionGuilds) ? sessionGuilds : []).some((guild) => (
        String(guild?.id || '') === String(guildId) && hasAdminOrManageGuildPermission(guild)
    ));
}

function filterTrackableGuilds(guilds = []) {
    const list = Array.isArray(guilds) ? guilds : [];
    return list.filter((guild) => {
        if (!guild?.id) return false;
        if (!hasAdminOrManageGuildPermission(guild)) return false;
        if (!botClient) return false;
        return botClient.guilds.cache.has(String(guild.id));
    });
}

function normalizeLoginAnalytics(raw) {
    const base = {
        version: LOGIN_ANALYTICS_VERSION,
        totals: {
            totalLogins: 0,
            uniqueUsers: 0,
            uniqueGuildsSeen: 0
        },
        users: {},
        updatedAt: null
    };

    if (!raw || typeof raw !== 'object') return base;
    if (!raw.users || typeof raw.users !== 'object') raw.users = {};
    if (!raw.totals || typeof raw.totals !== 'object') raw.totals = {};

    return {
        version: raw.version || LOGIN_ANALYTICS_VERSION,
        totals: {
            totalLogins: Number(raw.totals.totalLogins) || 0,
            uniqueUsers: Number(raw.totals.uniqueUsers) || 0,
            uniqueGuildsSeen: Number(raw.totals.uniqueGuildsSeen) || 0
        },
        users: raw.users,
        updatedAt: raw.updatedAt || null
    };
}

function ensureLoginAnalyticsFileStore() {
    const dir = path.dirname(LOGIN_ANALYTICS_FILE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(LOGIN_ANALYTICS_FILE_PATH)) {
        fs.writeFileSync(
            LOGIN_ANALYTICS_FILE_PATH,
            JSON.stringify(normalizeLoginAnalytics(null), null, 2),
            'utf8'
        );
    }
}

function readLoginAnalyticsFromFile() {
    try {
        ensureLoginAnalyticsFileStore();
        const raw = fs.readFileSync(LOGIN_ANALYTICS_FILE_PATH, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        return normalizeLoginAnalytics(parsed);
    } catch (error) {
        console.warn('⚠️ No se pudo leer web-login-registry.json:', error.message);
        return normalizeLoginAnalytics(null);
    }
}

function writeLoginAnalyticsToFile(analytics) {
    try {
        ensureLoginAnalyticsFileStore();
        fs.writeFileSync(
            LOGIN_ANALYTICS_FILE_PATH,
            JSON.stringify(normalizeLoginAnalytics(analytics), null, 2),
            'utf8'
        );
        return true;
    } catch (error) {
        console.warn('⚠️ No se pudo escribir web-login-registry.json:', error.message);
        return false;
    }
}

async function loadLoginAnalyticsSnapshot() {
    const dbSnapshot = normalizeLoginAnalytics(await safeDbGet(LOGIN_ANALYTICS_KEY, null));
    const hasDbData =
        Object.keys(dbSnapshot.users || {}).length > 0 ||
        Number(dbSnapshot?.totals?.totalLogins || 0) > 0;

    if (hasDbData) {
        writeLoginAnalyticsToFile(dbSnapshot);
        return dbSnapshot;
    }

    const fileSnapshot = readLoginAnalyticsFromFile();
    const hasFileData =
        Object.keys(fileSnapshot.users || {}).length > 0 ||
        Number(fileSnapshot?.totals?.totalLogins || 0) > 0;

    if (hasFileData) {
        await safeDbSet(LOGIN_ANALYTICS_KEY, fileSnapshot);
    }

    return fileSnapshot;
}

function summarizeAnalytics(analytics) {
    const users = Object.values(analytics.users || {});
    const uniqueGuildIds = new Set();

    users.forEach((entry) => {
        (entry.guilds || []).forEach((g) => {
            if (g?.id) {
                uniqueGuildIds.add(String(g.id));
                return;
            }
            if (g?.name) uniqueGuildIds.add(`name:${String(g.name).toLowerCase()}`);
        });
    });

    return {
        totalLogins: users.reduce((acc, u) => acc + (Number(u.loginCount) || 0), 0),
        uniqueUsers: users.length,
        uniqueGuildsSeen: uniqueGuildIds.size
    };
}

async function recordGlobalLoginEvent(user, guilds = []) {
    if (!user?.id) return;

    const analytics = await loadLoginAnalyticsSnapshot();
    const userId = String(user.id);
    const nowIso = new Date().toISOString();
    const guildList = filterTrackableGuilds(guilds);
    const sanitizedGuilds = guildList.slice(0, 60).map(sanitizeGuildSnapshot);

    const current = analytics.users[userId] || {
        userId,
        username: String(user.username || 'Usuario'),
        globalName: String(user.global_name || user.username || 'Usuario'),
        avatar: user.avatar || null,
        loginCount: 0,
        firstLoginAt: nowIso,
        lastLoginAt: nowIso,
        guildCount: 0,
        guilds: []
    };

    current.username = String(user.username || current.username || 'Usuario');
    current.globalName = String(user.global_name || user.username || current.globalName || 'Usuario');
    current.avatar = user.avatar || null;
    current.loginCount = (Number(current.loginCount) || 0) + 1;
    current.lastLoginAt = nowIso;
    current.guildCount = guildList.length;
    current.guilds = sanitizedGuilds;

    analytics.users[userId] = current;
    analytics.totals = summarizeAnalytics(analytics);
    analytics.updatedAt = nowIso;

    await safeDbSet(LOGIN_ANALYTICS_KEY, analytics);
    writeLoginAnalyticsToFile(analytics);
}

function summarizePeakDay(daily = {}, key) {
    let bestDate = null;
    let bestValue = 0;

    Object.entries(daily || {}).forEach(([date, entry]) => {
        const value = Math.max(0, Number.parseInt(entry?.[key] || 0, 10) || 0);
        if (value > bestValue) {
            bestValue = value;
            bestDate = date;
        }
    });

    return {
        date: bestDate,
        count: bestValue
    };
}

function resolveGuildUserTag(guild, userId) {
    if (!guild || !userId) return 'Desconocido';
    const member = guild.members.cache.get(userId);
    if (member?.user?.tag) return member.user.tag;
    return `Usuario ${String(userId).slice(-4)}`;
}

function resolveGuildUserAvatar(guild, userId) {
    if (!guild || !userId) return null;
    const member = guild.members.cache.get(userId);
    if (typeof member?.displayAvatarURL === 'function') {
        return member.displayAvatarURL({ dynamic: true, size: 128 });
    }
    if (typeof member?.user?.displayAvatarURL === 'function') {
        return member.user.displayAvatarURL({ dynamic: true, size: 128 });
    }
    return null;
}

function summarizeChannelType(channel) {
    const type = Number(channel?.type);
    if (type === 0) return 'Texto';
    if (type === 2) return 'Voz';
    if (type === 4) return 'Categoria';
    if (type === 5) return 'Anuncios';
    if (type === 13) return 'Escenario';
    if (type === 15) return 'Foro';
    return `Tipo ${type}`;
}

function sanitizeChannelSnapshot(channel) {
    const connectedUsers = channel.members
        ? channel.members
            .filter((member) => !member.user?.bot)
            .map((member) => ({
                id: member.id,
                tag: member.user?.tag || member.displayName || `Usuario ${String(member.id).slice(-4)}`,
                avatar: typeof member.displayAvatarURL === 'function'
                    ? member.displayAvatarURL({ dynamic: true, size: 128 })
                    : (typeof member.user?.displayAvatarURL === 'function'
                        ? member.user.displayAvatarURL({ dynamic: true, size: 128 })
                        : null)
            }))
            .sort((a, b) => a.tag.localeCompare(b.tag, 'es'))
        : [];

    return {
        id: channel.id,
        name: channel.name,
        type: summarizeChannelType(channel),
        parentName: channel.parent?.name || 'Sin categoria',
        position: Number(channel.rawPosition || channel.position || 0),
        topic: typeof channel.topic === 'string' ? channel.topic.slice(0, 120) : '',
        userCount: connectedUsers.length,
        users: connectedUsers
    };
}

function toIsoDayKey(date) {
    return new Date(date).toISOString().slice(0, 10);
}

function buildLast7DaysTimeline(daily = {}) {
    const points = [];
    const now = new Date();

    for (let i = 6; i >= 0; i -= 1) {
        const date = new Date(now);
        date.setUTCDate(now.getUTCDate() - i);
        const key = toIsoDayKey(date);
        points.push({
            date: key,
            joins: Number.parseInt(daily[key]?.joins || 0, 10) || 0,
            leaves: Number.parseInt(daily[key]?.leaves || 0, 10) || 0,
            messages: Number.parseInt(daily[key]?.messages || 0, 10) || 0,
            voiceMinutes: Number.parseInt(daily[key]?.voiceMinutes || 0, 10) || 0
        });
    }

    return points;
}

function buildWeeklyTimeline(sinceDate, daily = {}) {
    const start = new Date(sinceDate || Date.now());
    const end = new Date();

    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(0, 0, 0, 0);

    const points = [];
    let cursor = new Date(start);
    let weekIndex = 1;

    while (cursor <= end) {
        const weekStart = new Date(cursor);
        const weekEnd = new Date(cursor);
        weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
        if (weekEnd > end) weekEnd.setTime(end.getTime());

        const bucket = {
            week: weekIndex,
            start: toIsoDayKey(weekStart),
            end: toIsoDayKey(weekEnd),
            joins: 0,
            leaves: 0,
            messages: 0,
            voiceMinutes: 0
        };

        const dayCursor = new Date(weekStart);
        while (dayCursor <= weekEnd) {
            const key = toIsoDayKey(dayCursor);
            bucket.joins += Number.parseInt(daily[key]?.joins || 0, 10) || 0;
            bucket.leaves += Number.parseInt(daily[key]?.leaves || 0, 10) || 0;
            bucket.messages += Number.parseInt(daily[key]?.messages || 0, 10) || 0;
            bucket.voiceMinutes += Number.parseInt(daily[key]?.voiceMinutes || 0, 10) || 0;
            dayCursor.setUTCDate(dayCursor.getUTCDate() + 1);
        }

        points.push(bucket);
        cursor.setUTCDate(cursor.getUTCDate() + 7);
        weekIndex += 1;
    }

    return points;
}

// Función para inyectar el cliente del bot
function setBotClient(client) {
    botClient = client;
    const twitchEventSub = require('../src/utils/twitch-eventsub');
    const { setDiscordClient } = require('../src/utils/stream-push-runtime');
    setDiscordClient(client);
    twitchEventSub.setDiscordClient(client);
    if (client) scheduleAllStreamPushSync();
}

// Rutas de autenticación
app.get('/login', (req, res) => {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(`/login.html${query}`);
});

app.get('/auth/discord', (req, res) => {
    if (!CLIENT_ID) {
        return res.status(500).send(`
            <html>
                <head><title>Error de Configuración</title></head>
                <body style="font-family: Arial; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1>❌ Error de Configuración</h1>
                    <p>CLIENT_ID no está configurado en el archivo .env</p>
                    <p>Por favor, agrega <code>CLIENT_ID=tu_client_id</code> a tu archivo .env</p>
                    <p><a href="/" style="color: #FFA500;">Volver</a></p>
                </body>
            </html>
        `);
    }

    try {
        // Generar URL de autorización con estado para prevenir CSRF
        const state = Math.random().toString(36).substring(7);
        req.session.oauthState = state; // Guardar estado en sesión

        req.session.save((sessionError) => {
            if (sessionError) {
                console.error('❌ Error guardando estado OAuth en sesión:', sessionError);
                return res.redirect('/login.html?error=session_error');
            }

            const url = oauth.generateAuthUrl({
                scope: ['identify', 'guilds'],
                state: state
            });
            console.log('🔗 Redirigiendo a Discord OAuth2...');
            res.redirect(url);
        });
    } catch (error) {
        console.error('❌ Error generando URL de autorización:', error);
        res.status(500).send(`
            <html>
                <head><title>Error</title></head>
                <body style="font-family: Arial; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1>❌ Error</h1>
                    <p>Error al generar URL de autorización: ${error.message}</p>
                    <p>Verifica que CLIENT_ID y CLIENT_SECRET estén correctamente configurados.</p>
                    <p><a href="/" style="color: #FFA500;">Volver</a></p>
                </body>
            </html>
        `);
    }
});

app.get('/callback', async (req, res) => {
    try {
        const { code, error, state } = req.query;
        
        // Si Discord devuelve un error
        if (error) {
            console.error('❌ Error de Discord OAuth2:', error);
            return res.redirect('/login.html?error=discord_error');
        }

        if (!code) {
            console.error('❌ No se recibió código de autorización');
            return res.redirect('/login.html?error=no_code');
        }

        // Verificar que CLIENT_SECRET esté configurado
        if (!CLIENT_SECRET) {
            console.error('❌ CLIENT_SECRET no está configurado en .env');
            return res.redirect('/login.html?error=config_error');
        }

        // Verificar estado (CSRF protection) - opcional pero recomendado
        if (state && req.session.oauthState && state !== req.session.oauthState) {
            console.error('❌ Estado OAuth no coincide - posible ataque CSRF');
            return res.redirect('/login.html?error=auth_failed');
        }

        console.log('🔐 Intercambiando código por token...');
        console.log(`   Redirect URI: ${redirectUri}`);
        console.log(`   Client ID: ${CLIENT_ID ? '✅ Configurado' : '❌ Faltante'}`);
        console.log(`   Client Secret: ${CLIENT_SECRET ? '✅ Configurado' : '❌ Faltante'}`);
        
        const tokenData = await withOauthTimeout(oauth.tokenRequest({
            code,
            scope: 'identify guilds',
            grantType: 'authorization_code'
        }), 'oauth.tokenRequest timeout');

        if (!tokenData || !tokenData.access_token) {
            console.error('❌ No se recibió token de acceso');
            return res.redirect('/login.html?error=auth_failed');
        }

        console.log('👤 Obteniendo información del usuario...');
        const user = await withOauthTimeout(oauth.getUser(tokenData.access_token), 'oauth.getUser timeout');

        if (!user || !user.id) {
            console.error('❌ No se pudo obtener información del usuario');
            return res.redirect('/login.html?error=auth_failed');
        }

        const previousGuilds = Array.isArray(req.session.guilds) ? req.session.guilds : [];

        // Guardar en sesión
        req.session.user = user;
        req.session.guilds = previousGuilds;
        req.session.accessToken = tokenData.access_token;
        delete req.session.oauthState; // Limpiar estado OAuth

        // Guardar sesión antes de redirigir
        req.session.save((err) => {
            if (err) {
                console.error('❌ Error guardando sesión:', err);
                return res.redirect('/login.html?error=session_error');
            }
            console.log(`✅ Usuario autenticado: ${user.username}#${user.discriminator} (${user.id})`);
            console.log('   Servidores: sincronización diferida en segundo plano');

            // Fuera del camino crítico: sincronizar guilds y analytics sin bloquear el login.
            setImmediate(async () => {
                try {
                    const guilds = await withOauthTimeout(
                        oauth.getUserGuilds(tokenData.access_token),
                        'oauth.getUserGuilds timeout'
                    );

                    if (Array.isArray(guilds)) {
                        req.session.guilds = guilds;
                        req.session.guildsSyncedAt = Date.now();
                        req.session.save(() => {});
                    }

                    await recordGlobalLoginEvent(user, Array.isArray(guilds) ? guilds : []);
                } catch (backgroundError) {
                    console.warn('⚠️ Sincronización post-login incompleta:', backgroundError.message);
                }
            });

            // Redirigir a la raíz en lugar de /dashboard
            res.redirect('/');
        });
    } catch (error) {
        console.error('❌ Error en callback:', error);
        console.error('   Mensaje:', error.message);
        
        // Manejar específicamente el error 401
        if (error.message && error.message.includes('401')) {
            console.error('❌ Error 401: CLIENT_SECRET incorrecto o no coincide');
            console.error('💡 Verifica:');
            console.error('   1. CLIENT_SECRET en .env coincide con Discord Developer Portal');
            console.error('   2. Redirect URI coincide exactamente: ' + redirectUri);
            console.error('   3. La aplicación OAuth2 está habilitada en Discord');
            return res.redirect('/login.html?error=invalid_secret');
        }

        res.redirect('/login.html?error=auth_failed');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// Middleware para verificar autenticación
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        console.log('⚠️ Intento de acceso sin autenticación a:', req.path);
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'No autenticado', redirect: '/login.html' });
        }
        return res.redirect('/login.html');
    }
    next();
}

function requireOwner(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'No autenticado', redirect: '/login.html' });
    }

    if (!isOwnerUser(req.session.user)) {
        return res.status(403).json({ error: 'Acceso restringido al creador del bot' });
    }

    next();
}

const GUILDS_SESSION_SYNC_TTL_MS = 30 * 1000;

async function syncSessionGuilds(req, options = {}) {
    const force = options.force === true;
    const currentGuilds = Array.isArray(req.session?.guilds) ? req.session.guilds : [];

    if (!req.session?.accessToken) return currentGuilds;

    const lastSyncedAt = Number.parseInt(req.session.guildsSyncedAt || 0, 10) || 0;
    if (!force && (Date.now() - lastSyncedAt) < GUILDS_SESSION_SYNC_TTL_MS) {
        return currentGuilds;
    }

    try {
        const freshGuilds = await withOauthTimeout(
            oauth.getUserGuilds(req.session.accessToken),
            'oauth.getUserGuilds syncSessionGuilds timeout'
        );
        if (!Array.isArray(freshGuilds)) return currentGuilds;

        req.session.guilds = freshGuilds;
        req.session.guildsSyncedAt = Date.now();
        req.session.save(() => {});
        return freshGuilds;
    } catch (error) {
        console.warn('⚠️ No se pudo sincronizar la lista de servidores del usuario:', error.message);
        return currentGuilds;
    }
}

async function persistMercadoPagoSubscriptionForUser(userId, subscription, sourceEvent = '') {
    const sid = String(subscription?.id || '').trim();
    const customerId = String(subscription?.payer_id || subscription?.payer?.id || '').trim();
    const status = mapMercadoPagoStatusToBillingStatus(subscription?.status);
    const currentPeriodEndRaw = subscription?.next_payment_date || subscription?.auto_recurring?.end_date || null;
    let currentPeriodEnd = null;
    if (currentPeriodEndRaw) {
        const parsed = new Date(currentPeriodEndRaw);
        if (!Number.isNaN(parsed.getTime())) {
            currentPeriodEnd = parsed.toISOString();
        }
    }
    return billingStore.setUserSubscription(userId, {
        userId,
        status,
        customerId,
        subscriptionId: sid,
        currentPeriodEnd,
        cancelAtPeriodEnd: status === 'canceled',
        sourceEvent: String(sourceEvent || ''),
        updatedAt: new Date().toISOString()
    });
}

async function requirePremium(req, res, next) {
    const userId = String(req.session?.user?.id || '').trim();
    if (!userId) {
        return res.status(401).json({ error: 'No autenticado', redirect: '/login.html' });
    }

    try {
        const subscription = await billingStore.getUserSubscription(userId);
        if (!billingStore.isPremiumActive(subscription)) {
            return res.status(402).json({
                error: 'Premium requerido',
                code: 'premium_required',
                billing: {
                    status: subscription?.status || 'inactive',
                    active: false
                }
            });
        }
        return next();
    } catch (error) {
        console.error('Error validando premium:', error);
        return res.status(500).json({ error: 'No se pudo validar premium' });
    }
}

// Rutas protegidas
app.get('/api/user', requireAuth, async (req, res) => {
    const guilds = await syncSessionGuilds(req);
    const inviteUrl = CLIENT_ID
        ? `https://discord.com/api/oauth2/authorize?client_id=${encodeURIComponent(CLIENT_ID)}&permissions=8&scope=bot%20applications.commands`
        : '';

    res.json({
        user: req.session.user,
        guilds,
        inviteUrl,
        isOwner: isOwnerUser(req.session.user)
    });
});

app.get('/api/billing/status', requireAuth, async (req, res) => {
    const userId = String(req.session?.user?.id || '').trim();
    if (!userId) {
        return res.status(401).json({ error: 'No autenticado', redirect: '/login.html' });
    }

    try {
        const subscription = await billingStore.getUserSubscription(userId);
        return res.json({
            active: billingStore.isPremiumActive(subscription),
            status: subscription?.status || 'inactive',
            customerId: subscription?.customerId || '',
            subscriptionId: subscription?.subscriptionId || '',
            currentPeriodEnd: subscription?.currentPeriodEnd || null,
            cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd === true,
            updatedAt: subscription?.updatedAt || null
        });
    } catch (error) {
        console.error('Error consultando estado de facturación:', error);
        return res.status(500).json({ error: 'No se pudo obtener estado premium' });
    }
});

app.post('/api/billing/checkout-session', requireAuth, async (req, res) => {
    if (!MP_ACCESS_TOKEN) {
        return res.status(503).json({ error: 'Mercado Pago no configurado en el servidor' });
    }

    const userId = String(req.session?.user?.id || '').trim();
    if (!userId) {
        return res.status(401).json({ error: 'No autenticado', redirect: '/login.html' });
    }

    try {
        const origin = resolveWebOrigin(req);
        if (!origin) {
            return res.status(500).json({ error: 'No se pudo resolver el origen público de la web' });
        }

        const successBackUrl = String(MP_BACK_URL || `${origin}/?billing=success`).trim();
        const notificationUrl = `${origin}/api/billing/webhook`;
        const payload = {
            reason: MP_REASON,
            external_reference: buildMercadoPagoExternalReference(userId),
            auto_recurring: {
                frequency: 1,
                frequency_type: 'months',
                transaction_amount: MP_MONTHLY_AMOUNT,
                currency_id: MP_CURRENCY_ID
            },
            back_url: successBackUrl,
            notification_url: notificationUrl,
            status: 'pending'
        };
        const session = await mercadoPagoRequest('post', '/preapproval', payload);

        if (!session?.init_point) {
            return res.status(500).json({ error: 'Mercado Pago no devolvió URL de checkout' });
        }

        return res.json({ url: session.init_point });
    } catch (error) {
        console.error('Error creando suscripción en Mercado Pago:', error?.response?.data || error?.message || error);
        return res.status(500).json({ error: 'No se pudo crear la sesión de pago' });
    }
});

app.post('/api/billing/portal', requireAuth, async (req, res) => {
    if (!MP_ACCESS_TOKEN) {
        return res.status(503).json({ error: 'Mercado Pago no configurado en el servidor' });
    }

    const userId = String(req.session?.user?.id || '').trim();
    if (!userId) {
        return res.status(401).json({ error: 'No autenticado', redirect: '/login.html' });
    }

    try {
        const subscription = await billingStore.getUserSubscription(userId);
        const subscriptionId = String(subscription?.subscriptionId || '').trim();
        if (!subscriptionId) {
            return res.status(400).json({ error: 'No existe una suscripción activa para este usuario' });
        }

        const updated = await mercadoPagoRequest('put', `/preapproval/${encodeURIComponent(subscriptionId)}`, {
            status: 'cancelled'
        });
        await persistMercadoPagoSubscriptionForUser(userId, updated, 'manual_cancel');

        return res.json({
            ok: true,
            action: 'cancelled',
            message: 'Suscripción cancelada en Mercado Pago'
        });
    } catch (error) {
        console.error('Error cancelando suscripción en Mercado Pago:', error?.response?.data || error?.message || error);
        return res.status(500).json({ error: 'No se pudo gestionar la suscripción' });
    }
});

app.get('/api/about-overview', requireAuth, (req, res) => {
    const totalServers = botClient?.guilds?.cache?.size || 0;
    const totalCommands = botClient?.commands?.size || 0;
    const botName = String(botClient?.user?.username || 'EyedBot');

    res.json({
        botName,
        totalServers,
        totalCommands,
        purpose: 'Ayudar a gestionar comunidades de Discord con herramientas de organización, moderación y participación.'
    });
});

app.get('/api/admin/login-registry', requireOwner, async (req, res) => {
    try {
        const analytics = await loadLoginAnalyticsSnapshot();
        const users = Object.values(analytics.users || {})
            .map((entry) => ({
                userId: String(entry.userId || ''),
                username: String(entry.username || 'Usuario'),
                globalName: String(entry.globalName || entry.username || 'Usuario'),
                avatar: entry.avatar || null,
                loginCount: Number(entry.loginCount) || 0,
                firstLoginAt: entry.firstLoginAt || null,
                lastLoginAt: entry.lastLoginAt || null,
                guildCount: Number(entry.guildCount) || 0,
                guilds: Array.isArray(entry.guilds)
                    ? entry.guilds.map((g) => ({
                        id: String(g?.id || ''),
                        name: String(g?.name || 'Servidor sin nombre').slice(0, 120),
                        idSuffix: String(g?.idSuffix || '').slice(-4),
                        iconUrl: g?.iconUrl || null
                    }))
                    : []
            }))
            .sort((a, b) => {
                const aTime = new Date(a.lastLoginAt || 0).getTime();
                const bTime = new Date(b.lastLoginAt || 0).getTime();
                return bTime - aTime;
            });

        res.json({
            summary: {
                totalLogins: Number(analytics.totals.totalLogins) || 0,
                uniqueUsers: Number(analytics.totals.uniqueUsers) || 0,
                uniqueGuildsSeen: Number(analytics.totals.uniqueGuildsSeen) || 0,
                updatedAt: analytics.updatedAt || null
            },
            users
        });
    } catch (error) {
        console.error('Error obteniendo registro global de logins:', error);
        res.status(500).json({ error: 'Error al obtener registro global' });
    }
});

app.get('/api/guilds', requireAuth, async (req, res) => {
    try {
        const guilds = filterTrackableGuilds(await syncSessionGuilds(req, { force: true }));
        console.log('📋 GET /api/guilds - User:', req.session.user?.username, '| Session guilds:', guilds.length, '| botClient available:', !!botClient, '| bot cache size:', botClient?.guilds?.cache?.size || 0);
        
        // Filtrar solo servidores donde el bot está presente
        const botGuilds = [];
        if (botClient) {
            for (const guild of guilds) {
                const botGuild = botClient.guilds.cache.get(guild.id);
                if (botGuild) {
                    botGuilds.push({
                        id: guild.id,
                        name: guild.name,
                        icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
                        permissions: guild.permissions,
                        botGuild: {
                            memberCount: botGuild.memberCount,
                            channels: botGuild.channels.cache.filter(c => c.type === 0 || c.type === 2).map(c => ({
                                id: c.id,
                                name: c.name,
                                type: c.type
                            }))
                        }
                    });
                }
            }
        } else {
            console.warn('⚠️ botClient not available - returning empty guilds list');
        }
        
        console.log('✅ Returning', botGuilds.length, 'guilds to user');
        res.json(botGuilds);
    } catch (error) {
        console.error('❌ Error obteniendo servidores:', error);
        res.status(500).json({ error: 'Error al obtener servidores' });
    }
});

app.get('/api/guild/:guildId/channels', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        // Verificar que el usuario tenga permisos en el servidor
        if (!sessionGuildAllowsManagement(req.session.guilds, guildId)) {
            return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        }

        const channels = guild.channels.cache
            .filter(channel => channel.type === 0 || channel.type === 2 || channel.type === 4) // Texto, voz y categorías
            .map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                typeName: channel.type === 0 ? 'texto' : (channel.type === 2 ? 'voz' : 'categoria')
            }));

        res.json(channels);
    } catch (error) {
        console.error('Error obteniendo canales:', error);
        res.status(500).json({ error: 'Error al obtener canales' });
    }
});

function applyWelcomeTemplate(text, member) {
    return applyGuildEmbedText(text, { guild: member?.guild, member });
}

function sessionUserAvatarUrl(user) {
    if (!user?.id) return 'https://cdn.discordapp.com/embed/avatars/0.png';
    if (user.avatar) {
        const ext = String(user.avatar).startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=256`;
    }
    const mod = Number((BigInt(user.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${mod}.png`;
}

function previewWelcomeMemberStub(guild, sessionUser) {
    const uname = sessionUser?.username || 'Usuario';
    return {
        id: String(sessionUser?.id || '0'),
        displayName: uname,
        user: { id: sessionUser?.id, username: uname },
        guild: { name: guild?.name || 'Servidor', memberCount: guild?.memberCount ?? 1 }
    };
}

function buildDefaultGreetingConfig(mode, fallbackChannel = '') {
    if (mode === 'goodbye') {
        return {
            enabled: Boolean(fallbackChannel),
            channelId: fallbackChannel || '',
            mentionUser: false,
            title: 'Hasta pronto',
            message: '{username} ha salido de **{server}**. Ahora somos {memberCount} miembros.',
            color: 'ff5f9e',
            footer: 'EyedBot Goodbye System',
            imageUrl: '',
            thumbnailMode: 'avatar',
            thumbnailUrl: '',
            dmEnabled: false,
            dmMessage: ''
        };
    }

    return {
        enabled: Boolean(fallbackChannel),
        channelId: fallbackChannel || '',
        mentionUser: false,
        title: '¡Bienvenido!',
        message: '¡Hola {user}! Bienvenido a **{server}**. Eres el miembro #{memberCount}.',
        color: '7c4dff',
        footer: 'EyedBot Welcome System',
        imageUrl: '',
        thumbnailMode: 'avatar',
        thumbnailUrl: '',
        dmEnabled: false,
        dmMessage: 'Bienvenido a {server}, {username}.',
        welcomeStyle: 'embed',
        cardAccentColor: '4ade80',
        cardTitleColor: 'ffffff',
        cardNameColor: 'f8fafc',
        cardSubtitleColor: 'e2e8f0',
        cardNameTemplate: '{username}',
        cardOverlayText: '',
        cardOverlayColor: 'ffffff',
        cardFontKey: 'system',
        cardLayout: mergeCardLayout(null)
    };
}

function sanitizeHexColor6(val, fallback) {
    const h = String(val || '').replace('#', '').trim().slice(0, 6);
    return /^[0-9a-fA-F]{6}$/.test(h) ? h.toLowerCase() : fallback;
}

function normalizeGreetingConfigInput(body = {}, mode, userId, existing = null) {
    const fallback = mode === 'goodbye'
        ? { title: 'Hasta pronto', message: '{username} ha salido de **{server}**.' }
        : { title: '¡Bienvenido!', message: '¡Hola {user}! Bienvenido a **{server}**.' };

    const rawImage = String(body.imageUrl ?? '').trim();
    let imageUrl = canonicalWelcomeMediaUrl(body.imageUrl);
    if (!imageUrl && existing?.imageUrl) {
        const keepExisting = !rawImage || /^(blob:|data:)/i.test(rawImage);
        if (keepExisting) imageUrl = canonicalWelcomeMediaUrl(existing.imageUrl);
    }

    const rawThumb = String(body.thumbnailUrl ?? '').trim();
    let thumbnailUrl = canonicalWelcomeMediaUrl(body.thumbnailUrl);
    if (!thumbnailUrl && existing?.thumbnailUrl) {
        const keepExisting = !rawThumb || /^(blob:|data:)/i.test(rawThumb);
        if (keepExisting) thumbnailUrl = canonicalWelcomeMediaUrl(existing.thumbnailUrl);
    }

    const base = {
        enabled: body.enabled !== false,
        channelId: String(body.channelId || ''),
        mentionUser: body.mentionUser === true,
        title: String(body.title || fallback.title).slice(0, 256),
        message: String(body.message || fallback.message).slice(0, 2000),
        color: String(body.color || (mode === 'goodbye' ? 'ff5f9e' : '7c4dff')).replace('#', '').slice(0, 6),
        footer: String(body.footer || '').slice(0, 300),
        imageUrl: imageUrl.slice(0, 1000),
        thumbnailMode: ['none', 'avatar', 'url'].includes(String(body.thumbnailMode || 'avatar')) ? String(body.thumbnailMode) : 'avatar',
        thumbnailUrl: thumbnailUrl.slice(0, 1000),
        dmEnabled: body.dmEnabled === true,
        dmMessage: String(body.dmMessage || '').slice(0, 1000),
        updatedAt: new Date().toISOString(),
        updatedBy: userId || 'unknown'
    };

    if (mode === 'welcome') {
        base.welcomeStyle = body.welcomeStyle === 'card' ? 'card' : 'embed';
        base.cardAccentColor = sanitizeHexColor6(body.cardAccentColor, '4ade80');
        base.cardTitleColor = sanitizeHexColor6(body.cardTitleColor, 'ffffff');
        base.cardNameColor = sanitizeHexColor6(body.cardNameColor, 'f8fafc');
        base.cardSubtitleColor = sanitizeHexColor6(body.cardSubtitleColor, 'e2e8f0');
        base.cardNameTemplate = String(body.cardNameTemplate != null ? body.cardNameTemplate : '{username}').trim().slice(0, 120) || '{username}';
        base.cardOverlayText = String(body.cardOverlayText || '').slice(0, 200);
        base.cardOverlayColor = sanitizeHexColor6(body.cardOverlayColor, 'ffffff');
        base.cardFontKey = ['system', 'serif', 'mono', 'rounded', 'elegant'].includes(String(body.cardFontKey || '').toLowerCase())
            ? String(body.cardFontKey).toLowerCase()
            : 'system';
        base.cardLayout = mergeCardLayout(body.cardLayout);
    }

    return base;
}

function normalizeVerifyEmojiInput(rawEmoji = '✅') {
    const raw = String(rawEmoji || '✅').trim();
    const custom = raw.match(/^<a?:\w+:(\d+)>$/);
    if (custom?.[1]) {
        return { reactValue: custom[1], stored: custom[1], display: raw };
    }
    return { reactValue: raw, stored: raw, display: raw };
}

async function buildVerifyEmbedFromConfig(cfg, guild) {
    const embed = new EmbedBuilder()
        .setColor((cfg.color || '7c4dff').replace('#', ''))
        .setTitle(applyGuildEmbedText(cfg.title || 'Verify', { guild }))
        .setDescription(applyGuildEmbedText(cfg.message || '¡Reacciona para verificarte!', { guild }));
    if (cfg.footer) embed.setFooter({ text: applyGuildEmbedText(cfg.footer, { guild }) });
    const files = [];
    if (cfg.imageUrl) {
        await applyWelcomeMediaToEmbed(embed, cfg.imageUrl, files, guild, 'image');
    }
    return { embed, files };
}

function buildTicketPanelPayload(guildId, cfg, guild) {
    const embed = new EmbedBuilder()
        .setColor((cfg.color || '7c4dff').replace('#', ''))
        .setTitle(applyGuildEmbedText(cfg.title || 'Soporte', { guild }))
        .setDescription(applyGuildEmbedText(cfg.message || 'Presiona el boton para abrir un ticket y explica el motivo de tu solicitud.', { guild }));
    if (cfg.footer) embed.setFooter({ text: applyGuildEmbedText(cfg.footer, { guild }) });
    const openTicketBtn = new ButtonBuilder()
        .setCustomId(ticketButtonCustomIdForGuild(guildId))
        .setStyle(ButtonStyle.Primary)
        .setLabel(applyGuildEmbedText(cfg.buttonLabel || 'Solicitar ticket', { guild }));
    const components = [new ActionRowBuilder().addComponents(openTicketBtn)];
    return { embed, components };
}

async function syncVerifyPanelReaction(message, cfg) {
    const emojiData = normalizeVerifyEmojiInput(cfg.emoji || '✅');
    const botId = message.client.user.id;
    const targetId = emojiData.reactValue;

    for (const reaction of message.reactions.cache.values()) {
        const users = await reaction.users.fetch().catch(() => null);
        if (!users || !users.has(botId)) continue;

        const isTarget =
            (reaction.emoji.id && reaction.emoji.id === targetId) ||
            (!reaction.emoji.id && reaction.emoji.name === targetId);

        if (!isTarget) {
            await reaction.users.remove(botId).catch(() => null);
        }
    }

    let targetReact = message.reactions.cache.find((r) => {
        if (r.emoji.id) return r.emoji.id === targetId;
        return r.emoji.name === targetId;
    });
    if (!targetReact) {
        await message.react(emojiData.reactValue).catch(() => null);
        return;
    }
    const targetUsers = await targetReact.users.fetch().catch(() => null);
    if (!targetUsers?.has(botId)) {
        await message.react(emojiData.reactValue).catch(() => null);
    }
}

async function refreshVerifyPanelMessage(guildId, updatedByUserId) {
    if (!botClient) {
        const e = new Error('Bot no disponible');
        e.statusCode = 500;
        throw e;
    }
    const guild = botClient.guilds.cache.get(guildId) || await botClient.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        const e = new Error('Servidor no encontrado');
        e.statusCode = 404;
        throw e;
    }

    const cfg = await verifyStore.getVerifyConfig(guildId);
    if (!cfg?.messageId || !cfg?.channelId) {
        const e = new Error('No hay embed publicado para actualizar. Usa «Publicar embed» primero.');
        e.statusCode = 400;
        throw e;
    }

    const channel = guild.channels.cache.get(cfg.channelId) || await guild.channels.fetch(cfg.channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        const e = new Error('Canal de verificación no encontrado o no es de texto');
        e.statusCode = 404;
        throw e;
    }

    const message = await channel.messages.fetch(cfg.messageId).catch(() => null);
    if (!message) {
        const e = new Error('Mensaje no encontrado (pudo borrarse). Vuelve a publicar el embed.');
        e.statusCode = 404;
        throw e;
    }
    if (message.author.id !== botClient.user.id) {
        const e = new Error('Ese mensaje no fue enviado por el bot; no se puede editar desde el panel.');
        e.statusCode = 400;
        throw e;
    }

    const me = guild.members.me || await guild.members.fetch(botClient.user.id).catch(() => null);
    if (!me) {
        const e = new Error('No pude obtener los permisos del bot en el servidor');
        e.statusCode = 500;
        throw e;
    }
    if (!channel.permissionsFor(me)?.has(['SendMessages', 'EmbedLinks', 'AddReactions'])) {
        const e = new Error('Faltan permisos: Enviar mensajes, Insertar enlaces o Añadir reacciones');
        e.statusCode = 403;
        throw e;
    }

    const { embed, files } = await buildVerifyEmbedFromConfig(cfg, guild);
    await message.edit({
        embeds: [embed],
        files: files.length ? files : []
    });

    await syncVerifyPanelReaction(message, cfg);

    const emojiData = normalizeVerifyEmojiInput(cfg.emoji || '✅');
    const updatedCfg = {
        ...cfg,
        emoji: emojiData.stored,
        emojiDisplay: emojiData.display,
        updatedAt: new Date().toISOString(),
        updatedBy: updatedByUserId || 'unknown'
    };
    await verifyStore.setVerifyConfig(guildId, updatedCfg);
    return { messageId: message.id, channelId: channel.id, config: updatedCfg };
}

async function refreshTicketPanelMessage(guildId, updatedByUserId) {
    if (!botClient) {
        const e = new Error('Bot no disponible');
        e.statusCode = 500;
        throw e;
    }
    const guild = botClient.guilds.cache.get(guildId) || await botClient.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
        const e = new Error('Servidor no encontrado');
        e.statusCode = 404;
        throw e;
    }

    const cfg = await ticketStore.getTicketConfig(guildId);
    if (!cfg?.messageId || !cfg?.panelChannelId) {
        const e = new Error('No hay panel publicado para actualizar. Usa «Publicar panel» primero.');
        e.statusCode = 400;
        throw e;
    }

    const channel = guild.channels.cache.get(cfg.panelChannelId) || await guild.channels.fetch(cfg.panelChannelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
        const e = new Error('Canal del panel no encontrado o no es de texto');
        e.statusCode = 404;
        throw e;
    }

    const message = await channel.messages.fetch(cfg.messageId).catch(() => null);
    if (!message) {
        const e = new Error('Mensaje no encontrado (pudo borrarse). Vuelve a publicar el panel.');
        e.statusCode = 404;
        throw e;
    }
    if (message.author.id !== botClient.user.id) {
        const e = new Error('Ese mensaje no fue enviado por el bot; no se puede editar desde el panel.');
        e.statusCode = 400;
        throw e;
    }

    const me = guild.members.me || await guild.members.fetch(botClient.user.id).catch(() => null);
    if (!me) {
        const e = new Error('No pude obtener los permisos del bot en el servidor');
        e.statusCode = 500;
        throw e;
    }
    if (!channel.permissionsFor(me)?.has(['SendMessages', 'EmbedLinks'])) {
        const e = new Error('Faltan permisos: Enviar mensajes o Insertar enlaces');
        e.statusCode = 403;
        throw e;
    }

    const { embed, components } = buildTicketPanelPayload(guildId, cfg, guild);
    await message.edit({ embeds: [embed], components });

    const updatedCfg = {
        ...cfg,
        updatedAt: new Date().toISOString(),
        updatedBy: updatedByUserId || 'unknown'
    };
    await ticketStore.setTicketConfig(guildId, updatedCfg);
    return { messageId: message.id, channelId: channel.id, config: updatedCfg };
}

app.get('/api/guild/:guildId/verify-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const cfg = await verifyStore.getVerifyConfig(guildId);
        if (!cfg) {
            return res.json({
                enabled: false,
                channelId: '',
                roleId: '',
                newMemberRoleId: '',
                emoji: '✅',
                title: 'Verify',
                message: '¡Reacciona a este mensaje para ver los demás canales!',
                color: '7c4dff',
                footer: '',
                imageUrl: '',
                removeRoleOnUnreact: false,
                messageId: ''
            });
        }

        return res.json(cfg);
    } catch (error) {
        console.error('Error obteniendo verify config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de verificación' });
    }
});

app.post('/api/guild/:guildId/verify-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const body = req.body || {};
        const config = {
            enabled: body.enabled === true,
            channelId: String(body.channelId || '').trim(),
            roleId: String(body.roleId || '').trim(),
            newMemberRoleId: String(body.newMemberRoleId || '').trim(),
            emoji: String(body.emoji || '✅').trim().slice(0, 80),
            title: String(body.title || 'Verify').slice(0, 256),
            message: String(body.message || '¡Reacciona a este mensaje para ver los demás canales!').slice(0, 2000),
            color: String(body.color || '7c4dff').replace('#', '').slice(0, 6),
            footer: String(body.footer || '').slice(0, 300),
            imageUrl: String(body.imageUrl || '').slice(0, 1000),
            removeRoleOnUnreact: body.removeRoleOnUnreact === true,
            messageId: String(body.messageId || '').trim(),
            updatedAt: new Date().toISOString(),
            updatedBy: req.session.user?.id || 'unknown'
        };

        await verifyStore.setVerifyConfig(guildId, config);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando verify config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de verificación' });
    }
});

app.post('/api/guild/:guildId/verify-publish', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const cfg = await verifyStore.getVerifyConfig(guildId);
        if (!cfg?.channelId || !cfg?.roleId) {
            return res.status(400).json({ error: 'Configura canal y rol antes de publicar' });
        }

        const channel = guild.channels.cache.get(cfg.channelId) || await guild.channels.fetch(cfg.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return res.status(404).json({ error: 'Canal de verificación no encontrado o no es de texto' });
        }

        const role = guild.roles.cache.get(cfg.roleId) || await guild.roles.fetch(cfg.roleId).catch(() => null);
        if (!role) return res.status(404).json({ error: 'Rol de verificación no encontrado' });
        const newMemberRoleId = String(cfg.newMemberRoleId || '').trim();
        const newMemberRole = newMemberRoleId && newMemberRoleId !== role.id
            ? guild.roles.cache.get(newMemberRoleId) || await guild.roles.fetch(newMemberRoleId).catch(() => null)
            : null;
        if (newMemberRoleId && newMemberRoleId !== role.id && !newMemberRole) {
            return res.status(404).json({ error: 'Rol inicial de nuevo miembro no encontrado' });
        }

        const me = guild.members.me || await guild.members.fetch(botClient.user.id).catch(() => null);
        if (!me) return res.status(500).json({ error: 'No pude obtener los permisos del bot en el servidor' });

        if (!channel.permissionsFor(me)?.has(['SendMessages', 'EmbedLinks', 'AddReactions'])) {
            return res.status(403).json({ error: 'Faltan permisos: Enviar mensajes, Insertar enlaces o Añadir reacciones' });
        }

        if (!me.permissions.has('ManageRoles') || me.roles.highest.position <= role.position) {
            return res.status(403).json({ error: 'El bot no puede administrar ese rol (revisa jerarquía y permiso Gestionar roles)' });
        }
        if (newMemberRole && (!me.permissions.has('ManageRoles') || me.roles.highest.position <= newMemberRole.position)) {
            return res.status(403).json({ error: 'El bot no puede administrar el rol inicial de nuevo miembro (revisa jerarquía y permiso Gestionar roles)' });
        }

        const { embed, files } = await buildVerifyEmbedFromConfig(cfg, guild);

        const posted = await channel.send({ embeds: [embed], files });

        const emojiData = normalizeVerifyEmojiInput(cfg.emoji || '✅');
        await posted.react(emojiData.reactValue).catch(() => null);

        const updatedCfg = {
            ...cfg,
            enabled: true,
            emoji: emojiData.stored,
            emojiDisplay: emojiData.display,
            messageId: posted.id,
            channelId: channel.id,
            updatedAt: new Date().toISOString(),
            updatedBy: req.session.user?.id || 'unknown'
        };

        await verifyStore.setVerifyConfig(guildId, updatedCfg);

        res.json({ success: true, config: updatedCfg, messageId: posted.id, channelId: channel.id });
    } catch (error) {
        console.error('Error publicando verify embed:', error);
        res.status(500).json({ error: 'Error al publicar el embed de verificación' });
    }
});

app.post('/api/guild/:guildId/verify-embed-update', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const result = await refreshVerifyPanelMessage(guildId, req.session.user?.id);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error actualizando verify embed:', error);
        const code = Number(error.statusCode);
        const status = code >= 400 && code < 600 ? code : 500;
        res.status(status).json({ error: error.message || 'Error al actualizar el embed de verificación' });
    }
});

app.get('/api/guild/:guildId/ticket-config', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const defaultTicketCategories = [
            { value: 'soporte-general', label: 'Soporte general', description: 'Dudas o ayuda general del servidor' },
            { value: 'reportes', label: 'Reportes', description: 'Reportar usuarios, bugs o conductas' },
            { value: 'solicitud-ingreso-minecraft', label: 'Minecraft Server', description: 'Ayuda con el servidor, soporte tecnico y consultas generales' },
            { value: 'sugerencias', label: 'Sugerencias', description: 'Ideas para mejorar la comunidad' }
        ];

        const defaultCommonProblems = [
            { value: 'permisos', label: 'Problemas de permisos', description: 'No puedo ver o usar un canal/comando' },
            { value: 'sanciones', label: 'Sancion o apelacion', description: 'Mute, kick, ban o apelacion' },
            { value: 'errores-del-bot', label: 'Error del bot', description: 'Comandos que fallan o no responden' },
            { value: 'roles-y-canales', label: 'Roles y canales', description: 'Roles incorrectos o accesos faltantes' },
            { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
        ];

        const defaultMinecraftServers = [
            { value: 'no-aplica', label: 'No aplica', description: 'Mi solicitud no es sobre Minecraft' },
            { value: 'survival', label: 'Survival', description: 'Soporte del servidor Survival' },
            { value: 'skyblock', label: 'Skyblock', description: 'Soporte del servidor Skyblock' },
            { value: 'practice', label: 'Practice/PvP', description: 'Soporte de modos PvP o Practice' },
            { value: 'lobby', label: 'Lobby/Network', description: 'Problemas de conexion o lobby' }
        ];

        const cfg = await ticketStore.getTicketConfig(guildId);
        if (!cfg) {
            return res.json({
                enabled: false,
                panelChannelId: '',
                requestChannelId: '',
                receiptHistoryChannelId: '',
                sendDmReceipt: true,
                sendDmPendingStatus: false,
                adminRoleIds: [],
                title: 'Soporte',
                message: 'Presiona el boton para abrir un ticket y explica el motivo de tu solicitud.',
                color: '7c4dff',
                footer: 'Sistema de Tickets',
                buttonLabel: 'Solicitar ticket',
                messageId: '',
                ticketCategories: defaultTicketCategories,
                commonProblems: defaultCommonProblems,
                minecraftServers: defaultMinecraftServers,
                caseRoleMap: {}
            });
        }

        res.json({
            ...cfg,
            receiptHistoryChannelId: String(cfg.receiptHistoryChannelId || '').trim(),
            sendDmReceipt: cfg.sendDmReceipt !== false,
            sendDmPendingStatus: cfg.sendDmPendingStatus === true,
            ticketCategories: Array.isArray(cfg.ticketCategories) && cfg.ticketCategories.length ? cfg.ticketCategories : defaultTicketCategories,
            commonProblems: Array.isArray(cfg.commonProblems) && cfg.commonProblems.length ? cfg.commonProblems : defaultCommonProblems,
            minecraftServers: Array.isArray(cfg.minecraftServers) && cfg.minecraftServers.length ? cfg.minecraftServers : defaultMinecraftServers,
            caseRoleMap: cfg.caseRoleMap && typeof cfg.caseRoleMap === 'object' ? cfg.caseRoleMap : {}
        });
    } catch (error) {
        console.error('Error obteniendo ticket config:', error);
        res.status(500).json({ error: 'Error al obtener configuracion de tickets' });
    }
});

app.post('/api/guild/:guildId/ticket-config', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const body = req.body || {};
        const currentCfg = await ticketStore.getTicketConfig(guildId);

        const defaultTicketCategories = [
            { value: 'soporte-general', label: 'Soporte general', description: 'Dudas o ayuda general del servidor' },
            { value: 'reportes', label: 'Reportes', description: 'Reportar usuarios, bugs o conductas' },
            { value: 'solicitud-ingreso-minecraft', label: 'Minecraft Server', description: 'Ayuda con el servidor, soporte tecnico y consultas generales' },
            { value: 'sugerencias', label: 'Sugerencias', description: 'Ideas para mejorar la comunidad' }
        ];

        const defaultCommonProblems = [
            { value: 'permisos', label: 'Problemas de permisos', description: 'No puedo ver o usar un canal/comando' },
            { value: 'sanciones', label: 'Sancion o apelacion', description: 'Mute, kick, ban o apelacion' },
            { value: 'errores-del-bot', label: 'Error del bot', description: 'Comandos que fallan o no responden' },
            { value: 'roles-y-canales', label: 'Roles y canales', description: 'Roles incorrectos o accesos faltantes' },
            { value: 'otro', label: 'Mi caso no aparece en esta lista', description: 'Abrir formulario para explicar tu caso' }
        ];

        const defaultMinecraftServers = [
            { value: 'no-aplica', label: 'No aplica', description: 'Mi solicitud no es sobre Minecraft' },
            { value: 'survival', label: 'Survival', description: 'Soporte del servidor Survival' },
            { value: 'skyblock', label: 'Skyblock', description: 'Soporte del servidor Skyblock' },
            { value: 'practice', label: 'Practice/PvP', description: 'Soporte de modos PvP o Practice' },
            { value: 'lobby', label: 'Lobby/Network', description: 'Problemas de conexion o lobby' }
        ];

        const toOptionValue = (text, fallback) => {
            const safe = String(text || '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 80);
            return safe || fallback;
        };

        const normalizeTicketOptions = (input, fallback, prefix) => {
            const source = Array.isArray(input) && input.length
                ? input
                : (Array.isArray(fallback) && fallback.length ? fallback : []);

            const used = new Set();
            const normalized = [];

            source.slice(0, 25).forEach((entry, index) => {
                const asObject = entry && typeof entry === 'object' && !Array.isArray(entry)
                    ? entry
                    : { label: String(entry || '').trim() };

                const label = String(asObject.label || asObject.name || '').trim().slice(0, 100);
                if (!label) return;

                let value = toOptionValue(asObject.value || label, `${prefix}-${index + 1}`).slice(0, 100);
                if (used.has(value)) value = `${value}-${index + 1}`.slice(0, 100);
                used.add(value);

                normalized.push({
                    value,
                    label,
                    description: String(asObject.description || '').trim().slice(0, 100)
                });
            });

            return normalized.length ? normalized : fallback;
        };

        const adminRoleIds = Array.isArray(body.adminRoleIds)
            ? body.adminRoleIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 20)
            : [];

        const ticketCategories = normalizeTicketOptions(
            body.ticketCategories,
            currentCfg?.ticketCategories || defaultTicketCategories,
            'cat'
        );

        const commonProblems = normalizeTicketOptions(
            body.commonProblems,
            currentCfg?.commonProblems || defaultCommonProblems,
            'issue'
        );

        const minecraftServers = normalizeTicketOptions(
            body.minecraftServers,
            currentCfg?.minecraftServers || defaultMinecraftServers,
            'mc'
        );

        const normalizeRoleMap = (raw) => {
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
            const out = {};
            Object.entries(raw).slice(0, 40).forEach(([key, value]) => {
                const safeKey = String(key || '').trim().slice(0, 80);
                if (!safeKey) return;

                const roleIds = (Array.isArray(value) ? value : String(value || '').split(','))
                    .map((id) => String(id || '').trim())
                    .filter((id) => /^\d{10,25}$/.test(id))
                    .slice(0, 20);

                if (!roleIds.length) return;
                out[safeKey] = roleIds;
            });
            return out;
        };

        const caseRoleMap = normalizeRoleMap(body.caseRoleMap || currentCfg?.caseRoleMap || {});

        if (!minecraftServers.some((item) => item.value === 'no-aplica')) {
            minecraftServers.unshift(defaultMinecraftServers[0]);
        }

        const incomingMessageId = String(body.messageId || '').trim();
        const preservedMessageId = incomingMessageId || String(currentCfg?.messageId || '').trim();

        const config = {
            enabled: body.enabled === true,
            panelChannelId: String(body.panelChannelId || '').trim(),
            requestChannelId: String(body.requestChannelId || '').trim(),
            receiptHistoryChannelId: String(body.receiptHistoryChannelId || '').trim(),
            sendDmReceipt:
                typeof body.sendDmReceipt === 'boolean'
                    ? body.sendDmReceipt
                    : currentCfg?.sendDmReceipt !== false,
            sendDmPendingStatus:
                typeof body.sendDmPendingStatus === 'boolean'
                    ? body.sendDmPendingStatus
                    : currentCfg?.sendDmPendingStatus === true,
            adminRoleIds,
            title: String(body.title || 'Soporte').slice(0, 256),
            message: String(body.message || 'Presiona el boton para abrir un ticket y explica el motivo de tu solicitud.').slice(0, 2000),
            color: String(body.color || '7c4dff').replace('#', '').slice(0, 6),
            footer: String(body.footer || '').slice(0, 300),
            buttonLabel: String(body.buttonLabel || 'Solicitar ticket').slice(0, 80),
            ticketCategories,
            commonProblems,
            minecraftServers,
            caseRoleMap,
            messageId: preservedMessageId,
            updatedAt: new Date().toISOString(),
            updatedBy: req.session.user?.id || 'unknown'
        };

        await ticketStore.setTicketConfig(guildId, config);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando ticket config:', error);
        res.status(500).json({ error: 'Error al guardar configuracion de tickets' });
    }
});

app.post('/api/guild/:guildId/ticket-publish', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const cfg = await ticketStore.getTicketConfig(guildId);
        if (!cfg?.panelChannelId) {
            return res.status(400).json({ error: 'Configura el canal de tickets antes de publicar' });
        }

        const channel = guild.channels.cache.get(cfg.panelChannelId) || await guild.channels.fetch(cfg.panelChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return res.status(404).json({ error: 'Canal de panel no encontrado o no es de texto' });
        }

        const me = guild.members.me || await guild.members.fetch(botClient.user.id).catch(() => null);
        if (!me) return res.status(500).json({ error: 'No pude obtener los permisos del bot en el servidor' });

        if (!channel.permissionsFor(me)?.has(['SendMessages', 'EmbedLinks'])) {
            return res.status(403).json({ error: 'Faltan permisos: Enviar mensajes o Insertar enlaces' });
        }

        const { embed, components } = buildTicketPanelPayload(guildId, cfg, guild);

        const posted = await channel.send({
            embeds: [embed],
            components
        });

        const updatedCfg = {
            ...cfg,
            enabled: true,
            panelChannelId: channel.id,
            messageId: posted.id,
            updatedAt: new Date().toISOString(),
            updatedBy: req.session.user?.id || 'unknown'
        };

        await ticketStore.setTicketConfig(guildId, updatedCfg);
        res.json({ success: true, config: updatedCfg, messageId: posted.id, channelId: channel.id });
    } catch (error) {
        console.error('Error publicando ticket panel:', error);
        res.status(500).json({ error: 'Error al publicar panel de tickets' });
    }
});

app.post('/api/guild/:guildId/ticket-embed-update', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const result = await refreshTicketPanelMessage(guildId, req.session.user?.id);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error actualizando panel de tickets:', error);
        const code = Number(error.statusCode);
        const status = code >= 400 && code < 600 ? code : 500;
        res.status(status).json({ error: error.message || 'Error al actualizar el panel de tickets' });
    }
});

app.post('/api/guild/:guildId/panel-embeds-refresh', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const uid = req.session.user?.id || 'unknown';
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const wantVerify = body.verify !== false;
        const wantTicket = body.ticket !== false;

        const out = { verify: null, ticket: null };

        if (wantVerify) {
            try {
                out.verify = { ok: true, ...(await refreshVerifyPanelMessage(guildId, uid)) };
            } catch (e) {
                out.verify = { ok: false, error: e.message || String(e) };
            }
        } else {
            out.verify = { ok: false, skipped: true, error: 'omitido por solicitud' };
        }

        if (wantTicket) {
            try {
                out.ticket = { ok: true, ...(await refreshTicketPanelMessage(guildId, uid)) };
            } catch (e) {
                out.ticket = { ok: false, error: e.message || String(e) };
            }
        } else {
            out.ticket = { ok: false, skipped: true, error: 'omitido por solicitud' };
        }

        res.json({ success: true, results: out });
    } catch (error) {
        console.error('Error refrescando paneles:', error);
        res.status(500).json({ error: error.message || 'Error al refrescar paneles' });
    }
});

// ===== GESTION DE TICKETS (WEB) =====

function utcDayStartMs(ts) {
    const d = new Date(ts);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcMonthKeyFromIso(iso) {
    const t = new Date(iso || 0).getTime();
    if (!Number.isFinite(t) || t <= 0) return null;
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function enumerateUtcMonthKeys(startTs, endTs) {
    const keys = [];
    const start = new Date(Math.min(startTs, endTs));
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    const end = new Date(endTs);
    const ey = end.getUTCFullYear();
    const em = end.getUTCMonth();
    while (y < ey || (y === ey && m <= em)) {
        keys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
        m++;
        if (m > 11) {
            m = 0;
            y++;
        }
    }
    return keys;
}

function buildTicketStats(activeList, pendingList, reportsList, guildCreatedTimestamp, closedTotalCount) {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const utcToday = utcDayStartMs(now);

    const days = Array.from({ length: 7 }, (_, i) => {
        const ts = utcToday - (6 - i) * oneDay;
        return { ts, opened: 0, closed: 0 };
    });

    const bucketIndexDay = (iso) => {
        const t = new Date(iso || 0).getTime();
        if (!Number.isFinite(t) || t <= 0) return -1;
        const dayStart = utcDayStartMs(t);
        for (let i = 0; i < days.length; i++) {
            if (dayStart === days[i].ts) return i;
        }
        return -1;
    };

    (pendingList || []).forEach((p) => {
        const idx = bucketIndexDay(p.createdAt);
        if (idx >= 0) days[idx].opened += 1;
    });

    (activeList || []).forEach((a) => {
        const idx = bucketIndexDay(a.createdAt);
        if (idx >= 0) days[idx].opened += 1;
    });

    (reportsList || []).forEach((r) => {
        const idx = bucketIndexDay(r.createdAt);
        if (idx >= 0) days[idx].closed += 1;
    });

    const last7 = days.map((d) => ({
        date: new Date(d.ts).toISOString().slice(0, 10),
        opened: d.opened,
        closed: d.closed
    }));

    const guildTs = Number(guildCreatedTimestamp || now);
    const safeGuildStart = Math.min(Math.max(guildTs, 0), now);
    const monthKeys = enumerateUtcMonthKeys(safeGuildStart, now);
    const monthBuckets = new Map(monthKeys.map((k) => [k, { opened: 0, closed: 0 }]));

    const bumpMonth = (iso, field) => {
        const k = utcMonthKeyFromIso(iso);
        if (!k || !monthBuckets.has(k)) return;
        monthBuckets.get(k)[field] += 1;
    };

    (activeList || []).forEach((a) => bumpMonth(a.createdAt, 'opened'));
    (reportsList || []).forEach((r) => {
        bumpMonth(r.channelCreatedAt || r.createdAt, 'opened');
        bumpMonth(r.createdAt, 'closed');
    });

    const activityByMonth = monthKeys.map((month) => {
        const b = monthBuckets.get(month) || { opened: 0, closed: 0 };
        return { month, opened: b.opened, closed: b.closed };
    });

    const closedReportsTotal =
        closedTotalCount != null && Number.isFinite(Number(closedTotalCount))
            ? Number(closedTotalCount)
            : (reportsList || []).length;

    const claimedCount = (activeList || []).filter((a) => a.claimedBy).length;

    return {
        active: (activeList || []).length,
        pending: (pendingList || []).length,
        closed: closedReportsTotal,
        total: (activeList || []).length + (pendingList || []).length + closedReportsTotal,
        claimed: claimedCount,
        unclaimed: Math.max(0, (activeList || []).length - claimedCount),
        last7Days: last7,
        activityByMonth
    };
}

async function enrichActiveTickets(guild, botClient, active) {
    if (!active?.length) return [];
    const out = [];
    for (const item of active) {
        const ownerUser = await botClient.users.fetch(item.ownerId).catch(() => null);
        const claimerUser = item.claimedBy ? await botClient.users.fetch(item.claimedBy).catch(() => null) : null;
        out.push({
            ...item,
            owner: ownerUser ? {
                id: ownerUser.id,
                username: ownerUser.username,
                tag: ownerUser.tag || ownerUser.username,
                avatar: ownerUser.displayAvatarURL({ size: 64 })
            } : { id: item.ownerId, username: 'Usuario desconocido', tag: '', avatar: null },
            claimer: claimerUser ? {
                id: claimerUser.id,
                username: claimerUser.username,
                tag: claimerUser.tag || claimerUser.username,
                avatar: claimerUser.displayAvatarURL({ size: 64 })
            } : null
        });
    }
    return out;
}

async function enrichPendingTickets(botClient, pending) {
    if (!pending?.length) return [];
    const out = [];
    for (const item of pending) {
        const user = await botClient.users.fetch(item.requesterId).catch(() => null);
        out.push({
            ...item,
            requester: user ? {
                id: user.id,
                username: user.username,
                tag: user.tag || user.username,
                avatar: user.displayAvatarURL({ size: 64 })
            } : { id: item.requesterId, username: item.requesterUsername || 'Usuario', tag: item.requesterTag || '', avatar: null }
        });
    }
    return out;
}

async function enrichReports(botClient, reports) {
    if (!reports?.length) return [];
    const out = [];
    for (const item of reports) {
        const owner = item.ownerId ? await botClient.users.fetch(item.ownerId).catch(() => null) : null;
        const closer = item.closedById ? await botClient.users.fetch(item.closedById).catch(() => null) : null;
        out.push({
            ...item,
            owner: owner ? {
                id: owner.id,
                username: owner.username,
                tag: owner.tag || owner.username,
                avatar: owner.displayAvatarURL({ size: 64 })
            } : { id: item.ownerId || '', username: 'Usuario desconocido', tag: '', avatar: null },
            closer: closer ? {
                id: closer.id,
                username: closer.username,
                tag: closer.tag || closer.username,
                avatar: closer.displayAvatarURL({ size: 64 })
            } : { id: item.closedById || '', username: item.closedByTag || 'Staff desconocido', tag: item.closedByTag || '', avatar: null }
        });
    }
    return out;
}

app.get('/api/guild/:guildId/tickets/overview', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const historyLimitRaw = Number.parseInt(req.query.historyLimit, 10);
        const historyLimit = Number.isFinite(historyLimitRaw) ? Math.max(10, Math.min(200, historyLimitRaw)) : 50;

        const rawActive = listActiveTicketChannels(guild);
        const rawPending = await listPendingRequests(guildId);
        const closedReportsTotal = await countTicketReports(guildId).catch(() => 0);

        let rawReports = await listTicketReportSummaries(guildId, historyLimit);
        if (!rawReports?.length) {
            try {
                if (typeof listTicketReportsWithFallback === 'function') {
                    rawReports = await listTicketReportsWithFallback(guildId, historyLimit);
                }
            } catch (e) {
                console.warn('Fallback listTicketReports fallo:', e?.message || e);
            }
        }

        const [active, pending, history] = await Promise.all([
            enrichActiveTickets(guild, botClient, rawActive),
            enrichPendingTickets(botClient, rawPending),
            enrichReports(botClient, rawReports)
        ]);

        const stats = buildTicketStats(
            rawActive,
            rawPending,
            rawReports,
            guild.createdTimestamp,
            closedReportsTotal
        );

        res.json({
            success: true,
            stats,
            active,
            pending,
            history,
            guildCreatedAt: new Date(Number(guild.createdTimestamp || Date.now())).toISOString(),
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error obteniendo overview de tickets:', error);
        res.status(500).json({ error: 'Error al obtener tickets' });
    }
});

app.post('/api/guild/:guildId/tickets/pending/:requestId/accept', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, requestId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const result = await acceptPendingFromWeb(
            botClient,
            guildId,
            requestId,
            req.session.user?.id || ''
        );

        if (!result?.ok) {
            const status = result?.code === 'PENDING_NOT_FOUND' ? 404
                : result?.code === 'ALREADY_OPEN' ? 409
                : result?.code === 'BOT_NO_PERMS' || result?.code === 'CONFIG_MISSING' ? 400
                : 500;
            return res.status(status).json({ error: result?.error || 'No se pudo aceptar la solicitud', code: result?.code || 'UNKNOWN', ...result });
        }

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error aceptando pendiente de ticket:', error);
        res.status(500).json({ error: 'Error al aceptar la solicitud' });
    }
});

app.post('/api/guild/:guildId/tickets/active/:channelId/claim', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, channelId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const claimerId = req.session.user?.id || '';
        if (!claimerId) return res.status(401).json({ error: 'Sesion invalida' });

        const result = await claimTicketFromWeb(botClient, guildId, channelId, claimerId);

        if (!result?.ok) {
            const status = result?.code === 'CHANNEL_NOT_FOUND' ? 404
                : result?.code === 'NOT_A_TICKET' ? 400
                : 500;
            return res.status(status).json({ error: result?.error || 'No se pudo reclamar el ticket', code: result?.code || 'UNKNOWN' });
        }

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error reclamando ticket:', error);
        res.status(500).json({ error: 'Error al reclamar el ticket' });
    }
});

app.post('/api/guild/:guildId/tickets/active/:channelId/unclaim', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, channelId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const result = await claimTicketFromWeb(botClient, guildId, channelId, '');

        if (!result?.ok) {
            const status = result?.code === 'CHANNEL_NOT_FOUND' ? 404
                : result?.code === 'NOT_A_TICKET' ? 400
                : 500;
            return res.status(status).json({ error: result?.error || 'No se pudo liberar el ticket', code: result?.code || 'UNKNOWN' });
        }

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error liberando ticket:', error);
        res.status(500).json({ error: 'Error al liberar el ticket' });
    }
});

app.post('/api/guild/:guildId/tickets/active/:channelId/close', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, channelId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const closerId = req.session.user?.id || '';
        if (!closerId) return res.status(401).json({ error: 'Sesion invalida' });

        const result = await closeTicketFromWeb(botClient, guildId, channelId, closerId);

        if (!result?.ok) {
            const code = result?.code || 'UNKNOWN';
            const status =
                code === 'CHANNEL_NOT_FOUND' || code === 'GUILD_NOT_FOUND' ? 404
                    : code === 'NOT_A_TICKET' ? 400
                        : code === 'FORBIDDEN' || code === 'MEMBER_NOT_FOUND' ? 403
                            : 500;
            return res.status(status).json({ error: result?.error || 'No se pudo cerrar el ticket', code });
        }

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error cerrando ticket desde web:', error);
        res.status(500).json({ error: 'Error al cerrar el ticket' });
    }
});

app.delete('/api/guild/:guildId/tickets/reports/:reportId', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, reportId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const result = await deleteTicketReportFromGuild(guildId, reportId);
        if (!result?.ok) {
            const status =
                result?.code === 'NOT_FOUND' ? 404
                    : result?.code === 'INVALID' ? 400
                        : 500;
            return res.status(status).json({ error: result?.error || 'No se pudo eliminar el informe', code: result?.code || 'UNKNOWN' });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error eliminando informe de ticket:', error);
        res.status(500).json({ error: 'Error al eliminar el informe' });
    }
});

// Enriquecer report con datos de usuarios (owner, closer, participantes)
async function enrichReportDetail(client, report) {
    if (!report || typeof report !== 'object') return report;

    const safeFetch = async (id) => {
        if (!id || !client) return null;
        try {
            const u = await client.users.fetch(String(id)).catch(() => null);
            if (!u) return null;
            return {
                id: u.id,
                tag: u.tag || u.username,
                username: u.username,
                displayName: u.globalName || u.username,
                avatarURL: typeof u.displayAvatarURL === 'function' ? u.displayAvatarURL({ size: 128, extension: 'png' }) : null
            };
        } catch {
            return null;
        }
    };

    const [owner, closer] = await Promise.all([
        safeFetch(report.ownerId),
        safeFetch(report.closedById)
    ]);

    const participantIds = Array.isArray(report.participants) ? report.participants.slice(0, 30) : [];
    const participantsDetailed = await Promise.all(participantIds.map((id) => safeFetch(id)));

    // Enriquecer autores de cada entry con url de avatar (por si el cliente quiere mostrarlos)
    const authorMap = new Map();
    (participantsDetailed || []).forEach((p) => { if (p?.id) authorMap.set(p.id, p); });
    if (owner?.id) authorMap.set(owner.id, owner);
    if (closer?.id) authorMap.set(closer.id, closer);

    const entries = Array.isArray(report.transcriptEntries) ? report.transcriptEntries : [];
    const enrichedEntries = entries.map((e) => {
        const info = e.authorId && authorMap.get(e.authorId);
        return {
            ...e,
            authorAvatarURL: info?.avatarURL || null,
            authorDisplayName: info?.displayName || e.authorTag || 'Desconocido'
        };
    });

    return {
        ...report,
        owner,
        closer,
        participantsDetailed: (participantsDetailed || []).filter(Boolean),
        transcriptEntries: enrichedEntries
    };
}

app.get('/api/guild/:guildId/tickets/report/:reportId', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, reportId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const report = await getTicketReport(guildId, reportId);
        if (!report) return res.status(404).json({ error: 'Comprobante no encontrado' });

        const enriched = await enrichReportDetail(botClient, report);
        res.json({ success: true, report: enriched });
    } catch (error) {
        console.error('Error obteniendo comprobante:', error);
        res.status(500).json({ error: 'No se pudo obtener el comprobante' });
    }
});

app.get('/api/guild/:guildId/tickets/report/:reportId/download', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, reportId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const report = await getTicketReport(guildId, reportId);
        if (!report) return res.status(404).json({ error: 'Comprobante no encontrado' });

        const transcript = typeof report.transcriptText === 'string' && report.transcriptText
            ? report.transcriptText
            : `Comprobante ${report.reportId}\nSin transcripción almacenada.`;

        const safeName = String(report.transcriptFileName || `comprobante-${report.reportId}.txt`)
            .replace(/[^a-zA-Z0-9._-]+/g, '_');

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.send(transcript);
    } catch (error) {
        console.error('Error descargando comprobante:', error);
        res.status(500).json({ error: 'No se pudo descargar el comprobante' });
    }
});

// ============================================================
// Chat bidireccional ticket <-> web
// ============================================================

function buildSenderFromSession(reqUser) {
    if (!reqUser) return null;
    let avatarURL = null;
    if (reqUser.avatar) {
        avatarURL = `https://cdn.discordapp.com/avatars/${reqUser.id}/${reqUser.avatar}.${reqUser.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`;
    } else if (reqUser.id) {
        const idx = (Number(reqUser.discriminator || 0) % 5);
        avatarURL = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    }
    return {
        id: String(reqUser.id || ''),
        username: reqUser.username || 'usuario',
        discriminator: reqUser.discriminator || '0',
        tag: reqUser.discriminator && reqUser.discriminator !== '0'
            ? `${reqUser.username}#${reqUser.discriminator}`
            : reqUser.username || 'usuario',
        displayName: reqUser.global_name || reqUser.username || 'usuario',
        avatarURL
    };
}

app.get('/api/guild/:guildId/tickets/active/:channelId/messages', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, channelId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 60));
        const after = req.query.after ? String(req.query.after) : null;

        const result = await listTicketChannelMessages(botClient, guildId, channelId, { limit, after });
        if (!result?.ok) {
            const status = result?.code === 'CHANNEL_NOT_FOUND' ? 404
                : result?.code === 'NOT_A_TICKET' ? 400
                : 500;
            return res.status(status).json({ error: result?.error || 'No se pudieron cargar los mensajes' });
        }

        res.json({
            success: true,
            channelId: result.channelId,
            channelName: result.channelName,
            ownerId: result.ownerId,
            category: result.category,
            commonIssue: result.commonIssue,
            claimedBy: result.claimedBy,
            messages: result.messages,
            fetchedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error listando mensajes del ticket:', error);
        res.status(500).json({ error: 'No se pudieron cargar los mensajes' });
    }
});

app.post('/api/guild/:guildId/tickets/active/:channelId/messages', requireAuth, requirePremium, express.json(), async (req, res) => {
    try {
        const { guildId, channelId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const content = String(req.body?.content || '').trim();
        if (!content) return res.status(400).json({ error: 'El mensaje no puede estar vacio' });
        if (content.length > 1800) return res.status(400).json({ error: 'El mensaje es demasiado largo (max 1800)' });

        const sender = buildSenderFromSession(req.session.user);
        if (!sender?.id) return res.status(401).json({ error: 'Sesion invalida' });

        const result = await sendWebMessageToTicket(botClient, guildId, channelId, sender, content);
        if (!result?.ok) {
            const status = result?.code === 'CHANNEL_NOT_FOUND' ? 404
                : result?.code === 'NOT_A_TICKET' ? 400
                : result?.code === 'EMPTY_CONTENT' || result?.code === 'TOO_LONG' ? 400
                : 500;
            return res.status(status).json({ error: result?.error || 'No se pudo enviar el mensaje' });
        }

        res.json({
            success: true,
            via: result.via,
            message: result.message
        });
    } catch (error) {
        console.error('Error enviando mensaje a ticket desde web:', error);
        res.status(500).json({ error: 'No se pudo enviar el mensaje' });
    }
});

function normalizeLevelingConfigInput(body = {}, current = null, userId = 'unknown') {
    const base = current && typeof current === 'object' ? current : levelingStore.defaultConfig();

    const messageXpMin = Math.max(1, Math.min(300, Number.parseInt(body.messageXpMin ?? base.messageXpMin ?? 10, 10) || 10));
    const messageXpMax = Math.max(messageXpMin, Math.min(500, Number.parseInt(body.messageXpMax ?? base.messageXpMax ?? 16, 10) || 16));

    const roleRewards = Array.isArray(body.roleRewards)
        ? body.roleRewards
            .map((item) => ({
                level: Math.max(1, Number.parseInt(item?.level, 10) || 1),
                roleId: String(item?.roleId || '').trim()
            }))
            .filter((item) => item.roleId)
            .sort((a, b) => a.level - b.level)
            .slice(0, 50)
        : (Array.isArray(base.roleRewards) ? base.roleRewards : []);

    const levelUpAnnounceChannelId = String(body.levelUpAnnounceChannelId ?? base.levelUpAnnounceChannelId ?? '').trim();

    return {
        enabled: body.enabled === true,
        messageXpEnabled: body.messageXpEnabled !== false,
        voiceXpEnabled: body.voiceXpEnabled !== false,
        messageCooldownMs: Math.max(10000, Math.min(300000, Number.parseInt(body.messageCooldownMs ?? base.messageCooldownMs ?? 45000, 10) || 45000)),
        messageXpMin,
        messageXpMax,
        voiceXpPerMinute: Math.max(1, Math.min(100, Number.parseInt(body.voiceXpPerMinute ?? base.voiceXpPerMinute ?? 6, 10) || 6)),
        voiceRequirePeers: body.voiceRequirePeers !== false,
        xpMultiplier: sanitizeXpMultiplier(body.xpMultiplier ?? base.xpMultiplier ?? 1),
        difficulty: sanitizeDifficulty(body.difficulty || base.difficulty || {}),
        roleRewards,
        levelUpAnnounceChannelId: /^\d{10,25}$/.test(levelUpAnnounceChannelId) ? levelUpAnnounceChannelId : '',
        updatedAt: new Date().toISOString(),
        updatedBy: userId
    };
}

function normalizeTempVoiceConfigInput(body = {}, current = null, userId = 'unknown') {
    const base = current && typeof current === 'object' ? current : tempVoiceStore.defaultConfig();

    const template = String(body.channelNameTemplate ?? base.channelNameTemplate ?? 'Canal de {username}')
        .replace(/[\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 95);

    return {
        enabled: body.enabled === true,
        creatorChannelId: String(body.creatorChannelId ?? base.creatorChannelId ?? '').trim(),
        categoryId: String(body.categoryId ?? base.categoryId ?? '').trim(),
        channelNameTemplate: template || 'Canal de {username}',
        allowCustomNames: body.allowCustomNames !== false,
        sendManageEmbed: body.sendManageEmbed === true,
        userLimit: Math.max(0, Math.min(99, Number.parseInt(body.userLimit ?? base.userLimit ?? 0, 10) || 0)),
        updatedAt: new Date().toISOString(),
        updatedBy: userId
    };
}

function normalizeAntiRaidConfigInput(body = {}, current = null, userId = 'unknown') {
    const base = current && typeof current === 'object' ? current : antiRaidStore.defaultConfig();
    const trustedRoleIds = Array.isArray(body.trustedRoleIds)
        ? body.trustedRoleIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 50)
        : (Array.isArray(base.trustedRoleIds) ? base.trustedRoleIds : []);

    return {
        enabled: body.enabled !== false,
        antiSpamEnabled: body.antiSpamEnabled !== false,
        spamMessages: Math.max(3, Math.min(40, Number.parseInt(body.spamMessages ?? base.spamMessages ?? 7, 10) || 7)),
        spamWindowSec: Math.max(3, Math.min(120, Number.parseInt(body.spamWindowSec ?? base.spamWindowSec ?? 8, 10) || 8)),
        blockInvites: body.blockInvites !== false,
        blockLinks: body.blockLinks === true,
        maxMentions: Math.max(1, Math.min(50, Number.parseInt(body.maxMentions ?? base.maxMentions ?? 6, 10) || 6)),
        maxRoleMentions: Math.max(1, Math.min(25, Number.parseInt(body.maxRoleMentions ?? base.maxRoleMentions ?? 3, 10) || 3)),
        joinRateThreshold: Math.max(2, Math.min(60, Number.parseInt(body.joinRateThreshold ?? base.joinRateThreshold ?? 8, 10) || 8)),
        raidJoinHardThreshold: Math.max(4, Math.min(120, Number.parseInt(body.raidJoinHardThreshold ?? base.raidJoinHardThreshold ?? 15, 10) || 15)),
        accountAgeDays: Math.max(0, Math.min(365, Number.parseInt(body.accountAgeDays ?? base.accountAgeDays ?? 3, 10) || 3)),
        actionMode: ['timeout', 'kick', 'ban'].includes(String(body.actionMode || base.actionMode || 'timeout'))
            ? String(body.actionMode || base.actionMode || 'timeout')
            : 'timeout',
        timeoutMinutes: Math.max(1, Math.min(40320, Number.parseInt(body.timeoutMinutes ?? base.timeoutMinutes ?? 30, 10) || 30)),
        actionCooldownSec: Math.max(5, Math.min(600, Number.parseInt(body.actionCooldownSec ?? base.actionCooldownSec ?? 30, 10) || 30)),
        duplicateMessageThreshold: Math.max(2, Math.min(12, Number.parseInt(body.duplicateMessageThreshold ?? base.duplicateMessageThreshold ?? 3, 10) || 3)),
        duplicateWindowSec: Math.max(3, Math.min(120, Number.parseInt(body.duplicateWindowSec ?? base.duplicateWindowSec ?? 20, 10) || 20)),
        protectChannels: body.protectChannels !== false,
        protectRoles: body.protectRoles !== false,
        destructiveActionThreshold: Math.max(1, Math.min(30, Number.parseInt(body.destructiveActionThreshold ?? base.destructiveActionThreshold ?? 3, 10) || 3)),
        actionWindowSec: Math.max(10, Math.min(300, Number.parseInt(body.actionWindowSec ?? base.actionWindowSec ?? 60, 10) || 60)),
        trustedRoleIds,
        alertChannelId: String(body.alertChannelId ?? base.alertChannelId ?? '').trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: userId
    };
}

function normalizeStreamAlertConfigInput(body = {}, current = null, userId = 'unknown') {
    const base = current && typeof current === 'object' ? current : streamAlertStore.defaultConfig();
    const rawSources = Array.isArray(body.sources)
        ? body.sources
        : (Array.isArray(base.sources) ? base.sources : []);

    const sources = rawSources
        .map((source, index) => {
            const fallbackId = String(source?.id || `src_${Date.now()}_${index}`);
            const platform = String(source?.platform || 'custom').toLowerCase();
            return {
                id: fallbackId.slice(0, 60),
                enabled: source?.enabled !== false,
                platform: ['twitch', 'youtube', 'tiktok', 'custom'].includes(platform) ? platform : 'custom',
                name: String(source?.name || 'Fuente').slice(0, 80),
                url: String(source?.url || '').trim().slice(0, 600),
                feedUrl: String(source?.feedUrl || '').trim().slice(0, 800),
                imageUrl: String(source?.imageUrl || '').trim().slice(0, 800),
                lastItemId: String(source?.lastItemId || '').slice(0, 500),
                lastPostedAt: String(source?.lastPostedAt || '')
            };
        })
        .filter((source) => Boolean(source.id))
        .slice(0, 20);

    const embedLargeFromBody = body.embedLargePreview;
    const embedLargePreview = typeof embedLargeFromBody === 'boolean'
        ? embedLargeFromBody
        : (base.embedLargePreview === true);

    return {
        enabled: body.enabled === true,
        channelId: String(body.channelId ?? base.channelId ?? '').trim(),
        mentionText: String(body.mentionText ?? base.mentionText ?? '').slice(0, 300),
        titleTemplate: String(body.titleTemplate ?? base.titleTemplate ?? '🔴 {platform}: {name} en directo').slice(0, 200),
        descriptionTemplate: String(body.descriptionTemplate ?? base.descriptionTemplate ?? '{title}\n{url}').slice(0, 1500),
        color: String(body.color ?? base.color ?? '7c4dff').replace('#', '').slice(0, 6) || '7c4dff',
        footerText: String(body.footerText ?? base.footerText ?? 'EyedBot Stream Alerts').slice(0, 200),
        embedLargePreview,
        sources,
        updatedAt: new Date().toISOString(),
        updatedBy: userId
    };
}

function normalizeGachaConfigInput(body = {}, current = null, userId = 'unknown') {
    const base = current && typeof current === 'object' ? current : gachaStore.defaultConfig();
    return gachaStore.normalizeConfig({
        ...base,
        enabled: body.enabled === true,
        channelId: String(body.channelId ?? base.channelId ?? '').trim(),
        rollCooldownSec: Number.parseInt(body.rollCooldownSec ?? base.rollCooldownSec ?? 60, 10),
        claimCooldownSec: Number.parseInt(body.claimCooldownSec ?? base.claimCooldownSec ?? 30, 10),
        claimWindowSec: Number.parseInt(body.claimWindowSec ?? base.claimWindowSec ?? 120, 10),
        pityThreshold: Number.parseInt(body.pityThreshold ?? base.pityThreshold ?? 30, 10),
        coinsPerClaim: Number.parseInt(body.coinsPerClaim ?? base.coinsPerClaim ?? 10, 10),
        economyEnabled: body.economyEnabled === true,
        shopEnabled: body.shopEnabled !== false,
        coinsPerXp: Number.parseInt(body.coinsPerXp ?? base.coinsPerXp ?? 1, 10),
        coinsPerLevelUp: Number.parseInt(body.coinsPerLevelUp ?? base.coinsPerLevelUp ?? 75, 10),
        coinsPerVoiceMinute: Number.parseInt(body.coinsPerVoiceMinute ?? base.coinsPerVoiceMinute ?? 1, 10),
        shopPriceMultiplier: Number.parseFloat(body.shopPriceMultiplier ?? base.shopPriceMultiplier ?? 2),
        minigameCoinflipReward: Number.parseInt(body.minigameCoinflipReward ?? base.minigameCoinflipReward ?? 8, 10),
        minigameDiceReward: Number.parseInt(body.minigameDiceReward ?? base.minigameDiceReward ?? 6, 10),
        minigameTriviaReward: Number.parseInt(body.minigameTriviaReward ?? base.minigameTriviaReward ?? 18, 10),
        minigameCooldownSec: Number.parseInt(body.minigameCooldownSec ?? base.minigameCooldownSec ?? 45, 10),
        updatedAt: new Date().toISOString(),
        updatedBy: userId
    });
}

app.get('/api/guild/:guildId/anti-raid-config', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await antiRaidStore.getAntiRaidConfig(guildId);
        res.json(config || antiRaidStore.defaultConfig());
    } catch (error) {
        console.error('Error obteniendo anti-raid config:', error);
        res.status(500).json({ error: 'Error al obtener configuración anti-raid' });
    }
});

app.post('/api/guild/:guildId/anti-raid-config', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const current = await antiRaidStore.getAntiRaidConfig(guildId);
        const config = normalizeAntiRaidConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');
        await antiRaidStore.setAntiRaidConfig(guildId, config);

        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando anti-raid config:', error);
        res.status(500).json({ error: 'Error al guardar configuración anti-raid' });
    }
});

app.get('/api/guild/:guildId/temp-voice-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await tempVoiceStore.getTempVoiceConfig(guildId);
        res.json(config || tempVoiceStore.defaultConfig());
    } catch (error) {
        console.error('Error obteniendo temp voice config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de voz temporal' });
    }
});

app.post('/api/guild/:guildId/temp-voice-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const current = await tempVoiceStore.getTempVoiceConfig(guildId);
        const config = normalizeTempVoiceConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');

        if (!config.creatorChannelId) {
            return res.status(400).json({ error: 'Debes seleccionar un canal creador de voz' });
        }

        await tempVoiceStore.setTempVoiceConfig(guildId, config);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando temp voice config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de voz temporal' });
    }
});

app.get('/api/guild/:guildId/twitch-live-preview', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        let login = String(req.query.login || '').trim().replace(/^@/, '').toLowerCase();
        if (!login) {
            login = extractTwitchLoginFromUrlOrName({
                url: String(req.query.url || ''),
                name: String(req.query.name || '')
            }).toLowerCase();
        }

        if (!login) {
            return res.status(400).json({ error: 'Indica el canal de Twitch (login o URL twitch.tv/…)' });
        }

        const staticFallback = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`;
        let live = null;
        try {
            live = await fetchTwitchLiveByLogin(login);
        } catch {
            live = null;
        }
        const rawPreview = live?.previewUrl || staticFallback;
        const previewUrl = cacheBustPreviewUrl(rawPreview);

        res.json({
            login,
            live: Boolean(live),
            previewUrl,
            title: live?.title || '',
            gameName: live?.gameName || '',
            viewerCount: Number(live?.viewerCount || 0),
            apiConfigured: Boolean(
                String(process.env.TWITCH_CLIENT_ID || '').trim()
                && String(process.env.TWITCH_CLIENT_SECRET || '').trim()
            )
        });
    } catch (error) {
        console.error('Error twitch-live-preview:', error);
        const login = String(req.query.login || '').trim().replace(/^@/, '').toLowerCase();
        if (login) {
            const staticFallback = `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`;
            return res.json({
                login,
                live: false,
                previewUrl: cacheBustPreviewUrl(staticFallback),
                title: '',
                gameName: '',
                viewerCount: 0,
                apiConfigured: false
            });
        }
        res.status(500).json({ error: 'No se pudo obtener la vista previa' });
    }
});

app.get('/api/guild/:guildId/stream-alert-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await streamAlertStore.getStreamAlertConfig(guildId);
        res.json({
            ...(config || streamAlertStore.defaultConfig()),
            streamPush: buildStreamPushStatus(),
            twitchEventSub: buildStreamPushStatus().twitch
        });
    } catch (error) {
        console.error('Error obteniendo stream alert config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de stream alerts' });
    }
});

app.post('/api/guild/:guildId/stream-alert-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const current = await streamAlertStore.getStreamAlertConfig(guildId);
        const config = normalizeStreamAlertConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');

        if (config.enabled && !config.channelId) {
            return res.status(400).json({ error: 'Debes seleccionar un canal de notificaciones' });
        }

        await streamAlertStore.setStreamAlertConfig(guildId, config);
        scheduleAllStreamPushSync();
        res.json({
            success: true,
            config,
            streamPush: buildStreamPushStatus(),
            twitchEventSub: buildStreamPushStatus().twitch
        });
    } catch (error) {
        console.error('Error guardando stream alert config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de stream alerts' });
    }
});

app.post('/api/guild/:guildId/stream-alert-test', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const current = await streamAlertStore.getStreamAlertConfig(guildId);
        const config = normalizeStreamAlertConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');

        const channel = guild.channels.cache.get(config.channelId)
            || await guild.channels.fetch(config.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return res.status(400).json({ error: 'Canal de notificaciones no válido' });
        }

        const firstSource = Array.isArray(config.sources) && config.sources.length > 0
            ? config.sources[0]
            : {
                platform: 'custom',
                name: 'Fuente de prueba',
                url: 'https://example.com/stream',
                imageUrl: ''
            };

        let mockItem = {
            itemId: 'web-test-preview',
            title: 'Stream de prueba en vivo',
            description: 'Este es un mensaje de prueba desde el panel web.',
            url: firstSource.url || 'https://example.com/stream',
            imageUrl: String(firstSource.imageUrl || '').trim()
        };

        const plat = String(firstSource.platform || 'custom').toLowerCase();
        if (plat === 'twitch') {
            const login = extractTwitchLoginFromUrlOrName(firstSource);
            const live = login ? await fetchTwitchLiveByLogin(login) : null;
            const staticFallback = login
                ? `https://static-cdn.jtvnw.net/previews-ttv/live_user_${login}-1280x720.jpg`
                : '';
            const previewRaw = live?.previewUrl || staticFallback || mockItem.imageUrl;
            mockItem = {
                itemId: 'web-test-preview',
                title: live?.title || mockItem.title,
                description: live
                    ? `En vivo en Twitch (${live.gameName || 'Sin categoría'})${live.viewerCount ? ` · ~${live.viewerCount} espectadores` : ''}`
                    : mockItem.description,
                url: String(firstSource.url || (login ? `https://twitch.tv/${login}` : mockItem.url)),
                imageUrl: previewRaw ? cacheBustPreviewUrl(previewRaw) : mockItem.imageUrl
            };
        }

        const embed = buildStreamAlertEmbed(config, firstSource, mockItem);

        await channel.send({
            content: String(config.mentionText || '').trim() || undefined,
            embeds: [embed]
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error enviando stream alert test:', error);
        res.status(500).json({ error: 'Error al enviar prueba de stream alert' });
    }
});

app.get('/api/guild/:guildId/gacha-config', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await gachaStore.getConfig(guildId);
        res.json(config || gachaStore.defaultConfig());
    } catch (error) {
        console.error('Error obteniendo gacha config:', error);
        res.status(500).json({ error: 'Error al obtener configuración gacha' });
    }
});

app.post('/api/guild/:guildId/gacha-config', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!hasAdminOrManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'Necesitas permisos de gestión en este servidor' });
        }

        const current = await gachaStore.getConfig(guildId);
        const config = normalizeGachaConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');
        if (config.enabled && !config.channelId) {
            return res.status(400).json({ error: 'Debes seleccionar un canal para activar gacha' });
        }

        const saved = await gachaStore.setConfig(guildId, config);
        res.json({ success: true, config: saved });
    } catch (error) {
        console.error('Error guardando gacha config:', error);
        res.status(500).json({ error: 'Error al guardar configuración gacha' });
    }
});

app.get('/api/guild/:guildId/gacha-stats', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const guild = botClient?.guilds?.cache?.get(guildId) || null;
        const config = await gachaStore.getConfig(guildId);
        const stats = await gachaStore.getGuildStats(guildId);
        const top = await Promise.all((stats.topClaimers || []).slice(0, 15).map(async (item) => {
            const member = guild?.members?.cache?.get(item.userId)
                || await guild?.members?.fetch?.(item.userId).catch(() => null);
            const user = member?.user || botClient?.users?.cache?.get(item.userId) || null;
            return {
                userId: item.userId,
                username: user?.username || `ID ${item.userId}`,
                tag: user?.tag || `ID ${item.userId}`,
                avatar: user?.displayAvatarURL?.({ dynamic: true, size: 128 }) || null,
                totalClaims: item.totalClaims || 0,
                totalRolls: item.totalRolls || 0,
                collectionCount: item.collectionCount || 0,
                coins: item.coins || 0,
                bestRarity: item.bestRarity || 'N'
            };
        }));

        res.json({
            success: true,
            config,
            stats: {
                ...stats,
                topClaimers: top
            }
        });
    } catch (error) {
        console.error('Error obteniendo gacha stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas gacha' });
    }
});

app.get('/api/guild/:guildId/gacha-inventory', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const userId = String(req.query.userId || req.session.user?.id || '').trim();
        if (!userId) return res.status(400).json({ error: 'userId requerido' });

        const rarity = String(req.query.rarity || '').trim();
        const series = String(req.query.series || '').trim();
        const q = String(req.query.q || '').trim();
        const limit = Math.max(1, Math.min(500, Number.parseInt(`${req.query.limit || 100}`, 10) || 100));
        const inv = await gachaStore.listInventory(guildId, userId, { rarity, series, q, limit });
        res.json({ success: true, ...inv });
    } catch (error) {
        console.error('Error obteniendo inventario gacha:', error);
        res.status(500).json({ error: 'Error al obtener inventario gacha' });
    }
});

app.get('/api/guild/:guildId/gacha-market', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        await gachaStore.ensureGuildEconomyContent(guildId);
        const market = await gachaStore.getGuildMarket(guildId);
        res.json({ success: true, listings: market });
    } catch (error) {
        console.error('Error obteniendo mercado gacha:', error);
        res.status(500).json({ error: 'Error al obtener mercado gacha' });
    }
});

app.get('/api/guild/:guildId/gacha-shop', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        await gachaStore.ensureGuildEconomyContent(guildId);
        const config = await gachaStore.getConfig(guildId);
        const imageIds = await gachaStore.listGuildCatalogShopImageIds(guildId);
        const items = (await gachaStore.listShopCatalogForAdmin(guildId, config)).slice(0, 250).map((row) => ({
            ...row,
            catalogDbImage: imageIds.has(row.id)
        }));
        const visibleShop = await gachaStore.getShopCatalog(guildId, config);
        const removedFromCatalogCount = items.filter((item) => item.catalogRemoved === true).length;
        res.json({
            success: true,
            items,
            visibleShopCount: visibleShop.length,
            totalItems: items.length,
            removedFromCatalogCount,
            config
        });
    } catch (error) {
        console.error('Error obteniendo tienda gacha:', error);
        res.status(500).json({ error: 'Error al obtener catálogo de tienda' });
    }
});

app.post('/api/guild/:guildId/gacha-catalog/:characterId', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, characterId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!hasAdminOrManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'Necesitas permisos de gestión en este servidor' });
        }

        const result = await gachaStore.setGuildCatalogItem(
            guildId,
            characterId,
            req.body || {},
            req.session.user?.id || 'web'
        );
        if (!result.ok) return res.status(400).json({ error: result.reason || 'No se pudo guardar el objeto' });

        await gachaStore.ensureGuildEconomyContent(guildId);
        res.json({ success: true, item: result.item });
    } catch (error) {
        console.error('Error guardando objeto del catálogo gacha:', error);
        res.status(500).json({ error: 'Error al guardar objeto del catálogo' });
    }
});

app.get('/api/guild/:guildId/gacha-catalog/:characterId/image', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, characterId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).end();

        const row = await gachaStore.resolveGuildCatalogShopImage(guildId, characterId);
        if (!row?.data?.length) return res.status(404).end();

        const mime = String(row.mime || 'image/png').split(';')[0].trim();
        res.setHeader('Content-Type', mime);
        res.setHeader('Content-Length', String(row.data.length));
        res.setHeader('Cache-Control', 'private, no-cache');
        return res.send(row.data);
    } catch (error) {
        console.error('Error sirviendo imagen de catálogo gacha:', error);
        return res.status(500).end();
    }
});

app.delete('/api/guild/:guildId/gacha-catalog/:characterId', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId, characterId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!hasAdminOrManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'Necesitas permisos de gestión en este servidor' });
        }

        const result = await gachaStore.deleteGuildCatalogItem(
            guildId,
            characterId,
            req.session.user?.id || 'web'
        );
        if (!result.ok) {
            const msg = result.reason === 'no_override'
                ? 'Este personaje no tiene personalización guardada en la base de datos.'
                : (result.reason || 'No se pudo eliminar');
            return res.status(400).json({ error: msg });
        }

        await gachaStore.ensureGuildEconomyContent(guildId);
        res.json({ success: true, item: result.item });
    } catch (error) {
        console.error('Error eliminando personalización del catálogo:', error);
        res.status(500).json({ error: 'Error al eliminar objeto del catálogo' });
    }
});

app.get('/api/guild/:guildId/gacha-leaderboard', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        const config = await gachaStore.getConfig(guildId);
        const profiles = await gachaStore.listGuildProfiles(guildId);
        const sorted = profiles.slice().sort((left, right) => {
            const coinsDelta = (right.coins || 0) - (left.coins || 0);
            if (coinsDelta !== 0) return coinsDelta;
            const claimsDelta = (right.totalClaims || 0) - (left.totalClaims || 0);
            if (claimsDelta !== 0) return claimsDelta;
            return (right.collectionCount || 0) - (left.collectionCount || 0);
        });
        const topCoins = Math.max(1, sorted[0]?.coins || 0);

        const leaderboard = await Promise.all(sorted.slice(0, 25).map(async (entry) => {
            const member = guild?.members?.cache?.get(entry.userId)
                || await guild?.members?.fetch?.(entry.userId).catch(() => null);
            const user = member?.user || botClient.users.cache.get(entry.userId) || null;
            const coins = Number(entry.coins || 0);
            return {
                userId: entry.userId,
                username: user?.username || 'Usuario',
                tag: user?.tag || `ID ${entry.userId}`,
                avatar: user?.displayAvatarURL?.({ dynamic: true, size: 128 }) || null,
                coins,
                totalClaims: Number(entry.totalClaims || 0),
                totalRolls: Number(entry.totalRolls || 0),
                collectionCount: Number(entry.collectionCount || 0),
                bestRarity: String(entry.bestRarity || 'N').toUpperCase(),
                progressPercent: Math.max(0, Math.min(100, Math.round((coins / topCoins) * 100)))
            };
        }));

        res.json({
            success: true,
            enabled: config?.economyEnabled === true || config?.enabled === true,
            totalTrackedUsers: profiles.length,
            leaderboard
        });
    } catch (error) {
        console.error('Error obteniendo leaderboard gacha:', error);
        res.status(500).json({ error: 'Error al obtener leaderboard gacha' });
    }
});

app.post('/api/guild/:guildId/gacha-market/list', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        const userId = req.session.user?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        const itemUid = String(req.body?.itemUid || '').trim();
        const price = Number.parseInt(`${req.body?.price || 0}`, 10);
        const result = await gachaStore.createMarketListing(guildId, userId, itemUid, price);
        if (!result.ok) return res.status(400).json({ error: result.reason || 'No se pudo publicar' });
        res.json({ success: true, listing: result.listing });
    } catch (error) {
        console.error('Error creando listing gacha:', error);
        res.status(500).json({ error: 'Error al publicar listing' });
    }
});

app.post('/api/guild/:guildId/gacha-market/buy', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        const userId = req.session.user?.id;
        if (!userId) return res.status(401).json({ error: 'No autenticado' });

        const listingId = String(req.body?.listingId || '').trim();
        const result = await gachaStore.buyMarketListing(guildId, userId, listingId);
        if (!result.ok) return res.status(400).json({ error: result.reason || 'No se pudo comprar' });
        res.json({ success: true, purchased: result.listing });
    } catch (error) {
        console.error('Error comprando listing gacha:', error);
        res.status(500).json({ error: 'Error al comprar listing' });
    }
});

// ============================================================
// FREE GAMES (Epic Games / Steam)
// ============================================================

app.get('/api/guild/:guildId/free-games/config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await freeGamesStore.getFreeGamesConfig(guildId);
        res.json(config || freeGamesStore.defaultConfig());
    } catch (error) {
        console.error('Error obteniendo free-games config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de juegos gratis' });
    }
});

app.post('/api/guild/:guildId/free-games/config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const current = await freeGamesStore.getFreeGamesConfig(guildId);
        const body = req.body || {};
        const config = freeGamesStore.normalizeConfig({
            ...current,
            enabled: body.enabled === true,
            channelId: String(body.channelId || '').trim(),
            mentionText: String(body.mentionText || '').slice(0, 300),
            sources: {
                epic: body?.sources?.epic !== false,
                steam: body?.sources?.steam !== false
            },
            color: String(body.color || current.color || '4ccb81').replace('#', '').slice(0, 6),
            footerText: String(body.footerText || current.footerText || 'EyedBot · Juegos gratis').slice(0, 200),
            notifiedIds: current.notifiedIds || [],
            embedMessages: current.embedMessages || [],
            updatedBy: req.session.user?.id || 'unknown'
        });

        if (config.enabled && !config.channelId) {
            return res.status(400).json({ error: 'Debes seleccionar un canal de notificaciones' });
        }

        const saved = await freeGamesStore.setFreeGamesConfig(guildId, config);
        res.json({ success: true, config: saved });
    } catch (error) {
        console.error('Error guardando free-games config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de juegos gratis' });
    }
});

app.get('/api/guild/:guildId/free-games/preview', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const includeEpic = req.query.epic !== '0';
        const includeSteam = req.query.steam !== '0';
        const force = req.query.force === '1';

        const games = await freeGamesService.fetchAllFreeGames({ includeEpic, includeSteam, force });
        res.json({
            success: true,
            count: games.length,
            fetchedAt: new Date().toISOString(),
            games
        });
    } catch (error) {
        console.error('Error en free-games preview:', error);
        res.status(500).json({ error: 'No se pudieron cargar los juegos gratis' });
    }
});

app.post('/api/guild/:guildId/free-games/test', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const current = await freeGamesStore.getFreeGamesConfig(guildId);
        const body = req.body || {};
        const config = freeGamesStore.normalizeConfig({
            ...current,
            enabled: true,
            channelId: String(body.channelId || current.channelId || '').trim(),
            mentionText: String(body.mentionText || current.mentionText || '').slice(0, 300),
            sources: body.sources && typeof body.sources === 'object' ? body.sources : current.sources,
            color: String(body.color || current.color || '4ccb81').replace('#', '').slice(0, 6),
            footerText: String(body.footerText || current.footerText || 'EyedBot · Juegos gratis').slice(0, 200),
            notifiedIds: current.notifiedIds || [],
            updatedBy: req.session.user?.id || 'unknown'
        });

        if (!config.channelId) {
            return res.status(400).json({ error: 'Selecciona un canal antes de enviar la prueba' });
        }

        const channel = guild.channels.cache.get(config.channelId)
            || await guild.channels.fetch(config.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return res.status(400).json({ error: 'Canal inválido' });
        }

        // Elegir un juego real si hay, si no armar uno demo
        const games = await freeGamesService.fetchAllFreeGames({
            includeEpic: config.sources.epic !== false,
            includeSteam: config.sources.steam !== false
        });
        const demo = games[0] || {
            id: 'demo_0',
            source: 'epic',
            sourceLabel: 'Epic Games',
            title: 'Juego de prueba',
            description: 'Este es un mensaje de prueba enviado desde el panel web. Un juego real aparecerá aquí cuando se detecte una promoción.',
            imageUrl: 'https://cdn2.unrealengine.com/egs-homepagepromoblade-tallpromomay2023-1920x1080-1920x1080-7e79fcf0b3a0.jpg',
            thumbnailUrl: '',
            originalPriceMinor: 2999,
            currency: 'EUR',
            originalPrice: '29,99 €',
            discountPercent: 100,
            endsAt: new Date(Date.now() + 5 * 86400000).toISOString(),
            isUpcoming: false,
            storeUrl: 'https://store.epicgames.com/es-ES/free-games',
            tags: ['Acción', 'Aventura'],
            publisher: 'EyedBot Studios'
        };

        const embed = freeGamesService.buildFreeGameEmbed(demo, config);

        await channel.send({
            content: `🧪 **Prueba de notificación**${config.mentionText ? `\n${config.mentionText}` : ''}`,
            embeds: [embed],
            allowedMentions: { parse: ['users', 'roles', 'everyone'] }
        });

        res.json({ success: true, sample: demo });
    } catch (error) {
        console.error('Error enviando free-games test:', error);
        res.status(500).json({ error: 'Error al enviar prueba' });
    }
});

app.post('/api/guild/:guildId/free-games/refresh-embeds', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const current = await freeGamesStore.getFreeGamesConfig(guildId);
        const body = req.body || {};
        const config = freeGamesStore.normalizeConfig({
            ...current,
            channelId: String(body.channelId || current.channelId || '').trim(),
            mentionText: String(body.mentionText ?? current.mentionText ?? '').slice(0, 300),
            sources: body.sources && typeof body.sources === 'object' ? body.sources : current.sources,
            color: String(body.color || current.color || '4ccb81').replace('#', '').slice(0, 6),
            footerText: String(body.footerText || current.footerText || 'EyedBot · Juegos gratis').slice(0, 200),
            notifiedIds: current.notifiedIds || [],
            embedMessages: current.embedMessages || [],
            updatedBy: req.session.user?.id || 'unknown'
        });

        if (!config.channelId) {
            return res.status(400).json({ error: 'Selecciona un canal de notificaciones' });
        }

        const channel = guild.channels.cache.get(config.channelId)
            || await guild.channels.fetch(config.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return res.status(400).json({ error: 'Canal inválido' });
        }

        const perms = channel.permissionsFor(guild.members.me);
        if (!perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks', 'ReadMessageHistory'])) {
            return res.status(403).json({ error: 'El bot no tiene permisos para leer y editar mensajes en ese canal' });
        }

        const result = await freeGamesService.refreshFreeGameEmbedsInChannel(
            channel,
            config,
            botClient.user.id,
            { scanLimit: 100 }
        );

        const saved = await freeGamesStore.setFreeGamesConfig(guildId, {
            ...config,
            embedMessages: config.embedMessages || [],
            updatedAt: new Date().toISOString()
        });

        res.json({
            success: true,
            ...result,
            config: saved
        });
    } catch (error) {
        console.error('Error actualizando embeds free-games:', error);
        res.status(500).json({ error: error.message || 'No se pudieron actualizar los embeds' });
    }
});

// ============================================================
// GENERADOR DE CANALES (plantillas)
// ============================================================

app.get('/api/guild/:guildId/channel-setup', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!canManageServerChannels(userGuild)) {
            return res.status(403).json({ error: 'Necesitas administrador, gestionar servidor o gestionar canales en Discord' });
        }
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'El bot no está en este servidor' });

        const me = guild.members.me || await guild.members.fetch(botClient.user.id).catch(() => null);
        if (!me?.permissions?.has('ManageChannels')) {
            return res.status(403).json({ error: 'El bot necesita el permiso «Gestionar canales»' });
        }

        const templates = channelSetupTemplates.listTemplateSummaries();
        const conflictsByTemplate = {};
        for (const t of templates) {
            const payload = channelSetupTemplates.listConflicts(guild, t.id);
            if (payload.error) {
                conflictsByTemplate[t.id] = { error: payload.error };
            } else {
                conflictsByTemplate[t.id] = {
                    conflicts: payload.conflicts,
                    preview: payload.preview
                };
            }
        }

        res.json({ templates, conflictsByTemplate });
    } catch (error) {
        console.error('Error channel-setup GET:', error);
        res.status(500).json({ error: 'Error al cargar el generador de canales' });
    }
});

app.post('/api/guild/:guildId/channel-setup/apply', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!canManageServerChannels(userGuild)) {
            return res.status(403).json({ error: 'Necesitas administrador, gestionar servidor o gestionar canales en Discord' });
        }
        if (!botClient) return res.status(503).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'El bot no está en este servidor' });

        const me = guild.members.me || await guild.members.fetch(botClient.user.id).catch(() => null);
        if (!me?.permissions?.has('ManageChannels')) {
            return res.status(403).json({ error: 'El bot necesita el permiso «Gestionar canales»' });
        }

        const templateId = String(req.body?.templateId || 'standard');
        const skipExisting = req.body?.skipExisting !== false;

        if (!channelSetupTemplates.TEMPLATES[templateId]) {
            return res.status(400).json({
                success: false,
                error: 'Plantilla no válida',
                created: [],
                skipped: [],
                errors: []
            });
        }

        const result = await channelSetupTemplates.applyTemplate(guild, templateId, { skipExisting });

        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error channel-setup apply:', error);
        res.status(500).json({ error: error.message || 'Error al crear canales' });
    }
});

app.get('/api/guild/:guildId/leveling-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await levelingStore.getLevelingConfig(guildId);
        res.json(config || levelingStore.defaultConfig());
    } catch (error) {
        console.error('Error obteniendo leveling config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de niveles' });
    }
});

app.post('/api/guild/:guildId/leveling-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const current = await levelingStore.getLevelingConfig(guildId);
        const config = normalizeLevelingConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');
        await levelingStore.setLevelingConfig(guildId, config);

        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando leveling config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de niveles' });
    }
});

app.get('/api/guild/:guildId/leveling-leaderboard', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const config = await levelingStore.getLevelingConfig(guildId);
        const users = await levelingStore.listGuildUsers(guildId);

        const top = users
            .sort((a, b) => (b.xp || 0) - (a.xp || 0))
            .slice(0, 25)
            .map((entry) => {
                const member = guild.members.cache.get(entry.userId);
                const user = member?.user || botClient.users.cache.get(entry.userId) || null;
                const progress = getProgress(entry.xp || 0, config?.difficulty || {});
                return {
                    userId: entry.userId,
                    username: user?.username || 'Usuario',
                    tag: user?.tag || `ID ${entry.userId}`,
                    avatar: user?.displayAvatarURL?.({ dynamic: true, size: 128 }) || null,
                    xp: entry.xp || 0,
                    level: progress.level,
                    messageCount: entry.messageCount || 0,
                    voiceMinutes: entry.voiceMinutes || 0,
                    progressPercent: progress.percent
                };
            });

        res.json({
            enabled: config?.enabled === true,
            totalTrackedUsers: users.length,
            leaderboard: top
        });
    } catch (error) {
        console.error('Error obteniendo leaderboard de niveles:', error);
        res.status(500).json({ error: 'Error al obtener leaderboard de niveles' });
    }
});

app.get('/api/guild/:guildId/welcome-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await welcomeStore.getWelcomeConfig(guildId);
        const fallbackChannel = await welcomeStore.getWelcomeChannelId(guildId);

        if (!config) return res.json(buildDefaultGreetingConfig('welcome', fallbackChannel));

        if (!config.channelId && fallbackChannel) config.channelId = fallbackChannel;
        res.json(config);
    } catch (error) {
        console.error('Error obteniendo welcome config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de bienvenida' });
    }
});

app.post('/api/guild/:guildId/verify-image', requireAuth, upload.single('imageFile'), async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const file = req.file;
        if (!file?.buffer) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
        if (!String(file.mimetype || '').startsWith('image/')) {
            return res.status(400).json({ error: 'El archivo debe ser una imagen' });
        }

        const uploadsDir = ensureVerifyUploadsDir();
        const baseName = sanitizeUploadName(path.parse(file.originalname || '').name || `verify-${guildId}`);
        const extension = extFromMimeOrName(file.mimetype, file.originalname);
        const fileName = `${guildId}_${Date.now()}_${baseName}${extension}`;
        const outputPath = path.join(uploadsDir, fileName);

        fs.writeFileSync(outputPath, file.buffer);

        const publicPath = `/uploads/verify/${fileName}`;
        const publicUrl = `${req.protocol}://${req.get('host')}${publicPath}`;
        res.json({ success: true, url: publicUrl, path: publicPath });
    } catch (error) {
        console.error('Error subiendo imagen de verify:', error);
        res.status(500).json({ error: 'Error al subir imagen de verify' });
    }
});

app.get('/api/guild/:guildId/greeting-image/:slot', requireAuth, async (req, res) => {
    try {
        const { guildId, slot } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const image = await greetingImageStore.getImage(guildId, slot);
        if (!image?.data?.length) {
            return res.status(404).json({ error: 'Imagen no encontrada' });
        }

        res.setHeader('Content-Type', image.mime);
        res.setHeader('Cache-Control', 'private, max-age=300');
        return res.send(image.data);
    } catch (error) {
        console.error('Error sirviendo imagen greeting:', error);
        res.status(500).json({ error: 'Error al cargar la imagen' });
    }
});

app.post('/api/guild/:guildId/welcome-image', requireAuth, upload.single('imageFile'), async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const file = req.file;
        if (!file?.buffer) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
        if (!String(file.mimetype || '').startsWith('image/')) {
            return res.status(400).json({ error: 'El archivo debe ser una imagen' });
        }

        const slot = greetingImageStore.normalizeSlot(req.body?.slot || 'welcome');
        const storedDb = await greetingImageStore.setImage(guildId, slot, file.buffer, file.mimetype);

        const uploadsDir = ensureWelcomeUploadsDir();
        const baseName = sanitizeUploadName(path.parse(file.originalname || '').name || `welcome-${guildId}`);
        const extension = extFromMimeOrName(file.mimetype, file.originalname);
        const fileName = `${guildId}_${slot}_${Date.now()}_${baseName}${extension}`;
        const outputPath = path.join(uploadsDir, fileName);
        fs.writeFileSync(outputPath, file.buffer);

        const apiPath = greetingImageStore.buildApiPath(guildId, slot);
        const panelUrl = `${req.protocol}://${req.get('host')}${apiPath}?t=${Date.now()}`;
        const publicUrl = buildPublicUploadUrl(req, apiPath);

        const isGoodbye = slot === 'goodbye' || slot === 'goodbye_thumb';
        const getCfg = isGoodbye ? welcomeStore.getGoodbyeConfig : welcomeStore.getWelcomeConfig;
        const setCfg = isGoodbye ? welcomeStore.setGoodbyeConfig : welcomeStore.setWelcomeConfig;
        const currentCfg = (await getCfg(guildId)) || {};
        const nextCfg = {
            ...currentCfg,
            updatedAt: new Date().toISOString(),
            updatedBy: req.session.user?.id || 'unknown'
        };
        if (slot.endsWith('_thumb')) {
            nextCfg.thumbnailUrl = apiPath;
            nextCfg.thumbnailMode = 'url';
        } else {
            nextCfg.imageUrl = apiPath;
        }
        await setCfg(guildId, nextCfg);
        welcomeStore.invalidateConfigCache(guildId);

        if (!storedDb) {
            return res.status(500).json({
                error: 'La imagen se guardó en disco pero no en MySQL. Revisa DB_HOST, DB_USER y DB_PASSWORD.',
                path: apiPath,
                url: panelUrl,
                storedInDb: false,
                storedOnDisk: true
            });
        }

        res.json({
            success: true,
            url: panelUrl,
            path: apiPath,
            publicUrl,
            storedInDb: true,
            storedOnDisk: true,
            config: nextCfg
        });
    } catch (error) {
        console.error('Error subiendo imagen de bienvenida:', error);
        res.status(500).json({ error: 'Error al subir imagen de bienvenida' });
    }
});

app.post('/api/guild/:guildId/gacha-catalog-upload', requireAuth, requirePremium, upload.single('imageFile'), async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!hasAdminOrManageGuildPermission(userGuild)) {
            return res.status(403).json({ error: 'Necesitas permisos de gestión en este servidor' });
        }

        const file = req.file;
        if (!file?.buffer) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
        if (!String(file.mimetype || '').startsWith('image/')) {
            return res.status(400).json({ error: 'El archivo debe ser una imagen' });
        }

        const characterId = String(req.body?.characterId || '').trim();
        if (!characterId) {
            return res.status(400).json({ error: 'Selecciona la fila del catálogo antes de subir (falta characterId).' });
        }

        const existsInGlobal = gachaStore.getCharacterPool().some((c) => c.id === characterId);
        if (!existsInGlobal) {
            return res.status(400).json({ error: 'Personaje no encontrado en el catálogo global del bot.' });
        }

        const stored = await gachaStore.setGuildCatalogShopImageBlob(guildId, characterId, file.buffer, file.mimetype);
        const diskPath = gachaStore.writeGuildCatalogShopDiskImage(guildId, characterId, file.buffer, file.mimetype);
        if (!stored && !diskPath) {
            return res.status(500).json({ error: 'No se pudo guardar la imagen (¿MySQL conectada?).' });
        }

        const panelImagePath = `/api/guild/${guildId}/gacha-catalog/${encodeURIComponent(characterId)}/image?t=${Date.now()}`;

        let catalogSaved = false;
        let catalogSaveReason = '';
        let catalogSaveError = '';
        let result = { ok: true, item: null };
        if (stored) {
            result = await gachaStore.setGuildCatalogItem(
                guildId,
                characterId,
                { imageUrl: '' },
                req.session.user?.id || 'web'
            );
        }
        if (!result.ok) {
            if (stored) await gachaStore.deleteGuildCatalogShopImageBlob(guildId, characterId).catch(() => null);
            if (diskPath) gachaStore.deleteGuildCatalogShopDiskImage(guildId, characterId);
            catalogSaveReason = String(result.reason || 'save_failed');
            const reasons = {
                item_not_found: 'personaje_no_en_catalogo_global',
                empty_patch: 'sin_cambios',
                invalid_id: 'id_invalido'
            };
            catalogSaveError = reasons[catalogSaveReason] || catalogSaveReason;
            return res.status(400).json({
                success: false,
                error: catalogSaveError || catalogSaveReason,
                catalogSaveReason,
                catalogSaveError
            });
        }

        catalogSaved = result.ok && (!!stored || !!diskPath);
        await gachaStore.ensureGuildEconomyContent(guildId);

        const publicDiskUrl = diskPath ? buildPublicUploadUrl(req, diskPath) : '';

        res.json({
            success: true,
            storedInDb: !!stored,
            storedOnDisk: !!diskPath,
            url: panelImagePath,
            publicDiskUrl,
            catalogSaved,
            discordEmbedUnreachable: false
        });
    } catch (error) {
        console.error('Error subiendo imagen de catálogo gacha:', error);
        res.status(500).json({ error: 'Error al subir imagen del catálogo' });
    }
});

app.post('/api/guild/:guildId/welcome-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const body = req.body || {};
        if (!body.channelId) return res.status(400).json({ error: 'Debes seleccionar un canal de bienvenida' });

        const existing = await welcomeStore.getWelcomeConfig(guildId);
        const config = normalizeGreetingConfigInput(body, 'welcome', req.session.user?.id, existing);

        await welcomeStore.setWelcomeConfig(guildId, config);
        await welcomeStore.setWelcomeChannelId(guildId, config.channelId);
        welcomeStore.invalidateConfigCache(guildId);

        res.json({ success: true, config, storedInDb: true });
    } catch (error) {
        console.error('Error guardando welcome config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de bienvenida' });
    }
});

app.post('/api/guild/:guildId/welcome-test', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const cfg = await welcomeStore.getWelcomeConfig(guildId);
        const channelId = cfg?.channelId || await welcomeStore.getWelcomeChannelId(guildId);
        const channel = channelId ? guild.channels.cache.get(channelId) : null;
        if (!channel) return res.status(404).json({ error: 'Canal de bienvenida no encontrado' });

        const member = guild.members.cache.get(req.session.user?.id) || await guild.members.fetch(req.session.user?.id).catch(() => null);
        if (!member) return res.status(404).json({ error: 'No pude obtener tu usuario en este servidor' });

        const content = cfg?.mentionUser ? `<@${member.id}>` : undefined;
        const allowedMentions = cfg?.mentionUser ? { parse: ['users'] } : undefined;

        if (cfg?.welcomeStyle === 'card') {
            const bg = await resolveWelcomeCardBackground(cfg.imageUrl, guildId);
            const buffer = await renderWelcomeCardPng({
                avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
                backgroundUrl: bg.backgroundUrl || null,
                backgroundFilePath: bg.backgroundFilePath || null,
                backgroundBuffer: bg.backgroundBuffer || null,
                headline: applyWelcomeTemplate(cfg.title || '¡Bienvenido!', member),
                displayName: applyWelcomeTemplate(cfg.cardNameTemplate || '{username}', member),
                subtitle: applyWelcomeTemplate(cfg.message || '¡Hola {user}!', member),
                overlayText: applyWelcomeTemplate(cfg.cardOverlayText || '', member),
                overlayHex: cfg.cardOverlayColor || 'ffffff',
                fontKey: cfg.cardFontKey || 'system',
                plainUsername: member.user.username,
                cardLayout: mergeCardLayout(cfg.cardLayout),
                accentHex: cfg.cardAccentColor || '4ade80',
                titleHex: cfg.cardTitleColor || 'ffffff',
                nameHex: cfg.cardNameColor || 'f8fafc',
                subtitleHex: cfg.cardSubtitleColor || 'e2e8f0'
            });
            const file = new AttachmentBuilder(buffer, { name: 'bienvenida-preview.png' });
            await channel.send({ content, files: [file], allowedMentions });
            return res.json({ success: true, message: 'Prueba de bienvenida enviada' });
        }

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor(cfg?.color || '7c4dff')
            .setTitle(applyWelcomeTemplate(cfg?.title || '¡Bienvenido!', member))
            .setDescription(applyWelcomeTemplate(cfg?.message || '¡Hola {user}!', member));

        if (cfg?.footer) embed.setFooter({ text: applyWelcomeTemplate(cfg.footer, member) });
        const files = [];
        if (cfg?.imageUrl) await applyWelcomeMediaToEmbed(embed, cfg.imageUrl, files, guild, 'image');
        if (cfg?.thumbnailMode === 'avatar') embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
        else if (cfg?.thumbnailMode === 'url' && cfg?.thumbnailUrl) {
            await applyWelcomeMediaToEmbed(embed, cfg.thumbnailUrl, files, guild, 'thumbnail');
        }

        await channel.send({ content, embeds: [embed], files, allowedMentions });

        res.json({ success: true, message: 'Prueba de bienvenida enviada' });
    } catch (error) {
        console.error('Error enviando welcome test:', error);
        res.status(500).json({ error: 'Error al enviar prueba de bienvenida' });
    }
});

app.post('/api/guild/:guildId/welcome-card-preview', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const body = req.body || {};
        const member = guild.members.cache.get(req.session.user?.id) || await guild.members.fetch(req.session.user?.id).catch(() => null);
        const stub = previewWelcomeMemberStub(guild, req.session.user);

        const tplMember = member || stub;
        const avatarUrl = member
            ? member.user.displayAvatarURL({ extension: 'png', size: 256 })
            : sessionUserAvatarUrl(req.session.user);
        const plainUser = member ? member.user.username : (req.session.user?.username || 'Usuario');
        const nameTpl = String(body.cardNameTemplate != null ? body.cardNameTemplate : '{username}').trim() || '{username}';

        const bg = await resolveWelcomeCardBackground(body.imageUrl, guildId);
        const titleRaw = String(body.title != null ? body.title : '').trim();
        const messageRaw = String(body.message != null ? body.message : '').trim();
        const subtitleTpl =
            messageRaw || '¡Hola {user}! Bienvenido a **{server}**. Eres el miembro #{memberCount}.';

        const hasResolvedHeadline = body.previewHeadline != null && String(body.previewHeadline).trim() !== '';
        const hasResolvedName = body.previewDisplayName != null && String(body.previewDisplayName).trim() !== '';
        const hasResolvedSub = body.previewSubtitle != null && String(body.previewSubtitle).trim() !== '';
        const hasResolvedOverlay = body.previewOverlay != null && String(body.previewOverlay).trim() !== '';

        const headline = hasResolvedHeadline
            ? String(body.previewHeadline)
            : applyWelcomeTemplate(titleRaw || '¡Bienvenido!', tplMember);
        const displayName = hasResolvedName
            ? String(body.previewDisplayName)
            : applyWelcomeTemplate(nameTpl, tplMember);
        const subtitle = hasResolvedSub
            ? String(body.previewSubtitle)
            : applyWelcomeTemplate(subtitleTpl, tplMember);
        const overlayText = hasResolvedOverlay
            ? String(body.previewOverlay)
            : applyWelcomeTemplate(String(body.cardOverlayText || ''), tplMember);

        const buffer = await renderWelcomeCardPng({
            avatarUrl,
            backgroundUrl: bg.backgroundUrl || null,
            backgroundFilePath: bg.backgroundFilePath || null,
            backgroundBuffer: bg.backgroundBuffer || null,
            headline,
            displayName,
            subtitle,
            overlayText,
            overlayHex: sanitizeHexColor6(body.cardOverlayColor, 'ffffff'),
            fontKey: ['system', 'serif', 'mono', 'rounded', 'elegant'].includes(String(body.cardFontKey || '').toLowerCase())
                ? String(body.cardFontKey).toLowerCase()
                : 'system',
            plainUsername: plainUser,
            cardLayout: mergeCardLayout(body.cardLayout),
            accentHex: sanitizeHexColor6(body.cardAccentColor, '4ade80'),
            titleHex: sanitizeHexColor6(body.cardTitleColor, 'ffffff'),
            nameHex: sanitizeHexColor6(body.cardNameColor, 'f8fafc'),
            subtitleHex: sanitizeHexColor6(body.cardSubtitleColor, 'e2e8f0')
        });

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store');
        return res.send(buffer);
    } catch (error) {
        console.error('Error generando vista previa de tarjeta de bienvenida:', error);
        res.status(500).json({ error: 'Error al generar la vista previa' });
    }
});

app.get('/api/guild/:guildId/goodbye-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await welcomeStore.getGoodbyeConfig(guildId);
        const fallbackChannel = await welcomeStore.getGoodbyeChannelId(guildId);

        if (!config) return res.json(buildDefaultGreetingConfig('goodbye', fallbackChannel));

        if (!config.channelId && fallbackChannel) config.channelId = fallbackChannel;
        res.json(config);
    } catch (error) {
        console.error('Error obteniendo goodbye config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de despedida' });
    }
});

app.post('/api/guild/:guildId/goodbye-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const body = req.body || {};
        if (!body.channelId) return res.status(400).json({ error: 'Debes seleccionar un canal de despedida' });

        const existing = await welcomeStore.getGoodbyeConfig(guildId);
        const config = normalizeGreetingConfigInput(body, 'goodbye', req.session.user?.id, existing);

        await welcomeStore.setGoodbyeConfig(guildId, config);
        await welcomeStore.setGoodbyeChannelId(guildId, config.channelId);
        welcomeStore.invalidateConfigCache(guildId);

        res.json({ success: true, config, storedInDb: true });
    } catch (error) {
        console.error('Error guardando goodbye config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de despedida' });
    }
});

app.post('/api/guild/:guildId/goodbye-test', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const cfg = await welcomeStore.getGoodbyeConfig(guildId);
        const channelId = cfg?.channelId || await welcomeStore.getGoodbyeChannelId(guildId);
        const channel = channelId ? guild.channels.cache.get(channelId) : null;
        if (!channel) return res.status(404).json({ error: 'Canal de despedida no encontrado' });

        const member = guild.members.cache.get(req.session.user?.id) || await guild.members.fetch(req.session.user?.id).catch(() => null);
        if (!member) return res.status(404).json({ error: 'No pude obtener tu usuario en este servidor' });

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor(cfg?.color || 'ff5f9e')
            .setTitle(applyWelcomeTemplate(cfg?.title || 'Hasta pronto', member))
            .setDescription(applyWelcomeTemplate(cfg?.message || '{username} ha salido de {server}.', member));

        if (cfg?.footer) embed.setFooter({ text: applyWelcomeTemplate(cfg.footer, member) });
        const files = [];
        if (cfg?.imageUrl) await applyWelcomeMediaToEmbed(embed, cfg.imageUrl, files, guild, 'image');
        if (cfg?.thumbnailMode === 'avatar') embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
        else if (cfg?.thumbnailMode === 'url' && cfg?.thumbnailUrl) {
            await applyWelcomeMediaToEmbed(embed, cfg.thumbnailUrl, files, guild, 'thumbnail');
        }

        const content = cfg?.mentionUser ? `<@${member.id}>` : null;
        const allowedMentions = cfg?.mentionUser ? { parse: ['users'] } : undefined;
        await channel.send({ content, embeds: [embed], files, allowedMentions });

        res.json({ success: true, message: 'Prueba de despedida enviada' });
    } catch (error) {
        console.error('Error enviando goodbye test:', error);
        res.status(500).json({ error: 'Error al enviar prueba de despedida' });
    }
});

// Ruta para enviar embeds (o editar uno existente del bot si llega messageId)
app.post('/api/send-embed', requireAuth, upload.fields([{ name: 'imageFile', maxCount: 1 }, { name: 'thumbnailFile', maxCount: 1 }]), async (req, res) => {
    try {
        const { guildId, channelId } = req.body;
        const rawMessageId = String(req.body?.messageId || req.body?.targetMessageId || '').trim();
        const embedRaw = req.body?.embed;
        const embed = typeof embedRaw === 'string' ? JSON.parse(embedRaw) : embedRaw;

        if (!embed || typeof embed !== 'object') {
            return res.status(400).json({ error: 'Payload de embed inválido' });
        }

        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) {
            return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        }

        const guild = botClient.guilds.cache.get(guildId) || await botClient.guilds.fetch(guildId).catch(() => null);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const channel =
            guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
        if (!channel || !channel.isTextBased()) {
            return res.status(404).json({ error: 'Canal no encontrado o no admite mensajes' });
        }

        // Crear embed usando discord.js
        const { EmbedBuilder } = require('discord.js');
        const discordEmbed = new EmbedBuilder();
        const tpl = (value) => applyGuildEmbedText(value, { guild });

        if (embed.title) discordEmbed.setTitle(tpl(embed.title));
        if (embed.description) discordEmbed.setDescription(tpl(embed.description));
        if (embed.color) discordEmbed.setColor(embed.color);
        if (embed.footer) discordEmbed.setFooter({ text: tpl(embed.footer) });
        if (embed.image) discordEmbed.setImage(embed.image);
        if (embed.thumbnail) discordEmbed.setThumbnail(embed.thumbnail);
        if (embed.timestamp) discordEmbed.setTimestamp();
        if (embed.author) {
            discordEmbed.setAuthor({
                name: tpl(embed.author.name || ''),
                iconURL: embed.author.iconURL,
                url: embed.author.url
            });
        }
        if (embed.fields && Array.isArray(embed.fields)) {
            embed.fields.forEach(field => {
                if (field.name && field.value) {
                    discordEmbed.addFields({
                        name: tpl(field.name),
                        value: tpl(field.value),
                        inline: field.inline || false
                    });
                }
            });
        }

        const files = [];
        const imageUpload = req.files?.imageFile?.[0];
        const thumbnailUpload = req.files?.thumbnailFile?.[0];

        if (imageUpload?.buffer) {
            const imageName = imageUpload.originalname || `embed_image_${Date.now()}.jpg`;
            files.push({ attachment: imageUpload.buffer, name: imageName });
            if (!embed.image) discordEmbed.setImage(`attachment://${imageName}`);
        }

        if (thumbnailUpload?.buffer) {
            const thumbName = thumbnailUpload.originalname || `embed_thumb_${Date.now()}.jpg`;
            files.push({ attachment: thumbnailUpload.buffer, name: thumbName });
            if (!embed.thumbnail) discordEmbed.setThumbnail(`attachment://${thumbName}`);
        }

        const hasFiles = files.length > 0;
        const requiredPerms = hasFiles ? ['SendMessages', 'EmbedLinks', 'AttachFiles'] : ['SendMessages', 'EmbedLinks'];
        if (!channel.permissionsFor(guild.members.me)?.has(requiredPerms)) {
            return res.status(403).json({ error: 'El bot no tiene permisos en este canal' });
        }

        if (rawMessageId) {
            if (!/^\d{10,25}$/.test(rawMessageId)) {
                return res.status(400).json({ error: 'ID de mensaje inválido' });
            }

            const message = await channel.messages.fetch(rawMessageId).catch(() => null);
            if (!message) {
                return res.status(404).json({ error: 'No se encontró el mensaje en ese canal (revisa el ID y el canal)' });
            }
            if (message.author.id !== botClient.user.id) {
                return res.status(400).json({ error: 'Solo se pueden editar mensajes enviados por el bot' });
            }

            await message.edit({
                embeds: [discordEmbed],
                files: hasFiles ? files : []
            });

            console.log(`[Embed] ${req.session.user.username} editó mensaje ${rawMessageId} en ${guild.name}/${channel.name}`);

            return res.json({
                success: true,
                updated: true,
                messageId: message.id,
                message: 'Mensaje actualizado correctamente'
            });
        }

        await channel.send({ embeds: [discordEmbed], files });

        console.log(`[Embed] ${req.session.user.username} envió un embed en ${guild.name}/${channel.name}`);

        res.json({ success: true, updated: false, message: 'Embed enviado correctamente' });
    } catch (error) {
        console.error('Error enviando embed:', error);
        res.status(500).json({ error: error.message || 'Error al enviar embed' });
    }
});

app.post('/api/guild/:guildId/nuke', requireOwner, async (req, res) => {
    try {
        const guildId = String(req.params.guildId || '').trim();
        if (!guildId) {
            return res.status(400).json({ error: 'Falta el servidor objetivo' });
        }
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        let guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            try {
                guild = await botClient.guilds.fetch(guildId);
            } catch {
                return res.status(404).json({ error: 'Servidor no encontrado' });
            }
        }

        const actorTag = req.session.user?.username
            ? `${req.session.user.username} (panel web)`
            : 'owner (panel web)';
        const result = await executeGuildNuke(guild, botClient, actorTag);

        console.log(`[Nuke] ${actorTag} ejecutó nuke en ${guild.name} (${guild.id})`);
        return res.json({
            success: true,
            message: 'Nuke completado.',
            ...result
        });
    } catch (error) {
        const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
        console.error('Error ejecutando nuke desde el panel web:', error);
        return res.status(statusCode).json({ error: error.message || 'Error al ejecutar nuke' });
    }
});

app.post('/api/send-owner-attachment', requireOwner, handleOwnerAttachmentUpload, async (req, res) => {
    const uploadedPath = req.file?.path || '';
    try {
        const { guildId, channelId } = req.body || {};
        if (!guildId || !channelId) {
            return res.status(400).json({ error: 'Faltan servidor o canal' });
        }
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No se recibió ningún archivo' });
        }

        let guild = botClient.guilds.cache.get(String(guildId));
        if (!guild) {
            try {
                guild = await botClient.guilds.fetch(String(guildId));
            } catch {
                return res.status(404).json({ error: 'Servidor no encontrado' });
            }
        }

        let channel = guild.channels.cache.get(String(channelId));
        if (!channel) {
            try {
                channel = await guild.channels.fetch(String(channelId));
            } catch {
                return res.status(404).json({ error: 'Canal no encontrado' });
            }
        }

        if (!channel.isTextBased()) {
            return res.status(400).json({ error: 'El canal no admite mensajes de texto' });
        }

        const requiredPerms = ['ViewChannel', 'SendMessages', 'AttachFiles'];
        if (!channel.permissionsFor(guild.members.me)?.has(requiredPerms)) {
            return res.status(403).json({ error: 'El bot no tiene permisos para adjuntar archivos en este canal' });
        }

        const displayName = req.file.originalname || path.basename(uploadedPath);
        const attachment = new AttachmentBuilder(uploadedPath, { name: displayName });
        await channel.send({ files: [attachment] });

        console.log(`[OwnerAttachment] ${req.session.user?.username || 'owner'} envió archivo en ${guild.name}/${channel.name}`);
        return res.json({ success: true, message: 'Archivo enviado correctamente' });
    } catch (error) {
        console.error('Error enviando adjunto owner:', error);
        return res.status(500).json({ error: error.message || 'Error al enviar archivo' });
    } finally {
        if (uploadedPath) {
            fs.promises.unlink(uploadedPath).catch(() => {});
        }
    }
});

app.get('/api/embed-templates/:guildId', requireAuth, (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const store = readTemplateStore();
        const list = Array.isArray(store.guilds[guildId]) ? store.guilds[guildId] : [];
        res.json(list);
    } catch (error) {
        console.error('Error listando plantillas de embed:', error);
        res.status(500).json({ error: 'Error al listar plantillas' });
    }
});

app.post('/api/embed-templates', requireAuth, (req, res) => {
    try {
        const { guildId, name, embed } = req.body || {};
        if (!guildId || !name || !embed || typeof embed !== 'object') {
            return res.status(400).json({ error: 'Datos incompletos para guardar plantilla' });
        }

        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const cleanName = String(name).trim().slice(0, 80);
        if (!cleanName) return res.status(400).json({ error: 'Nombre de plantilla inválido' });

        const store = readTemplateStore();
        if (!Array.isArray(store.guilds[guildId])) store.guilds[guildId] = [];

        // Reemplaza por nombre si ya existe para no duplicar spam.
        const existingIndex = store.guilds[guildId].findIndex((t) => String(t.name).toLowerCase() === cleanName.toLowerCase());
        const template = {
            id: existingIndex >= 0 ? store.guilds[guildId][existingIndex].id : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: cleanName,
            guildId,
            createdBy: req.session.user?.id || 'unknown',
            updatedAt: new Date().toISOString(),
            embed
        };

        if (existingIndex >= 0) {
            store.guilds[guildId][existingIndex] = template;
        } else {
            store.guilds[guildId].push(template);
        }

        writeTemplateStore(store);
        res.json({ success: true, template });
    } catch (error) {
        console.error('Error guardando plantilla de embed:', error);
        res.status(500).json({ error: 'Error al guardar plantilla' });
    }
});

app.delete('/api/embed-templates/:guildId/:templateId', requireAuth, (req, res) => {
    try {
        const { guildId, templateId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const store = readTemplateStore();
        const list = Array.isArray(store.guilds[guildId]) ? store.guilds[guildId] : [];
        const next = list.filter((t) => t.id !== templateId);
        store.guilds[guildId] = next;
        writeTemplateStore(store);
        res.json({ success: true });
    } catch (error) {
        console.error('Error eliminando plantilla de embed:', error);
        res.status(500).json({ error: 'Error al eliminar plantilla' });
    }
});

// Ruta para obtener estadísticas del bot
app.get('/api/stats', requireAuth, (req, res) => {
    if (!isOwnerUser(req.session.user)) {
        return res.status(403).json({ error: 'Estadisticas disponibles solo para el creador' });
    }

    if (!botClient) {
        return res.status(500).json({ error: 'Bot no disponible' });
    }

    const rawPing = Number(botClient.ws?.ping);
    const normalizedPing = Number.isFinite(rawPing) && rawPing >= 0 ? Math.round(rawPing) : null;

    const stats = {
        guilds: botClient.guilds.cache.size,
        users: botClient.users.cache.size,
        channels: botClient.channels.cache.size,
        uptime: botClient.uptime,
        ping: normalizedPing,
        commands: botClient.commands?.size || 0,
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
    };

    res.json(stats);
});

// Almacenar logs recientes
const recentLogs = [];
const MAX_LOGS = 500;

// Interceptar console.log para capturar logs
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function addLog(level, message) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message: typeof message === 'string' ? message : JSON.stringify(message)
    };
    recentLogs.push(logEntry);
    if (recentLogs.length > MAX_LOGS) {
        recentLogs.shift();
    }
}

console.log = function(...args) {
    originalLog.apply(console, args);
    addLog('info', args.join(' '));
};

console.error = function(...args) {
    originalError.apply(console, args);
    addLog('error', args.join(' '));
};

console.warn = function(...args) {
    originalWarn.apply(console, args);
    addLog('warn', args.join(' '));
};

// Ruta para obtener logs
app.get('/api/logs', requireAuth, (req, res) => {
    if (!isOwnerUser(req.session.user)) {
        return res.status(403).json({ error: 'Logs disponibles solo para el creador' });
    }

    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level;
    
    let logs = recentLogs.slice(-limit);
    if (level) {
        logs = logs.filter(log => log.level === level);
    }
    
    res.json(logs.reverse());
});

// Server-Sent Events para logs en tiempo real
app.get('/api/logs/stream', requireAuth, (req, res) => {
    if (!isOwnerUser(req.session.user)) {
        return res.status(403).json({ error: 'Logs en tiempo real disponibles solo para el creador' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const sendLog = (log) => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
    };
    
    // Enviar logs recientes
    recentLogs.slice(-50).reverse().forEach(sendLog);
    
    // Interceptar nuevos logs
    const logListener = (log) => {
        sendLog(log);
    };
    
    // Agregar listener temporal
    const originalAddLog = addLog;
    const originalAddLogRef = addLog;
    
    req.on('close', () => {
        // Limpiar cuando el cliente se desconecta
    });
});

// Ruta para obtener lista de comandos
app.get('/api/commands', requireAuth, (req, res) => {
    if (!botClient || !botClient.commands) {
        return res.status(500).json({ error: 'Bot no disponible' });
    }

    const fs = require('fs');
    const path = require('path');
    const commandsPath = path.join(__dirname, '..', 'src', 'commands');
    
    const commands = Array.from(botClient.commands.values()).map(cmd => {
        // Intentar obtener la categoría de la ruta del archivo
        let category = 'other';
        
        // Buscar el archivo del comando en las carpetas
        try {
            const categories = ['config', 'fun', 'moderation', 'music', 'utility'];
            for (const cat of categories) {
                const catPath = path.join(commandsPath, cat);
                if (fs.existsSync(catPath)) {
                    const files = fs.readdirSync(catPath);
                    if (files.includes(`${cmd.data.name}.js`)) {
                        category = cat;
                        break;
                    }
                }
            }
        } catch (e) {
            // Si no se puede determinar, usar 'other'
            console.error('Error determinando categoría:', e);
        }
        
        return {
            name: cmd.data.name,
            description: cmd.data.description || 'Sin descripción',
            category: category,
            options: (cmd.data.options || []).map(opt => ({
                name: opt.name,
                description: opt.description || 'Sin descripción',
                type: opt.type,
                required: opt.required || false
            }))
        };
    });

    res.json(commands);
});

// Ruta para obtener información detallada del servidor
app.get('/api/guild/:guildId/info', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        if (!sessionGuildAllowsManagement(req.session.guilds, guildId)) {
            return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        }

        const ownerMember = guild.members.cache.get(guild.ownerId);
        const ownerUser = ownerMember?.user;

        const guildAgeDays = Math.max(1, Math.ceil((Date.now() - guild.createdTimestamp) / 86400000));
        const trackedUsers = await levelingStore.listGuildUsers(guildId);
        const activeTrackedUsers = trackedUsers.filter((entry) => Number.parseInt(entry.messageCount || 0, 10) > 0 || Number.parseInt(entry.voiceMinutes || 0, 10) > 0);

        const totalTrackedMessages = activeTrackedUsers.reduce((sum, entry) => sum + (Number.parseInt(entry.messageCount || 0, 10) || 0), 0);
        const totalTrackedVoiceMinutes = activeTrackedUsers.reduce((sum, entry) => sum + (Number.parseInt(entry.voiceMinutes || 0, 10) || 0), 0);

        const topMessageEntry = activeTrackedUsers.reduce((best, entry) => {
            const value = Number.parseInt(entry.messageCount || 0, 10) || 0;
            if (!best || value > best.value) {
                return { userId: entry.userId, value };
            }
            return best;
        }, null);

        const topVoiceEntry = activeTrackedUsers.reduce((best, entry) => {
            const value = Number.parseInt(entry.voiceMinutes || 0, 10) || 0;
            if (!best || value > best.value) {
                return { userId: entry.userId, value };
            }
            return best;
        }, null);

        const topActiveUsers = activeTrackedUsers
            .map((entry) => {
                const messageCount = Number.parseInt(entry.messageCount || 0, 10) || 0;
                const voiceMinutes = Number.parseInt(entry.voiceMinutes || 0, 10) || 0;
                return {
                    id: entry.userId,
                    tag: resolveGuildUserTag(guild, entry.userId),
                    avatar: resolveGuildUserAvatar(guild, entry.userId),
                    messageCount,
                    voiceMinutes,
                    score: messageCount + voiceMinutes
                };
            })
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.messageCount !== a.messageCount) return b.messageCount - a.messageCount;
                return b.voiceMinutes - a.voiceMinutes;
            })
            .slice(0, 8);

        const guildActivity = await guildActivityStore.getGuildActivity(guildId);
        const activityDaily = guildActivity?.daily || {};
        const last7Days = buildLast7DaysTimeline(activityDaily);
        const weeklyTimeline = buildWeeklyTimeline(guild.createdAt, activityDaily);

        const peakJoinsDay = summarizePeakDay(activityDaily, 'joins');
        const peakLeavesDay = summarizePeakDay(activityDaily, 'leaves');

        const voiceChannels = guild.channels.cache.filter((c) => c.type === 2);
        let liveVoiceUsers = 0;
        let topVoiceChannel = null;

        voiceChannels.forEach((channel) => {
            const users = channel.members.filter((m) => !m.user?.bot).size;
            liveVoiceUsers += users;
            if (!topVoiceChannel || users > topVoiceChannel.users) {
                topVoiceChannel = {
                    id: channel.id,
                    name: channel.name,
                    users
                };
            }
        });

        const textChannelSnapshots = guild.channels.cache
            .filter((c) => c.type === 0 || c.type === 5)
            .map((channel) => sanitizeChannelSnapshot(channel))
            .sort((a, b) => a.position - b.position)
            .slice(0, 12);

        const voiceChannelSnapshots = guild.channels.cache
            .filter((c) => c.type === 2 || c.type === 13)
            .map((channel) => sanitizeChannelSnapshot(channel))
            .sort((a, b) => {
                if (b.userCount !== a.userCount) return b.userCount - a.userCount;
                return a.position - b.position;
            })
            .slice(0, 12);

        const categorySnapshots = guild.channels.cache
            .filter((c) => c.type === 4)
            .map((channel) => sanitizeChannelSnapshot(channel))
            .sort((a, b) => a.position - b.position)
            .slice(0, 12);

        const rolesDetailed = guild.roles.cache.map(role => ({
            id: role.id,
            name: role.name,
            color: role.hexColor,
            position: role.position,
            members: role.members.size,
            users: role.members
                .map((member) => ({
                    id: member.id,
                    tag: member.user?.tag || member.displayName || `Usuario ${String(member.id).slice(-4)}`,
                    avatar: typeof member.displayAvatarURL === 'function'
                        ? member.displayAvatarURL({ dynamic: true, size: 128 })
                        : (typeof member.user?.displayAvatarURL === 'function'
                            ? member.user.displayAvatarURL({ dynamic: true, size: 128 })
                            : null)
                }))
                .sort((a, b) => a.tag.localeCompare(b.tag, 'es'))
                .slice(0, 30)
        })).sort((a, b) => b.position - a.position);

        const textLeaders = [...topActiveUsers]
            .sort((a, b) => {
                if (b.messageCount !== a.messageCount) return b.messageCount - a.messageCount;
                return b.voiceMinutes - a.voiceMinutes;
            })
            .slice(0, 6);

        const voiceLeaders = [...topActiveUsers]
            .sort((a, b) => {
                if (b.voiceMinutes !== a.voiceMinutes) return b.voiceMinutes - a.voiceMinutes;
                return b.messageCount - a.messageCount;
            })
            .slice(0, 6);

        const nonBotMembers = guild.members.cache.filter((member) => !member.user?.bot).size;
        const botMembers = guild.members.cache.filter((member) => member.user?.bot).size;

        const info = {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ dynamic: true, size: 256 }),
            owner: {
                id: guild.ownerId,
                tag: ownerUser?.tag || 'Desconocido',
                avatar: ownerUser?.displayAvatarURL({ dynamic: true, size: 256 }) || null
            },
            memberCount: guild.memberCount,
            channelCount: guild.channels.cache.size,
            roleCount: guild.roles.cache.size,
            createdAt: guild.createdAt.toISOString(),
            features: guild.features,
            verificationLevel: guild.verificationLevel,
            premiumTier: guild.premiumTier,
            premiumSubscriptionCount: guild.premiumSubscriptionCount || 0,
            members: {
                humans: nonBotMembers,
                bots: botMembers
            },
            channels: {
                text: guild.channels.cache.filter(c => c.type === 0).size,
                voice: guild.channels.cache.filter(c => c.type === 2).size,
                category: guild.channels.cache.filter(c => c.type === 4).size,
                items: {
                    text: textChannelSnapshots,
                    voice: voiceChannelSnapshots,
                    category: categorySnapshots
                }
            },
            roles: rolesDetailed,
            emojis: guild.emojis.cache.size,
            stickers: guild.stickers?.cache?.size || 0,
            activity: {
                ageDays: guildAgeDays,
                trackedUsers: activeTrackedUsers.length,
                trackingStartedAt: guildActivity?.trackingStartedAt || null,
                messages: {
                    totalTracked: totalTrackedMessages,
                    avgPerDay: Number((totalTrackedMessages / guildAgeDays).toFixed(2)),
                    topUser: {
                        id: topMessageEntry?.userId || null,
                        tag: topMessageEntry?.userId ? resolveGuildUserTag(guild, topMessageEntry.userId) : 'N/A',
                        count: topMessageEntry?.value || 0
                    },
                    leaders: textLeaders
                },
                voice: {
                    totalMinutes: totalTrackedVoiceMinutes,
                    avgMinutesPerDay: Number((totalTrackedVoiceMinutes / guildAgeDays).toFixed(2)),
                    avgHoursPerDay: Number(((totalTrackedVoiceMinutes / guildAgeDays) / 60).toFixed(2)),
                    topUser: {
                        id: topVoiceEntry?.userId || null,
                        tag: topVoiceEntry?.userId ? resolveGuildUserTag(guild, topVoiceEntry.userId) : 'N/A',
                        minutes: topVoiceEntry?.value || 0
                    },
                    live: {
                        currentUsers: liveVoiceUsers,
                        topChannel: topVoiceChannel,
                        channels: voiceChannelSnapshots.filter((channel) => channel.userCount > 0).slice(0, 8)
                    },
                    leaders: voiceLeaders
                },
                memberFlow: {
                    totalJoins: Number.parseInt(guildActivity?.totals?.joins || 0, 10) || 0,
                    totalLeaves: Number.parseInt(guildActivity?.totals?.leaves || 0, 10) || 0,
                    net: (Number.parseInt(guildActivity?.totals?.joins || 0, 10) || 0) - (Number.parseInt(guildActivity?.totals?.leaves || 0, 10) || 0),
                    peakJoinsDay,
                    peakLeavesDay,
                    last7Days
                },
                timeline: {
                    daily: last7Days,
                    weekly: weeklyTimeline
                },
                topUsers: topActiveUsers
            }
        };

        res.json(info);
    } catch (error) {
        console.error('Error obteniendo información del servidor:', error);
        res.status(500).json({ error: 'Error al obtener información del servidor' });
    }
});

// Ruta para ejecutar comandos de moderación
app.post('/api/moderate', requireAuth, async (req, res) => {
    try {
        const { guildId, action, userId, reason } = req.body;

        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const moderator = req.session.user.username;
        const actionReason = reason || `Moderado por ${moderator} desde el panel web`;
        const durationMs = Math.max(0, Number.parseInt(req.body.duration, 10) || 0);
        const maxTimeoutMs = 28 * 24 * 60 * 60 * 1000;

        let result;
        switch (action) {
            case 'kick':
                await member.kick(actionReason);
                result = { success: true, message: `Usuario ${member.user.tag} expulsado` };
                break;
            case 'ban':
                if (durationMs > 0 && durationMs <= maxTimeoutMs) {
                    await member.timeout(durationMs, actionReason);
                    result = { success: true, message: `Usuario ${member.user.tag} restringido temporalmente` };
                } else {
                    await member.ban({ reason: actionReason });
                    result = { success: true, message: `Usuario ${member.user.tag} baneado` };
                }
                break;
            case 'timeout':
                await member.timeout(durationMs > 0 ? durationMs : 600000, actionReason);
                result = { success: true, message: `Usuario ${member.user.tag} silenciado` };
                break;
            case 'removeTimeout':
                await member.timeout(null);
                result = { success: true, message: `Timeout removido de ${member.user.tag}` };
                break;
            default:
                return res.status(400).json({ error: 'Acción no válida' });
        }

        console.log(`[Moderación] ${moderator} ejecutó ${action} en ${member.user.tag} en ${guild.name}`);
        res.json(result);
    } catch (error) {
        console.error('Error en moderación:', error);
        res.status(500).json({ error: error.message || 'Error al ejecutar acción de moderación' });
    }
});

// Ruta para obtener información de música
app.get('/api/guild/:guildId/music', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        // Intentar obtener información del sistema de música
        const musicSystem = botClient.musicSystem;
        if (!musicSystem) {
            return res.json({ 
                playing: false, 
                message: 'Sistema de música no disponible' 
            });
        }

        const queue = musicSystem.getQueue(guildId);
        if (!queue || !queue.current) {
            return res.json({ 
                playing: false,
                queue: [],
                current: null
            });
        }

        res.json({
            playing: true,
            current: {
                title: queue.current.title,
                url: queue.current.url,
                thumbnail: queue.current.thumbnail,
                duration: queue.current.duration,
                requestedBy: queue.current.requestedBy
            },
            queue: queue.songs.slice(1).map(song => ({
                title: song.title,
                url: song.url,
                duration: song.duration,
                requestedBy: song.requestedBy
            })),
            queueLength: queue.songs.length
        });
    } catch (error) {
        console.error('Error obteniendo información de música:', error);
        res.status(500).json({ error: 'Error al obtener información de música' });
    }
});

// Ruta para controlar música
app.post('/api/guild/:guildId/music/control', requireAuth, requirePremium, async (req, res) => {
    try {
        const { guildId } = req.params;
        const { action } = req.body;
        
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const musicSystem = botClient.musicSystem;
        if (!musicSystem) {
            return res.status(500).json({ error: 'Sistema de música no disponible' });
        }

        // Simular interacción para el sistema de música
        const fakeInteraction = {
            guild: guild,
            member: guild.members.cache.get(req.session.user.id),
            reply: async (options) => {
                return { success: true };
            },
            deferReply: async () => {},
            editReply: async () => {}
        };

        let result;
        switch (action) {
            case 'pause':
                await musicSystem.handleMusicControl(fakeInteraction, 'pause');
                result = { success: true, message: 'Reproducción pausada' };
                break;
            case 'resume':
                await musicSystem.handleMusicControl(fakeInteraction, 'resume');
                result = { success: true, message: 'Reproducción reanudada' };
                break;
            case 'skip':
                await musicSystem.handleMusicControl(fakeInteraction, 'skip');
                result = { success: true, message: 'Canción saltada' };
                break;
            case 'stop':
                await musicSystem.handleMusicControl(fakeInteraction, 'stop');
                result = { success: true, message: 'Reproducción detenida' };
                break;
            case 'shuffle':
                await musicSystem.handleMusicControl(fakeInteraction, 'shuffle');
                result = { success: true, message: 'Cola mezclada' };
                break;
            default:
                return res.status(400).json({ error: 'Acción no válida' });
        }

        res.json(result);
    } catch (error) {
        console.error('Error controlando música:', error);
        res.status(500).json({ error: error.message || 'Error al controlar música' });
    }
});

// Ruta para buscar miembros
app.get('/api/guild/:guildId/members', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const query = req.query.q || '';
        
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        try {
            // Evita que la UI se quede cargando si Discord/API tarda demasiado.
            const fetchPromise = guild.members.fetch().catch(() => null);
            await Promise.race([
                fetchPromise,
                timeoutAfter(7000, 'guild.members.fetch timeout')
            ]);
        } catch (error) {
            console.warn(`⚠️ members fetch fallback (${guildId}):`, error.message);
        }
        
        let members = Array.from(guild.members.cache.values())
            .filter(m => !m.user.bot)
            .map(m => ({
                id: m.user.id,
                username: m.user.username,
                discriminator: m.user.discriminator,
                tag: m.user.tag,
                avatar: m.user.displayAvatarURL({ dynamic: true }),
                joinedAt: m.joinedAt?.toISOString(),
                roles: m.roles.cache.map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
            }));

        if (query) {
            const lowerQuery = query.toLowerCase();
            members = members.filter(m => 
                m.username.toLowerCase().includes(lowerQuery) ||
                m.tag.toLowerCase().includes(lowerQuery)
            );
        }

        res.json(members.slice(0, 50));
    } catch (error) {
        console.error('Error obteniendo miembros:', error);
        res.status(500).json({ error: 'Error al obtener miembros' });
    }
});

app.get('/api/guild/:guildId/bans', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const bans = await guild.bans.fetch().catch(() => null);
        if (!bans) return res.status(500).json({ error: 'No se pudo obtener la lista de baneos' });

        const rows = Array.from(bans.values()).slice(0, 200).map((ban) => ({
            userId: ban.user?.id || '',
            username: ban.user?.username || '',
            tag: ban.user?.tag || '',
            reason: ban.reason || ''
        }));

        res.json(rows);
    } catch (error) {
        console.error('Error obteniendo baneados:', error);
        res.status(500).json({ error: 'Error al obtener baneados' });
    }
});

app.post('/api/guild/:guildId/unban', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const { userId, reason } = req.body || {};
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });
        if (!userId) return res.status(400).json({ error: 'Falta userId' });

        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const moderator = req.session.user?.username || 'staff-web';
        const unbanReason = String(reason || `Desbaneado por ${moderator} desde panel web`).slice(0, 500);
        await guild.members.unban(String(userId), unbanReason);

        res.json({ success: true, message: 'Usuario desbaneado correctamente' });
    } catch (error) {
        console.error('Error desbaneando usuario:', error);
        res.status(500).json({ error: error.message || 'Error al desbanear usuario' });
    }
});

// Ruta para login (mostrar página de login)
app.get('/login', (req, res) => {
    // Si ya está autenticado, redirigir al dashboard
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Ruta principal - verificar autenticación antes de servir
app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para dashboard (alias de /)
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.redirect('/');
});

// Iniciar servidor con manejo de errores
const server = app.listen(PORT, () => {
    console.log(`🌐 Panel web iniciado en http://localhost:${PORT}`);
    const push = buildStreamPushStatus();
    if (push.publicOriginConfigured) {
        console.log('📡 Directos push (HTTPS):');
        if (push.twitch.configured) console.log(`   Twitch EventSub → ${push.twitch.callbackUrl}`);
        if (push.youtube.configured) console.log(`   YouTube WebSub → ${push.youtube.callbackUrl}`);
        if (push.feed.configured) console.log(`   Feed WebSub (TikTok/custom) → ${push.feed.callbackUrl}`);
    } else {
        console.log('ℹ️ Directos instantáneos: configura WEB_PUBLIC_ORIGIN=https://tu-dominio en .env');
    }
}).on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Error: El puerto ${PORT} ya está en uso`);
        console.log(`💡 Soluciones:`);
        console.log(`   1. Cambia el puerto en .env: WEB_PORT=3001`);
        console.log(`   2. O detén el proceso que usa el puerto ${PORT}`);
        console.log(`   3. O deshabilita el panel: WEB_ENABLED=false`);
        console.log(`\n⚠️  El bot continuará funcionando sin el panel web.`);
    } else {
        console.error(`❌ Error iniciando panel web:`, error);
    }
});

module.exports = { setBotClient, app, server };
