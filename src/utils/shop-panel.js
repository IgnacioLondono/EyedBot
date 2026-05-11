const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const gachaStore = require('./gacha-store');

const SHOP_MODES = {
    shop: { emoji: '🛍️', label: 'Tienda', title: 'Tienda del servidor' },
    inventory: { emoji: '🎒', label: 'Inventario', title: 'Tu inventario' },
    market: { emoji: '🏪', label: 'Mercado', title: 'Mercado de jugadores' },
    games: { emoji: '🎮', label: 'Minijuegos', title: 'Minijuegos y recompensas' }
};

const PAGE_SIZE = {
    shop: 1,
    inventory: 8,
    market: 8,
    games: 1
};

function clampPage(page = 0, totalPages = 1) {
    const maxPage = Math.max(0, totalPages - 1);
    return Math.max(0, Math.min(maxPage, Number.parseInt(`${page || 0}`, 10) || 0));
}

function buildModeButton(mode, activeMode, ownerId) {
    const meta = SHOP_MODES[mode];
    return new ButtonBuilder()
        .setCustomId(`shop_tab:${mode}:${ownerId}`)
        .setLabel(meta.label)
        .setEmoji(meta.emoji)
        .setStyle(activeMode === mode ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(activeMode === mode);
}

function buildNavButton(kind, mode, page, ownerId, disabled = false) {
    return new ButtonBuilder()
        .setCustomId(`shop_page:${kind}:${mode}:${page}:${ownerId}`)
        .setEmoji(kind === 'prev' ? '⬅️' : '➡️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
}

async function buildShopEmbed(guildId, userId, mode = 'shop', page = 0) {
    await gachaStore.ensureGuildEconomyContent(guildId);
    const config = await gachaStore.getConfig(guildId);
    const profile = await gachaStore.getProfile(guildId, userId);
    const meta = SHOP_MODES[mode] || SHOP_MODES.shop;

    const embed = new EmbedBuilder()
        .setColor('#f6c244')
        .setTitle(`${meta.emoji} ${meta.title}`)
        .setFooter({
            text: `Monedas: ${Number(profile.coins || 0).toLocaleString('es-ES')} · Inventario: ${Number(profile.inventory?.length || 0).toLocaleString('es-ES')}`
        })
        .setTimestamp();

    if (mode === 'shop') {
        const catalog = gachaStore.getShopCatalog(config);
        const totalPages = Math.max(1, catalog.length);
        const currentPage = clampPage(page, totalPages);
        const item = catalog[currentPage];

        if (!item) {
            embed.setDescription('No hay artículos disponibles en la tienda.');
        } else {
            const rarity = gachaStore.rarityMeta(item.rarity);
            embed
                .setDescription(`**${item.name}**\n${item.series}`)
                .addFields(
                    { name: `${rarity.emoji} Rareza`, value: item.rarity, inline: true },
                    { name: '💰 Precio', value: `${Number(item.price || 0).toLocaleString('es-ES')} monedas`, inline: true },
                    { name: '📄 Página', value: `${currentPage + 1}/${totalPages}`, inline: true }
                );
            if (item.imageUrl) embed.setImage(item.imageUrl);
        }

        return { embed, totalPages, currentPage, item };
    }

    if (mode === 'inventory') {
        const items = profile.inventory || [];
        const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE.inventory) || 1);
        const currentPage = clampPage(page, totalPages);
        const slice = items.slice(currentPage * PAGE_SIZE.inventory, (currentPage + 1) * PAGE_SIZE.inventory);

        if (!slice.length) {
            embed.setDescription('Tu inventario está vacío. Compra en la tienda o usa /gacha roll.');
        } else {
            embed.setDescription(slice.map((item, index) => {
                const rarity = gachaStore.rarityMeta(item.rarity);
                const position = currentPage * PAGE_SIZE.inventory + index + 1;
                return `${position}. ${rarity.emoji} **${item.name}** · ${item.series} · ${item.rarity} · UID \`${item.uid}\``;
            }).join('\n'));
            embed.addFields({ name: '📄 Página', value: `${currentPage + 1}/${totalPages}`, inline: true });
        }

        return { embed, totalPages, currentPage, items: slice };
    }

    if (mode === 'market') {
        const listings = await gachaStore.getGuildMarket(guildId);
        const totalPages = Math.max(1, Math.ceil(listings.length / PAGE_SIZE.market) || 1);
        const currentPage = clampPage(page, totalPages);
        const slice = listings.slice(currentPage * PAGE_SIZE.market, (currentPage + 1) * PAGE_SIZE.market);

        if (!slice.length) {
            embed.setDescription('No hay publicaciones activas. El catálogo del servidor se publicará aquí en cuanto haya artículos disponibles.');
        } else {
            embed.setDescription(slice.map((listing, index) => {
                const rarity = gachaStore.rarityMeta(listing.item?.rarity);
                const position = currentPage * PAGE_SIZE.market + index + 1;
                const sellerLabel = listing.sellerId === 'system' ? 'Catálogo' : `Vendedor ${listing.sellerId}`;
                return `${position}. ${rarity.emoji} **${listing.item?.name || 'Ítem'}** · ${listing.item?.rarity || 'N'} · 💰 ${Number(listing.price || 0).toLocaleString('es-ES')} · ${sellerLabel} · ID \`${listing.id}\``;
            }).join('\n'));
            embed.addFields({ name: '📄 Página', value: `${currentPage + 1}/${totalPages}`, inline: true });
        }

        return { embed, totalPages, currentPage, listings: slice };
    }

    embed.setDescription([
        'Gana monedas con actividad y minijuegos:',
        `• XP de chat/voz: **${Number(config.coinsPerXp || 0)}** moneda(s) por XP`,
        `• Subir de nivel: **${Number(config.coinsPerLevelUp || 0)}** moneda(s) por nivel`,
        `• Minuto en voz: **${Number(config.coinsPerVoiceMinute || 0)}** moneda(s)`,
        '',
        'Recompensas por minijuego:',
        `• /coinflip: **${Number(config.minigameCoinflipReward || 0)}**`,
        `• /dice: **${Number(config.minigameDiceReward || 0)}**`,
        `• /trivia (acierto): **${Number(config.minigameTriviaReward || 0)}**`,
        '',
        `Cooldown de minijuegos: **${Number(config.minigameCooldownSec || 45)}s**`
    ].join('\n'));

    return { embed, totalPages: 1, currentPage: 0 };
}

async function buildShopComponents(guildId, userId, mode = 'shop', page = 0) {
    const payload = await buildShopEmbed(guildId, userId, mode, page);
    const ownerId = String(userId);
    const currentPage = payload.currentPage || 0;
    const totalPages = payload.totalPages || 1;

    const tabs = new ActionRowBuilder().addComponents(
        buildModeButton('shop', mode, ownerId),
        buildModeButton('inventory', mode, ownerId),
        buildModeButton('market', mode, ownerId),
        buildModeButton('games', mode, ownerId)
    );

    const rows = [tabs];

    if (mode !== 'games') {
        const nav = new ActionRowBuilder().addComponents(
            buildNavButton('prev', mode, currentPage, ownerId, currentPage <= 0),
            buildNavButton('next', mode, currentPage, ownerId, currentPage >= totalPages - 1)
        );
        rows.push(nav);
    }

    if (mode === 'shop' && payload.item?.id) {
        const buy = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`shop_buy:${payload.item.id}:${ownerId}`)
                .setLabel('Comprar')
                .setEmoji('💳')
                .setStyle(ButtonStyle.Success)
        );
        rows.push(buy);
    }

    return { ...payload, components: rows };
}

module.exports = {
    SHOP_MODES,
    buildShopEmbed,
    buildShopComponents,
    clampPage
};
