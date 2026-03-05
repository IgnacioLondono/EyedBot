const { ActivityType } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: 'clientReady',
    once: true,
    execute(client) {
        logger.info(`✅ Bot conectado como ${client.user.tag}`);
        logger.info(`📊 Servidores: ${client.guilds.cache.size}`);
        logger.info(`👥 Usuarios: ${client.users.cache.size}`);
        logger.info(`📝 Comandos cargados: ${client.commands.size}`);

        // Actividades rotativas
        const activities = [
            { name: `${client.guilds.cache.size} servidores`, type: ActivityType.Watching },
            { name: '!help para ayuda', type: ActivityType.Playing },
            { name: 'Música y Moderación', type: ActivityType.Listening }
        ];

        let i = 0;
        setInterval(() => {
            client.user.setActivity(activities[i]);
            i = (i + 1) % activities.length;
        }, 10000);
    }
};


