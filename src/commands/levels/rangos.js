const { SlashCommandBuilder } = require('discord.js');
const { runRangos } = require('./leveling-shared');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rangos')
        .setDescription('Roles de nivel del panel; si no hay ninguno, referencia Eyed por nivel.')
        .setDefaultMemberPermissions(0n),
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
