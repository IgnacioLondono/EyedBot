const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Elimina mensajes del canal')
        .addIntegerOption(option =>
            option.setName('cantidad')
                .setDescription('Cantidad de mensajes a eliminar (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    cooldown: 5,
    async execute(interaction) {
        const amount = interaction.options.getInteger('cantidad');

        try {
            // Discord solo permite eliminar mensajes de menos de 14 días
            const messages = await interaction.channel.bulkDelete(amount, true);
            
            if (messages.size === 0) {
                return interaction.reply({
                    embeds: [Embeds.error('Error', 'No se pudieron eliminar los mensajes. Los mensajes deben tener menos de 14 días.')],
                    flags: 64
                });
            }
            
            const reply = await interaction.reply({
                embeds: [Embeds.success('Mensajes Eliminados', `Se eliminaron ${messages.size} mensajes.`)],
                flags: 64
            });
            
            // Eliminar el mensaje de confirmación después de 5 segundos
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 5000);
        } catch (error) {
            console.error('Error en clear:', error);
            return interaction.reply({
                embeds: [Embeds.error('Error', `No se pudieron eliminar los mensajes: ${error.message || 'Error desconocido'}`)],
                flags: 64
            });
        }
    }
};






