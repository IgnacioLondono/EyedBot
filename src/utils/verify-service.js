const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');
const verifyStore = require('./verify-config-store');

const VERIFY_MODES = new Set(['reaction', 'button', 'both']);
const VERIFY_BUTTON_PREFIX = 'verify_btn:';

function verifyButtonCustomIdForGuild(guildId) {
    return `${VERIFY_BUTTON_PREFIX}${guildId}`;
}

function normalizeVerifyMode(mode) {
    const value = String(mode || 'both').toLowerCase();
    return VERIFY_MODES.has(value) ? value : 'both';
}

function normalizeEmojiIdentifier(emoji) {
    if (!emoji) return '';
    if (emoji.id) return String(emoji.id);
    return String(emoji.name || '');
}

function canManageRole(guild, role) {
    const me = guild?.members?.me;
    if (!me || !role) return false;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
    return me.roles.highest.position > role.position;
}

async function resolveVerifyConfig(guild) {
    if (!guild?.id) return null;
    const cfg = await verifyStore.getVerifyConfig(guild.id);
    if (!cfg || cfg.enabled === false) return null;
    if (!cfg.channelId || !cfg.messageId || !cfg.roleId) return null;
    return cfg;
}

async function ensureMember(guild, userId) {
    if (!guild || !userId) return null;
    return guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
}

function collectRestrictedChannelIds(cfg) {
    const ids = Array.isArray(cfg.restrictedChannelIds)
        ? cfg.restrictedChannelIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
    const verifyChannelId = String(cfg.channelId || '').trim();
    if (verifyChannelId && !ids.includes(verifyChannelId)) {
        ids.push(verifyChannelId);
    }
    return [...new Set(ids)];
}

function getMinAccountAgeMs(cfg) {
    const days = Math.max(0, Math.min(365, Number.parseInt(String(cfg.minAccountAgeDays || '0'), 10) || 0));
    return days * 24 * 60 * 60 * 1000;
}

function eligibilityMessage(cfg, result) {
    const messages = {
        already_verified: 'Ya estás verificado.',
        account_too_young: `Tu cuenta es muy reciente. Debe tener al menos ${Math.max(0, Number(cfg.minAccountAgeDays) || 0)} días de antigüedad.`,
        missing_restricted_role: 'No tienes el rol pendiente de verificación.',
        add_failed: 'No pude asignarte el rol. Contacta al staff.',
        bots: 'Los bots no pueden verificarse.',
        role_error: 'El bot no puede administrar el rol de verificado.'
    };
    return messages[result.reason] || 'No se pudo completar la verificación.';
}

async function checkVerificationEligibility(member, cfg) {
    if (!member || member.user?.bot) return { ok: false, reason: 'bots' };
    if (member.roles.cache.has(String(cfg.roleId))) return { ok: false, reason: 'already_verified' };

    const minAgeMs = getMinAccountAgeMs(cfg);
    if (minAgeMs > 0) {
        const accountAge = Date.now() - member.user.createdTimestamp;
        if (accountAge < minAgeMs) {
            return { ok: false, reason: 'account_too_young' };
        }
    }

    if (cfg.requireNewMemberRole === true) {
        const newMemberRoleId = String(cfg.newMemberRoleId || '').trim();
        if (newMemberRoleId && !member.roles.cache.has(newMemberRoleId)) {
            return { ok: false, reason: 'missing_restricted_role' };
        }
    }

    return { ok: true };
}

async function logVerificationEvent(guild, cfg, member, action) {
    const logChannelId = String(cfg.logChannelId || '').trim();
    if (!logChannelId || !guild || !member) return;

    const channel = guild.channels.cache.get(logChannelId) || await guild.channels.fetch(logChannelId).catch(() => null);
    if (!channel || !channel.isTextBased?.()) return;

    const embed = new EmbedBuilder()
        .setColor(action === 'verified' ? 0x22c55e : 0xef4444)
        .setTitle(action === 'verified' ? 'Usuario verificado' : 'Verificación revocada')
        .setDescription(`<@${member.id}> (${member.user.tag})`)
        .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => null);
}

async function completeVerification(member, cfg, auditReason = 'Verificación completada') {
    const guild = member?.guild;
    if (!guild || !cfg?.roleId) return { ok: false, reason: 'role_error' };

    const verifiedRole = guild.roles.cache.get(cfg.roleId) || await guild.roles.fetch(cfg.roleId).catch(() => null);
    if (!verifiedRole || !canManageRole(guild, verifiedRole)) {
        return { ok: false, reason: 'role_error' };
    }

    const eligibility = await checkVerificationEligibility(member, cfg);
    if (!eligibility.ok) return eligibility;

    const added = await member.roles.add(verifiedRole, auditReason).then(() => true).catch(() => false);
    if (!added) return { ok: false, reason: 'add_failed' };

    const newMemberRoleId = String(cfg.newMemberRoleId || '').trim();
    if (newMemberRoleId && newMemberRoleId !== String(cfg.roleId)) {
        const newMemberRole = guild.roles.cache.get(newMemberRoleId)
            || await guild.roles.fetch(newMemberRoleId).catch(() => null);
        if (newMemberRole && canManageRole(guild, newMemberRole) && member.roles.cache.has(newMemberRole.id)) {
            await member.roles.remove(newMemberRole, 'Quitar rol restringido tras verificación').catch(() => null);
        }
    }

    await logVerificationEvent(guild, cfg, member, 'verified');
    return { ok: true };
}

async function revokeVerification(member, cfg, auditReason = 'Verificación revocada') {
    const guild = member?.guild;
    if (!guild || !cfg?.roleId) return { ok: false, reason: 'role_error' };

    const verifiedRole = guild.roles.cache.get(cfg.roleId) || await guild.roles.fetch(cfg.roleId).catch(() => null);
    if (!verifiedRole || !canManageRole(guild, verifiedRole)) {
        return { ok: false, reason: 'role_error' };
    }
    if (!member.roles.cache.has(verifiedRole.id)) return { ok: false, reason: 'not_verified' };

    await member.roles.remove(verifiedRole, auditReason).catch(() => null);

    const shouldReassign =
        cfg.removeRoleOnUnreact === true
        && cfg.reassignRoleOnUnreact !== false
        && String(cfg.newMemberRoleId || '').trim();
    if (shouldReassign) {
        const newMemberRoleId = String(cfg.newMemberRoleId).trim();
        if (newMemberRoleId !== String(cfg.roleId)) {
            const newMemberRole = guild.roles.cache.get(newMemberRoleId)
                || await guild.roles.fetch(newMemberRoleId).catch(() => null);
            if (newMemberRole && canManageRole(guild, newMemberRole) && !member.roles.cache.has(newMemberRole.id)) {
                await member.roles.add(newMemberRole, 'Restaurar rol restringido tras desverificación').catch(() => null);
            }
        }
    }

    await logVerificationEvent(guild, cfg, member, 'revoked');
    return { ok: true };
}

function buildVerifyComponents(guildId, cfg) {
    const mode = normalizeVerifyMode(cfg?.verificationMode);
    if (mode === 'reaction') return [];

    const button = new ButtonBuilder()
        .setCustomId(verifyButtonCustomIdForGuild(guildId))
        .setStyle(ButtonStyle.Success)
        .setLabel(String(cfg?.buttonLabel || 'Verificarme').slice(0, 80));

    return [new ActionRowBuilder().addComponents(button)];
}

function usesReactionVerification(cfg) {
    const mode = normalizeVerifyMode(cfg?.verificationMode);
    return mode === 'reaction' || mode === 'both';
}

function usesButtonVerification(cfg) {
    const mode = normalizeVerifyMode(cfg?.verificationMode);
    return mode === 'button' || mode === 'both';
}

async function syncRestrictedRolePermissions(guild, cfg) {
    const newMemberRoleId = String(cfg?.newMemberRoleId || '').trim();
    if (!newMemberRoleId) {
        return { ok: false, error: 'Configura el rol inicial de nuevo miembro antes de sincronizar permisos.' };
    }

    const role = guild.roles.cache.get(newMemberRoleId) || await guild.roles.fetch(newMemberRoleId).catch(() => null);
    if (!role) {
        return { ok: false, error: 'Rol inicial de nuevo miembro no encontrado.' };
    }
    if (!canManageRole(guild, role)) {
        return { ok: false, error: 'El bot no puede administrar el rol inicial (revisa jerarquía y permiso Gestionar roles).' };
    }

    const me = guild.members.me || await guild.members.fetch(guild.client.user.id).catch(() => null);
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return { ok: false, error: 'El bot necesita el permiso Gestionar canales para sincronizar accesos.' };
    }

    const channelIds = collectRestrictedChannelIds(cfg);
    if (!channelIds.length) {
        return { ok: false, error: 'Selecciona al menos un canal visible para usuarios sin verificar.' };
    }

    let synced = 0;
    const errors = [];

    for (const channelId of channelIds) {
        const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
        if (!channel?.permissionOverwrites) {
            errors.push({ channelId, message: 'Canal no encontrado o sin overwrites.' });
            continue;
        }

        const overwrite = {
            ViewChannel: true
        };
        if (typeof channel.isTextBased === 'function' && channel.isTextBased()) {
            overwrite.SendMessages = true;
            overwrite.ReadMessageHistory = true;
            overwrite.AddReactions = true;
        }
        if (typeof channel.isVoiceBased === 'function' && channel.isVoiceBased()) {
            overwrite.Connect = true;
            overwrite.Speak = true;
        }

        try {
            await channel.permissionOverwrites.edit(role, overwrite, 'EyedBot: sincronizar acceso de rol sin verificar');
            synced += 1;
        } catch (error) {
            errors.push({ channelId, message: error.message || 'No se pudo actualizar el canal.' });
        }
    }

    return { ok: true, synced, errors, channelIds };
}

async function handleVerifyButton(interaction) {
    if (!interaction?.isButton?.()) return false;
    if (!interaction.customId.startsWith(VERIFY_BUTTON_PREFIX)) return false;

    const guildId = interaction.customId.slice(VERIFY_BUTTON_PREFIX.length);
    if (guildId !== interaction.guildId) return false;

    const cfg = await resolveVerifyConfig(interaction.guild);
    if (!cfg || !usesButtonVerification(cfg)) {
        await interaction.reply({ content: 'La verificación por botón no está activa.', flags: 64 }).catch(() => null);
        return true;
    }

    if (String(interaction.message?.id) !== String(cfg.messageId)) {
        await interaction.reply({
            content: 'Este botón ya no es válido. Usa el mensaje actual de verificación.',
            flags: 64
        }).catch(() => null);
        return true;
    }

    const member = interaction.member
        || await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member) {
        await interaction.reply({ content: 'No pude obtener tu perfil en el servidor.', flags: 64 }).catch(() => null);
        return true;
    }

    const result = await completeVerification(member, cfg, 'Verificación por botón');
    const content = result.ok
        ? 'Verificación completada. Ya tienes acceso al servidor.'
        : eligibilityMessage(cfg, result);

    await interaction.reply({ content, flags: 64 }).catch(() => null);
    return true;
}

module.exports = {
    VERIFY_BUTTON_PREFIX,
    verifyButtonCustomIdForGuild,
    normalizeVerifyMode,
    normalizeEmojiIdentifier,
    canManageRole,
    resolveVerifyConfig,
    ensureMember,
    collectRestrictedChannelIds,
    checkVerificationEligibility,
    completeVerification,
    revokeVerification,
    buildVerifyComponents,
    usesReactionVerification,
    usesButtonVerification,
    syncRestrictedRolePermissions,
    handleVerifyButton,
    eligibilityMessage
};
