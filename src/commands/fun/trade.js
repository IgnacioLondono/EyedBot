const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const config = require('../../config');
const economySessions = require('../../utils/economy-sessions');
const { formatOffer } = require('../../utils/economy-minigames');
const gachaStore = require('../../utils/gacha-store');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trade')
        .setDescription('Propón un intercambio directo con otro usuario')
        .addUserOption((opt) =>
            opt.setName('usuario')
                .setDescription('Usuario con el que quieres intercambiar')
                .setRequired(true))
        .addIntegerOption((opt) =>
            opt.setName('dar_monedas')
                .setDescription('Monedas que ofreces')
                .setMinValue(0)
                .setRequired(false))
        .addStringOption((opt) =>
            opt.setName('dar_objeto')
                .setDescription('UID del objeto que ofreces')
                .setRequired(false))
        .addIntegerOption((opt) =>
            opt.setName('pedir_monedas')
                .setDescription('Monedas que pides')
                .setMinValue(0)
                .setRequired(false))
        .addStringOption((opt) =>
            opt.setName('pedir_objeto')
                .setDescription('UID del objeto que pides')
                .setRequired(false)),
    cooldown: 5,
    async execute(interaction) {
        const target = interaction.options.getUser('usuario');
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
                    .setDescription('No puedes intercambiar contigo mismo.')],
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

        const initiatorOffer = {
            coins: interaction.options.getInteger('dar_monedas') || 0,
            itemUid: interaction.options.getString('dar_objeto') || ''
        };
        const targetOffer = {
            coins: interaction.options.getInteger('pedir_monedas') || 0,
            itemUid: interaction.options.getString('pedir_objeto') || ''
        };

        const created = await economySessions.createTradeSession(
            interaction.guildId,
            interaction.user.id,
            target.id,
            initiatorOffer,
            targetOffer
        );

        if (!created.ok) {
            const message = {
                economy_disabled: 'La economía está desactivada.',
                empty_trade: 'Debes ofrecer o pedir al menos monedas u un objeto.',
                insufficient_funds: 'No tienes monedas suficientes para esta propuesta.',
                item_not_found: 'No encontré el objeto que ofreces en tu inventario.',
                target_item_not_found: 'El objeto pedido no está en el inventario del otro usuario.',
                target_insufficient_funds: 'El otro usuario no tiene monedas suficientes para lo que pides.'
            }[created.reason] || 'No se pudo crear el intercambio.';
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('Intercambio fallido').setDescription(message)],
                flags: 64
            });
        }

        const session = created.session;
        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🤝 Propuesta de intercambio')
            .setDescription(`<@${target.id}>, revisa la oferta de <@${interaction.user.id}>.`)
            .addFields(
                { name: 'Ofrece', value: formatOffer(session.initiatorOffer), inline: true },
                { name: 'Pide', value: formatOffer(session.targetOffer), inline: true },
                { name: 'Expira', value: 'En 10 minutos', inline: true }
            )
            .setFooter({ text: `ID ${session.id}` })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`trade:accept:${session.id}`)
                .setLabel('Aceptar')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`trade:cancel:${session.id}`)
                .setLabel('Cancelar')
                .setEmoji('✖️')
                .setStyle(ButtonStyle.Danger)
        );

        const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        await economySessions.attachMessageToSession(interaction.guildId, session.id, message.channelId, message.id);
        return message;
    }
};
