const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { useQueue } = require('discord-player');
const config = require('../../config');
const { safeDeferReply, safeEditReply } = require('../../utils/interactions');
const { getLyrics, splitLyricsIntoLines } = require('../../utils/lyrics-service');

const UPDATE_INTERVAL_MS = 2500;
const VISIBLE_LINES_BEFORE = 2;
const VISIBLE_LINES_AFTER = 2;
const MAX_SESSION_MS = 10 * 60 * 1000;

function ensureSessionMap(client) {
    if (!client.karaokeSessions) client.karaokeSessions = new Map();
    return client.karaokeSessions;
}

function trackIdOf(track) {
    if (!track) return null;
    return (track.url || track.uri || `${track.title}::${track.author}`).toString();
}

function formatKaraokeEmbed(session) {
    const lines = session.lyricLines;
    const total = lines.length;
    const idx = Math.max(0, Math.min(total - 1, session.currentLine));

    const start = Math.max(0, idx - VISIBLE_LINES_BEFORE);
    const end = Math.min(total, idx + VISIBLE_LINES_AFTER + 1);

    const rendered = [];
    for (let i = start; i < end; i++) {
        const line = lines[i] || '\u200b';
        if (i < idx) rendered.push(`\u001b[2;37m${line}\u001b[0m`);
        else if (i === idx) rendered.push(`\u001b[1;2;37m➤ ${line}\u001b[0m`);
        else rendered.push(line);
    }

    const body = '```ansi\n' + rendered.join('\n') + '\n```';
    const progressBar = buildProgress(session);

    const trackTitle = session.trackTitle || 'Sin título';
    const trackArtist = session.trackArtist || '';
    const description = [
        `**${trackTitle}**${trackArtist ? ` — *${trackArtist}*` : ''}`,
        progressBar,
        body
    ].join('\n');

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🎤 Karaoke')
        .setDescription(description.substring(0, 4000))
        .setFooter({ text: `Línea ${idx + 1}/${total} · Fuente: ${session.source || 'letra'}` });

    if (session.thumbnail) embed.setThumbnail(session.thumbnail);
    return embed;
}

function buildProgress(session) {
    const total = session.lyricLines.length;
    if (!total) return '';
    const pct = Math.max(0, Math.min(1, (session.currentLine + 1) / total));
    const barLen = 20;
    const filled = Math.round(pct * barLen);
    const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barLen - filled));
    return `\`${bar}\` ${(pct * 100).toFixed(0)}%`;
}

function buildControls(guildId, disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`karaoke_back_${guildId}`)
            .setEmoji('⏪')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`karaoke_forward_${guildId}`)
            .setEmoji('⏩')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`karaoke_stop_${guildId}`)
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(disabled),
        new ButtonBuilder()
            .setCustomId(`karaoke_refresh_${guildId}`)
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(disabled)
    );
}

function computeLineIndex(session, queue) {
    const track = queue?.currentTrack;
    if (!track) return session.currentLine;
    const durationMs = Number(track.durationMS) || 0;
    const node = queue.node;
    const position = (node?.getTimestamp?.()?.current?.value
        || node?.streamTime
        || 0);

    if (!durationMs) return session.currentLine;
    const total = session.lyricLines.length;
    const pct = Math.max(0, Math.min(1, position / durationMs));
    return Math.max(0, Math.min(total - 1, Math.floor(pct * total)));
}

async function refreshSession(session) {
    const queue = useQueue(session.guildId);
    if (!queue || !queue.currentTrack) return stopSession(session, 'Cola vacía.');

    const track = queue.currentTrack;
    const id = trackIdOf(track);

    if (id !== session.trackId) {
        const nextLyrics = await getLyrics({
            title: track.title,
            artist: track.author
        }).catch(() => null);

        if (!nextLyrics?.lyrics) {
            return stopSession(session, 'No encontré letra para la nueva canción.');
        }

        session.trackId = id;
        session.trackTitle = track.title || 'Sin título';
        session.trackArtist = track.author || '';
        session.source = nextLyrics.source;
        session.thumbnail = nextLyrics.thumbnail || track.thumbnail;
        session.lyricLines = splitLyricsIntoLines(nextLyrics.lyrics);
        session.currentLine = 0;
    }

    if (!session.manualOffset) {
        session.currentLine = computeLineIndex(session, queue);
    }

    const embed = formatKaraokeEmbed(session);
    const components = [buildControls(session.guildId)];

    await session.message.edit({ embeds: [embed], components }).catch(() => {});
}

function stopSession(session, reason = 'Karaoke finalizado.') {
    if (!session) return;
    if (session.timer) {
        clearInterval(session.timer);
        session.timer = null;
    }

    const final = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🎤 Karaoke finalizado')
        .setDescription(reason);

    session.message?.edit({
        embeds: [final],
        components: [buildControls(session.guildId, true)]
    }).catch(() => {});

    const map = ensureSessionMap(session.client);
    map.delete(session.guildId);
}

async function startSession({ interaction, lyricsResult, lyricLines, track }) {
    const client = interaction.client;
    const sessionsMap = ensureSessionMap(client);

    const existing = sessionsMap.get(interaction.guild.id);
    if (existing) stopSession(existing, 'Se reinició el karaoke con la canción actual.');

    const session = {
        client,
        guildId: interaction.guild.id,
        channelId: interaction.channel.id,
        ownerId: interaction.user.id,
        trackId: trackIdOf(track),
        trackTitle: track.title || 'Sin título',
        trackArtist: track.author || '',
        source: lyricsResult.source,
        thumbnail: lyricsResult.thumbnail || track.thumbnail,
        lyricLines,
        currentLine: 0,
        manualOffset: false,
        startedAt: Date.now(),
        timer: null,
        message: null
    };

    const embed = formatKaraokeEmbed(session);
    const message = await safeEditReply(interaction, {
        embeds: [embed],
        components: [buildControls(session.guildId)]
    });
    session.message = message || await interaction.fetchReply().catch(() => null);

    if (!session.message) return;

    sessionsMap.set(session.guildId, session);

    session.timer = setInterval(() => {
        if (Date.now() - session.startedAt > MAX_SESSION_MS) {
            stopSession(session, 'Karaoke detenido por tiempo máximo de sesión.');
            return;
        }
        refreshSession(session).catch(() => {});
    }, UPDATE_INTERVAL_MS);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('karaoke')
        .setDescription('Modo karaoke: letra sincronizada (aprox.) en el chat con la canción actual.'),
    cooldown: 5,

    async execute(interaction) {
        await safeDeferReply(interaction);

        const queue = useQueue(interaction.guild.id);
        const track = queue?.currentTrack;
        if (!track) {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ Sin música')
                    .setDescription('Necesito una canción reproduciéndose para iniciar el karaoke.')]
            });
        }

        const lyricsResult = await getLyrics({
            title: track.title,
            artist: track.author
        }).catch(() => null);

        if (!lyricsResult?.lyrics) {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ Sin letra')
                    .setDescription(`No encontré letra para **${track.title}**${track.author ? ` — *${track.author}*` : ''}.`)]
            });
        }

        const lyricLines = splitLyricsIntoLines(lyricsResult.lyrics);
        if (!lyricLines.length) {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ Letra vacía')
                    .setDescription('La letra obtenida no tiene líneas útiles.')]
            });
        }

        return startSession({ interaction, lyricsResult, lyricLines, track });
    },

    async handleButton(interaction) {
        if (!interaction.isButton()) return false;
        if (!interaction.customId.startsWith('karaoke_')) return false;

        const parts = interaction.customId.split('_');
        const action = parts[1];
        const guildId = parts[2];
        const sessions = ensureSessionMap(interaction.client);
        const session = sessions.get(guildId);

        if (!session) {
            await interaction.reply({ content: 'No hay un karaoke activo. Ejecuta /karaoke.', flags: 64 }).catch(() => {});
            return true;
        }

        if (action === 'stop') {
            stopSession(session, 'Karaoke detenido manualmente.');
            await interaction.reply({ content: '⏹️ Karaoke detenido.', flags: 64 }).catch(() => {});
            return true;
        }

        if (action === 'back') {
            session.manualOffset = true;
            session.currentLine = Math.max(0, session.currentLine - 1);
            await refreshSession(session);
            await interaction.deferUpdate().catch(() => {});
            return true;
        }

        if (action === 'forward') {
            session.manualOffset = true;
            session.currentLine = Math.min(session.lyricLines.length - 1, session.currentLine + 1);
            await refreshSession(session);
            await interaction.deferUpdate().catch(() => {});
            return true;
        }

        if (action === 'refresh') {
            session.manualOffset = false;
            await refreshSession(session);
            await interaction.deferUpdate().catch(() => {});
            return true;
        }

        return false;
    }
};
