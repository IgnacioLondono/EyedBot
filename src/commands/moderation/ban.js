const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Banea a un usuario del servidor')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a banear')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('razon')
                .setDescription('Razón del ban')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
    cooldown: 5,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        const reason = interaction.options.getString('razon') || 'Sin razón especificada';
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'Usuario no encontrado en el servidor.')],
                flags: 64
            });
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No puedes banear a este usuario.')],
                flags: 64
            });
        }

        try {
            await member.ban({ reason: reason });
            
            // Guardar en logs
            const bans = await db.get(`bans_${interaction.guild.id}`) || [];
            bans.push({
                user: user.id,
                moderator: interaction.user.id,
                reason: reason,
                date: new Date().toISOString()
            });
            await db.set(`bans_${interaction.guild.id}`, bans);

            return interaction.reply({
                embeds: [Embeds.success('Usuario Baneado', `${user.tag} ha sido baneado.\n**Razón:** ${reason}`)]
            });
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudo banear al usuario.')],
                flags: 64
            });
        }
    }
};






