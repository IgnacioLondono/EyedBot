const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueueOrReply } = require('./_common');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder().setName('queue').setDescription('Muestra la cola actual'),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });

        const current = queue.currentTrack;
        const upcoming = queue.tracks.toArray().slice(0, 15);
        const lines = upcoming.map((t, i) => `${i + 1}. ${t.title} (${t.duration || '??:??'})`);

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('📋 Cola de reproducción')
            .setDescription(`**Ahora:** ${current?.title || 'N/A'}\n\n${lines.length ? lines.join('\n') : 'No hay canciones en cola.'}`);

        return interaction.reply({ embeds: [embed], flags: 64 });
    }
};

