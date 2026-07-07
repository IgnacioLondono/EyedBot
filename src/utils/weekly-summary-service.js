const { EmbedBuilder } = require('discord.js');
const store = require('./weekly-summary-store');
const levelingStore = require('./leveling-store');
const guildActivityStore = require('./guild-activity-store');
const config = require('../config');

const SWEEP_MS = Math.max(60_000, Number.parseInt(process.env.WEEKLY_SUMMARY_CHECK_MS || '300000', 10));
const WEEKDAY_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const WEEKDAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

let intervalRef = null;
let running = false;

function utcDateKey(date) {
    return new Date(date).toISOString().slice(0, 10);
}

/** Partes de fecha (día de la semana, hora, minuto, fecha local) en una zona horaria. */
function getLocalParts(date, timeZone) {
    try {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone,
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = fmt.formatToParts(date).reduce((acc, p) => {
            acc[p.type] = p.value;
            return acc;
        }, {});
        return {
            dayOfWeek: WEEKDAY_MAP[parts.weekday] ?? new Date(date).getUTCDay(),
            hour: Number.parseInt(parts.hour, 10) % 24,
            minute: Number.parseInt(parts.minute, 10),
            dateKey: `${parts.year}-${parts.month}-${parts.day}`
        };
    } catch {
        const d = new Date(date);
        return {
            dayOfWeek: d.getUTCDay(),
            hour: d.getUTCHours(),
            minute: d.getUTCMinutes(),
            dateKey: utcDateKey(d)
        };
    }
}

function emptyMetrics() {
    return { joins: 0, leaves: 0, messages: 0, voiceMinutes: 0 };
}

/** Suma métricas diarias en un rango [startOffset, startOffset+days) días atrás. */
function sumRange(daily, startOffset, days) {
    const now = Date.now();
    const agg = emptyMetrics();
    const perDay = [];

    for (let i = startOffset; i < startOffset + days; i += 1) {
        const date = new Date(now - i * 86_400_000);
        const key = utcDateKey(date);
        const entry = daily[key] || {};
        const day = {
            key,
            dayOfWeek: date.getUTCDay(),
            joins: Number.parseInt(entry.joins || 0, 10) || 0,
            leaves: Number.parseInt(entry.leaves || 0, 10) || 0,
            messages: Number.parseInt(entry.messages || 0, 10) || 0,
            voiceMinutes: Number.parseInt(entry.voiceMinutes || 0, 10) || 0
        };
        agg.joins += day.joins;
        agg.leaves += day.leaves;
        agg.messages += day.messages;
        agg.voiceMinutes += day.voiceMinutes;
        perDay.push(day);
    }

    return { agg, perDay };
}

function pct(current, previous) {
    if (!previous) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 100);
}

function trendArrow(percent) {
    if (percent > 0) return '↑';
    if (percent < 0) return '↓';
    return '→';
}

function formatPct(percent) {
    const sign = percent > 0 ? '+' : '';
    return `${sign}${percent}% ${trendArrow(percent)}`;
}

function snapshotUsers(levelingUsers) {
    const users = {};
    for (const row of levelingUsers) {
        if (!row?.userId) continue;
        users[row.userId] = {
            xp: Number.parseInt(row.xp || 0, 10) || 0,
            messageCount: Number.parseInt(row.messageCount || 0, 10) || 0,
            voiceMinutes: Number.parseInt(row.voiceMinutes || 0, 10) || 0
        };
    }
    return users;
}

function computeWeeklyTop(levelingUsers, snapshot) {
    if (!snapshot || !snapshot.users) {
        return { available: false, list: [], voiceKing: null, chatter: null };
    }

    const base = snapshot.users;
    const deltas = levelingUsers.map((row) => {
        const prev = base[row.userId] || { xp: 0, messageCount: 0, voiceMinutes: 0 };
        return {
            userId: row.userId,
            xp: Math.max(0, (Number.parseInt(row.xp || 0, 10) || 0) - (prev.xp || 0)),
            messages: Math.max(0, (Number.parseInt(row.messageCount || 0, 10) || 0) - (prev.messageCount || 0)),
            voiceMinutes: Math.max(0, (Number.parseInt(row.voiceMinutes || 0, 10) || 0) - (prev.voiceMinutes || 0))
        };
    });

    const list = deltas
        .filter((d) => d.xp > 0)
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 3);

    const voiceKing = deltas
        .filter((d) => d.voiceMinutes > 0)
        .sort((a, b) => b.voiceMinutes - a.voiceMinutes)[0] || null;

    const chatter = deltas
        .filter((d) => d.messages > 0)
        .sort((a, b) => b.messages - a.messages)[0] || null;

    return { available: true, list, voiceKing, chatter };
}

async function buildReportData(client, guildId) {
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return null;

    const [cfg, snapshot, activity, levelingUsers] = await Promise.all([
        store.getConfig(guildId),
        store.getSnapshot(guildId),
        guildActivityStore.getGuildActivity(guildId).catch(() => null),
        levelingStore.listGuildUsersMerged(guildId).catch(() => [])
    ]);

    const daily = activity?.daily || {};
    const thisWeek = sumRange(daily, 0, 7);
    const lastWeek = sumRange(daily, 7, 7);

    let mostActiveDay = null;
    for (const day of thisWeek.perDay) {
        if (!mostActiveDay || day.messages > mostActiveDay.messages) mostActiveDay = day;
    }

    let newestMember = null;
    try {
        newestMember = guild.members.cache
            .filter((m) => !m.user?.bot && m.joinedTimestamp)
            .sort((a, b) => b.joinedTimestamp - a.joinedTimestamp)
            .first() || null;
    } catch {
        newestMember = null;
    }

    const top = computeWeeklyTop(levelingUsers, snapshot);

    let counting = null;
    try {
        const countingStore = require('./counting-store');
        const cc = await countingStore.getGuildConfig(guildId);
        if (cc?.enabled) counting = { enabled: true, current: cc.current || 0 };
    } catch {
        counting = null;
    }

    return {
        guild,
        config: cfg,
        community: {
            joins: thisWeek.agg.joins,
            leaves: thisWeek.agg.leaves,
            net: thisWeek.agg.joins - thisWeek.agg.leaves,
            totalMembers: guild.memberCount,
            boosts: guild.premiumSubscriptionCount || 0,
            newestMember
        },
        activity: {
            messages: thisWeek.agg.messages,
            voiceMinutes: thisWeek.agg.voiceMinutes,
            voiceHours: Math.round(thisWeek.agg.voiceMinutes / 60),
            mostActiveDay: mostActiveDay && mostActiveDay.messages > 0
                ? WEEKDAY_ES[mostActiveDay.dayOfWeek]
                : null
        },
        top,
        compare: cfg.compare
            ? {
                messages: pct(thisWeek.agg.messages, lastWeek.agg.messages),
                voiceMinutes: pct(thisWeek.agg.voiceMinutes, lastWeek.agg.voiceMinutes),
                joins: pct(thisWeek.agg.joins, lastWeek.agg.joins)
            }
            : null,
        counting
    };
}

function formatDateRangeLabel() {
    const end = new Date();
    const start = new Date(Date.now() - 6 * 86_400_000);
    const fmt = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    return `Semana del ${fmt(start)} — ${fmt(end)}`;
}

function buildReportEmbed(data) {
    const { guild, community, activity, top, compare, counting } = data;

    const communityLines = [
        `📈 Nuevos miembros  **+${community.joins}**`,
        `📉 Salidas  **-${community.leaves}**`,
        `🟰 Crecimiento neto  **${community.net >= 0 ? '+' : ''}${community.net}**`,
        `🎯 Total actual  **${community.totalMembers.toLocaleString('es-ES')}**`
    ];
    if (community.boosts > 0) communityLines.push(`🚀 Boosts  **${community.boosts}**`);

    const activityLines = [
        `✉️ Mensajes  **${activity.messages.toLocaleString('es-ES')}**${compare ? `  (${formatPct(compare.messages)})` : ''}`,
        `🎙️ Tiempo en voz  **${activity.voiceHours} h**${compare ? `  (${formatPct(compare.voiceMinutes)})` : ''}`
    ];
    if (activity.mostActiveDay) activityLines.push(`📅 Día más activo  **${activity.mostActiveDay}**`);

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`📊 Resumen semanal · ${guild.name}`)
        .setDescription(`*${formatDateRangeLabel()}*`)
        .addFields(
            { name: '👥 Comunidad', value: communityLines.join('\n'), inline: false },
            { name: '💬 Actividad', value: activityLines.join('\n'), inline: false }
        )
        .setFooter({ text: 'EyedBot • Resumen semanal' })
        .setTimestamp(new Date());

    if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));

    if (top.available) {
        const medals = ['🥇', '🥈', '🥉'];
        const topLines = top.list.length
            ? top.list.map((u, i) => `${medals[i] || '🏅'} <@${u.userId}>  ·  **${u.xp.toLocaleString('es-ES')} XP**`).join('\n')
            : '_Sin actividad registrada esta semana._';
        embed.addFields({ name: '🏆 Top de la semana', value: topLines, inline: false });

        const extras = [];
        if (top.voiceKing) {
            const h = Math.round(top.voiceKing.voiceMinutes / 60);
            extras.push(`🎙️ Rey de la voz  <@${top.voiceKing.userId}> (${h} h)`);
        }
        if (top.chatter) {
            extras.push(`✍️ Más charlatán  <@${top.chatter.userId}> (${top.chatter.messages.toLocaleString('es-ES')} msgs)`);
        }
        if (extras.length) embed.addFields({ name: '⭐ Destacados', value: extras.join('\n'), inline: false });
    } else {
        embed.addFields({
            name: '🏆 Top de la semana',
            value: '_El ranking semanal estará disponible a partir de la próxima semana (recopilando datos)._',
            inline: false
        });
    }

    const extrasBottom = [];
    if (community.newestMember) extrasBottom.push(`🎉 Miembro más reciente  <@${community.newestMember.id}>`);
    if (counting?.enabled) extrasBottom.push(`🔢 Contador actual  **${counting.current.toLocaleString('es-ES')}**`);
    if (extrasBottom.length) embed.addFields({ name: '🔎 Extras', value: extrasBottom.join('\n'), inline: false });

    return embed;
}

async function previewWeeklySummary(client, guildId) {
    const data = await buildReportData(client, guildId);
    if (!data) return null;
    return buildReportEmbed(data);
}

/**
 * Publica el resumen en el canal configurado.
 * @param {boolean} rotate Si true, guarda un nuevo snapshot como base de la próxima semana.
 */
async function sendWeeklySummary(client, guildId, { rotate = false, targetChannelId = null } = {}) {
    const data = await buildReportData(client, guildId);
    if (!data) return { ok: false, reason: 'guild_unavailable' };

    const cfg = data.config;
    const channelId = targetChannelId || cfg.channelId;
    if (!channelId) return { ok: false, reason: 'no_channel' };

    const channel = data.guild.channels.cache.get(channelId)
        || await data.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased?.()) return { ok: false, reason: 'channel_invalid' };

    const embed = buildReportEmbed(data);
    const content = cfg.mentionRoleId ? `<@&${cfg.mentionRoleId}>` : undefined;

    await channel.send({
        content,
        embeds: [embed],
        allowedMentions: cfg.mentionRoleId ? { roles: [cfg.mentionRoleId] } : { parse: [] }
    });

    if (rotate) {
        try {
            const levelingUsers = await levelingStore.listGuildUsersMerged(guildId).catch(() => []);
            await store.setSnapshot(guildId, {
                takenAt: new Date().toISOString(),
                users: snapshotUsers(levelingUsers)
            });
        } catch {
            // no bloquear el envío por un fallo de snapshot
        }
    }

    return { ok: true };
}

async function runWeeklySummarySweep(client) {
    if (running) return;
    running = true;

    try {
        for (const guild of client.guilds.cache.values()) {
            const cfg = await store.getConfig(guild.id).catch(() => null);
            if (!cfg || cfg.enabled !== true || !cfg.channelId) continue;

            const local = getLocalParts(new Date(), cfg.timezone);
            if (local.dayOfWeek !== cfg.dayOfWeek) continue;
            if (local.hour !== cfg.hour) continue;
            if (cfg.lastPostedDate === local.dateKey) continue;

            const result = await sendWeeklySummary(client, guild.id, { rotate: true }).catch(() => ({ ok: false }));
            if (result.ok) {
                await store.markPosted(guild.id, local.dateKey).catch(() => null);
                console.log(`📊 Resumen semanal publicado en ${guild.name}`);
            }
        }
    } catch (error) {
        console.error('Error en weekly summary sweep:', error?.message || error);
    } finally {
        running = false;
    }
}

function startWeeklySummaryScheduler(client) {
    if (!client || intervalRef) return;
    intervalRef = setInterval(() => {
        runWeeklySummarySweep(client).catch(() => null);
    }, SWEEP_MS);
    runWeeklySummarySweep(client).catch(() => null);
    console.log(`📊 Resumen semanal scheduler activo (revisión cada ${Math.round(SWEEP_MS / 1000)}s)`);
}

function stopWeeklySummaryScheduler() {
    if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
    }
}

module.exports = {
    buildReportData,
    buildReportEmbed,
    previewWeeklySummary,
    sendWeeklySummary,
    runWeeklySummarySweep,
    startWeeklySummaryScheduler,
    stopWeeklySummaryScheduler
};
