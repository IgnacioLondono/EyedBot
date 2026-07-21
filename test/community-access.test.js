const test = require('node:test');
const assert = require('node:assert/strict');
const {
    safeSecretEqual,
    bearerToken,
    communityUserId,
    communityRateLimitKey,
    signedTargetMatches,
    canonicalCommunityRequest,
    signCommunityRequest,
    verifyCommunitySignature,
    encodeRankingCursor,
    decodeRankingCursor
} = require('../src/utils/community-access');

test('acepta únicamente secretos idénticos y no vacíos', () => {
    assert.equal(safeSecretEqual('clave-segura', 'clave-segura'), true);
    assert.equal(safeSecretEqual('clave-segura', 'otra-clave'), false);
    assert.equal(safeSecretEqual('', ''), false);
});

test('extrae solo credenciales Bearer', () => {
    assert.equal(bearerToken('Bearer token-123'), 'token-123');
    assert.equal(bearerToken('Basic token-123'), '');
    assert.equal(bearerToken(undefined), '');
});

test('acepta snowflakes de Discord y rechaza otros identificadores', () => {
    assert.equal(communityUserId('399740358101303316'), '399740358101303316');
    assert.equal(communityUserId(' usuario '), '');
    assert.equal(communityUserId('123'), '');
    assert.equal(communityUserId('399740358101303316 OR 1=1'), '');
});

test('rate key combina identidad firmada y API key sin exponer el secreto', () => {
    const key = communityRateLimitKey('399740358101303316', 'api-key-super-secreta');
    assert.match(key, /^399740358101303316:[0-9a-f]{24}$/);
    assert.doesNotMatch(key, /api-key/);
    assert.notEqual(key, communityRateLimitKey('399740358101303316', 'otra-key'));
});

test('los targets privados deben coincidir exactamente con el viewer firmado', () => {
    assert.equal(signedTargetMatches('399740358101303316', '399740358101303316'), true);
    assert.equal(signedTargetMatches('399740358101303316', '499740358101303316'), false);
    assert.equal(signedTargetMatches('399740358101303316', 'inválido'), false);
});

test('firma el método, path sin query, body, identidad, timestamp y nonce', () => {
    const request = {
        method: 'get',
        path: '/api/community/ranking?period=week',
        body: '',
        userId: '399740358101303316',
        timestamp: '1784653200',
        nonce: 'nonce-seguro-123456',
        signature: ''
    };
    assert.match(canonicalCommunityRequest(request), /^GET\n\/api\/community\/ranking\n[0-9a-f]{64}\n/);
    request.signature = signCommunityRequest(request, 'firma-separada');
    assert.equal(
        verifyCommunitySignature(request, 'firma-separada', 1784653200 * 1000).ok,
        true
    );
    assert.equal(
        verifyCommunitySignature({ ...request, path: '/api/community/activity/1' }, 'firma-separada', 1784653200 * 1000).ok,
        false
    );
});

test('rechaza timestamps fuera de cinco minutos', () => {
    const request = {
        method: 'GET',
        path: '/api/community/ranking',
        body: '',
        userId: '399740358101303316',
        timestamp: '1784653200',
        nonce: 'nonce-seguro-123456'
    };
    request.signature = signCommunityRequest(request, 'secreto');
    assert.equal(
        verifyCommunitySignature(request, 'secreto', 1784653200 * 1000 + 300001).reason,
        'stale_timestamp'
    );
});

test('cursor de ranking conserva desempate determinista', () => {
    const encoded = encodeRankingCursor(42, '399740358101303316');
    assert.deepEqual(decodeRankingCursor(encoded), {
        metricValue: 42,
        userId: '399740358101303316'
    });
    assert.equal(decodeRankingCursor('no-es-un-cursor'), null);
});
