const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');
const levelingStore = require('../../utils/leveling-store');
const { applyXpDeltaToMember } = require('../../events/leveling-tracker');
const { getProgress, sanitizeDifficulty } = require('../../utils/leveling-math');

function formatXp(n) {
    return Math.max(0, Number.parseInt(n, 10) || 0).toLocaleString('es-ES');
}

async function runXpAdjust(interaction, sign) {
    const target = interaction.options.getUser('usuario', true);
    const amount = interaction.options.getInteger('cantidad', true);
    const reason = String(interaction.options.getString('motivo') || '').trim();

    if (target.bot) {
        return interaction.reply({
            embeds: [Embeds.error('No válido', 'No puedes modificar la XP de bots.')],
            flags: 64
        });
    }

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
        return interaction.reply({
            embeds: [Embeds.error('No encontrado', 'Ese usuario no está en este servidor.')],
            flags: 64
        });
    }

    const cfg = await levelingStore.getLevelingConfig(interaction.guild.id);
    if (!cfg || cfg.enabled !== true) {
        return interaction.reply({
            embeds: [
                Embeds.warning(
                    'Sistema desactivado',
                    'Activa el sistema de niveles en el panel web antes de usar `/xp`.'
                )
            ],
            flags: 64
        });
    }

    const delta = sign * amount;
    const result = await applyXpDeltaToMember(member, delta, {
        force: true,
        awardCoins: delta > 0
    });

    if (!result) {
        return interaction.reply({
            embeds: [Embeds.error('Error', 'No se pudo aplicar el cambio de experiencia.')],
            flags: 64
        });
    }

    const difficulty = sanitizeDifficulty(cfg.difficulty);
    const progress = getProgress(result.newXp, difficulty);
    const levelChanged = result.newLevel !== result.oldLevel;
    const verb = sign > 0 ? 'añadida' : 'quitada';

    let description = [
        `**Usuario:** ${target} (\`${target.tag}\`)`,
        `**XP ${verb}:** ${formatXp(amount)}`,
        `**Total XP:** ${formatXp(result.oldXp)} → **${formatXp(result.newXp)}**`,
        `**Nivel:** ${result.oldLevel} → **${result.newLevel}**`,
        `**Progreso actual:** ${progress.percent}% hacia el nivel ${result.newLevel + 1}`
    ].join('\n');

    if (reason) {
        description += `\n**Motivo:** ${reason}`;
    }

    if (levelChanged && sign > 0 && result.newLevel > result.oldLevel) {
        description += '\n\nSe aplicaron recompensas y avisos de subida de nivel si estaban configurados.';
    }

    return interaction.reply({
        embeds: [
            Embeds.success(
                sign > 0 ? 'Experiencia otorgada' : 'Experiencia retirada',
                description
            )
        ],
        flags: 64
    });
}

const userOption = (opt) =>
    opt
        .setName('usuario')
        .setDescription('Miembro al que modificar la experiencia')
        .setRequired(true);

const amountOption = (opt) =>
    opt
        .setName('cantidad')
        .setDescription('Cantidad de XP')
        .setMinValue(1)
        .setRequired(true);

const reasonOption = (opt) =>
    opt.setName('motivo').setDescription('Motivo del ajuste (opcional)').setMaxLength(200).setRequired(false);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('xp')
        .setDescription('Dar o quitar experiencia del sistema de niveles')
        .addSubcommand((sub) =>
            sub
                .setName('dar')
                .setDescription('Añade experiencia a un miembro')
                .addUserOption(userOption)
                .addIntegerOption(amountOption)
                .addStringOption(reasonOption)
        )
        .addSubcommand((sub) =>
            sub
                .setName('quitar')
                .setDescription('Quita experiencia a un miembro')
                .addUserOption(userOption)
                .addIntegerOption(amountOption)
                .addStringOption(reasonOption)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    cooldown: 3,
    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'Este comando solo se puede usar en un servidor.',
                flags: 64
            });
        }

        const sub = interaction.options.getSubcommand();
        if (sub === 'dar') return runXpAdjust(interaction, 1);
        if (sub === 'quitar') return runXpAdjust(interaction, -1);

        return interaction.reply({
            embeds: [Embeds.error('Error', 'Subcomando no reconocido.')],
            flags: 64
        });
    }
};
