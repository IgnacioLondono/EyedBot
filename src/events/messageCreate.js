const config = require('../config');
const logger = require('../utils/logger');

module.exports = {
    name: 'messageCreate',
    execute(message) {
        // Ignorar bots y mensajes sin prefijo
        if (message.author.bot || !message.content.startsWith(config.prefix)) return;

        const args = message.content.slice(config.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Sistema de comandos legacy (opcional)
        // Puedes mantener esto para compatibilidad o eliminarlo si solo usas slash commands
    }
};