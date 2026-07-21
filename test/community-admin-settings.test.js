const test = require('node:test');
const assert = require('node:assert/strict');
const {
    PRIMARY_ADMIN_USER_ID,
    normalizeSettings,
    isCommunityAdmin
} = require('../src/utils/community-admin-settings');

test('el propietario solicitado siempre conserva acceso administrativo', () => {
    assert.equal(PRIMARY_ADMIN_USER_ID, '399740358101303316');
    assert.equal(isCommunityAdmin(PRIMARY_ADMIN_USER_ID), true);
});

test('normaliza módulos y conserva defaults seguros', () => {
    const settings = normalizeSettings({
        maintenance: true,
        achievementNotifications: false,
        features: { party: false }
    });
    assert.equal(settings.maintenance, true);
    assert.equal(settings.achievementNotifications, false);
    assert.equal(settings.features.party, false);
    assert.equal(settings.features.wrapped, true);
    assert.equal(settings.features.shop, true);
});
