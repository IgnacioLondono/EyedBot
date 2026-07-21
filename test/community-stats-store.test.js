const test = require('node:test');
const assert = require('node:assert/strict');
const {
    dateKey,
    periodRange,
    buildDenseSeries,
    splitVoiceRange
} = require('../src/utils/community-stats-store');

test('genera claves de fecha según la zona configurada', () => {
    const instant = new Date('2026-01-01T02:30:00.000Z');
    assert.equal(dateKey(instant, 'UTC'), '2026-01-01');
    assert.equal(dateKey(instant, 'America/Santiago'), '2025-12-31');
});

test('crea series densas sin fabricar valores', () => {
    assert.deepEqual(
        buildDenseSeries([
            {
                date_key: '2026-07-20',
                messages: 2,
                voice_minutes: 1,
                voice_seconds: 5,
                xp_earned: 3
            }
        ], '2026-07-19', '2026-07-21'),
        [
            { date: '2026-07-19', messages: 0, voiceSeconds: 0, voiceMinutes: 0, xpEarned: 0 },
            { date: '2026-07-20', messages: 2, voiceSeconds: 65, voiceMinutes: 1, xpEarned: 3 },
            { date: '2026-07-21', messages: 0, voiceSeconds: 0, voiceMinutes: 0, xpEarned: 0 }
        ]
    );
});

test('rangos de periodo terminan en el día local actual', () => {
    assert.deepEqual(
        periodRange('week', new Date('2026-07-21T12:00:00Z'), 'UTC'),
        { from: '2026-07-15', to: '2026-07-21' }
    );
});

test('divide voz exactamente al cruzar medianoche local', () => {
    const segments = splitVoiceRange(
        new Date('2026-07-21T23:59:30Z'),
        new Date('2026-07-22T00:00:30Z'),
        'UTC'
    );
    assert.deepEqual(segments, [
        { date: '2026-07-21', seconds: 30 },
        { date: '2026-07-22', seconds: 30 }
    ]);
});
