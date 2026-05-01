const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');
const levelingStore = require('../../utils/leveling-store');
const { getLevelFromXp, getProgress, sanitizeDifficulty } = require('../../utils/leveling-math');
const { parseRoleRewards, getRoleRewardTiersForLevel } = require('../../utils/leveling-rewards');

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

async function runRango(interaction) {
    const guild = interaction.guild;
    const target = interaction.options.getUser('usuario') || interaction.user;
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
        .setTitle('📊 Progreso de nivel')
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
                value: 'No hay más roles configurados por encima de tu tramo.'
            });
        }
    }

    return interaction.reply({ embeds: [embed] });
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
            content: 'Aún no hay datos suficientes para un ranking en este servidor.',
            flags: 64
        });
    }

    const ordenLabel = orden === 'mensajes' ? 'mensajes' : orden === 'voz' ? 'minutos en voz' : 'XP';

    const lines = [];
    const slice = sorted.slice(0, take);
    for (let i = 0; i < slice.length; i++) {
        const row = slice[i];
        const lvl = getLevelFromXp(Number(row.xp) || 0, difficulty);
        let sufijo = '';
        if (orden === 'mensajes') sufijo = ` · **${(Number(row.messageCount) || 0).toLocaleString('es-ES')}** msgs`;
        else if (orden === 'voz') sufijo = ` · **${(Number(row.voiceMinutes) || 0).toLocaleString('es-ES')}** min`;
        else sufijo = ` · **${(Number(row.xp) || 0).toLocaleString('es-ES')}** XP`;
        lines.push(`**${i + 1}.** <@${row.userId}> — Nv **${lvl}**${sufijo}`);
    }

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

    return interaction.reply({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('niveles')
        .setDescription('Consulta tu progreso de nivel y los rankings del servidor')
        .addSubcommand((sub) =>
            sub
                .setName('rango')
                .setDescription('Nivel, XP total y barra de progreso al siguiente rango')
                .addUserOption((opt) =>
                    opt.setName('usuario').setDescription('Miembro a consultar (por defecto tú)').setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName('top')
                .setDescription('Lista de los usuarios más destacados')
                .addStringOption((opt) =>
                    opt
                        .setName('orden')
                        .setDescription('Criterio de clasificación')
                        .setRequired(false)
                        .addChoices(
                            { name: 'XP total', value: 'xp' },
                            { name: 'Mensajes', value: 'mensajes' },
                            { name: 'Tiempo en voz', value: 'voz' }
                        )
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName('cantidad')
                        .setDescription('Cantidad de puestos (5 a 25)')
                        .setMinValue(5)
                        .setMaxValue(25)
                        .setRequired(false)
                )
        ),
    cooldown: 4,
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'Este comando solo se puede usar dentro de un servidor.',
                flags: 64
            });
        }

        const sub = interaction.options.getSubcommand();
        if (sub === 'rango') return runRango(interaction);
        if (sub === 'top') return runTop(interaction);
        return interaction.reply({ content: 'Subcomando no reconocido.', flags: 64 });
    }
};
