const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../../config');
const levelingStore = require('../../utils/leveling-store');
const { getLevelFromXp, getProgress, sanitizeDifficulty } = require('../../utils/leveling-math');
const { parseRoleRewards, getRoleRewardTiersForLevel } = require('../../utils/leveling-rewards');
const { getEyedTiersForGuild, formatLevelRange } = require('../../utils/eyed-tier-catalog');

function progressBar(percent, width = 14) {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    const filled = Math.round((p / 100) * width);
    return `${'█'.repeat(Math.min(width, filled))}${'░'.repeat(Math.max(0, width - filled))}`;
}

async function formatRoleLine(guild, roleId) {
    const id = String(roleId || '').trim();
    if (!id) return null;
    const role =
        guild.roles.cache.get(id) || (await guild.roles.fetch(id).catch(() => null));
    if (role) return `<@&${role.id}> (${role.name})`;
    return `\`${id}\` (rol no encontrado)`;
}

/** Solo mención `<@&id>` (sin nombre duplicado); para `/rangos`. */
async function formatRoleMentionOnly(guild, roleId) {
    const id = String(roleId || '').trim();
    if (!id) return null;
    const role =
        guild.roles.cache.get(id) || (await guild.roles.fetch(id).catch(() => null));
    if (role) return `<@&${role.id}>`;
    return `\`${id}\``;
}

function escapeDiscordEmbed(text) {
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/\*/g, '\\*')
        .replace(/_/g, '\\_')
        .replace(/`/g, '\\`')
        .replace(/~/g, '\\~')
        .replace(/\|/g, '\\|');
}

async function resolveLeaderboardDisplayName(guild, client, userId) {
    const id = String(userId);
    const cached = guild.members.cache.get(id);
    if (cached) {
        const n = cached.displayName || cached.user?.username;
        if (n) return n;
    }
    const member = await guild.members.fetch(id).catch(() => null);
    if (member) {
        return member.displayName || member.user?.username || id;
    }
    const user = await client.users.fetch(id).catch(() => null);
    if (user) {
        return user.globalName || user.username || id;
    }
    return `Usuario (${id.slice(-6)})`;
}

/**
 * Progreso de nivel (tuyo u otro usuario). Respuesta solo visible para quien ejecuta (ephemeral).
 */
async function runNivelSelf(interaction) {
    const guild = interaction.guild;
    const target = interaction.options.getUser('usuario') || interaction.user;
    const isSelf = target.id === interaction.user.id;

    const cfg = await levelingStore.getLevelingConfig(guild.id);
    const difficulty = sanitizeDifficulty(cfg?.difficulty);

    const state = await levelingStore.getUserState(guild.id, target.id);
    const xp = Math.max(0, Number.parseInt(state.xp || 0, 10) || 0);

    let merged = await levelingStore.listGuildUsersMerged(guild.id);
    if (!merged.some((u) => String(u.userId) === String(target.id))) {
        merged = [...merged, { userId: target.id, ...levelingStore.normalizeUserState(state) }];
    }

    const sorted = [...merged].sort((a, b) => (Number(b.xp || 0) || 0) - (Number(a.xp || 0) || 0));
    const rankIdx = sorted.findIndex((u) => String(u.userId) === String(target.id));
    const rankText = rankIdx === -1 ? 'Sin clasificar' : `#${rankIdx + 1}`;

    const level = getLevelFromXp(xp, difficulty);
    const prog = getProgress(xp, difficulty);

    const siguiente =
        prog.nextNeed > 0
            ? `\`${progressBar(prog.percent)}\` **${prog.percent}%**\n${prog.intoLevel.toLocaleString('es-ES')} / ${prog.nextNeed.toLocaleString('es-ES')} XP → nivel **${level + 1}**`
            : isSelf
                ? 'Ya estás en el tramo alto del nivel actual (no hay siguiente requisito calculado).'
                : 'Este usuario está en el tramo alto del nivel actual (no hay siguiente requisito calculado).';

    const titleNivel = isSelf ? '📊 Tu nivel' : '📊 Progreso de nivel';

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setAuthor({
            name: target.globalName || target.username,
            iconURL: target.displayAvatarURL({ size: 128 })
        })
        .setTitle(titleNivel)
        .addFields(
            { name: 'Nivel', value: `**${level}**`, inline: true },
            { name: 'XP total', value: `**${xp.toLocaleString('es-ES')}**`, inline: true },
            { name: 'Puesto en el servidor', value: rankText, inline: true },
            { name: 'Camino al siguiente nivel', value: siguiente },
            {
                name: 'Actividad registrada',
                value: `Mensajes: **${(Number(state.messageCount) || 0).toLocaleString('es-ES')}**\nVoz: **${(Number(state.voiceMinutes) || 0).toLocaleString('es-ES')}** min`
            }
        )
        .setFooter({
            text:
                cfg?.enabled === true
                    ? `Pedido por ${interaction.user.tag}`
                    : `Sistema de niveles desactivado (solo lectura) · ${interaction.user.tag}`
        })
        .setTimestamp();

    const rewardsSorted = parseRoleRewards(cfg?.roleRewards);
    if (rewardsSorted.length > 0) {
        const { current, next } = getRoleRewardTiersForLevel(level, rewardsSorted);
        const member = await guild.members.fetch(target.id).catch(() => null);

        if (current) {
            const line = await formatRoleLine(guild, current.roleId);
            const tiene = member ? member.roles.cache.has(current.roleId) : false;
            const enServidor = !member ? '—' : tiene ? 'Sí' : 'No';
            if (line) {
                embed.addFields({
                    name: '🎭 Rol del sistema (tramo actual)',
                    value: `${line}\nNivel mínimo: **${current.level}** · En Discord: **${enServidor}**`
                });
            }
        }

        if (next) {
            const lineNext = await formatRoleLine(guild, next.roleId);
            if (lineNext) {
                embed.addFields({
                    name: '⏭️ Siguiente rol',
                    value: `${lineNext}\nSe desbloquea al llegar a nivel **${next.level}**`
                });
            }
        } else if (current && rewardsSorted.length > 0) {
            embed.addFields({
                name: '⏭️ Siguiente rol',
                value: isSelf
                    ? 'No hay más roles configurados por encima de tu tramo.'
                    : 'No hay más roles configurados por encima de su tramo.'
            });
        }
    }

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

/** Lista roles de nivel configurados en el servidor (`roleRewards`); si no hay, muestra referencia Eyed. */
async function runRangos(interaction) {
    const guild = interaction.guild;
    const cfg = await levelingStore.getLevelingConfig(guild.id);
    const rewardsSorted = parseRoleRewards(cfg?.roleRewards);

    if (rewardsSorted.length === 0) {
        const refLines = getEyedTiersForGuild(cfg).map((t) => `**${formatLevelRange(t)}** · ${t.label}`).join('\n');
        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('Nivel para conseguir')
            .setDescription(`Sin roles en el panel.\n\n${refLines}`)
            .setFooter({ text: interaction.user.username })
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const MAX_FIELDS = 25;
    let slice = rewardsSorted;
    let moreCount = 0;
    if (rewardsSorted.length > MAX_FIELDS) {
        slice = rewardsSorted.slice(0, MAX_FIELDS - 1);
        moreCount = rewardsSorted.length - slice.length;
    }

    const fields = await Promise.all(
        slice.map(async (reward) => {
            const mention = (await formatRoleMentionOnly(guild, reward.roleId)) || `\`${reward.roleId}\``;
            return {
                name: `Nv ${reward.level}+`,
                value: mention.slice(0, 1024)
            };
        })
    );

    if (moreCount > 0) {
        fields.push({
            name: '…',
            value: `**+${moreCount}** más en el panel.`.slice(0, 1024)
        });
    }

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('Nivel para conseguir')
        .addFields(fields)
        .setFooter({ text: interaction.user.username })
        .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function runTop(interaction) {
    const guild = interaction.guild;
    const orden = interaction.options.getString('orden') || 'xp';
    const cantidad = interaction.options.getInteger('cantidad') || 10;
    const take = Math.min(25, Math.max(5, cantidad));

    const cfg = await levelingStore.getLevelingConfig(guild.id);
    const difficulty = sanitizeDifficulty(cfg?.difficulty);

    const merged = await levelingStore.listGuildUsersMerged(guild.id);
    const sortKey = orden === 'mensajes' ? 'messageCount' : orden === 'voz' ? 'voiceMinutes' : 'xp';
    const sorted = [...merged]
        .sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0))
        .filter((u) => (Number(u[sortKey]) || 0) > 0);

    if (!sorted.length) {
        return interaction.reply({
            content: 'Aún no hay datos suficientes para un ranking en este servidor.'
        });
    }

    await interaction.deferReply();

    const ordenLabel = orden === 'mensajes' ? 'mensajes' : orden === 'voz' ? 'minutos en voz' : 'XP';
    const slice = sorted.slice(0, take);
    const client = interaction.client;

    try {
        const lines = await Promise.all(
            slice.map(async (row, i) => {
                const xp = Math.max(0, Number.parseInt(row.xp || 0, 10) || 0);
                const prog = getProgress(xp, difficulty);
                const lvl = prog.level;
                let sufijo = '';
                if (orden === 'mensajes') {
                    sufijo = ` · **${(Number(row.messageCount) || 0).toLocaleString('es-ES')}** msgs`;
                } else if (orden === 'voz') {
                    sufijo = ` · **${(Number(row.voiceMinutes) || 0).toLocaleString('es-ES')}** min`;
                } else {
                    sufijo = ` · **${xp.toLocaleString('es-ES')}** XP`;
                }
                const label = escapeDiscordEmbed(
                    await resolveLeaderboardDisplayName(guild, client, row.userId)
                );
                return `**${i + 1}.** ${label} — Nv **${lvl}** · **${prog.percent}%**${sufijo}`;
            })
        );

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`🏆 Ranking por ${ordenLabel}`)
            .setDescription(lines.join('\n'))
            .setFooter({
                text:
                    cfg?.enabled === true
                        ? `Mostrando ${slice.length} de ${sorted.length} · ${interaction.user.tag}`
                        : `Niveles desactivados (solo datos guardados) · ${interaction.user.tag}`
            })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('top niveles:', error);
        return interaction.editReply({
            content: 'No se pudo armar el ranking. Probá de nuevo en unos segundos.'
        });
    }
}

module.exports = {
    runNivelSelf,
    runRangos,
    runTop
};
