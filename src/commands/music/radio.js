const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { useQueue, QueueRepeatMode } = require('../../utils/music-queue-manager');
const YouTube = require('youtube-sr').default;
const config = require('../../config');
const { safeDeferReply, safeEditReply } = require('../../utils/interactions');
const { getMusicSystem, supportsAutoplayMode } = require('./_common');

const MAX_SEED_TRACKS = Math.max(5, Number.parseInt(process.env.MUSIC_RADIO_TRACKS || '25', 10));

function isLikelyBadTitle(title) {
    const t = (title || '').toLowerCase();
    return t.includes('amv') || t.includes('tiktok compilation') || t.includes('reaction') || t.includes('live stream');
}

function dedupByVideoId(videos) {
    const seen = new Set();
    const out = [];
    for (const v of videos || []) {
        const id = v?.id || v?.url;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push(v);
    }
    return out;
}

async function findRadioPlaylist(seed) {
    const queries = [
        `${seed} radio playlist`,
        `${seed} mix playlist`,
        `best of ${seed} playlist`,
        `${seed} essentials playlist`
    ];

    for (const q of queries) {
        const results = await YouTube.search(q, { type: 'playlist', limit: 5 }).catch(() => []);
        if (!Array.isArray(results) || !results.length) continue;
        const pick = results.find((p) => (p?.videoCount || p?.videos?.length || 0) >= 10);
        if (pick) return pick;
    }
    return null;
}

async function collectSeedTracks(seed, limit = MAX_SEED_TRACKS) {
    const playlist = await findRadioPlaylist(seed).catch(() => null);
    let videos = [];

    if (playlist?.url) {
        const full = await YouTube.getPlaylist(playlist.url, { fetchAll: true }).catch(() => null);
        if (full?.videos?.length) {
            videos = full.videos.slice(0, limit * 2);
        }
    }

    if (videos.length < limit) {
        const searchQueries = [
            `${seed} official audio`,
            `${seed} top songs`,
            `${seed} best songs`,
            `${seed}`
        ];
        for (const q of searchQueries) {
            if (videos.length >= limit * 2) break;
            const results = await YouTube.search(q, { type: 'video', limit: 15 }).catch(() => []);
            videos.push(...(results || []));
        }
    }

    const cleaned = dedupByVideoId(videos)
        .filter((v) => v?.url || v?.id)
        .filter((v) => !isLikelyBadTitle(v?.title || ''))
        .slice(0, limit);

    return { playlist, videos: cleaned };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('radio')
        .setDescription('Inicia una radio infinita basada en un artista, canción o género.')
        .addStringOption((option) =>
            option
                .setName('seed')
                .setDescription('Artista, canción o género (ej: "Coldplay", "lofi chill", "Bad Bunny Me Porto Bonito")')
                .setRequired(true)),
    cooldown: 5,

    async execute(interaction) {
        const seed = (interaction.options.getString('seed') || '').trim();
        if (!seed) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('Debes dar un tema, artista o canción.')],
                flags: 64
            });
        }

        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('Debes estar en un canal de voz.')],
                flags: 64
            });
        }
        if (!voiceChannel.joinable) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('No puedo unirme a tu canal de voz.')],
                flags: 64
            });
        }

        await safeDeferReply(interaction);

        const { playlist, videos } = await collectSeedTracks(seed, MAX_SEED_TRACKS).catch(() => ({ playlist: null, videos: [] }));
        if (!videos.length) {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ Sin semilla')
                    .setDescription(`No pude armar una radio a partir de **${seed}**. Prueba con un término más específico.`)]
            });
        }

        const musicSystem = getMusicSystem(interaction);
        const nodeOptions = musicSystem.buildNodeOptions(interaction.channel);

        let added = 0;
        let failed = 0;
        for (const video of videos) {
            const url = video.url || (video.id ? `https://www.youtube.com/watch?v=${video.id}` : null);
            if (!url) { failed++; continue; }
            const played = await interaction.client.player.play(voiceChannel, url, {
                requestedBy: interaction.user,
                nodeOptions,
                searchEngine: 'youtube'
            }).catch(() => null);
            if (played?.track) added++;
            else failed++;
        }

        if (!added) {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ No se pudo iniciar la radio')
                    .setDescription('Encontré semillas pero ninguna pudo reproducirse.')]
            });
        }

        const queue = useQueue(interaction.guild.id);
        if (queue && supportsAutoplayMode()) {
            try { queue.setRepeatMode(QueueRepeatMode.AUTOPLAY); } catch { /* ignore */ }
        }

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('📡 Radio iniciada')
            .setDescription(`Reproduciendo una radio infinita basada en **${seed}**.`)
            .addFields(
                { name: '🎶 Semillas añadidas', value: `${added}`, inline: true },
                { name: '🔁 Autoplay', value: supportsAutoplayMode() ? 'Activado' : 'No disponible', inline: true },
                failed > 0 ? { name: '⚠️ Fallaron', value: `${failed}`, inline: true } : { name: '\u200b', value: '\u200b', inline: true }
            )
            .setFooter({ text: playlist?.title ? `Inspirado en: ${playlist.title}` : 'Semillas: YouTube' });

        if (playlist?.thumbnail?.url) embed.setThumbnail(playlist.thumbnail.url);

        return safeEditReply(interaction, { embeds: [embed] });
    }
};
