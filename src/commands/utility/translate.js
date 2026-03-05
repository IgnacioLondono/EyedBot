const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

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
            // Usando una API de traducción gratuita
            const response = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${lang}`);
            const translated = response.data.responseData.translatedText;

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('🌐 Traducción')
                .addFields(
                    { name: 'Original', value: text, inline: false },
                    { name: 'Traducido', value: translated, inline: false }
                )
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

            return interaction.reply({ embeds: [embed] });
        } catch (error) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo traducir el texto.')],
                flags: 64
            });
        }
    }
};






