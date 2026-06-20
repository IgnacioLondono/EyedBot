const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'web-panel-config.json');

const DEFAULT_CONFIG = {
    maintenanceMode: false,
    maintenanceMessage: 'El panel está en mantenimiento. Vuelve pronto.',
    allowNewLogins: true,
    premiumRequired: null,
    billingEnabled: true,
    pages: {
        dashboard: true,
        about: true,
        commands: true,
        premium: true
    },
    modules: {
        welcome: true,
        verify: true,
        tickets: true,
        levels: true,
        voice: true,
        automation: true,
        gacha: true,
        moderation: true,
        security: true,
        notifications: true,
        freeGames: true,
        embed: true,
        events: true,
        themeCustomization: true
    },
    updatedAt: null,
    updatedBy: null
};

function envPremiumRequired() {
    const raw = String(process.env.EYEDPLUS_REQUIRED || process.env.PREMIUM_REQUIRED || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function ensureStore() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) {
        fs.writeFileSync(STORE_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
    }
}

function readRaw() {
    ensureStore();
    try {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8') || '{}');
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function normalizeBool(value, fallback) {
    if (value === true || value === false) return value;
    if (value === 'true' || value === 1 || value === '1') return true;
    if (value === 'false' || value === 0 || value === '0') return false;
    return fallback;
}

function normalizePages(raw = {}, base = DEFAULT_CONFIG.pages) {
    const out = { ...base };
    for (const key of Object.keys(base)) {
        if (raw[key] !== undefined) out[key] = normalizeBool(raw[key], base[key]);
    }
    return out;
}

function normalizeModules(raw = {}, base = DEFAULT_CONFIG.modules) {
    const out = { ...base };
    for (const key of Object.keys(base)) {
        if (raw[key] !== undefined) out[key] = normalizeBool(raw[key], base[key]);
    }
    return out;
}

function normalizeConfig(raw = {}) {
    let premiumRequired = null;
    if (raw.premiumRequired === true || raw.premiumRequired === false) {
        premiumRequired = raw.premiumRequired;
    } else if (raw.premiumRequired === 'true' || raw.premiumRequired === '1') {
        premiumRequired = true;
    } else if (raw.premiumRequired === 'false' || raw.premiumRequired === '0') {
        premiumRequired = false;
    }

    return {
        maintenanceMode: normalizeBool(raw.maintenanceMode, DEFAULT_CONFIG.maintenanceMode),
        maintenanceMessage: String(raw.maintenanceMessage || DEFAULT_CONFIG.maintenanceMessage).trim()
            || DEFAULT_CONFIG.maintenanceMessage,
        allowNewLogins: normalizeBool(raw.allowNewLogins, DEFAULT_CONFIG.allowNewLogins),
        premiumRequired,
        billingEnabled: normalizeBool(raw.billingEnabled, DEFAULT_CONFIG.billingEnabled),
        pages: normalizePages(raw.pages),
        modules: normalizeModules(raw.modules),
        updatedAt: raw.updatedAt || null,
        updatedBy: raw.updatedBy || null
    };
}

function writeConfig(config) {
    ensureStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function getConfig() {
    return normalizeConfig(readRaw());
}

function getEffectivePremiumRequired() {
    const config = getConfig();
    if (config.premiumRequired === true || config.premiumRequired === false) {
        return config.premiumRequired;
    }
    return envPremiumRequired();
}

function isBillingEnabled() {
    return getConfig().billingEnabled !== false;
}

function isMaintenanceMode() {
    return getConfig().maintenanceMode === true;
}

function isNewLoginAllowed() {
    return getConfig().allowNewLogins !== false;
}

function isPageEnabled(pageKey) {
    const pages = getConfig().pages || {};
    if (pages[pageKey] === false) return false;
    return true;
}

function isModuleEnabled(moduleKey) {
    const modules = getConfig().modules || {};
    if (modules[moduleKey] === false) return false;
    return true;
}

function resolveModuleFromRequestPath(url = '') {
    const path = String(url || '').toLowerCase();
    if (path.includes('/ticket')) return 'tickets';
    if (path.includes('/gacha')) return 'gacha';
    if (path.includes('/anti-raid')) return 'security';
    if (path.includes('/free-games')) return 'freeGames';
    if (path.includes('/welcome')) return 'welcome';
    if (path.includes('/verify')) return 'verify';
    if (path.includes('/level')) return 'levels';
    if (path.includes('/temp-voice') || path.includes('/voice')) return 'voice';
    if (path.includes('/stream-alert') || path.includes('/automation')) return 'automation';
    if (path.includes('/moderation') || path.includes('/unban') || path.includes('/bans')) return 'moderation';
    if (path.includes('/notifications') || path.includes('/stream') || path.includes('/crunchyroll')) return 'notifications';
    if (path.includes('/embed')) return 'embed';
    if (path.includes('/giveaway') || path.includes('/server-event') || path.includes('/events-giveaways')) return 'events';
    return null;
}

function getPublicConfig() {
    const config = getConfig();
    return {
        maintenanceMode: config.maintenanceMode,
        maintenanceMessage: config.maintenanceMessage,
        premiumRequired: getEffectivePremiumRequired(),
        billingEnabled: config.billingEnabled,
        pages: { ...config.pages },
        modules: { ...config.modules }
    };
}

function getAdminConfig(envHints = {}) {
    const config = getConfig();
    return {
        ...config,
        effective: {
            premiumRequired: getEffectivePremiumRequired(),
            billingEnabled: isBillingEnabled()
        },
        env: envHints
    };
}

function updateConfig(patch = {}, updatedBy = '') {
    const current = getConfig();
    const next = normalizeConfig({
        ...current,
        ...patch,
        pages: {
            ...current.pages,
            ...(patch.pages || {})
        },
        modules: {
            ...current.modules,
            ...(patch.modules || {})
        },
        updatedAt: new Date().toISOString(),
        updatedBy: String(updatedBy || current.updatedBy || '').trim() || null
    });
    writeConfig(next);
    return next;
}

module.exports = {
    DEFAULT_CONFIG,
    envPremiumRequired,
    getConfig,
    getPublicConfig,
    getAdminConfig,
    updateConfig,
    getEffectivePremiumRequired,
    isBillingEnabled,
    isMaintenanceMode,
    isNewLoginAllowed,
    isPageEnabled,
    isModuleEnabled,
    resolveModuleFromRequestPath
};
