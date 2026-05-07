const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');
const db = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setprefix')
        .setDescription('Establece el prefijo del bot')
        .addStringOption(option =>
            option.setName('prefijo')
                .setDescription('Nuevo prefijo')
                .setRequired(true)
                .setMaxLength(5))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    cooldown: 5,
    async execute(interaction) {
        const prefix = interaction.options.getString('prefijo');

        await db.set(`prefix_${interaction.guild.id}`, prefix);

        return interaction.reply({
            embeds: [Embeds.success('Prefijo Actualizado', `Prefijo establecido en: \`${prefix}\``)]
        });
    }
};













