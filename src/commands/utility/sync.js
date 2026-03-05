const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sync')
        .setDescription('Sincroniza los comandos slash del bot')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    cooldown: 10,
    async execute(interaction) {
        // Intentar deferReply, pero manejar si la interacción ya expiró
        try {
            await interaction.deferReply({ flags: 64 });
        } catch (error) {
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                console.log('⚠️ Interacción expirada antes de poder responder');
                return;
            }
            throw error;
        }

        try {
            const commands = [];

            // Cargar todos los comandos
            const commandsPath = path.join(__dirname, '..');
            const commandFolders = fs.readdirSync(commandsPath);

            for (const folder of commandFolders) {
                const folderPath = path.join(commandsPath, folder);
                if (!fs.statSync(folderPath).isDirectory()) continue;
                
                const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
                
                for (const file of commandFiles) {
                    const filePath = path.join(folderPath, file);
                    try {
                        const command = require(filePath);
                        
                        if ('data' in command && 'execute' in command) {
                            commands.push(command.data.toJSON());
                        }
                    } catch (error) {
                        console.error(`Error cargando comando ${filePath}:`, error);
                    }
                }
            }

            // Construir y preparar una instancia del módulo REST
            const rest = new REST().setToken(process.env.DISCORD_TOKEN);
            const clientId = process.env.CLIENT_ID || interaction.client.user.id;

            // Sincronizar comandos globalmente
            const data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('✅ Comandos Sincronizados')
                .setDescription(`Se sincronizaron **${data.length}** comandos exitosamente.`)
                .addFields(
                    { name: 'Comandos Globales', value: `${data.length}`, inline: true },
                    { name: 'Servidor', value: interaction.guild.name, inline: true }
                )
                .setFooter({ text: `Sincronizado por ${interaction.user.tag}` })
                .setTimestamp();

            // Verificar que la interacción aún sea válida antes de editar
            try {
                return await interaction.editReply({ embeds: [embed] });
            } catch (editError) {
                if (editError.code === 10062 || editError.message?.includes('Unknown interaction')) {
                    console.log('⚠️ Interacción expirada antes de poder editar la respuesta');
                    return;
                }
                throw editError;
            }

        } catch (error) {
            console.error('Error sincronizando comandos:', error);
            
            // Verificar si la interacción aún es válida
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                console.log('⚠️ Interacción expirada durante la sincronización');
                return;
            }
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error al Sincronizar')
                .setDescription(`Ocurrió un error al sincronizar los comandos.\n\`\`\`${error.message.substring(0, 1000)}\`\`\``)
                .setFooter({ text: 'Verifica la consola para más detalles' });

            try {
                return await interaction.editReply({ embeds: [embed] });
            } catch (replyError) {
                if (replyError.code === 10062 || replyError.message?.includes('Unknown interaction')) {
                    console.log('⚠️ Interacción expirada antes de poder mostrar el error');
                    return;
                }
                console.error('Error al responder con mensaje de error:', replyError);
            }
        }
    }
};





