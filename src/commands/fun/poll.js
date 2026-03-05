const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Crea una encuesta')
        .addStringOption(option =>
            option.setName('pregunta')
                .setDescription('Pregunta de la encuesta')
                .setRequired(true)),
    cooldown: 5,
    async execute(interaction) {
        const question = interaction.options.getString('pregunta');

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('📊 Encuesta')
            .setDescription(question)
            .setFooter({ text: `Creada por ${interaction.user.tag}` })
            .setTimestamp();

        const message = await interaction.reply({ embeds: [embed], fetchReply: true });
        await message.react('✅');
        await message.react('❌');
    }
};













