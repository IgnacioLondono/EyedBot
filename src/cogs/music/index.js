const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { useQueue, QueueRepeatMode, GuildQueueEvent } = require('discord-player');
const YouTube = require('youtube-sr').default;
const axios = require('axios');
const config = require('../../config');

function normalize(input) {
    return (input || '')
        .toString()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function toTokenSet(input) {
    const set = new Set();
    normalize(input).split(' ').forEach((token) => {
        if (token && token.length > 1) set.add(token);
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

class MusicSystem {
    constructor(client) {
        this.client = client;
        if (!this.client.musicSearchSessions) this.client.musicSearchSessions = new Map();
        if (!this.client.musicNowPlayingMessages) this.client.musicNowPlayingMessages = new Map();
        if (!this.client.musicRecoveryAttempts) this.client.musicRecoveryAttempts = new Map();
        if (!this.client.musicRecoveryLockUntil) this.client.musicRecoveryLockUntil = new Map();
        this._registerPlayerEvents();
    }

    buildNodeOptions(channel) {
        const safeVolume = Math.max(0, Math.min(config.musicMaxVolume || 80, config.musicDefaultVolume || 55));
        return {
            metadata: { channel },
            selfDeaf: true,
            skipFFmpeg: config.musicSkipFfmpeg,
            volume: safeVolume,
            leaveOnEmpty: config.musicLeaveOnEmpty,
            leaveOnEmptyCooldown: config.musicLeaveOnEmptyCooldownMs,
            leaveOnEnd: config.musicLeaveOnEnd,
            leaveOnEndCooldown: config.musicLeaveOnEndCooldownMs,
            leaveOnStop: config.musicLeaveOnStop,
            leaveOnStopCooldown: config.musicLeaveOnStopCooldownMs,
            bufferingTimeout: config.musicBufferingTimeoutMs,
            connectionTimeout: config.musicConnectionTimeoutMs
        };
    }

    _registerPlayerEvents() {
        if (!this.client?.player?.events) return;
        if (this.client.__musicEventsRegistered) return;
        this.client.__musicEventsRegistered = true;

        this.client.player.events.on(GuildQueueEvent.PlayerStart, (queue, track) => {
            void this._onPlayerStart(queue, track);
        });

        this.client.player.events.on(GuildQueueEvent.PlayerPause, (queue) => {
            void this._onPauseResume(queue, true);
        });

        this.client.player.events.on(GuildQueueEvent.PlayerResume, (queue) => {
            void this._onPauseResume(queue, false);
        });

        this.client.player.events.on(GuildQueueEvent.EmptyQueue, (queue) => {
            void this._onQueueEnded(queue, '✅ Cola finalizada');
        });

        this.client.player.events.on(GuildQueueEvent.Disconnect, (queue) => {
            void this._onQueueEnded(queue, '🛑 Desconectado del canal de voz');
        });

        this.client.player.events.on(GuildQueueEvent.PlayerError, (queue, error, track) => {
            void this._onPlayerError(queue, error, track);
        });

        this.client.player.events.on(GuildQueueEvent.Error, (queue, error) => {
            void this._onQueueError(queue, error);
        });
    }

    _queueGuildId(queue) {
        return queue?.guild?.id || queue?.id || null;
    }

    _trackUrl(track) {
        return (track?.url || track?.uri || '').toString();
    }

    _extractYouTubeId(input) {
        try {
            const url = new URL(input);
            const host = url.hostname.toLowerCase();
            if (host.includes('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || null;
            if (host.includes('youtube.com')) return url.searchParams.get('v');
            return null;
        } catch {
            return null;
        }
    }

    _isExactUrlMatch(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        const aId = this._extractYouTubeId(a);
        const bId = this._extractYouTubeId(b);
        return !!(aId && bId && aId === bId);
    }

    _scoreVideoAgainstTarget(video, targetTitle, targetArtist) {
        const videoTitle = video?.title || '';
        const videoArtist = video?.channel?.name || video?.author || '';

        const scoreTitle = jaccard(toTokenSet(targetTitle), toTokenSet(videoTitle));
        const scoreArtist = jaccard(toTokenSet(targetArtist), toTokenSet(`${videoArtist} ${videoTitle}`));
        const videoNorm = normalize(videoTitle);
        const targetNorm = normalize(targetTitle);

        const penalty = (videoNorm.includes('nightcore') ? 0.45 : 0)
            + (videoNorm.includes('cover') && !targetNorm.includes('cover') ? 0.30 : 0)
            + (videoNorm.includes('remix') && !targetNorm.includes('remix') ? 0.20 : 0)
            + (videoNorm.includes('slowed') ? 0.25 : 0)
            + (videoNorm.includes('sped up') ? 0.25 : 0)
            + (videoNorm.includes('karaoke') ? 0.35 : 0);

        const bonus = (videoNorm.includes('official') || videoNorm.includes('topic') || videoNorm.includes('audio')) ? 0.08 : 0;
        return (scoreTitle * 1.15 + scoreArtist * 0.85) + bonus - penalty;
    }

    _isLikelyBadUploadTitle(title) {
        const t = normalize(title);
        if (!t) return false;
        return t.includes('not full')
            || t.includes('short')
            || t.includes('preview')
            || t.includes('teaser')
            || t.includes('edit')
            || t.includes('amv')
            || t.includes('clip');
    }

    _isRecoverablePlaybackError(error) {
        const msg = (error?.message || '').toString().toLowerCase();
        return msg.includes('could not extract stream')
            || msg.includes('extract stream')
            || msg.includes('video unavailable')
            || msg.includes('playability')
            || msg.includes('age-restricted');
    }

    _recoveryKey(guildId, track) {
        const id = this._extractYouTubeId(this._trackUrl(track) || '');
        const fallback = normalize(`${track?.title || ''} ${track?.author || ''}`);
        return `${guildId}:${id || fallback || 'unknown'}`;
    }

    async _findRecoveryTrack(track, requestedBy) {
        const title = (track?.title || '').toString();
        const author = (track?.author || '').toString();
        if (!title) return null;

        const queries = [
            `${author} ${title} official audio full`.trim(),
            `${author} ${title} official audio`.trim(),
            `${author} ${title} topic`.trim(),
            `${author} ${title}`.trim(),
            title
        ].filter(Boolean);

        let best = null;
        let bestScore = -Infinity;
        const originalUrl = this._trackUrl(track);

        for (const q of queries) {
            const result = await this.client.player.search(q, {
                requestedBy,
                searchEngine: 'youtube'
            }).catch(() => null);

            const candidates = result?.tracks || [];
            for (const candidate of candidates) {
                const cTitle = candidate?.title || '';
                if (this._isLikelyBadUploadTitle(cTitle)) continue;
                const cUrl = this._trackUrl(candidate);
                if (this._isExactUrlMatch(cUrl, originalUrl)) continue;

                const score = this._scoreVideoAgainstTarget(
                    { title: cTitle, channel: { name: candidate?.author || '' } },
                    title,
                    author
                );
                if (score > bestScore) {
                    best = candidate;
                    bestScore = score;
                }
            }
        }

        return best;
    }

    _musicControlComponents(guildId, isPaused = false) {
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`music_skip_${guildId}`).setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`music_pause_resume_${guildId}`).setEmoji(isPaused ? '▶️' : '⏸️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`music_shuffle_${guildId}`).setEmoji('🔀').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`music_stop_${guildId}`).setEmoji('⏹️').setStyle(ButtonStyle.Danger)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`music_queue_${guildId}`).setEmoji('📋').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`music_loop_${guildId}`).setEmoji('🔁').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`music_volume_${guildId}`).setEmoji('🔊').setStyle(ButtonStyle.Secondary)
        );

        return [row1, row2];
    }

    _buildNowPlayingEmbed(track, queue) {
        const isPaused = queue?.node?.isPaused?.() || false;
        const loopLabel = this._repeatModeLabel(queue?.repeatMode ?? QueueRepeatMode.OFF);

        const artwork = track?.thumbnail
            || track?.raw?.thumbnail?.url
            || track?.raw?.thumbnail
            || null;

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(isPaused ? '⏸️ Pausado' : '🎵 Reproduciendo')
            .setDescription(`**${track?.title || 'Sin titulo'}**`)
            .addFields(
                { name: '👤 Artista', value: track?.author || 'Desconocido', inline: true },
                { name: '⏱️ Duracion', value: track?.duration || 'Desconocida', inline: true },
                { name: '🔁 Modo', value: loopLabel, inline: true },
                { name: '📋 En cola', value: String(queue?.tracks?.size || 0), inline: true },
                { name: '🔊 Volumen', value: `${queue?.node?.volume ?? config.musicDefaultVolume}%`, inline: true }
            );

        if (artwork) embed.setImage(artwork);
        if (track?.url) embed.setURL(track.url);
        return embed;
    }

    _supportsAutoplayMode() {
        return Number.isInteger(QueueRepeatMode?.AUTOPLAY);
    }

    _repeatModeLabel(mode) {
        if (mode === QueueRepeatMode.TRACK) return 'Cancion';
        if (mode === QueueRepeatMode.QUEUE) return 'Cola';
        if (this._supportsAutoplayMode() && mode === QueueRepeatMode.AUTOPLAY) return 'Autoplay';
        return 'Desactivado';
    }

    _nextRepeatMode(mode) {
        if (mode === QueueRepeatMode.OFF) return QueueRepeatMode.TRACK;
        if (mode === QueueRepeatMode.TRACK) return QueueRepeatMode.QUEUE;
        if (mode === QueueRepeatMode.QUEUE) {
            if (this._supportsAutoplayMode()) return QueueRepeatMode.AUTOPLAY;
            return QueueRepeatMode.OFF;
        }
        if (this._supportsAutoplayMode() && mode === QueueRepeatMode.AUTOPLAY) return QueueRepeatMode.OFF;
        return QueueRepeatMode.OFF;
    }

    async sendNowPlayingEmbed(guildId, channel, track, forcePaused = null) {
        if (!guildId || !channel?.send || !track) return;
        const queue = useQueue(guildId);
        const embed = this._buildNowPlayingEmbed(track, queue);
        const paused = forcePaused === null ? (queue?.node?.isPaused?.() || false) : forcePaused;
        const components = this._musicControlComponents(guildId, paused);

        const oldMsg = this.client.musicNowPlayingMessages.get(guildId);
        if (oldMsg) {
            try {
                await oldMsg.edit({ embeds: [embed], components });
                return;
            } catch {
                this.client.musicNowPlayingMessages.delete(guildId);
            }
        }

        const sent = await channel.send({ embeds: [embed], components }).catch(() => null);
        if (sent) this.client.musicNowPlayingMessages.set(guildId, sent);
    }

    async _onPlayerStart(queue, track) {
        const guildId = this._queueGuildId(queue);
        const channel = queue?.metadata?.channel || null;
        if (!guildId || !channel) return;

        this.client.musicRecoveryAttempts.delete(guildId);
        this.client.musicRecoveryLockUntil.delete(guildId);

        const safeVolume = Math.max(0, Math.min(config.musicMaxVolume || 75, config.musicDefaultVolume || 60));
        const maxVolume = config.musicMaxVolume || 75;
        const currentVolume = queue?.node?.volume;
        if (queue?.node?.setVolume && (!Number.isFinite(currentVolume) || currentVolume > maxVolume)) {
            queue.node.setVolume(safeVolume);
        }

        if (config.musicCleanProfileEnabled) {
            const ffmpeg = queue?.filters?.ffmpeg;
            if (ffmpeg && typeof ffmpeg.setFilters === 'function') {
                await ffmpeg.setFilters(config.musicCleanFilters).catch(() => null);
            }
        }

        await this.sendNowPlayingEmbed(guildId, channel, track, false);
    }

    async _onPauseResume(queue, isPaused) {
        const guildId = this._queueGuildId(queue);
        if (!guildId) return;
        const channel = queue?.metadata?.channel || this.client.musicNowPlayingMessages.get(guildId)?.channel;
        const track = queue?.currentTrack;
        if (!channel || !track) return;
        await this.sendNowPlayingEmbed(guildId, channel, track, isPaused);
    }

    async _onQueueEnded(queue, reasonText) {
        const guildId = this._queueGuildId(queue);
        if (!guildId) return;
        const message = this.client.musicNowPlayingMessages.get(guildId);
        if (!message) return;

        const disabled = this._musicControlComponents(guildId).map((row) => {
            row.components.forEach((component) => component.setDisabled(true));
            return row;
        });

        await message.edit({
            content: reasonText,
            embeds: [],
            components: disabled
        }).catch(() => {});
    }

    async _onPlayerError(queue, error, track) {
        const guildId = this._queueGuildId(queue);
        const channel = queue?.metadata?.channel;
        if (!channel?.send) return;

        if (guildId && track && this._isRecoverablePlaybackError(error)) {
            const lockUntil = this.client.musicRecoveryLockUntil.get(guildId) || 0;
            const now = Date.now();
            const key = this._recoveryKey(guildId, track);
            const lastAttempt = this.client.musicRecoveryAttempts.get(key) || 0;

            if (now >= lockUntil && now - lastAttempt > 15000) {
                this.client.musicRecoveryAttempts.set(key, now);
                this.client.musicRecoveryLockUntil.set(guildId, now + 10000);

                const requestedBy = track?.requestedBy || queue?.currentTrack?.requestedBy || null;
                const recovered = await this._findRecoveryTrack(track, requestedBy);
                if (recovered) {
                    const played = await queue.play(recovered, {
                        nodeOptions: this.buildNodeOptions(channel)
                    }).catch(() => null);

                    if (played) {
                        await channel.send({
                            embeds: [new EmbedBuilder()
                                .setColor('#00C897')
                                .setTitle('♻️ Recuperacion automatica')
                                .setDescription(`Falló el stream de **${track?.title || 'la pista'}** y cargué una version alternativa reproducible.`)]
                        }).catch(() => {});
                        return;
                    }
                }
            }
        }

        await channel.send({
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ Error de reproduccion')
                .setDescription(`${track?.title ? `**${track.title}**\n` : ''}\`\`\`${(error?.message || 'Error desconocido').toString().substring(0, 1500)}\`\`\``)]
        }).catch(() => {});
    }

    async _onQueueError(queue, error) {
        const channel = queue?.metadata?.channel;
        if (!channel?.send) return;
        const msg = (error?.message || 'Error desconocido').toString();
        await channel.send({
            embeds: [new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('❌ Error de cola')
                .setDescription(`\`\`\`${msg.substring(0, 1500)}\`\`\``)]
        }).catch(() => {});
    }

    _parseSearchSelectCustomId(customId) {
        const parts = customId.split('_');
        const selectedIndex = Number.parseInt(parts[2], 10);
        const userId = parts[3] || null;
        const sessionId = parts[4] || null;
        return { selectedIndex, userId, sessionId };
    }

    _searchButtons(userId, sessionId, items) {
        const max = Math.min(items.length, 5);
        const rows = [];

        for (let i = 0; i < max; i++) {
            const rowIndex = Math.floor(i / 3);
            if (!rows[rowIndex]) rows[rowIndex] = new ActionRowBuilder();

            const title = (items[i]?.title || 'Sin titulo').toString();
            rows[rowIndex].addComponents(
                new ButtonBuilder()
                    .setCustomId(`search_select_${i}_${userId}_${sessionId}`)
                    .setLabel(`${i + 1}. ${title.substring(0, 40)}${title.length > 40 ? '...' : ''}`)
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        return rows;
    }

    _disableRows(rows) {
        for (const row of rows || []) {
            for (const c of row.components || []) c.setDisabled(true);
        }
        return rows;
    }

    async createSearchSelection(interaction, query, tracks, title = 'Resultados de busqueda') {
        const sessionId = interaction.id;
        const key = `${interaction.guild.id}:${interaction.user.id}:${sessionId}`;
        const items = tracks.slice(0, 5);

        this.client.musicSearchSessions.set(key, {
            createdAt: Date.now(),
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            userId: interaction.user.id,
            voiceChannelId: interaction.member?.voice?.channel?.id || null,
            tracks: items
        });

        setTimeout(() => this.client.musicSearchSessions.delete(key), 60000);

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(title)
            .setDescription(`Se encontraron ${tracks.length} resultados para: **${query}**\nSelecciona una opcion:`)
            .setFooter({ text: 'Expira en 60 segundos' });

        items.forEach((t, i) => {
            embed.addFields({
                name: `${i + 1}. ${t.title.substring(0, 90)}${t.title.length > 90 ? '...' : ''}`,
                value: `Autor: ${t.author || 'Desconocido'} | Duracion: ${t.duration || 'Desconocida'}`,
                inline: false
            });
        });

        const rows = this._searchButtons(interaction.user.id, sessionId, items);
        return { embed, rows, sessionId };
    }

    _findSession(interaction, parsed) {
        const directKey = `${interaction.guild.id}:${interaction.user.id}:${parsed.sessionId || ''}`;
        if (parsed.sessionId && this.client.musicSearchSessions.has(directKey)) {
            return { key: directKey, value: this.client.musicSearchSessions.get(directKey) };
        }

        let newest = null;
        for (const [key, value] of this.client.musicSearchSessions.entries()) {
            if (value.userId !== interaction.user.id) continue;
            if (value.guildId !== interaction.guild.id) continue;
            if (value.channelId !== interaction.channel.id) continue;
            if (!newest || value.createdAt > newest.value.createdAt) newest = { key, value };
        }
        return newest;
    }

    async handleSearchSelection(interaction) {
        const parsed = this._parseSearchSelectCustomId(interaction.customId);
        if (parsed.userId !== interaction.user.id) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('Solo quien hizo la busqueda puede elegir.')],
                flags: 64
            }).catch(() => {});
            return;
        }

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: 64 }).catch(() => {});
        }

        const found = this._findSession(interaction, parsed);
        if (!found) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Expirado').setDescription('Los resultados expiraron. Ejecuta /play o /search otra vez.')]
            }).catch(() => {});
            return;
        }

        const { key, value } = found;
        const selected = value.tracks[parsed.selectedIndex];
        if (!selected) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('Seleccion no valida.')]
            }).catch(() => {});
            return;
        }

        const rows = this._searchButtons(interaction.user.id, parsed.sessionId || key.split(':')[2], value.tracks);
        await interaction.message.edit({ components: this._disableRows(rows) }).catch(() => {});

        const voiceChannel = interaction.guild.channels.cache.get(value.voiceChannelId || '');
        if (!voiceChannel) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('No pude encontrar tu canal de voz. Vuelve a unirte y reintenta.')]
            }).catch(() => {});
            return;
        }

        const strictUrl = selected.url || (selected.id ? `https://www.youtube.com/watch?v=${selected.id}` : '');
        const exactTrack = await this.resolveStrictTrack(strictUrl, interaction.user);
        if (!exactTrack) {
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ No se pudo cargar esa version exacta')
                    .setDescription('Seleccionaste una version especifica, pero no se pudo cargar exactamente. Elige otra opcion.')]
            }).catch(() => {});
            return;
        }

        if (selected.title) exactTrack.title = selected.title;
        if (selected.author) exactTrack.author = selected.author;
        if (selected.thumbnail) exactTrack.thumbnail = selected.thumbnail;
        if (selected.duration) exactTrack.duration = selected.duration;

        const queueBefore = useQueue(interaction.guild.id);
        const wasPlaying = queueBefore?.isPlaying?.() || false;

        await this.client.player.play(voiceChannel, exactTrack, {
            requestedBy: interaction.user,
            nodeOptions: this.buildNodeOptions(interaction.channel)
        });

        this.client.musicSearchSessions.delete(key);

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(wasPlaying ? '✅ Añadido a la cola' : '✅ Reproduciendo')
                .setDescription(`**${selected.title}**${selected.author ? ` — *${selected.author}*` : ''}`)]
        }).catch(() => {});
    }

    async resolveStrictTrack(url, requestedBy) {
        if (!url) return null;
        const engines = ['youtube', 'auto'];
        const targetId = this._extractYouTubeId(url);

        for (const engine of engines) {
            let result = null;
            try {
                result = await this.client.player.search(url, engine ? { requestedBy, searchEngine: engine } : { requestedBy });
            } catch {
                continue;
            }

            if (!result?.hasTracks?.()) continue;
            const exact = result.tracks.find((t) => {
                const tUrl = this._trackUrl(t);
                if (this._isExactUrlMatch(tUrl, url)) return true;
                const tId = this._extractYouTubeId(tUrl);
                return !!(targetId && tId && tId === targetId);
            });
            if (exact) return exact;
        }

        return null;
    }

    async resolveAppleMusicUrlToYouTube(url) {
        const parsed = this._extractAppleInfo(url);
        if (!parsed) return null;

        const meta = await this._fetchAppleMeta(parsed).catch(() => null);
        const title = meta?.trackName || parsed.guessedTitle;
        const artist = meta?.artistName || '';
        if (!title) return null;

        const queries = [
            `${artist} ${title} official audio`.trim(),
            `${artist} - ${title}`.trim(),
            `${title} ${artist}`.trim(),
            title
        ].filter(Boolean);

        let best = null;
        let bestScore = -Infinity;

        for (const q of queries) {
            const videos = await YouTube.search(q, { limit: 12, type: 'video', safeSearch: false }).catch(() => []);
            for (const v of videos || []) {
                const score = this._scoreVideoAgainstTarget(v, title, artist);
                if (score > bestScore) {
                    bestScore = score;
                    best = v;
                }
            }
        }

        if (!best) return null;
        return best.url || (best.id ? `https://www.youtube.com/watch?v=${best.id}` : null);
    }

    _extractAppleInfo(url) {
        try {
            const u = new URL(url);
            const host = u.hostname.toLowerCase();
            if (!host.includes('music.apple.com') && !host.includes('itunes.apple.com')) return null;

            const parts = u.pathname.split('/').filter(Boolean);
            const trackId = u.searchParams.get('i') || null;
            const storefront = parts[0] && /^[a-z]{2}$/i.test(parts[0]) ? parts[0].toLowerCase() : null;

            let collectionId = null;
            for (let i = parts.length - 1; i >= 0; i--) {
                if (/^\d+$/.test(parts[i])) {
                    collectionId = parts[i];
                    break;
                }
            }

            const guessedTitle = parts
                .slice()
                .reverse()
                .find((p) => p && !/^\d+$/.test(p) && !['album', 'song', 'artist', 'music'].includes(p.toLowerCase()));

            return {
                storefront,
                trackId,
                collectionId,
                guessedTitle: guessedTitle ? decodeURIComponent(guessedTitle).replace(/-/g, ' ').trim() : null
            };
        } catch {
            return null;
        }
    }

    async _fetchAppleMeta({ storefront, trackId, collectionId }) {
        const country = storefront && /^[a-z]{2}$/i.test(storefront) ? storefront : null;
        const timeout = 8000;

        const pick = (results) => {
            if (!Array.isArray(results)) return null;
            const track = results.find((r) => r && r.wrapperType === 'track' && r.kind === 'song')
                || results.find((r) => r && r.wrapperType === 'track');
            if (!track) return null;
            return {
                trackName: track.trackName || null,
                artistName: track.artistName || null
            };
        };

        if (trackId) {
            const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(trackId)}${country ? `&country=${encodeURIComponent(country)}` : ''}`;
            const { data } = await axios.get(url, { timeout });
            return pick(data?.results);
        }

        if (collectionId) {
            const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(collectionId)}&entity=song&limit=5${country ? `&country=${encodeURIComponent(country)}` : ''}`;
            const { data } = await axios.get(url, { timeout });
            return pick(data?.results);
        }

        return null;
    }

    async handleMusicControl(interaction, action) {
        const queue = useQueue(interaction.guild.id);
        const memberVoice = interaction.member?.voice?.channel;

        if (!memberVoice) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('Debes estar en un canal de voz.')],
                flags: 64
            }).catch(() => {});
            return;
        }

        if (!queue || !queue.currentTrack) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('No hay música reproduciéndose.')],
                flags: 64
            }).catch(() => {});
            return;
        }

        if (queue.channel && queue.channel.id !== memberVoice.id) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FFA500').setTitle('❌ Error').setDescription('Debes estar en el mismo canal del bot.')],
                flags: 64
            }).catch(() => {});
            return;
        }

        switch (action) {
            case 'pause_resume': {
                if (queue.node.isPaused()) {
                    queue.node.resume();
                    await interaction.reply({ content: '▶️ Reanudado.', flags: 64 }).catch(() => {});
                } else {
                    queue.node.pause();
                    await interaction.reply({ content: '⏸️ Pausado.', flags: 64 }).catch(() => {});
                }
                return;
            }
            case 'skip': {
                queue.node.skip();
                await interaction.reply({ content: '⏭️ Canción omitida.', flags: 64 }).catch(() => {});
                return;
            }
            case 'stop': {
                queue.delete();
                await interaction.reply({ content: '⏹️ Reproducción detenida.', flags: 64 }).catch(() => {});
                return;
            }
            case 'shuffle': {
                queue.tracks.shuffle();
                await interaction.reply({ content: '🔀 Cola mezclada.', flags: 64 }).catch(() => {});
                return;
            }
            case 'queue': {
                const lines = queue.tracks.toArray().slice(0, 10).map((t, i) => `${i + 1}. ${t.title} (${t.duration || '??:??'})`);
                const text = lines.length ? lines.join('\n') : 'No hay canciones en cola.';
                await interaction.reply({
                    embeds: [new EmbedBuilder().setColor(config.embedColor).setTitle('📋 Cola').setDescription(text)],
                    flags: 64
                }).catch(() => {});
                return;
            }
            case 'loop': {
                const mode = queue.repeatMode ?? QueueRepeatMode.OFF;
                const next = this._nextRepeatMode(mode);
                queue.setRepeatMode(next);
                const label = this._repeatModeLabel(next);
                await interaction.reply({ content: `🔁 Loop: ${label}`, flags: 64 }).catch(() => {});
                return;
            }
            case 'volume': {
                const modal = new ModalBuilder()
                    .setCustomId(`music_volume_modal_${interaction.guild.id}`)
                    .setTitle('Ajustar Volumen');

                const input = new TextInputBuilder()
                    .setCustomId('volume_input')
                    .setLabel(`Volumen (0-${config.musicMaxVolume})`)
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder(String(queue.node.volume ?? config.musicDefaultVolume));

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await interaction.showModal(modal).catch(() => {});
                return;
            }
            default:
                await interaction.reply({ content: `Acción no soportada: ${action}`, flags: 64 }).catch(() => {});
        }
    }

    async handleVolumeModalSubmit(interaction) {
        const queue = useQueue(interaction.guild.id);
        if (!queue || !queue.currentTrack) {
            await interaction.reply({ content: '❌ No hay música reproduciéndose.', flags: 64 }).catch(() => {});
            return;
        }

        const value = Number.parseInt(interaction.fields.getTextInputValue('volume_input') || '', 10);
        const maxVolume = config.musicMaxVolume || 85;
        if (!Number.isFinite(value) || value < 0 || value > maxVolume) {
            await interaction.reply({ content: `❌ Ingresa un valor entre 0 y ${maxVolume}.`, flags: 64 }).catch(() => {});
            return;
        }

        queue.node.setVolume(value);
        await interaction.reply({ content: `🔊 Volumen: ${value}%`, flags: 64 }).catch(() => {});
    }
}

module.exports = MusicSystem;


