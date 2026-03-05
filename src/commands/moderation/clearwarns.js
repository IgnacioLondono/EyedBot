const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearwarns')
        .setDescription('Elimina todas las advertencias de un usuario')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a limpiar')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    cooldown: 5,
    async execute(interaction) {
        const user = interaction.options.getUser('usuario');
        await db.delete(`warns_${interaction.guild.id}_${user.id}`);

        return interaction.reply({
            embeds: [Embeds.success('Advertencias Eliminadas', `Se eliminaron todas las advertencias de ${user.tag}.`)]
        });
    }
};













