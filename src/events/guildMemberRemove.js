const fs = require('fs');
const path = require('path');
const welcomeStore = require('../utils/welcome-config-store');

function applyTemplate(text, member) {
    return String(text || '')
        .replace(/\{user\}/gi, `${member.user?.tag || member.user?.username || 'Usuario'}`)
        .replace(/\{username\}/gi, member.user?.username || 'Usuario')
        .replace(/\{server\}/gi, member.guild?.name || 'Servidor')
        .replace(/\{memberCount\}/gi, String(member.guild?.memberCount || 0));
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
    name: 'guildMemberRemove',
    async execute(member) {
        const goodbyeConfig = await welcomeStore.getGoodbyeConfig(member.guild.id);
        const goodbyeChannelId = goodbyeConfig?.channelId || await welcomeStore.getGoodbyeChannelId(member.guild.id);
        if (!goodbyeChannelId) return;

        let channel = member.guild.channels.cache.get(goodbyeChannelId);
        if (!channel) {
            channel = await member.guild.channels.fetch(goodbyeChannelId).catch(() => null);
        }
        if (!channel || !channel.isTextBased()) return;

        if (goodbyeConfig && goodbyeConfig.enabled === false) return;

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor((goodbyeConfig?.color || 'ff5f9e').replace('#', ''))
            .setTitle(applyTemplate(goodbyeConfig?.title || 'Hasta pronto', member))
            .setDescription(applyTemplate(goodbyeConfig?.message || '{username} ha salido de {server}.', member));

        if (goodbyeConfig?.footer) embed.setFooter({ text: applyTemplate(goodbyeConfig.footer, member) });

        const files = [];
        if (goodbyeConfig?.imageUrl) {
            const localImagePath = resolveLocalUploadFile(goodbyeConfig.imageUrl);
            if (localImagePath) {
                const attachmentName = path.basename(localImagePath);
                embed.setImage(`attachment://${attachmentName}`);
                files.push({ attachment: localImagePath, name: attachmentName });
            } else {
                embed.setImage(goodbyeConfig.imageUrl);
            }
        }

        if (goodbyeConfig?.thumbnailMode === 'avatar') {
            embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
        } else if (goodbyeConfig?.thumbnailMode === 'url' && goodbyeConfig?.thumbnailUrl) {
            embed.setThumbnail(goodbyeConfig.thumbnailUrl);
        }

        await channel.send({ embeds: [embed], files }).catch(() => null);
    }
};
