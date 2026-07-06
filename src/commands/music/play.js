const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { useQueue } = require('../../utils/music-queue-manager');
const YouTube = require('youtube-sr').default;
const axios = require('axios');
const config = require('../../config');
const { safeDeferReply, safeEditReply } = require('../../utils/interactions');
const { getMusicSystem, ensureMusicBackend } = require('./_common');
const { resolveProviderUrl, detectProvider, formatDurationMs } = require('../../utils/music-providers');
const {
    findBestYoutubeMatch,
    isLikelyBadUploadTitle,
    scoreYoutubeCandidate,
    tokenSet,
    normalizeText
} = require('../../utils/music-youtube-match');
const { attachRequestedMetadata, inferSearchEngineForUrl } = require('../../utils/music-track-utils');

const AUTOCOMPLETE_TTL_MS = Math.max(5000, Number.parseInt(process.env.MUSIC_AUTOCOMPLETE_TTL_MS || '15000', 10));
const autocompleteCache = new Map();

const MAX_BULK_TRACKS = Math.max(1, Number.parseInt(process.env.MUSIC_MAX_BULK_TRACKS || '80', 10));
const BULK_RESOLVE_CONCURRENCY = Math.max(1, Number.parseInt(process.env.MUSIC_BULK_CONCURRENCY || '4', 10));

function autocompleteCacheGet(key) {
    const hit = autocompleteCache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
        autocompleteCache.delete(key);
        return null;
    }
    return hit.value;
}

function autocompleteCacheSet(key, value) {
    autocompleteCache.set(key, { value, expiresAt: Date.now() + AUTOCOMPLETE_TTL_MS });
}

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

function buildMatchOptions(trackMeta = {}) {
    return {
        durationMs: Number(trackMeta.durationMs) || 0,
        isrc: trackMeta.isrc || null,
        strictArtistMatch: config.musicStrictArtistMatch
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
            const listId = url.searchParams.get('list');
            if (id && listId) return `https://www.youtube.com/watch?v=${id}&list=${listId}`;
            return id ? `https://www.youtube.com/watch?v=${id}` : cleaned;
        }

        if (host.includes('youtube.com')) {
            const id = url.searchParams.get('v');
            const listId = url.searchParams.get('list');
            if (id && listId) return `https://www.youtube.com/watch?v=${id}&list=${listId}`;
            if (listId && !id) return `https://www.youtube.com/playlist?list=${listId}`;
            return id ? `https://www.youtube.com/watch?v=${id}` : cleaned;
        }

        return cleaned;
    } catch {
        return cleaned;
    }
}

async function getProviderMetadata(url) {
    const lower = url.toLowerCase();

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

async function trySearchCandidates(player, candidates, requestedBy) {
    const unique = [...new Set((candidates || []).map((c) => (c || '').toString().trim()).filter(Boolean))];

    for (const candidate of unique) {
        const engines = isUrl(candidate) ? inferEnginesForUrl(candidate) : ['youtube'];
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

function inferEnginesForUrl(url) {
    const engine = inferSearchEngineForUrl(url);
    if (engine === 'soundcloud') return ['soundcloud', 'auto'];
    if (engine === 'youtube') return ['youtube'];
    return ['youtube', 'auto'];
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

async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let index = 0;
    const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
        while (true) {
            const current = index++;
            if (current >= items.length) return;
            try {
                results[current] = await worker(items[current], current);
            } catch (error) {
                results[current] = { error: error?.message || 'Error' };
            }
        }
    });
    await Promise.all(runners);
    return results;
}

async function resolveTrackToYoutube(trackMeta) {
    if (trackMeta.provider === 'youtube' && trackMeta.sourceUrl) {
        return {
            url: trackMeta.sourceUrl,
            title: trackMeta.title,
            author: trackMeta.artist,
            thumbnail: trackMeta.thumbnail,
            confident: true
        };
    }
    return findBestYoutubeMatch(trackMeta.title, trackMeta.artist, buildMatchOptions(trackMeta));
}

function providerLabel(providerKey) {
    if (providerKey === 'spotify') return 'Spotify';
    if (providerKey === 'apple') return 'Apple Music';
    if (providerKey === 'youtube') return 'YouTube';
    if (providerKey === 'soundcloud') return 'SoundCloud';
    return 'External';
}

function bulkResultEmbed(providerResult, added, failed, totalDurationMs) {
    const providerName = providerLabel(providerResult.provider);
    const typeLabel = providerResult.type === 'album' ? 'álbum'
        : providerResult.type === 'playlist' ? 'playlist'
        : 'colección';

    const fields = [
        { name: `🔗 Fuente`, value: providerName, inline: true },
        { name: `📦 Tipo`, value: typeLabel, inline: true },
        { name: `✅ Añadidas`, value: `${added}`, inline: true }
    ];
    if (failed > 0) fields.push({ name: '⚠️ No reproducibles', value: `${failed}`, inline: true });
    if (totalDurationMs > 0) {
        fields.push({ name: '⏱️ Duración total (aprox.)', value: formatDurationMs(totalDurationMs), inline: true });
    }
    if (providerResult.author) fields.push({ name: '👤 Autor', value: providerResult.author.substring(0, 1024), inline: true });

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`✅ ${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} añadida a la cola`)
        .setDescription(`**${(providerResult.title || 'Colección').substring(0, 200)}**`)
        .addFields(fields);

    if (providerResult.thumbnail) embed.setThumbnail(providerResult.thumbnail);
    if (providerResult.url) embed.setURL(providerResult.url);
    return embed;
}

async function handleNativePlaylistAdd(interaction, voiceChannel, musicSystem, providerResult) {
    const requestedBy = interaction.user;
    const engine = providerResult.provider === 'soundcloud' ? 'soundcloud' : 'youtube';
    const queueBefore = useQueue(interaction.guild.id);
    const wasPlaying = queueBefore?.isPlaying?.() || false;

    const played = await interaction.client.player.play(voiceChannel, providerResult.url, {
        requestedBy,
        nodeOptions: musicSystem.buildNodeOptions(interaction.channel),
        searchEngine: engine
    }).catch(() => null);

    if (!played?.track) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ No se pudo cargar la colección')
                .setDescription(`No pude cargar esa ${providerLabel(providerResult.provider)} directamente.`)]
        });
    }

    const count = played.playlist?.trackCount || played.queue?.tracks?.size || 1;
    return safeEditReply(interaction, {
        embeds: [new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(wasPlaying ? '✅ Añadido a la cola' : '✅ Reproduciendo')
            .setDescription(`**${(providerResult.title || 'Colección').substring(0, 200)}**`)
            .addFields(
                { name: '🔗 Fuente', value: providerLabel(providerResult.provider), inline: true },
                { name: '✅ Pistas', value: `${count}`, inline: true }
            )]
    });
}

async function handleBulkAdd(interaction, voiceChannel, musicSystem, providerResult) {
    const tracksMeta = (providerResult.tracks || []).slice(0, MAX_BULK_TRACKS);
    if (!tracksMeta.length) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ Sin canciones')
                .setDescription(`No pude extraer canciones reproducibles de esa URL de ${providerLabel(providerResult.provider)}.`)]
        });
    }

    const processingEmbed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('⏳ Procesando colección')
        .setDescription(`Resolviendo **${tracksMeta.length}** canciones de **${(providerResult.title || providerLabel(providerResult.provider)).substring(0, 120)}**...`);
    if (providerResult.thumbnail) processingEmbed.setThumbnail(providerResult.thumbnail);
    await safeEditReply(interaction, { embeds: [processingEmbed] }).catch(() => {});

    const requestedBy = interaction.user;
    const nodeOptions = musicSystem.buildNodeOptions(interaction.channel);

    const resolved = await runWithConcurrency(tracksMeta, BULK_RESOLVE_CONCURRENCY, async (trackMeta) => {
        const match = await resolveTrackToYoutube(trackMeta).catch(() => null);
        if (!match?.url || match.confident === false) return null;
        return { meta: trackMeta, match };
    });

    let added = 0;
    let failed = 0;
    let totalDurationMs = 0;

    for (const entry of resolved) {
        if (!entry?.match?.url) {
            failed++;
            continue;
        }

        const playResult = await interaction.client.player.play(voiceChannel, entry.match.url, {
            requestedBy,
            nodeOptions,
            searchEngine: 'youtube'
        }).catch(() => null);

        if (!playResult?.track) {
            failed++;
            continue;
        }

        const track = playResult.track;
        attachRequestedMetadata(track, {
            title: entry.meta.title,
            artist: entry.meta.artist,
            provider: entry.meta.provider || providerResult.provider,
            sourceUrl: entry.meta.sourceUrl || providerResult.url,
            thumbnail: entry.meta.thumbnail
        });
        if (entry.meta.durationMs) totalDurationMs += entry.meta.durationMs;

        added++;
    }

    if (!added) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ No se pudo cargar la colección')
                .setDescription(`Encontré ${tracksMeta.length} canciones en esa ${providerResult.type}, pero ninguna se pudo reproducir.`)]
        });
    }

    return safeEditReply(interaction, {
        embeds: [bulkResultEmbed(providerResult, added, failed, totalDurationMs)]
    });
}

async function playSingleTrackFlow(interaction, voiceChannel, musicSystem, { query, requestedMeta }) {
    const requestedBy = interaction.user;
    const playEngine = inferSearchEngineForUrl(query);
    const providerFallbackPromise = isUrl(query) ? getProviderFallbackQuery(query) : Promise.resolve(null);
    let result = await trySearchCandidates(interaction.client.player, [query], requestedBy);

    if (!result?.hasTracks?.()) {
        const providerQuery = await providerFallbackPromise;
        if (providerQuery) {
            const fallbackEngine = playEngine === 'soundcloud' ? 'soundcloud' : 'youtube';
            result = await trySearchCandidates(interaction.client.player, [
                fallbackEngine === 'youtube' ? `ytsearch:${providerQuery}` : providerQuery,
                fallbackEngine === 'youtube' ? `${providerQuery} official audio` : providerQuery,
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

    let strictTrack = await musicSystem.resolveStrictTrack(query, requestedBy, playEngine);
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

    const strictUrl = strictTrack?.url || query;

    let played = null;
    try {
        played = await interaction.client.player.play(voiceChannel, strictUrl, {
            requestedBy,
            nodeOptions: musicSystem.buildNodeOptions(interaction.channel),
            searchEngine: playEngine
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
                const fallbackUrl = fallbackTrack?.url || fallbackQuery;
                played = await interaction.client.player.play(voiceChannel, fallbackUrl, {
                    requestedBy,
                    nodeOptions: musicSystem.buildNodeOptions(interaction.channel),
                    searchEngine: inferSearchEngineForUrl(fallbackUrl)
                }).catch(() => null);
                result = fallbackResult;
            }
        }
    }

    if (!played?.track) {
        return safeEditReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ Error reproduciendo')
                .setDescription('Encontré la canción, pero falló la reproducción del stream. Intenta otra versión desde búsqueda.')]
        });
    }

    if (requestedMeta) {
        attachRequestedMetadata(played.track, requestedMeta);
    }

    const playedTrack = played.track;
    const description = requestedMeta?.title && requestedMeta.title !== playedTrack.title
        ? `**${playedTrack?.title || 'Sin titulo'}**${playedTrack?.author ? ` — *${playedTrack.author}*` : ''}\n> Enlace original: **${requestedMeta.title}**${requestedMeta.artist ? ` — *${requestedMeta.artist}*` : ''}`
        : `**${playedTrack?.title || 'Sin titulo'}**${playedTrack?.author ? ` — *${playedTrack.author}*` : ''}`;

    return safeEditReply(interaction, {
        embeds: [new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(wasPlaying ? '✅ Añadido a la cola' : '✅ Reproduciendo')
            .setDescription(description)]
    });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce música desde URL o búsqueda (YouTube, Spotify, Apple Music, SoundCloud).')
        .addStringOption((option) =>
            option
                .setName('input')
                .setDescription('URL, playlist, álbum o término de búsqueda')
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

        const cacheKey = `${interaction.guildId || 'global'}:${normalizeText(focused).slice(0, 80)}`;
        const cached = autocompleteCacheGet(cacheKey);
        if (cached) {
            await interaction.respond(cached).catch(() => {});
            return;
        }

        const results = await YouTube.search(focused, {
            type: 'video',
            limit: 12,
            safeSearch: false
        }).catch(() => []);

        const filtered = (results || []).filter((v) => !isLikelyBadUploadTitle(v?.title || ''));
        const source = filtered.length ? filtered : (results || []);

        const options = source.slice(0, 12).map((v) => {
            const label = `${v.title || 'Sin titulo'} (${v.durationFormatted || v.duration || '??:??'})`;
            return {
                name: label.substring(0, 100),
                value: (v.url || focused).toString().substring(0, 100)
            };
        });

        autocompleteCacheSet(cacheKey, options);
        await interaction.respond(options).catch(() => {});
    },

    async execute(interaction) {
        const backend = await ensureMusicBackend(interaction);
        if (!backend.ok) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Música no disponible').setDescription(backend.message)],
                flags: 64
            });
        }

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
        const provider = isUrl(query) ? detectProvider(query) : null;

        if (provider) {
            const providerResult = await resolveProviderUrl(query).catch(() => null);

            if (providerResult?.unsupported) {
                return safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('❌ No soportado')
                        .setDescription(`Las URLs de tipo **${providerResult.type}** de ${providerLabel(provider)} no están soportadas. Usa un track, playlist o álbum.`)]
                });
            }

            if (providerResult && (providerResult.type === 'playlist' || providerResult.type === 'album')) {
                if (providerResult.lavalinkNative) {
                    return handleNativePlaylistAdd(interaction, voiceChannel, musicSystem, providerResult);
                }
                return handleBulkAdd(interaction, voiceChannel, musicSystem, providerResult);
            }

            if (providerResult?.type === 'track' && Array.isArray(providerResult.tracks) && providerResult.tracks.length) {
                const trackMeta = providerResult.tracks[0];

                if (provider === 'youtube' && trackMeta.sourceUrl) {
                    return playSingleTrackFlow(interaction, voiceChannel, musicSystem, {
                        query: trackMeta.sourceUrl
                    });
                }

                if (provider === 'soundcloud' && trackMeta.sourceUrl) {
                    return playSingleTrackFlow(interaction, voiceChannel, musicSystem, {
                        query: trackMeta.sourceUrl,
                        requestedMeta: {
                            title: trackMeta.title,
                            artist: trackMeta.artist,
                            provider: 'soundcloud',
                            sourceUrl: query,
                            thumbnail: trackMeta.thumbnail
                        }
                    });
                }

                const match = await findBestYoutubeMatch(
                    trackMeta.title,
                    trackMeta.artist,
                    buildMatchOptions(trackMeta)
                ).catch(() => null);

                if (!match?.url) {
                    return safeEditReply(interaction, {
                        embeds: [new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('❌ Sin resultados')
                            .setDescription(`No pude encontrar **${trackMeta.title}${trackMeta.artist ? ` — ${trackMeta.artist}` : ''}** en YouTube.`)]
                    });
                }

                if (!match.confident) {
                    return safeEditReply(interaction, {
                        embeds: [new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('❌ Coincidencia poco fiable')
                            .setDescription(
                                `No encontré una versión fiable de **${trackMeta.title}${trackMeta.artist ? ` — ${trackMeta.artist}` : ''}**.\n`
                                + `Mejor opción detectada: **${match.title}**${match.author ? ` — *${match.author}*` : ''}\n`
                                + 'Busca por texto con `/play` para elegir la versión correcta.'
                            )]
                    });
                }

                return playSingleTrackFlow(interaction, voiceChannel, musicSystem, {
                    query: match.url,
                    requestedMeta: {
                        title: trackMeta.title,
                        artist: trackMeta.artist,
                        provider,
                        sourceUrl: query,
                        thumbnail: trackMeta.thumbnail
                    }
                });
            }
        }

        if (isUrl(query)) {
            let requestedMeta = null;
            if (provider === 'soundcloud') {
                const scMeta = await getProviderMetadata(query);
                if (scMeta?.title) {
                    requestedMeta = {
                        title: scMeta.title,
                        artist: scMeta.artist,
                        provider: 'soundcloud',
                        sourceUrl: query
                    };
                }
            }
            return playSingleTrackFlow(interaction, voiceChannel, musicSystem, { query, requestedMeta });
        }

        const { title: parsedTitle, artist: parsedArtist } = splitQueryTitleArtist(query);

        const searchQueries = buildTextSearchQueries(query, parsedTitle, parsedArtist);
        const collected = [];
        const seenIds = new Set();
        for (const q of searchQueries) {
            const found = await YouTube.search(q, { type: 'video', limit: 10, safeSearch: false }).catch(() => []);
            for (const v of (found || [])) {
                const id = v?.id || v?.url;
                if (!id || seenIds.has(id)) continue;
                seenIds.add(id);
                collected.push(v);
            }
            if (collected.length >= 30) break;
        }

        const cleanedVideos = collected.filter((v) => !isLikelyBadUploadTitle(v?.title || ''));
        const sourceVideos = cleanedVideos.length ? cleanedVideos : collected;

        const scored = sourceVideos
            .map((v) => ({ video: v, score: scoreYoutubeCandidate(v, parsedTitle || query, parsedArtist || '') }))
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.video);

        const tracks = scored.map(mapVideo).filter((t) => t.url || t.id).slice(0, 10);
        if (!tracks.length) {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Sin resultados').setDescription(`No encontré resultados para **${query}**.`)]
            });
        }

        const { embed, rows } = await musicSystem.createSearchSelection(interaction, query, tracks, 'Resultados de busqueda');
        return safeEditReply(interaction, { embeds: [embed], components: rows });
    }
};

function splitQueryTitleArtist(rawQuery) {
    if (!rawQuery) return { title: '', artist: '' };
    const value = rawQuery.toString().trim();
    const separators = [' - ', ' – ', ' — ', ' by ', ' de '];
    for (const sep of separators) {
        const idx = value.toLowerCase().indexOf(sep.toLowerCase());
        if (idx > 0 && idx < value.length - sep.length) {
            const left = value.slice(0, idx).trim();
            const right = value.slice(idx + sep.length).trim();
            if (left && right) {
                if (sep.toLowerCase() === ' de ') return { title: left, artist: right };
                if (sep.toLowerCase() === ' by ') return { title: left, artist: right };
                return { title: left, artist: right };
            }
        }
    }
    return { title: value, artist: '' };
}

function buildTextSearchQueries(rawQuery, parsedTitle, parsedArtist) {
    const queries = [];
    const title = (parsedTitle || rawQuery || '').trim();
    const artist = (parsedArtist || '').trim();

    if (artist && title) {
        queries.push(`${artist} - ${title} official audio`);
        queries.push(`${artist} ${title} topic`);
        queries.push(`${artist} ${title}`);
        queries.push(`${title} ${artist}`);
    }

    queries.push(rawQuery);
    if (title && title !== rawQuery) queries.push(title);
    if (title && !/official audio|topic/i.test(rawQuery)) queries.push(`${title} official audio`);

    return [...new Set(queries.filter(Boolean))].slice(0, 5);
}
