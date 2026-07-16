const {
    ChannelType,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AuditLogEvent
} = require('discord.js');
const config = require('../config');
const tempVoiceStore = require('../utils/temp-voice-store');
const { isTempVoiceProtectedFromOwnerKick } = require('../utils/temp-voice-protected-users');
const { CONTROL_BUTTON_PREFIX } = require('./temp-voice-constants');

function parseEmbedColorInt() {
    const hex = String(config.embedColor || '#0099FF').replace('#', '').trim();
    const parsed = Number.parseInt(hex, 16);
    return Number.isFinite(parsed) ? parsed : 0x0099ff;
}

function resolveOwnerMember(channel, ownerId) {
    if (!channel?.guild || !ownerId) return null;
    return channel.guild.members.cache.get(ownerId) || null;
}

async function resolveBotMember(guild) {
    if (!guild) return null;
    return guild.members.me || await guild.members.fetch(guild.client.user.id).catch(() => null);
}

async function moveMemberToTempChannel(member, channel, reason = 'Canal de voz temporal') {
    if (!member || !channel) return false;
    if (String(member.voice?.channelId || '') === String(channel.id)) return true;

    const tryMove = async (targetMember) => {
        if (!targetMember) return false;
        return targetMember.voice.setChannel(channel, reason).then(() => true).catch(() => false);
    };

    if (await tryMove(member)) return true;

    const freshMember = await member.guild.members.fetch(member.id).catch(() => null);
    if (await tryMove(freshMember)) return true;

    await new Promise((resolve) => setTimeout(resolve, 450));
    return tryMove(freshMember || member);
}

async function findRecentVoiceDisconnectOrMoveExecutor(guild, memberId) {
    if (!guild?.members?.me?.permissions?.has(PermissionsBitField.Flags.ViewAuditLog)) return null;

    const types = [AuditLogEvent.MemberDisconnect, AuditLogEvent.MemberMove].filter((t) => typeof t === 'number');
    const now = Date.now();
    const maxAgeMs = 12_000;

    for (const type of types) {
        const logs = await guild.fetchAuditLogs({ type, limit: 8 }).catch(() => null);
        if (!logs) continue;

        const entry = logs.entries.find((item) => {
            if (!item?.executor || !item?.target) return false;
            if (String(item.target.id) !== String(memberId)) return false;
            if (now - item.createdTimestamp > maxAgeMs) return false;
            if (item.executor.system) return false;
            if (String(item.executor.id) === String(memberId)) return false;
            return true;
        });
        if (entry) return entry.executor;
    }
    return null;
}

async function restoreProtectedUserIfOwnerKickedFromTempVoice(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member;
    if (!guild || !member?.user || member.user.bot) return;
    if (!isTempVoiceProtectedFromOwnerKick(member.id)) return;

    const oldChannel = oldState.channel;
    if (!oldChannel || oldChannel.type !== ChannelType.GuildVoice) return;

    const ownerId = await tempVoiceStore.getOwnerByChannelId(guild.id, oldChannel.id);
    if (!ownerId || String(ownerId) === String(member.id)) return;
    if (newState.channelId === oldState.channelId) return;

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionsBitField.Flags.MoveMembers)) return;

    const tryOnce = async () => {
        const executor = await findRecentVoiceDisconnectOrMoveExecutor(guild, member.id);
        if (!executor || String(executor.id) !== String(ownerId)) return;
        if (member.voice?.channelId === oldChannel.id) return;
        await member.voice.setChannel(oldChannel, 'Canal temporal: usuario protegido').catch(() => null);
    };

    await tryOnce();
    setTimeout(() => {
        tryOnce().catch(() => null);
    }, 900);
}

async function restoreProtectedUserIfForceMovedOrDisconnected(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member;
    if (!guild || !member?.user || member.user.bot) return false;
    if (!isTempVoiceProtectedFromOwnerKick(member.id)) return false;

    const oldChannel = oldState.channel;
    if (!oldChannel || oldChannel.type !== ChannelType.GuildVoice) return false;
    if (newState.channelId === oldState.channelId) return false;

    const me = guild.members.me;
    if (!me?.permissions.has(PermissionsBitField.Flags.MoveMembers)) return false;

    const tryOnce = async () => {
        const executor = await findRecentVoiceDisconnectOrMoveExecutor(guild, member.id);
        if (!executor || String(executor.id) === String(member.id)) return false;
        if (member.voice?.channelId === oldChannel.id) return true;
        await member.voice.setChannel(oldChannel, 'Escudo de voz: reingreso automático').catch(() => null);
        return true;
    };

    const restored = await tryOnce();
    if (!restored) return false;

    setTimeout(() => {
        tryOnce().catch(() => null);
    }, 900);

    return true;
}

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

function buildManagementRows(channelId, state = {}) {
    const id = String(channelId || '').trim();
    const isLocked = state.isLocked === true;

    const controlBtn = (action, emoji) => new ButtonBuilder()
        .setCustomId(`${CONTROL_BUTTON_PREFIX}${action}_${id}`)
        .setEmoji(emoji)
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(
        controlBtn('locktoggle', isLocked ? '🔐' : '🔒'),
        controlBtn('rename', '🖋️'),
        controlBtn('limit', '👤'),
        controlBtn('info', '👀')
    );

    return [row];
}

function buildVoiceMasterButtonGuide() {
    return [
        '🔒 · `Bloquear`',
        '🔐 · `Desbloquear`',
        '🖋️ · `Renombrar`',
        '👤 · `Ajustar límite`',
        '👀 · `Ver información`'
    ].join('\n');
}

function buildVoiceMasterLockedAccessGuide() {
    return [
        '📎 **Invitar** (`/vozinvitar`) — para permitir acceso',
        '📎 **Quitar** (`/vozquitar`) — para quitar acceso'
    ].join('\n');
}

function buildManagementPanelPayload(channel, ownerId, voiceConfig = {}, extra = {}, ownerMember = null) {
    if (!channel) return null;

    const baseName = channel.name || 'Canal temporal';
    const resolvedLimit = extra && Number.isFinite(extra.userLimit)
        ? extra.userLimit
        : (channel.userLimit || voiceConfig?.userLimit || 0);
    const userLimit = Math.max(0, Number.parseInt(resolvedLimit, 10) || 0);
    const everyRole = channel.guild.roles.everyone;
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(everyRole.id);
    const derivedLocked = everyoneOverwrite?.deny?.has(PermissionsBitField.Flags.Connect) === true;
    const isLocked = typeof extra?.isLocked === 'boolean' ? extra.isLocked : derivedLocked;

    const member = ownerMember || resolveOwnerMember(channel, ownerId);
    const ownerUser = member?.user || null;
    const ownerAvatar = ownerUser?.displayAvatarURL?.({ size: 256, extension: 'png' }) || null;

    const botUser = channel.client?.user || null;
    const brandLabel = 'EYEDBOT';
    const brandIcon = botUser?.displayAvatarURL?.({ size: 64, extension: 'png' }) || null;

    const embed = new EmbedBuilder()
        .setColor(parseEmbedColorInt())
        .setAuthor({
            name: brandLabel,
            iconURL: brandIcon || undefined
        })
        .setTitle('Panel de Voz')
        .setDescription('Haz clic en los botones de abajo para controlar tu canal de voz.')
        .addFields({
            name: 'Uso de botones',
            value: buildVoiceMasterButtonGuide(),
            inline: false
        })
        .setFooter({
            text: extra?.action
                ? `Última acción: ${String(extra.action).slice(0, 80)}`
                : 'Usa los botones para cambiar tu configuración',
            iconURL: brandIcon || undefined
        });

    if (ownerAvatar) {
        embed.setThumbnail(ownerAvatar);
    }

    const ownerLabel = member ? member.toString() : `<@${ownerId}>`;

    const channelFields = [
        {
            name: 'Propietario',
            value: ownerLabel,
            inline: true
        },
        {
            name: 'Estado del canal',
            value: isLocked ? '🔒 Bloqueado' : '🔓 Abierto',
            inline: true
        },
        {
            name: 'Límite',
            value: userLimit > 0 ? `${userLimit} usuarios` : 'Sin límite',
            inline: true
        }
    ];

    if (isLocked) {
        channelFields.push({
            name: 'Acceso al canal bloqueado',
            value: buildVoiceMasterLockedAccessGuide(),
            inline: false
        });
    }

    embed.addFields(...channelFields);

    return {
        embeds: [embed],
        components: buildManagementRows(channel.id, { isLocked })
    };
}

function buildVoiceChannelInfoEmbed(channel, ownerId, ownerMember = null) {
    if (!channel) return null;

    const member = ownerMember || resolveOwnerMember(channel, ownerId);
    const everyRole = channel.guild.roles.everyone;
    const everyoneOverwrite = channel.permissionOverwrites.cache.get(everyRole.id);
    const isLocked = everyoneOverwrite?.deny?.has(PermissionsBitField.Flags.Connect) === true;
    const userLimit = Math.max(0, Number.parseInt(channel.userLimit || 0, 10) || 0);
    const connected = channel.members?.size || 0;

    return new EmbedBuilder()
        .setColor(parseEmbedColorInt())
        .setTitle('Información del canal')
        .setDescription(`Canal temporal de ${member ? member.toString() : `<@${ownerId}>`}`)
        .addFields(
            { name: 'Nombre', value: channel.name || '—', inline: true },
            { name: 'Conectados', value: `${connected}${userLimit > 0 ? ` / ${userLimit}` : ''}`, inline: true },
            { name: 'Estado', value: isLocked ? '🔒 Bloqueado' : '🔓 Abierto', inline: true },
            { name: 'ID del canal', value: `\`${channel.id}\``, inline: false }
        );
}

async function sendManagementEmbed(channel, member, voiceConfig) {
    if (!channel || typeof channel.send !== 'function') return;

    const ownerMember = member?.id
        ? await channel.guild.members.fetch(member.id).catch(() => member)
        : null;
    const payload = buildManagementPanelPayload(channel, member.id, voiceConfig, {}, ownerMember);
    if (!payload) return;

    const botMember = await resolveBotMember(channel.guild);
    if (!botMember) return;
    const canSendPanel = channel.permissionsFor(botMember)?.has([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.EmbedLinks
    ]);
    if (!canSendPanel) {
        console.warn(`[TempVoice] No se pudo enviar panel en #${channel.name}: faltan permisos para el bot.`);
        return;
    }

    const sendOnce = async () => {
        const sentMessage = await channel.send(payload).catch(() => null);
        if (sentMessage && typeof sentMessage.pin === 'function') {
            await sentMessage.pin('Panel de gestion de voz temporal').catch(() => null);
        }
        return sentMessage;
    };

    let sentMessage = await sendOnce();
    if (!sentMessage) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        sentMessage = await sendOnce();
    }
}

async function ensureManagementEmbedIfMissing(channel, member, voiceConfig) {
    if (!voiceConfig?.sendManageEmbed) return;
    if (!channel || typeof channel.messages?.fetch !== 'function') return;

    const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
    const hasPanel = recent?.some((msg) => {
        if (!msg || msg.author?.id !== channel.client.user.id) return false;
        return msg.components?.some((row) => row.components?.some((btn) =>
            String(btn.customId || '').startsWith(CONTROL_BUTTON_PREFIX)
        ));
    });

    if (!hasPanel) {
        await sendManagementEmbed(channel, member, voiceConfig);
    }
}

async function ensureTempVoiceChatPerms(channel) {
    if (!channel?.permissionOverwrites?.edit || !channel.guild?.roles?.everyone) return;
    const everyoneId = channel.guild.roles.everyone.id;
    await channel.permissionOverwrites.edit(everyoneId, {
        SendMessages: true,
        AttachFiles: true,
        EmbedLinks: true,
        ReadMessageHistory: true
    }).catch(() => null);
}

async function ensureOwnerChannel(guild, member, creatorChannel, config, preferredNameOverride = null) {
    const existingChannelId = await tempVoiceStore.getActiveChannelId(guild.id, member.id);
    if (existingChannelId) {
        const existing = guild.channels.cache.get(existingChannelId) || await guild.channels.fetch(existingChannelId).catch(() => null);
        if (existing && existing.type === ChannelType.GuildVoice) {
            await ensureTempVoiceChatPerms(existing);
            await existing.permissionOverwrites.edit(member.id, {
                ManageChannels: false,
                ViewChannel: true,
                Connect: true,
                Speak: true,
                Stream: true,
                UseVAD: true,
                SendMessages: true,
                AttachFiles: true,
                EmbedLinks: true,
                ReadMessageHistory: true
            }).catch(() => null);
            await ensureManagementEmbedIfMissing(existing, member, config);
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
    const botMember = await resolveBotMember(guild);
    const chatAllow = [
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks,
        PermissionsBitField.Flags.ReadMessageHistory
    ];
    const overwrites = [
        {
            id: guild.roles.everyone.id,
            allow: [...chatAllow]
        },
        {
            id: member.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak,
                PermissionsBitField.Flags.Stream,
                PermissionsBitField.Flags.UseVAD,
                PermissionsBitField.Flags.MoveMembers,
                PermissionsBitField.Flags.MuteMembers,
                PermissionsBitField.Flags.DeafenMembers,
                ...chatAllow
            ]
        }
    ];

    if (botMember) {
        overwrites.push({
            id: botMember.id,
            allow: [
                PermissionsBitField.Flags.ViewChannel,
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.SendMessages,
                PermissionsBitField.Flags.AttachFiles,
                PermissionsBitField.Flags.ReadMessageHistory,
                PermissionsBitField.Flags.EmbedLinks,
                PermissionsBitField.Flags.ManageMessages,
                PermissionsBitField.Flags.MoveMembers,
                PermissionsBitField.Flags.ManageChannels
            ]
        });
    }

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: parentId,
        bitrate: creatorChannel.bitrate || undefined,
        userLimit,
        permissionOverwrites: overwrites
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
        const moved = await moveMemberToTempChannel(member, targetChannel);
        if (!moved) {
            console.warn(`[TempVoice] No se pudo mover a ${member.user?.tag || member.id} a su canal temporal ${targetChannel.id}`);
            return { ok: false, reason: 'move-failed', channel: targetChannel, created: result?.created === true };
        }
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

    const moved = await moveMemberToTempChannel(member, targetChannel);
    if (!moved) {
        console.warn(`[TempVoice] Falló mover desde canal creador a canal temporal (${member.user?.tag || member.id}).`);
    }
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

        if (await restoreProtectedUserIfForceMovedOrDisconnected(oldState, newState)) {
            return;
        }

        const config = await tempVoiceStore.getTempVoiceConfig(guild.id);
        if (!config || config.enabled !== true) {
            await handleLeaveTempChannel(oldState);
            return;
        }

        await handleJoinCreatorChannel(newState, config);
        await handleLeaveTempChannel(oldState);
        await restoreProtectedUserIfOwnerKickedFromTempVoice(oldState, newState);
    } catch (error) {
        console.error('Error en sistema de canales de voz temporales:', error);
    }
}

module.exports = {
    handleVoiceStateUpdate,
    sanitizeChannelName,
    createOrMoveMemberTempChannel,
    buildManagementPanelPayload,
    buildVoiceChannelInfoEmbed
};
