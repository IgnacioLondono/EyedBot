const { SlashCommandBuilder } = require('discord.js');
const { runNivelSelf } = require('./leveling-shared');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nivel')
        .setDescription('Ver tu nivel, XP, ranking y roles del sistema (solo tú ves la respuesta)'),
    cooldown: 4,
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'Este comando solo se puede usar dentro de un servidor.',
                flags: 64
            });
        }
        return runNivelSelf(interaction);
    }
};
