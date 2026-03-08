const Embeds = require('../utils/embeds');
const welcomeStore = require('../utils/welcome-config-store');
const fs = require('fs');
const path = require('path');

// Queue welcome sends by channel so simultaneous joins are processed one by one.
const welcomeSendQueues = new Map();

function enqueueWelcomeSend(queueKey, task) {
    const previous = welcomeSendQueues.get(queueKey) || Promise.resolve();
    const next = previous
        .catch(() => null)
        .then(() => task());

    welcomeSendQueues.set(
        queueKey,
        next.finally(() => {
            if (welcomeSendQueues.get(queueKey) === next) {
                welcomeSendQueues.delete(queueKey);
            }
        })
    );

    return next;
}

function applyTemplate(text, member) {
    return String(text || '')
        .replace(/\{user\}/gi, `${member}`)
        .replace(/\{username\}/gi, member.user.username)
        .replace(/\{server\}/gi, member.guild.name)
        .replace(/\{memberCount\}/gi, String(member.guild.memberCount));
}

function resolveLocalUploadFile(rawUrl = '') {
    const raw = String(rawUrl || '').trim();
    if (!raw) return null;

    let uploadPath = '';
    if (raw.startsWith('/uploads/')) {
        uploadPath = raw;
    } else {
        try {
            const parsed = new URL(raw);
            if (String(parsed.pathname || '').startsWith('/uploads/')) uploadPath = parsed.pathname;
        } catch {
            uploadPath = '';
        }
    }

    if (!uploadPath) return null;
    const absolute = path.join(__dirname, '..', '..', 'web', 'public', uploadPath.replace(/^\/+/, ''));
    if (!fs.existsSync(absolute)) return null;
    return absolute;
}

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        const welcomeConfig = await welcomeStore.getWelcomeConfig(member.guild.id);
        const welcomeChannelId = welcomeConfig?.channelId || await welcomeStore.getWelcomeChannelId(member.guild.id);
        if (!welcomeChannelId) return;

        let channel = member.guild.channels.cache.get(welcomeChannelId);
        if (!channel) {
            channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
        }
        if (!channel || !channel.isTextBased()) return;

        if (welcomeConfig && welcomeConfig.enabled === false) return;

        const queueKey = `${member.guild.id}:${channel.id}`;

        if (welcomeConfig) {
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor((welcomeConfig.color || '7c4dff').replace('#', ''))
                .setTitle(applyTemplate(welcomeConfig.title || '¡Bienvenido!', member))
                .setDescription(applyTemplate(welcomeConfig.message || '¡Hola {user}!', member));

            if (welcomeConfig.footer) embed.setFooter({ text: applyTemplate(welcomeConfig.footer, member) });
            const files = [];
            if (welcomeConfig.imageUrl) {
                const localImagePath = resolveLocalUploadFile(welcomeConfig.imageUrl);
                if (localImagePath) {
                    const attachmentName = path.basename(localImagePath);
                    embed.setImage(`attachment://${attachmentName}`);
                    files.push({ attachment: localImagePath, name: attachmentName });
                } else {
                    embed.setImage(welcomeConfig.imageUrl);
                }
            }

            if (welcomeConfig.thumbnailMode === 'avatar') {
                embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
            } else if (welcomeConfig.thumbnailMode === 'url' && welcomeConfig.thumbnailUrl) {
                embed.setThumbnail(welcomeConfig.thumbnailUrl);
            }

            const content = welcomeConfig.mentionUser === false ? null : `${member}`;
            await enqueueWelcomeSend(queueKey, () => channel.send({ content, embeds: [embed], files })).catch(() => null);

            if (welcomeConfig.dmEnabled && welcomeConfig.dmMessage) {
                await member.send({ content: applyTemplate(welcomeConfig.dmMessage, member) }).catch(() => null);
            }

            return;
        }

        const embed = Embeds.info(
            '¡Bienvenido!',
            `¡Hola ${member}! Bienvenido a **${member.guild.name}**\n\n` +
            `Eres el miembro #${member.guild.memberCount}`
        );
        embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

        await enqueueWelcomeSend(queueKey, () => channel.send({ embeds: [embed] })).catch(() => null);
    }
};













