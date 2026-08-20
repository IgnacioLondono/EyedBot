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
        buyerName: firstPresent(payload, map.buyerName) || overrides.buyerName || '',
        buyerDiscordId: String(
            firstPresent(payload, map.buyerDiscordId) || overrides.buyerDiscordId || ''
        ).replace(/\D/g, ''),
        date: firstPresent(payload, map.date) || overrides.date || new Date().toISOString(),
        extra: firstPresent(payload, map.extra) || overrides.extra || '',
        steam: firstPresent(payload, map.steam) || overrides.steam || '',
        email: firstPresent(payload, map.email) || overrides.email || '',
        server: firstPresent(payload, map.server) || overrides.server || '',
        rcon: firstPresent(payload, map.rcon) || overrides.rcon || '',
        gateway: firstPresent(payload, map.gateway) || overrides.gateway || '',
        authCode: firstPresent(payload, map.authCode) || overrides.authCode || '',
        paymentType: firstPresent(payload, map.paymentType) || overrides.paymentType || '',
        cardLast4: firstPresent(payload, map.cardLast4) || overrides.cardLast4 || ''
    };

    if (receipt.cardLast4 && !String(receipt.cardLast4).includes('*')) {
        receipt.cardLast4 = `**** ${String(receipt.cardLast4).replace(/\D/g, '').slice(-4)}`;
    }

    // Si rcon viene como array de replies del shop Rust
    if (!receipt.rcon && Array.isArray(payload?.rcon?.replies)) {
        receipt.rcon = payload.rcon.replies
            .map((row) => `${row.command || ''} → ${String(row.reply || '').replace(/\s+/g, ' ').slice(0, 180)}`)
            .join('\n')
            .slice(0, 900);
    } else if (!receipt.rcon && payload?.rcon && typeof payload.rcon === 'object') {
        if (payload.rcon.error) receipt.rcon = String(payload.rcon.error);
        else if (payload.rcon.ok === false) receipt.rcon = 'sin respuesta';
    }

    if (overrides && typeof overrides === 'object') {
        for (const [key, value] of Object.entries(overrides)) {
            if (value === undefined || value === null || value === '') continue;
            if (key in receipt) receipt[key] = String(value);
        }
    }

    if (receipt.buyerDiscordId && !/^\d{10,25}$/.test(receipt.buyerDiscordId)) {
        receipt.buyerDiscordId = '';
    }

    const amountNum = Number(String(receipt.amount).replace(/[^\d.-]/g, ''));
    receipt.amountFormatted = Number.isFinite(amountNum) && String(receipt.amount).trim() !== ''
        ? `$${amountNum.toLocaleString('es-CL')} ${receipt.currency || 'CLP'}`.trim()
        : (receipt.amount ? `${receipt.amount} ${receipt.currency || ''}`.trim() : '');

    return receipt;
}

function buildEmbed(cfg, receipt) {
    const values = {
        ...receipt,
        buyer: receipt.buyerName || '—',
        discordId: receipt.buyerDiscordId,
        amountDisplay: receipt.amountFormatted || receipt.amount || '—'
    };

    const embed = new EmbedBuilder()
        .setColor(colorToInt(cfg.color))
        .setTitle(applyTemplate(cfg.titleTemplate, values).slice(0, 256))
        .setTimestamp(new Date(receipt.date || Date.now()));

    const desc = applyTemplate(cfg.descriptionTemplate || '', values).trim();
    if (desc) embed.setDescription(desc.slice(0, 4000));

    if (cfg.footerTemplate) {
        embed.setFooter({ text: applyTemplate(cfg.footerTemplate, values).slice(0, 200) });
    }

    if (String(cfg.layout || 'fields') === 'fields') {
        const fields = [];
        const push = (name, value, inline = true) => {
            const v = String(value || '').trim();
            if (!v || v === '—') return;
            fields.push({ name: String(name).slice(0, 80), value: v.slice(0, 1024), inline });
        };

        // Mostrar campos clave aunque vengan vacíos (como el embed de referencia).
        const force = (name, value, inline = true) => {
            const v = String(value ?? '').trim() || '—';
            fields.push({ name: String(name).slice(0, 80), value: v.slice(0, 1024), inline });
        };
        force(cfg.labelSteam || 'Steam', receipt.steam ? `\`${receipt.steam}\`` : '—', true);
        force(cfg.labelName || 'Nombre', receipt.buyerName || '—', true);
        force(cfg.labelEmail || 'Correo', receipt.email || '—', false);
        force(cfg.labelOrder || 'Orden', receipt.orderId ? `\`${receipt.orderId}\`` : '—', false);
        force(cfg.labelAmount || 'Monto', receipt.amountFormatted || receipt.amount || '—', true);
        force(cfg.labelServer || 'Servidor', receipt.server || '—', true);
        if (receipt.gateway) push(cfg.labelGateway || 'Pasarela', receipt.gateway, true);
        if (receipt.authCode) push(cfg.labelAuth || 'Autorización', `\`${receipt.authCode}\``, true);
        if (receipt.paymentType) push(cfg.labelPaymentType || 'Tipo de pago', receipt.paymentType, true);
        if (receipt.cardLast4) push(cfg.labelCard || 'Tarjeta', receipt.cardLast4, true);
        if (receipt.rcon) {
            push(cfg.labelRcon || 'Detalle técnico', '```\n' + String(receipt.rcon).slice(0, 900) + '\n```', false);
        }
        if (receipt.extra) push('Detalle', receipt.extra, false);
        if (receipt.buyerDiscordId) {
            push(cfg.labelDiscord || 'Discord', `<@${receipt.buyerDiscordId}>`, true);
        }
        if (fields.length) embed.addFields(fields);
    } else {
        if (receipt.extra && receipt.extra !== '—') {
            embed.addFields({ name: 'Detalle', value: String(receipt.extra).slice(0, 1000) });
        }
        if (receipt.buyerDiscordId) {
            embed.addFields({ name: 'Discord', value: `<@${receipt.buyerDiscordId}>`, inline: true });
        }
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
