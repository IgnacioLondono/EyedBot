const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('urban')
        .setDescription('Busca una definición en Urban Dictionary')
        .addStringOption(option =>
            option.setName('termino')
                .setDescription('Término a buscar')
                .setRequired(true)),
    cooldown: 5,
    async execute(interaction) {
        await interaction.deferReply();

        const term = interaction.options.getString('termino');

        try {
            const response = await axios.get(`https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`);
            const definitions = response.data.list;

            if (!definitions || definitions.length === 0) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se encontró ninguna definición.')]
                });
            }

            const definition = definitions[0];

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(`📖 ${definition.word}`)
                .setDescription(definition.definition.substring(0, 2000))
                .addFields(
                    { name: 'Ejemplo', value: definition.example.substring(0, 1024) || 'N/A', inline: false },
                    { name: '👍', value: definition.thumbs_up.toString(), inline: true },
                    { name: '👎', value: definition.thumbs_down.toString(), inline: true }
                )
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
                .setURL(definition.permalink);

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo buscar la definición.')]
            });
        }
    }
};













