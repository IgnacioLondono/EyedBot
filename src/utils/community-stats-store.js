const db = require('./database');

const DEFAULT_TIMEZONE = String(process.env.COMMUNITY_TIMEZONE || 'UTC').trim() || 'UTC';
const DAY_MS = 24 * 60 * 60 * 1000;

function nonNegativeInt(value) {
    return Math.max(0, Number.parseInt(value || 0, 10) || 0);
}

function validTimezone(value = DEFAULT_TIMEZONE) {
    const candidate = String(value || '').trim() || 'UTC';
    try {
        new Intl.DateTimeFormat('en-CA', { timeZone: candidate }).format(new Date());
        return candidate;
    } catch {
        return 'UTC';
    }
}

function dateKey(value = new Date(), timezone = DEFAULT_TIMEZONE) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: validTimezone(timezone),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date(value));
    const part = (type) => parts.find((entry) => entry.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDaysKey(key, days) {
    const [year, month, day] = String(key).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + Number(days || 0))).toISOString().slice(0, 10);
}

function normalizeDailyRow(row) {
    const voiceSeconds = nonNegativeInt(row.voice_seconds) + nonNegativeInt(row.voice_minutes) * 60;
    return {
        date: String(row.date_key || row.stat_date || '').slice(0, 10),
        messages: nonNegativeInt(row.messages),
        voiceSeconds,
        voiceMinutes: Math.floor(voiceSeconds / 60),
        xpEarned: nonNegativeInt(row.xp_earned)
    };
}

function buildDenseSeries(rows, from, to) {
    const indexed = new Map(rows.map((row) => {
        const normalized = normalizeDailyRow(row);
        return [normalized.date, normalized];
    }));
    const result = [];
    for (let key = from; key <= to; key = addDaysKey(key, 1)) {
        result.push(indexed.get(key) || {
            date: key,
            messages: 0,
            voiceSeconds: 0,
            voiceMinutes: 0,
            xpEarned: 0
        });
    }
    return result;
}

function periodRange(period, now = new Date(), timezone = DEFAULT_TIMEZONE) {
    const to = dateKey(now, timezone);
    if (period === 'week') return { from: addDaysKey(to, -6), to };
    if (period === 'month') return { from: `${to.slice(0, 7)}-01`, to };
    if (period === 'year') return { from: `${to.slice(0, 4)}-01-01`, to };
    return { from: null, to };
}

async function ensureTrackingMetadata(queryable, guildId, when = new Date(), timezone = DEFAULT_TIMEZONE) {
    await queryable.query(
        `INSERT IGNORE INTO community_tracking_metadata
            (guild_id, tracking_started_at, timezone) VALUES (?, ?, ?)`,
        [String(guildId), new Date(when), validTimezone(timezone)]
    );
}

async function incrementWithTransaction(tx, guildId, userId, changes, when, timezone) {
    const messages = nonNegativeInt(changes.messages);
    const voiceSeconds = nonNegativeInt(changes.voiceSeconds)
        + nonNegativeInt(changes.voiceMinutes) * 60;
    const xpEarned = nonNegativeInt(changes.xpEarned);
    if (messages + voiceSeconds + xpEarned <= 0) return false;
    await ensureTrackingMetadata(tx, guildId, when, timezone);
    await tx.query(
        `INSERT INTO community_user_totals
            (guild_id, user_id, messages, voice_seconds, xp_earned)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            messages = messages + VALUES(messages),
            voice_seconds = voice_seconds + VALUES(voice_seconds),
            xp_earned = xp_earned + VALUES(xp_earned)`,
        [String(guildId), String(userId), messages, voiceSeconds, xpEarned]
    );
    await tx.query(
        `INSERT INTO community_user_daily_stats
            (guild_id, user_id, stat_date, messages, voice_seconds, xp_earned)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            messages = messages + VALUES(messages),
            voice_seconds = voice_seconds + VALUES(voice_seconds),
            xp_earned = xp_earned + VALUES(xp_earned)`,
        [
            String(guildId), String(userId), changes.statDate || dateKey(when, timezone),
            messages, voiceSeconds, xpEarned
        ]
    );
    return true;
}

async function incrementDailyUserStats(guildId, userId, changes = {}, when = new Date()) {
    return db.transaction((tx) => incrementWithTransaction(
        tx, guildId, userId, changes, when, DEFAULT_TIMEZONE
    ));
}

async function getTrackingMetadata(guildId) {
    const rows = await db.query(
        `SELECT tracking_started_at, timezone FROM community_tracking_metadata
         WHERE guild_id = ? LIMIT 1`,
        [String(guildId)]
    );
    return {
        trackingStartedAt: rows[0]?.tracking_started_at
            ? new Date(rows[0].tracking_started_at).toISOString()
            : null,
        timezone: validTimezone(rows[0]?.timezone || DEFAULT_TIMEZONE)
    };
}

async function getUserDailyStats(guildId, userId, days = 168, now = new Date()) {
    const safeDays = Math.max(1, Math.min(366, Number.parseInt(days, 10) || 168));
    const metadata = await getTrackingMetadata(guildId);
    const to = dateKey(now, metadata.timezone);
    const requestedFrom = addDaysKey(to, -(safeDays - 1));
    const bounds = await db.query(
        `SELECT DATE_FORMAT(MIN(stat_date), '%Y-%m-%d') AS first_date
         FROM community_user_daily_stats WHERE guild_id = ? AND user_id = ?`,
        [String(guildId), String(userId)]
    );
    const metadataFrom = metadata.trackingStartedAt
        ? dateKey(metadata.trackingStartedAt, metadata.timezone)
        : null;
    const firstKnownDate = [bounds[0]?.first_date, metadataFrom].filter(Boolean).sort()[0] || null;
    if (!firstKnownDate) return [];
    const from = requestedFrom > firstKnownDate ? requestedFrom : firstKnownDate;
    const rows = await db.query(
        `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS date_key,
                messages, voice_minutes, voice_seconds, xp_earned
         FROM community_user_daily_stats
         WHERE guild_id = ? AND user_id = ? AND stat_date BETWEEN ? AND ?
         ORDER BY stat_date ASC`,
        [String(guildId), String(userId), from, to]
    );
    return buildDenseSeries(rows, from, to);
}

async function getUserPeriodStats(guildId, userId, period = 'all', now = new Date()) {
    const metadata = await getTrackingMetadata(guildId);
    const range = periodRange(period, now, metadata.timezone);
    const dateClause = range.from ? 'AND stat_date BETWEEN ? AND ?' : '';
    const params = range.from
        ? [String(guildId), String(userId), range.from, range.to]
        : [String(guildId), String(userId)];
    const rows = await db.query(
        `SELECT COALESCE(SUM(messages), 0) AS messages,
                COALESCE(SUM(voice_seconds + (voice_minutes * 60)), 0) AS voice_seconds,
                COALESCE(SUM(xp_earned), 0) AS xp_earned,
                DATE_FORMAT(MIN(stat_date), '%Y-%m-%d') AS data_from,
                DATE_FORMAT(MAX(stat_date), '%Y-%m-%d') AS data_to
         FROM community_user_daily_stats
         WHERE guild_id = ? AND user_id = ? ${dateClause}`,
        params
    );
    const voiceSeconds = nonNegativeInt(rows[0]?.voice_seconds);
    return {
        ...metadata,
        period,
        dataFrom: rows[0]?.data_from || null,
        dataTo: rows[0]?.data_to || null,
        messages: nonNegativeInt(rows[0]?.messages),
        voiceSeconds,
        voiceMinutes: Math.floor(voiceSeconds / 60),
        xpEarned: nonNegativeInt(rows[0]?.xp_earned)
    };
}

async function getUserActivity(guildId, userId, days = 168, now = new Date()) {
    const [metadata, series, sessions] = await Promise.all([
        getTrackingMetadata(guildId),
        getUserDailyStats(guildId, userId, days, now),
        getActiveVoiceSessions(guildId, userId)
    ]);
    const active = sessions[0] || null;
    const activeVoiceSeconds = active
        ? Math.max(0, Math.floor((new Date(now) - new Date(active.checkpointAt)) / 1000))
        : 0;
    return {
        trackingStartedAt: metadata.trackingStartedAt,
        timezone: metadata.timezone,
        dataFrom: series[0]?.date || null,
        dataTo: series[series.length - 1]?.date || null,
        activeVoice: active ? { ...active, uncheckpointedSeconds: activeVoiceSeconds } : null,
        series
    };
}

async function getUserYearStats(guildId, userId, year) {
    const metadata = await getTrackingMetadata(guildId);
    const safeYear = Math.max(2020, Math.min(9999, Number.parseInt(year, 10) || 2020));
    const start = `${safeYear}-01-01`;
    const end = `${safeYear}-12-31`;
    const rows = await db.query(
        `SELECT DATE_FORMAT(stat_date, '%Y-%m-%d') AS date_key,
                messages, voice_minutes, voice_seconds, xp_earned
         FROM community_user_daily_stats
         WHERE guild_id = ? AND user_id = ? AND stat_date BETWEEN ? AND ?
         ORDER BY stat_date ASC`,
        [String(guildId), String(userId), start, end]
    );
    const normalized = rows.map(normalizeDailyRow);
    const totals = normalized.reduce((acc, row) => ({
        messages: acc.messages + row.messages,
        voiceSeconds: acc.voiceSeconds + row.voiceSeconds,
        xpEarned: acc.xpEarned + row.xpEarned
    }), { messages: 0, voiceSeconds: 0, xpEarned: 0 });
    const favorite = normalized.reduce((best, row) => {
        const score = row.messages + row.voiceSeconds;
        return !best || score > best.score ? { date: row.date, score } : best;
    }, null);
    const monthly = Array.from({ length: 12 }, (_, month) => ({
        month: month + 1, messages: 0, voiceSeconds: 0, voiceMinutes: 0, xpEarned: 0
    }));
    for (const row of normalized) {
        const bucket = monthly[Number(row.date.slice(5, 7)) - 1];
        bucket.messages += row.messages;
        bucket.voiceSeconds += row.voiceSeconds;
        bucket.voiceMinutes = Math.floor(bucket.voiceSeconds / 60);
        bucket.xpEarned += row.xpEarned;
    }
    return {
        year: safeYear,
        dataFrom: normalized[0]?.date || null,
        dataTo: normalized[normalized.length - 1]?.date || null,
        trackingStartedAt: metadata.trackingStartedAt,
        timezone: metadata.timezone,
        activeDays: normalized.filter((row) => row.messages || row.voiceSeconds || row.xpEarned).length,
        favoriteDay: favorite?.date || null,
        monthly,
        ...totals,
        voiceMinutes: Math.floor(totals.voiceSeconds / 60)
    };
}

async function getYearXpValues(guildId, year) {
    const safeYear = Math.max(2020, Math.min(9999, Number.parseInt(year, 10) || 2020));
    const rows = await db.query(
        `SELECT user_id, COALESCE(SUM(xp_earned), 0) AS xp_earned
         FROM community_user_daily_stats
         WHERE guild_id = ? AND stat_date BETWEEN ? AND ?
         GROUP BY user_id`,
        [String(guildId), `${safeYear}-01-01`, `${safeYear}-12-31`]
    );
    return new Map(rows.map((row) => [String(row.user_id), nonNegativeInt(row.xp_earned)]));
}

async function getPeriodRanking(guildId, metric = 'xp', period = 'all', now = new Date()) {
    const metadata = await getTrackingMetadata(guildId);
    const range = periodRange(period, now, metadata.timezone);
    const metricSql = {
        xp: 'SUM(xp_earned)',
        messages: 'SUM(messages)',
        voice: 'SUM(voice_seconds + (voice_minutes * 60))'
    }[metric] || 'SUM(xp_earned)';
    const dateClause = range.from ? 'AND stat_date BETWEEN ? AND ?' : '';
    const params = range.from
        ? [String(guildId), range.from, range.to]
        : [String(guildId)];
    const rows = await db.query(
        `SELECT user_id, ${metricSql} AS metric_value
         FROM community_user_daily_stats
         WHERE guild_id = ? ${dateClause}
         GROUP BY user_id`,
        params
    );
    return {
        ...metadata,
        dataFrom: range.from || (metadata.trackingStartedAt
            ? dateKey(metadata.trackingStartedAt, metadata.timezone)
            : null),
        dataTo: range.to,
        values: new Map(rows.map((row) => [String(row.user_id), nonNegativeInt(row.metric_value)]))
    };
}

function nextDateBoundary(cursor, end, timezone) {
    const initialKey = dateKey(cursor, timezone);
    let high = Math.min(end.getTime(), cursor.getTime() + 36 * 60 * 60 * 1000);
    if (dateKey(high, timezone) === initialKey) return new Date(high);
    let low = cursor.getTime();
    while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (dateKey(middle, timezone) === initialKey) low = middle;
        else high = middle;
    }
    return new Date(high);
}

function splitVoiceRange(startedAt, endedAt, timezone = DEFAULT_TIMEZONE) {
    const end = new Date(endedAt);
    let cursor = new Date(startedAt);
    const segments = [];
    while (cursor < end) {
        const boundary = nextDateBoundary(cursor, end, timezone);
        const segmentEnd = boundary > end ? end : boundary;
        const seconds = Math.floor((segmentEnd - cursor) / 1000);
        if (seconds > 0) segments.push({ date: dateKey(cursor, timezone), seconds });
        cursor = segmentEnd;
        if (seconds === 0 && cursor < end) cursor = new Date(cursor.getTime() + 1);
    }
    return segments;
}

async function beginVoiceSession(guildId, userId, startedAt = new Date()) {
    return db.transaction(async (tx) => {
        await ensureTrackingMetadata(tx, guildId, startedAt, DEFAULT_TIMEZONE);
        await tx.query(
            `INSERT IGNORE INTO community_voice_sessions
                (guild_id, user_id, started_at, checkpoint_at) VALUES (?, ?, ?, ?)`,
            [String(guildId), String(userId), new Date(startedAt), new Date(startedAt)]
        );
        return true;
    });
}

async function checkpointVoiceSession(guildId, userId, endedAt = new Date(), close = false) {
    return db.transaction(async (tx) => {
        const sessions = await tx.query(
            `SELECT started_at, checkpoint_at FROM community_voice_sessions
             WHERE guild_id = ? AND user_id = ? FOR UPDATE`,
            [String(guildId), String(userId)]
        );
        if (!sessions[0]) return 0;
        const metadataRows = await tx.query(
            'SELECT timezone FROM community_tracking_metadata WHERE guild_id = ? LIMIT 1',
            [String(guildId)]
        );
        const timezone = validTimezone(metadataRows[0]?.timezone || DEFAULT_TIMEZONE);
        const checkpoint = new Date(sessions[0].checkpoint_at);
        const end = new Date(Math.max(checkpoint.getTime(), new Date(endedAt).getTime()));
        const wholeSeconds = Math.floor((end - checkpoint) / 1000);
        const accountedEnd = new Date(checkpoint.getTime() + wholeSeconds * 1000);
        for (const segment of splitVoiceRange(checkpoint, accountedEnd, timezone)) {
            await incrementWithTransaction(
                tx, guildId, userId,
                { voiceSeconds: segment.seconds, statDate: segment.date },
                checkpoint,
                timezone
            );
        }
        if (close) {
            await tx.query(
                'DELETE FROM community_voice_sessions WHERE guild_id = ? AND user_id = ?',
                [String(guildId), String(userId)]
            );
        } else if (wholeSeconds > 0) {
            await tx.query(
                `UPDATE community_voice_sessions SET checkpoint_at = ?
                 WHERE guild_id = ? AND user_id = ?`,
                [accountedEnd, String(guildId), String(userId)]
            );
        }
        return wholeSeconds;
    });
}

async function getActiveVoiceSessions(guildId, userId = null) {
    const params = [String(guildId)];
    const userClause = userId ? 'AND user_id = ?' : '';
    if (userId) params.push(String(userId));
    const rows = await db.query(
        `SELECT user_id, started_at, checkpoint_at FROM community_voice_sessions
         WHERE guild_id = ? ${userClause}`,
        params
    );
    return rows.map((row) => ({
        userId: String(row.user_id),
        startedAt: new Date(row.started_at).toISOString(),
        checkpointAt: new Date(row.checkpoint_at).toISOString()
    }));
}

async function discardVoiceSession(guildId, userId) {
    await db.query(
        'DELETE FROM community_voice_sessions WHERE guild_id = ? AND user_id = ?',
        [String(guildId), String(userId)]
    );
}

function parsePayload(value) {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
}

async function getWrappedSnapshot(guildId, userId, year) {
    const rows = await db.query(
        `SELECT payload,
                DATE_FORMAT(data_from, '%Y-%m-%d') AS data_from,
                DATE_FORMAT(data_to, '%Y-%m-%d') AS data_to,
                generated_at, finalized, schema_version
         FROM community_wrapped_snapshots
         WHERE guild_id = ? AND user_id = ? AND wrapped_year = ? AND finalized = TRUE LIMIT 1`,
        [String(guildId), String(userId), Number(year)]
    );
    if (!rows[0]) return null;
    const payload = parsePayload(rows[0].payload);
    if (!payload || typeof payload !== 'object') return null;
    return {
        ...payload,
        dataFrom: rows[0].data_from || null,
        dataTo: rows[0].data_to || null,
        generatedAt: rows[0].generated_at
            ? new Date(rows[0].generated_at).toISOString()
            : null,
        finalized: rows[0].finalized === true || Number(rows[0].finalized) === 1,
        schemaVersion: nonNegativeInt(rows[0].schema_version)
    };
}

async function listFinalizedWrappedKeys(guildId, years, minimumSchemaVersion = 1) {
    const safeYears = Array.from(new Set((years || []).map(Number).filter(Number.isInteger)));
    if (!safeYears.length) return new Set();
    const placeholders = safeYears.map(() => '?').join(', ');
    const rows = await db.query(
        `SELECT user_id, wrapped_year FROM community_wrapped_snapshots
         WHERE guild_id = ? AND finalized = TRUE AND schema_version >= ?
            AND wrapped_year IN (${placeholders})`,
        [String(guildId), Number(minimumSchemaVersion) || 1, ...safeYears]
    );
    return new Set(rows.map((row) => `${String(row.user_id)}:${Number(row.wrapped_year)}`));
}

async function saveWrappedSnapshot(guildId, userId, year, payload, metadata = {}) {
    const finalized = metadata.finalized === true;
    await db.query(
        `INSERT INTO community_wrapped_snapshots
            (guild_id, user_id, wrapped_year, payload, data_from, data_to, generated_at, finalized, schema_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            payload = IF(finalized = TRUE AND schema_version >= VALUES(schema_version), payload, VALUES(payload)),
            data_from = IF(finalized = TRUE AND schema_version >= VALUES(schema_version), data_from, VALUES(data_from)),
            data_to = IF(finalized = TRUE AND schema_version >= VALUES(schema_version), data_to, VALUES(data_to)),
            generated_at = IF(finalized = TRUE AND schema_version >= VALUES(schema_version), generated_at, VALUES(generated_at)),
            finalized = IF(finalized = TRUE, TRUE, VALUES(finalized)),
            schema_version = GREATEST(schema_version, VALUES(schema_version))`,
        [
            String(guildId), String(userId), Number(year), JSON.stringify(payload),
            metadata.dataFrom || null, metadata.dataTo || null,
            metadata.generatedAt ? new Date(metadata.generatedAt) : new Date(),
            finalized, nonNegativeInt(metadata.schemaVersion) || 1
        ]
    );
    return payload;
}

module.exports = {
    DEFAULT_TIMEZONE,
    validTimezone,
    dateKey,
    addDaysKey,
    buildDenseSeries,
    periodRange,
    splitVoiceRange,
    incrementDailyUserStats,
    getTrackingMetadata,
    getUserDailyStats,
    getUserActivity,
    getUserYearStats,
    getYearXpValues,
    getUserPeriodStats,
    getPeriodRanking,
    beginVoiceSession,
    checkpointVoiceSession,
    getActiveVoiceSessions,
    discardVoiceSession,
    getWrappedSnapshot,
    listFinalizedWrappedKeys,
    saveWrappedSnapshot
};
