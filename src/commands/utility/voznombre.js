const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const tempVoiceStore = require('../../utils/temp-voice-store');
const { sanitizeChannelName } = require('../../events/temp-voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voznombre')
        .setDescription('Define tu nombre personalizado para tu canal de voz temporal')
        .addStringOption((option) =>
            option
                .setName('nombre')
                .setDescription('Nombre del canal temporal. Déjalo vacío para reiniciar')
                .setRequired(false)
                .setMaxLength(95)
        ),
    cooldown: 5,
    async execute(interaction) {
        if (!interaction.guildId) {
            return interaction.reply({ content: 'Este comando solo funciona dentro de un servidor.', flags: 64 });
        }

        const rawName = interaction.options.getString('nombre');
        const safeName = sanitizeChannelName(rawName || '');

        if (!rawName) {
            await tempVoiceStore.setUserCustomName(interaction.guildId, interaction.user.id, '');
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(config.embedColor)
                        .setTitle('✅ Nombre reiniciado')
                        .setDescription('Volverás a usar el formato automático `Canal de {username}`.')
                ],
                flags: 64
            });
        }

        if (!safeName) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Nombre inválido')
                        .setDescription('Escribe un nombre válido para tu canal temporal.')
                ],
                flags: 64
            });
        }

        await tempVoiceStore.setUserCustomName(interaction.guildId, interaction.user.id, safeName);

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setColor(config.embedColor)
                    .setTitle('🎧 Nombre guardado')
                    .setDescription(`Tu próximo canal temporal se llamará **${safeName}**.`)
            ],
            flags: 64
        });
    }
};
