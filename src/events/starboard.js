const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const starboardStore = require('../utils/starboard-store');

function emojiMatches(reaction, target) {
    const wanted = String(target || '⭐').trim();
    if (!wanted) return false;
    if (reaction.emoji?.id) {
        return wanted.includes(reaction.emoji.id) || wanted === reaction.emoji.name;
    }
    return reaction.emoji?.name === wanted || reaction.emoji?.toString() === wanted;
}

async function resolveMessage(reaction) {
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch {
            return null;
        }
    }
    if (reaction.message?.partial) {
        try {
            await reaction.message.fetch();
        } catch {
            return null;
        }
    }
    return reaction.message || null;
}

function buildStarboardEmbed(message, count) {
    const author = message.author;
    const content = String(message.content || '').trim();
    const preview = content ? content.slice(0, 1800) : '_Sin texto (puede tener embed o archivo)_';

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setAuthor({
            name: author?.tag || 'Usuario',
            iconURL: author?.displayAvatarURL?.({ size: 64 }) || undefined
        })
        .setDescription(preview)
        .addFields({ name: '⭐ Estrellas', value: `**${count}**`, inline: true })
        .setFooter({ text: `ID: ${message.id}` })
        .setTimestamp(message.createdAt || new Date());

    if (message.attachments?.size === 1) {
        const att = message.attachments.first();
        if (att?.contentType?.startsWith('image/')) {
            embed.setImage(att.url);
        }
    }

    return embed;
}

async function handleStarboardReaction(reaction, user) {
    if (!user || user.bot) return;

    const message = await resolveMessage(reaction);
    if (!message?.guild || !message.channel || message.author?.bot) return;

    const cfg = await starboardStore.getConfig(message.guild.id);
    if (!cfg?.enabled || !cfg.channelId) return;
    if (String(message.channel.id) === String(cfg.channelId)) return;
    if ((cfg.ignoredChannelIds || []).includes(message.channel.id)) return;
    if (!emojiMatches(reaction, cfg.emoji)) return;

    const full = reaction.message?.reactions?.cache?.find((r) => emojiMatches(r, cfg.emoji))
        || reaction;
    let count = full.count || 0;
    if (full.partial) {
        try {
            const fetched = await full.fetch();
            count = fetched.count || count;
        } catch {
            // keep count
        }
    }

    const threshold = Math.max(1, Number.parseInt(cfg.threshold, 10) || 3);
    if (count < threshold) return;

    const starChannel = message.guild.channels.cache.get(cfg.channelId)
        || await message.guild.channels.fetch(cfg.channelId).catch(() => null);
    if (!starChannel?.isTextBased?.()) return;

    const entries = await starboardStore.getEntryMap(message.guild.id);
    const existing = entries[String(message.id)];
    const embed = buildStarboardEmbed(message, count);
    const jump = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;

    if (existing?.starboardMessageId) {
        const posted = await starChannel.messages.fetch(existing.starboardMessageId).catch(() => null);
        if (posted) {
            await posted.edit({
                content: `${cfg.emoji} **${count}** · <#${message.channel.id}> · [ir al mensaje](${jump})`,
                embeds: [embed]
            }).catch(() => null);
            return;
        }
    }

    const sent = await starChannel.send({
        content: `${cfg.emoji} **${count}** · <#${message.channel.id}> · [ir al mensaje](${jump})`,
        embeds: [embed],
        allowedMentions: { parse: [] }
    }).catch(() => null);

    if (!sent) return;
    await starboardStore.setEntry(message.guild.id, message.id, {
        starboardMessageId: sent.id,
        channelId: message.channel.id,
        count,
        at: new Date().toISOString()
    });
}

module.exports = {
    handleStarboardReaction
};
