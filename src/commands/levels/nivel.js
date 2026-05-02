const { SlashCommandBuilder } = require('discord.js');
const { runNivelSelf } = require('./leveling-shared');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nivel')
        .setDescription('Consulta tu progreso de nivel o el de otro usuario (XP, ranking, roles).')
        .addUserOption((opt) =>
            opt
                .setName('usuario')
                .setDescription('Miembro a consultar (si no eliges a nadie, se muestra el tuyo)')
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
        return runNivelSelf(interaction);
    }
};
