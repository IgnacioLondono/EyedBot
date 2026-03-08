const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

const decodeHtml = (text = '') => {
    return text
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
};

const difficultyLabels = {
    easy: 'Facil',
    medium: 'Media',
    hard: 'Dificil'
};

async function translateToSpanish(text) {
    if (!text || typeof text !== 'string') return text;

    const looksLikeTranslationError = (value) => {
        if (!value || typeof value !== 'string') return true;
        const normalized = value.toLowerCase();
        return normalized.includes('invalid source language')
            || normalized.includes('example: langpair=')
            || normalized.includes('translated.net');
    };

    try {
        const response = await axios.get(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|es`
        );
        const translated = response?.data?.responseData?.translatedText;
        if (!translated || looksLikeTranslationError(translated)) {
            return text;
        }

        return decodeHtml(translated);
    } catch {
        return text;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trivia')
        .setDescription('Juega una trivia')
        .addStringOption(option =>
            option.setName('dificultad')
                .setDescription('Dificultad')
                .addChoices(
                    { name: 'Fácil', value: 'easy' },
                    { name: 'Medio', value: 'medium' },
                    { name: 'Difícil', value: 'hard' }
                )
                .setRequired(false)),
    cooldown: 5,
    async execute(interaction) {
        await interaction.deferReply();

        const difficulty = interaction.options.getString('dificultad') || 'medium';

        try {
            const response = await axios.get(`https://opentdb.com/api.php?amount=1&difficulty=${difficulty}&type=multiple`);
            const question = response.data.results[0];

            const decodedQuestion = decodeHtml(question.question);
            const decodedCategory = decodeHtml(question.category);
            const decodedIncorrect = question.incorrect_answers.map(decodeHtml);
            const decodedCorrect = decodeHtml(question.correct_answer);
            const shuffledAnswers = [...decodedIncorrect, decodedCorrect].sort(() => Math.random() - 0.5);
            const correctIndex = shuffledAnswers.indexOf(decodedCorrect);

            const translatedPayload = await Promise.all([
                translateToSpanish(decodedQuestion),
                translateToSpanish(decodedCategory),
                ...shuffledAnswers.map((answer) => translateToSpanish(answer))
            ]);

            const translatedQuestion = translatedPayload[0] || decodedQuestion;
            const translatedCategory = translatedPayload[1] || decodedCategory;
            const translatedAnswers = translatedPayload.slice(2).map((answer, index) => answer || shuffledAnswers[index]);
            const translatedCorrect = translatedAnswers[correctIndex] || decodedCorrect;
            
            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('❓ Trivia')
                .setDescription(translatedQuestion)
                .addFields(
                    { name: 'Categoria', value: translatedCategory, inline: true },
                    { name: 'Dificultad', value: difficultyLabels[question.difficulty] || question.difficulty, inline: true }
                )
                .setFooter({ text: 'Tienes 30 segundos para responder' });

            // Limpiar las respuestas para los botones (máximo 80 caracteres)
            const cleanAnswers = translatedAnswers.map((answer) => answer.substring(0, 80));
            
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('trivia_0').setLabel(cleanAnswers[0] || 'Opción 1').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('trivia_1').setLabel(cleanAnswers[1] || 'Opción 2').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('trivia_2').setLabel(cleanAnswers[2] || 'Opción 3').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('trivia_3').setLabel(cleanAnswers[3] || 'Opción 4').setStyle(ButtonStyle.Primary)
                );

            await interaction.editReply({ embeds: [embed], components: [row] });

            // Guardar respuesta correcta temporalmente (decodificada)
            interaction.client.triviaAnswers = interaction.client.triviaAnswers || {};
            interaction.client.triviaAnswers[interaction.id] = {
                correct: translatedCorrect,
                answers: translatedAnswers,
                correctIndex
            };

            setTimeout(() => {
                delete interaction.client.triviaAnswers[interaction.id];
            }, 30000);
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener la pregunta.')]
            });
        }
    }
};













