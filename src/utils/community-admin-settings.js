const db = require('./database');

const PRIMARY_ADMIN_USER_ID = '399740358101303316';
const FEATURE_KEYS = Object.freeze([
    'activity',
    'achievements',
    'wrapped',
    'server',
    'lobby',
    'ranking',
    'circle',
    'plans',
    'party',
    'challenges',
    'shop'
]);
const CACHE_TTL_MS = 15_000;
const cache = new Map();

function envEnabled(value, fallback = true) {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value).trim().toLowerCase() !== 'false';
}

function defaultSettings() {
    return {
        maintenance: false,
        achievementNotifications: envEnabled(
            process.env.COMMUNITY_ACHIEVEMENT_NOTIFICATIONS_ENABLED,
            true
        ),
        features: Object.fromEntries(FEATURE_KEYS.map((key) => [key, true])),
        updatedAt: null,
        updatedBy: null
    };
}

function normalizeSettings(raw = {}) {
    const defaults = defaultSettings();
    const features = {};
    for (const key of FEATURE_KEYS) {
        features[key] = raw.features?.[key] !== false;
    }
    return {
        maintenance: raw.maintenance === true,
        achievementNotifications: raw.achievementNotifications === undefined
            ? defaults.achievementNotifications
            : raw.achievementNotifications === true,
        features,
        updatedAt: raw.updatedAt || null,
        updatedBy: raw.updatedBy ? String(raw.updatedBy) : null
    };
}

function isCommunityAdmin(userId) {
    const configured = String(
        process.env.COMMUNITY_ADMIN_DISCORD_IDS
        || process.env.WEB_OWNER_DISCORD_ID
        || ''
    )
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    return new Set([PRIMARY_ADMIN_USER_ID, ...configured]).has(String(userId));
}

async function getCommunityAdminSettings(guildId) {
    const key = String(guildId);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const stored = await db.get(`community_admin_settings_${key}`);
    const value = normalizeSettings(stored && typeof stored === 'object' ? stored : {});
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
}

async function updateCommunityAdminSettings(guildId, patch, userId) {
    const current = await getCommunityAdminSettings(guildId);
    const next = normalizeSettings({
        ...current,
        ...(typeof patch.maintenance === 'boolean' ? { maintenance: patch.maintenance } : {}),
        ...(typeof patch.achievementNotifications === 'boolean'
            ? { achievementNotifications: patch.achievementNotifications }
            : {}),
        features: {
            ...current.features,
            ...(patch.features && typeof patch.features === 'object' ? patch.features : {})
        },
        updatedAt: new Date().toISOString(),
        updatedBy: String(userId)
    });
    await db.set(`community_admin_settings_${String(guildId)}`, next);
    cache.set(String(guildId), { value: next, expiresAt: Date.now() + CACHE_TTL_MS });
    return next;
}

module.exports = {
    PRIMARY_ADMIN_USER_ID,
    FEATURE_KEYS,
    defaultSettings,
    normalizeSettings,
    isCommunityAdmin,
    getCommunityAdminSettings,
    updateCommunityAdminSettings
};
