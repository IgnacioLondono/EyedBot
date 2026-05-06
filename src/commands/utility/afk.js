const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const afkStore = require('../../utils/afk-store');

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
        const memberTag = interaction.user.tag;

        // Guardar en store
        await afkStore.setAFK(guildId, userId, reason);

        // Embed de confirmación
        const embed = new EmbedBuilder()
            .setColor('f5a623')
            .setTitle('⏳ Estado AFK activado')
            .setDescription(`${interaction.user.username} está ausente.`)
            .addFields(
                { name: 'Motivo', value: reason, inline: false }
            )
            .setAuthor({
                name: memberTag,
                iconURL: interaction.user.displayAvatarURL({ size: 64 })
            })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            flags: 64 // Privado
        }).catch(() => null);
    }
};
