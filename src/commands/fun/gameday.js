const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { setInteractionFooter, translateText } = require('../../utils/fun-return');
const { fetchRandomGame, GENRE_LABEL_ES } = require('../../utils/game-api');

const GENRES = Object.entries(GENRE_LABEL_ES).map(([value, name]) => ({ name, value }));

function truncate(text, max = 380) {
    if (!text) return '';
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gameday')
        .setDescription('Recomienda un juego con portada, resumen y datos clave')
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
                .setDescription('Filtra por anio de lanzamiento (ej: 2024)')
                .setRequired(false)
                .setMinValue(1980)
                .setMaxValue(2100)
        ),
    cooldown: 4,

    async execute(interaction) {
        await interaction.deferReply();

        const categoria = interaction.options.getString('categoria');
        const anio = interaction.options.getInteger('anio');

        try {
            const game = await fetchRandomGame({
                genreValue: categoria || null,
                year: anio || null
            });

            if (!game) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('❌ Sin resultados')
                        .setDescription('No encontre juegos con esos filtros. Prueba otra categoria o quita el anio.')]
                });
            }

            const synopsisEs = truncate(await translateText(game.synopsis).catch(() => game.synopsis), 380);
            const genres = (game.genres || []).slice(0, 6).join(', ') || 'No especificado';
            const studios = (game.studios || []).slice(0, 3).join(', ') || 'No especificado';
            const platforms = (game.platforms || []).slice(0, 4).join(', ') || 'No especificado';
            const scoreLine = game.score != null ? `**${game.score}**/100 Metacritic` : 'Sin nota';

            const metaLines = [
                `**${game.year}** · ${game.status} · Nota ${scoreLine}`,
                `**Generos:** ${genres}`,
                `**Estudio:** ${studios}`,
                `**Plataformas:** ${platforms}`
            ].join('\n');

            const requester = interaction.user;
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setAuthor({
                    name: requester.displayName || requester.username,
                    iconURL: requester.displayAvatarURL({ extension: 'png', size: 128 })
                })
                .setTitle(`🎮 ${game.title}`)
                .setDescription(['**Sinopsis**', synopsisEs || 'Sin resumen disponible.', '', metaLines].join('\n'));

            if (game.coverUrl) embed.setImage(game.coverUrl);
            if (game.url) embed.setURL(game.url);
            setInteractionFooter(embed, requester.tag, null);

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error en gameday:', error?.message || error);
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error')
                    .setDescription('No pude obtener recomendacion de juego ahora mismo. Intenta de nuevo en unos segundos.')]
            });
        }
    }
};
