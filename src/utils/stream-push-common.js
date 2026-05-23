function envValue(name, fallback = '') {
    const raw = process.env[name];
    if (raw === undefined || raw === null) return fallback;
    return String(raw).trim();
}

function resolvePublicWebOrigin() {
    return envValue('WEB_PUBLIC_ORIGIN')
        || envValue('PUBLIC_WEB_URL')
        || envValue('WEB_PUBLIC_BASE_URL');
}

function isStreamPushConfigured() {
    const origin = resolvePublicWebOrigin();
    return Boolean(origin && /^https:\/\//i.test(origin));
}

function buildWebhookUrl(pathSegment) {
    const origin = resolvePublicWebOrigin().replace(/\/$/, '');
    const path = String(pathSegment || '').replace(/^\//, '');
    return origin ? `${origin}/${path}` : '';
}

module.exports = {
    envValue,
    resolvePublicWebOrigin,
    isStreamPushConfigured,
    buildWebhookUrl
};
