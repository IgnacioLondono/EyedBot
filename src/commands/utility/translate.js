const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { setInteractionFooter, translateText } = require('../../utils/fun-return');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('translate')
        .setDescription('Traduce texto')
        .addStringOption(option =>
            option.setName('texto')
                .setDescription('Texto a traducir')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('idioma')
                .setDescription('Idioma de destino (código ISO, ej: es, en, fr)')
                .setRequired(true)),
    cooldown: 5,
    async execute(interaction) {
        const text = interaction.options.getString('texto');
        const lang = interaction.options.getString('idioma');

        try {
            const translated = await translateText(text, `auto|${lang}`);

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🌐 Traducción')
                .addFields(
                    { name: 'Original', value: text, inline: false },
                    { name: 'Traducido', value: translated, inline: false }
                );

            setInteractionFooter(embed, interaction.user.tag);

            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo traducir el texto.')],
                flags: 64
            });
        }
    }
};






