const crypto = require('crypto');
const db = require('./database');

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

function safeSecretEqual(left, right) {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function bearerToken(header) {
    const value = String(header || '');
    return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function communityUserId(raw) {
    const value = String(raw || '').trim();
    return /^\d{10,25}$/.test(value) ? value : '';
}

function communityRateLimitKey(userId, apiKey) {
    const normalizedUserId = communityUserId(userId);
    const normalizedKey = String(apiKey || '').trim();
    if (!normalizedUserId || !normalizedKey) return '';
    const keyHash = crypto.createHash('sha256').update(normalizedKey, 'utf8').digest('hex').slice(0, 24);
    return `${normalizedUserId}:${keyHash}`;
}

function signedTargetMatches(viewerId, targetId) {
    const viewer = communityUserId(viewerId);
    const target = communityUserId(targetId);
    return Boolean(viewer && target && viewer === target);
}

function canonicalPath(raw) {
    const value = String(raw || '/');
    return value.split('?')[0] || '/';
}

function bodyHash(body = '') {
    const bytes = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonicalCommunityRequest({ method, path, body, userId, timestamp, nonce }) {
    return [
        String(method || 'GET').toUpperCase(),
        canonicalPath(path),
        bodyHash(body),
        communityUserId(userId),
        String(timestamp || '').trim(),
        String(nonce || '').trim()
    ].join('\n');
}

function signCommunityRequest(request, secret) {
    return crypto
        .createHmac('sha256', String(secret || ''))
        .update(canonicalCommunityRequest(request))
        .digest('hex');
}

function timestampMillis(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return NaN;
    return parsed >= 1e12 ? parsed : parsed * 1000;
}

function verifyCommunitySignature(request, secret, now = Date.now()) {
    const userId = communityUserId(request.userId);
    const nonce = String(request.nonce || '').trim();
    const timestamp = timestampMillis(request.timestamp);
    if (!userId || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) {
        return { ok: false, reason: 'invalid_identity' };
    }
    if (!Number.isFinite(timestamp) || Math.abs(Number(now) - timestamp) > MAX_TIMESTAMP_SKEW_MS) {
        return { ok: false, reason: 'stale_timestamp' };
    }
    const expected = signCommunityRequest(request, secret);
    if (!safeSecretEqual(request.signature, expected)) {
        return { ok: false, reason: 'invalid_signature' };
    }
    return { ok: true, userId, timestamp };
}

async function consumeCommunityNonce(userId, nonce, timestamp) {
    try {
        await db.query(
            `INSERT INTO community_request_nonces
                (nonce, user_id, request_timestamp, expires_at)
             VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE))`,
            [String(nonce), String(userId), Math.floor(timestampMillis(timestamp))]
        );
        if (Math.random() < 0.01) {
            db.query('DELETE FROM community_request_nonces WHERE expires_at < UTC_TIMESTAMP(3)')
                .catch(() => null);
        }
        return true;
    } catch (error) {
        if (String(error?.code || '') === 'ER_DUP_ENTRY') return false;
        throw error;
    }
}

function encodeRankingCursor(metricValue, userId) {
    return Buffer.from(JSON.stringify([
        Math.max(0, Number(metricValue) || 0),
        communityUserId(userId)
    ])).toString('base64url');
}

function decodeRankingCursor(value) {
    try {
        const [metricValue, userId] = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
        const normalizedUserId = communityUserId(userId);
        if (!normalizedUserId || !Number.isFinite(Number(metricValue))) return null;
        return { metricValue: Math.max(0, Number(metricValue)), userId: normalizedUserId };
    } catch {
        return null;
    }
}

module.exports = {
    MAX_TIMESTAMP_SKEW_MS,
    safeSecretEqual,
    bearerToken,
    communityUserId,
    communityRateLimitKey,
    signedTargetMatches,
    canonicalPath,
    bodyHash,
    canonicalCommunityRequest,
    signCommunityRequest,
    verifyCommunitySignature,
    consumeCommunityNonce,
    encodeRankingCursor,
    decodeRankingCursor
};
