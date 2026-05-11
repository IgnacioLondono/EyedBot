const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const config = require('../config');
const gachaStore = require('./gacha-store');
const { awardMinigameCoins } = require('./economy-rewards');
const economySessions = require('./economy-sessions');
const { safeReply } = require('./interactions');

const RPS_CHOICES = {
    rock: { label: 'Piedra', emoji: '🪨', beats: 'scissors' },
    paper: { label: 'Papel', emoji: '📄', beats: 'rock' },
    scissors: { label: 'Tijera', emoji: '✂️', beats: 'paper' }
};

const COLOR_CHOICES = [
    { id: 'ruby', label: 'Rubí', emoji: '🔴' },
    { id: 'sapphire', label: 'Zafiro', emoji: '🔵' },
    { id: 'emerald', label: 'Esmeralda', emoji: '🟢' },
    { id: 'amethyst', label: 'Amatista', emoji: '🟣' }
];

function disabledRows(rows = []) {
    return rows.map((row) => {
        const next = new ActionRowBuilder();
        for (const component of row.components) {
            if (component instanceof ButtonBuilder) {
                next.addComponents(ButtonBuilder.from(component).setDisabled(true));
            } else {
                next.addComponents(component);
            }
        }
        return next;
    });
}

async function ensureEconomy(interaction) {
    const economy = await gachaStore.getConfig(interaction.guildId);
    if (!economy.economyEnabled) {
        await safeReply(interaction, {
            embeds: [new EmbedBuilder()
                .setColor('#FFAA00')
                .setTitle('Economía desactivada')
                .setDescription('Un admin debe activar la economía desde el panel web o `/gacha configurar`.')],
            flags: 64
        }).catch(() => null);
        return false;
    }
    return true;
}

function rewardLine(reward) {
    if (reward?.ok) {
        return `\n\n💰 Ganaste **${Number(reward.reward || 0).toLocaleString('es-ES')}** monedas.`;
    }
    if (reward?.reason === 'cooldown') return '\n\n⏳ Recompensa en cooldown.';
    return '';
}

function buildRpsRows(ownerId) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mg_rps:${ownerId}:rock`).setLabel('Piedra').setEmoji('🪨').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`mg_rps:${ownerId}:paper`).setLabel('Papel').setEmoji('📄').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`mg_rps:${ownerId}:scissors`).setLabel('Tijera').setEmoji('✂️').setStyle(ButtonStyle.Primary)
        )
    ];
}

function buildDoorRows(ownerId) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`mg_door:${ownerId}:0`).setLabel('Puerta I').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`mg_door:${ownerId}:1`).setLabel('Puerta II').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`mg_door:${ownerId}:2`).setLabel('Puerta III').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
        )
    ];
}

function buildColorRows(ownerId) {
    return [
        new ActionRowBuilder().addComponents(
            ...COLOR_CHOICES.map((choice) => new ButtonBuilder()
                .setCustomId(`mg_color:${ownerId}:${choice.id}`)
                .setLabel(choice.label)
                .setEmoji(choice.emoji)
                .setStyle(ButtonStyle.Secondary))
        )
    ];
}

async function startRps(interaction) {
    if (!await ensureEconomy(interaction)) return true;
    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🪨📄✂️ Piedra, papel o tijera')
        .setDescription('Elige tu jugada. El bot responde al instante y puedes ganar monedas si vences.')
        .setFooter({ text: `Jugador: ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed], components: buildRpsRows(interaction.user.id) });
    return true;
}

async function startDoors(interaction) {
    if (!await ensureEconomy(interaction)) return true;
    const embed = new EmbedBuilder()
        .setColor('#8f6bff')
        .setTitle('🚪 Puertas místicas')
        .setDescription('Tres portales vibran frente a ti. Solo uno guarda un tesoro arcano.')
        .setFooter({ text: `Explorador: ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed], components: buildDoorRows(interaction.user.id) });
    return true;
}

async function startColor(interaction) {
    if (!await ensureEconomy(interaction)) return true;
    const winning = COLOR_CHOICES[Math.floor(Math.random() * COLOR_CHOICES.length)];
    interaction.client.colorMinigames = interaction.client.colorMinigames || {};
    interaction.client.colorMinigames[interaction.user.id] = {
        answer: winning.id,
        label: winning.label,
        expiresAt: Date.now() + 30000
    };

    const embed = new EmbedBuilder()
        .setColor('#f6c244')
        .setTitle('🔮 Orbe de colores')
        .setDescription('Un orbe místico cambia de tonalidad. Elige el cristal que creas correcto antes de que se apague.')
        .setFooter({ text: 'Tienes 30 segundos' });

    await interaction.reply({ embeds: [embed], components: buildColorRows(interaction.user.id) });
    return true;
}

async function handleRpsButton(interaction) {
    const parts = interaction.customId.split(':');
    const ownerId = parts[1];
    const choice = parts[2];
    if (!ownerId || ownerId !== interaction.user.id) {
        await safeReply(interaction, { content: 'Solo quien inició el minijuego puede usar estos botones.', flags: 64 });
        return true;
    }

    const player = RPS_CHOICES[choice];
    if (!player) return true;

    const botKey = Object.keys(RPS_CHOICES)[Math.floor(Math.random() * 3)];
    const bot = RPS_CHOICES[botKey];
    let outcome = 'Empate';
    let color = config.embedColor;
    let reward = null;

    if (player.beats === botKey) {
        outcome = 'Victoria';
        color = '#2ecc71';
        reward = await awardMinigameCoins(interaction.guildId, interaction.user.id, 'rps');
    } else if (bot.beats === choice) {
        outcome = 'Derrota';
        color = '#e74c3c';
    }

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle('🪨📄✂️ Resultado')
        .setDescription([
            `Tu jugada: ${player.emoji} **${player.label}**`,
            `Bot: ${bot.emoji} **${bot.label}**`,
            `Resultado: **${outcome}**${rewardLine(reward)}`
        ].join('\n'))
        .setFooter({ text: interaction.user.tag });

    await interaction.update({ embeds: [embed], components: disabledRows(interaction.message.components) });
    return true;
}

async function handleDoorButton(interaction) {
    const parts = interaction.customId.split(':');
    const ownerId = parts[1];
    const pick = Number.parseInt(parts[2], 10);
    if (!ownerId || ownerId !== interaction.user.id) {
        await safeReply(interaction, { content: 'Solo quien inició el minijuego puede usar estos botones.', flags: 64 });
        return true;
    }

    const winningDoor = Math.floor(Math.random() * 3);
    const reward = pick === winningDoor
        ? await awardMinigameCoins(interaction.guildId, interaction.user.id, 'doors')
        : null;

    const embed = new EmbedBuilder()
        .setColor(pick === winningDoor ? '#2ecc71' : '#e74c3c')
        .setTitle('🚪 Puertas místicas')
        .setDescription([
            `Elegiste la puerta **${pick + 1}**.`,
            `La reliquia estaba en la puerta **${winningDoor + 1}**.`,
            pick === winningDoor
                ? `Abriste un cofre arcano.${rewardLine(reward)}`
                : 'El portal se desvaneció sin recompensa.'
        ].join('\n'))
        .setFooter({ text: interaction.user.tag });

    await interaction.update({ embeds: [embed], components: disabledRows(interaction.message.components) });
    return true;
}

async function handleColorButton(interaction) {
    const parts = interaction.customId.split(':');
    const ownerId = parts[1];
    const choice = parts[2];
    if (!ownerId || ownerId !== interaction.user.id) {
        await safeReply(interaction, { content: 'Solo quien inició el minijuego puede usar estos botones.', flags: 64 });
        return true;
    }

    const session = interaction.client.colorMinigames?.[ownerId];
    if (!session || Date.now() > session.expiresAt) {
        await safeReply(interaction, { content: 'Este orbe ya se apagó.', flags: 64 });
        return true;
    }

    delete interaction.client.colorMinigames[ownerId];
    const correct = choice === session.answer;
    const reward = correct ? await awardMinigameCoins(interaction.guildId, interaction.user.id, 'color') : null;
    const picked = COLOR_CHOICES.find((item) => item.id === choice);

    const embed = new EmbedBuilder()
        .setColor(correct ? '#2ecc71' : '#e74c3c')
        .setTitle('🔮 Orbe de colores')
        .setDescription([
            `Elegiste ${picked?.emoji || '❔'} **${picked?.label || choice}**.`,
            `La resonancia correcta era **${session.label}**.`,
            correct ? `Canalizaste la energía.${rewardLine(reward)}` : 'El orbe se fracturó sin premio.'
        ].join('\n'))
        .setFooter({ text: interaction.user.tag });

    await interaction.update({ embeds: [embed], components: disabledRows(interaction.message.components) });
    return true;
}

function formatOffer(offer = {}) {
    const lines = [];
    if (offer.coins) lines.push(`💰 ${Number(offer.coins).toLocaleString('es-ES')} monedas`);
    if (offer.itemUid) lines.push(`📦 Objeto \`${offer.itemUid}\``);
    return lines.length ? lines.join('\n') : '—';
}

async function handleTradeButton(interaction) {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const sessionId = parts[2];
    const session = await economySessions.getSession(interaction.guildId, sessionId);
    if (!session) {
        await safeReply(interaction, { content: 'Este intercambio ya no está disponible.', flags: 64 });
        return true;
    }

    if (action === 'accept') {
        const result = await economySessions.executeTrade(interaction.guildId, sessionId, interaction.user.id);
        if (!result.ok) {
            const message = result.reason === 'insufficient_funds' || result.reason === 'target_insufficient_funds'
                ? 'Ya no hay fondos u objetos suficientes para completar el intercambio.'
                : 'No se pudo completar el intercambio.';
            await safeReply(interaction, { content: message, flags: 64 });
            return true;
        }

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🤝 Intercambio completado')
            .setDescription('Los objetos y monedas fueron transferidos entre ambos jugadores.')
            .setTimestamp();
        await interaction.update({ embeds: [embed], components: [] });
        return true;
    }

    if (action === 'cancel') {
        const result = await economySessions.cancelTrade(interaction.guildId, sessionId, interaction.user.id);
        if (!result.ok) {
            await safeReply(interaction, { content: 'No puedes cancelar este intercambio.', flags: 64 });
            return true;
        }
        const embed = new EmbedBuilder()
            .setColor('#95a5a6')
            .setTitle('Intercambio cancelado')
            .setDescription('La propuesta de tradeo fue cerrada.')
            .setTimestamp();
        await interaction.update({ embeds: [embed], components: [] });
        return true;
    }

    return false;
}

async function handleVersusButton(interaction) {
    const parts = interaction.customId.split(':');
    const action = parts[1];
    const sessionId = parts[2];
    const session = await economySessions.getSession(interaction.guildId, sessionId);
    if (!session) {
        await safeReply(interaction, { content: 'Este duelo ya no está disponible.', flags: 64 });
        return true;
    }

    if (action === 'reject') {
        const result = await economySessions.declineVersus(interaction.guildId, sessionId, interaction.user.id);
        if (!result.ok) {
            await safeReply(interaction, { content: 'No puedes rechazar este duelo.', flags: 64 });
            return true;
        }
        const embed = new EmbedBuilder()
            .setColor('#95a5a6')
            .setTitle('Duelo cancelado')
            .setDescription('El desafío versus fue cerrado.')
            .setTimestamp();
        await interaction.update({ embeds: [embed], components: [] });
        return true;
    }

    if (action === 'accept') {
        const result = await economySessions.resolveVersus(interaction.guildId, sessionId, interaction.user.id);
        if (!result.ok) {
            const message = result.reason === 'target_insufficient_funds' || result.reason === 'insufficient_funds'
                ? 'Alguno de los jugadores ya no tiene monedas suficientes para la apuesta.'
                : 'No se pudo resolver el duelo.';
            await safeReply(interaction, { content: message, flags: 64 });
            return true;
        }

        const challenger = await interaction.client.users.fetch(session.initiatorId).catch(() => null);
        const target = await interaction.client.users.fetch(session.targetId).catch(() => null);
        const winner = result.winnerId
            ? await interaction.client.users.fetch(result.winnerId).catch(() => null)
            : null;

        const embed = new EmbedBuilder()
            .setColor(result.result === 'tie' ? '#f1c40f' : '#9b59b6')
            .setTitle('⚔️ Duelo versus')
            .setDescription([
                `${challenger?.username || 'Retador'} tiró **${result.rollA}**`,
                `${target?.username || 'Rival'} tiró **${result.rollB}**`,
                result.result === 'tie'
                    ? `Empate. Cada jugador recupera **${Number(session.stake || 0).toLocaleString('es-ES')}** monedas.`
                    : `Ganador: **${winner?.username || 'Desconocido'}** se lleva **${Number(result.pot || 0).toLocaleString('es-ES')}** monedas.`
            ].join('\n'))
            .setTimestamp();

        await interaction.update({ embeds: [embed], components: [] });
        return true;
    }

    return false;
}

async function handleEconomyButton(interaction) {
    if (!interaction.isButton()) return false;
    const customId = interaction.customId || '';
    if (customId.startsWith('mg_rps:')) return handleRpsButton(interaction);
    if (customId.startsWith('mg_door:')) return handleDoorButton(interaction);
    if (customId.startsWith('mg_color:')) return handleColorButton(interaction);
    if (customId.startsWith('trade:')) return handleTradeButton(interaction);
    if (customId.startsWith('versus:')) return handleVersusButton(interaction);
    return false;
}

module.exports = {
    startRps,
    startDoors,
    startColor,
    handleEconomyButton,
    formatOffer
};
