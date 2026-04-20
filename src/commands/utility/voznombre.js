const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config');
const tempVoiceStore = require('../../utils/temp-voice-store');
const { sanitizeChannelName } = require('../../events/temp-voice');
const { CREATE_BUTTON_PREFIX } = require('../../events/temp-voice-constants');

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

        if (!rawName) {
            const previewDefault = `Canal de ${interaction.user.username}`;
            const actionRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`${CREATE_BUTTON_PREFIX}${interaction.guildId}`)
                    .setLabel('Crear Con Nombre Personalizado')
                    .setStyle(ButtonStyle.Primary)
            );

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(config.embedColor)
                        .setTitle('🎧 Crea Tu Canal Temporal')
                        .setDescription(
                            [
                                'Pulsa **Crear Con Nombre Personalizado** para abrir la pantalla de nombre.',
                                `Si lo dejas vacio, se usara **${previewDefault}**.`
                            ].join('\n')
                        )
                ],
                components: [actionRow],
                flags: 64
            });
        }

        const lowered = String(rawName).trim().toLowerCase();
        if (['reset', 'reiniciar', 'default'].includes(lowered)) {
            await tempVoiceStore.setUserCustomName(interaction.guildId, interaction.user.id, '');
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(config.embedColor)
                        .setTitle('✅ Nombre reiniciado')
                        .setDescription('Volverás a usar el formato automático Canal de {username}.')
                ],
                flags: 64
            });
        }

        const safeName = sanitizeChannelName(rawName || '');

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
