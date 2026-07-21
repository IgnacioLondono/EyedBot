const test = require('node:test');
const assert = require('node:assert/strict');
const {
    weeklyPeriod,
    metricValue,
    CHALLENGE_DEFINITIONS
} = require('../src/utils/community-challenges-achievements');
const { addCoinsInTransaction } = require('../src/utils/gacha-store');

test('la semana comunitaria es lunes a domingo en la zona indicada', () => {
    assert.deepEqual(
        weeklyPeriod(new Date('2026-07-19T23:30:00.000Z'), 'America/Santiago'),
        {
            key: 'week:2026-07-13',
            startsOn: '2026-07-13',
            endsOn: '2026-07-19',
            timezone: 'America/Santiago'
        }
    );
    assert.equal(
        weeklyPeriod(new Date('2026-07-20T04:30:00.000Z'), 'America/Santiago').startsOn,
        '2026-07-20'
    );
});

test('calcula progreso por la métrica estable de cada reto', () => {
    const snapshot = { messages: 51, voice_seconds: 3599, xp: 500, active_days: 4 };
    const values = Object.fromEntries(CHALLENGE_DEFINITIONS.map((definition) => [
        definition.id,
        metricValue(definition, snapshot)
    ]));
    assert.deepEqual(values, {
        weekly_messages_50: 51,
        weekly_voice_hour: 3599,
        weekly_xp_500: 500,
        weekly_active_5: 4
    });
});

function rewardTransaction(initialProfile = { userId: 'u1', coins: 10 }) {
    let profile = structuredClone(initialProfile);
    const ledger = new Map();
    return {
        ledger,
        get profile() { return profile; },
        async query(sql, params) {
            if (sql.includes('INSERT IGNORE INTO key_value_store')) return { affectedRows: 0 };
            if (sql.includes('SELECT `value` FROM key_value_store')) {
                return [{ value: JSON.stringify(profile) }];
            }
            if (sql.includes('SELECT balance_after FROM community_reward_ledger')) {
                const row = ledger.get(params[2]);
                return row ? [{ balance_after: row.balance }] : [];
            }
            if (sql.includes('UPDATE key_value_store SET')) {
                profile = JSON.parse(params[0]);
                return { affectedRows: 1 };
            }
            if (sql.includes('INSERT INTO community_reward_ledger')) {
                ledger.set(params[2], { amount: params[5], balance: params[6] });
                return { affectedRows: 1 };
            }
            throw new Error(`SQL inesperado: ${sql}`);
        }
    };
}

test('addCoins transaccional no aplica dos veces la misma clave', async () => {
    const tx = rewardTransaction();
    const options = {
        idempotencyKey: 'challenge:7:weekly_messages_50',
        sourceType: 'challenge',
        sourceId: '7:weekly_messages_50'
    };
    const first = await addCoinsInTransaction(tx, 'g1', 'u1', 100, options);
    const second = await addCoinsInTransaction(tx, 'g1', 'u1', 100, options);

    assert.equal(first.applied, true);
    assert.equal(second.applied, false);
    assert.equal(tx.profile.coins, 110);
    assert.equal(tx.ledger.size, 1);
});
