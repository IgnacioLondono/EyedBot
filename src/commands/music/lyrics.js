const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { useQueue } = require('../../utils/music-queue-manager');
const config = require('../../config');
const { safeDeferReply, safeEditReply } = require('../../utils/interactions');
const { getLyrics, chunkLyrics } = require('../../utils/lyrics-service');

function parseQuery(raw) {
    if (!raw) return { title: null, artist: null };
    const value = raw.toString().trim();
    if (!value) return { title: null, artist: null };

    const separators = [' - ', ' – ', ' — ', ' by '];
    for (const sep of separators) {
        const idx = value.toLowerCase().indexOf(sep.toLowerCase());
        if (idx > 0) {
            const left = value.slice(0, idx).trim();
            const right = value.slice(idx + sep.length).trim();
            if (left && right) {
                return { title: left, artist: right };
            }
        }
    }

    return { title: value, artist: null };
}

function buildLyricsEmbed(result, pageIndex, pages) {
    const footer = [
        `Fuente: ${result.source || 'desconocida'}`,
        pages.length > 1 ? `Página ${pageIndex + 1}/${pages.length}` : null
    ].filter(Boolean).join(' · ');

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`🎤 ${result.title || 'Letra'}`)
        .setDescription(pages[pageIndex] || '—')
        .setFooter({ text: footer });

    if (result.artist) embed.setAuthor({ name: result.artist });
    if (result.thumbnail) embed.setThumbnail(result.thumbnail);
    if (result.sourceUrl) embed.setURL(result.sourceUrl);
    return embed;
}

function buildPaginationRow(pageIndex, pageCount, userId, sessionId, disabled = false) {
    const row = new ActionRowBuilder();
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`lyrics_prev_${userId}_${sessionId}`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('⬅️')
            .setDisabled(disabled || pageIndex <= 0),
        new ButtonBuilder()
            .setCustomId(`lyrics_next_${userId}_${sessionId}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➡️')
            .setDisabled(disabled || pageIndex >= pageCount - 1)
    );
    return row;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Busca la letra de una canción (usa la canción actual si no das argumentos).')
        .addStringOption((option) =>
            option
                .setName('busqueda')
                .setDescription('"Canción - Artista" (opcional; si no, usa lo que está sonando)')
                .setRequired(false)
        ),
    cooldown: 4,

    async execute(interaction) {
        await safeDeferReply(interaction);

        let title = null;
        let artist = null;
        const query = interaction.options.getString('busqueda');

        if (query) {
            const parsed = parseQuery(query);
            title = parsed.title;
            artist = parsed.artist;
        } else {
            const queue = useQueue(interaction.guild.id);
            const track = queue?.currentTrack || null;
            if (!track) {
                return safeEditReply(interaction, {
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('❌ Sin canción activa')
                        .setDescription('No hay música reproduciéndose. Usa `/lyrics busqueda:"Canción - Artista"` o reproduce algo primero.')]
                });
            }
            title = track.title || null;
            artist = track.author || null;
        }

        if (!title) {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ Falta título')
                    .setDescription('Debes indicar al menos el título de la canción.')]
            });
        }

        const result = await getLyrics({ title, artist }).catch((error) => ({ error }));
        if (!result || result.error || !result.lyrics) {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ Sin letra')
                    .setDescription(`No encontré letra para **${title}**${artist ? ` — *${artist}*` : ''}.\nPrueba con "Canción - Artista" o revisa la ortografía.`)]
            });
        }

        const pages = chunkLyrics(result.lyrics, 1800);
        if (!pages.length) {
            return safeEditReply(interaction, {
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('❌ Letra vacía')
                    .setDescription('La letra encontrada está vacía.')]
            });
        }

        const sessionId = interaction.id;
        const session = {
            ownerId: interaction.user.id,
            pages,
            pageIndex: 0,
            result,
            createdAt: Date.now()
        };
        if (!interaction.client.lyricsSessions) interaction.client.lyricsSessions = new Map();
        interaction.client.lyricsSessions.set(sessionId, session);
        setTimeout(() => interaction.client.lyricsSessions?.delete?.(sessionId), 10 * 60 * 1000);

        const row = buildPaginationRow(0, pages.length, interaction.user.id, sessionId);
        return safeEditReply(interaction, {
            embeds: [buildLyricsEmbed(result, 0, pages)],
            components: pages.length > 1 ? [row] : []
        });
    },

    async handleButton(interaction) {
        if (!interaction.isButton()) return false;
        const parts = interaction.customId.split('_');
        if (parts[0] !== 'lyrics' || (parts[1] !== 'prev' && parts[1] !== 'next')) return false;
        const direction = parts[1];
        const userId = parts[2];
        const sessionId = parts.slice(3).join('_');

        if (userId !== interaction.user.id) {
            await interaction.reply({ content: 'Solo quien pidió la letra puede navegar.', flags: 64 }).catch(() => {});
            return true;
        }

        const session = interaction.client.lyricsSessions?.get(sessionId);
        if (!session) {
            await interaction.reply({ content: 'La sesión de letra expiró. Ejecuta /lyrics otra vez.', flags: 64 }).catch(() => {});
            return true;
        }

        if (direction === 'prev') session.pageIndex = Math.max(0, session.pageIndex - 1);
        else session.pageIndex = Math.min(session.pages.length - 1, session.pageIndex + 1);

        const row = buildPaginationRow(session.pageIndex, session.pages.length, session.ownerId, sessionId);
        await interaction.update({
            embeds: [buildLyricsEmbed(session.result, session.pageIndex, session.pages)],
            components: [row]
        }).catch(() => {});
        return true;
    }
};
