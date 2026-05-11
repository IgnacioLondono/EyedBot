const db = require('./database');
const gachaStore = require('./gacha-store');

const SESSION_TTL_MS = 10 * 60 * 1000;
const memorySessions = new Map();

function normalizeOffer(raw = {}) {
    return {
        coins: Math.max(0, Number.parseInt(`${raw.coins || 0}`, 10) || 0),
        itemUid: String(raw.itemUid || '').trim()
    };
}

function normalizeSession(raw = {}) {
    const createdAt = Number.parseInt(`${raw.createdAt || Date.now()}`, 10) || Date.now();
    const expiresAt = Number.parseInt(`${raw.expiresAt || createdAt + SESSION_TTL_MS}`, 10) || (createdAt + SESSION_TTL_MS);
    return {
        id: String(raw.id || `eco_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
        type: String(raw.type || 'trade'),
        status: String(raw.status || 'pending'),
        guildId: String(raw.guildId || ''),
        channelId: String(raw.channelId || ''),
        messageId: String(raw.messageId || ''),
        initiatorId: String(raw.initiatorId || ''),
        targetId: String(raw.targetId || ''),
        initiatorOffer: normalizeOffer(raw.initiatorOffer || {}),
        targetOffer: normalizeOffer(raw.targetOffer || {}),
        stake: Math.max(0, Number.parseInt(`${raw.stake || 0}`, 10) || 0),
        createdAt,
        expiresAt
    };
}

function sessionKey(guildId, sessionId) {
    return `economy_session_${guildId}_${sessionId}`;
}

async function saveSession(session) {
    const normalized = normalizeSession(session);
    const key = sessionKey(normalized.guildId, normalized.id);
    memorySessions.set(key, normalized);
    try { await db.set(key, normalized); } catch {}
    return normalized;
}

async function getSession(guildId, sessionId) {
    const key = sessionKey(guildId, sessionId);
    const cached = memorySessions.get(key);
    if (cached) return cached;

    let session = null;
    try {
        const fromDb = await db.get(key);
        if (fromDb && typeof fromDb === 'object') session = normalizeSession(fromDb);
    } catch {}

    if (session) memorySessions.set(key, session);
    return session;
}

async function updateSession(session) {
    return saveSession(session);
}

async function removeSession(guildId, sessionId) {
    const key = sessionKey(guildId, sessionId);
    memorySessions.delete(key);
    try { await db.delete(key); } catch {}
}

function isExpired(session = {}) {
    return Date.now() > Number(session.expiresAt || 0);
}

async function findInventoryItem(guildId, userId, itemUid = '') {
    const profile = await gachaStore.getProfile(guildId, userId);
    const uid = String(itemUid || '').trim();
    const index = (profile.inventory || []).findIndex((item) => item.uid === uid);
    if (index < 0) return { ok: false, reason: 'item_not_found', profile };
    return { ok: true, profile, index, item: profile.inventory[index] };
}

async function transferInventoryItem(guildId, fromUserId, toUserId, itemUid = '') {
    const from = await gachaStore.getProfile(guildId, fromUserId);
    const index = (from.inventory || []).findIndex((item) => item.uid === String(itemUid || '').trim());
    if (index < 0) return { ok: false, reason: 'item_not_found' };

    const [item] = from.inventory.splice(index, 1);
    from.collectionCount = from.inventory.length;

    const to = await gachaStore.getProfile(guildId, toUserId);
    to.inventory.unshift(item);
    to.collectionCount = to.inventory.length;

    await gachaStore.setProfile(guildId, fromUserId, from);
    await gachaStore.setProfile(guildId, toUserId, to);
    return { ok: true, item };
}

async function createTradeSession(guildId, initiatorId, targetId, initiatorOffer = {}, targetOffer = {}) {
    const config = await gachaStore.getConfig(guildId);
    if (!config.economyEnabled) return { ok: false, reason: 'economy_disabled' };
    if (!initiatorId || !targetId || initiatorId === targetId) return { ok: false, reason: 'invalid_target' };

    const offerA = normalizeOffer(initiatorOffer);
    const offerB = normalizeOffer(targetOffer);
    if (!offerA.coins && !offerA.itemUid && !offerB.coins && !offerB.itemUid) {
        return { ok: false, reason: 'empty_trade' };
    }

    const initiator = await gachaStore.getProfile(guildId, initiatorId);
    if (offerA.coins > (initiator.coins || 0)) return { ok: false, reason: 'insufficient_funds' };
    if (offerA.itemUid) {
        const item = await findInventoryItem(guildId, initiatorId, offerA.itemUid);
        if (!item.ok) return { ok: false, reason: 'item_not_found' };
    }

    if (offerB.itemUid) {
        const item = await findInventoryItem(guildId, targetId, offerB.itemUid);
        if (!item.ok) return { ok: false, reason: 'target_item_not_found' };
    }

    if (offerB.coins > 0) {
        const target = await gachaStore.getProfile(guildId, targetId);
        if (offerB.coins > (target.coins || 0)) return { ok: false, reason: 'target_insufficient_funds' };
    }

    const session = await saveSession({
        type: 'trade',
        status: 'pending',
        guildId,
        initiatorId,
        targetId,
        initiatorOffer: offerA,
        targetOffer: offerB
    });

    return { ok: true, session };
}

async function executeTrade(guildId, sessionId, actorId) {
    const session = await getSession(guildId, sessionId);
    if (!session || session.type !== 'trade') return { ok: false, reason: 'session_not_found' };
    if (session.status !== 'pending') return { ok: false, reason: 'session_closed' };
    if (isExpired(session)) {
        session.status = 'expired';
        await updateSession(session);
        return { ok: false, reason: 'session_expired' };
    }
    if (actorId !== session.targetId) return { ok: false, reason: 'not_target' };

    const offerA = normalizeOffer(session.initiatorOffer);
    const offerB = normalizeOffer(session.targetOffer);

    const initiator = await gachaStore.getProfile(guildId, session.initiatorId);
    const target = await gachaStore.getProfile(guildId, session.targetId);

    if (offerA.coins > (initiator.coins || 0)) return { ok: false, reason: 'insufficient_funds' };
    if (offerB.coins > (target.coins || 0)) return { ok: false, reason: 'target_insufficient_funds' };
    if (offerA.itemUid) {
        const item = await findInventoryItem(guildId, session.initiatorId, offerA.itemUid);
        if (!item.ok) return { ok: false, reason: 'item_not_found' };
    }
    if (offerB.itemUid) {
        const item = await findInventoryItem(guildId, session.targetId, offerB.itemUid);
        if (!item.ok) return { ok: false, reason: 'target_item_not_found' };
    }

    if (offerA.coins) {
        initiator.coins -= offerA.coins;
        target.coins += offerA.coins;
    }
    if (offerB.coins) {
        target.coins -= offerB.coins;
        initiator.coins += offerB.coins;
    }
    await gachaStore.setProfile(guildId, session.initiatorId, initiator);
    await gachaStore.setProfile(guildId, session.targetId, target);

    if (offerA.itemUid) {
        const moved = await transferInventoryItem(guildId, session.initiatorId, session.targetId, offerA.itemUid);
        if (!moved.ok) return moved;
    }
    if (offerB.itemUid) {
        const moved = await transferInventoryItem(guildId, session.targetId, session.initiatorId, offerB.itemUid);
        if (!moved.ok) return moved;
    }

    session.status = 'completed';
    await updateSession(session);
    await removeSession(guildId, sessionId);
    return { ok: true, session };
}

async function cancelTrade(guildId, sessionId, actorId) {
    const session = await getSession(guildId, sessionId);
    if (!session || session.type !== 'trade') return { ok: false, reason: 'session_not_found' };
    if (session.status !== 'pending') return { ok: false, reason: 'session_closed' };
    if (actorId !== session.initiatorId && actorId !== session.targetId) {
        return { ok: false, reason: 'not_participant' };
    }

    session.status = 'cancelled';
    await updateSession(session);
    await removeSession(guildId, sessionId);
    return { ok: true, session };
}

async function createVersusSession(guildId, initiatorId, targetId, stake = 0) {
    const config = await gachaStore.getConfig(guildId);
    if (!config.economyEnabled) return { ok: false, reason: 'economy_disabled' };
    if (!initiatorId || !targetId || initiatorId === targetId) return { ok: false, reason: 'invalid_target' };

    const amount = Math.max(1, Number.parseInt(`${stake || 0}`, 10) || 0);
    const initiator = await gachaStore.getProfile(guildId, initiatorId);
    if ((initiator.coins || 0) < amount) return { ok: false, reason: 'insufficient_funds' };

    const session = await saveSession({
        type: 'versus',
        status: 'pending',
        guildId,
        initiatorId,
        targetId,
        stake: amount
    });

    return { ok: true, session };
}

async function resolveVersus(guildId, sessionId, actorId) {
    const session = await getSession(guildId, sessionId);
    if (!session || session.type !== 'versus') return { ok: false, reason: 'session_not_found' };
    if (session.status !== 'pending') return { ok: false, reason: 'session_closed' };
    if (isExpired(session)) {
        session.status = 'expired';
        await updateSession(session);
        return { ok: false, reason: 'session_expired' };
    }
    if (actorId !== session.targetId) return { ok: false, reason: 'not_target' };

    const stake = Math.max(1, Number(session.stake || 0));
    const initiator = await gachaStore.getProfile(guildId, session.initiatorId);
    const target = await gachaStore.getProfile(guildId, session.targetId);
    if ((initiator.coins || 0) < stake) return { ok: false, reason: 'insufficient_funds' };
    if ((target.coins || 0) < stake) return { ok: false, reason: 'target_insufficient_funds' };

    initiator.coins -= stake;
    target.coins -= stake;
    await gachaStore.setProfile(guildId, session.initiatorId, initiator);
    await gachaStore.setProfile(guildId, session.targetId, target);

    const rollA = Math.floor(Math.random() * 100) + 1;
    const rollB = Math.floor(Math.random() * 100) + 1;
    let winnerId = '';
    let loserId = '';
    let result = 'tie';

    if (rollA > rollB) {
        winnerId = session.initiatorId;
        loserId = session.targetId;
        result = 'initiator';
    } else if (rollB > rollA) {
        winnerId = session.targetId;
        loserId = session.initiatorId;
        result = 'target';
    }

    if (winnerId) {
        const winner = await gachaStore.getProfile(guildId, winnerId);
        winner.coins += stake * 2;
        await gachaStore.setProfile(guildId, winnerId, winner);
    } else {
        const refundA = await gachaStore.getProfile(guildId, session.initiatorId);
        const refundB = await gachaStore.getProfile(guildId, session.targetId);
        refundA.coins += stake;
        refundB.coins += stake;
        await gachaStore.setProfile(guildId, session.initiatorId, refundA);
        await gachaStore.setProfile(guildId, session.targetId, refundB);
    }

    session.status = 'completed';
    session.rollA = rollA;
    session.rollB = rollB;
    session.winnerId = winnerId;
    session.loserId = loserId;
    session.result = result;
    await updateSession(session);
    await removeSession(guildId, sessionId);

    return {
        ok: true,
        session,
        rollA,
        rollB,
        winnerId,
        loserId,
        result,
        pot: stake * 2
    };
}

async function declineVersus(guildId, sessionId, actorId) {
    const session = await getSession(guildId, sessionId);
    if (!session || session.type !== 'versus') return { ok: false, reason: 'session_not_found' };
    if (session.status !== 'pending') return { ok: false, reason: 'session_closed' };
    if (actorId !== session.targetId && actorId !== session.initiatorId) {
        return { ok: false, reason: 'not_participant' };
    }

    session.status = 'cancelled';
    await updateSession(session);
    await removeSession(guildId, sessionId);
    return { ok: true, session };
}

async function attachMessageToSession(guildId, sessionId, channelId, messageId) {
    const session = await getSession(guildId, sessionId);
    if (!session) return null;
    session.channelId = String(channelId || '');
    session.messageId = String(messageId || '');
    return updateSession(session);
}

module.exports = {
    SESSION_TTL_MS,
    createTradeSession,
    executeTrade,
    cancelTrade,
    createVersusSession,
    resolveVersus,
    declineVersus,
    getSession,
    attachMessageToSession,
    transferInventoryItem
};
