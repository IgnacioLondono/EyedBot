const crypto = require('crypto');
const defaultDb = require('./database');
const eventsGiveawaysStore = require('./events-giveaways-store');
const { communityEventBus } = require('./community-event-bus');

const PLAN_STATUSES = new Set(['upcoming', 'active', 'completed', 'cancelled']);
const PLAN_VISIBILITIES = new Set(['guild', 'private']);

class PlansError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

function text(value, field, min, max) {
    const normalized = String(value ?? '').trim();
    if (normalized.length < min || normalized.length > max) {
        throw new PlansError('INVALID_PLAN', `${field} debe tener entre ${min} y ${max} caracteres`);
    }
    return normalized;
}

function parseDate(value, field) {
    const date = new Date(String(value || ''));
    if (!Number.isFinite(date.getTime())) {
        throw new PlansError('INVALID_PLAN', `${field} debe ser una fecha ISO válida`);
    }
    return date;
}

function validatePlanInput(raw = {}, now = new Date()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new PlansError('INVALID_PLAN', 'El cuerpo debe ser un objeto');
    }
    const title = text(raw.title, 'title', 3, 120);
    const description = text(raw.description ?? '', 'description', 0, 2000);
    const location = text(raw.location ?? '', 'location', 0, 200);
    const capacity = Number(raw.capacity);
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 500) {
        throw new PlansError('INVALID_CAPACITY', 'capacity debe ser un entero entre 2 y 500');
    }
    const startsAt = parseDate(raw.startsAt, 'startsAt');
    if (startsAt.getTime() < now.getTime() - 5 * 60_000) {
        throw new PlansError('INVALID_PLAN_DATE', 'startsAt no puede estar en el pasado');
    }
    const endsAt = raw.endsAt ? parseDate(raw.endsAt, 'endsAt') : null;
    if (endsAt && endsAt <= startsAt) {
        throw new PlansError('INVALID_PLAN_DATE', 'endsAt debe ser posterior a startsAt');
    }
    const status = String(raw.status || 'upcoming').toLowerCase();
    const visibility = String(raw.visibility || 'guild').toLowerCase();
    if (!PLAN_STATUSES.has(status)) throw new PlansError('INVALID_STATUS', 'Estado de plan inválido');
    if (!PLAN_VISIBILITIES.has(visibility)) throw new PlansError('INVALID_VISIBILITY', 'Visibilidad inválida');
    if (status === 'completed' || status === 'cancelled') {
        throw new PlansError('INVALID_STATUS', 'Un plan nuevo debe estar upcoming o active');
    }
    return { title, description, location, capacity, startsAt, endsAt, status, visibility };
}

function hasManagerRole(member, config = {}) {
    const managerRoleIds = new Set(
        (Array.isArray(config.managerRoleIds) ? config.managerRoleIds : [])
            .map(String)
            .filter(Boolean)
    );
    if (!managerRoleIds.size) return false;
    return Boolean(member?.roles?.cache?.some?.((role) => managerRoleIds.has(String(role.id))));
}

function canManagePlan(plan, viewer) {
    return String(plan.owner_id ?? plan.ownerId) === String(viewer.userId) || viewer.isManager === true;
}

function mapPlan(row, viewer) {
    const canManage = canManagePlan(row, viewer);
    const isAttendee = Boolean(Number(row.viewer_attending ?? row.viewerAttending));
    return {
        id: String(row.plan_id ?? row.id),
        title: row.title,
        description: row.description,
        location: row.location,
        startsAt: new Date(row.starts_at ?? row.startsAt).toISOString(),
        endsAt: (row.ends_at ?? row.endsAt) ? new Date(row.ends_at ?? row.endsAt).toISOString() : null,
        status: row.status,
        visibility: row.visibility,
        ownerId: String(row.owner_id ?? row.ownerId),
        capacity: Number(row.capacity),
        attendeeCount: Number(row.attendee_count ?? row.attendeeCount),
        isAttendee,
        invitationStatus: row.invitation_status ?? row.invitationStatus ?? null,
        canManage,
        version: Number(row.version),
        createdAt: new Date(row.created_at ?? row.createdAt).toISOString(),
        updatedAt: new Date(row.updated_at ?? row.updatedAt).toISOString()
    };
}

function createPlansService({
    db = defaultDb,
    configStore = eventsGiveawaysStore,
    eventBus = communityEventBus
} = {}) {
    async function viewerContext(guildId, userId, member) {
        const config = await configStore.getConfig(guildId);
        return { userId: String(userId), isManager: hasManagerRole(member, config) };
    }

    async function list(guildId, viewer, filters = {}) {
        const statuses = String(filters.status || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
        if (statuses.some((status) => !PLAN_STATUSES.has(status))) {
            throw new PlansError('INVALID_STATUS', 'Filtro de estado inválido');
        }
        const limit = Number.parseInt(filters.limit || '50', 10);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new PlansError('INVALID_LIMIT', 'limit debe estar entre 1 y 100');
        }
        const params = [String(viewer.userId), String(viewer.userId), String(guildId)];
        let statusClause = '';
        if (statuses.length) {
            statusClause = ` AND p.status IN (${statuses.map(() => '?').join(',')})`;
            params.push(...statuses);
        }
        params.push(viewer.isManager ? 1 : 0, String(viewer.userId), String(viewer.userId), String(viewer.userId), limit);
        const rows = await db.query(
            `SELECT p.*, (mine.user_id IS NOT NULL) AS viewer_attending,
                    invitation.status AS invitation_status
             FROM community_plans p
             LEFT JOIN community_plan_attendees mine
               ON mine.plan_id = p.plan_id AND mine.user_id = ?
             LEFT JOIN community_plan_invitations invitation
               ON invitation.plan_id = p.plan_id AND invitation.invitee_id = ?
             WHERE p.guild_id = ?${statusClause}
               AND (p.visibility = 'guild' OR ? = 1 OR p.owner_id = ? OR mine.user_id = ?
                    OR (invitation.invitee_id = ? AND invitation.status IN ('pending','accepted')))
             ORDER BY p.starts_at ASC, p.plan_id ASC
             LIMIT ?`,
            params
        );
        return rows.map((row) => mapPlan(row, viewer));
    }

    async function create(guildId, viewer, input) {
        const value = validatePlanInput(input);
        const planId = crypto.randomUUID();
        const now = new Date();
        const plan = await db.transaction(async (tx) => {
            await tx.query(
                `INSERT INTO community_plans
                    (plan_id, guild_id, owner_id, title, description, location, starts_at, ends_at,
                     status, visibility, capacity, attendee_count, version, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
                [
                    planId, String(guildId), String(viewer.userId), value.title, value.description,
                    value.location, value.startsAt, value.endsAt, value.status, value.visibility,
                    value.capacity, now, now
                ]
            );
            await tx.query(
                `INSERT INTO community_plan_attendees (plan_id, guild_id, user_id, joined_at)
                 VALUES (?, ?, ?, ?)`,
                [planId, String(guildId), String(viewer.userId), now]
            );
            const rows = await tx.query(
                'SELECT *, 1 AS viewer_attending FROM community_plans WHERE plan_id = ?',
                [planId]
            );
            return mapPlan(rows[0], viewer);
        });
        await eventBus.append({
            guildId,
            type: 'plan.created',
            scope: value.visibility === 'private' ? 'participants' : 'guild_public',
            subjectUserId: viewer.userId,
            aggregateId: planId,
            payload: { planId, status: plan.status, version: plan.version }
        });
        return plan;
    }

    async function join(guildId, planId, viewer) {
        const result = await db.transaction(async (tx) => {
            const rows = await tx.query(
                'SELECT * FROM community_plans WHERE plan_id = ? AND guild_id = ? FOR UPDATE',
                [String(planId), String(guildId)]
            );
            const plan = rows[0];
            if (!plan) throw new PlansError('PLAN_NOT_FOUND', 'Plan no encontrado', 404);
            if (!['upcoming', 'active'].includes(plan.status)) {
                throw new PlansError('PLAN_CLOSED', 'El plan no acepta asistentes', 409);
            }
            if (plan.visibility === 'private' && !canManagePlan(plan, viewer)) {
                const invitations = await tx.query(
                    `SELECT status FROM community_plan_invitations
                     WHERE plan_id = ? AND guild_id = ? AND invitee_id = ?`,
                    [String(planId), String(guildId), String(viewer.userId)]
                );
                if (invitations[0]?.status !== 'accepted') {
                    throw new PlansError('PLAN_INVITATION_REQUIRED', 'Debes aceptar una invitación para unirte', 403);
                }
            }
            const inserted = await tx.query(
                `INSERT IGNORE INTO community_plan_attendees (plan_id, guild_id, user_id, joined_at)
                 VALUES (?, ?, ?, ?)`,
                [String(planId), String(guildId), String(viewer.userId), new Date()]
            );
            if (inserted.affectedRows === 0) {
                return { joined: true, idempotent: true, plan: mapPlan({ ...plan, viewer_attending: 1 }, viewer) };
            }
            if (Number(plan.attendee_count) >= Number(plan.capacity)) {
                throw new PlansError('PLAN_FULL', 'El plan alcanzó su cupo', 409);
            }
            await tx.query(
                `UPDATE community_plans
                 SET attendee_count = attendee_count + 1, version = version + 1, updated_at = ?
                 WHERE plan_id = ?`,
                [new Date(), String(planId)]
            );
            return {
                joined: true,
                idempotent: false,
                plan: mapPlan({
                    ...plan,
                    attendee_count: Number(plan.attendee_count) + 1,
                    version: Number(plan.version) + 1,
                    viewer_attending: 1,
                    updated_at: new Date()
                }, viewer)
            };
        });
        if (!result.idempotent) {
            await eventBus.append({
                guildId,
                type: 'plan.joined',
                scope: 'participants',
                subjectUserId: viewer.userId,
                aggregateId: planId,
                payload: {
                    planId: String(planId),
                    attendeeCount: result.plan.attendeeCount,
                    version: result.plan.version
                }
            });
        }
        return result;
    }

    async function leave(guildId, planId, viewer) {
        const result = await db.transaction(async (tx) => {
            const rows = await tx.query(
                'SELECT * FROM community_plans WHERE plan_id = ? AND guild_id = ? FOR UPDATE',
                [String(planId), String(guildId)]
            );
            const plan = rows[0];
            if (!plan) throw new PlansError('PLAN_NOT_FOUND', 'Plan no encontrado', 404);
            if (String(plan.owner_id) === String(viewer.userId)) {
                throw new PlansError('OWNER_CANNOT_LEAVE', 'El owner no puede abandonar su propio plan', 409);
            }
            const removed = await tx.query(
                'DELETE FROM community_plan_attendees WHERE plan_id = ? AND user_id = ?',
                [String(planId), String(viewer.userId)]
            );
            if (removed.affectedRows > 0) {
                await tx.query(
                    `UPDATE community_plans
                     SET attendee_count = GREATEST(0, attendee_count - 1), version = version + 1, updated_at = ?
                     WHERE plan_id = ?`,
                    [new Date(), String(planId)]
                );
            }
            return { joined: false, idempotent: removed.affectedRows === 0 };
        });
        if (!result.idempotent) {
            await eventBus.append({
                guildId,
                type: 'plan.left',
                scope: 'participants',
                subjectUserId: viewer.userId,
                aggregateId: planId,
                payload: { planId: String(planId) }
            });
        }
        return result;
    }

    async function updateStatus(guildId, planId, viewer, status) {
        const normalized = String(status || '').trim().toLowerCase();
        if (!PLAN_STATUSES.has(normalized)) throw new PlansError('INVALID_STATUS', 'Estado de plan inválido');
        let changed = false;
        const plan = await db.transaction(async (tx) => {
            const rows = await tx.query(
                'SELECT * FROM community_plans WHERE plan_id = ? AND guild_id = ? FOR UPDATE',
                [String(planId), String(guildId)]
            );
            const current = rows[0];
            if (!current) throw new PlansError('PLAN_NOT_FOUND', 'Plan no encontrado', 404);
            if (!canManagePlan(current, viewer)) {
                throw new PlansError('PLAN_MANAGER_REQUIRED', 'No puedes cambiar este plan', 403);
            }
            if (current.status === normalized) return mapPlan(current, viewer);
            if (['completed', 'cancelled'].includes(current.status)) {
                throw new PlansError('PLAN_CLOSED', 'El plan ya está cerrado', 409);
            }
            const now = new Date();
            await tx.query(
                `UPDATE community_plans SET status = ?, version = version + 1, updated_at = ?
                 WHERE plan_id = ?`,
                [normalized, now, String(planId)]
            );
            changed = true;
            return mapPlan({
                ...current,
                status: normalized,
                version: Number(current.version) + 1,
                updated_at: now
            }, viewer);
        });
        if (changed) {
            await eventBus.append({
                guildId,
                type: 'plan.status_changed',
                scope: plan.visibility === 'private' ? 'participants' : 'guild_public',
                subjectUserId: viewer.userId,
                aggregateId: planId,
                payload: { planId: String(planId), status: plan.status, version: plan.version }
            });
        }
        return plan;
    }

    async function invite(guildId, planId, viewer, inviteeId) {
        const targetId = String(inviteeId || '').trim();
        if (!/^\d{10,25}$/.test(targetId)) {
            throw new PlansError('INVALID_INVITEE', 'Invitado inválido');
        }
        if (targetId === String(viewer.userId)) {
            throw new PlansError('INVALID_INVITEE', 'No puedes invitarte a tu propio plan');
        }
        const invitation = await db.transaction(async (tx) => {
            const rows = await tx.query(
                'SELECT * FROM community_plans WHERE plan_id = ? AND guild_id = ? FOR UPDATE',
                [String(planId), String(guildId)]
            );
            const plan = rows[0];
            if (!plan) throw new PlansError('PLAN_NOT_FOUND', 'Plan no encontrado', 404);
            if (!canManagePlan(plan, viewer)) {
                throw new PlansError('PLAN_MANAGER_REQUIRED', 'No puedes invitar a este plan', 403);
            }
            if (!['upcoming', 'active'].includes(plan.status)) {
                throw new PlansError('PLAN_CLOSED', 'El plan ya está cerrado', 409);
            }
            const now = new Date();
            await tx.query(
                `INSERT INTO community_plan_invitations
                    (plan_id, guild_id, invitee_id, invited_by, status, created_at, updated_at, responded_at)
                 VALUES (?, ?, ?, ?, 'pending', ?, ?, NULL)
                 ON DUPLICATE KEY UPDATE invited_by = VALUES(invited_by), status = 'pending',
                    updated_at = VALUES(updated_at), responded_at = NULL`,
                [String(planId), String(guildId), targetId, String(viewer.userId), now, now]
            );
            return { planId: String(planId), inviteeId: targetId, status: 'pending', updatedAt: now.toISOString() };
        });
        await eventBus.append({
            guildId,
            type: 'plan.invited',
            scope: 'self',
            subjectUserId: targetId,
            aggregateId: planId,
            payload: { planId: String(planId), status: 'pending' }
        });
        return invitation;
    }

    async function respondInvitation(guildId, planId, viewer, decision) {
        const normalized = String(decision || '').trim().toLowerCase();
        if (!['accepted', 'rejected'].includes(normalized)) {
            throw new PlansError('INVALID_INVITATION_DECISION', 'Respuesta de invitación inválida');
        }
        let changed = false;
        const result = await db.transaction(async (tx) => {
            const rows = await tx.query(
                'SELECT * FROM community_plans WHERE plan_id = ? AND guild_id = ? FOR UPDATE',
                [String(planId), String(guildId)]
            );
            const plan = rows[0];
            if (!plan) throw new PlansError('PLAN_NOT_FOUND', 'Plan no encontrado', 404);
            const invitations = await tx.query(
                `SELECT * FROM community_plan_invitations
                 WHERE plan_id = ? AND guild_id = ? AND invitee_id = ? FOR UPDATE`,
                [String(planId), String(guildId), String(viewer.userId)]
            );
            const invitation = invitations[0];
            if (!invitation) throw new PlansError('INVITATION_NOT_FOUND', 'Invitación no encontrada', 404);
            if (invitation.status === normalized) {
                return { planId: String(planId), status: normalized, idempotent: true };
            }
            if (invitation.status !== 'pending') {
                throw new PlansError('INVITATION_ALREADY_RESPONDED', 'La invitación ya fue respondida', 409);
            }
            if (!['upcoming', 'active'].includes(plan.status)) {
                throw new PlansError('PLAN_CLOSED', 'El plan ya está cerrado', 409);
            }
            const now = new Date();
            if (normalized === 'accepted') {
                const existing = await tx.query(
                    'SELECT 1 FROM community_plan_attendees WHERE plan_id = ? AND user_id = ?',
                    [String(planId), String(viewer.userId)]
                );
                if (!existing[0] && Number(plan.attendee_count) >= Number(plan.capacity)) {
                    throw new PlansError('PLAN_FULL', 'El plan alcanzó su cupo', 409);
                }
                if (!existing[0]) {
                    await tx.query(
                        `INSERT INTO community_plan_attendees (plan_id, guild_id, user_id, joined_at)
                         VALUES (?, ?, ?, ?)`,
                        [String(planId), String(guildId), String(viewer.userId), now]
                    );
                    await tx.query(
                        `UPDATE community_plans SET attendee_count = attendee_count + 1,
                            version = version + 1, updated_at = ? WHERE plan_id = ?`,
                        [now, String(planId)]
                    );
                }
            }
            await tx.query(
                `UPDATE community_plan_invitations SET status = ?, responded_at = ?, updated_at = ?
                 WHERE plan_id = ? AND invitee_id = ?`,
                [normalized, now, now, String(planId), String(viewer.userId)]
            );
            changed = true;
            return { planId: String(planId), status: normalized, idempotent: false };
        });
        if (changed) {
            await eventBus.append({
                guildId,
                type: normalized === 'accepted' ? 'plan.invitation_accepted' : 'plan.invitation_rejected',
                scope: 'self',
                subjectUserId: viewer.userId,
                aggregateId: planId,
                payload: { planId: String(planId), status: normalized }
            });
        }
        return result;
    }

    return { viewerContext, list, create, join, leave, updateStatus, invite, respondInvitation };
}

module.exports = {
    PLAN_STATUSES,
    PLAN_VISIBILITIES,
    PlansError,
    validatePlanInput,
    hasManagerRole,
    canManagePlan,
    createPlansService
};
