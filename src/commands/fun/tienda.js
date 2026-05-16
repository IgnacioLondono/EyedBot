const { SlashCommandBuilder } = require('discord.js');
const Embeds = require('../../utils/embeds');
const gachaStore = require('../../utils/gacha-store');
const { buildShopComponents, clampPage } = require('../../utils/shop-panel');

async function renderShopPanel(interaction, mode = 'shop', page = 0) {
    const payload = await buildShopComponents(interaction.guild.id, interaction.user.id, mode, page);
    return {
        embeds: [payload.embed],
        components: payload.components
    };
}

async function handleShopButton(interaction) {
    if (!interaction.isButton() || !interaction.customId?.startsWith('shop_')) {
        return false;
    }

    const parts = interaction.customId.split(':');
    const ownerId = parts[parts.length - 1];
    if (!ownerId || ownerId !== interaction.user.id) {
        await interaction.reply({
            content: 'Solo quien abrió la tienda puede usar estos botones.',
            ephemeral: true
        }).catch(() => null);
        return true;
    }

    const config = await gachaStore.getConfig(interaction.guild.id);
    if (!config.economyEnabled) {
        await interaction.reply({
            embeds: [Embeds.warning('Economía desactivada', 'Un admin debe activar la economía desde el panel web o `/gacha configurar`.')],
            ephemeral: true
        }).catch(() => null);
        return true;
    }

    if (parts[0] === 'shop_tab') {
        const mode = parts[1] || 'shop';
        const panel = await renderShopPanel(interaction, mode, 0);
        await interaction.update(panel).catch(() => null);
        return true;
    }

    if (parts[0] === 'shop_page') {
        const kind = parts[1];
        const mode = parts[2] || 'shop';
        const currentPage = clampPage(parts[3], 9999);
        const nextPage = kind === 'prev' ? currentPage - 1 : currentPage + 1;
        const panel = await renderShopPanel(interaction, mode, nextPage);
        await interaction.update(panel).catch(() => null);
        return true;
    }

    if (parts[0] === 'shop_buy') {
        const characterId = parts[1];
        const result = await gachaStore.purchaseShopCharacter(interaction.guild.id, interaction.user.id, characterId);
        if (!result.ok) {
            const message = result.reason === 'insufficient_funds'
                ? `No tienes monedas suficientes. Necesitas **${Number(result.price || 0).toLocaleString('es-ES')}**.`
                : 'No se pudo completar la compra.';
            await interaction.reply({
                embeds: [Embeds.error('Compra fallida', message)],
                ephemeral: true
            }).catch(() => null);
            return true;
        }

        const panel = await renderShopPanel(interaction, 'shop', 0);
        await interaction.update(panel).catch(() => null);
        const thumb = String(result.item?.imageUrl || '').trim();
        const buyEmbed = Embeds.success(
            'Compra realizada',
            `Obtuviste **${result.item?.name || 'un ítem'}** por **${Number(result.price || 0).toLocaleString('es-ES')}** monedas.`
        );
        if (/^https?:\/\/.+/i.test(thumb)) {
            buyEmbed.setThumbnail(thumb);
        }
        await interaction.followUp({
            embeds: [buyEmbed],
            flags: 64
        }).catch(() => null);
        return true;
    }

    return false;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tienda')
        .setDescription('Explora la tienda, inventario, mercado y minijuegos del servidor'),
    cooldown: 3,
    async execute(interaction) {
        const config = await gachaStore.getConfig(interaction.guild.id);
        if (!config.economyEnabled) {
            return interaction.reply({
                embeds: [Embeds.warning('Economía desactivada', 'Activa la economía desde el panel web de gacha o pide a un admin que la habilite.')],
                flags: 64
            });
        }

        const panel = await renderShopPanel(interaction, 'shop', 0);
        return interaction.reply(panel);
    },
    handleShopButton
};
