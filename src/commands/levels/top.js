const { SlashCommandBuilder } = require('discord.js');
const { runTop } = require('./leveling-shared');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('top')
        .setDescription('Ranking público del servidor por XP, mensajes o minutos en voz')
        .addStringOption((opt) =>
            opt
                .setName('orden')
                .setDescription('Criterio de clasificación')
                .setRequired(false)
                .addChoices(
                    { name: 'XP total', value: 'xp' },
                    { name: 'Mensajes', value: 'mensajes' },
                    { name: 'Tiempo en voz', value: 'voz' }
                )
        )
        .addIntegerOption((opt) =>
            opt
                .setName('cantidad')
                .setDescription('Cantidad de puestos (5 a 25)')
                .setMinValue(5)
                .setMaxValue(25)
                .setRequired(false)
        ),
    cooldown: 4,
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'Este comando solo se puede usar dentro de un servidor.',
                flags: 64
            });
        }
        return runTop(interaction);
    }
};
