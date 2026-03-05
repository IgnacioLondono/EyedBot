const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nick')
        .setDescription('Cambia el apodo de un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a modificar')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('apodo')
                .setDescription('Nuevo apodo (dejar vacío para resetear)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),
    cooldown: 5,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        const nickname = interaction.options.getString('apodo');
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'Usuario no encontrado.')],
                flags: 64
            });
        }

        try {
            await member.setNickname(nickname || null);
            return interaction.reply({
                embeds: [Embeds.success('Apodo Cambiado', `Apodo de ${user.tag} ${nickname ? `cambiado a: ${nickname}` : 'reseteado'}.`)]
            });
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudo cambiar el apodo.')],
                flags: 64
            });
        }
    }
};






