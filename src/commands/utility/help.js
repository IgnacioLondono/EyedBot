const fs = require('fs');
const path = require('path');
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');
const config = require('../../config');

const COMMAND_ROOT = path.join(__dirname, '..');

const CATEGORY_META = {
    overview: { label: '📚 Inicio', title: '📚 Ayuda EyedBot' },
    moderation: { label: '🛡️ Moderación', title: '🛡️ Moderación' },
    music: { label: '🎵 Música', title: '🎵 Música' },
    fun: { label: '🎮 Diversión', title: '🎮 Diversión' },
    utility: { label: '⚙️ Utilidades', title: '⚙️ Utilidades' },
    levels: { label: '📊 Niveles', title: '📊 Niveles y XP' },
    config: { label: '🔧 Configuración', title: '🔧 Configuración' }
};

/** Carpeta del comando según el archivo en disco (sin opción /help categoria). */
function findCommandCategory(commandName) {
    const folders = ['moderation', 'music', 'fun', 'levels', 'utility', 'config'];
    for (const folder of folders) {
        const fp = path.join(COMMAND_ROOT, folder, `${commandName}.js`);
        if (fs.existsSync(fp)) return folder;
    }
    return 'utility';
}

function groupCommands(commands) {
    const map = new Map();
    for (const folder of ['moderation', 'music', 'fun', 'levels', 'utility', 'config']) {
        map.set(folder, []);
    }
    for (const cmd of commands.values()) {
        const cat = findCommandCategory(cmd.data.name);
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat).push(cmd);
    }
    for (const arr of map.values()) {
        arr.sort((a, b) => a.data.name.localeCompare(b.data.name));
    }
    return map;
}

/** Misma lógica que los slash de moderación en src/index.js */
function canSeeModerationHelp(interaction) {
    const perms = interaction.memberPermissions;
    if (!perms) return false;

    return (
        perms.has(PermissionFlagsBits.Administrator) ||
        perms.has(PermissionFlagsBits.ManageGuild) ||
        perms.has(PermissionFlagsBits.ManageMessages) ||
        perms.has(PermissionFlagsBits.KickMembers) ||
        perms.has(PermissionFlagsBits.BanMembers) ||
        perms.has(PermissionFlagsBits.ModerateMembers) ||
        perms.has(PermissionFlagsBits.ManageChannels)
    );
}

function countBrowsableCommands(grouped, showModeration) {
    let n =
        (grouped.get('fun') || []).length +
        (grouped.get('utility') || []).length +
        (grouped.get('levels') || []).length +
        (grouped.get('music') || []).length +
        (grouped.get('config') || []).length;
    if (showModeration) n += (grouped.get('moderation') || []).length;
    return n;
}

function fitDescription(lines, maxLen = 3900) {
    let total = 0;
    const out = [];
    for (const line of lines) {
        const chunk = line.length + (out.length ? 1 : 0);
        if (total + chunk > maxLen) {
            out.push('*… (lista recortada por límite de Discord)*');
            break;
        }
        out.push(line);
        total += chunk;
    }
    return out.join('\n');
}

function categoryButton(cat, activeKey, requesterId) {
    const meta = CATEGORY_META[cat];
    const active = activeKey === cat;
    return new ButtonBuilder()
        .setCustomId(`help_nav:${cat}:${requesterId}`)
        .setLabel(meta.label)
        .setStyle(active ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(active);
}

function buildComponentRows(activeKey, requesterId, grouped, showModeration) {
    const row1comps = [];
    if (showModeration) row1comps.push(categoryButton('moderation', activeKey, requesterId));
    row1comps.push(categoryButton('fun', activeKey, requesterId), categoryButton('utility', activeKey, requesterId));
    if ((grouped.get('levels') || []).length > 0) {
        row1comps.push(categoryButton('levels', activeKey, requesterId));
    }
    const row1 = new ActionRowBuilder().addComponents(...row1comps);

    const row2comps = [];
    if ((grouped.get('music') || []).length > 0) {
        row2comps.push(categoryButton('music', activeKey, requesterId));
    }
    row2comps.push(categoryButton('config', activeKey, requesterId));
    row2comps.push(categoryButton('overview', activeKey, requesterId));

    const row2 = new ActionRowBuilder().addComponents(...row2comps);
    return [row1, row2];
}

function buildEmbed(activeKey, grouped, totalCommands, showModeration) {
    if (activeKey === 'overview' || !CATEGORY_META[activeKey]) {
        const browsable = countBrowsableCommands(grouped, showModeration);
        const fields = [];
        if (showModeration) {
            fields.push({
                name: CATEGORY_META.moderation.title,
                value: `${(grouped.get('moderation') || []).length} comandos`,
                inline: true
            });
        }
        fields.push(
            {
                name: CATEGORY_META.fun.title,
                value: `${(grouped.get('fun') || []).length} comandos`,
                inline: true
            },
            {
                name: CATEGORY_META.utility.title,
                value: `${(grouped.get('utility') || []).length} comandos`,
                inline: true
            },
            {
                name: CATEGORY_META.levels.title,
                value: `${(grouped.get('levels') || []).length} comandos`,
                inline: true
            },
            {
                name: CATEGORY_META.music.title,
                value: `${(grouped.get('music') || []).length} comandos`,
                inline: true
            },
            {
                name: CATEGORY_META.config.title,
                value: `${(grouped.get('config') || []).length} comandos`,
                inline: true
            }
        );

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(CATEGORY_META.overview.title)
            .setDescription(
                `Aquí puedes ver **${browsable}** comandos agrupados por categoría.\n` +
                    `*(El bot tiene ${totalCommands} comandos registrados en total.)*\n\n` +
                    'Usa los botones para navegar (solo tú puedes usar este panel).'
            )
            .addFields(fields)
            .setFooter({ text: `Prefijo legacy (si aplica): ${config.prefix}` })
            .setTimestamp();

        return embed;
    }

    if (activeKey === 'levels') {
        const lines = [
            '• `/nivel` — Tu progreso o el de otro usuario (opción miembro): nivel, XP, barra, puesto, mensajes/voz y roles.',
            '• `/rangos` — Roles de nivel configurados en el servidor (con tramo Eyed); si aún no hay, muestra referencia por nivel.',
            '• `/top` — Ranking público del servidor por XP, mensajes o minutos en voz (cantidad 5–25).',
            '• `/canal-niveles` — Canal donde enviar mensajes de texto (sin embed) cuando alguien sube de nivel.'
        ];
        return new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(CATEGORY_META.levels.title)
            .setDescription(fitDescription(lines, 3900))
            .setFooter({ text: `${(grouped.get('levels') || []).length} comando(s) · Prefijo: ${config.prefix}` })
            .setTimestamp();
    }

    const list = grouped.get(activeKey) || [];
    const lines = list.map(
        (cmd) => `• \`/${cmd.data.name}\` — ${cmd.data.description || 'Sin descripción'}`
    );
    const desc =
        list.length > 0
            ? fitDescription(lines)
            : '*No hay comandos cargados en esta categoría (p. ej. música desactivada).*';

    return new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(CATEGORY_META[activeKey].title)
        .setDescription(desc)
        .setFooter({ text: `${list.length} comando(s) · Prefijo: ${config.prefix}` })
        .setTimestamp();
}

async function handleHelpButton(interaction) {
    if (!interaction.isButton() || !interaction.customId?.startsWith('help_nav:')) {
        return false;
    }

    const parts = interaction.customId.split(':');
    if (parts.length < 3 || parts[0] !== 'help_nav') {
        await interaction.reply({ content: 'Menú de ayuda no válido.', ephemeral: true }).catch(() => {});
        return true;
    }

    const category = parts[1];
    const ownerId = parts.slice(2).join(':');
    if (!ownerId || !CATEGORY_META[category]) {
        await interaction.reply({ content: 'Categoría no válida.', ephemeral: true }).catch(() => {});
        return true;
    }

    if (interaction.user.id !== ownerId) {
        await interaction.reply({
            content: '🔒 Solo quien usó `/help` puede usar estos botones.',
            ephemeral: true
        });
        return true;
    }

    const showModeration = canSeeModerationHelp(interaction);
    if (category === 'moderation' && !showModeration) {
        await interaction.reply({
            content: '🔒 No tienes permiso para ver la ayuda de moderación.',
            ephemeral: true
        });
        return true;
    }

    const grouped = groupCommands(interaction.client.commands);
    const embed = buildEmbed(category, grouped, interaction.client.commands.size, showModeration);
    const rows = buildComponentRows(category, ownerId, grouped, showModeration);

    try {
        await interaction.update({ embeds: [embed], components: rows });
    } catch {
        await interaction.followUp({
            embeds: [embed],
            components: rows,
            ephemeral: true
        }).catch(() => null);
    }

    return true;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lista de comandos con navegación por categorías'),
    cooldown: 3,
    handleHelpButton,
    async execute(interaction) {
        try {
            const grouped = groupCommands(interaction.client.commands);
            const uid = interaction.user.id;
            const showModeration = canSeeModerationHelp(interaction);
            const embed = buildEmbed('overview', grouped, interaction.client.commands.size, showModeration);
            const rows = buildComponentRows('overview', uid, grouped, showModeration);

            return interaction.reply({
                embeds: [embed],
                components: rows,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error en help:', error);
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Error')
                        .setDescription('No se pudo mostrar la ayuda.')
                ],
                ephemeral: true
            });
        }
    }
};
