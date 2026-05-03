const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const os = require('os');
const { setInteractionFooter } = require('../../utils/fun-return');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Muestra estadísticas del bot'),
    cooldown: 5,
    async execute(interaction) {
        const client = interaction.client;
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('📊 Estadísticas del Bot')
            .addFields(
                { name: 'Servidores', value: client.guilds.cache.size.toString(), inline: true },
                { name: 'Usuarios', value: client.users.cache.size.toString(), inline: true },
                { name: 'Canales', value: client.channels.cache.size.toString(), inline: true },
                { name: 'Comandos', value: client.commands.size.toString(), inline: true },
                { name: 'Uptime', value: `${days}d ${hours}h ${minutes}m`, inline: true },
                { name: 'Memoria', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
                { name: 'Node.js', value: process.version, inline: true },
                { name: 'Discord.js', value: require('discord.js').version, inline: true },
                { name: 'Plataforma', value: os.platform(), inline: true }
            )
            .setTimestamp();

        setInteractionFooter(embed, interaction.user.tag);

        return interaction.reply({ embeds: [embed] });
    }
};













