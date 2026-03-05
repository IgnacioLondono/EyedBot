const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ascii')
        .setDescription('Convierte texto a ASCII art')
        .addStringOption(option =>
            option.setName('texto')
                .setDescription('Texto a convertir (máximo 10 caracteres)')
                .setRequired(true)),
    cooldown: 5,
    async execute(interaction) {
        const text = interaction.options.getString('texto').substring(0, 10).toUpperCase();

        // ASCII art simple
        const asciiMap = {
            'A': '  ██  \n ████ \n██  ██\n██████\n██  ██\n██  ██',
            'B': '████  \n██  ██\n████  \n██  ██\n████  ',
            'C': ' ████ \n██    \n██    \n██    \n ████ ',
            'D': '████  \n██  ██\n██  ██\n██  ██\n████  ',
            'E': '██████\n██    \n████  \n██    \n██████',
            'F': '██████\n██    \n████  \n██    \n██    ',
            'G': ' ████ \n██    \n██  ██\n██  ██\n ████ ',
            'H': '██  ██\n██  ██\n██████\n██  ██\n██  ██',
            'I': '██████\n  ██  \n  ██  \n  ██  \n██████',
            'J': '██████\n    ██\n    ██\n██  ██\n ████ ',
            'K': '██  ██\n██ ██ \n████  \n██ ██ \n██  ██',
            'L': '██    \n██    \n██    \n██    \n██████',
            'M': '██  ██\n██████\n██  ██\n██  ██\n██  ██',
            'N': '██  ██\n██████\n██████\n██ ███\n██  ██',
            'O': ' ████ \n██  ██\n██  ██\n██  ██\n ████ ',
            'P': '████  \n██  ██\n████  \n██    \n██    ',
            'Q': ' ████ \n██  ██\n██  ██\n██ ██ \n ████ ',
            'R': '████  \n██  ██\n████  \n██ ██ \n██  ██',
            'S': ' ████ \n██    \n ████ \n    ██\n ████ ',
            'T': '██████\n  ██  \n  ██  \n  ██  \n  ██  ',
            'U': '██  ██\n██  ██\n██  ██\n██  ██\n ████ ',
            'V': '██  ██\n██  ██\n██  ██\n ████ \n  ██  ',
            'W': '██  ██\n██  ██\n██  ██\n██████\n██  ██',
            'X': '██  ██\n ████ \n  ██  \n ████ \n██  ██',
            'Y': '██  ██\n ████ \n  ██  \n  ██  \n  ██  ',
            'Z': '██████\n   ██ \n  ██  \n ██   \n██████',
            '0': ' ████ \n██  ██\n██  ██\n██  ██\n ████ ',
            '1': '  ██  \n ███  \n  ██  \n  ██  \n██████',
            '2': ' ████ \n    ██\n ████ \n██    \n██████',
            '3': ' ████ \n    ██\n ████ \n    ██\n ████ ',
            '4': '██  ██\n██  ██\n██████\n    ██\n    ██',
            '5': '██████\n██    \n██████\n    ██\n██████',
            '6': ' ████ \n██    \n██████\n██  ██\n ████ ',
            '7': '██████\n    ██\n   ██ \n  ██  \n ██   ',
            '8': ' ████ \n██  ██\n ████ \n██  ██\n ████ ',
            '9': ' ████ \n██  ██\n █████\n    ██\n ████ '
        };

        let ascii = '';
        for (const char of text) {
            if (asciiMap[char]) {
                ascii += asciiMap[char] + '\n\n';
            } else {
                ascii += char + '\n\n';
            }
        }

        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('ASCII Art')
                .setDescription(`\`\`\`\n${ascii}\`\`\``)
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` })]
        });
    }
};













