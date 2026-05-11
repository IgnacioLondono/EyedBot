const config = require('../config');
const { EmbedBuilder } = require('discord.js');
const afkStore = require('../utils/afk-store');
const { buildAfkRemovedEmbed } = require('../utils/afk-announcements');

async function handleAFKAuthorReturn(message) {
    if (!message.guild || message.author.bot) return;

    try {
        const afkData = await afkStore.getAFK(message.guildId, message.author.id);
        if (!afkData) return;

        await afkStore.removeAFK(message.guildId, message.author.id);

        const embed = buildAfkRemovedEmbed(message.author, afkData);
        await message.channel.send({ embeds: [embed] }).catch(() => null);
    } catch (err) {
        console.warn('Error removiendo AFK del autor:', err?.message || err);
    }
}

async function handleAFKMentions(message) {
    if (message.author.bot || !message.mentions || message.mentions.size === 0) return;

    for (const mentioned of message.mentions.users.values()) {
        if (mentioned.bot) continue;

        try {
            const afkData = await afkStore.getAFK(message.guildId, mentioned.id);
            if (afkData) {
                const embed = new EmbedBuilder()
                    .setColor('f5a623')
                    .setTitle('⏳ Usuario ausente (AFK)')
                    .setDescription(`${mentioned.username} está ausente.`)
                    .addFields(
                        { name: 'Motivo', value: afkData.reason, inline: false },
                        { name: 'Desde', value: new Date(afkData.setAt).toLocaleString('es-ES'), inline: false }
                    )
                    .setAuthor({
                        name: mentioned.tag,
                        iconURL: mentioned.displayAvatarURL({ size: 64 })
                    })
                    .setTimestamp();

                await message.reply({
                    embeds: [embed],
                    allowedMentions: { repliedUser: false }
                }).catch(() => null);
            }
        } catch (err) {
            console.warn(`Error procesando AFK para ${mentioned.id}:`, err?.message || err);
        }
    }
}

module.exports = {
    name: 'messageCreate',
    handleAFKMentions,
    handleAFKAuthorReturn,
    async execute(message) {
        await handleAFKAuthorReturn(message).catch(console.error);
        await handleAFKMentions(message).catch(console.error);

        if (message.author.bot || !message.content.startsWith(config.prefix)) return;

        const args = message.content.slice(config.prefix.length).trim().split(/ +/);
        args.shift();
    }
};
