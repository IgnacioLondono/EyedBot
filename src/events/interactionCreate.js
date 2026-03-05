const { EmbedBuilder, Collection } = require('discord.js');
const logger = require('../utils/logger');
const Embeds = require('../utils/embeds');
const config = require('../config');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        // Manejar botones
        if (interaction.isButton()) {
            const MusicSystem = require('../cogs/music/index');
            const musicSystem = interaction.client.musicSystem || new MusicSystem(interaction.client);
            if (!interaction.client.musicSystem) {
                interaction.client.musicSystem = musicSystem;
            }

            // Manejar selección de resultados de búsqueda
            if (interaction.customId.startsWith('search_select_')) {
                await musicSystem.handleSearchSelection(interaction);
                return;
            }

            // Manejar controles de música
            if (interaction.customId.startsWith('music_')) {
                // Extraer la acción correctamente (puede ser pause_resume, skip, stop, shuffle, etc.)
                const parts = interaction.customId.split('_');
                let action = parts[1];
                // Si hay más partes, combinarlas (ej: pause_resume)
                if (parts.length > 3) {
                    action = parts.slice(1, -1).join('_');
                }
                await musicSystem.handleMusicControl(interaction, action);
                return;
            }

            // Manejar trivia
            if (interaction.customId.startsWith('trivia_')) {
                const triviaData = interaction.client.triviaAnswers?.[interaction.message.interaction?.id];
                
                if (!triviaData) {
                    return interaction.reply({
                        embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('Esta trivia ya expiró.')],
                        flags: 64
                    });
                }

                const answerIndex = parseInt(interaction.customId.split('_')[1]);
                const selectedAnswer = triviaData.answers[answerIndex];
                const isCorrect = answerIndex === triviaData.correctIndex || selectedAnswer === triviaData.correct;

                const embed = new EmbedBuilder()
                    .setColor(isCorrect ? config.embedColor : '#FF0000')
                    .setTitle(isCorrect ? '✅ ¡Correcto!' : '❌ Incorrecto')
                    .setDescription(isCorrect 
                        ? `¡Bien hecho, ${interaction.user}! La respuesta correcta era: **${triviaData.correct}**`
                        : `Lo siento ${interaction.user}, la respuesta correcta era: **${triviaData.correct}**`)
                    .setFooter({ text: `Respondido por ${interaction.user.tag}` });

                await interaction.reply({ embeds: [embed], flags: 64 });
                delete interaction.client.triviaAnswers[interaction.message.interaction?.id];
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            logger.warn(`Comando no encontrado: ${interaction.commandName}`);
            return;
        }

        // Cooldown
        const { cooldowns } = interaction.client;
        if (!cooldowns.has(command.data.name)) {
            cooldowns.set(command.data.name, new Collection());
        }

        const now = Date.now();
        const timestamps = cooldowns.get(command.data.name);
        const defaultCooldownDuration = (command.cooldown ?? 3) * 1000;

        if (timestamps.has(interaction.user.id)) {
            const expirationTime = timestamps.get(interaction.user.id) + defaultCooldownDuration;

            if (now < expirationTime) {
                const expiredTimestamp = Math.round(expirationTime / 1000);
                try {
                    return await interaction.reply({
                        embeds: [Embeds.error('Cooldown', `Espera <t:${expiredTimestamp}:R> antes de usar \`${command.data.name}\` nuevamente.`)],
                        flags: 64
                    });
                } catch (e) {
                    if (e.code !== 10062) logger.error('Error respondiendo cooldown:', e);
                    return;
                }
            }
        }

        timestamps.set(interaction.user.id, now);
        setTimeout(() => timestamps.delete(interaction.user.id), defaultCooldownDuration);

        // Ejecutar comando con timeout y manejo de respuesta
        let responded = false;
        const timeout = setTimeout(async () => {
            if (!responded && !interaction.replied && !interaction.deferred) {
                try {
                    responded = true;
                    await interaction.deferReply({ flags: 64 });
                    logger.warn(`Comando ${command.data.name} tardó más de 2.5s, usando deferReply`);
                } catch (e) {
                    if (e.code !== 10062) logger.error('Error en timeout deferReply:', e);
                }
            }
        }, 2500); // Defer después de 2.5 segundos para evitar timeout de Discord

        try {
            await command.execute(interaction);
            clearTimeout(timeout);
            responded = true;
            logger.info(`${interaction.user.tag} usó el comando ${command.data.name}`);
        } catch (error) {
            clearTimeout(timeout);
            logger.error(`Error ejecutando ${command.data.name}:`, error);
            
            // Verificar si la interacción aún es válida
            if (error.code === 10062 || error.message?.includes('Unknown interaction')) {
                logger.warn(`Interacción expirada para comando ${command.data.name}`);
                return; // La interacción expiró, no intentar responder
            }
            
            const errorMessage = {
                embeds: [Embeds.error('Error', 'Ocurrió un error al ejecutar este comando.')],
                flags: 64 // MessageFlags.Ephemeral
            };

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            } catch (replyError) {
                // Si falla al responder, solo loguear el error
                if (replyError.code !== 10062) {
                    logger.error(`Error al responder con mensaje de error: ${replyError}`);
                }
            }
        }
    }
};

