const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createCommunityEventBus,
    parseEventId,
    mapEvent,
    formatSseEvent,
    heartbeatFrame
} = require('../src/utils/community-event-bus');

const NOW = '2026-07-21T12:00:00.000Z';
const LATER = '2026-07-22T12:00:00.000Z';

function row(id, scope, subjectUserId = null, aggregateId = null) {
    return {
        event_id: id,
        guild_id: 'guild-1',
        event_type: `test.${scope}`,
        scope,
        subject_user_id: subjectUserId,
        aggregate_id: aggregateId,
        payload: JSON.stringify({ changed: true }),
        created_at: NOW,
        expires_at: LATER
    };
}

test('filtra self, participants y staff según el viewer firmado', async () => {
    const db = {
        query: async (sql, params) => {
            if (sql.includes('community_plan_attendees')) {
                return params[2] === 'participant' ? [{ allowed: 1 }] : [];
            }
            throw new Error('Consulta inesperada');
        }
    };
    const bus = createCommunityEventBus({ db });
    const base = { guildId: 'guild-1', userId: 'viewer', isStaff: false };

    assert.equal(await bus.canView(mapEvent(row(1, 'guild_public')), base), true);
    assert.equal(await bus.canView(mapEvent(row(2, 'self', 'viewer')), base), true);
    assert.equal(await bus.canView(mapEvent(row(3, 'self', 'other')), base), false);
    assert.equal(await bus.canView(mapEvent(row(4, 'staff')), base), false);
    assert.equal(await bus.canView(mapEvent(row(5, 'staff')), { ...base, isStaff: true }), true);
    assert.equal(await bus.canView(
        mapEvent(row(6, 'participants', null, 'plan-1')),
        { ...base, userId: 'participant' }
    ), true);
    assert.equal(await bus.canView(mapEvent(row(7, 'participants', null, 'plan-1')), base), false);
    assert.equal(
        await bus.canView(mapEvent(row(8, 'guild_public')), { ...base, guildId: 'guild-2' }),
        false
    );
});

test('replay filtra autorización antes del límite y mantiene defensa en profundidad', async () => {
    let captured;
    let capturedSql;
    const db = {
        query: async (sql, params) => {
            if (sql.includes('FROM community_events')) {
                capturedSql = sql;
                captured = params;
                return [
                    row(11, 'guild_public'),
                    row(12, 'self', 'other'),
                    row(13, 'self', 'viewer')
                ];
            }
            throw new Error('Consulta inesperada');
        }
    };
    const bus = createCommunityEventBus({ db, replayLimit: 2 });
    const replay = await bus.replay(
        { guildId: 'guild-1', userId: 'viewer', isStaff: false },
        '10',
        999
    );
    assert.deepEqual(replay.map((event) => event.id), ['11', '13']);
    assert.match(capturedSql, /scope = 'self'.*ORDER BY event_id ASC LIMIT 2/s);
    assert.deepEqual(captured, ['guild-1', '10', 'viewer', 0, 'viewer', 'viewer', 'viewer']);
    await assert.rejects(() => bus.replay({ guildId: 'guild-1' }, '-1'), /Last-Event-ID/);
});

test('formatea eventos SSE y heartbeat sin exponer envoltorios internos', () => {
    const event = {
        id: '42',
        type: 'ranking.invalidated',
        scope: 'guild_public',
        subjectUserId: null,
        aggregateId: null,
        payload: { reason: 'xp' },
        createdAt: NOW
    };
    const frame = formatSseEvent(event);
    assert.match(frame, /^id: 42\nevent: ranking\.invalidated\ndata: /);
    assert.match(frame, /"reason":"xp"/);
    assert.ok(frame.endsWith('\n\n'));
    assert.equal(heartbeatFrame(1234), ': heartbeat 1234\n\n');
});

test('valida IDs BIGINT unsigned para Last-Event-ID', () => {
    assert.equal(parseEventId('0'), 0n);
    assert.equal(parseEventId('18446744073709551615'), 18446744073709551615n);
    assert.equal(parseEventId('18446744073709551616'), null);
    assert.equal(parseEventId('1x'), null);
});

test('append serializa IDs DB y fanout aun con productores concurrentes', async () => {
    let nextId = 0;
    const db = {
        query: async (sql) => {
            assert.match(sql, /INSERT INTO community_events/);
            nextId += 1;
            return { insertId: nextId };
        }
    };
    const bus = createCommunityEventBus({ db });
    const received = [];
    const subscription = bus.subscribe(
        { guildId: 'guild-1', userId: 'viewer', isStaff: false },
        { send: (event) => { received.push(event.id); return true; } }
    );
    const events = await Promise.all([
        bus.append({ guildId: 'guild-1', type: 'one', scope: 'guild_public', payload: {} }),
        bus.append({ guildId: 'guild-1', type: 'two', scope: 'guild_public', payload: {} })
    ]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(events.map((event) => event.id), ['1', '2']);
    assert.deepEqual(received, ['1', '2']);
    subscription.close();
});
