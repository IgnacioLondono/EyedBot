const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Añade o quita un rol a un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a modificar')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('rol')
                .setDescription('Rol a añadir/quitar')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    cooldown: 5,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        const role = interaction.options.getRole('rol');
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'Usuario no encontrado.')],
                flags: 64
            });
        }

        try {
            if (member.roles.cache.has(role.id)) {
                await member.roles.remove(role);
                return interaction.reply({
                    embeds: [Embeds.success('Rol Removido', `Se removió el rol ${role} de ${user.tag}.`)]
                });
            } else {
                await member.roles.add(role);
                return interaction.reply({
                    embeds: [Embeds.success('Rol Añadido', `Se añadió el rol ${role} a ${user.tag}.`)]
                });
            }
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudo modificar el rol.')],
                flags: 64
            });
        }
    }
};






