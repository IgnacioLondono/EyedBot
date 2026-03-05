const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('choose')
        .setDescription('Elige entre opciones')
        .addStringOption(option =>
            option.setName('opciones')
                .setDescription('Opciones separadas por coma (ej: pizza, hamburguesa)')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        const optionsString = interaction.options.getString('opciones');
        const options = optionsString.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);

        if (options.length < 2) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('Debes proporcionar al menos 2 opciones separadas por coma.')],
                flags: 64
            });
        }

        const chosen = options[Math.floor(Math.random() * options.length)];

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🎯 Elección')
            .setDescription(`Elegí: **${chosen}**\n\nOpciones: ${options.join(', ')}`)
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed] });
    }
};






