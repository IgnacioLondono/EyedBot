const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const levelingStore = require('../../utils/leveling-store');
const { getLevelFromXp, getProgress, sanitizeDifficulty } = require('../../utils/leveling-math');
const { parseRoleRewards, getRoleRewardTiersForLevel } = require('../../utils/leveling-rewards');
const { EYED_LEVEL_TIERS, formatLevelRange } = require('../../utils/eyed-tier-catalog');

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
 * Progreso solo para quien ejecuta el comando (consulta propia, ephemeral).
 */
async function runNivelSelf(interaction) {
    const guild = interaction.guild;
    const target = interaction.user;

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
            : 'Ya estás en el tramo alto del nivel actual (no hay siguiente requisito calculado).';

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setAuthor({
            name: target.globalName || target.username,
            iconURL: target.displayAvatarURL({ size: 128 })
        })
        .setTitle('📊 Tu nivel')
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
                    ? 'Solo tú ves este mensaje · EyedBot niveles'
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
                value: 'No hay más roles configurados por encima de tu tramo.'
            });
        }
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
}

/** Rangos Eyed actuales (catálogo en código = datos en tiempo real al ejecutar). Ephemeral: consulta propia. */
async function runRangos(interaction) {
    const fields = EYED_LEVEL_TIERS.map((tier) => ({
        name: `${tier.label} · ${formatLevelRange(tier)}`,
        value: tier.description
    }));

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🌌 Rangos del sistema Eyed')
        .setDescription(
            'Lista **actual** de rangos por nivel numérico y su significado. ' +
                'Los **roles de Discord** y las **recompensas por nivel** los configura el staff en el panel.'
        )
        .addFields(fields)
        .setFooter({ text: 'Solo tú ves este mensaje · Rangos en tiempo real al usar el comando' })
        .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
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
                const lvl = getLevelFromXp(Number(row.xp) || 0, difficulty);
                let sufijo = '';
                if (orden === 'mensajes') {
                    sufijo = ` · **${(Number(row.messageCount) || 0).toLocaleString('es-ES')}** msgs`;
                } else if (orden === 'voz') {
                    sufijo = ` · **${(Number(row.voiceMinutes) || 0).toLocaleString('es-ES')}** min`;
                } else {
                    sufijo = ` · **${(Number(row.xp) || 0).toLocaleString('es-ES')}** XP`;
                }
                const label = escapeDiscordEmbed(
                    await resolveLeaderboardDisplayName(guild, client, row.userId)
                );
                return `**${i + 1}.** ${label} — Nv **${lvl}**${sufijo}`;
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
