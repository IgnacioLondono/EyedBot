const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { setInteractionFooter } = require('../../utils/fun-return');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Muestra el avatar de un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario (por defecto tú)')
                .setRequired(false)),
    cooldown: 3,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario') || interaction.user;

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`Avatar de ${user.tag}`)
            .setImage(user.displayAvatarURL({ dynamic: true, size: 512 }));

        setInteractionFooter(embed, interaction.user.tag);

        return interaction.reply({ embeds: [embed] });
    }
};













