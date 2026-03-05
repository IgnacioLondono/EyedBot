const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token) {
    console.error('❌ Falta DISCORD_TOKEN en .env');
    process.exit(1);
}
if (!clientId) {
    console.error('❌ Falta CLIENT_ID en .env');
    process.exit(1);
}
if (!guildId) {
    console.error('❌ Falta GUILD_ID en .env');
    process.exit(1);
}

const commands = [];
const byName = new Map();
const commandsPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(commandsPath);

for (const folder of commandFolders) {
    const folderPath = path.join(commandsPath, folder);
    const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);
        if (!('data' in command && 'execute' in command)) continue;

        // Evita registrar nombres duplicados por accidente.
        byName.set(command.data.name, command.data.toJSON());
    }
}

commands.push(...byName.values());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        console.log(`🔄 Registrando ${commands.length} comandos en guild ${guildId}...`);
        const guildData = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );
        console.log(`✅ Guild actualizado: ${guildData.length} comandos.`);

        // Limpia globales para evitar "duplicados" por scope.
        const cleared = await rest.put(
            Routes.applicationCommands(clientId),
            { body: [] }
        );
        console.log(`🧹 Comandos globales limpiados: ${cleared.length}.`);
    } catch (error) {
        if (error?.status === 401) {
            console.error('❌ 401 Unauthorized: token invalido o regenerado.');
        }
        console.error('❌ Error al registrar comandos:', error);
        process.exit(1);
    }
})();
