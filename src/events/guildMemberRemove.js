const welcomeStore = require('../utils/welcome-config-store');
const { applyWelcomeMediaToEmbed } = require('../utils/welcome-upload-resolve');

function applyTemplate(text, member) {
    const uid = member?.user?.id ?? member?.id;
    const discordMention = uid ? `<@${uid}>` : '@usuario';
    const uname = member.user?.username || 'Usuario';
    return String(text || '')
        .replace(/\{mention\}/gi, discordMention)
        .replace(/\{user\}/gi, discordMention)
        .replace(/\{username\}|\{usuario\}|\{nombre\}/gi, uname)
        .replace(/\{server\}|\{guild\}/gi, member.guild?.name || 'Servidor')
        .replace(/\{memberCount\}|\{members\}|\{member_count\}/gi, String(member.guild?.memberCount || 0));
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
            applyWelcomeMediaToEmbed(embed, goodbyeConfig.imageUrl, files, 'image');
        }

        if (goodbyeConfig?.thumbnailMode === 'avatar') {
            embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
        } else if (goodbyeConfig?.thumbnailMode === 'url' && goodbyeConfig?.thumbnailUrl) {
            applyWelcomeMediaToEmbed(embed, goodbyeConfig.thumbnailUrl, files, 'thumbnail');
        }

        await channel.send({ embeds: [embed], files }).catch(() => null);
    }
};
