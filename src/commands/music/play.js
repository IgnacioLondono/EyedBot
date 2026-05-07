const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { useQueue } = require('discord-player');
const YouTube = require('youtube-sr').default;
const axios = require('axios');
const config = require('../../config');
const { safeDeferReply, safeEditReply } = require('../../utils/interactions');
const { getMusicSystem } = require('./_common');
const { resolveProviderUrl, detectProvider, formatDurationMs } = require('../../utils/music-providers');

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

function overlapRatio(target, candidate) {
    if (!target.size) return 0;
    let inter = 0;
    for (const token of target) if (candidate.has(token)) inter++;
    return inter / target.size;
}

function scoreYoutubeCandidate(video, title, artist) {
    const vTitle = video?.title || '';
    const vAuthor = video?.channel?.name || video?.author || '';

    const titleScore = jaccard(tokenSet(title), tokenSet(vTitle));
    const artistScore = artist
        ? jaccard(tokenSet(artist), tokenSet(`${vAuthor} ${vTitle}`))
        : 0;

    const tNorm = normalizeText(vTitle);
    const aNorm = normalizeText(vAuthor);
    const queryNorm = normalizeText(`${title} ${artist}`);
    const artistTokens = tokenSet(artist);
    const candidateTokens = tokenSet(`${vAuthor} ${vTitle}`);
    const artistOverlap = overlapRatio(artistTokens, candidateTokens);
    const shortTitle = tokenSet(title).size <= 2;

    const heavyPenalty = (tNorm.includes('not full') ? 1.2 : 0)
        + (tNorm.includes('short') && !queryNorm.includes('short') ? 0.8 : 0)
        + (tNorm.includes('edit') && !queryNorm.includes('edit') ? 0.7 : 0)
        + (tNorm.includes('amv') ? 0.9 : 0)
        + (tNorm.includes('x ') ? 0.35 : 0)
        + (tNorm.includes('nightcore') ? 0.9 : 0)
        + (tNorm.includes('slowed') ? 0.6 : 0)
        + (tNorm.includes('sped up') ? 0.6 : 0)
        + (tNorm.includes('reverb') ? 0.3 : 0)
        + (tNorm.includes('bass boost') ? 0.5 : 0)
        + (tNorm.includes(' 8d ') || tNorm.includes(' 8 d ') ? 0.5 : 0)
        + (tNorm.includes('tiktok') && !queryNorm.includes('tiktok') ? 0.4 : 0)
        + (tNorm.includes('remix') && !queryNorm.includes('remix') ? 0.45 : 0)
        + (tNorm.includes('cover') && !queryNorm.includes('cover') ? 0.75 : 0)
        + (tNorm.includes('guitar cover') ? 0.6 : 0)
        + (tNorm.includes('piano cover') ? 0.6 : 0)
        + (tNorm.includes('karaoke') && !queryNorm.includes('karaoke') ? 0.8 : 0)
        + (tNorm.includes('instrumental') && !queryNorm.includes('instrumental') ? 0.35 : 0)
        + (tNorm.includes('reaction') ? 0.7 : 0)
        + (tNorm.includes(' live ') && !queryNorm.includes('live') ? 0.25 : 0)
        + (artistTokens.size && artistOverlap === 0 ? 1.4 : 0)
        + (artistTokens.size && artistOverlap > 0 && artistOverlap < 0.34 ? 0.45 : 0)
        + (artistTokens.size && shortTitle && artistOverlap < 0.34 ? 0.65 : 0);

    const bonus = (tNorm.includes('official') ? 0.2 : 0)
        + (aNorm.includes('topic') ? 0.45 : 0)
        + (aNorm.includes('vevo') ? 0.25 : 0)
        + (tNorm.includes('official audio') ? 0.25 : 0)
        + (tNorm.includes('official music video') ? 0.2 : 0)
        + (tNorm.includes('audio') ? 0.1 : 0);

    return (titleScore * 1.3 + artistScore * 1.0) + bonus - heavyPenalty;
}

function hasArtistSignal(video, artist) {
    const artistTokens = tokenSet(artist);
    if (!artistTokens.size) return true;
    const candidateTokens = tokenSet(`${video?.channel?.name || video?.author || ''} ${video?.title || ''}`);
    return overlapRatio(artistTokens, candidateTokens) >= 0.34;
}

function isLikelyBadUploadTitle(title) {
    const t = normalizeText(title);
    if (!t) return false;
    return t.includes('not full')
        || t.includes('short')
        || t.includes('preview')
        || t.includes('teaser')
        || t.includes('amv')
        || t.includes('clip');
}

async function findBestYoutubeMatch(title, artist = '') {
    if (!title) return null;

    const queries = [
        `${artist} - ${title} official audio`.trim(),
        `${artist} ${title} topic`.trim(),
        `${artist} ${title} official`.trim(),
        `${artist} ${title}`.trim(),
        `${title} ${artist}`.trim(),
        title
    ].filter(Boolean);

    const seen = new Set();
    let best = null;
    let bestScore = -Infinity;
    let strictBest = null;
    let strictBestScore = -Infinity;

    for (const q of queries) {
        if (seen.has(q)) continue;
        seen.add(q);

        const videos = await YouTube.search(q, {
            type: 'video',
            limit: 12,
            safeSearch: false
        }).catch(() => []);

        for (const v of videos || []) {
            if (isLikelyBadUploadTitle(v?.title || '')) continue;
            const score = scoreYoutubeCandidate(v, title, artist);
            if (artist && hasArtistSignal(v, artist) && score > strictBestScore) {
                strictBestScore = score;
                strictBest = v;
            }
            if (score > bestScore) {
                bestScore = score;
                best = v;
            }
        }
    }

    const chosen = strictBest || best;
    if (!chosen) return null;
    return {
        url: chosen.url || (chosen.id ? `https://www.youtube.com/watch?v=${chosen.id}` : null),
        title: chosen.title,
        author: chosen?.channel?.name || chosen?.author || null,
        durationFormatted: chosen.durationFormatted || chosen.duration || null,
        thumbnail: chosen?.thumbnail?.url || chosen?.thumbnail || null
    };
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
    const lower = url.toLowerCase();
    if (lower.includes('soundcloud.com')) return ['soundcloud', 'auto'];
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return ['youtube'];
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
            thumbnail: trackMeta.thumbnail
        };
    }
    return findBestYoutubeMatch(trackMeta.title, trackMeta.artist);
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
        if (!match?.url) return null;
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
        if (entry.meta.title) track.title = entry.meta.title;
        if (entry.meta.artist) track.author = entry.meta.artist;
        if (entry.meta.thumbnail) track.thumbnail = entry.meta.thumbnail;
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

async function playSingleTrackFlow(interaction, voiceChannel, musicSystem, { query, providerMeta }) {
    const requestedBy = interaction.user;
    const providerFallbackPromise = isUrl(query) ? getProviderFallbackQuery(query) : Promise.resolve(null);
    let result = await trySearchCandidates(interaction.client.player, [query], requestedBy);

    if (!result?.hasTracks?.()) {
        const providerQuery = await providerFallbackPromise;
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

    const strictUrl = strictTrack?.url || query;
    const playEngine = inferEnginesForUrl(strictUrl)[0] || 'youtube';

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
                    searchEngine: 'youtube'
                }).catch(() => null);
                if (played?.track) {
                    if (providerMeta?.title) played.track.title = providerMeta.title;
                    if (providerMeta?.artist) played.track.author = providerMeta.artist;
                }
                result = fallbackResult;
            }
        }
    }

    if (played?.track) {
        if (providerMeta?.title) played.track.title = providerMeta.title;
        if (providerMeta?.artist) played.track.author = providerMeta.artist;
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

        if (provider && provider !== 'soundcloud') {
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
                return handleBulkAdd(interaction, voiceChannel, musicSystem, providerResult);
            }

            if (providerResult?.type === 'track' && Array.isArray(providerResult.tracks) && providerResult.tracks.length) {
                const trackMeta = providerResult.tracks[0];

                if (provider === 'youtube' && trackMeta.sourceUrl) {
                    return playSingleTrackFlow(interaction, voiceChannel, musicSystem, {
                        query: trackMeta.sourceUrl,
                        providerMeta: null
                    });
                }

                const match = await findBestYoutubeMatch(trackMeta.title, trackMeta.artist).catch(() => null);
                if (!match?.url) {
                    return safeEditReply(interaction, {
                        embeds: [new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('❌ Sin resultados')
                            .setDescription(`No pude encontrar **${trackMeta.title}${trackMeta.artist ? ` — ${trackMeta.artist}` : ''}** en YouTube.`)]
                    });
                }

                return playSingleTrackFlow(interaction, voiceChannel, musicSystem, {
                    query: match.url,
                    providerMeta: { title: trackMeta.title, artist: trackMeta.artist }
                });
            }
        }

        let providerMeta = null;
        if (isUrl(query) && provider === 'soundcloud') {
            providerMeta = await getProviderMetadata(query);
            if (providerMeta?.title) {
                const match = await findBestYoutubeMatch(providerMeta.title, providerMeta.artist).catch(() => null);
                if (match?.url) query = match.url;
            }
        }

        if (isUrl(query)) {
            return playSingleTrackFlow(interaction, voiceChannel, musicSystem, { query, providerMeta });
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
