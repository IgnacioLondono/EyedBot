const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('color')
        .setDescription('Muestra información de un color')
        .addStringOption(option =>
            option.setName('hex')
                .setDescription('Código hexadecimal del color (ej: #FF5733)')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        let hex = interaction.options.getString('hex').replace('#', '');
        
        if (!/^[0-9A-F]{6}$/i.test(hex)) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('Formato inválido. Usa formato hexadecimal (ej: #FF5733)')],
                flags: 64
            });
        }

        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const color = parseInt(hex, 16);

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(`Color #${hex.toUpperCase()}`)
            .addFields(
                { name: 'RGB', value: `rgb(${r}, ${g}, ${b})`, inline: true },
                { name: 'HEX', value: `#${hex.toUpperCase()}`, inline: true },
                { name: 'Decimal', value: color.toString(), inline: true }
            )
            .setImage(`https://api.color.pizza/v1/${hex}`)
            .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

        return interaction.reply({ embeds: [embed] });
    }
};






