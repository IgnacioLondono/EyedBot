const db = require('./database');

function nonNegativeInt(value) {
    return Math.max(0, Number.parseInt(value || 0, 10) || 0);
}

function isoDay(value = new Date()) {
    return new Date(value).toISOString().slice(0, 10);
}

async function incrementDailyUserStats(guildId, userId, changes = {}, when = new Date()) {
    const messages = nonNegativeInt(changes.messages);
    const voiceMinutes = nonNegativeInt(changes.voiceMinutes);
    const xpEarned = nonNegativeInt(changes.xpEarned);
    if (messages + voiceMinutes + xpEarned <= 0) return false;

    await db.query(
        `INSERT INTO community_user_daily_stats
            (guild_id, user_id, stat_date, messages, voice_minutes, xp_earned)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            messages = messages + VALUES(messages),
            voice_minutes = voice_minutes + VALUES(voice_minutes),
            xp_earned = xp_earned + VALUES(xp_earned)`,
        [String(guildId), String(userId), isoDay(when), messages, voiceMinutes, xpEarned]
    );
    return true;
}

async function getUserYearStats(guildId, userId, year) {
    const safeYear = Math.max(2020, Math.min(9999, Number.parseInt(year, 10) || new Date().getUTCFullYear()));
    const start = `${safeYear}-01-01`;
    const end = `${safeYear}-12-31`;
    const rows = await db.query(
        `SELECT stat_date, messages, voice_minutes, xp_earned
         FROM community_user_daily_stats
         WHERE guild_id = ? AND user_id = ? AND stat_date BETWEEN ? AND ?
         ORDER BY stat_date ASC`,
        [String(guildId), String(userId), start, end]
    );

    const normalized = rows.map((row) => ({
        date: isoDay(row.stat_date),
        messages: nonNegativeInt(row.messages),
        voiceMinutes: nonNegativeInt(row.voice_minutes),
        xpEarned: nonNegativeInt(row.xp_earned)
    }));
    const totals = normalized.reduce((acc, row) => ({
        messages: acc.messages + row.messages,
        voiceMinutes: acc.voiceMinutes + row.voiceMinutes,
        xpEarned: acc.xpEarned + row.xpEarned
    }), { messages: 0, voiceMinutes: 0, xpEarned: 0 });
    const favorite = normalized.reduce((best, row) => {
        const score = row.messages + row.voiceMinutes;
        return !best || score > best.score ? { date: row.date, score } : best;
    }, null);
    const monthly = Array.from({ length: 12 }, (_, month) => ({
        month: month + 1,
        messages: 0,
        voiceMinutes: 0,
        xpEarned: 0
    }));
    for (const row of normalized) {
        const monthIndex = Math.max(0, Math.min(11, Number.parseInt(row.date.slice(5, 7), 10) - 1));
        monthly[monthIndex].messages += row.messages;
        monthly[monthIndex].voiceMinutes += row.voiceMinutes;
        monthly[monthIndex].xpEarned += row.xpEarned;
    }

    return {
        year: safeYear,
        availableFrom: normalized[0]?.date || null,
        availableTo: normalized[normalized.length - 1]?.date || null,
        isCompletePeriod: normalized[0]?.date === start && normalized[normalized.length - 1]?.date === end,
        activeDays: normalized.filter((row) => row.messages > 0 || row.voiceMinutes > 0).length,
        favoriteDay: favorite?.date || null,
        monthly,
        ...totals
    };
}

async function getUserDailyStats(guildId, userId, days = 180) {
    const safeDays = Math.max(1, Math.min(366, Number.parseInt(days, 10) || 180));
    const start = new Date(Date.now() - (safeDays - 1) * 24 * 60 * 60 * 1000);
    const rows = await db.query(
        `SELECT stat_date, messages, voice_minutes, xp_earned
         FROM community_user_daily_stats
         WHERE guild_id = ? AND user_id = ? AND stat_date >= ?
         ORDER BY stat_date ASC`,
        [String(guildId), String(userId), isoDay(start)]
    );
    return rows.map((row) => ({
        date: isoDay(row.stat_date),
        messages: nonNegativeInt(row.messages),
        voiceMinutes: nonNegativeInt(row.voice_minutes),
        xpEarned: nonNegativeInt(row.xp_earned)
    }));
}

async function getWrappedSnapshot(guildId, userId, year) {
    const rows = await db.query(
        `SELECT payload FROM community_wrapped_snapshots
         WHERE guild_id = ? AND user_id = ? AND wrapped_year = ? LIMIT 1`,
        [String(guildId), String(userId), Number(year)]
    );
    if (!rows[0]) return null;
    if (typeof rows[0].payload === 'string') {
        try {
            return JSON.parse(rows[0].payload);
        } catch {
            return null;
        }
    }
    return rows[0].payload;
}

async function saveWrappedSnapshot(guildId, userId, year, payload) {
    const serialized = JSON.stringify(payload);
    await db.query(
        `INSERT INTO community_wrapped_snapshots (guild_id, user_id, wrapped_year, payload)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
        [String(guildId), String(userId), Number(year), serialized]
    );
    return payload;
}

module.exports = {
    incrementDailyUserStats,
    getUserDailyStats,
    getUserYearStats,
    getWrappedSnapshot,
    saveWrappedSnapshot
};
