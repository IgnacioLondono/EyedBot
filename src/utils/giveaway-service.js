const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const config = require('../config');
const eventsStore = require('./events-giveaways-store');
const { applyGuildEmbedText } = require('./embed-text-template');

const JOIN_PREFIX = 'giveaway_join_';
const CHECK_MS = 30_000;
let intervalRef = null;

function parseDurationMinutes(raw) {
    const value = Number.parseInt(String(raw ?? ''), 10);
    if (!Number.isFinite(value) || value < 1) return null;
    return Math.min(value, 60 * 24 * 14);
}

function formatRemaining(ms) {
    if (ms <= 0) return 'Finalizado';
    const totalMin = Math.ceil(ms / 60000);
    if (totalMin < 60) return `${totalMin} min`;
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    if (hours < 48) return mins ? `${hours} h ${mins} min` : `${hours} h`;
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours ? `${days} d ${remHours} h` : `${days} d`;
}

function pickWinners(entries, count) {
    const pool = [...new Set(entries)];
    if (!pool.length) return [];
    const winners = [];
    const limit = Math.min(count, pool.length);
    while (winners.length < limit) {
        const index = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(index, 1)[0]);
    }
    return winners;
}

function buildGiveawayEmbed(giveaway, guild = null) {
    const endsAtMs = Date.parse(giveaway.endsAt || '');
    const remaining = Number.isFinite(endsAtMs) ? endsAtMs - Date.now() : 0;
    const ended = giveaway.status !== 'active' || remaining <= 0;
    const entries = Array.isArray(giveaway.entries) ? giveaway.entries.length : 0;
    const color = String(giveaway.color || config.embedColor).replace('#', '');

    const lines = [
        giveaway.description ? applyGuildEmbedText(giveaway.description, { guild }) : null,
        '',
        `🎁 **Premio:** ${giveaway.prize || '—'}`,
        `🏆 **Ganadores:** ${giveaway.winnersCount}`,
        `👥 **Participantes:** ${entries}`,
        ended
            ? (giveaway.winners?.length
                ? `✅ **Ganadores:** ${giveaway.winners.map((id) => `<@${id}>`).join(', ')}`
                : '❌ **Sin participantes**')
            : `⏳ **Termina:** <t:${Math.floor(endsAtMs / 1000)}:R> (<t:${Math.floor(endsAtMs / 1000)}:f>)`
    ].filter((line) => line !== null);

    return new EmbedBuilder()
        .setColor(color || config.embedColor)
        .setTitle(`🎉 ${applyGuildEmbedText(giveaway.title || 'Sorteo', { guild })}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'EyedBot · Sorteos' });
}

function buildGiveawayComponents(giveaway) {
    const active = giveaway.status === 'active' && Date.parse(giveaway.endsAt || '') > Date.now();
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${JOIN_PREFIX}${giveaway.id}`)
            .setLabel(active ? 'Participar' : 'Sorteo cerrado')
            .setStyle(active ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('🎉')
            .setDisabled(!active)
    );
    return [row];
}

function buildEventEmbed(event, guild = null, { reminder = false } = {}) {
    const startMs = Date.parse(event.startAt || '');
    const color = String(event.color || config.embedColor).replace('#', '');
    const lines = [
        event.description ? applyGuildEmbedText(event.description, { guild }) : null,
        event.location ? `📍 **Lugar:** ${event.location}` : null,
        Number.isFinite(startMs) ? `🗓️ **Inicio:** <t:${Math.floor(startMs / 1000)}:F> (<t:${Math.floor(startMs / 1000)}:R>)` : null
    ].filter(Boolean);

    return new EmbedBuilder()
        .setColor(color || config.embedColor)
        .setTitle(`${reminder ? '⏰ Recordatorio · ' : '📅 '}${applyGuildEmbedText(event.title || 'Evento', { guild })}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'EyedBot · Eventos' });
}

async function refreshGiveawayMessage(client, giveaway) {
    if (!client || !giveaway?.channelId || !giveaway?.messageId) return null;
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return null;
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (!message) return null;
    const guild = channel.guild || null;
    await message.edit({
        embeds: [buildGiveawayEmbed(giveaway, guild)],
        components: buildGiveawayComponents(giveaway)
    }).catch(() => null);
    return message;
}

async function createGiveaway(client, guild, options = {}) {
    const minutes = parseDurationMinutes(options.durationMinutes);
    if (!minutes) throw new Error('Duración inválida');

    const channelId = String(options.channelId || '').trim();
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) throw new Error('Canal no encontrado o no es de texto');

    const endsAt = new Date(Date.now() + minutes * 60_000).toISOString();
    const giveaway = await eventsStore.saveGiveaway(guild.id, {
        id: options.id,
        guildId: guild.id,
        channelId: channel.id,
        title: options.title || 'Sorteo',
        prize: options.prize || 'Premio sorpresa',
        description: options.description || '',
        winnersCount: options.winnersCount || 1,
        hostId: options.hostId || '',
        requiredRoleId: options.requiredRoleId || '',
        color: options.color || '',
        endsAt,
        status: 'active',
        entries: [],
        winners: [],
        color: options.color || null,
        createdAt: new Date().toISOString()
    });

    const embed = buildGiveawayEmbed(giveaway, guild);
    const components = buildGiveawayComponents(giveaway);
    const posted = await channel.send({ embeds: [embed], components });
    giveaway.messageId = posted.id;
    await eventsStore.saveGiveaway(guild.id, giveaway);
    return giveaway;
}

async function enterGiveaway(guild, userId, giveawayId) {
    const giveaway = await eventsStore.getGiveaway(guild.id, giveawayId);
    if (!giveaway || giveaway.status !== 'active') return { ok: false, reason: 'Este sorteo ya no está activo.' };
    if (Date.parse(giveaway.endsAt || '') <= Date.now()) return { ok: false, reason: 'Este sorteo ya terminó.' };

    if (giveaway.requiredRoleId) {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member?.roles?.cache?.has(giveaway.requiredRoleId)) {
            return { ok: false, reason: 'Necesitas un rol específico para participar.' };
        }
    }

    if (giveaway.entries.includes(userId)) {
        return { ok: false, reason: 'Ya estás participando en este sorteo.' };
    }

    giveaway.entries.push(userId);
    await eventsStore.saveGiveaway(guild.id, giveaway);
    return { ok: true, giveaway, total: giveaway.entries.length };
}

async function endGiveaway(client, guildId, giveawayId, { reroll = false, hostId = '' } = {}) {
    const giveaway = await eventsStore.getGiveaway(guildId, giveawayId);
    if (!giveaway) throw new Error('Sorteo no encontrado');
    if (giveaway.status === 'cancelled') throw new Error('Sorteo cancelado');

    const guild = client?.guilds?.cache?.get(guildId) || await client?.guilds?.fetch(guildId).catch(() => null);

    if (reroll) {
        if (!giveaway.entries.length) throw new Error('No hay participantes para reroll');
        giveaway.winners = pickWinners(giveaway.entries, giveaway.winnersCount);
        giveaway.endedAt = new Date().toISOString();
        await eventsStore.saveGiveaway(guildId, giveaway);
        await refreshGiveawayMessage(client, giveaway);
        if (guild && giveaway.channelId) {
            const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
            if (channel?.isTextBased?.()) {
                await channel.send({
                    content: `🔁 **Reroll:** ${giveaway.winners.map((id) => `<@${id}>`).join(', ')}`,
                    allowedMentions: { users: giveaway.winners }
                }).catch(() => null);
            }
        }
        return giveaway;
    }

    if (giveaway.status === 'ended') throw new Error('El sorteo ya finalizó');

    giveaway.status = 'ended';
    giveaway.endedAt = new Date().toISOString();
    giveaway.winners = pickWinners(giveaway.entries, giveaway.winnersCount);
    await eventsStore.saveGiveaway(guildId, giveaway);
    await refreshGiveawayMessage(client, giveaway);

    if (guild && giveaway.channelId) {
        const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
        if (channel?.isTextBased?.()) {
            const winnerMention = giveaway.winners.length
                ? giveaway.winners.map((id) => `<@${id}>`).join(', ')
                : 'Nadie participó';
            await channel.send({
                content: `🎉 **Sorteo finalizado:** ${giveaway.title}\n🏆 Ganador(es): ${winnerMention}`,
                allowedMentions: { users: giveaway.winners }
            }).catch(() => null);
        }
    }

    return giveaway;
}

async function publishServerEvent(client, guild, eventRow) {
    const channelId = String(eventRow.channelId || '').trim();
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) throw new Error('Canal no encontrado');

    const embed = buildEventEmbed(eventRow, guild);
    const posted = await channel.send({ embeds: [embed] });
    eventRow.messageId = posted.id;
    eventRow.status = 'published';
    await eventsStore.saveServerEvent(guild.id, eventRow);
    return eventRow;
}

async function runGiveawaySweep(client) {
    if (!client) return;
    const store = require('./events-giveaways-store');
    const fileStore = require('fs');
    const path = require('path');
    const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'events-giveaways.json');
    let guildIds = [];
    try {
        const raw = JSON.parse(fileStore.readFileSync(STORE_PATH, 'utf8') || '{}');
        guildIds = Object.keys(raw.guilds || {});
    } catch {
        guildIds = [];
    }

    for (const guildId of guildIds) {
        const active = await store.listGiveaways(guildId, 'active');
        for (const giveaway of active) {
            const endsAtMs = Date.parse(giveaway.endsAt || '');
            if (!Number.isFinite(endsAtMs) || endsAtMs > Date.now()) continue;
            try {
                await endGiveaway(client, guildId, giveaway.id);
            } catch (error) {
                console.warn(`⚠️ No se pudo cerrar sorteo ${giveaway.id}:`, error?.message || error);
            }
        }
    }
}

async function runEventReminderSweep(client) {
    if (!client) return;
    const events = await eventsStore.listScheduledEventsForReminders();
    const now = Date.now();

    for (const eventRow of events) {
        const cfg = await eventsStore.getConfig(eventRow.guildId);
        const leadMs = (cfg.reminderMinutesBefore || 60) * 60_000;
        const startMs = Date.parse(eventRow.startAt || '');
        if (!Number.isFinite(startMs)) continue;
        if (startMs - leadMs > now) continue;
        if (startMs <= now) {
            eventRow.status = 'completed';
            eventRow.reminderSent = true;
            await eventsStore.saveServerEvent(eventRow.guildId, eventRow);
            continue;
        }

        const guild = client.guilds.cache.get(eventRow.guildId) || await client.guilds.fetch(eventRow.guildId).catch(() => null);
        if (!guild) continue;
        const channelId = eventRow.channelId || cfg.defaultChannelId;
        const channel = channelId
            ? guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null)
            : null;
        if (!channel?.isTextBased?.()) continue;

        await channel.send({ embeds: [buildEventEmbed(eventRow, guild, { reminder: true })] }).catch(() => null);
        eventRow.reminderSent = true;
        await eventsStore.saveServerEvent(eventRow.guildId, eventRow);
    }
}

function startEventsGiveawaysScheduler(client) {
    if (intervalRef) return;
    intervalRef = setInterval(() => {
        void runGiveawaySweep(client);
        void runEventReminderSweep(client);
    }, CHECK_MS);
}

function stopEventsGiveawaysScheduler() {
    if (!intervalRef) return;
    clearInterval(intervalRef);
    intervalRef = null;
}

async function handleGiveawayButton(interaction) {
    if (!interaction.isButton()) return false;
    if (!interaction.customId.startsWith(JOIN_PREFIX)) return false;

    const giveawayId = interaction.customId.slice(JOIN_PREFIX.length);
    const result = await enterGiveaway(interaction.guild, interaction.user.id, giveawayId);
    if (!result.ok) {
        const { safeReply } = require('./interactions');
        await safeReply(interaction, { content: result.reason, flags: 64 });
        return true;
    }

    await refreshGiveawayMessage(interaction.client, result.giveaway);
    const { safeReply } = require('./interactions');
    await safeReply(interaction, {
        content: `✅ Entraste al sorteo. Participantes: **${result.total}**`,
        flags: 64
    });
    return true;
}

module.exports = {
    JOIN_PREFIX,
    parseDurationMinutes,
    formatRemaining,
    buildGiveawayEmbed,
    buildGiveawayComponents,
    buildEventEmbed,
    createGiveaway,
    enterGiveaway,
    endGiveaway,
    publishServerEvent,
    refreshGiveawayMessage,
    startEventsGiveawaysScheduler,
    stopEventsGiveawaysScheduler,
    handleGiveawayButton
};
