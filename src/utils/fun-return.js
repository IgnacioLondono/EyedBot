const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../config');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const MENTIONS_FILE = path.join(DATA_DIR, 'fun-mentions.json');

let mentionsCache = null;
let writeQueue = Promise.resolve();

const ACTIONS = {
    hug: { title: '🤗 Abrazo', verb: 'abrazó', tenorQuery: 'anime hug' },
    kiss: { title: '💋 Beso', verb: 'besó', tenorQuery: 'anime kiss' },
    pat: { title: '👋 Caricia', verb: 'acarició', tenorQuery: 'anime pat' },
    slap: { title: '👋 Golpe', verb: 'golpeó', tenorQuery: 'anime slap' },
    punch: { title: '👊 Puñetazo', verb: 'golpeó', tenorQuery: 'anime punch' }
};

function getActionMeta(action) {
    return ACTIONS[action] || null;
}

function mentionKeys(action, guildId, userId) {
    const scope = guildId || 'global';
    return {
        total: `fun:mentions:total:${scope}:${userId}`,
        action: `fun:mentions:${action}:${scope}:${userId}`
    };
}

async function ensureMentionsStoreLoaded() {
    if (mentionsCache) return mentionsCache;

    try {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
    } catch {
        // ignore
    }

    try {
        const raw = await fs.promises.readFile(MENTIONS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        mentionsCache = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        mentionsCache = {};
    }

    return mentionsCache;
}

async function persistMentionsStore() {
    const snapshot = JSON.stringify(mentionsCache || {}, null, 2);

    // Serialize writes to avoid corrupted file on burst interactions.
    writeQueue = writeQueue.then(async () => {
        await fs.promises.mkdir(DATA_DIR, { recursive: true });
        await fs.promises.writeFile(MENTIONS_FILE, snapshot, 'utf8');
    }).catch(() => {});

    return writeQueue;
}

async function incrementMentionCount(action, guildId, userId) {
    await ensureMentionsStoreLoaded();
    const keys = mentionKeys(action, guildId, userId);

    const totalRaw = mentionsCache[keys.total] || 0;
    const actionRaw = mentionsCache[keys.action] || 0;

    const total = Number.parseInt(totalRaw, 10) + 1;
    const actionCount = Number.parseInt(actionRaw, 10) + 1;

    mentionsCache[keys.total] = total;
    mentionsCache[keys.action] = actionCount;
    await persistMentionsStore();

    return { total, actionCount };
}

async function fetchFromWaifuPics(action) {
    const response = await axios.get(`https://api.waifu.pics/sfw/${action}`, { timeout: 8000 });
    return response?.data?.url || null;
}

async function fetchFromNekosBest(action) {
    const response = await axios.get(`https://nekos.best/api/v2/${action}`, { timeout: 8000 });
    return response?.data?.results?.[0]?.url || null;
}

async function fetchFromTenor(action) {
    if (!config.tenorApiKey) return null;
    const meta = getActionMeta(action);
    if (!meta) return null;

    const response = await axios.get('https://tenor.googleapis.com/v2/search', {
        timeout: 8000,
        params: {
            key: config.tenorApiKey,
            q: meta.tenorQuery,
            limit: 10,
            media_filter: 'gif',
            contentfilter: 'medium',
            random: true
        }
    });

    const item = response?.data?.results?.[0];
    return item?.media_formats?.gif?.url || null;
}

async function fetchInteractionGif(action) {
    const providers = [fetchFromWaifuPics, fetchFromNekosBest, fetchFromTenor];
    for (const provider of providers) {
        try {
            const url = await provider(action);
            if (url) return url;
        } catch {
            // try next provider
        }
    }

    return null;
}

function createReturnComponents(action, authorId, targetId) {
    const meta = getActionMeta(action);
    if (!meta) return [];

    const customId = `fun_return_${action}_${authorId}_${targetId}`;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(customId)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Devolver')
    );

    return [row];
}

function parseReturnCustomId(customId) {
    const parts = (customId || '').split('_');
    if (parts.length < 5) return null;
    if (parts[0] !== 'fun' || parts[1] !== 'return') return null;

    return {
        action: parts[2],
        authorId: parts[3],
        targetId: parts[4]
    };
}

async function handleReturnInteraction(interaction) {
    const parsed = parseReturnCustomId(interaction.customId);
    if (!parsed) return false;

    const meta = getActionMeta(parsed.action);
    if (!meta) {
        await interaction.reply({ content: '❌ Interacción inválida.', flags: 64 }).catch(() => {});
        return true;
    }

    if (interaction.user.id !== parsed.targetId) {
        await interaction.reply({ content: '❌ Solo el usuario mencionado puede devolver esta interacción.', flags: 64 }).catch(() => {});
        return true;
    }

    const gifUrl = await fetchInteractionGif(parsed.action);
    const counts = await incrementMentionCount(parsed.action, interaction.guild?.id || null, parsed.authorId).catch(() => ({ total: null, actionCount: null }));

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${meta.title} (Devolución)`)
        .setDescription(`<@${interaction.user.id}> ${meta.verb} a <@${parsed.authorId}>`)
        .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

    if (Number.isFinite(counts?.total) && Number.isFinite(counts?.actionCount)) {
        embed.addFields({
            name: '📊 Conteo',
            value: `Menciones a <@${parsed.authorId}>: **${counts.total}** total (**${counts.actionCount}** en ${parsed.action})`,
            inline: false
        });
    }

    if (gifUrl) embed.setImage(gifUrl);

    const disabledRows = (interaction.message.components || []).map((row) => {
        const clone = ActionRowBuilder.from(row);
        clone.components.forEach((component) => component.setDisabled(true));
        return clone;
    });

    await interaction.message.edit({ components: disabledRows }).catch(() => {});
    await interaction.reply({ embeds: [embed] }).catch(() => {});
    return true;
}

module.exports = {
    getActionMeta,
    fetchInteractionGif,
    incrementMentionCount,
    createReturnComponents,
    handleReturnInteraction
};
