const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueueOrReply } = require('./_common');
const config = require('../../config');
const { parseDurationToSeconds, formatSeconds, repeatModeLabel, requesterLabel } = require('./_common');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Muestra la cola actual')
        .addIntegerOption((option) =>
            option
                .setName('pagina')
                .setDescription('Pagina de la cola (10 canciones por pagina)')
                .setRequired(false)
                .setMinValue(1)
        ),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });

        const current = queue.currentTrack;
        const allUpcoming = queue.tracks.toArray();
        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil(allUpcoming.length / pageSize));
        const pageRequested = interaction.options.getInteger('pagina') || 1;
        const page = Math.min(Math.max(pageRequested, 1), totalPages);
        const start = (page - 1) * pageSize;
        const upcoming = allUpcoming.slice(start, start + pageSize);
        const lines = upcoming.map((t, i) => `${start + i + 1}. ${t.title} (${t.duration || '??:??'}) • ${requesterLabel(t)}`);

        const upcomingSeconds = allUpcoming.reduce((acc, t) => acc + parseDurationToSeconds(t?.duration), 0);
        const nowSeconds = parseDurationToSeconds(current?.duration);
        const totalSeconds = nowSeconds + upcomingSeconds;

        const summaryLines = [
            `**Ahora:** ${current?.title || 'N/A'} (${current?.duration || '??:??'})`,
            `**Solicitada por:** ${requesterLabel(current)}`,
            `**Canciones en cola:** ${allUpcoming.length}`,
            `**Duracion total estimada:** ${formatSeconds(totalSeconds)}`,
            `**Loop:** ${repeatModeLabel(queue.repeatMode)}`
        ];

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('📋 Cola de reproducción')
            .setDescription(`${summaryLines.join('\n')}\n\n${lines.length ? lines.join('\n') : 'No hay canciones en cola.'}`)
            .setFooter({ text: `Pagina ${page}/${totalPages} • ${pageSize} por pagina` });

        return interaction.reply({ embeds: [embed], flags: 64 });
    }
};

