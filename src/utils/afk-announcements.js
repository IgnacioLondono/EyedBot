const { EmbedBuilder } = require('discord.js');

const AFK_EMBED_COLOR = 0xf5a623;

function getUserAvatarUrl(user) {
    return user.displayAvatarURL({ extension: 'png', size: 256 });
}

function buildAfkActivatedEmbed(user, reason) {
    return new EmbedBuilder()
        .setColor(AFK_EMBED_COLOR)
        .setTitle('Estado AFK activado')
        .setDescription(`${user.username} está ausente.`)
        .setThumbnail(getUserAvatarUrl(user))
        .addFields({ name: 'Motivo', value: reason, inline: false })
        .setAuthor({
            name: user.tag,
            iconURL: getUserAvatarUrl(user)
        })
        .setTimestamp();
}

function buildAfkRemovedEmbed(user, afkData = null) {
    const embed = new EmbedBuilder()
        .setColor(AFK_EMBED_COLOR)
        .setTitle('Estado AFK desactivado')
        .setDescription(`${user.username} ya no está ausente.`)
        .setThumbnail(getUserAvatarUrl(user))
        .setAuthor({
            name: user.tag,
            iconURL: getUserAvatarUrl(user)
        })
        .setTimestamp();

    if (afkData?.reason) {
        embed.addFields({ name: 'Motivo anterior', value: afkData.reason, inline: false });
    }

    if (afkData?.setAt) {
        embed.addFields({
            name: 'Ausente desde',
            value: new Date(afkData.setAt).toLocaleString('es-ES'),
            inline: false
        });
    }

    return embed;
}

module.exports = {
    buildAfkActivatedEmbed,
    buildAfkRemovedEmbed
};
