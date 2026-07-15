const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { setInteractionFooter, translateText } = require('../../utils/fun-return');
const { fetchRandomAnime } = require('../../utils/anime-api');

const GENRES = [
    { name: 'Accion', value: 'accion', id: 1 },
    { name: 'Aventura', value: 'aventura', id: 2 },
    { name: 'Comedia', value: 'comedia', id: 4 },
    { name: 'Drama', value: 'drama', id: 8 },
    { name: 'Fantasia', value: 'fantasia', id: 10 },
    { name: 'Terror', value: 'terror', id: 14 },
    { name: 'Romance', value: 'romance', id: 22 },
    { name: 'Ciencia Ficcion', value: 'ciencia_ficcion', id: 24 },
    { name: 'Misterio', value: 'misterio', id: 7 },
    { name: 'Deportes', value: 'deportes', id: 30 },
    { name: 'Vida Cotidiana', value: 'vida_cotidiana', id: 36 },
    { name: 'Sobrenatural', value: 'sobrenatural', id: 37 }
];

const SEASONS = [
    { name: 'Invierno', value: 'winter' },
    { name: 'Primavera', value: 'spring' },
    { name: 'Verano', value: 'summer' },
    { name: 'Otono', value: 'fall' }
];

function truncate(text, max = 380) {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function seasonLabel(value) {
    if (!value) return 'No especificada';
    const key = String(value).toLowerCase();
    const match = SEASONS.find((s) => s.value === key || s.value.toUpperCase() === String(value).toUpperCase());
    if (match) return match.name;
    const map = { WINTER: 'Invierno', SPRING: 'Primavera', SUMMER: 'Verano', FALL: 'Otono' };
    return map[String(value).toUpperCase()] || 'No especificada';
}

function statusEs(status) {
    const map = {
        FINISHED: 'Finalizado',
        RELEASING: 'En emision',
        NOT_YET_RELEASED: 'Proximamente',
        CANCELLED: 'Cancelado',
        HIATUS: 'En pausa',
        'Finished Airing': 'Finalizado',
        'Currently Airing': 'En emision',
        'Not yet aired': 'Proximamente'
    };
    return map[status] || status || 'No definido';
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animeday')
        .setDescription('Recomienda un anime con portada, resumen y datos clave')
        .addStringOption((option) =>
            option
                .setName('categoria')
                .setDescription('Filtra por categoria')
                .setRequired(false)
                .addChoices(...GENRES.map((g) => ({ name: g.name, value: g.value })))
        )
        .addIntegerOption((option) =>
            option
                .setName('anio')
                .setDescription('Filtra por anio (ej: 2024)')
                .setRequired(false)
                .setMinValue(1960)
                .setMaxValue(2100)
        )
        .addStringOption((option) =>
            option
                .setName('temporada')
                .setDescription('Filtra por temporada de estreno')
                .setRequired(false)
                .addChoices(...SEASONS)
        ),
    cooldown: 4,

    async execute(interaction) {
        await interaction.deferReply();

        const categoria = interaction.options.getString('categoria');
        const anio = interaction.options.getInteger('anio');
        const temporada = interaction.options.getString('temporada');
        const genreMatch = GENRES.find((g) => g.value === categoria) || null;

        if (temporada && !anio) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Filtro incompleto')
                    .setDescription('Si usas `temporada`, tambien debes indicar `anio`.')]
            });
        }

        try {
            const anime = await fetchRandomAnime({
                genreValue: categoria || null,
                genreId: genreMatch?.id || null,
                year: anio || null,
                season: temporada || null
            });

            if (!anime) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('❌ Sin resultados')
                        .setDescription('No encontre animes con esos filtros. Prueba otra categoria o quita temporada/anio.')]
                });
            }

            const synopsisEs = truncate(await translateText(anime.synopsis).catch(() => anime.synopsis), 380);
            const genres = (anime.genres || []).slice(0, 6).join(', ') || 'No especificado';
            const studios = (anime.studios || []).slice(0, 3).join(', ') || 'No especificado';
            const scoreLine = anime.score != null ? `**${anime.score}**/10` : 'Sin nota';

            const metaLines = [
                `**${anime.year}** · ${seasonLabel(anime.season)} · **${anime.episodes}** eps · Nota ${scoreLine} · ${statusEs(anime.status)}`,
                `**Generos:** ${genres}`,
                `**Estudio:** ${studios}${anime.duration ? ` · ${anime.duration}` : ''}`
            ].join('\n');

            const requester = interaction.user;
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setAuthor({
                    name: requester.displayName || requester.username,
                    iconURL: requester.displayAvatarURL({ extension: 'png', size: 128 })
                })
                .setTitle(`🎌 ${anime.title}`)
                .setDescription(['**Sinopsis**', synopsisEs || 'Sin resumen disponible.', '', metaLines].join('\n'));

            if (anime.coverUrl) embed.setImage(anime.coverUrl);
            if (anime.url) embed.setURL(anime.url);
            setInteractionFooter(embed, requester.tag, null);

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error en animeday:', error?.message || error);
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('No pude obtener recomendacion de anime ahora mismo. Intenta de nuevo en unos segundos.')]
            });
        }
    }
};
