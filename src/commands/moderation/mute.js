const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Silencia a un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a silenciar')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('tiempo')
                .setDescription('Tiempo de silencio (ej: 10m, 1h)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('razon')
                .setDescription('Razón del silencio')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    cooldown: 5,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        const time = interaction.options.getString('tiempo');
        const reason = interaction.options.getString('razon') || 'Sin razón especificada';
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'Usuario no encontrado.')],
                flags: 64
            });
        }

        let timeoutDuration = 0;
        if (time) {
            const ms = require('ms');
            timeoutDuration = ms(time);
            if (!timeoutDuration || timeoutDuration > 2419200000) {
                return interaction.reply({
                    embeds: [Embeds.error('Error', 'Tiempo inválido. Máximo 28 días.')],
                    flags: 64
                });
            }
        } else {
            timeoutDuration = 60000; // 1 minuto por defecto
        }

        try {
            await member.timeout(timeoutDuration, reason);
            
            const mutes = await db.get(`mutes_${interaction.guild.id}`) || [];
            mutes.push({
                user: user.id,
                moderator: interaction.user.id,
                reason: reason,
                duration: timeoutDuration,
                date: new Date().toISOString()
            });
            await db.set(`mutes_${interaction.guild.id}`, mutes);

            return interaction.reply({
                embeds: [Embeds.success('Usuario Silenciado', `${user.tag} ha sido silenciado${time ? ` por ${time}` : ''}.\n**Razón:** ${reason}`)]
            });
        } catch (error) {
            return interaction.reply({
                embeds: [Embeds.error('Error', 'No se pudo silenciar al usuario.')],
                flags: 64
            });
        }
    }
};






