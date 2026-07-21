const test = require('node:test');
const assert = require('node:assert/strict');
const {
    WRAPPED_SCHEMA_VERSION,
    rankYearXp,
    getPastTrackingYears,
    selectMissingSnapshotTasks,
    createWrappedService
} = require('../src/utils/community-wrapped-service');

test('calcula rank por XP anual con desempate estable por userId', () => {
    const values = new Map([
        ['20', 80],
        ['10', 80],
        ['30', 120]
    ]);
    assert.equal(rankYearXp(['20', '30', '10'], values, '30'), 1);
    assert.equal(rankYearXp(['20', '30', '10'], values, '10'), 2);
    assert.equal(rankYearXp(['20', '30', '10'], values, '20'), 3);
});

test('incluye miembros sin XP anual en el rank', () => {
    assert.equal(rankYearXp(['10', '20'], new Map([['10', 5]]), '20'), 2);
});

test('conserva en el rank a usuarios con datos del año aunque ya no sean miembros', () => {
    assert.equal(rankYearXp(['10'], new Map([['10', 5], ['05', 10]]), '10'), 2);
});

test('genera Wrapped reutilizable con metadatos estrictos y rank anual', async () => {
    const store = {
        async getUserYearStats() {
            return {
                year: 2025,
                dataFrom: '2025-03-02',
                dataTo: '2025-12-20',
                trackingStartedAt: '2025-03-02T10:00:00.000Z',
                timezone: 'UTC',
                messages: 4,
                voiceSeconds: 3600,
                voiceMinutes: 60,
                xpEarned: 30,
                activeDays: 2,
                favoriteDay: '2025-12-20',
                monthly: []
            };
        },
        async getYearXpValues() {
            return new Map([['10', 30], ['20', 50]]);
        }
    };
    const service = createWrappedService({
        store,
        now: () => new Date('2026-01-02T03:04:05.000Z'),
        memberView: (member) => ({ id: member.user.id })
    });
    const payload = await service.generate({
        guildId: 'guild',
        userId: '10',
        year: 2025,
        member: { user: { id: '10' } },
        memberIds: ['10', '20'],
        finalized: true
    });

    assert.equal(payload.stats.rank, 2);
    assert.equal(payload.dataFrom, '2025-03-02');
    assert.equal(payload.dataTo, '2025-12-20');
    assert.equal(payload.generatedAt, '2026-01-02T03:04:05.000Z');
    assert.equal(payload.finalized, true);
    assert.equal(payload.schemaVersion, WRAPPED_SCHEMA_VERSION);
});

test('scheduler solo decide años cerrados desde tracking y limita el batch', () => {
    const years = getPastTrackingYears(
        '2023-06-01T00:00:00.000Z',
        'UTC',
        new Date('2026-07-21T00:00:00.000Z')
    );
    assert.deepEqual(years, [2023, 2024, 2025]);
    assert.deepEqual(
        selectMissingSnapshotTasks(
            ['20', '10'],
            years,
            new Set(['10:2023']),
            3
        ),
        [
            { userId: '20', year: 2023 },
            { userId: '10', year: 2024 },
            { userId: '20', year: 2024 }
        ]
    );
});

test('scheduler no fabrica años cuando tracking aún no existía', () => {
    assert.deepEqual(getPastTrackingYears(null, 'UTC', new Date('2026-01-01T00:00:00Z')), []);
    assert.deepEqual(
        getPastTrackingYears('2026-01-01T00:00:00Z', 'UTC', new Date('2026-12-01T00:00:00Z')),
        []
    );
});
