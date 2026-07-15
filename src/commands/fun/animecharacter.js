const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');
const { fetchRandomCharacter, roleLabelEs } = require('../../utils/anime-api');

function typeLabel(type) {
    switch (type) {
        case 'protagonista':
            return 'Protagonista';
        case 'secundario':
            return 'Secundario';
        case 'villano':
            return 'Villano';
        default:
            return 'Cualquiera';
    }
}

function pickTrait(about) {
    const clean = String(about || '').replace(/\s+/g, ' ').trim();
    if (!clean) return 'Personaje unico con una vibra muy marcada.';
    return clean.length > 220 ? `${clean.slice(0, 217)}...` : clean;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('animecharacter')
        .setDescription('Descubre que personaje de anime eres')
        .addStringOption((option) =>
            option
                .setName('anime')
                .setDescription('Nombre del anime para filtrar personajes (ej: naruto)')
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('tipo')
                .setDescription('El tipo de personaje que quieres obtener')
                .setRequired(false)
                .addChoices(
                    { name: 'Protagonista', value: 'protagonista' },
                    { name: 'Secundario', value: 'secundario' },
                    { name: 'Villano', value: 'villano' },
                    { name: 'Cualquiera', value: 'cualquiera' }
                )
        ),
    cooldown: 3,

    async execute(interaction) {
        await interaction.deferReply();

        const animeFilter = interaction.options.getString('anime');
        const type = interaction.options.getString('tipo') || 'cualquiera';

        try {
            const result = await fetchRandomCharacter({
                animeName: animeFilter || null,
                type
            });

            if (!result?.name) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('⚠️ Sin resultados')
                            .setDescription('No encontre personajes con ese filtro. Prueba con otro anime o tipo.')
                    ]
                });
            }

            const requester = interaction.user;
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setAuthor({
                    name: requester.displayName || requester.username,
                    iconURL: requester.displayAvatarURL({ extension: 'png', size: 128 })
                })
                .setTitle(`🎭 ${result.name}`)
                .setDescription('**Anime Character**')
                .addFields(
                    { name: 'Tipo de salida', value: typeLabel(type), inline: true },
                    { name: 'Rol en la obra', value: roleLabelEs(result.role), inline: true },
                    { name: 'Biografia', value: pickTrait(result.about), inline: false }
                );

            if (result.imageUrl) embed.setThumbnail(result.imageUrl);
            if (result.url) embed.setURL(result.url);
            setInteractionFooter(embed, requester.tag, result.animeName);

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error en animecharacter:', error?.message || error);
            return interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('No pude buscar personajes ahora mismo. Intenta de nuevo en unos segundos.')
                ]
            });
        }
    }
};
