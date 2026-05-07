const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Desbanea a un usuario')
        .addStringOption(option =>
            option.setName('usuario')
                .setDescription('ID del usuario a desbanear')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    cooldown: 5,
    async execute(interaction) {
        const userId = interaction.options.getString('usuario');

        try {
            const user = await interaction.client.users.fetch(userId);
            await interaction.guild.members.unban(userId);
            
            return interaction.reply({
                embeds: [Embeds.success('Usuario Desbaneado', `${user.tag} ha sido desbaneado.`)]
            });
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudo desbanear al usuario. Verifica el ID.')],
                flags: 64
            });
        }
    }
};






