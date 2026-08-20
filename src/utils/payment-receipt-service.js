const crypto = require('crypto');
const { EmbedBuilder } = require('discord.js');
const paymentReceiptStore = require('./payment-receipt-store');

function dig(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = String(path || '')
        .split('.')
        .map((p) => p.trim())
        .filter(Boolean);
    let cur = obj;
    for (const part of parts) {
        if (cur == null) return undefined;
        if (Array.isArray(cur) && /^\d+$/.test(part)) {
            cur = cur[Number(part)];
            continue;
        }
        if (typeof cur !== 'object' || !(part in cur)) return undefined;
        cur = cur[part];
    }
    return cur;
}

function firstPresent(payload, candidates) {
    const list = String(candidates || '')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean);
    for (const key of list) {
        const value = dig(payload, key);
        if (value === undefined || value === null) continue;
        const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
        if (text.trim() !== '') return text.trim();
    }
    return '';
}

function applyTemplate(template, values) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
        const value = values[key];
        return value === undefined || value === null || value === '' ? '—' : String(value);
    });
}

function colorToInt(hex) {
    const raw = String(hex || '22c55e').replace('#', '');
    const n = Number.parseInt(raw, 16);
    return Number.isFinite(n) ? n : 0x22c55e;
}

/**
 * Adapta payloads distintos (API del hermano, formularios, etc.) a un recibo normalizado.
 */
function normalizeReceipt(rawPayload, fieldMap, overrides = {}) {
    const payload =
        rawPayload && typeof rawPayload === 'object'
            ? rawPayload.data && typeof rawPayload.data === 'object'
                ? { ...rawPayload, ...rawPayload.data }
                : rawPayload
            : {};

    const map = { ...paymentReceiptStore.defaultFieldMap(), ...(fieldMap || {}) };
    const receipt = {
        orderId: firstPresent(payload, map.orderId) || overrides.orderId || '',
        amount: firstPresent(payload, map.amount) || overrides.amount || '',
        currency: firstPresent(payload, map.currency) || overrides.currency || 'CLP',
        product: firstPresent(payload, map.product) || overrides.product || 'Compra',
        status: firstPresent(payload, map.status) || overrides.status || 'pagado',
        buyerName: firstPresent(payload, map.buyerName) || overrides.buyerName || 'Cliente',
        buyerDiscordId: String(
            firstPresent(payload, map.buyerDiscordId) || overrides.buyerDiscordId || ''
        ).replace(/\D/g, ''),
        date: firstPresent(payload, map.date) || overrides.date || new Date().toISOString(),
        extra: firstPresent(payload, map.extra) || overrides.extra || ''
    };

    if (overrides && typeof overrides === 'object') {
        for (const [key, value] of Object.entries(overrides)) {
            if (value === undefined || value === null || value === '') continue;
            if (key in receipt) receipt[key] = String(value);
        }
    }

    if (receipt.buyerDiscordId && !/^\d{10,25}$/.test(receipt.buyerDiscordId)) {
        receipt.buyerDiscordId = '';
    }

    return receipt;
}

function buildEmbed(cfg, receipt) {
    const values = {
        ...receipt,
        buyer: receipt.buyerName,
        discordId: receipt.buyerDiscordId
    };

    const embed = new EmbedBuilder()
        .setColor(colorToInt(cfg.color))
        .setTitle(applyTemplate(cfg.titleTemplate, values).slice(0, 256))
        .setDescription(applyTemplate(cfg.descriptionTemplate, values).slice(0, 4000))
        .setTimestamp(new Date(receipt.date || Date.now()));

    if (cfg.footerTemplate) {
        embed.setFooter({ text: applyTemplate(cfg.footerTemplate, values).slice(0, 200) });
    }

    if (receipt.extra && receipt.extra !== '—') {
        embed.addFields({ name: 'Detalle', value: String(receipt.extra).slice(0, 1000) });
    }

    if (receipt.buyerDiscordId) {
        embed.addFields({ name: 'Discord', value: `<@${receipt.buyerDiscordId}>`, inline: true });
    }

    return embed;
}

async function sendPaymentNotification(client, guildId, rawPayload, options = {}) {
    if (!client) return { ok: false, reason: 'bot_unavailable' };

    const cfg = await paymentReceiptStore.getConfig(guildId);
    if (!cfg.enabled && options.force !== true) {
        return { ok: false, reason: 'disabled' };
    }

    const receipt = normalizeReceipt(rawPayload, cfg.fieldMap, options.overrides || {});
    if (!receipt.orderId && !receipt.amount && !receipt.product) {
        return { ok: false, reason: 'empty_receipt' };
    }

    const guild = client.guilds.cache.get(String(guildId))
        || await client.guilds.fetch(String(guildId)).catch(() => null);
    if (!guild) return { ok: false, reason: 'guild_unavailable' };

    const embed = buildEmbed(cfg, receipt);
    let channelSent = false;
    let dmSent = false;
    const errors = [];

    const wantChannel = options.sendToChannel !== undefined
        ? options.sendToChannel === true
        : cfg.sendToChannel === true;
    const wantDm = options.sendDm !== undefined
        ? options.sendDm === true
        : cfg.sendDm === true;

    if (wantChannel) {
        const channelId = String(options.channelId || cfg.channelId || '').trim();
        if (!channelId) {
            errors.push('no_channel');
        } else {
            const channel = guild.channels.cache.get(channelId)
                || await guild.channels.fetch(channelId).catch(() => null);
            if (!channel || !channel.isTextBased?.()) {
                errors.push('channel_invalid');
            } else {
                const mention = cfg.mentionRoleId ? `<@&${cfg.mentionRoleId}>` : undefined;
                await channel.send({
                    content: mention,
                    embeds: [embed],
                    allowedMentions: cfg.mentionRoleId
                        ? { roles: [cfg.mentionRoleId] }
                        : { parse: [] }
                });
                channelSent = true;
            }
        }
    }

    if (wantDm && receipt.buyerDiscordId) {
        const user = await client.users.fetch(receipt.buyerDiscordId).catch(() => null);
        if (!user) {
            errors.push('dm_user_not_found');
        } else {
            const dmOk = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);
            if (dmOk) dmSent = true;
            else errors.push('dm_closed');
        }
    } else if (wantDm && !receipt.buyerDiscordId) {
        errors.push('dm_missing_discord_id');
    }

    const historyEntry = {
        id: crypto.randomBytes(6).toString('hex'),
        at: new Date().toISOString(),
        orderId: receipt.orderId,
        amount: receipt.amount,
        product: receipt.product,
        status: receipt.status,
        buyerDiscordId: receipt.buyerDiscordId,
        channelSent,
        dmSent,
        source: String(options.source || 'manual').slice(0, 40)
    };
    await paymentReceiptStore.pushHistory(guildId, historyEntry).catch(() => null);

    if (!channelSent && !dmSent) {
        return { ok: false, reason: errors[0] || 'send_failed', errors, receipt };
    }

    return {
        ok: true,
        channelSent,
        dmSent,
        errors,
        receipt,
        historyEntry
    };
}

function verifyWebhookSecret(cfg, req) {
    const expected = String(cfg?.webhookSecret || '').trim();
    if (!expected) return false;
    const headerSecret = String(
        req.headers['x-eyedbot-payment-secret']
        || req.headers['x-payment-secret']
        || ''
    ).trim();
    const auth = String(req.headers.authorization || '').trim();
    const bearer = auth.toLowerCase().startsWith('bearer ')
        ? auth.slice(7).trim()
        : '';
    const provided = headerSecret || bearer || String(req.query?.secret || '').trim();
    if (!provided || provided.length !== expected.length) return false;
    try {
        return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
        return false;
    }
}

module.exports = {
    dig,
    firstPresent,
    applyTemplate,
    normalizeReceipt,
    buildEmbed,
    sendPaymentNotification,
    verifyWebhookSecret
};
