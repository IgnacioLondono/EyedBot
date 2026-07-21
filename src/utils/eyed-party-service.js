const crypto = require('crypto');
const defaultDb = require('./database');
const defaultRewards = require('./gacha-store');
const { getPartyAdapter } = require('./eyed-party-games');
const { communityEventBus } = require('./community-event-bus');

const PARTY_STATUSES = new Set(['waiting', 'active', 'completed', 'cancelled']);
const TICKET_TTL_MS = Math.max(
    5_000,
    Math.min(120_000, Number.parseInt(process.env.COMMUNITY_PARTY_TICKET_TTL_MS || '30000', 10) || 30_000)
);
const WINNER_REWARD = Math.max(
    0,
    Math.min(10_000, Number.parseInt(process.env.COMMUNITY_PARTY_WINNER_REWARD || '25', 10) || 25)
);

class PartyError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

function parseJson(value, fallback = {}) {
    if (value && typeof value === 'object') return value;
    try {
        return JSON.parse(String(value || ''));
    } catch {
        return fallback;
    }
}

function validatePartyInput(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new PartyError('INVALID_PARTY', 'El cuerpo debe ser un objeto');
    }
    const title = String(raw.title || '').trim();
    if (title.length < 3 || title.length > 100) {
        throw new PartyError('INVALID_PARTY', 'title debe tener entre 3 y 100 caracteres');
    }
    const gameType = String(raw.gameType || '').trim().toLowerCase();
    if (!getPartyAdapter(gameType)) {
        throw new PartyError('INVALID_GAME_TYPE', 'gameType debe ser trivia o dice');
    }
    const capacity = Number(raw.capacity ?? 8);
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 20) {
        throw new PartyError('INVALID_CAPACITY', 'capacity debe ser un entero entre 2 y 20');
    }
    return { title, gameType, capacity };
}

function validateActionInput(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new PartyError('INVALID_ACTION', 'El cuerpo debe ser un objeto');
    }
    const actionId = String(raw.actionId || '').trim();
    if (!/^[A-Za-z0-9_-]{8,80}$/.test(actionId)) {
        throw new PartyError('INVALID_ACTION_ID', 'actionId debe tener entre 8 y 80 caracteres seguros');
    }
    const expectedVersion = Number(raw.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw new PartyError('INVALID_VERSION', 'expectedVersion debe ser un entero positivo');
    }
    const type = String(raw.type || '').trim().toLowerCase();
    if (!['start', 'answer', 'roll'].includes(type)) {
        throw new PartyError('INVALID_ACTION', 'Acción no soportada');
    }
    const action = { type };
    if (type === 'answer') action.choice = raw.choice;
    return { actionId, expectedVersion, action };
}

function ticketHash(token) {
    return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function ticketToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function partyDiscoveryEvent(guildId, type, partyId, details = {}) {
    if (!['created', 'joined', 'left', 'status'].includes(type)) {
        throw new TypeError('Evento de descubrimiento de EyedParty inválido');
    }
    const payload = { partyId: String(partyId) };
    if (details.status) payload.status = String(details.status);
    if (Number.isInteger(details.participantCount)) payload.participantCount = details.participantCount;
    return { guildId, type: `party.${type}`, scope: 'guild_public', payload };
}

function rowState(row) {
    return parseJson(row.state_json ?? row.state, {});
}

function publicParty(row, participants = [], viewerId = '') {
    const adapter = getPartyAdapter(row.game_type ?? row.gameType);
    const state = rowState(row);
    return {
        id: String(row.party_id ?? row.id),
        title: row.title,
        gameType: row.game_type ?? row.gameType,
        status: row.status,
        ownerId: String(row.owner_id ?? row.ownerId),
        capacity: Number(row.capacity),
        participantCount: Number(row.participant_count ?? row.participantCount),
        turnUserId: row.turn_user_id ?? row.turnUserId ?? null,
        version: Number(row.version),
        state: adapter?.publicState(state) || {},
        participants: participants.map((item) => ({
            userId: String(item.user_id ?? item.userId),
            joinedAt: new Date(item.joined_at ?? item.joinedAt).toISOString()
        })),
        isParticipant: participants.some((item) => String(item.user_id ?? item.userId) === String(viewerId)),
        createdAt: new Date(row.created_at ?? row.createdAt).toISOString(),
        updatedAt: new Date(row.updated_at ?? row.updatedAt).toISOString(),
        completedAt: (row.completed_at ?? row.completedAt)
            ? new Date(row.completed_at ?? row.completedAt).toISOString()
            : null
    };
}

function mapGameError(error) {
    const code = String(error?.message || '');
    if (code === 'ALREADY_ACTED') return new PartyError(code, 'Ya realizaste tu acción', 409);
    if (code === 'INVALID_ACTION') return new PartyError(code, 'Acción inválida');
    if (code === 'ACTION_NOT_SUPPORTED') return new PartyError(code, 'Acción no compatible con este juego');
    return error;
}

function createPartyService({
    db = defaultDb,
    rewards = defaultRewards,
    randomTicket = ticketToken,
    eventBus = communityEventBus
} = {}) {
    async function participants(queryable, partyId) {
        return queryable.query(
            `SELECT user_id, joined_at FROM community_party_participants
             WHERE party_id = ? ORDER BY joined_at ASC, user_id ASC`,
            [String(partyId)]
        );
    }

    async function get(guildId, partyId, viewerId) {
        const rows = await db.query(
            'SELECT * FROM community_party_sessions WHERE party_id = ? AND guild_id = ?',
            [String(partyId), String(guildId)]
        );
        if (!rows[0]) throw new PartyError('PARTY_NOT_FOUND', 'EyedParty no encontrada', 404);
        const members = await participants(db, partyId);
        return publicParty(rows[0], members, viewerId);
    }

    async function list(guildId, viewerId, options = {}) {
        const status = String(options.status || '').trim();
        if (status && !PARTY_STATUSES.has(status)) {
            throw new PartyError('INVALID_STATUS', 'Estado de EyedParty inválido');
        }
        const limit = Number.parseInt(options.limit || '30', 10);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new PartyError('INVALID_LIMIT', 'limit debe estar entre 1 y 100');
        }
        const params = [String(guildId)];
        const statusSql = status ? ' AND status = ?' : '';
        if (status) params.push(status);
        const rows = await db.query(
            `SELECT * FROM community_party_sessions
             WHERE guild_id = ?${statusSql}
             ORDER BY created_at DESC LIMIT ${limit}`,
            params
        );
        if (!rows.length) return [];
        const partyIds = rows.map((row) => String(row.party_id));
        const memberRows = await db.query(
            `SELECT party_id, user_id, joined_at
             FROM community_party_participants
             WHERE party_id IN (${partyIds.map(() => '?').join(',')})
             ORDER BY party_id ASC, joined_at ASC, user_id ASC`,
            partyIds
        );
        const membersByParty = new Map();
        for (const member of memberRows) {
            const partyId = String(member.party_id);
            if (!membersByParty.has(partyId)) membersByParty.set(partyId, []);
            membersByParty.get(partyId).push(member);
        }
        return rows.map((row) => publicParty(
            row,
            membersByParty.get(String(row.party_id)) || [],
            viewerId
        ));
    }

    async function create(guildId, userId, raw) {
        const value = validatePartyInput(raw);
        const adapter = getPartyAdapter(value.gameType);
        const partyId = crypto.randomUUID();
        const now = new Date();
        const state = adapter.create();
        const party = await db.transaction(async (tx) => {
            await tx.query(
                `INSERT INTO community_party_sessions
                    (party_id, guild_id, owner_id, title, game_type, status, capacity,
                     participant_count, turn_user_id, state_json, version, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, 'waiting', ?, 1, NULL, ?, 1, ?, ?)`,
                [
                    partyId, String(guildId), String(userId), value.title, value.gameType,
                    value.capacity, JSON.stringify(state), now, now
                ]
            );
            await tx.query(
                `INSERT INTO community_party_participants (party_id, guild_id, user_id, joined_at)
                 VALUES (?, ?, ?, ?)`,
                [partyId, String(guildId), String(userId), now]
            );
            const rows = await tx.query(
                'SELECT * FROM community_party_sessions WHERE party_id = ?',
                [partyId]
            );
            return publicParty(rows[0], [{ user_id: userId, joined_at: now }], userId);
        });
        await eventBus.append(partyDiscoveryEvent(guildId, 'created', partyId, {
            status: party.status, participantCount: party.participantCount
        }));
        return party;
    }

    async function join(guildId, partyId, userId) {
        let joined = false;
        const party = await db.transaction(async (tx) => {
            const rows = await tx.query(
                `SELECT * FROM community_party_sessions
                 WHERE party_id = ? AND guild_id = ? FOR UPDATE`,
                [String(partyId), String(guildId)]
            );
            const party = rows[0];
            if (!party) throw new PartyError('PARTY_NOT_FOUND', 'EyedParty no encontrada', 404);
            const existing = await tx.query(
                `SELECT 1 FROM community_party_participants
                 WHERE party_id = ? AND user_id = ?`,
                [String(partyId), String(userId)]
            );
            if (existing[0]) return publicParty(party, await participants(tx, partyId), userId);
            if (party.status !== 'waiting') throw new PartyError('PARTY_STARTED', 'La partida ya comenzó', 409);
            if (Number(party.participant_count) >= Number(party.capacity)) {
                throw new PartyError('PARTY_FULL', 'La partida alcanzó su cupo', 409);
            }
            const now = new Date();
            await tx.query(
                `INSERT INTO community_party_participants (party_id, guild_id, user_id, joined_at)
                 VALUES (?, ?, ?, ?)`,
                [String(partyId), String(guildId), String(userId), now]
            );
            joined = true;
            await tx.query(
                `UPDATE community_party_sessions
                 SET participant_count = participant_count + 1, version = version + 1, updated_at = ?
                 WHERE party_id = ?`,
                [now, String(partyId)]
            );
            const updated = {
                ...party,
                participant_count: Number(party.participant_count) + 1,
                version: Number(party.version) + 1,
                updated_at: now
            };
            return publicParty(updated, await participants(tx, partyId), userId);
        });
        if (joined) {
            await eventBus.append(partyDiscoveryEvent(guildId, 'joined', partyId, {
                participantCount: party.participantCount
            }));
        }
        return party;
    }

    async function leave(guildId, partyId, userId) {
        let left = false;
        const party = await db.transaction(async (tx) => {
            const rows = await tx.query(
                'SELECT * FROM community_party_sessions WHERE party_id = ? AND guild_id = ? FOR UPDATE',
                [String(partyId), String(guildId)]
            );
            const current = rows[0];
            if (!current) throw new PartyError('PARTY_NOT_FOUND', 'EyedParty no encontrada', 404);
            if (String(current.owner_id) === String(userId)) {
                throw new PartyError('OWNER_CANNOT_LEAVE', 'El owner no puede abandonar su partida', 409);
            }
            if (current.status !== 'waiting') {
                throw new PartyError('PARTY_STARTED', 'No puedes salir después de iniciar la partida', 409);
            }
            const removed = await tx.query(
                'DELETE FROM community_party_participants WHERE party_id = ? AND user_id = ?',
                [String(partyId), String(userId)]
            );
            if (removed.affectedRows > 0) {
                left = true;
                const now = new Date();
                await tx.query(
                    `UPDATE community_party_sessions
                     SET participant_count = GREATEST(0, participant_count - 1),
                         version = version + 1, updated_at = ? WHERE party_id = ?`,
                    [now, String(partyId)]
                );
                current.participant_count = Math.max(0, Number(current.participant_count) - 1);
                current.version = Number(current.version) + 1;
                current.updated_at = now;
            }
            return publicParty(current, await participants(tx, partyId), userId);
        });
        if (left) {
            await eventBus.append(partyDiscoveryEvent(guildId, 'left', partyId, {
                participantCount: party.participantCount
            }));
        }
        return { party, left, idempotent: !left };
    }

    async function action(guildId, partyId, userId, raw) {
        const input = validateActionInput(raw);
        let previousStatus = null;
        const result = await db.transaction(async (tx) => {
            const duplicate = await tx.query(
                `SELECT user_id, response_json FROM community_party_actions
                 WHERE party_id = ? AND action_id = ? LIMIT 1`,
                [String(partyId), input.actionId]
            );
            if (duplicate[0]) {
                if (String(duplicate[0].user_id) !== String(userId)) {
                    throw new PartyError('ACTION_ID_CONFLICT', 'actionId ya pertenece a otro participante', 409);
                }
                return { ...parseJson(duplicate[0].response_json), idempotent: true };
            }

            const rows = await tx.query(
                `SELECT * FROM community_party_sessions
                 WHERE party_id = ? AND guild_id = ? FOR UPDATE`,
                [String(partyId), String(guildId)]
            );
            const party = rows[0];
            if (!party) throw new PartyError('PARTY_NOT_FOUND', 'EyedParty no encontrada', 404);
            previousStatus = party.status;
            const lockedDuplicate = await tx.query(
                `SELECT user_id, response_json FROM community_party_actions
                 WHERE party_id = ? AND action_id = ? LIMIT 1`,
                [String(partyId), input.actionId]
            );
            if (lockedDuplicate[0]) {
                if (String(lockedDuplicate[0].user_id) !== String(userId)) {
                    throw new PartyError('ACTION_ID_CONFLICT', 'actionId ya pertenece a otro participante', 409);
                }
                return { ...parseJson(lockedDuplicate[0].response_json), idempotent: true };
            }
            const members = await participants(tx, partyId);
            if (!members.some((item) => String(item.user_id) === String(userId))) {
                throw new PartyError('PARTICIPANT_REQUIRED', 'Debes unirte a la partida', 403);
            }
            if (Number(party.version) !== input.expectedVersion) {
                throw new PartyError('VERSION_CONFLICT', 'La partida cambió; vuelve a cargarla', 409);
            }

            const now = new Date();
            let next = { ...party };
            let actionResult = {};
            let winners = [];
            if (input.action.type === 'start') {
                if (party.status !== 'waiting') throw new PartyError('PARTY_STARTED', 'La partida ya comenzó', 409);
                if (String(party.owner_id) !== String(userId)) {
                    throw new PartyError('OWNER_REQUIRED', 'Solo el owner puede iniciar', 403);
                }
                if (members.length < 2) throw new PartyError('MINIMUM_PARTICIPANTS', 'Se necesitan al menos 2 participantes', 409);
                next.status = 'active';
                next.turn_user_id = String(members[0].user_id);
            } else {
                if (party.status !== 'active') throw new PartyError('PARTY_NOT_ACTIVE', 'La partida no está activa', 409);
                if (String(party.turn_user_id) !== String(userId)) {
                    throw new PartyError('NOT_YOUR_TURN', 'No es tu turno', 409);
                }
                const adapter = getPartyAdapter(party.game_type);
                try {
                    const applied = adapter.apply(rowState(party), input.action, {
                        userId: String(userId),
                        participantCount: members.length
                    });
                    next.state_json = JSON.stringify(applied.state);
                    actionResult = applied.result;
                    winners = applied.winners;
                    if (applied.completed) {
                        next.status = 'completed';
                        next.completed_at = now;
                        next.turn_user_id = null;
                    } else {
                        const acted = party.game_type === 'trivia'
                            ? new Set(Object.keys(applied.state.answers || {}))
                            : new Set(Object.keys(applied.state.rolls || {}));
                        next.turn_user_id = String(members.find((item) => !acted.has(String(item.user_id)))?.user_id || '');
                    }
                } catch (error) {
                    throw mapGameError(error);
                }
            }

            next.version = Number(party.version) + 1;
            next.updated_at = now;
            await tx.query(
                `UPDATE community_party_sessions
                 SET status = ?, turn_user_id = ?, state_json = ?, version = ?,
                     updated_at = ?, completed_at = ?
                 WHERE party_id = ?`,
                [
                    next.status, next.turn_user_id || null,
                    typeof next.state_json === 'string' ? next.state_json : JSON.stringify(rowState(next)),
                    next.version, now, next.completed_at || null, String(partyId)
                ]
            );

            for (const winnerId of winners) {
                await rewards.addCoins(guildId, winnerId, WINNER_REWARD, {
                    transaction: tx,
                    idempotencyKey: `party:${partyId}:winner`,
                    sourceType: 'eyed_party',
                    sourceId: String(partyId)
                });
            }
            const response = {
                actionId: input.actionId,
                result: actionResult,
                rewards: winners.map((winnerId) => ({ userId: winnerId, eyedCoins: WINNER_REWARD })),
                party: publicParty(next, members, userId),
                idempotent: false
            };
            await tx.query(
                `INSERT INTO community_party_actions
                    (party_id, guild_id, user_id, action_id, action_type, request_json,
                     response_json, resulting_version, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    String(partyId), String(guildId), String(userId), input.actionId,
                    input.action.type, JSON.stringify(input.action), JSON.stringify(response),
                    next.version, now
                ]
            );
            return response;
        });
        for (const reward of result.rewards || []) {
            rewards.invalidateProfileCache?.(guildId, reward.userId);
        }
        if (!result.idempotent) {
            await eventBus.append({
                guildId,
                type: 'party.action',
                scope: 'participants',
                subjectUserId: userId,
                aggregateId: partyId,
                payload: {
                    partyId: String(partyId),
                    actionType: input.action.type,
                    status: result.party.status,
                    turnUserId: result.party.turnUserId,
                    version: result.party.version
                }
            });
            if (previousStatus !== result.party.status) {
                await eventBus.append(partyDiscoveryEvent(
                    guildId, 'status', partyId, { status: result.party.status }
                ));
            }
        }
        return result;
    }

    async function createTicket(guildId, partyId, userId) {
        const party = await get(guildId, partyId, userId);
        if (!party.isParticipant) throw new PartyError('PARTICIPANT_REQUIRED', 'Debes unirte a la partida', 403);
        const token = randomTicket();
        const expiresAt = new Date(Date.now() + TICKET_TTL_MS);
        await db.query(
            `INSERT INTO community_party_tickets
                (ticket_hash, party_id, guild_id, user_id, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [ticketHash(token), String(partyId), String(guildId), String(userId), expiresAt, new Date()]
        );
        return { ticket: token, expiresAt: expiresAt.toISOString() };
    }

    async function consumeTicket(token) {
        const hash = ticketHash(token);
        return db.transaction(async (tx) => {
            const rows = await tx.query(
                `SELECT * FROM community_party_tickets
                 WHERE ticket_hash = ? AND expires_at > UTC_TIMESTAMP(3) FOR UPDATE`,
                [hash]
            );
            const ticket = rows[0];
            if (!ticket) return null;
            await tx.query('DELETE FROM community_party_tickets WHERE ticket_hash = ?', [hash]);
            const participant = await tx.query(
                `SELECT 1 FROM community_party_participants
                 WHERE party_id = ? AND guild_id = ? AND user_id = ?`,
                [ticket.party_id, ticket.guild_id, ticket.user_id]
            );
            if (!participant[0]) return null;
            return {
                partyId: String(ticket.party_id),
                guildId: String(ticket.guild_id),
                userId: String(ticket.user_id)
            };
        });
    }

    return { get, list, create, join, leave, action, createTicket, consumeTicket };
}

module.exports = {
    PARTY_STATUSES,
    TICKET_TTL_MS,
    WINNER_REWARD,
    PartyError,
    validatePartyInput,
    validateActionInput,
    ticketHash,
    partyDiscoveryEvent,
    publicParty,
    createPartyService
};
