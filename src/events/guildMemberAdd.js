const Embeds = require('../utils/embeds');
const welcomeStore = require('../utils/welcome-config-store');

function applyTemplate(text, member) {
    return String(text || '')
        .replace(/\{user\}/gi, `${member}`)
        .replace(/\{username\}/gi, member.user.username)
        .replace(/\{server\}/gi, member.guild.name)
        .replace(/\{memberCount\}/gi, String(member.guild.memberCount));
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

        if (welcomeConfig) {
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor((welcomeConfig.color || '7c4dff').replace('#', ''))
                .setTitle(applyTemplate(welcomeConfig.title || '¡Bienvenido!', member))
                .setDescription(applyTemplate(welcomeConfig.message || '¡Hola {user}!', member));

            if (welcomeConfig.footer) embed.setFooter({ text: applyTemplate(welcomeConfig.footer, member) });
            if (welcomeConfig.imageUrl) embed.setImage(welcomeConfig.imageUrl);

            if (welcomeConfig.thumbnailMode === 'avatar') {
                embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
            } else if (welcomeConfig.thumbnailMode === 'url' && welcomeConfig.thumbnailUrl) {
                embed.setThumbnail(welcomeConfig.thumbnailUrl);
            }

            const content = welcomeConfig.mentionUser === false ? null : `${member}`;
            await channel.send({ content, embeds: [embed] }).catch(() => null);

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

        await channel.send({ embeds: [embed] }).catch(() => null);
    }
};













