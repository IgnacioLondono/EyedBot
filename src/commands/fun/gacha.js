const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');
const gachaStore = require('../../utils/gacha-store');

function formatCooldown(remainingMs = 0) {
    const sec = Math.max(1, Math.ceil(remainingMs / 1000));
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const rem = sec % 60;
    return rem ? `${min}m ${rem}s` : `${min}m`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gacha')
        .setDescription('Sistema de roll y colección de personajes')
        .addSubcommand((sub) =>
            sub.setName('roll')
                .setDescription('Hace un roll para intentar obtener un personaje'))
        .addSubcommand((sub) =>
            sub.setName('claim')
                .setDescription('Reclama tu último roll si aún está activo'))
        .addSubcommand((sub) =>
            sub.setName('perfil')
                .setDescription('Muestra tu perfil gacha')
                .addUserOption((opt) =>
                    opt.setName('usuario')
                        .setDescription('Usuario a consultar')
                        .setRequired(false)))
        .addSubcommand((sub) =>
            sub.setName('top')
                .setDescription('Ranking de usuarios por claims'))
        .addSubcommand((sub) =>
            sub.setName('inventario')
                .setDescription('Muestra inventario (con filtros)')
                .addUserOption((opt) =>
                    opt.setName('usuario').setDescription('Usuario objetivo').setRequired(false))
                .addStringOption((opt) =>
                    opt.setName('rareza').setDescription('Filtra por rareza').addChoices(
                        { name: 'SSR', value: 'SSR' },
                        { name: 'SR', value: 'SR' },
                        { name: 'R', value: 'R' },
                        { name: 'N', value: 'N' }
                    ).setRequired(false))
                .addStringOption((opt) =>
                    opt.setName('serie').setDescription('Filtra por serie').setRequired(false)))
        .addSubcommand((sub) =>
            sub.setName('wishlist')
                .setDescription('Gestiona tu wishlist')
                .addStringOption((opt) =>
                    opt.setName('accion').setDescription('Acción').addChoices(
                        { name: 'agregar', value: 'add' },
                        { name: 'quitar', value: 'remove' },
                        { name: 'ver', value: 'list' }
                    ).setRequired(true))
                .addStringOption((opt) =>
                    opt.setName('personaje').setDescription('Nombre del personaje').setRequired(false)))
        .addSubcommand((sub) =>
            sub.setName('mercado_publicar')
                .setDescription('Publica un item de tu inventario en el mercado')
                .addStringOption((opt) =>
                    opt.setName('uid').setDescription('UID del item en inventario').setRequired(true))
                .addIntegerOption((opt) =>
                    opt.setName('precio').setDescription('Precio en monedas').setMinValue(1).setRequired(true)))
        .addSubcommand((sub) =>
            sub.setName('mercado_comprar')
                .setDescription('Compra un ítem del mercado')
                .addStringOption((opt) =>
                    opt.setName('listing').setDescription('ID del listing').setRequired(true)))
        .addSubcommand((sub) =>
            sub.setName('mercado')
                .setDescription('Muestra los listings activos del mercado'))
        .addSubcommand((sub) =>
            sub.setName('configurar')
                .setDescription('Configura el sistema gacha para el servidor')
                .addBooleanOption((opt) =>
                    opt.setName('activo')
                        .setDescription('Activa o desactiva el sistema')
                        .setRequired(true))
                .addChannelOption((opt) =>
                    opt.setName('canal')
                        .setDescription('Canal obligatorio para usar /gacha')
                        .setRequired(false))
                .addIntegerOption((opt) =>
                    opt.setName('cooldown_roll')
                        .setDescription('Cooldown de roll en segundos (10-3600)')
                        .setMinValue(10)
                        .setMaxValue(3600)
                        .setRequired(false))
                .addIntegerOption((opt) =>
                    opt.setName('cooldown_claim')
                        .setDescription('Cooldown de claim en segundos (5-1800)')
                        .setMinValue(5)
                        .setMaxValue(1800)
                        .setRequired(false))
                .addIntegerOption((opt) =>
                    opt.setName('ventana_claim')
                        .setDescription('Tiempo para reclamar tras roll (30-600)')
                        .setMinValue(30)
                        .setMaxValue(600)
                        .setRequired(false))
                .addIntegerOption((opt) =>
                    opt.setName('monedas_claim')
                        .setDescription('Monedas ganadas por claim (1-1000)')
                        .setMinValue(1)
                        .setMaxValue(1000)
                        .setRequired(false))
                .addIntegerOption((opt) =>
                    opt.setName('pity')
                        .setDescription('Rolls sin SSR para activar pity (5-200)')
                        .setMinValue(5)
                        .setMaxValue(200)
                        .setRequired(false))),
    cooldown: 3,
    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const sub = interaction.options.getSubcommand();

        if (sub === 'configurar') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    embeds: [Embeds.error('Permisos insuficientes', 'Necesitas `Gestionar servidor` para configurar gacha.')],
                    flags: 64
                });
            }

            const current = await gachaStore.getConfig(guildId);
            const next = await gachaStore.setConfig(guildId, {
                ...current,
                enabled: interaction.options.getBoolean('activo', true),
                channelId: interaction.options.getChannel('canal')?.id || current.channelId || '',
                rollCooldownSec: interaction.options.getInteger('cooldown_roll') ?? current.rollCooldownSec,
                claimCooldownSec: interaction.options.getInteger('cooldown_claim') ?? current.claimCooldownSec,
                claimWindowSec: interaction.options.getInteger('ventana_claim') ?? current.claimWindowSec,
                coinsPerClaim: interaction.options.getInteger('monedas_claim') ?? current.coinsPerClaim,
                pityThreshold: interaction.options.getInteger('pity') ?? current.pityThreshold,
                updatedAt: new Date().toISOString(),
                updatedBy: interaction.user.id
            });

            return interaction.reply({
                embeds: [Embeds.success('Gacha configurado', `Estado: **${next.enabled ? 'activo' : 'inactivo'}**\nCanal: ${next.channelId ? `<#${next.channelId}>` : 'cualquiera'}\nRoll CD: **${next.rollCooldownSec}s** · Claim CD: **${next.claimCooldownSec}s** · Ventana: **${next.claimWindowSec}s**\nMonedas por claim: **${next.coinsPerClaim}** · Pity: **${next.pityThreshold}**`)]
            });
        }

        const config = await gachaStore.getConfig(guildId);
        if (!config.enabled) {
            return interaction.reply({
                embeds: [Embeds.warning('Gacha desactivado', 'Un admin debe activarlo con `/gacha configurar activo:true`.')],
                flags: 64
            });
        }

        if (config.channelId && interaction.channelId !== config.channelId) {
            return interaction.reply({
                embeds: [Embeds.warning('Canal no permitido', `Usa este comando en <#${config.channelId}>.`)],
                flags: 64
            });
        }

        if (sub === 'roll') {
            const profile = await gachaStore.getProfile(guildId, userId);
            const remaining = (profile.lastRollAt || 0) + (config.rollCooldownSec * 1000) - Date.now();
            if (remaining > 0) {
                return interaction.reply({
                    embeds: [Embeds.warning('Cooldown de roll', `Debes esperar **${formatCooldown(remaining)}**.`)],
                    flags: 64
                });
            }

            const pending = await gachaStore.createRoll(guildId, userId, interaction.channelId);
            if (!pending?.character) {
                return interaction.reply({
                    embeds: [Embeds.error('Error', 'No hay personajes disponibles en el pool gacha.')],
                    flags: 64
                });
            }

            const meta = gachaStore.rarityMeta(pending.character.rarity);
            const expiresAt = Math.floor(pending.expiresAt / 1000);
            const embed = new EmbedBuilder()
                .setColor(meta.color)
                .setTitle(`${meta.emoji} Roll de ${interaction.user.username}`)
                .setDescription(`**${pending.character.name}** · *${pending.character.series}*\nRareza: **${pending.character.rarity}**\nValor: **${pending.character.value}** monedas\n\nUsa **/gacha claim** antes de <t:${expiresAt}:R> para reclamar.`)
                .setFooter({ text: 'Gacha System • EyedBot' })
                .setTimestamp(new Date());
            if (pending.wishlistHit) {
                embed.addFields({ name: '🎯 Wishlist hit', value: 'Este personaje estaba en tu wishlist.', inline: false });
            }
            if (pending.pityThreshold > 0) {
                embed.addFields({ name: 'Pity', value: `${pending.pityCounter}/${pending.pityThreshold}`, inline: true });
            }

            if (pending.character.imageUrl) embed.setImage(pending.character.imageUrl);
            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'claim') {
            const profile = await gachaStore.getProfile(guildId, userId);
            const remaining = (profile.lastClaimAt || 0) + (config.claimCooldownSec * 1000) - Date.now();
            if (remaining > 0) {
                return interaction.reply({
                    embeds: [Embeds.warning('Cooldown de claim', `Debes esperar **${formatCooldown(remaining)}** para reclamar otra vez.`)],
                    flags: 64
                });
            }

            const claimed = await gachaStore.claimPendingRoll(guildId, userId);
            if (!claimed.ok) {
                const map = {
                    missing: 'No tienes un roll pendiente. Usa `/gacha roll`.',
                    expired: 'Tu roll pendiente expiró. Haz otro con `/gacha roll`.',
                    mismatch: 'El roll pendiente no coincide.'
                };
                return interaction.reply({
                    embeds: [Embeds.warning('No se pudo reclamar', map[claimed.reason] || 'Intenta de nuevo.')],
                    flags: 64
                });
            }

            const meta = gachaStore.rarityMeta(claimed.item.rarity);
            const embed = new EmbedBuilder()
                .setColor(meta.color)
                .setTitle(`✅ ${interaction.user.username} reclamó un personaje`)
                .setDescription(`**${claimed.item.name}** (${claimed.item.series})\nRareza: **${claimed.item.rarity}**\nColección total: **${claimed.profile.collectionCount}**\nSaldo: **${claimed.profile.coins}** monedas`)
                .setTimestamp(new Date());
            if (claimed.item.imageUrl) embed.setThumbnail(claimed.item.imageUrl);

            return interaction.reply({ embeds: [embed] });
        }

        if (sub === 'perfil') {
            const targetUser = interaction.options.getUser('usuario') || interaction.user;
            const profile = await gachaStore.getProfile(guildId, targetUser.id);
            const best = profile.bestRarity || '—';
            const embed = new EmbedBuilder()
                .setColor('#7c4dff')
                .setTitle(`📘 Perfil gacha: ${targetUser.username}`)
                .setDescription(`Rolls: **${profile.totalRolls}**\nClaims: **${profile.totalClaims}**\nColección: **${profile.collectionCount}**\nMonedas: **${profile.coins}**\nMejor rareza: **${best}**\nPity actual: **${profile.pityCounter || 0}/${config.pityThreshold || 30}**`)
                .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
                .setTimestamp(new Date());
            return interaction.reply({ embeds: [embed], flags: targetUser.id === interaction.user.id ? 64 : 0 });
        }

        if (sub === 'inventario') {
            const targetUser = interaction.options.getUser('usuario') || interaction.user;
            const rarity = interaction.options.getString('rareza') || '';
            const serie = interaction.options.getString('serie') || '';
            const inv = await gachaStore.listInventory(guildId, targetUser.id, { rarity, series: serie, limit: 20 });
            const lines = inv.items.slice(0, 20).map((item, i) => `**${i + 1}.** [\`${item.uid}\`] **${item.name}** (${item.series}) · ${item.rarity} · 💰${item.value}`);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#7c4dff')
                        .setTitle(`🎒 Inventario: ${targetUser.username}`)
                        .setDescription(lines.length ? lines.join('\n') : 'Sin resultados para los filtros aplicados.')
                        .setFooter({ text: `Mostrando ${Math.min(20, inv.filteredTotal)}/${inv.filteredTotal} (total: ${inv.total})` })
                        .setTimestamp(new Date())
                ],
                flags: targetUser.id === interaction.user.id ? 64 : 0
            });
        }

        if (sub === 'wishlist') {
            const action = interaction.options.getString('accion', true);
            const characterName = interaction.options.getString('personaje') || '';
            if (action === 'add') {
                if (!characterName) {
                    return interaction.reply({ embeds: [Embeds.warning('Falta personaje', 'Debes indicar el nombre para agregar.')], flags: 64 });
                }
                const profile = await gachaStore.addWishlistItem(guildId, userId, characterName);
                return interaction.reply({ embeds: [Embeds.success('Wishlist actualizada', `Añadido: **${characterName}**\nTotal: **${profile.wishlist.length}**`)], flags: 64 });
            }
            if (action === 'remove') {
                if (!characterName) {
                    return interaction.reply({ embeds: [Embeds.warning('Falta personaje', 'Debes indicar el nombre para quitar.')], flags: 64 });
                }
                const profile = await gachaStore.removeWishlistItem(guildId, userId, characterName);
                return interaction.reply({ embeds: [Embeds.success('Wishlist actualizada', `Quitado: **${characterName}**\nTotal: **${profile.wishlist.length}**`)], flags: 64 });
            }
            const profile = await gachaStore.getProfile(guildId, userId);
            const list = (profile.wishlist || []).slice(0, 30).map((x, i) => `${i + 1}. ${x}`).join('\n') || 'Vacía.';
            return interaction.reply({ embeds: [Embeds.info('Tu wishlist', list)], flags: 64 });
        }

        if (sub === 'mercado_publicar') {
            const uid = interaction.options.getString('uid', true);
            const price = interaction.options.getInteger('precio', true);
            const created = await gachaStore.createMarketListing(guildId, userId, uid, price);
            if (!created.ok) {
                const map = { item_not_found: 'No encontré ese UID en tu inventario.' };
                return interaction.reply({ embeds: [Embeds.warning('No se pudo publicar', map[created.reason] || 'Error.')], flags: 64 });
            }
            return interaction.reply({
                embeds: [Embeds.success('Publicado en mercado', `Listing: \`${created.listing.id}\`\nItem: **${created.listing.item.name}** (${created.listing.item.rarity})\nPrecio: **${created.listing.price}** monedas`)]
            });
        }

        if (sub === 'mercado_comprar') {
            const listingId = interaction.options.getString('listing', true);
            const purchased = await gachaStore.buyMarketListing(guildId, userId, listingId);
            if (!purchased.ok) {
                const map = {
                    listing_not_found: 'No existe ese listing.',
                    self_buy: 'No puedes comprarte a ti mismo.',
                    insufficient_funds: 'No tienes monedas suficientes.'
                };
                return interaction.reply({ embeds: [Embeds.warning('Compra fallida', map[purchased.reason] || 'Error.')], flags: 64 });
            }
            return interaction.reply({
                embeds: [Embeds.success('Compra realizada', `Compraste **${purchased.listing.item.name}** por **${purchased.listing.price}** monedas.`)]
            });
        }

        if (sub === 'mercado') {
            const market = await gachaStore.getGuildMarket(guildId);
            const text = market.slice(0, 20).map((row, i) => `**#${i + 1}** \`${row.id}\` · **${row.item.name}** (${row.item.rarity}) · 💰${row.price}`).join('\n') || 'No hay listings activos.';
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#7c4dff')
                        .setTitle('🛒 Mercado gacha')
                        .setDescription(text)
                        .setFooter({ text: `Total listings: ${market.length}` })
                ]
            });
        }

        if (sub === 'top') {
            const stats = await gachaStore.getGuildStats(guildId);
            const guild = interaction.guild;
            const topText = stats.topClaimers.length
                ? await Promise.all(stats.topClaimers.slice(0, 10).map(async (p, i) => {
                    const member = guild.members.cache.get(p.userId) || await guild.members.fetch(p.userId).catch(() => null);
                    const name = member?.user?.username || `ID ${p.userId}`;
                    return `**#${i + 1}** ${name} — Claims: **${p.totalClaims}**, Colección: **${p.collectionCount}**`;
                })).then((arr) => arr.join('\n'))
                : 'No hay datos todavía.';

            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#7c4dff')
                        .setTitle('🏆 Top Gacha del servidor')
                        .setDescription(topText)
                        .setFooter({ text: `Usuarios activos: ${stats.totalUsers} · Rolls totales: ${stats.totalRolls}` })
                        .setTimestamp(new Date())
                ]
            });
        }

        return interaction.reply({
            embeds: [Embeds.error('Acción no válida', 'Subcomando no reconocido.')],
            flags: 64
        });
    }
};
