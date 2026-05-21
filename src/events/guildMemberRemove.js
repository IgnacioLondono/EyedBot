const welcomeStore = require('../utils/welcome-config-store');
const { applyWelcomeMediaToEmbed } = require('../utils/welcome-upload-resolve');
const { applyGuildEmbedText } = require('../utils/embed-text-template');

function applyTemplate(text, member) {
    return applyGuildEmbedText(text, { guild: member?.guild, member });
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
            await applyWelcomeMediaToEmbed(embed, goodbyeConfig.imageUrl, files, member.guild, 'image');
        }

        if (goodbyeConfig?.thumbnailMode === 'avatar') {
            embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
        } else if (goodbyeConfig?.thumbnailMode === 'url' && goodbyeConfig?.thumbnailUrl) {
            await applyWelcomeMediaToEmbed(embed, goodbyeConfig.thumbnailUrl, files, member.guild, 'thumbnail');
        }

        await channel.send({ embeds: [embed], files }).catch(() => null);
    }
};
