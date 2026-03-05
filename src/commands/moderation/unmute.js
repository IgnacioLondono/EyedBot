const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Quita el silencio a un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a desilenciar')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    cooldown: 5,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'Usuario no encontrado.')],
                flags: 64
            });
        }

        if (!member.isCommunicationDisabled()) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'Este usuario no está silenciado.')],
                flags: 64
            });
        }

        try {
            await member.timeout(null);
            return interaction.reply({
                embeds: [Embeds.success('Usuario Desilenciado', `${user.tag} ya no está silenciado.`)]
            });
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudo desilenciar al usuario.')],
                flags: 64
            });
        }
    }
};






