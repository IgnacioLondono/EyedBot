const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

const emojiMap = {
    'a': '🇦', 'b': '🇧', 'c': '🇨', 'd': '🇩', 'e': '🇪', 'f': '🇫',
    'g': '🇬', 'h': '🇭', 'i': '🇮', 'j': '🇯', 'k': '🇰', 'l': '🇱',
    'm': '🇲', 'n': '🇳', 'o': '🇴', 'p': '🇵', 'q': '🇶', 'r': '🇷',
    's': '🇸', 't': '🇹', 'u': '🇺', 'v': '🇻', 'w': '🇼', 'x': '🇽',
    'y': '🇾', 'z': '🇿', '0': '0️⃣', '1': '1️⃣', '2': '2️⃣', '3': '3️⃣',
    '4': '4️⃣', '5': '5️⃣', '6': '6️⃣', '7': '7️⃣', '8': '8️⃣', '9': '9️⃣'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('emojify')
        .setDescription('Convierte texto a emojis')
        .addStringOption(option =>
            option.setName('texto')
                .setDescription('Texto a convertir')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        const text = interaction.options.getString('texto').toLowerCase();
        let emojified = '';

        for (const char of text) {
            if (emojiMap[char]) {
                emojified += emojiMap[char] + ' ';
            } else if (char === ' ') {
                emojified += '   ';
            }
        }

        if (!emojified) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo convertir el texto.')],
                flags: 64
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('✨ Texto Emojificado')
            .setDescription(emojified)
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed] });
    }
};






