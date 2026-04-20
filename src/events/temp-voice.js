const {
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const tempVoiceStore = require('../utils/temp-voice-store');
const { CONTROL_BUTTON_PREFIX } = require('./temp-voice-constants');

function sanitizeChannelName(raw = '') {
    const cleaned = String(raw || '')
        .trim()
        .replace(/[\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[<>@#:`]/g, '')
        .slice(0, 95);
    return cleaned;
}

function buildChannelName(member, config, preferredName = '') {
    const username = member.user?.username || 'Usuario';
    const displayName = member.displayName || username;

    if (config.allowCustomNames && preferredName) {
        return sanitizeChannelName(preferredName) || `Canal de ${username}`;
    }

    const template = String(config.channelNameTemplate || 'Canal de {username}')
        .replace(/\{username\}/gi, username)
        .replace(/\{displayName\}/gi, displayName)
        .replace(/\{user\}/gi, username);

    return sanitizeChannelName(template) || `Canal de ${username}`;
}

function buildManagementRows(channelId, isLocked = false) {
    const id = String(channelId || '').trim();

    const rowA = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${CONTROL_BUTTON_PREFIX}locktoggle_${id}`)
            .setLabel(isLocked ? 'Desbloquear' : 'Bloquear')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`${CONTROL_BUTTON_PREFIX}rename_${id}`)
            .setLabel('Renombrar')
            .setStyle(ButtonStyle.Primary)
    );

    const rowB = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${CONTROL_BUTTON_PREFIX}limit_${id}`)
            .setLabel('Limite')
            .setStyle(ButtonStyle.Secondary)
    );

    return [rowA, rowB];
}

function buildManagementPanelPayload(channel, ownerId, config = {}, extra = {}) {
    if (!channel) return null;

    const baseName = channel.name || 'Canal temporal';
    const resolvedLimit = extra && Number.isFinite(extra.userLimit)
        ? extra.userLimit
        : (channel.userLimit || config?.userLimit || 0);
    const userLimit = Math.max(0, Number.parseInt(resolvedLimit, 10) || 0);
    const everyRole = channel.guild.roles.everyone;
    const connectOverwrite = channel.permissionOverwrites.cache.get(everyRole.id);
    const derivedLocked = connectOverwrite?.deny?.has(PermissionsBitField.Flags.Connect) === true;
    const isLocked = typeof extra?.isLocked === 'boolean' ? extra.isLocked : derivedLocked;
    const ownerMember = channel.guild.members.cache.get(ownerId) || null;
    const ownerName = ownerMember?.displayName || ownerMember?.user?.username || 'Propietario';
    const ownerTag = ownerMember?.user?.tag || `<@${ownerId}>`;
    const ownerAvatar = ownerMember?.displayAvatarURL?.({ dynamic: true, size: 128 }) || null;

    const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('Panel de gestion de canal de voz')
        .setDescription('Administra tu canal temporal desde este panel.')
        .addFields(
            { name: 'Canal', value: `**${baseName}**`, inline: false },
            { name: 'Estado del canal', value: isLocked ? 'Bloqueado' : 'Abierto', inline: true },
            { name: 'Limite', value: userLimit > 0 ? `${userLimit} usuarios` : 'Sin limite', inline: true },
            { name: 'Propietario', value: `${ownerTag}\n${ownerName}`, inline: true },
            {
                name: 'Invitar usuarios',
                value: 'Usa `/vozinvitar (nombre)`.\nPrimero debes bloquear tu canal desde este panel.',
                inline: false
            }
        );

    if (ownerAvatar) {
        embed.setThumbnail(ownerAvatar);
        embed.setAuthor({
            name: ownerName,
            iconURL: ownerAvatar
        });
    }

    if (extra && extra.action) {
        embed.setFooter({ text: `Ultima accion: ${String(extra.action).slice(0, 90)}` });
    }

    return {
        embeds: [embed],
        components: buildManagementRows(channel.id, isLocked)
    };
}

async function sendManagementEmbed(channel, member, config) {
    if (!channel || typeof channel.send !== 'function') return;

    const payload = buildManagementPanelPayload(channel, member.id, config);
    if (!payload) return;

    const sentMessage = await channel.send(payload).catch(() => null);
    if (sentMessage && typeof sentMessage.pin === 'function') {
        await sentMessage.pin('Panel de gestion de voz temporal').catch(() => null);
    }
}

async function ensureOwnerChannel(guild, member, creatorChannel, config, preferredNameOverride = null) {
    const existingChannelId = await tempVoiceStore.getActiveChannelId(guild.id, member.id);
    if (existingChannelId) {
        const existing = guild.channels.cache.get(existingChannelId) || await guild.channels.fetch(existingChannelId).catch(() => null);
        if (existing && existing.type === ChannelType.GuildVoice) {
            await existing.permissionOverwrites.edit(member.id, {
                ManageChannels: false
            }).catch(() => null);
            return { channel: existing, created: false };
        }
        await tempVoiceStore.clearActiveChannel(guild.id, member.id, existingChannelId);
    }

    const preferredName = typeof preferredNameOverride === 'string'
        ? preferredNameOverride
        : await tempVoiceStore.getUserCustomName(guild.id, member.id);
    const channelName = buildChannelName(member, config, preferredName);

    const categoryId = String(config.categoryId || '').trim();
    const parent = categoryId
        ? guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null)
        : creatorChannel.parent;

    const parentId = parent?.type === ChannelType.GuildCategory ? parent.id : creatorChannel.parentId || null;
    const userLimit = Math.max(0, Math.min(99, Number.parseInt(config.userLimit || 0, 10) || 0));

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: parentId,
        bitrate: creatorChannel.bitrate || undefined,
        userLimit,
        permissionOverwrites: [
            {
                id: member.id,
                allow: [
                    PermissionsBitField.Flags.Connect,
                    PermissionsBitField.Flags.Speak,
                    PermissionsBitField.Flags.Stream,
                    PermissionsBitField.Flags.UseVAD,
                    PermissionsBitField.Flags.MoveMembers,
                    PermissionsBitField.Flags.MuteMembers,
                    PermissionsBitField.Flags.DeafenMembers
                ]
            }
        ]
    });

    await tempVoiceStore.setActiveChannel(guild.id, member.id, channel.id);

    if (config?.sendManageEmbed === true) {
        await sendManagementEmbed(channel, member, config);
    }

    return { channel, created: true };
}

async function createOrMoveMemberTempChannel(member, preferredName = null) {
    const guild = member?.guild;
    if (!guild || !member || member.user?.bot) {
        return { ok: false, reason: 'invalid-member' };
    }

    const config = await tempVoiceStore.getTempVoiceConfig(guild.id);
    if (!config || config.enabled !== true) {
        return { ok: false, reason: 'system-disabled' };
    }

    const creatorChannelId = String(config.creatorChannelId || '').trim();
    if (!creatorChannelId) {
        return { ok: false, reason: 'missing-creator-channel' };
    }

    const creatorChannel = guild.channels.cache.get(creatorChannelId) || await guild.channels.fetch(creatorChannelId).catch(() => null);
    if (!creatorChannel || creatorChannel.type !== ChannelType.GuildVoice) {
        return { ok: false, reason: 'invalid-creator-channel' };
    }

    const userVoiceChannelId = String(member.voice?.channelId || '').trim();
    if (userVoiceChannelId !== creatorChannelId) {
        return { ok: false, reason: 'not-in-creator' };
    }

    const result = await ensureOwnerChannel(guild, member, creatorChannel, config, preferredName);
    const targetChannel = result?.channel || null;
    if (!targetChannel) {
        return { ok: false, reason: 'channel-create-failed' };
    }

    if (targetChannel.id !== userVoiceChannelId) {
        await member.voice.setChannel(targetChannel).catch(() => null);
    }

    return { ok: true, channel: targetChannel, created: result?.created === true };
}

async function handleJoinCreatorChannel(newState, config) {
    const guild = newState.guild;
    const member = newState.member;
    if (!guild || !member || member.user?.bot) return;

    const creatorChannelId = String(config.creatorChannelId || '').trim();
    if (!creatorChannelId || newState.channelId !== creatorChannelId) return;

    const creatorChannel = guild.channels.cache.get(creatorChannelId) || await guild.channels.fetch(creatorChannelId).catch(() => null);
    if (!creatorChannel || creatorChannel.type !== ChannelType.GuildVoice) return;

    const result = await ensureOwnerChannel(guild, member, creatorChannel, config);
    const targetChannel = result?.channel || null;
    if (!targetChannel || targetChannel.id === newState.channelId) return;

    await newState.setChannel(targetChannel).catch(() => null);
}

async function handleLeaveTempChannel(oldState) {
    const oldChannel = oldState.channel;
    const guild = oldState.guild;
    if (!guild || !oldChannel || oldChannel.type !== ChannelType.GuildVoice) return;

    const ownerId = await tempVoiceStore.getOwnerByChannelId(guild.id, oldChannel.id);
    if (!ownerId) return;

    if ((oldChannel.members?.size || 0) > 0) return;

    await oldChannel.delete('Canal de voz temporal vacío').catch(() => null);
    await tempVoiceStore.clearActiveChannel(guild.id, ownerId, oldChannel.id);
}

async function handleVoiceStateUpdate(oldState, newState) {
    try {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        const config = await tempVoiceStore.getTempVoiceConfig(guild.id);
        if (!config || config.enabled !== true) {
            await handleLeaveTempChannel(oldState);
            return;
        }

        await handleJoinCreatorChannel(newState, config);
        await handleLeaveTempChannel(oldState);
    } catch (error) {
        console.error('Error en sistema de canales de voz temporales:', error);
    }
}

module.exports = {
    handleVoiceStateUpdate,
    sanitizeChannelName,
    createOrMoveMemberTempChannel,
    buildManagementPanelPayload
};
