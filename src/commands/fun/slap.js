const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const { fetchInteractionGif, createReturnComponents, incrementMentionCount } = require('../../utils/fun-return');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slap')
        .setDescription('Golpea a alguien')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('Usuario a golpear')
                .setRequired(true)),
    cooldown: 3,
    async execute(interaction) {
        await interaction.deferReply();

        const user = interaction.options.getUser('usuario');
        
        try {
            const gifUrl = await fetchInteractionGif('slap');
            const counts = await incrementMentionCount('slap', interaction.guild?.id || null, user.id).catch(() => ({ total: null, actionCount: null }));

            const embed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('👋 Golpe')
                .setDescription(`${interaction.user} golpeó a ${user}`)
                .setFooter({ text: `Solicitado por ${interaction.user.tag}` });

            if (Number.isFinite(counts?.total) && Number.isFinite(counts?.actionCount)) {
                embed.addFields({
                    name: '📊 Conteo',
                    value: `Menciones a ${user}: **${counts.total}** total (**${counts.actionCount}** en slap)`,
                    inline: false
                });
            }

            if (gifUrl) embed.setImage(gifUrl);
            const components = createReturnComponents('slap', interaction.user.id, user.id);

            return interaction.editReply({ embeds: [embed], components });
        } catch (error) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription('No se pudo obtener el GIF.')]
            });
        }
    }
};













