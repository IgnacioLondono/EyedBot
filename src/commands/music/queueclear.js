const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { getQueueOrReply, userCanControlMusic } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queueclear')
        .setDescription('Limpia todas las canciones pendientes de la cola (no detiene la actual)'),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });

        const voiceCheck = await userCanControlMusic(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        const count = queue.tracks.size || queue.tracks.toArray().length;
        if (!count) {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('ℹ️ Cola vacía').setDescription('No hay canciones pendientes.')], flags: 64 });
        }

        queue.tracks.clear();
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🧹 Cola limpiada')
                .setDescription(`Eliminadas **${count}** canciones pendientes.`)],
            flags: 64
        });
    }
};

