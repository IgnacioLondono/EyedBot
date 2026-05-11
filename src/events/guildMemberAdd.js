const Embeds = require('../utils/embeds');
const welcomeStore = require('../utils/welcome-config-store');
const { renderWelcomeCardPng, mergeCardLayout } = require('../utils/welcome-card');
const { resolveWelcomeUploadFile } = require('../utils/welcome-upload-resolve');
const { AttachmentBuilder } = require('discord.js');
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
    const uid = member?.user?.id ?? member?.id;
    // Discord solo pinta la mención en azul con <@id>, no con @texto.
    const discordMention = uid ? `<@${uid}>` : '@usuario';
    const uname = member.user.username;
    const srv = member.guild.name;
    const mc = String(member.guild.memberCount);
    return String(text || '')
        .replace(/\{mention\}/gi, discordMention)
        .replace(/\{user\}/gi, discordMention)
        .replace(/\{username\}|\{usuario\}|\{nombre\}/gi, uname)
        .replace(/\{server\}|\{guild\}/gi, srv)
        .replace(/\{memberCount\}|\{members\}|\{member_count\}/gi, mc);
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
            const content = welcomeConfig.mentionUser ? `<@${member.id}>` : undefined;
            // Si «mencionar usuario» está off, evitar ping aunque el embed lleve <@id> (sigue viéndose azul).
            const allowedMentions = welcomeConfig.mentionUser
                ? { parse: ['users'] }
                : { parse: [], users: [], roles: [], repliedUser: false };
            // Deshabilitar el modo tarjeta (PNG con "fondo/imagen de fondo").
            const welcomeStyle = welcomeConfig.welcomeStyle === 'card' ? 'embed' : welcomeConfig.welcomeStyle;

            if (welcomeStyle === 'card') {
                let buffer;
                try {
                    const localImagePath = resolveWelcomeUploadFile(welcomeConfig.imageUrl);
                    buffer = await renderWelcomeCardPng({
                        avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
                        backgroundUrl: localImagePath ? null : welcomeConfig.imageUrl,
                        backgroundFilePath: localImagePath,
                        headline: applyTemplate(welcomeConfig.title || '¡Bienvenido!', member),
                        displayName: applyTemplate(
                            welcomeConfig.cardNameTemplate || '{username}',
                            member
                        ),
                        subtitle: applyTemplate(welcomeConfig.message || '¡Hola {user}!', member),
                        overlayText: applyTemplate(welcomeConfig.cardOverlayText || '', member),
                        overlayHex: welcomeConfig.cardOverlayColor || 'ffffff',
                        fontKey: welcomeConfig.cardFontKey || 'system',
                        plainUsername: member.user.username,
                        cardLayout: mergeCardLayout(welcomeConfig.cardLayout),
                        accentHex: welcomeConfig.cardAccentColor || '4ade80',
                        titleHex: welcomeConfig.cardTitleColor || 'ffffff',
                        nameHex: welcomeConfig.cardNameColor || 'f8fafc',
                        subtitleHex: welcomeConfig.cardSubtitleColor || 'e2e8f0'
                    });
                } catch {
                    buffer = null;
                }

                if (buffer) {
                    const file = new AttachmentBuilder(buffer, { name: 'bienvenida.png' });
                    await enqueueWelcomeSend(queueKey, () =>
                        channel.send({ content, files: [file], allowedMentions })
                    ).catch(() => null);
                } else {
                    const { EmbedBuilder } = require('discord.js');
                    const embed = new EmbedBuilder()
                        .setColor((welcomeConfig.color || '7c4dff').replace('#', ''))
                        .setTitle(applyTemplate(welcomeConfig.title || '¡Bienvenido!', member))
                        .setDescription(applyTemplate(welcomeConfig.message || '¡Hola {user}!', member));
                    if (welcomeConfig.footer) embed.setFooter({ text: applyTemplate(welcomeConfig.footer, member) });
                    await enqueueWelcomeSend(queueKey, () => channel.send({ content, embeds: [embed], allowedMentions })).catch(() => null);
                }

                if (welcomeConfig.dmEnabled && welcomeConfig.dmMessage) {
                    await member.send({ content: applyTemplate(welcomeConfig.dmMessage, member) }).catch(() => null);
                }
                return;
            }

            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor((welcomeConfig.color || '7c4dff').replace('#', ''))
                .setTitle(applyTemplate(welcomeConfig.title || '¡Bienvenido!', member))
                .setDescription(applyTemplate(welcomeConfig.message || '¡Hola {user}!', member));

            if (welcomeConfig.footer) embed.setFooter({ text: applyTemplate(welcomeConfig.footer, member) });
            const files = [];
            if (welcomeConfig.imageUrl) {
                const localImagePath = resolveWelcomeUploadFile(welcomeConfig.imageUrl);
                if (localImagePath) {
                    const attachmentName = path.basename(localImagePath);
                    embed.setImage(`attachment://${attachmentName}`);
                    files.push({ attachment: localImagePath, name: attachmentName });
                } else {
                    const imgUrl = String(welcomeConfig.imageUrl || '').trim();
                    // Discord solo acepta URLs http(s) públicas; rutas /uploads/ requieren archivo local (adjunto).
                    if (/^https?:\/\//i.test(imgUrl)) {
                        embed.setImage(imgUrl);
                    }
                }
            }

            if (welcomeConfig.thumbnailMode === 'avatar') {
                embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
            } else if (welcomeConfig.thumbnailMode === 'url' && welcomeConfig.thumbnailUrl) {
                const thumbLocal = resolveWelcomeUploadFile(welcomeConfig.thumbnailUrl);
                if (thumbLocal) {
                    const thumbName = path.basename(thumbLocal);
                    const thumbAttachName = `thumb_${thumbName}`;
                    embed.setThumbnail(`attachment://${thumbAttachName}`);
                    files.push({ attachment: thumbLocal, name: thumbAttachName });
                } else {
                    const u = String(welcomeConfig.thumbnailUrl || '').trim();
                    if (/^https?:\/\//i.test(u)) embed.setThumbnail(u);
                }
            }

            await enqueueWelcomeSend(queueKey, () => channel.send({ content, embeds: [embed], files, allowedMentions })).catch(() => null);

            if (welcomeConfig.dmEnabled && welcomeConfig.dmMessage) {
                await member.send({ content: applyTemplate(welcomeConfig.dmMessage, member) }).catch(() => null);
            }

            return;
        }

        const embed = Embeds.info(
            '¡Bienvenido!',
            `¡Hola <@${member.user.id}>! Bienvenido a **${member.guild.name}**\n\n` +
            `Eres el miembro #${member.guild.memberCount}`
        );
        embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

        await enqueueWelcomeSend(queueKey, () => channel.send({ embeds: [embed] })).catch(() => null);
    }
};













