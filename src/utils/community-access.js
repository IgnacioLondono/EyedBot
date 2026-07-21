const crypto = require('crypto');

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

module.exports = {
    safeSecretEqual,
    bearerToken,
    communityUserId
};
