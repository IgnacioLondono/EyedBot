const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const config = require('../../config');
const economySessions = require('../../utils/economy-sessions');
const gachaStore = require('../../utils/gacha-store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('versus')
        .setDescription('Desafía a otro usuario a un duelo de dados por monedas')
        .addUserOption((opt) =>
            opt.setName('usuario')
                .setDescription('Rival del duelo')
                .setRequired(true))
        .addIntegerOption((opt) =>
            opt.setName('apuesta')
                .setDescription('Monedas que cada jugador arriesga')
                .setMinValue(1)
                .setRequired(true)),
    cooldown: 5,
    async execute(interaction) {
        const target = interaction.options.getUser('usuario');
        const stake = interaction.options.getInteger('apuesta') || 0;
        if (!target || target.bot) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Usuario inválido')
                    .setDescription('Debes elegir un usuario real del servidor.')],
                flags: 64
            });
        }
        if (target.id === interaction.user.id) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('Usuario inválido')
                    .setDescription('No puedes desafiarte a ti mismo.')],
                flags: 64
            });
        }

        const economy = await gachaStore.getConfig(interaction.guildId);
        if (!economy.economyEnabled) {
            return interaction.reply({
                embeds: [new EmbedBuilder()
                    .setColor('#FFAA00')
                    .setTitle('Economía desactivada')
                    .setDescription('Activa la economía desde el panel web o `/gacha configurar`.')],
                flags: 64
            });
        }

        const created = await economySessions.createVersusSession(
            interaction.guildId,
            interaction.user.id,
            target.id,
            stake
        );

        if (!created.ok) {
            const message = {
                economy_disabled: 'La economía está desactivada.',
                insufficient_funds: 'No tienes monedas suficientes para esta apuesta.'
            }[created.reason] || 'No se pudo crear el duelo.';
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('Duelo fallido').setDescription(message)],
                flags: 64
            });
        }

        const session = created.session;
        const embed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle('⚔️ Desafío versus')
            .setDescription([
                `<@${target.id}>, <@${interaction.user.id}> te reta a un duelo místico.`,
                `Apuesta por jugador: **${Number(stake).toLocaleString('es-ES')}** monedas.`,
                'Si aceptas, ambos tiráis un dado del 1 al 100 y el mayor se lleva el bote.'
            ].join('\n'))
            .setFooter({ text: `ID ${session.id}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`versus:accept:${session.id}`)
                .setLabel('Aceptar duelo')
                .setEmoji('⚔️')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`versus:reject:${session.id}`)
                .setLabel('Rechazar')
                .setEmoji('✖️')
                .setStyle(ButtonStyle.Secondary)
        );

        const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        await economySessions.attachMessageToSession(interaction.guildId, session.id, message.channelId, message.id);
        return message;
    }
};
