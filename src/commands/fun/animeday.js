const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

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

function cleanSynopsis(text) {
    if (!text) return 'Sin resumen disponible.';
    return text
        .replace(/\[Written by MAL Rewrite\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function truncate(text, max = 700) {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

async function translateToSpanish(text) {
    if (!text) return 'Sin resumen disponible.';

    try {
        const limited = text.slice(0, 850);
        const response = await axios.get('https://api.mymemory.translated.net/get', {
            timeout: 10000,
            params: {
                q: limited,
                langpair: 'en|es'
            }
        });

        const translated = response?.data?.responseData?.translatedText;
        if (!translated) return text;
        return translated;
    } catch {
        return text;
    }
}

function pickRandom(items) {
    if (!Array.isArray(items) || !items.length) return null;
    return items[Math.floor(Math.random() * items.length)];
}

function seasonLabel(value) {
    const match = SEASONS.find((s) => s.value === value);
    return match ? match.name : 'No especificada';
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
            let animes = [];

            if (temporada && anio) {
                const { data } = await axios.get(`https://api.jikan.moe/v4/seasons/${anio}/${temporada}`, {
                    timeout: 12000,
                    params: { sfw: true, limit: 25 }
                });
                animes = data?.data || [];
            } else {
                const { data } = await axios.get('https://api.jikan.moe/v4/anime', {
                    timeout: 12000,
                    params: {
                        sfw: true,
                        limit: 25,
                        min_score: 6,
                        order_by: 'score',
                        sort: 'desc',
                        genres: genreMatch?.id || undefined,
                        start_date: anio ? `${anio}-01-01` : undefined,
                        end_date: anio ? `${anio}-12-31` : undefined
                    }
                });
                animes = data?.data || [];
            }

            if (genreMatch && animes.length) {
                animes = animes.filter((a) => (a.genres || []).some((g) => g.mal_id === genreMatch.id));
            }

            if (!animes.length) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('❌ Sin resultados')
                        .setDescription('No encontre animes con esos filtros. Prueba otra categoria o quita temporada/anio.')]
                });
            }

            const anime = pickRandom(animes);
            const synopsisRaw = cleanSynopsis(anime?.synopsis);
            const synopsisEs = truncate(await translateToSpanish(synopsisRaw), 750);

            const title = anime?.title_spanish || anime?.title || anime?.title_english || 'Anime recomendado';
            const image = anime?.images?.jpg?.large_image_url || anime?.images?.webp?.large_image_url || null;
            const genres = (anime?.genres || []).map((g) => g.name).slice(0, 4).join(', ') || 'No especificado';
            const studios = (anime?.studios || []).map((s) => s.name).slice(0, 3).join(', ') || 'No especificado';
            const year = anime?.year || anime?.aired?.prop?.from?.year || 'No definido';
            const season = seasonLabel(anime?.season);

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(`🎌 AnimeDay: ${title}`)
                .setDescription(synopsisEs || 'Sin resumen disponible.')
                .addFields(
                    { name: '📚 Categoria', value: genres, inline: false },
                    { name: '📅 Anio', value: `${year}`, inline: true },
                    { name: '🍂 Temporada', value: season, inline: true },
                    { name: '🎞️ Episodios', value: `${anime?.episodes || 'Desconocido'}`, inline: true },
                    { name: '📊 Puntuacion', value: `${anime?.score || 'N/A'}`, inline: true },
                    { name: '📡 Estado', value: anime?.status || 'No definido', inline: true },
                    { name: '🏢 Estudio', value: studios, inline: false }
                )
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

            if (anime?.url) embed.setURL(anime.url);
            if (image) embed.setImage(image);

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
