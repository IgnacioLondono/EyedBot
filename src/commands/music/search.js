const { SlashCommandBuilder } = require('discord.js');
const play = require('./play');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Busca canciones y elige una para reproducir')
        .addStringOption((option) =>
            option
                .setName('input')
                .setDescription('Termino de busqueda')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    cooldown: 2,

    async autocomplete(interaction) {
        return play.autocomplete(interaction);
    },

    async execute(interaction) {
        return play.execute(interaction);
    }
};
