const { ChannelType, PermissionsBitField } = require('discord.js');
const tempVoiceStore = require('../utils/temp-voice-store');

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

async function ensureOwnerChannel(guild, member, creatorChannel, config) {
    const existingChannelId = await tempVoiceStore.getActiveChannelId(guild.id, member.id);
    if (existingChannelId) {
        const existing = guild.channels.cache.get(existingChannelId) || await guild.channels.fetch(existingChannelId).catch(() => null);
        if (existing && existing.type === ChannelType.GuildVoice) {
            await existing.permissionOverwrites.edit(member.id, {
                ManageChannels: false
            }).catch(() => null);
            return existing;
        }
        await tempVoiceStore.clearActiveChannel(guild.id, member.id, existingChannelId);
    }

    const preferredName = await tempVoiceStore.getUserCustomName(guild.id, member.id);
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
    return channel;
}

async function handleJoinCreatorChannel(newState, config) {
    const guild = newState.guild;
    const member = newState.member;
    if (!guild || !member || member.user?.bot) return;

    const creatorChannelId = String(config.creatorChannelId || '').trim();
    if (!creatorChannelId || newState.channelId !== creatorChannelId) return;

    const creatorChannel = guild.channels.cache.get(creatorChannelId) || await guild.channels.fetch(creatorChannelId).catch(() => null);
    if (!creatorChannel || creatorChannel.type !== ChannelType.GuildVoice) return;

    const targetChannel = await ensureOwnerChannel(guild, member, creatorChannel, config);
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
    sanitizeChannelName
};
