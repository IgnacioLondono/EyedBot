const config = require('../config');
const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');
const afkStore = require('../utils/afk-store');

async function handleAFKMentions(message) {
    // No procesar bots ni mensajes vacíos
    if (message.author.bot || !message.mentions || message.mentions.size === 0) return;

    // No procesar si el usuario que escribe está AFK (presumiblemente se despidió)
    try {
        const isAuthorAFK = await afkStore.isAFK(message.guildId, message.author.id);
        if (isAuthorAFK) {
            await afkStore.removeAFK(message.guildId, message.author.id);
        }
    } catch (err) {
        console.warn('Error removiendo AFK del autor:', err?.message || err);
    }

    // Iterar menciones y notificar si está AFK
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
    async execute(message) {
        // Procesar menciones AFK
        await handleAFKMentions(message).catch(console.error);

        // Ignorar bots y mensajes sin prefijo
        if (message.author.bot || !message.content.startsWith(config.prefix)) return;

        const args = message.content.slice(config.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Sistema de comandos legacy (opcional)
        // Puedes mantener esto para compatibilidad o eliminarlo si solo usas slash commands
    }
};