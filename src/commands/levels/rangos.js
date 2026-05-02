const { SlashCommandBuilder } = require('discord.js');
const { runRangos } = require('./leveling-shared');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rangos')
        .setDescription('Lista los rangos Eyed del sistema de niveles y la descripción de cada uno.'),
    cooldown: 4,
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'Este comando solo se puede usar dentro de un servidor.',
                flags: 64
            });
        }
        return runRangos(interaction);
    }
};
