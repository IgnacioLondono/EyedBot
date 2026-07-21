const test = require('node:test');
const assert = require('node:assert/strict');
const {
    PlansError,
    validatePlanInput,
    hasManagerRole,
    canManagePlan,
    createPlansService
} = require('../src/utils/community-plans-service');
const {
    PartyError,
    validatePartyInput,
    ticketHash,
    partyDiscoveryEvent,
    createPartyService
} = require('../src/utils/eyed-party-service');
const { getPartyAdapter } = require('../src/utils/eyed-party-games');

test('planes valida cupo, fechas, visibilidad y permisos owner/manager', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    assert.equal(validatePlanInput({
        title: 'Noche de juegos',
        capacity: 20,
        startsAt: future,
        visibility: 'guild'
    }).capacity, 20);
    assert.throws(
        () => validatePlanInput({ title: 'Plan', capacity: 1, startsAt: future }),
        (error) => error instanceof PlansError && error.code === 'INVALID_CAPACITY'
    );
    const member = { roles: { cache: [{ id: 'manager' }] } };
    assert.equal(hasManagerRole(member, { managerRoleIds: ['manager'] }), true);
    assert.equal(canManagePlan({ owner_id: 'owner' }, { userId: 'owner', isManager: false }), true);
    assert.equal(canManagePlan({ owner_id: 'owner' }, { userId: 'other', isManager: true }), true);
    assert.equal(canManagePlan({ owner_id: 'owner' }, { userId: 'other', isManager: false }), false);
});

test('listas usan límites enteros compatibles con MySQL 8.4', async () => {
    const queries = [];
    const db = {
        async query(sql, params) {
            queries.push({ sql, params });
            return [];
        }
    };
    await createPlansService({ db }).list(
        'guild-1',
        { userId: '100000000000000001', isManager: false },
        { limit: 25 }
    );
    await createPartyService({ db }).list(
        'guild-1',
        '100000000000000001',
        { limit: 15 }
    );

    assert.match(queries[0].sql, /LIMIT 25$/);
    assert.match(queries[1].sql, /LIMIT 15$/);
    assert.ok(queries.every(({ sql }) => !sql.includes('LIMIT ?')));
});

test('EyedParty carga participantes en una sola consulta', async () => {
    const queries = [];
    const db = {
        async query(sql) {
            queries.push(sql);
            if (sql.includes('FROM community_party_sessions')) {
                const base = {
                    title: 'Partida', game_type: 'dice', owner_id: '100000000000000001',
                    capacity: 8, participant_count: 1, version: 1,
                    state_json: '{}', status: 'waiting', created_at: new Date(), updated_at: new Date()
                };
                return [
                    { ...base, party_id: 'party-1' },
                    { ...base, party_id: 'party-2' },
                ];
            }
            return [
                { party_id: 'party-1', user_id: '100000000000000001', joined_at: new Date() },
                { party_id: 'party-2', user_id: '100000000000000002', joined_at: new Date() },
            ];
        }
    };
    const parties = await createPartyService({ db }).list('guild-1', '100000000000000001');
    assert.equal(queries.length, 2);
    assert.equal(parties.length, 2);
    assert.equal(parties[0].participants.length, 1);
    assert.equal(parties[1].participants.length, 1);
});

test('invitación privada exige manager y persiste un estado pendiente', async () => {
    const writes = [];
    const events = [];
    const plan = { plan_id: 'plan-1', guild_id: 'guild-1', owner_id: 'owner', status: 'upcoming' };
    const db = {
        transaction: async (work) => work({
            query: async (sql, params) => {
                if (sql.includes('SELECT * FROM community_plans')) return [plan];
                if (sql.includes('INSERT INTO community_plan_invitations')) {
                    writes.push(params);
                    return { affectedRows: 1 };
                }
                throw new Error(`Consulta inesperada: ${sql}`);
            }
        })
    };
    const service = createPlansService({
        db,
        eventBus: { append: async (event) => { events.push(event); } }
    });
    await assert.rejects(
        () => service.invite('guild-1', 'plan-1', { userId: 'other', isManager: false }, '100000000000000002'),
        (error) => error instanceof PlansError && error.code === 'PLAN_MANAGER_REQUIRED'
    );
    const invitation = await service.invite(
        'guild-1', 'plan-1', { userId: 'manager', isManager: true }, '100000000000000002'
    );
    assert.equal(invitation.status, 'pending');
    assert.equal(writes.length, 1);
    assert.equal(events[0].type, 'plan.invited');
    assert.equal(events[0].scope, 'self');
    assert.equal(events[0].subjectUserId, '100000000000000002');
});

test('rechazar invitación privada persiste la respuesta sin añadir asistente', async () => {
    const updates = [];
    const db = {
        transaction: async (work) => work({
            query: async (sql, params) => {
                if (sql.includes('SELECT * FROM community_plans')) {
                    return [{ plan_id: 'plan-1', guild_id: 'guild-1', status: 'upcoming' }];
                }
                if (sql.includes('SELECT * FROM community_plan_invitations')) return [{ status: 'pending' }];
                if (sql.includes('UPDATE community_plan_invitations')) {
                    updates.push(params);
                    return { affectedRows: 1 };
                }
                throw new Error(`Consulta inesperada: ${sql}`);
            }
        })
    };
    const service = createPlansService({ db, eventBus: { append: async () => {} } });
    const result = await service.respondInvitation(
        'guild-1', 'plan-1', { userId: '100000000000000002', isManager: false }, 'rejected'
    );
    assert.deepEqual({ status: result.status, idempotent: result.idempotent }, {
        status: 'rejected',
        idempotent: false
    });
    assert.equal(updates.length, 1);
});

test('aceptar invitación privada añade al invitado y aumenta el cupo usado', async () => {
    const statements = [];
    const db = {
        transaction: async (work) => work({
            query: async (sql) => {
                statements.push(sql);
                if (sql.includes('SELECT * FROM community_plans')) {
                    return [{
                        plan_id: 'plan-1', guild_id: 'guild-1', status: 'upcoming',
                        attendee_count: 1, capacity: 5
                    }];
                }
                if (sql.includes('SELECT * FROM community_plan_invitations')) return [{ status: 'pending' }];
                if (sql.includes('SELECT 1 FROM community_plan_attendees')) return [];
                return { affectedRows: 1 };
            }
        })
    };
    const service = createPlansService({ db, eventBus: { append: async () => {} } });
    const result = await service.respondInvitation(
        'guild-1', 'plan-1', { userId: '100000000000000002', isManager: false }, 'accepted'
    );
    assert.equal(result.status, 'accepted');
    assert.ok(statements.some((sql) => sql.includes('INSERT INTO community_plan_attendees')));
    assert.ok(statements.some((sql) => sql.includes('UPDATE community_plans')));
    assert.ok(statements.some((sql) => sql.includes('UPDATE community_plan_invitations')));
});

test('EyedParty valida capacidad y persiste la aleatoriedad del juego', () => {
    assert.equal(validatePartyInput({ title: 'Dados nocturnos', gameType: 'dice', capacity: 8 }).capacity, 8);
    assert.throws(
        () => validatePartyInput({ title: 'Dados', gameType: 'dice', capacity: 21 }),
        (error) => error instanceof PartyError && error.code === 'INVALID_CAPACITY'
    );
    const dice = getPartyAdapter('dice');
    const applied = dice.apply(dice.create(), { type: 'roll' }, {
        userId: '100000000000000001',
        participantCount: 2
    }, () => 6);
    assert.equal(applied.state.rolls['100000000000000001'], 6);
    assert.equal(applied.completed, false);
});

test('eventos de descubrimiento de party son públicos y mínimos', () => {
    for (const type of ['created', 'joined', 'left', 'status']) {
        const event = partyDiscoveryEvent('guild-1', type, 'party-1', {
            status: 'waiting',
            participantCount: 2,
            privateState: 'no debe salir'
        });
        assert.equal(event.type, `party.${type}`);
        assert.equal(event.scope, 'guild_public');
        assert.deepEqual(event.payload, {
            partyId: 'party-1',
            status: 'waiting',
            participantCount: 2
        });
    }
});

test('solo el owner puede eliminar una EyedParty', async () => {
    const statements = [];
    const fakeDb = {
        transaction: async (work) => work({
            query: async (sql, params = []) => {
                statements.push(sql);
                if (sql.includes('SELECT * FROM community_party_sessions')) {
                    return [{
                        party_id: '11111111-1111-4111-8111-111111111111',
                        guild_id: 'guild-1',
                        owner_id: '100000000000000001',
                        title: 'Sala test',
                        game_type: 'dice',
                        status: 'waiting',
                        capacity: 8,
                        participant_count: 1,
                        turn_user_id: null,
                        state_json: '{}',
                        version: 1,
                        created_at: new Date(),
                        updated_at: new Date(),
                        completed_at: null
                    }];
                }
                if (sql.includes('FROM community_party_participants')) {
                    return [{ user_id: '100000000000000001', joined_at: new Date() }];
                }
                return { affectedRows: 1 };
            }
        })
    };
    const events = [];
    const service = createPartyService({
        db: fakeDb,
        eventBus: { append: async (event) => { events.push(event); } }
    });
    await assert.rejects(
        () => service.remove('guild-1', '11111111-1111-4111-8111-111111111111', '100000000000000002'),
        (error) => error instanceof PartyError && error.code === 'OWNER_REQUIRED'
    );
    const result = await service.remove('guild-1', '11111111-1111-4111-8111-111111111111', '100000000000000001');
    assert.equal(result.deleted, true);
    assert.ok(statements.some((sql) => sql.includes('DELETE FROM community_party_sessions')));
    assert.equal(events[0]?.type, 'party.status');
    assert.equal(events[0]?.payload?.status, 'cancelled');
});

test('actionId repetido devuelve la respuesta persistida sin ejecutar otra acción', async () => {
    let queryCount = 0;
    const response = { actionId: 'action-123', result: { roll: 4 }, idempotent: false };
    const fakeDb = {
        transaction: async (work) => work({
            query: async () => {
                queryCount += 1;
                return [{
                    user_id: '100000000000000001',
                    response_json: JSON.stringify(response)
                }];
            }
        })
    };
    const service = createPartyService({ db: fakeDb, rewards: {} });
    const result = await service.action(
        '100000000000000000',
        'party-id',
        '100000000000000001',
        { actionId: 'action-123', expectedVersion: 2, type: 'roll' }
    );
    assert.equal(queryCount, 1);
    assert.equal(result.idempotent, true);
    assert.equal(result.result.roll, 4);
});

test('ticket WebSocket se consume atómicamente una sola vez', async () => {
    const token = 'ticket-super-seguro-de-prueba';
    let available = true;
    const ticket = {
        ticket_hash: ticketHash(token),
        party_id: 'party-id',
        guild_id: '100000000000000000',
        user_id: '100000000000000001'
    };
    const fakeDb = {
        transaction: async (work) => work({
            query: async (sql) => {
                if (sql.includes('SELECT * FROM community_party_tickets')) return available ? [ticket] : [];
                if (sql.includes('DELETE FROM community_party_tickets')) {
                    available = false;
                    return { affectedRows: 1 };
                }
                if (sql.includes('SELECT 1 FROM community_party_participants')) return [{ 1: 1 }];
                throw new Error(`Consulta inesperada: ${sql}`);
            }
        })
    };
    const service = createPartyService({ db: fakeDb, rewards: {} });
    assert.deepEqual(await service.consumeTicket(token), {
        partyId: 'party-id',
        guildId: '100000000000000000',
        userId: '100000000000000001'
    });
    assert.equal(await service.consumeTicket(token), null);
});
