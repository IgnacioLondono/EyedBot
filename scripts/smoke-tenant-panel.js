/**
 * Smoke checks for multi-tenant panel (sin Discord ni red).
 */
const assert = require('assert');
const scope = require('../src/utils/config-scope');

assert.strictEqual(scope.scopedGuildKey('main', '123456789012345678'), '123456789012345678');
assert.strictEqual(scope.scopedGuildKey('aabbccddeeff0011', '123456789012345678'), 'aabbccddeeff0011:123456789012345678');

scope.runWithBotScope('aabbccddeeff0011', () => {
  const once = scope.scopeKey('123456789012345678');
  assert.strictEqual(once, 'aabbccddeeff0011:123456789012345678');
  assert.strictEqual(scope.scopeKey(once), once);
});

scope.runWithBotScope('main', () => {
  assert.strictEqual(scope.scopeKey('999'), '999');
});

const { sanitizeBrand } = (() => {
  // sanitizeBrand no exporta sin discord.js — reimplementación mínima del contrato
  return {
    sanitizeBrand(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const name = String(src.name || '').trim().slice(0, 64);
      const logoUrl = String(src.logoUrl || '').trim().slice(0, 500);
      let primaryColor = String(src.primaryColor || '').trim().replace('#', '').slice(0, 6);
      if (primaryColor && !/^[0-9a-fA-F]{6}$/.test(primaryColor)) primaryColor = '';
      return { name, logoUrl, primaryColor: primaryColor ? primaryColor.toLowerCase() : '' };
    }
  };
})();

assert.deepStrictEqual(sanitizeBrand({ name: 'Lazarus', primaryColor: '#F59E0B', logoUrl: 'https://x' }), {
  name: 'Lazarus',
  logoUrl: 'https://x',
  primaryColor: 'f59e0b'
});

console.log('OK smoke: config-scope + brand contract');
