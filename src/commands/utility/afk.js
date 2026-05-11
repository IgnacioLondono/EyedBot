const { SlashCommandBuilder } = require('discord.js');
const afkStore = require('../../utils/afk-store');
const { buildAfkActivatedEmbed } = require('../../utils/afk-announcements');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Marca tu estado como ausente (AFK)')
        .addStringOption((option) =>
            option
                .setName('motivo')
                .setDescription('Motivo de tu ausencia')
                .setRequired(false)
                .setMaxLength(500)
        ),

    async execute(interaction) {
        const reason = interaction.options.getString('motivo') || 'Sin especificar';
        const userId = interaction.user.id;
        const guildId = interaction.guildId;

        await afkStore.setAFK(guildId, userId, reason);

        const embed = buildAfkActivatedEmbed(interaction.user, reason);

        await interaction.reply({
            embeds: [embed]
        }).catch(() => null);
    }
};
