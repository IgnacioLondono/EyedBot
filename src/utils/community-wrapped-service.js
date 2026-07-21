const defaultStore = require('./community-stats-store');

const WRAPPED_SCHEMA_VERSION = 3;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 25;

function compareUserIds(left, right) {
    const a = String(left);
    const b = String(right);
    if (a.length !== b.length) return a.length - b.length;
    return a < b ? -1 : a > b ? 1 : 0;
}

function rankYearXp(memberIds, xpValues, targetUserId) {
    const values = xpValues instanceof Map ? xpValues : new Map(Object.entries(xpValues || {}));
    const ranked = Array.from(new Set([
        ...(memberIds || []).map(String),
        ...Array.from(values.keys(), String)
    ]))
        .map((userId) => ({
            userId,
            xpEarned: Math.max(0, Number.parseInt(values.get(userId) || 0, 10) || 0)
        }))
        .sort((left, right) => (
            right.xpEarned - left.xpEarned || compareUserIds(left.userId, right.userId)
        ));
    const index = ranked.findIndex((entry) => entry.userId === String(targetUserId));
    return index < 0 ? null : index + 1;
}

function getPastTrackingYears(trackingStartedAt, timezone, now = new Date(), dateKey = defaultStore.dateKey) {
    if (!trackingStartedAt) return [];
    const firstYear = Number(dateKey(trackingStartedAt, timezone).slice(0, 4));
    const currentYear = Number(dateKey(now, timezone).slice(0, 4));
    if (!Number.isInteger(firstYear) || firstYear >= currentYear) return [];
    return Array.from({ length: currentYear - firstYear }, (_, index) => firstYear + index);
}

function snapshotKey(userId, year) {
    return `${String(userId)}:${Number(year)}`;
}

function selectMissingSnapshotTasks(memberIds, years, finalizedKeys, batchSize = DEFAULT_BATCH_SIZE) {
    const existing = finalizedKeys instanceof Set ? finalizedKeys : new Set(finalizedKeys || []);
    const limit = Math.max(1, Number.parseInt(batchSize, 10) || DEFAULT_BATCH_SIZE);
    const tasks = [];
    for (const year of [...years].sort((a, b) => a - b)) {
        for (const userId of Array.from(new Set(memberIds.map(String))).sort(compareUserIds)) {
            if (!existing.has(snapshotKey(userId, year))) tasks.push({ userId, year });
            if (tasks.length >= limit) return tasks;
        }
    }
    return tasks;
}

function isCurrentSnapshot(payload) {
    return Boolean(
        payload
        && Number.isInteger(payload.year)
        && Object.hasOwn(payload, 'dataFrom')
        && Object.hasOwn(payload, 'dataTo')
        && typeof payload.generatedAt === 'string'
        && payload.finalized === true
        && payload.schemaVersion === WRAPPED_SCHEMA_VERSION
        && Number.isInteger(payload.stats?.rank)
    );
}

function createWrappedService(options = {}) {
    const store = options.store || defaultStore;
    const now = options.now || (() => new Date());
    const memberView = options.memberView || ((member) => ({
        id: member.user.id,
        username: member.user.username,
        displayName: member.displayName || member.user.globalName || member.user.username,
        avatarUrl: member.displayAvatarURL?.({ size: 256 }) || null,
        joinedAt: member.joinedAt?.toISOString?.() || null
    }));

    async function generate({ guildId, userId, year, member, memberIds, finalized, xpValues }) {
        const [period, annualXp] = await Promise.all([
            store.getUserYearStats(guildId, userId, year),
            xpValues ? Promise.resolve(xpValues) : store.getYearXpValues(guildId, year)
        ]);
        const rank = rankYearXp(memberIds, annualXp, userId);
        if (rank === null) throw new Error('El usuario no está incluido entre los miembros humanos');

        const highlights = [];
        if (period.messages > 0) {
            highlights.push(`Escribiste ${period.messages.toLocaleString('es')} mensajes en la comunidad.`);
        }
        if (period.voiceSeconds > 0) {
            highlights.push(`Compartiste ${Math.round(period.voiceSeconds / 3600)} horas en canales de voz.`);
        }

        return {
            year: Number(year),
            dataFrom: period.dataFrom,
            dataTo: period.dataTo,
            trackingStartedAt: period.trackingStartedAt,
            timezone: period.timezone,
            generatedAt: now().toISOString(),
            finalized: finalized === true,
            schemaVersion: WRAPPED_SCHEMA_VERSION,
            user: memberView(member),
            stats: {
                messages: period.messages,
                voiceSeconds: period.voiceSeconds,
                voiceMinutes: period.voiceMinutes,
                xpEarned: period.xpEarned,
                activeDays: period.activeDays,
                favoriteDay: period.favoriteDay,
                monthly: period.monthly,
                rank
            },
            highlights
        };
    }

    async function getOrGenerate({ guildId, userId, year, member, memberIds, currentYear }) {
        const finalized = Number(year) < Number(currentYear);
        if (finalized) {
            const existing = await store.getWrappedSnapshot(guildId, userId, year);
            if (isCurrentSnapshot(existing)) return existing;
        }
        const payload = await generate({
            guildId, userId, year, member, memberIds, finalized
        });
        if (finalized) {
            await store.saveWrappedSnapshot(guildId, userId, year, payload, payload);
        }
        return payload;
    }

    return { generate, getOrGenerate };
}

function createWrappedScheduler(options = {}) {
    const store = options.store || defaultStore;
    const wrapped = options.wrapped || createWrappedService({ store });
    const guildId = String(options.guildId || process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || '').trim();
    const intervalMs = Math.max(
        60_000,
        Number.parseInt(options.intervalMs || process.env.COMMUNITY_WRAPPED_INTERVAL_MS, 10)
            || DEFAULT_INTERVAL_MS
    );
    const batchSize = Math.max(
        1,
        Math.min(500, Number.parseInt(options.batchSize || process.env.COMMUNITY_WRAPPED_BATCH_SIZE, 10)
            || DEFAULT_BATCH_SIZE)
    );
    const logger = options.logger || console;
    let timer = null;
    let running = false;

    async function runOnce(client, at = new Date()) {
        if (running || !client || !guildId) return { skipped: true, reason: running ? 'locked' : 'unavailable' };
        running = true;
        try {
            const guild = client.guilds.cache.get(guildId)
                || await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) return { skipped: true, reason: 'guild_unavailable' };
            const metadata = await store.getTrackingMetadata(guildId);
            const years = getPastTrackingYears(metadata.trackingStartedAt, metadata.timezone, at, store.dateKey);
            if (!years.length) return { processed: 0, pending: 0 };

            const fetched = await guild.members.fetch();
            const members = Array.from(fetched.values()).filter((member) => !member.user?.bot);
            const memberIds = members.map((member) => String(member.user.id));
            const finalized = await store.listFinalizedWrappedKeys(guildId, years, WRAPPED_SCHEMA_VERSION);
            const tasks = selectMissingSnapshotTasks(memberIds, years, finalized, batchSize);
            const membersById = new Map(members.map((member) => [String(member.user.id), member]));
            const xpByYear = new Map();
            let processed = 0;

            for (const task of tasks) {
                try {
                    if (!xpByYear.has(task.year)) {
                        xpByYear.set(task.year, await store.getYearXpValues(guildId, task.year));
                    }
                    const payload = await wrapped.generate({
                        guildId,
                        userId: task.userId,
                        year: task.year,
                        member: membersById.get(task.userId),
                        memberIds,
                        finalized: true,
                        xpValues: xpByYear.get(task.year)
                    });
                    await store.saveWrappedSnapshot(guildId, task.userId, task.year, payload, payload);
                    processed += 1;
                } catch (error) {
                    logger.warn(
                        `[community-wrapped] Falló ${task.userId}/${task.year}:`,
                        error?.message || error
                    );
                }
            }
            return { processed, pending: tasks.length };
        } finally {
            running = false;
        }
    }

    function start(client) {
        if (timer || !client || !guildId) return;
        setImmediate(() => runOnce(client).catch((error) => {
            logger.warn('[community-wrapped] Falló cierre anual:', error?.message || error);
        }));
        timer = setInterval(() => {
            runOnce(client).catch((error) => {
                logger.warn('[community-wrapped] Falló cierre anual:', error?.message || error);
            });
        }, intervalMs);
        timer.unref?.();
    }

    function stop() {
        if (timer) clearInterval(timer);
        timer = null;
    }

    return { runOnce, start, stop, get running() { return running; } };
}

module.exports = {
    WRAPPED_SCHEMA_VERSION,
    compareUserIds,
    rankYearXp,
    getPastTrackingYears,
    snapshotKey,
    selectMissingSnapshotTasks,
    isCurrentSnapshot,
    createWrappedService,
    createWrappedScheduler
};
