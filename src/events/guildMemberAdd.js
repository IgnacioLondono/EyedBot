const Embeds = require('../utils/embeds');
const welcomeStore = require('../utils/welcome-config-store');
const verifyStore = require('../utils/verify-config-store');
const { renderWelcomeCardPng, mergeCardLayout } = require('../utils/welcome-card');
const { applyWelcomeMediaToEmbed, resolveWelcomeCardBackground } = require('../utils/welcome-upload-resolve');
const { applyGuildEmbedText } = require('../utils/embed-text-template');
const { AttachmentBuilder } = require('discord.js');

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
    return applyGuildEmbedText(text, { guild: member?.guild, member });
}

function canManageRole(guild, role) {
    const me = guild?.members?.me;
    if (!me || !role) return false;
    if (!me.permissions.has('ManageRoles')) return false;
    return me.roles.highest.position > role.position;
}

async function assignNewMemberVerifyRole(member) {
    if (!member?.guild?.id) return;
    const cfg = await verifyStore.getVerifyConfig(member.guild.id).catch(() => null);
    if (!cfg || cfg.enabled === false) return;

    const newMemberRoleId = String(cfg.newMemberRoleId || '').trim();
    if (!newMemberRoleId) return;
    if (String(cfg.roleId || '').trim() === newMemberRoleId) return;

    const role = member.guild.roles.cache.get(newMemberRoleId) || await member.guild.roles.fetch(newMemberRoleId).catch(() => null);
    if (!role || !canManageRole(member.guild, role)) return;
    if (member.roles.cache.has(role.id)) return;

    await member.roles.add(role, 'Rol inicial al unirse (pendiente de verificación)').catch(() => null);
}

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        await assignNewMemberVerifyRole(member).catch(() => null);

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
            const welcomeStyle = welcomeConfig.welcomeStyle === 'card' ? 'card' : 'embed';

            if (welcomeStyle === 'card') {
                let buffer;
                try {
                    const bg = await resolveWelcomeCardBackground(welcomeConfig.imageUrl, member.guild.id);
                    buffer = await renderWelcomeCardPng({
                        avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
                        backgroundUrl: bg.backgroundUrl || null,
                        backgroundFilePath: bg.backgroundFilePath || null,
                        backgroundBuffer: bg.backgroundBuffer || null,
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
                await applyWelcomeMediaToEmbed(embed, welcomeConfig.imageUrl, files, member.guild, 'image');
            }

            if (welcomeConfig.thumbnailMode === 'avatar') {
                embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
            } else if (welcomeConfig.thumbnailMode === 'url' && welcomeConfig.thumbnailUrl) {
                await applyWelcomeMediaToEmbed(embed, welcomeConfig.thumbnailUrl, files, member.guild, 'thumbnail');
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













