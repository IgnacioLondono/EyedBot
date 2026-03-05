const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { useQueue } = require('discord-player');
const YouTube = require('youtube-sr').default;
const axios = require('axios');
const config = require('../../config');
const { safeDeferReply, safeEditReply } = require('../../utils/interactions');
const { getMusicSystem } = require('./_common');

function isUrl(input) {
    return /^https?:\/\//i.test((input || '').toString().trim());
}

function mapVideo(video) {
    return {
        title: video?.title || 'Sin titulo',
        url: video?.url || (video?.id ? `https://www.youtube.com/watch?v=${video.id}` : ''),
        id: video?.id || null,
        author: video?.channel?.name || video?.author || 'Desconocido',
        duration: video?.durationFormatted || video?.duration || 'Desconocida',
        thumbnail: video?.thumbnail?.url || video?.thumbnail || null
    };
}

function stripTrailingGarbageUrl(input) {
    let s = (input || '').toString().trim();
    while (s && /[-)>.,\]]$/.test(s)) s = s.slice(0, -1);
    return s.trim();
}

function normalizeUrl(input) {
    const cleaned = stripTrailingGarbageUrl(input);
    if (!isUrl(cleaned)) return cleaned;

    try {
        const url = new URL(cleaned);
        const host = url.hostname.toLowerCase();

        if (host.includes('youtu.be')) {
            const id = url.pathname.split('/').filter(Boolean)[0];
            return id ? `https://www.youtube.com/watch?v=${id}` : cleaned;
        }

        if (host.includes('youtube.com')) {
            const id = url.searchParams.get('v');
            return id ? `https://www.youtube.com/watch?v=${id}` : cleaned;
        }

        return cleaned;
    } catch {
        return cleaned;
    }
}

function normalizeText(input) {
    return (input || '')
        .toString()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenSet(input) {
    const set = new Set();
    normalizeText(input).split(' ').forEach((t) => {
        if (t && t.length > 1) set.add(t);
    });
    return set;
}

function jaccard(a, b) {
    if (!a.size && !b.size) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const union = a.size + b.size - inter;
    return union ? inter / union : 0;
}

function scoreYoutubeCandidate(video, title, artist) {
    const vTitle = video?.title || '';
    const vAuthor = video?.channel?.name || video?.author || '';

    const titleScore = jaccard(tokenSet(title), tokenSet(vTitle));
    const artistScore = artist
        ? jaccard(tokenSet(artist), tokenSet(`${vAuthor} ${vTitle}`))
        : 0;

    const tNorm = normalizeText(vTitle);
    const queryNorm = normalizeText(`${title} ${artist}`);

    const heavyPenalty = (tNorm.includes('not full') ? 1.2 : 0)
        + (tNorm.includes('short') && !queryNorm.includes('short') ? 0.8 : 0)
        + (tNorm.includes('edit') && !queryNorm.includes('edit') ? 0.7 : 0)
        + (tNorm.includes('amv') ? 0.9 : 0)
        + (tNorm.includes('x ') ? 0.35 : 0)
        + (tNorm.includes('nightcore') ? 0.8 : 0)
        + (tNorm.includes('slowed') ? 0.5 : 0)
        + (tNorm.includes('sped up') ? 0.5 : 0)
        + (tNorm.includes('remix') && !queryNorm.includes('remix') ? 0.4 : 0)
        + (tNorm.includes('cover') && !queryNorm.includes('cover') ? 0.7 : 0)
        + (tNorm.includes('instrumental') && !queryNorm.includes('instrumental') ? 0.3 : 0);

    const bonus = (tNorm.includes('official') ? 0.15 : 0)
        + (tNorm.includes('topic') ? 0.2 : 0)
        + (tNorm.includes('audio') ? 0.1 : 0);

    return (titleScore * 1.3 + artistScore * 1.0) + bonus - heavyPenalty;
}

async function getProviderMetadata(url) {
    const lower = url.toLowerCase();

    if (lower.includes('spotify.com')) {
        const { data } = await axios.get('https://open.spotify.com/oembed', {
            timeout: 8000,
            params: { url }
        }).catch(() => ({ data: null }));

        const rawTitle = (data?.title || '').toString().trim();
        const rawArtist = (data?.author_name || '').toString().trim();
        if (!rawTitle && !rawArtist) return null;

        let title = rawTitle;
        let artist = rawArtist;
        if (rawTitle.includes(' - ') && !rawArtist) {
            const parts = rawTitle.split(' - ').map((p) => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                title = parts[0];
                artist = parts.slice(1).join(' - ');
            }
        }

        return { provider: 'spotify', title, artist };
    }

    if (lower.includes('soundcloud.com')) {
        const { data } = await axios.get('https://soundcloud.com/oembed', {
            timeout: 8000,
            params: { format: 'json', url }
        }).catch(() => ({ data: null }));

        const rawTitle = (data?.title || '').toString().trim();
        const rawArtist = (data?.author_name || '').toString().trim();
        if (!rawTitle && !rawArtist) return null;
        return { provider: 'soundcloud', title: rawTitle, artist: rawArtist };
    }

    return null;
}

async function resolveProviderToYoutubeUrl(meta) {
    if (!meta?.title) return null;
    const title = meta.title;
    const artist = meta.artist || '';

    const queries = [
        `${artist} - ${title} official audio`.trim(),
        `${artist} ${title} topic`.trim(),
        `${artist} ${title}`.trim(),
        `${title} ${artist}`.trim(),
        title
    ].filter(Boolean);

    let best = null;
    let bestScore = -Infinity;

    for (const q of queries) {
        const videos = await YouTube.search(q, {
            type: 'video',
            limit: 15,
            safeSearch: false
        }).catch(() => []);

        for (const v of videos || []) {
            const s = scoreYoutubeCandidate(v, title, artist);
            if (s > bestScore) {
                bestScore = s;
                best = v;
            }
        }
    }

    if (!best) return null;
    return best.url || (best.id ? `https://www.youtube.com/watch?v=${best.id}` : null);
}

async function trySearchCandidates(player, candidates, requestedBy) {
    const unique = [...new Set((candidates || []).map((c) => (c || '').toString().trim()).filter(Boolean))];
    const engines = ['auto', 'youtube'];

    for (const candidate of unique) {
        for (const engine of engines) {
            const result = await player.search(candidate, {
                requestedBy,
                searchEngine: engine
            }).catch(() => null);
            if (result?.hasTracks?.()) return result;
        }
    }

    return null;
}

async function getProviderFallbackQuery(url) {
    const lower = url.toLowerCase();

    if (lower.includes('soundcloud.com')) {
        const { data } = await axios.get('https://soundcloud.com/oembed', {
            timeout: 8000,
            params: { format: 'json', url }
        }).catch(() => ({ data: null }));
        if (data?.title) return data.title;
    }

    if (lower.includes('spotify.com')) {
        const { data } = await axios.get('https://open.spotify.com/oembed', {
            timeout: 8000,
            params: { url }
        }).catch(() => ({ data: null }));
        if (data?.title) return data.title;
    }

    if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
        const video = await YouTube.getVideo(url).catch(() => null);
        if (video?.title) return video.title;
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce música desde URL o búsqueda (YouTube, Spotify, SoundCloud, Apple Music).')
        .addStringOption((option) =>
            option
                .setName('input')
                .setDescription('URL o termino de busqueda')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    cooldown: 2,

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused();
        if (!focused || focused.length < 2 || isUrl(focused)) {
            await interaction.respond([]).catch(() => {});
            return;
        }

        const results = await YouTube.search(focused, {
            type: 'video',
            limit: 12,
            safeSearch: false
        }).catch(() => []);

        const options = (results || []).slice(0, 12).map((v) => {
            const label = `${v.title || 'Sin titulo'} (${v.durationFormatted || v.duration || '??:??'})`;
            return {
                name: label.substring(0, 100),
                value: (v.url || focused).toString().substring(0, 100)
            };
        });

        await interaction.respond(options).catch(() => {});
    },

    async execute(interaction) {
        const musicSystem = getMusicSystem(interaction);
        const input = interaction.options.getString('input') || interaction.options.getString('busqueda');
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

        let query = normalizeUrl((input || '').trim());
        const lower = query.toLowerCase();
        const isApple = lower.includes('music.apple.com') || lower.includes('itunes.apple.com');

        if (isUrl(query) && isApple) {
            const bridged = await musicSystem.resolveAppleMusicUrlToYouTube(query);
            if (!bridged) {
                return safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('❌ Sin resultados')
                        .setDescription('No pude convertir ese link de Apple Music a una versión reproducible en YouTube.')]
                });
            }
            query = bridged;
        }

        let providerMeta = null;
        if (isUrl(query) && !isApple) {
            providerMeta = await getProviderMetadata(query);
            if (providerMeta) {
                const bridged = await resolveProviderToYoutubeUrl(providerMeta);
                if (bridged) query = bridged;
            }
        }

        if (isUrl(query)) {
            const requestedBy = interaction.user;
            let result = await trySearchCandidates(interaction.client.player, [query], requestedBy);

            if (!result?.hasTracks?.()) {
                const providerQuery = await getProviderFallbackQuery(query);
                if (providerQuery) {
                    result = await trySearchCandidates(interaction.client.player, [
                        `ytsearch:${providerQuery}`,
                        `${providerQuery} official audio`,
                        providerQuery
                    ], requestedBy);
                }
            }

            if (!result?.hasTracks?.()) {
                return safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('❌ Sin resultados')
                        .setDescription('No se pudo cargar esa URL.\nPrueba otro enlace o busca por texto para elegir versión.')]
                });
            }

            const queueBefore = useQueue(interaction.guild.id);
            const wasPlaying = queueBefore?.isPlaying?.() || false;

            // Forzar resolución estricta de URL para evitar covers/versiones ajenas.
            let strictTrack = await musicSystem.resolveStrictTrack(query, requestedBy);
            if (!strictTrack && result?.hasTracks?.()) {
                strictTrack = result.tracks[0] || null;
            }

            if (!strictTrack) {
                return safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('❌ Sin resultados')
                        .setDescription('No pude resolver una pista exacta para esa URL.')]
                });
            }

            if (providerMeta?.title) strictTrack.title = providerMeta.title;
            if (providerMeta?.artist) strictTrack.author = providerMeta.artist;

            let played = null;
            try {
                played = await interaction.client.player.play(voiceChannel, strictTrack, {
                    requestedBy,
                    nodeOptions: {
                        metadata: { channel: interaction.channel },
                        selfDeaf: true,
                        skipFFmpeg: config.musicSkipFfmpeg
                    }
                });
            } catch {
                const first = result?.tracks?.[0];
                const fallbackQuery = `${first?.title || ''} ${first?.author || ''}`.trim();
                if (fallbackQuery) {
                    const fallbackResult = await trySearchCandidates(interaction.client.player, [
                        `ytsearch:${fallbackQuery}`,
                        `${fallbackQuery} official audio`,
                        fallbackQuery
                    ], requestedBy);
                    if (fallbackResult?.hasTracks?.()) {
                        const fallbackTrack = fallbackResult.tracks[0] || null;
                        if (providerMeta?.title && fallbackTrack) fallbackTrack.title = providerMeta.title;
                        if (providerMeta?.artist && fallbackTrack) fallbackTrack.author = providerMeta.artist;

                        played = await interaction.client.player.play(voiceChannel, fallbackTrack || fallbackResult, {
                            requestedBy,
                            nodeOptions: {
                                metadata: { channel: interaction.channel },
                                selfDeaf: true,
                                skipFFmpeg: config.musicSkipFfmpeg
                            }
                        }).catch(() => null);
                        result = fallbackResult;
                    }
                }
            }

            if (!played) {
                return safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('❌ Error reproduciendo')
                        .setDescription('Encontré la canción, pero falló la reproducción del stream. Intenta otra versión desde búsqueda.')]
                });
            }
            const playedTrack = played?.track || strictTrack;
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setColor(config.embedColor)
                    .setTitle(wasPlaying ? '✅ Añadido a la cola' : '✅ Reproduciendo')
                    .setDescription(`**${playedTrack?.title || 'Sin titulo'}**${playedTrack?.author ? ` — *${playedTrack.author}*` : ''}`)]
            });
        }

        const videos = await YouTube.search(query, {
            type: 'video',
            limit: 10,
            safeSearch: false
        }).catch(() => []);

        const tracks = videos.map(mapVideo).filter((t) => t.url || t.id);
        if (!tracks.length) {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Sin resultados').setDescription(`No encontré resultados para **${query}**.`)]
            });
        }

        const { embed, rows } = await musicSystem.createSearchSelection(interaction, query, tracks, 'Resultados de busqueda');
        return safeEditReply(interaction, { embeds: [embed], components: rows });
    }
};
