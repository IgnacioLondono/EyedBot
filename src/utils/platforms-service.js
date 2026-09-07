'use strict';

const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder
} = require('discord.js');
const platformsStore = require('./platforms-config-store');

const BUTTON_PREFIX = 'platforms_btn:';
const SELECT_PREFIX = 'platforms_sel:';

const PACK_EMOJI_FILES = {
    pc: 'pc.png',
    playstation: 'playstation.png',
    xbox: 'xbox.png',
    nintendo: 'nintendo_switch.png',
    steam: 'steam.gif'
};

function packDir() {
    return path.join(__dirname, '..', '..', 'assets', 'server-emojis', 'discord-ready');
}

function canManageRole(guild, role) {
    const me = guild?.members?.me;
    if (!me || !role) return false;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
    return me.roles.highest.position > role.position;
}

/**
 * Parsea emoji unicode o custom <:name:id> / <a:name:id> / solo id numérico.
 * @returns {{ buttonEmoji: object|string|null, mention: string, id: string|null, name: string|null, animated: boolean }}
 */
function parsePlatformEmoji(raw = '') {
    const value = String(raw || '').trim();
    if (!value) {
        return { buttonEmoji: null, mention: '', id: null, name: null, animated: false };
    }

    const custom = value.match(/^<(a)?:([a-zA-Z0-9_]{2,32}):(\d{17,20})>$/);
    if (custom) {
        const animated = Boolean(custom[1]);
        const name = custom[2];
        const id = custom[3];
        return {
            buttonEmoji: { id, name, animated },
            mention: `<${animated ? 'a' : ''}:${name}:${id}>`,
            id,
            name,
            animated
        };
    }

    if (/^\d{17,20}$/.test(value)) {
        return {
            buttonEmoji: { id: value },
            mention: value,
            id: value,
            name: null,
            animated: false
        };
    }

    // Unicode / short text for button label fallback
    return {
        buttonEmoji: value.slice(0, 8),
        mention: value,
        id: null,
        name: null,
        animated: false
    };
}

function enabledPlatforms(cfg) {
    return (cfg?.platforms || []).filter((p) => p && p.enabled !== false && p.id);
}

function buildPlatformsEmbed(cfg, guild) {
    const platforms = enabledPlatforms(cfg);
    const lines = platforms.map((p) => {
        const parsed = parsePlatformEmoji(p.emoji);
        const icon = parsed.mention || '•';
        const role = p.roleId ? `<@&${p.roleId}>` : '_sin rol_';
        return `${icon} **${p.label}** — ${role}`;
    });

    const embed = new EmbedBuilder()
        .setColor(String(cfg.color || '7c4dff').replace('#', ''))
        .setTitle(String(cfg.title || '¿En qué jugás?').slice(0, 256))
        .setDescription(
            [
                String(cfg.message || '').trim(),
                lines.length ? `\n${lines.join('\n')}` : ''
            ]
                .filter(Boolean)
                .join('\n')
                .slice(0, 4096)
        );

    if (cfg.footer) embed.setFooter({ text: String(cfg.footer).slice(0, 2048) });
    if (guild?.iconURL) {
        try {
            const icon = guild.iconURL({ size: 128 });
            if (icon) embed.setThumbnail(icon);
        } catch {
            // noop
        }
    }
    return embed;
}

function buildPlatformsComponents(guildId, cfg) {
    const platforms = enabledPlatforms(cfg).filter((p) => p.roleId);
    if (!platforms.length) return [];

    const mode = String(cfg.mode || 'buttons').toLowerCase() === 'select' ? 'select' : 'buttons';

    if (mode === 'select') {
        const menu = new StringSelectMenuBuilder()
            .setCustomId(`${SELECT_PREFIX}${guildId}`)
            .setPlaceholder('Elegí tus plataformas')
            .setMinValues(0)
            .setMaxValues(Math.min(25, platforms.length));

        for (const p of platforms.slice(0, 25)) {
            const option = {
                label: String(p.label || p.id).slice(0, 100),
                value: String(p.id).slice(0, 100),
                description: `Rol de ${p.label}`.slice(0, 100)
            };
            const parsed = parsePlatformEmoji(p.emoji);
            if (parsed.buttonEmoji) {
                try {
                    option.emoji = parsed.buttonEmoji;
                } catch {
                    // skip invalid emoji
                }
            }
            menu.addOptions(option);
        }
        return [new ActionRowBuilder().addComponents(menu)];
    }

    const rows = [];
    let current = new ActionRowBuilder();
    for (const p of platforms.slice(0, 25)) {
        if (current.components.length >= 5) {
            rows.push(current);
            current = new ActionRowBuilder();
        }
        const btn = new ButtonBuilder()
            .setCustomId(`${BUTTON_PREFIX}${guildId}:${p.id}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel(String(p.label || p.id).slice(0, 80));
        const parsed = parsePlatformEmoji(p.emoji);
        if (parsed.buttonEmoji) {
            try {
                btn.setEmoji(parsed.buttonEmoji);
            } catch {
                // skip
            }
        }
        current.addComponents(btn);
    }
    if (current.components.length) rows.push(current);
    return rows;
}

async function togglePlatformRole(member, cfg, platformId) {
    const guild = member.guild;
    const platforms = enabledPlatforms(cfg);
    const target = platforms.find((p) => p.id === platformId);
    if (!target?.roleId) return { ok: false, reason: 'unknown_platform' };

    const role =
        guild.roles.cache.get(target.roleId) || (await guild.roles.fetch(target.roleId).catch(() => null));
    if (!role || !canManageRole(guild, role)) return { ok: false, reason: 'role_error' };

    const hasRole = member.roles.cache.has(role.id);
    if (hasRole) {
        await member.roles.remove(role, 'EyedBot: plataforma desmarcada');
        return { ok: true, action: 'removed', platform: target, role };
    }

    if (cfg.exclusive === true) {
        const otherIds = platforms
            .filter((p) => p.id !== target.id && p.roleId)
            .map((p) => p.roleId)
            .filter((id) => member.roles.cache.has(id));
        if (otherIds.length) {
            await member.roles.remove(otherIds, 'EyedBot: plataforma exclusiva');
        }
    }

    await member.roles.add(role, 'EyedBot: plataforma marcada');
    return { ok: true, action: 'added', platform: target, role };
}

async function syncPlatformRolesFromSelect(member, cfg, selectedIds = []) {
    const guild = member.guild;
    const platforms = enabledPlatforms(cfg).filter((p) => p.roleId);
    const selected = new Set((selectedIds || []).map((id) => String(id)));

    const toAdd = [];
    const toRemove = [];

    for (const p of platforms) {
        const has = member.roles.cache.has(p.roleId);
        const want = selected.has(p.id);
        if (want && !has) toAdd.push(p.roleId);
        if (!want && has) toRemove.push(p.roleId);
    }

    // Exclusive: keep only first selected
    if (cfg.exclusive === true && toAdd.length > 1) {
        const keep = toAdd[0];
        for (const id of toAdd.slice(1)) toRemove.push(id);
        toAdd.length = 0;
        if (!member.roles.cache.has(keep)) toAdd.push(keep);
    }

    for (const roleId of [...new Set(toAdd)]) {
        const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
        if (role && canManageRole(guild, role)) {
            await member.roles.add(role, 'EyedBot: plataformas (select)').catch(() => null);
        }
    }
    for (const roleId of [...new Set(toRemove)]) {
        if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId, 'EyedBot: plataformas (select)').catch(() => null);
        }
    }

    return { ok: true };
}

async function handlePlatformsButton(interaction) {
    if (!interaction.isButton?.()) return false;
    if (!interaction.customId.startsWith(BUTTON_PREFIX)) return false;

    const rest = interaction.customId.slice(BUTTON_PREFIX.length);
    const sep = rest.indexOf(':');
    if (sep < 0) return false;
    const guildId = rest.slice(0, sep);
    const platformId = rest.slice(sep + 1);
    if (interaction.guildId !== guildId) {
        await interaction.reply({ content: 'Este panel no pertenece a este servidor.', flags: 64 }).catch(() => null);
        return true;
    }

    const cfg = await platformsStore.getPlatformsConfig(guildId);
    if (!cfg || cfg.enabled === false) {
        await interaction.reply({ content: 'El panel de plataformas está desactivado.', flags: 64 }).catch(() => null);
        return true;
    }

    const member = interaction.member;
    if (!member || member.user?.bot) {
        await interaction.reply({ content: 'No pude obtener tu miembro.', flags: 64 }).catch(() => null);
        return true;
    }

    await interaction.deferReply({ flags: 64 }).catch(() => null);
    try {
        const result = await togglePlatformRole(member, cfg, platformId);
        if (!result.ok) {
            const msg =
                result.reason === 'role_error'
                    ? 'El bot no puede administrar ese rol (jerarquía / permisos).'
                    : 'Plataforma no configurada.';
            await interaction.editReply({ content: msg });
            return true;
        }
        const verb = result.action === 'added' ? 'añadiste' : 'quitaste';
        await interaction.editReply({
            content: `Listo: ${verb} **${result.platform.label}** (${result.role}).`
        });
    } catch (error) {
        await interaction.editReply({ content: `Error: ${error.message || 'no se pudo actualizar el rol'}` }).catch(() => null);
    }
    return true;
}

async function handlePlatformsSelect(interaction) {
    if (!interaction.isStringSelectMenu?.()) return false;
    if (!interaction.customId.startsWith(SELECT_PREFIX)) return false;

    const guildId = interaction.customId.slice(SELECT_PREFIX.length);
    if (interaction.guildId !== guildId) {
        await interaction.reply({ content: 'Este panel no pertenece a este servidor.', flags: 64 }).catch(() => null);
        return true;
    }

    const cfg = await platformsStore.getPlatformsConfig(guildId);
    if (!cfg || cfg.enabled === false) {
        await interaction.reply({ content: 'El panel de plataformas está desactivado.', flags: 64 }).catch(() => null);
        return true;
    }

    const member = interaction.member;
    if (!member || member.user?.bot) {
        await interaction.reply({ content: 'No pude obtener tu miembro.', flags: 64 }).catch(() => null);
        return true;
    }

    await interaction.deferReply({ flags: 64 }).catch(() => null);
    try {
        await syncPlatformRolesFromSelect(member, cfg, interaction.values || []);
        const labels = enabledPlatforms(cfg)
            .filter((p) => (interaction.values || []).includes(p.id))
            .map((p) => p.label);
        await interaction.editReply({
            content: labels.length
                ? `Plataformas actualizadas: **${labels.join(', ')}**.`
                : 'Quitaste todos los roles de plataforma.'
        });
    } catch (error) {
        await interaction.editReply({ content: `Error: ${error.message || 'no se pudo actualizar'}` }).catch(() => null);
    }
    return true;
}

/**
 * Sube emojis del pack local al guild y actualiza la config.
 */
async function uploadPackEmojisToGuild(guild, cfg) {
    const dir = packDir();
    const me = guild.members.me;
    if (!me?.permissions?.has?.(PermissionFlagsBits.ManageGuildExpressions)) {
        // Compat djs antiguos
        const legacy = PermissionFlagsBits.ManageEmojisAndStickers;
        if (!legacy || !me?.permissions?.has?.(legacy)) {
            const e = new Error('El bot necesita permiso para gestionar emojis del servidor.');
            e.statusCode = 403;
            throw e;
        }
    }

    const nextPlatforms = [];
    const uploaded = [];
    const skipped = [];

    for (const platform of cfg.platforms || []) {
        const fileName = PACK_EMOJI_FILES[platform.id];
        if (!fileName) {
            nextPlatforms.push(platform);
            continue;
        }
        const filePath = path.join(dir, fileName);
        if (!fs.existsSync(filePath)) {
            skipped.push({ id: platform.id, reason: 'archivo no encontrado' });
            nextPlatforms.push(platform);
            continue;
        }

        const emojiName = `plat_${platform.id}`.replace(/-/g, '_').slice(0, 32);
        const existing = guild.emojis.cache.find((em) => em.name === emojiName);
        let emoji = existing;
        if (!emoji) {
            try {
                emoji = await guild.emojis.create({
                    attachment: filePath,
                    name: emojiName,
                    reason: 'EyedBot: pack plataformas'
                });
                uploaded.push(emojiName);
            } catch (error) {
                skipped.push({ id: platform.id, reason: error.message || 'upload failed' });
                nextPlatforms.push(platform);
                continue;
            }
        } else {
            skipped.push({ id: platform.id, reason: 'ya existía' });
        }

        const mention = `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`;
        nextPlatforms.push({ ...platform, emoji: mention });
    }

    return {
        platforms: nextPlatforms,
        uploaded,
        skipped
    };
}

module.exports = {
    BUTTON_PREFIX,
    SELECT_PREFIX,
    PACK_EMOJI_FILES,
    parsePlatformEmoji,
    canManageRole,
    buildPlatformsEmbed,
    buildPlatformsComponents,
    handlePlatformsButton,
    handlePlatformsSelect,
    uploadPackEmojisToGuild,
    enabledPlatforms
};
