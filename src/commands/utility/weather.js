const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weather')
        .setDescription('Muestra el clima de una ciudad')
        .addStringOption(option =>
            option.setName('ciudad')
                .setDescription('Nombre de la ciudad')
                .setRequired(true)),
    cooldown: 5,
    async execute(interaction) {
        const city = interaction.options.getString('ciudad');
        
        // Hacer deferReply inmediatamente para evitar que expire la interacción
        await interaction.deferReply();

        try {
            const response = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
                timeout: 10000
            });
            const data = response.data;

            if (!data || !data.current_condition || !data.current_condition[0]) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener el clima. Verifica el nombre de la ciudad.')]
                });
            }

            const current = data.current_condition[0];
            const location = data.nearest_area?.[0];

            if (!location) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener la ubicación. Verifica el nombre de la ciudad.')]
                });
            }

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle(`🌤️ Clima en ${location.areaName?.[0]?.value || city}`)
                .addFields(
                    { name: 'Temperatura', value: `${current.temp_C || 'N/A'}°C`, inline: true },
                    { name: 'Sensación', value: `${current.FeelsLikeC || 'N/A'}°C`, inline: true },
                    { name: 'Humedad', value: `${current.humidity || 'N/A'}%`, inline: true },
                    { name: 'Condición', value: current.weatherDesc?.[0]?.value || 'Desconocido', inline: false },
                    { name: 'Viento', value: `${current.windspeedKmph || 'N/A'} km/h`, inline: true }
                )
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error en weather:', error);
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener el clima. Verifica el nombre de la ciudad.')]
            });
        }
    }
};


