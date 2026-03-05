const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Player } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const MusicSystem = require('./cogs/music');
const { safeReply, isUnknownInteractionError } = require('./utils/interactions');
const { handleReturnInteraction } = require('./utils/fun-return');
require('dotenv').config();

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// Initialize player and attach to client
const ffmpegPath = require('ffmpeg-static');
const player = new Player(client, {
    connectionTimeout: 30000,
    probeTimeout: 10000,
    skipFFmpeg: false,
    ffmpegPath
});
client.player = player;

client.commands = new Collection();

// Cargar comandos
const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// Función recursiva para cargar comandos
function loadCommands(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            loadCommands(filePath);
        } else if (file.endsWith('.js')) {
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commands.push(command.data.toJSON());
                console.log(`✅ Comando cargado: ${command.data.name}`);
            }
        }
    }
}

loadCommands(commandsPath);

client.once('clientReady', () => {
    console.log(`👁️ EyedBot conectado como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    const musicSystem = interaction.client.musicSystem || new MusicSystem(interaction.client);
    if (!interaction.client.musicSystem) {
        interaction.client.musicSystem = musicSystem;
    }

    if (interaction.isButton()) {
        try {
            if (interaction.customId.startsWith('fun_return_')) {
                const handled = await handleReturnInteraction(interaction);
                if (handled) return;
            }

            if (interaction.customId.startsWith('search_select_')) {
                await musicSystem.handleSearchSelection(interaction);
                return;
            }

            if (interaction.customId.startsWith('music_')) {
                const parts = interaction.customId.split('_');
                let action = parts[1];

                if (parts.length > 3) {
                    action = parts.slice(1, -1).join('_');
                }

                await musicSystem.handleMusicControl(interaction, action);
                return;
            }
        } catch (error) {
            if (isUnknownInteractionError(error)) return;
            console.error('Error handling button interaction:', error);
            await safeReply(interaction, { content: '❌ Error al procesar el botón.', flags: 64 }).catch(() => {});
            return;
        }
    }

    if (interaction.isModalSubmit()) {
        try {
            if (interaction.customId.startsWith('music_volume_modal_')) {
                await musicSystem.handleVolumeModalSubmit(interaction);
                return;
            }
        } catch (error) {
            if (isUnknownInteractionError(error)) return;
            console.error('Error handling modal submit:', error);
            await safeReply(interaction, { content: '❌ Error al procesar el formulario.', flags: 64 }).catch(() => {});
            return;
        }
    }

    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command || typeof command.autocomplete !== 'function') return;
        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error('Error en autocomplete:', error);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction);
    } catch (error) {
        if (isUnknownInteractionError(error)) return;
        console.error(error);
        await safeReply(interaction, { content: '❌ Error al ejecutar el comando.', flags: 64 }).catch(() => {});
    }
});

async function main() {
    if (!TOKEN) {
        throw new Error('Falta DISCORD_TOKEN en .env');
    }
    if (!CLIENT_ID) {
        throw new Error('Falta CLIENT_ID en .env');
    }
    if (!GUILD_ID) {
        throw new Error('Falta GUILD_ID en .env');
    }

    // Registrar comandos automáticamente
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('🔄 Registrando comandos en Discord...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands },
        );
        console.log('✅ Comandos registrados exitosamente.');
    } catch (error) {
        console.error('❌ Error registrando comandos:', error);
    }

    await client.player.extractors.loadMulti(DefaultExtractors);
    client.login(TOKEN);
}

main();
