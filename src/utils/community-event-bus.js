const defaultDb = require('./database');

const EVENT_SCOPES = new Set(['self', 'guild_public', 'participants', 'staff']);
const RETENTION_HOURS = clampInt(process.env.COMMUNITY_EVENTS_RETENTION_HOURS, 1, 24 * 90, 168);
const REPLAY_LIMIT = clampInt(process.env.COMMUNITY_EVENTS_REPLAY_LIMIT, 1, 1000, 200);
const SUBSCRIBER_QUEUE_LIMIT = clampInt(process.env.COMMUNITY_EVENTS_QUEUE_LIMIT, 1, 1000, 100);
const HEARTBEAT_MS = clampInt(process.env.COMMUNITY_EVENTS_HEARTBEAT_MS, 5000, 29000, 15000);
const RETRY_MS = clampInt(process.env.COMMUNITY_EVENTS_RETRY_MS, 1000, 60000, 5000);
const CLEANUP_INTERVAL_MS = clampInt(
    process.env.COMMUNITY_EVENTS_CLEANUP_INTERVAL_MS,
    60_000,
    24 * 60 * 60_000,
    60 * 60_000
);

function clampInt(value, minimum, maximum, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function parseEventId(value) {
    const normalized = String(value ?? '').trim();
    if (!normalized) return 0n;
    if (!/^\d{1,20}$/.test(normalized)) return null;
    try {
        const parsed = BigInt(normalized);
        return parsed >= 0n && parsed <= 18446744073709551615n ? parsed : null;
    } catch {
        return null;
    }
}

function minimalPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded, 'utf8') > 8192) {
        throw new RangeError('El payload del evento supera 8 KiB');
    }
    return JSON.parse(encoded);
}

function parsePayload(value) {
    if (value && typeof value === 'object') return value;
    try {
        const parsed = JSON.parse(String(value || '{}'));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function mapEvent(row) {
    return {
        id: String(row.event_id ?? row.id),
        guildId: String(row.guild_id ?? row.guildId),
        type: String(row.event_type ?? row.type),
        scope: String(row.scope),
        subjectUserId: row.subject_user_id ?? row.subjectUserId
            ? String(row.subject_user_id ?? row.subjectUserId)
            : null,
        aggregateId: row.aggregate_id ?? row.aggregateId
            ? String(row.aggregate_id ?? row.aggregateId)
            : null,
        payload: parsePayload(row.payload),
        createdAt: new Date(row.created_at ?? row.createdAt).toISOString(),
        expiresAt: new Date(row.expires_at ?? row.expiresAt).toISOString()
    };
}

function formatSseEvent(event) {
    return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify({
        type: event.type,
        scope: event.scope,
        subjectUserId: event.subjectUserId,
        aggregateId: event.aggregateId,
        payload: event.payload,
        createdAt: event.createdAt
    })}\n\n`;
}

function heartbeatFrame(now = Date.now()) {
    return `: heartbeat ${Number(now)}\n\n`;
}

function createCommunityEventBus({
    db = defaultDb,
    retentionHours = RETENTION_HOURS,
    replayLimit = REPLAY_LIMIT,
    queueLimit = SUBSCRIBER_QUEUE_LIMIT
} = {}) {
    const subscribers = new Set();
    const coalesced = new Map();
    let cleanupTimer = null;
    let appendTail = Promise.resolve();

    async function participantAllowed(event, viewer) {
        if (!event.aggregateId) return false;
        const rows = await db.query(
            `SELECT 1 FROM community_plan_attendees
             WHERE guild_id = ? AND plan_id = ? AND user_id = ?
             UNION ALL
             SELECT 1 FROM community_party_participants
             WHERE guild_id = ? AND party_id = ? AND user_id = ?
             UNION ALL
             SELECT 1 FROM community_plan_invitations
             WHERE guild_id = ? AND plan_id = ? AND invitee_id = ?
               AND status IN ('pending','accepted')
             LIMIT 1`,
            [
                event.guildId, event.aggregateId, viewer.userId,
                event.guildId, event.aggregateId, viewer.userId,
                event.guildId, event.aggregateId, viewer.userId
            ]
        );
        return Boolean(rows[0]);
    }

    async function canView(event, viewer) {
        if (!viewer || String(viewer.guildId) !== event.guildId) return false;
        if (event.scope === 'guild_public') return true;
        if (event.scope === 'self') return event.subjectUserId === String(viewer.userId);
        if (event.scope === 'staff') return viewer.isStaff === true;
        if (event.scope === 'participants') return participantAllowed(event, viewer);
        return false;
    }

    async function deliver(subscriber, event) {
        if (subscriber.closed || !await canView(event, subscriber.viewer)) return;
        if (subscriber.paused) {
            if (subscriber.queue.length >= queueLimit) return subscriber.close('backpressure');
            subscriber.queue.push(event);
            return;
        }
        if (subscriber.send(event) === false) subscriber.paused = true;
    }

    function publish(event) {
        for (const subscriber of subscribers) {
            subscriber.deliveryTail = subscriber.deliveryTail.then(() => deliver(subscriber, event)).catch((error) => {
                console.warn('[community-events] Falló fanout:', error?.message || error);
                subscriber.close('fanout_error');
            });
        }
    }

    async function persistEvent(input) {
        const guildId = String(input?.guildId || '').trim();
        const type = String(input?.type || '').trim();
        const scope = String(input?.scope || '').trim();
        const subjectUserId = input?.subjectUserId ? String(input.subjectUserId) : null;
        const aggregateId = input?.aggregateId ? String(input.aggregateId) : null;
        if (!guildId || !/^[a-z0-9_.-]{1,80}$/i.test(type) || !EVENT_SCOPES.has(scope)) {
            throw new TypeError('Evento comunitario inválido');
        }
        if (scope === 'self' && !subjectUserId) throw new TypeError('scope self requiere subjectUserId');
        if (scope === 'participants' && !aggregateId) throw new TypeError('scope participants requiere aggregateId');
        const payload = minimalPayload(input.payload);
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + retentionHours * 60 * 60_000);
        const result = await db.query(
            `INSERT INTO community_events
                (guild_id, event_type, scope, subject_user_id, aggregate_id, payload, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [guildId, type, scope, subjectUserId, aggregateId, JSON.stringify(payload), createdAt, expiresAt]
        );
        const event = mapEvent({
            event_id: result.insertId,
            guild_id: guildId,
            event_type: type,
            scope,
            subject_user_id: subjectUserId,
            aggregate_id: aggregateId,
            payload,
            created_at: createdAt,
            expires_at: expiresAt
        });
        publish(event);
        return event;
    }

    function append(input) {
        const pending = appendTail.then(() => persistEvent(input));
        appendTail = pending.catch(() => null);
        return pending;
    }

    function appendAsync(input, context = input?.type || 'event') {
        void append(input).catch((error) => {
            console.warn(`[community-events] No se pudo persistir ${context}:`, error?.message || error);
        });
    }

    function appendCoalesced(input, key, delayMs = 2000) {
        const eventKey = String(key || `${input?.guildId}:${input?.type}:${input?.subjectUserId || ''}`);
        const existing = coalesced.get(eventKey);
        if (existing) {
            existing.input = input;
            return;
        }
        const pending = { input, timer: null };
        pending.timer = setTimeout(() => {
            coalesced.delete(eventKey);
            appendAsync(pending.input, pending.input?.type);
        }, Math.max(100, Math.min(30_000, Number(delayMs) || 2000)));
        pending.timer.unref?.();
        coalesced.set(eventKey, pending);
    }

    async function replay(viewer, afterId, requestedLimit = replayLimit) {
        const parsedId = parseEventId(afterId);
        if (parsedId === null) throw new TypeError('Last-Event-ID inválido');
        const limit = Math.max(1, Math.min(replayLimit, Number.parseInt(requestedLimit, 10) || replayLimit));
        const viewerId = String(viewer.userId);
        const staffFlag = viewer.isStaff === true ? 1 : 0;
        const rows = await db.query(
            `SELECT event_id, guild_id, event_type, scope, subject_user_id, aggregate_id,
                    payload, created_at, expires_at
             FROM community_events
             WHERE guild_id = ? AND event_id > ? AND expires_at > UTC_TIMESTAMP(3)
               AND (
                    scope = 'guild_public'
                    OR (scope = 'self' AND subject_user_id = ?)
                    OR (scope = 'staff' AND ? = 1)
                    OR (
                        scope = 'participants' AND aggregate_id IS NOT NULL AND (
                            EXISTS (
                                SELECT 1 FROM community_plan_attendees
                                WHERE guild_id = community_events.guild_id
                                  AND plan_id = community_events.aggregate_id AND user_id = ?
                            )
                            OR EXISTS (
                                SELECT 1 FROM community_party_participants
                                WHERE guild_id = community_events.guild_id
                                  AND party_id = community_events.aggregate_id AND user_id = ?
                            )
                            OR EXISTS (
                                SELECT 1 FROM community_plan_invitations
                                WHERE guild_id = community_events.guild_id
                                  AND plan_id = community_events.aggregate_id AND invitee_id = ?
                                  AND status IN ('pending','accepted')
                            )
                        )
                    )
               )
             ORDER BY event_id ASC LIMIT ${limit}`,
            [
                String(viewer.guildId),
                parsedId.toString(),
                viewerId,
                staffFlag,
                viewerId,
                viewerId,
                viewerId
            ]
        );
        const visible = [];
        for (const row of rows) {
            const event = mapEvent(row);
            if (await canView(event, viewer)) visible.push(event);
        }
        return visible;
    }

    function subscribe(viewer, handlers) {
        const subscriber = {
            viewer,
            send: handlers.send,
            close: handlers.close || (() => {}),
            paused: false,
            closed: false,
            queue: [],
            deliveryTail: Promise.resolve()
        };
        subscribers.add(subscriber);
        return {
            resume() {
                if (subscriber.closed) return;
                subscriber.paused = false;
                while (!subscriber.paused && subscriber.queue.length) {
                    if (subscriber.send(subscriber.queue.shift()) === false) subscriber.paused = true;
                }
            },
            close(reason = 'client_closed') {
                if (subscriber.closed) return;
                subscriber.closed = true;
                subscriber.queue.length = 0;
                subscribers.delete(subscriber);
                subscriber.close(reason);
            }
        };
    }

    async function cleanup() {
        const result = await db.query(
            'DELETE FROM community_events WHERE expires_at <= UTC_TIMESTAMP(3) LIMIT 5000'
        );
        return Number(result.affectedRows) || 0;
    }

    function startCleanup() {
        if (cleanupTimer) clearInterval(cleanupTimer);
        cleanupTimer = setInterval(() => cleanup().catch((error) => {
            console.warn('[community-events] Falló cleanup:', error?.message || error);
        }), CLEANUP_INTERVAL_MS);
        cleanupTimer.unref?.();
    }

    function stopCleanup() {
        if (cleanupTimer) clearInterval(cleanupTimer);
        cleanupTimer = null;
    }

    return {
        append,
        appendAsync,
        appendCoalesced,
        replay,
        subscribe,
        canView,
        cleanup,
        startCleanup,
        stopCleanup
    };
}

const communityEventBus = createCommunityEventBus();

module.exports = {
    EVENT_SCOPES,
    RETENTION_HOURS,
    REPLAY_LIMIT,
    SUBSCRIBER_QUEUE_LIMIT,
    HEARTBEAT_MS,
    RETRY_MS,
    parseEventId,
    mapEvent,
    formatSseEvent,
    heartbeatFrame,
    createCommunityEventBus,
    communityEventBus
};
