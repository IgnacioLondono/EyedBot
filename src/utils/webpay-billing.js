const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const billingStore = require('./billing-store');

const PENDING_PATH = path.join(__dirname, '..', '..', 'data', 'webpay-pending.json');
const INTEGRATION_BASE = 'https://webpay3gint.transbank.cl';
const PRODUCTION_BASE = 'https://webpay3g.transbank.cl';

function envValue(key, fallback = '') {
    const raw = process.env[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
    return String(raw).trim();
}

function getConfig() {
    const amountRaw = Number.parseInt(envValue('WEBPAY_MONTHLY_AMOUNT', '4990'), 10);
    const periodDaysRaw = Number.parseInt(envValue('WEBPAY_PERIOD_DAYS', '30'), 10);
    return {
        commerceCode: envValue('WEBPAY_COMMERCE_CODE'),
        apiKey: envValue('WEBPAY_API_KEY'),
        environment: envValue('WEBPAY_ENV', 'integration').toLowerCase(),
        monthlyAmount: Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : 4990,
        currency: 'CLP',
        periodDays: Number.isFinite(periodDaysRaw) && periodDaysRaw > 0 ? periodDaysRaw : 30,
        productName: envValue('WEBPAY_PRODUCT_NAME', 'EyedPlus+ mensual')
    };
}

function isConfigured() {
    const cfg = getConfig();
    return Boolean(cfg.commerceCode && cfg.apiKey);
}

function apiBaseUrl() {
    return getConfig().environment === 'production' ? PRODUCTION_BASE : INTEGRATION_BASE;
}

function ensurePendingStore() {
    const dir = path.dirname(PENDING_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(PENDING_PATH)) {
        fs.writeFileSync(PENDING_PATH, JSON.stringify({ orders: {} }, null, 2), 'utf8');
    }
}

function readPendingStore() {
    ensurePendingStore();
    try {
        const parsed = JSON.parse(fs.readFileSync(PENDING_PATH, 'utf8') || '{}');
        if (!parsed.orders || typeof parsed.orders !== 'object') return { orders: {} };
        return parsed;
    } catch {
        return { orders: {} };
    }
}

function writePendingStore(data) {
    ensurePendingStore();
    fs.writeFileSync(PENDING_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function createBuyOrder() {
    const suffix = crypto.randomBytes(4).toString('hex');
    return `EB${Date.now().toString(36)}${suffix}`.slice(0, 26);
}

async function savePendingOrder(order) {
    const store = readPendingStore();
    store.orders[order.buyOrder] = {
        ...order,
        createdAt: new Date().toISOString()
    };
    writePendingStore(store);
}

function getPendingOrder(buyOrder) {
    const store = readPendingStore();
    return store.orders[String(buyOrder || '').trim()] || null;
}

function deletePendingOrder(buyOrder) {
    const store = readPendingStore();
    delete store.orders[String(buyOrder || '').trim()];
    writePendingStore(store);
}

async function webpayRequest(method, endpoint, body = undefined) {
    const cfg = getConfig();
    if (!isConfigured()) {
        throw new Error('WebPay no configurado');
    }

    const url = `${apiBaseUrl()}${endpoint}`;
    const response = await fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Tbk-Api-Key-Id': cfg.commerceCode,
            'Tbk-Api-Key-Secret': cfg.apiKey
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    const text = await response.text();
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = { raw: text };
    }

    if (!response.ok) {
        const message = payload?.error_message || payload?.message || text || `HTTP ${response.status}`;
        const err = new Error(message);
        err.status = response.status;
        err.payload = payload;
        throw err;
    }

    return payload;
}

async function createCheckout({ userId, returnUrl }) {
    const cfg = getConfig();
    const buyOrder = createBuyOrder();
    const sessionId = String(userId || '').slice(0, 61);

    const created = await webpayRequest('POST', '/rswebpaytransaction/api/webpay/v1.2/transactions', {
        buy_order: buyOrder,
        session_id: sessionId || buyOrder,
        amount: cfg.monthlyAmount,
        return_url: returnUrl
    });

    if (!created?.token || !created?.url) {
        throw new Error('WebPay no devolvió token de pago');
    }

    await savePendingOrder({
        buyOrder,
        userId,
        amount: cfg.monthlyAmount,
        token: created.token
    });

    return {
        provider: 'webpay',
        url: created.url,
        token: created.token,
        buyOrder
    };
}

async function commitCheckout(token) {
    const payload = await webpayRequest(
        'PUT',
        `/rswebpaytransaction/api/webpay/v1.2/transactions/${encodeURIComponent(token)}`
    );

    const buyOrder = String(payload?.buy_order || '').trim();
    const pending = getPendingOrder(buyOrder);
    const userId = String(pending?.userId || payload?.session_id || '').trim();

    const authorized = payload?.status === 'AUTHORIZED'
        || Number(payload?.response_code) === 0;

    if (!authorized || !userId) {
        if (buyOrder) deletePendingOrder(buyOrder);
        return {
            ok: false,
            authorized: false,
            userId,
            buyOrder,
            payload
        };
    }

    const cfg = getConfig();
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + cfg.periodDays);

    const saved = await billingStore.setUserSubscription(userId, {
        userId,
        status: 'active',
        customerId: String(payload?.card_detail?.card_number || '').slice(-4),
        subscriptionId: String(payload?.authorization_code || buyOrder || token).slice(0, 120),
        currentPeriodEnd: periodEnd.toISOString(),
        cancelAtPeriodEnd: false,
        sourceEvent: 'webpay_commit',
        updatedAt: new Date().toISOString()
    });

    if (buyOrder) deletePendingOrder(buyOrder);

    return {
        ok: true,
        authorized: true,
        userId,
        buyOrder,
        subscription: saved,
        payload
    };
}

async function cancelRenewal(userId) {
    const current = await billingStore.getUserSubscription(userId);
    if (!billingStore.isPremiumActive(current)) {
        return { ok: false, message: 'No hay EyedPlus+ activo' };
    }

    const saved = await billingStore.setUserSubscription(userId, {
        ...current,
        cancelAtPeriodEnd: true,
        sourceEvent: 'webpay_cancel_renewal',
        updatedAt: new Date().toISOString()
    });

    return {
        ok: true,
        subscription: saved,
        message: 'Tu plan seguirá activo hasta la fecha de vencimiento. No se renovará automáticamente.'
    };
}

function getPublicPlan() {
    const cfg = getConfig();
    return {
        provider: isConfigured() ? 'webpay' : 'none',
        monthlyAmount: cfg.monthlyAmount,
        currency: cfg.currency,
        currencyLabel: 'CLP',
        periodDays: cfg.periodDays,
        productName: cfg.productName,
        paymentLabel: 'WebPay'
    };
}

module.exports = {
    getConfig,
    isConfigured,
    createCheckout,
    commitCheckout,
    cancelRenewal,
    getPublicPlan
};
