const Embeds = require('../utils/embeds');
const db = require('../utils/database');

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
        const welcomeConfig = await db.get(`welcome_config_${member.guild.id}`);
        const welcomeChannelId = welcomeConfig?.channelId || await db.get(`welcome_${member.guild.id}`);
        if (!welcomeChannelId) return;

        const channel = member.guild.channels.cache.get(welcomeChannelId);
        if (!channel) return;

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

        channel.send({ embeds: [embed] });
    }
};













