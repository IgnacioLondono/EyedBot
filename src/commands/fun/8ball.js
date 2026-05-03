const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');

const responses = [
    'Sí, definitivamente',
    'Es cierto',
    'Sin duda',
    'Sí, definitivamente',
    'Puedes confiar en ello',
    'Como yo lo veo, sí',
    'Lo más probable',
    'Buen pronóstico',
    'Sí',
    'Las señales apuntan a que sí',
    'Respuesta confusa, intenta de nuevo',
    'Pregunta más tarde',
    'Mejor no decirte ahora',
    'No puedo predecir ahora',
    'Concéntrate y pregunta de nuevo',
    'No cuentes con ello',
    'Mi respuesta es no',
    'Mis fuentes dicen que no',
    'El pronóstico no es tan bueno',
    'Muy dudoso'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Haz una pregunta al 8ball')
        .addStringOption(option =>
            option.setName('pregunta')
                .setDescription('Tu pregunta')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        const question = interaction.options.getString('pregunta');
        const answer = responses[Math.floor(Math.random() * responses.length)];

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🎱 8 Ball')
            .addFields(
                { name: 'Pregunta', value: question, inline: false },
                { name: 'Respuesta', value: answer, inline: false }
            );

        setInteractionFooter(embed, interaction.user.tag);

        return interaction.reply({ embeds: [embed] });
    }
};













