const { SlashCommandBuilder } = require('discord.js');
const { startRps, startDoors, startColor } = require('../../utils/economy-minigames');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('minijuego')
        .setDescription('Minijuegos con botones y recompensas de monedas')
        .addSubcommand((sub) =>
            sub.setName('rps')
                .setDescription('Piedra, papel o tijera contra el bot'))
        .addSubcommand((sub) =>
            sub.setName('puertas')
                .setDescription('Elige una puerta mística'))
        .addSubcommand((sub) =>
            sub.setName('colores')
                .setDescription('Adivina el cristal correcto del orbe')),
    cooldown: 3,
    async execute(interaction) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'rps') return startRps(interaction);
        if (sub === 'puertas') return startDoors(interaction);
        if (sub === 'colores') return startColor(interaction);
        return interaction.reply({ content: 'Minijuego no disponible.', flags: 64 });
    }
};
