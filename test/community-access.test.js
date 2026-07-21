const test = require('node:test');
const assert = require('node:assert/strict');
const {
    safeSecretEqual,
    bearerToken,
    communityUserId
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
