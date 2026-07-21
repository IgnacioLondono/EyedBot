const db = require('./database');
const communityStatsStore = require('./community-stats-store');
const { communityEventBus } = require('./community-event-bus');

const CHALLENGE_DEFINITIONS = Object.freeze([
    { id: 'weekly_messages_50', title: 'Conversación semanal', description: 'Envía 50 mensajes esta semana.', metric: 'messages', target: 50, reward: 100, order: 10 },
    { id: 'weekly_voice_hour', title: 'Hora en compañía', description: 'Acumula una hora en voz esta semana.', metric: 'voice_seconds', target: 3600, reward: 150, order: 20 },
    { id: 'weekly_xp_500', title: 'Impulso de experiencia', description: 'Obtén 500 XP esta semana.', metric: 'xp', target: 500, reward: 125, order: 30 },
    { id: 'weekly_active_5', title: 'Constancia semanal', description: 'Participa durante 5 días distintos esta semana.', metric: 'active_days', target: 5, reward: 200, order: 40 }
]);

const ACHIEVEMENT_DEFINITIONS = Object.freeze([
    { id: 'messages_100', title: 'Primeras palabras', description: 'Envía 100 mensajes.', metric: 'messages', target: 100, reward: 75, order: 10 },
    { id: 'messages_1000', title: 'Voz de la comunidad', description: 'Envía 1.000 mensajes.', metric: 'messages', target: 1000, reward: 250, order: 20 },
    { id: 'voice_hour', title: 'En la llamada', description: 'Acumula una hora en voz.', metric: 'voice_seconds', target: 3600, reward: 100, order: 30 },
    { id: 'voice_ten_hours', title: 'Siempre conectado', description: 'Acumula diez horas en voz.', metric: 'voice_seconds', target: 36000, reward: 300, order: 40 },
    { id: 'xp_1000', title: 'En ascenso', description: 'Obtén 1.000 XP.', metric: 'xp', target: 1000, reward: 150, order: 50 },
    { id: 'level_10', title: 'Nivel de dos dígitos', description: 'Alcanza el nivel 10.', metric: 'level', target: 10, reward: 250, order: 60 },
    { id: 'gacha_pulls_10', title: 'Invocador', description: 'Realiza 10 tiradas de gacha.', metric: 'gacha_pulls', target: 10, reward: 100, order: 70 },
    { id: 'gacha_claims_10', title: 'Coleccionista', description: 'Reclama 10 personajes.', metric: 'gacha_claims', target: 10, reward: 150, order: 80 },
    { id: 'gacha_collection_25', title: 'Galería creciente', description: 'Reúne 25 personajes.', metric: 'gacha_collection', target: 25, reward: 300, order: 90 }
]);

function nonNegativeInt(value) {
    return Math.max(0, Number.parseInt(value || 0, 10) || 0);
}

function parseJson(value) {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(String(value || '{}')); } catch { return {}; }
}

function weeklyPeriod(now = new Date(), timezone = communityStatsStore.DEFAULT_TIMEZONE) {
    const today = communityStatsStore.dateKey(now, timezone);
    const day = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const startsOn = communityStatsStore.addDaysKey(today, mondayOffset);
    const endsOn = communityStatsStore.addDaysKey(startsOn, 6);
    return { key: `week:${startsOn}`, startsOn, endsOn, timezone };
}

function metricValue(definition, snapshot) {
    return nonNegativeInt(snapshot[definition.metric]);
}

async function seedDefinitions(queryable = db) {
    for (const item of CHALLENGE_DEFINITIONS) {
        await queryable.query(
            `INSERT INTO challenge_definitions
                (challenge_id, title, description, metric, target_value, reward_coins, cadence, enabled, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, 'weekly', TRUE, ?)
             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description),
                metric = VALUES(metric), target_value = VALUES(target_value),
                reward_coins = VALUES(reward_coins), sort_order = VALUES(sort_order)`,
            [item.id, item.title, item.description, item.metric, item.target, item.reward, item.order]
        );
    }
    for (const item of ACHIEVEMENT_DEFINITIONS) {
        await queryable.query(
            `INSERT INTO achievement_definitions
                (achievement_id, title, description, metric, target_value, reward_coins, enabled, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)
             ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description),
                metric = VALUES(metric), target_value = VALUES(target_value),
                reward_coins = VALUES(reward_coins), sort_order = VALUES(sort_order)`,
            [item.id, item.title, item.description, item.metric, item.target, item.reward, item.order]
        );
    }
}

let definitionsSeedPromise = null;
function ensureDefinitionsSeeded() {
    if (!definitionsSeedPromise) {
        definitionsSeedPromise = seedDefinitions(db).catch((error) => {
            definitionsSeedPromise = null;
            throw error;
        });
    }
    return definitionsSeedPromise;
}

async function ensurePeriods(queryable, guildId, period) {
    for (const definition of CHALLENGE_DEFINITIONS) {
        await queryable.query(
            `INSERT IGNORE INTO challenge_periods
                (guild_id, challenge_id, period_key, starts_on, ends_on, timezone)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [String(guildId), definition.id, period.key, period.startsOn, period.endsOn, period.timezone]
        );
    }
}

async function loadSnapshot(queryable, guildId, userId, period) {
    const weeklyRows = await queryable.query(
        `SELECT COALESCE(SUM(messages), 0) AS messages,
                COALESCE(SUM(voice_seconds + (voice_minutes * 60)), 0) AS voice_seconds,
                COALESCE(SUM(xp_earned), 0) AS xp,
                COUNT(DISTINCT CASE WHEN messages > 0 OR voice_seconds > 0 OR voice_minutes > 0 OR xp_earned > 0
                    THEN stat_date END) AS active_days
         FROM community_user_daily_stats
         WHERE guild_id = ? AND user_id = ? AND stat_date BETWEEN ? AND ?`,
        [String(guildId), String(userId), period.startsOn, period.endsOn]
    );
    const totalRows = await queryable.query(
        `SELECT messages, voice_seconds, xp_earned
         FROM community_user_totals WHERE guild_id = ? AND user_id = ? LIMIT 1`,
        [String(guildId), String(userId)]
    );
    const levelingRows = await queryable.query(
        'SELECT `value` FROM key_value_store WHERE `key` = ? LIMIT 1',
        [`leveling_user_${guildId}_${userId}`]
    );
    const gachaRows = await queryable.query(
        'SELECT `value` FROM key_value_store WHERE `key` = ? LIMIT 1',
        [`gacha_profile_${guildId}_${userId}`]
    );
    const weekly = weeklyRows[0] || {};
    const totals = totalRows[0] || {};
    const leveling = parseJson(levelingRows[0]?.value);
    const gacha = parseJson(gachaRows[0]?.value);
    return {
        weekly: {
            messages: nonNegativeInt(weekly.messages),
            voice_seconds: nonNegativeInt(weekly.voice_seconds),
            xp: nonNegativeInt(weekly.xp),
            active_days: nonNegativeInt(weekly.active_days)
        },
        achievements: {
            messages: Math.max(nonNegativeInt(totals.messages), nonNegativeInt(leveling.messageCount)),
            voice_seconds: Math.max(nonNegativeInt(totals.voice_seconds), nonNegativeInt(leveling.voiceMinutes) * 60),
            xp: Math.max(nonNegativeInt(totals.xp_earned), nonNegativeInt(leveling.xp)),
            level: nonNegativeInt(leveling.level),
            gacha_pulls: nonNegativeInt(gacha.totalRolls),
            gacha_claims: nonNegativeInt(gacha.totalClaims),
            gacha_collection: Math.max(nonNegativeInt(gacha.collectionCount), Array.isArray(gacha.inventory) ? gacha.inventory.length : 0)
        }
    };
}

async function syncChallengeProgress(queryable, guildId, userId, period, snapshot) {
    const changed = [];
    const periods = await queryable.query(
        `SELECT period_id, challenge_id FROM challenge_periods
         WHERE guild_id = ? AND period_key = ?`,
        [String(guildId), period.key]
    );
    const periodByChallenge = new Map(periods.map((row) => [String(row.challenge_id), row.period_id]));
    for (const definition of CHALLENGE_DEFINITIONS) {
        const periodId = periodByChallenge.get(definition.id);
        if (!periodId) continue;
        const progress = metricValue(definition, snapshot.weekly);
        const result = await queryable.query(
            `INSERT INTO challenge_progress
                (period_id, guild_id, user_id, challenge_id, progress_value, completed_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE progress_value = VALUES(progress_value),
                completed_at = COALESCE(completed_at, VALUES(completed_at))`,
            [
                periodId, String(guildId), String(userId), definition.id, progress,
                progress >= definition.target ? new Date() : null
            ]
        );
        if (result.affectedRows > 0) {
            changed.push({
                challengeId: definition.id,
                progress,
                completed: progress >= definition.target
            });
        }
    }
    return changed;
}

async function unlockAchievements(tx, guildId, userId, snapshot, rewardStore) {
    const unlocked = [];
    for (const definition of ACHIEVEMENT_DEFINITIONS) {
        const progress = metricValue(definition, snapshot.achievements);
        if (progress < definition.target) continue;
        const now = new Date();
        const inserted = await tx.query(
            `INSERT IGNORE INTO achievement_unlocks
                (guild_id, user_id, achievement_id, unlocked_at, reward_coins)
             VALUES (?, ?, ?, ?, ?)`,
            [String(guildId), String(userId), definition.id, now, definition.reward]
        );
        if (!inserted.affectedRows) continue;
        if (definition.reward > 0) {
            await rewardStore.addCoins(guildId, userId, definition.reward, {
                transaction: tx,
                idempotencyKey: `achievement:${definition.id}`,
                sourceType: 'achievement',
                sourceId: definition.id
            });
        }
        await tx.query(
            `INSERT IGNORE INTO community_discord_outbox
                (guild_id, user_id, event_type, event_key, payload, status, attempts, next_attempt_at)
             VALUES (?, ?, 'achievement_unlocked', ?, ?, 'pending', 0, ?)`,
            [
                String(guildId), String(userId), definition.id,
                JSON.stringify({ achievementId: definition.id, title: definition.title, rewardCoins: definition.reward }),
                now
            ]
        );
        unlocked.push(definition.id);
    }
    return unlocked;
}

async function evaluateUser(guildId, userId, now = new Date()) {
    const timezone = communityStatsStore.validTimezone(process.env.COMMUNITY_TIMEZONE);
    const period = weeklyPeriod(now, timezone);
    const rewardStore = require('./gacha-store');
    await ensureDefinitionsSeeded();
    const result = await db.transaction(async (tx) => {
        await ensurePeriods(tx, guildId, period);
        const snapshot = await loadSnapshot(tx, guildId, userId, period);
        const progressChanged = await syncChallengeProgress(tx, guildId, userId, period, snapshot);
        const unlocked = await unlockAchievements(tx, guildId, userId, snapshot, rewardStore);
        return { snapshot, unlocked, progressChanged };
    });
    rewardStore.invalidateProfileCache(guildId, userId);
    for (const progress of result.progressChanged) {
        communityEventBus.appendAsync({
            guildId,
            type: 'challenge.progress',
            scope: 'self',
            subjectUserId: userId,
            aggregateId: progress.challengeId,
            payload: progress
        }, 'challenge.progress');
    }
    for (const achievementId of result.unlocked) {
        communityEventBus.appendAsync({
            guildId,
            type: 'achievement.unlocked',
            scope: 'self',
            subjectUserId: userId,
            aggregateId: achievementId,
            payload: { achievementId }
        }, 'achievement.unlocked');
    }
    return result;
}

async function getChallenges(guildId, userId, now = new Date()) {
    await evaluateUser(guildId, userId, now);
    const period = weeklyPeriod(now, communityStatsStore.validTimezone(process.env.COMMUNITY_TIMEZONE));
    const rows = await db.query(
        `SELECT d.challenge_id, d.title, d.description, d.metric, d.target_value, d.reward_coins,
                p.period_id, p.period_key, p.starts_on, p.ends_on, p.timezone,
                COALESCE(pr.progress_value, 0) AS progress_value, pr.completed_at, c.claimed_at
         FROM challenge_definitions d
         JOIN challenge_periods p ON p.challenge_id = d.challenge_id AND p.guild_id = ? AND p.period_key = ?
         LEFT JOIN challenge_progress pr ON pr.period_id = p.period_id AND pr.user_id = ?
         LEFT JOIN challenge_claims c ON c.period_id = p.period_id AND c.user_id = ?
         WHERE d.enabled = TRUE ORDER BY d.sort_order, d.challenge_id`,
        [String(guildId), period.key, String(userId), String(userId)]
    );
    return {
        period,
        items: rows.map((row) => ({
            id: String(row.challenge_id),
            definition: { title: row.title, description: row.description, metric: row.metric, target: nonNegativeInt(row.target_value) },
            progress: nonNegativeInt(row.progress_value),
            completed: Boolean(row.completed_at),
            reward: { eyedCoins: nonNegativeInt(row.reward_coins) },
            claimed: Boolean(row.claimed_at),
            claimedAt: row.claimed_at ? new Date(row.claimed_at).toISOString() : null
        }))
    };
}

async function getAchievements(guildId, userId, now = new Date()) {
    const evaluated = await evaluateUser(guildId, userId, now);
    const rows = await db.query(
        `SELECT d.achievement_id, d.title, d.description, d.metric, d.target_value, d.reward_coins,
                u.unlocked_at
         FROM achievement_definitions d
         LEFT JOIN achievement_unlocks u ON u.guild_id = ? AND u.user_id = ?
            AND u.achievement_id = d.achievement_id
         WHERE d.enabled = TRUE ORDER BY d.sort_order, d.achievement_id`,
        [String(guildId), String(userId)]
    );
    return {
        items: rows.map((row) => ({
            id: String(row.achievement_id),
            definition: { title: row.title, description: row.description, metric: row.metric, target: nonNegativeInt(row.target_value) },
            progress: metricValue({ metric: row.metric }, evaluated.snapshot.achievements),
            unlocked: Boolean(row.unlocked_at),
            unlockedAt: row.unlocked_at ? new Date(row.unlocked_at).toISOString() : null,
            reward: { eyedCoins: nonNegativeInt(row.reward_coins) }
        }))
    };
}

async function claimChallenge(guildId, userId, challengeId, now = new Date()) {
    const timezone = communityStatsStore.validTimezone(process.env.COMMUNITY_TIMEZONE);
    const period = weeklyPeriod(now, timezone);
    const rewardStore = require('./gacha-store');
    await ensureDefinitionsSeeded();
    const result = await db.transaction(async (tx) => {
        await ensurePeriods(tx, guildId, period);
        const definitions = await tx.query(
            `SELECT d.challenge_id, d.target_value, d.reward_coins, p.period_id
             FROM challenge_definitions d JOIN challenge_periods p ON p.challenge_id = d.challenge_id
             WHERE d.challenge_id = ? AND d.enabled = TRUE AND p.guild_id = ? AND p.period_key = ? LIMIT 1`,
            [String(challengeId), String(guildId), period.key]
        );
        const definition = definitions[0];
        if (!definition) return { ok: false, reason: 'not_found' };
        const snapshot = await loadSnapshot(tx, guildId, userId, period);
        await syncChallengeProgress(tx, guildId, userId, period, snapshot);
        const progressRows = await tx.query(
            `SELECT progress_value FROM challenge_progress
             WHERE period_id = ? AND user_id = ? FOR UPDATE`,
            [definition.period_id, String(userId)]
        );
        if (nonNegativeInt(progressRows[0]?.progress_value) < nonNegativeInt(definition.target_value)) {
            return { ok: false, reason: 'incomplete' };
        }
        const inserted = await tx.query(
            `INSERT IGNORE INTO challenge_claims
                (period_id, guild_id, user_id, challenge_id, reward_coins, claimed_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                definition.period_id, String(guildId), String(userId), String(challengeId),
                nonNegativeInt(definition.reward_coins), now
            ]
        );
        if (!inserted.affectedRows) {
            return {
                ok: true,
                idempotent: true,
                reward: { eyedCoins: nonNegativeInt(definition.reward_coins) }
            };
        }
        const profile = await rewardStore.addCoins(guildId, userId, definition.reward_coins, {
            transaction: tx,
            idempotencyKey: `challenge:${definition.period_id}:${challengeId}`,
            sourceType: 'challenge',
            sourceId: `${definition.period_id}:${challengeId}`
        });
        return { ok: true, reward: { eyedCoins: nonNegativeInt(definition.reward_coins) }, profile };
    });
    rewardStore.invalidateProfileCache(guildId, userId);
    if (result.idempotent) {
        result.profile = await rewardStore.getProfile(guildId, userId);
    }
    if (result.ok && !result.idempotent) {
        await communityEventBus.append({
            guildId,
            type: 'challenge.claimed',
            scope: 'self',
            subjectUserId: userId,
            aggregateId: challengeId,
            payload: {
                challengeId: String(challengeId),
                rewardCoins: result.reward.eyedCoins
            }
        });
    }
    return result;
}

let dispatching = false;
async function dispatchDiscordOutbox(client, limit = 10) {
    if (!client || dispatching) return 0;
    dispatching = true;
    try {
        await db.query(
            `UPDATE community_discord_outbox SET status = 'pending'
             WHERE status = 'processing' AND updated_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE)`
        );
        const rows = await db.query(
            `SELECT outbox_id, guild_id, user_id, payload, attempts
             FROM community_discord_outbox
             WHERE status = 'pending' AND next_attempt_at <= NOW(3)
             ORDER BY outbox_id ASC LIMIT ?`,
            [Math.max(1, Math.min(50, nonNegativeInt(limit) || 10))]
        );
        let sent = 0;
        for (const row of rows) {
            const claimed = await db.query(
                `UPDATE community_discord_outbox SET status = 'processing', attempts = attempts + 1
                 WHERE outbox_id = ? AND status = 'pending'`,
                [row.outbox_id]
            );
            if (!claimed.affectedRows) continue;
            try {
                const payload = parseJson(row.payload);
                const content = `🏆 Logro desbloqueado: **${String(payload.title || 'Nuevo logro').slice(0, 120)}**`
                    + (nonNegativeInt(payload.rewardCoins) ? ` · +${nonNegativeInt(payload.rewardCoins)} EyedCoins` : '');
                const guild = client.guilds.cache.get(String(row.guild_id));
                const channelId = String(process.env.COMMUNITY_ACHIEVEMENT_CHANNEL_ID || '').trim();
                const channel = channelId
                    ? (guild?.channels.cache.get(channelId) || await guild?.channels.fetch(channelId).catch(() => null))
                    : null;
                if (channel?.isTextBased?.()) await channel.send({ content: `<@${row.user_id}> ${content}`, allowedMentions: { users: [String(row.user_id)] } });
                else {
                    const user = await client.users.fetch(String(row.user_id));
                    await user.send({ content });
                }
                await db.query(
                    `UPDATE community_discord_outbox SET status = 'sent', sent_at = NOW(3), last_error = NULL
                     WHERE outbox_id = ?`,
                    [row.outbox_id]
                );
                sent += 1;
            } catch (error) {
                const attempts = nonNegativeInt(row.attempts) + 1;
                const dead = attempts >= 8;
                const delayMinutes = Math.min(360, 2 ** Math.min(8, attempts));
                await db.query(
                    `UPDATE community_discord_outbox SET status = ?,
                        next_attempt_at = DATE_ADD(NOW(3), INTERVAL ? MINUTE), last_error = ?
                     WHERE outbox_id = ?`,
                    [dead ? 'dead' : 'pending', delayMinutes, String(error?.message || error).slice(0, 500), row.outbox_id]
                );
            }
        }
        return sent;
    } finally {
        dispatching = false;
    }
}

let outboxTimer = null;
function startDiscordOutboxDispatcher(client) {
    stopDiscordOutboxDispatcher();
    const intervalMs = Math.max(15000, Number.parseInt(process.env.COMMUNITY_OUTBOX_INTERVAL_MS || '60000', 10) || 60000);
    outboxTimer = setInterval(() => dispatchDiscordOutbox(client).catch((error) => {
        console.warn('[community-outbox] Falló el despacho:', error?.message || error);
    }), intervalMs);
    outboxTimer.unref?.();
    dispatchDiscordOutbox(client).catch(() => null);
}

function stopDiscordOutboxDispatcher() {
    if (outboxTimer) clearInterval(outboxTimer);
    outboxTimer = null;
}

module.exports = {
    CHALLENGE_DEFINITIONS,
    ACHIEVEMENT_DEFINITIONS,
    weeklyPeriod,
    metricValue,
    seedDefinitions,
    ensureDefinitionsSeeded,
    evaluateUser,
    getChallenges,
    getAchievements,
    claimChallenge,
    dispatchDiscordOutbox,
    startDiscordOutboxDispatcher,
    stopDiscordOutboxDispatcher
};
