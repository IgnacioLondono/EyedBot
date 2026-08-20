const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./database');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'payment-receipts.json');
const CACHE_TTL_MS = Math.max(1000, Number.parseInt(process.env.CONFIG_CACHE_TTL_MS || '60000', 10));
const HISTORY_LIMIT = 40;
const cache = new Map();

function cacheGet(key) {
    const cached = cache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
        cache.delete(key);
        return null;
    }
    return cached.value;
}

function cacheSet(key, value) {
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function ensureStore() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) {
        fs.writeFileSync(STORE_PATH, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
    }
}

function readStore() {
    ensureStore();
    try {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8') || '{}');
        if (!parsed || typeof parsed !== 'object') return { guilds: {} };
        if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
        return parsed;
    } catch {
        return { guilds: {} };
    }
}

function writeStore(data) {
    ensureStore();
    try {
        fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch {
        /* MySQL es la fuente principal */
    }
}

function defaultFieldMap() {
    return {
        orderId: 'order_id|orderId|buyOrder|id|folio|comprobante_id|receipt_id',
        amount: 'amount|monto|total|value|pago',
        currency: 'currency|moneda|currency_code|divisa',
        product: 'product|producto|item|description|concepto|servicio|plan',
        status: 'status|estado|payment_status|estado_pago',
        buyerName: 'buyer_name|buyer|cliente|customer_name|nombre|payer_name|playerName|player_name',
        buyerDiscordId: 'discord_id|discordId|buyer_discord_id|user_id|discord_user_id',
        date: 'date|fecha|paid_at|created_at|timestamp|vipGrantedAt',
        extra: 'note|notes|detalle|message|comentario|observacion',
        steam: 'steam|steamId|steam_id|steamid',
        email: 'email|correo|mail|payer_email',
        server: 'server|servidor|server_status|rconText|rcon_status',
        rcon: 'rcon|rcon_log|rconLog|replies|replyLine',
        gateway: 'gateway|pasarela|provider|payment_gateway|psp',
        authCode: 'authorization_code|autorizacion|auth_code|authorizationCode',
        paymentType: 'payment_type|tipo_pago|payment_type_code|paymentTypeCode',
        cardLast4: 'card_last4|tarjeta|card_number|cardLast4'
    };
}

function defaultConfig() {
    return {
        enabled: false,
        channelId: '',
        sendToChannel: true,
        sendDm: false,
        mentionRoleId: '',
        color: '5dce7a',
        layout: 'fields',
        titleTemplate: '{product} · pago confirmado',
        descriptionTemplate: '',
        footerTemplate: 'Notificación de pago',
        labelSteam: 'Steam',
        labelName: 'Nombre',
        labelEmail: 'Correo',
        labelOrder: 'Orden',
        labelAmount: 'Monto',
        labelServer: 'Servidor',
        labelRcon: 'Detalle técnico',
        labelDiscord: 'Discord',
        labelGateway: 'Pasarela',
        labelAuth: 'Autorización',
        labelPaymentType: 'Tipo de pago',
        labelCard: 'Tarjeta',
        webhookSecret: '',
        fieldMap: defaultFieldMap(),
        history: [],
        updatedAt: new Date().toISOString(),
        updatedBy: 'system'
    };
}

function sanitizeFieldMap(raw) {
    const base = defaultFieldMap();
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = { ...base };
    for (const key of Object.keys(base)) {
        if (src[key] !== undefined && src[key] !== null) {
            out[key] = String(src[key]).trim().slice(0, 300) || base[key];
        }
    }
    return out;
}

function sanitizeHistory(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .slice(0, HISTORY_LIMIT)
        .map((entry) => ({
            id: String(entry?.id || crypto.randomBytes(6).toString('hex')),
            at: String(entry?.at || new Date().toISOString()),
            orderId: String(entry?.orderId || '').slice(0, 120),
            amount: String(entry?.amount || '').slice(0, 40),
            product: String(entry?.product || '').slice(0, 160),
            status: String(entry?.status || '').slice(0, 60),
            buyerDiscordId: String(entry?.buyerDiscordId || '').slice(0, 32),
            channelSent: entry?.channelSent === true,
            dmSent: entry?.dmSent === true,
            source: String(entry?.source || 'manual').slice(0, 40)
        }));
}

function sanitizeConfig(raw) {
    const cfg = raw && typeof raw === 'object' ? { ...raw } : {};
    const color = String(cfg.color || '22c55e').replace('#', '').slice(0, 6);
    return {
        enabled: cfg.enabled === true,
        channelId: String(cfg.channelId || '').trim(),
        sendToChannel: cfg.sendToChannel !== false,
        sendDm: cfg.sendDm === true,
        mentionRoleId: String(cfg.mentionRoleId || '').trim(),
        color: /^[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : '5dce7a',
        layout: String(cfg.layout || 'fields').toLowerCase() === 'text' ? 'text' : 'fields',
        titleTemplate: String(cfg.titleTemplate || defaultConfig().titleTemplate).slice(0, 256),
        descriptionTemplate: String(cfg.descriptionTemplate ?? defaultConfig().descriptionTemplate).slice(0, 3500),
        footerTemplate: String(cfg.footerTemplate || defaultConfig().footerTemplate).slice(0, 200),
        labelSteam: String(cfg.labelSteam || 'Steam').slice(0, 80),
        labelName: String(cfg.labelName || 'Nombre').slice(0, 80),
        labelEmail: String(cfg.labelEmail || 'Correo').slice(0, 80),
        labelOrder: String(cfg.labelOrder || 'Orden').slice(0, 80),
        labelAmount: String(cfg.labelAmount || 'Monto').slice(0, 80),
        labelServer: String(cfg.labelServer || 'Servidor').slice(0, 80),
        labelRcon: String(cfg.labelRcon || 'Detalle técnico').slice(0, 80),
        labelDiscord: String(cfg.labelDiscord || 'Discord').slice(0, 80),
        labelGateway: String(cfg.labelGateway || 'Pasarela').slice(0, 80),
        labelAuth: String(cfg.labelAuth || 'Autorización').slice(0, 80),
        labelPaymentType: String(cfg.labelPaymentType || 'Tipo de pago').slice(0, 80),
        labelCard: String(cfg.labelCard || 'Tarjeta').slice(0, 80),
        webhookSecret: String(cfg.webhookSecret || '').trim().slice(0, 128),
        fieldMap: sanitizeFieldMap(cfg.fieldMap),
        history: sanitizeHistory(cfg.history),
        updatedAt: String(cfg.updatedAt || new Date().toISOString()),
        updatedBy: String(cfg.updatedBy || 'system').slice(0, 64)
    };
}

function ensureWebhookSecret(cfg) {
    if (cfg.webhookSecret) return cfg;
    return {
        ...cfg,
        webhookSecret: crypto.randomBytes(24).toString('hex')
    };
}

async function getConfig(guildId) {
    const id = String(guildId || '').trim();
    if (!id) return defaultConfig();

    const cached = cacheGet(id);
    if (cached) return cached;

    let raw = null;
    try {
        raw = await db.get(`payment_receipt_config_${id}`);
    } catch {
        raw = null;
    }
    if (!raw) {
        const store = readStore();
        raw = store.guilds[id] || null;
    }

    const cfg = ensureWebhookSecret(sanitizeConfig(raw || defaultConfig()));
    cacheSet(id, cfg);
    return cfg;
}

async function setConfig(guildId, patch = {}) {
    const id = String(guildId || '').trim();
    if (!id) throw new Error('guildId requerido');

    const current = await getConfig(id);
    const merged = ensureWebhookSecret(
        sanitizeConfig({
            ...current,
            ...patch,
            fieldMap: patch.fieldMap ? { ...current.fieldMap, ...patch.fieldMap } : current.fieldMap,
            history: Array.isArray(patch.history) ? patch.history : current.history,
            updatedAt: new Date().toISOString()
        })
    );

    try {
        await db.set(`payment_receipt_config_${id}`, merged);
    } catch {
        /* fallback local */
    }

    const store = readStore();
    store.guilds[id] = merged;
    writeStore(store);
    cacheSet(id, merged);
    return merged;
}

async function pushHistory(guildId, entry) {
    const cfg = await getConfig(guildId);
    const next = [entry, ...(cfg.history || [])].slice(0, HISTORY_LIMIT);
    return setConfig(guildId, { history: next, updatedBy: cfg.updatedBy || 'system' });
}

function publicConfig(cfg) {
    const full = sanitizeConfig(cfg || defaultConfig());
    return {
        ...full,
        webhookSecretPreview: full.webhookSecret
            ? `${full.webhookSecret.slice(0, 6)}…${full.webhookSecret.slice(-4)}`
            : '',
        // No ocultamos el secret en panel autenticado: hace falta para copiar al API del hermano.
        // Si preferís ocultarlo luego, devolver solo preview.
    };
}

module.exports = {
    defaultConfig,
    defaultFieldMap,
    sanitizeConfig,
    getConfig,
    setConfig,
    pushHistory,
    publicConfig,
    HISTORY_LIMIT
};
