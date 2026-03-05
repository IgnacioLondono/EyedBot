const Embeds = require('../utils/embeds');
const db = require('../utils/database');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member) {
        const welcomeChannelId = await db.get(`welcome_${member.guild.id}`);
        if (!welcomeChannelId) return;

        const channel = member.guild.channels.cache.get(welcomeChannelId);
        if (!channel) return;

        const embed = Embeds.info(
            '¡Bienvenido!',
            `¡Hola ${member}! Bienvenido a **${member.guild.name}**\n\n` +
            `Eres el miembro #${member.guild.memberCount}`
        );
        embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));

        channel.send({ embeds: [embed] });
    }
};













