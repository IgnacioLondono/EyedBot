const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Elimina mensajes de un usuario específico')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario cuyos mensajes eliminar')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('cantidad')
                .setDescription('Cantidad de mensajes a revisar (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    cooldown: 5,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        const amount = interaction.options.getInteger('cantidad');

        try {
            const messages = await interaction.channel.messages.fetch({ limit: amount });
            const userMessages = messages.filter(msg => msg.author.id === user.id);
            
            if (userMessages.size === 0) {
                return interaction.reply({
                    embeds: [Embeds.error('Error', 'No se encontraron mensajes de ese usuario.')],
                    flags: 64
                });
            }

            await interaction.channel.bulkDelete(userMessages, true);
            
            return interaction.reply({
                embeds: [Embeds.success('Mensajes Eliminados', `Se eliminaron ${userMessages.size} mensajes de ${user.tag}.`)],
                flags: 64
            });
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudieron eliminar los mensajes.')],
                flags: 64
            });
        }
    }
};






