const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getQueueOrReply, userCanControlMusic } = require('./_common');

const FILTERS = ['studio', 'vocal', 'bassboost', 'nightcore', 'vaporwave', 'clean', 'reset'];
const PRESETS = {
    studio: ['normalizer2', 'softlimiter'],
    vocal: ['compressor', 'normalizer2'],
    bassboost: ['bassboost_low', 'softlimiter'],
    clean: ['normalizer']
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filters')
        .setDescription('Activa o desactiva filtros de audio')
        .addStringOption((option) =>
            option
                .setName('filtro')
                .setDescription('Filtro de audio')
                .setRequired(true)
                .addChoices(...FILTERS.map((f) => ({ name: f, value: f })))
        ),
    cooldown: 2,
    async execute(interaction) {
        const { queue, error } = getQueueOrReply(interaction);
        if (!queue) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(error)], flags: 64 });
        const voiceCheck = await userCanControlMusic(interaction, queue);
        if (!voiceCheck.ok) return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription(voiceCheck.error)], flags: 64 });

        const filter = interaction.options.getString('filtro');
        const ffmpeg = queue.filters?.ffmpeg;
        if (!ffmpeg || typeof ffmpeg.toggle !== 'function') {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ No soportado').setDescription('Filtros no disponibles con el backend actual.')], flags: 64 });
        }

        if (filter === 'reset') {
            await ffmpeg.setFilters([]).catch(() => null);
            return interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle('🎚️ Filtros').setDescription('Perfil plano aplicado (sin filtros).')] });
        }

        if (PRESETS[filter]) {
            const profile = PRESETS[filter];
            await ffmpeg.setFilters(profile).catch(() => null);
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('🎚️ Perfil de audio')
                    .setDescription(`Perfil **${filter}** aplicado: ${profile.join(', ')}`)]
            });
        }

        await ffmpeg.toggle(filter).catch(() => null);
        const enabled = ffmpeg.isEnabled?.(filter) ?? true;
        return interaction.reply({ embeds: [new EmbedBuilder().setColor('#0099FF').setTitle('🎚️ Filtro').setDescription(`${filter}: **${enabled ? 'ON' : 'OFF'}**`)] });
    }
};
