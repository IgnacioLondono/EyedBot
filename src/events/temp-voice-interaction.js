const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ChannelType,
    PermissionsBitField
} = require('discord.js');
const tempVoiceStore = require('../utils/temp-voice-store');
const {
    sanitizeChannelName,
    createOrMoveMemberTempChannel,
    buildManagementPanelPayload,
    buildVoiceChannelInfoEmbed
} = require('./temp-voice');
const {
    CREATE_BUTTON_PREFIX,
    NAME_MODAL_PREFIX,
    NAME_INPUT_ID,
    CONTROL_BUTTON_PREFIX,
    RENAME_MODAL_PREFIX,
    RENAME_INPUT_ID,
    LIMIT_MODAL_PREFIX,
    LIMIT_INPUT_ID
} = require('./temp-voice-constants');

function parseControlButton(customId = '') {
    if (!customId.startsWith(CONTROL_BUTTON_PREFIX)) return null;
    const payload = customId.slice(CONTROL_BUTTON_PREFIX.length);
    const separatorIndex = payload.indexOf('_');
    if (separatorIndex < 0) return null;

    const action = payload.slice(0, separatorIndex);
    const channelId = payload.slice(separatorIndex + 1);
    if (!action || !channelId) return null;
    return { action, channelId };
}

async function getExistingOwnedTempChannel(guild, userId) {
    if (!guild || !userId) return null;

    const existingChannelId = await tempVoiceStore.getActiveChannelId(guild.id, userId);
    if (!existingChannelId) return null;

    const existingChannel = guild.channels.cache.get(existingChannelId)
        || await guild.channels.fetch(existingChannelId).catch(() => null);

    if (!existingChannel || existingChannel.type !== ChannelType.GuildVoice) {
        await tempVoiceStore.clearActiveChannel(guild.id, userId, existingChannelId);
        return null;
    }

    const ownerId = await tempVoiceStore.getOwnerByChannelId(guild.id, existingChannel.id);
    if (String(ownerId || '') !== String(userId)) {
        return null;
    }

    return existingChannel;
}

async function getOwnedTempVoiceChannel(interaction, channelId) {
    const guild = interaction.guild;
    if (!guild) {
        return { ok: false, error: 'Servidor no disponible.' };
    }

    const ownerId = await tempVoiceStore.getOwnerByChannelId(guild.id, channelId);
    if (!ownerId) {
        return { ok: false, error: 'Ese canal ya no es temporal o no tiene dueno.' };
    }

    if (String(ownerId) !== String(interaction.user.id)) {
        return { ok: false, error: 'Solo el propietario del canal puede usar este panel.' };
    }

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
        return { ok: false, error: 'Canal de voz no encontrado.' };
    }

    return { ok: true, channel };
}

async function resolveOwnerMemberForPanel(guild, ownerId) {
    if (!guild || !ownerId) return null;
    return guild.members.cache.get(ownerId) || await guild.members.fetch(ownerId).catch(() => null);
}

async function refreshManagementMessage(message, channel, ownerId, actionLabel = '', state = {}) {
    if (!message || typeof message.edit !== 'function' || !channel || !ownerId) return;

    const latestChannel = await channel.guild.channels.fetch(channel.id).catch(() => channel);
    const ownerMember = await resolveOwnerMemberForPanel(channel.guild, ownerId);
    const payload = buildManagementPanelPayload(
        latestChannel,
        ownerId,
        { userLimit: latestChannel.userLimit || 0 },
        { action: actionLabel, ...state },
        ownerMember
    );
    if (!payload) return;

    await message.edit(payload).catch(() => null);
}

async function replyButtonError(interaction, message) {
    if (!interaction) return;
    if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: message, flags: 64 }).catch(() => null);
        return;
    }

    await interaction.reply({ content: message, flags: 64 }).catch(() => null);
}

async function refreshManagementInteraction(interaction, channel, ownerId, actionLabel = '', state = {}) {
    if (!interaction || !channel || !ownerId) return false;

    const latestChannel = await channel.guild.channels.fetch(channel.id).catch(() => channel);
    const ownerMember = await resolveOwnerMemberForPanel(channel.guild, ownerId);
    const payload = buildManagementPanelPayload(
        latestChannel,
        ownerId,
        { userLimit: latestChannel.userLimit || 0 },
        { action: actionLabel, ...state },
        ownerMember
    );
    if (!payload) return false;

    await interaction.update(payload).catch(() => null);
    return true;
}

async function acknowledgeModalSilently(interaction) {
    if (!interaction) return;
    if (interaction.deferred || interaction.replied) return;
    await interaction.deferUpdate().catch(() => null);
}

async function handleTempVoiceButton(interaction) {
    if (!interaction?.isButton()) return false;

    const controlParsed = parseControlButton(interaction.customId);
    if (controlParsed) {
        const { action, channelId } = controlParsed;
        const channelResult = await getOwnedTempVoiceChannel(interaction, channelId);
        if (!channelResult.ok) {
            await replyButtonError(interaction, channelResult.error);
            return true;
        }

        const channel = channelResult.channel;
        const everyoneRoleId = channel.guild.roles.everyone.id;

        if (action === 'rename') {
            const modal = new ModalBuilder()
                .setCustomId(`${RENAME_MODAL_PREFIX}${interaction.guildId}_${channel.id}_${interaction.message?.id || '0'}`)
                .setTitle('Renombrar Canal Temporal');

            const renameInput = new TextInputBuilder()
                .setCustomId(RENAME_INPUT_ID)
                .setLabel('Nuevo nombre del canal')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(95)
                .setValue(String(channel.name || '').slice(0, 95));

            modal.addComponents(new ActionRowBuilder().addComponents(renameInput));
            await interaction.showModal(modal).catch(() => null);
            return true;
        }

        if (action === 'limit') {
            const modal = new ModalBuilder()
                .setCustomId(`${LIMIT_MODAL_PREFIX}${interaction.guildId}_${channel.id}_${interaction.message?.id || '0'}`)
                .setTitle('Cambiar Limite');

            const limitInput = new TextInputBuilder()
                .setCustomId(LIMIT_INPUT_ID)
                .setLabel('Limite del canal (0-99)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(2)
                .setPlaceholder('0 = sin limite')
                .setValue(String(Math.max(0, Math.min(99, Number.parseInt(channel.userLimit || 0, 10) || 0))));

            modal.addComponents(new ActionRowBuilder().addComponents(limitInput));
            await interaction.showModal(modal).catch(() => null);
            return true;
        }

        if (action === 'locktoggle') {
            const isLocked = channel.permissionOverwrites.cache
                .get(everyoneRoleId)
                ?.deny
                ?.has(PermissionsBitField.Flags.Connect) === true;

            if (isLocked) {
                await channel.permissionOverwrites.edit(everyoneRoleId, {
                    Connect: null,
                    SendMessages: true,
                    AttachFiles: true,
                    EmbedLinks: true,
                    ReadMessageHistory: true
                }).catch(() => null);
                await refreshManagementInteraction(interaction, channel, interaction.user.id, 'Canal desbloqueado', {
                    isLocked: false
                });
            } else {
                await channel.permissionOverwrites.edit(everyoneRoleId, {
                    Connect: false,
                    SendMessages: false,
                    AttachFiles: false
                }).catch(() => null);
                await channel.permissionOverwrites.edit(interaction.user.id, {
                    ViewChannel: true,
                    Connect: true,
                    Speak: true,
                    Stream: true,
                    UseVAD: true,
                    SendMessages: true,
                    AttachFiles: true,
                    EmbedLinks: true,
                    ReadMessageHistory: true,
                    MoveMembers: true,
                    MuteMembers: true,
                    DeafenMembers: true
                }).catch(() => null);
                await refreshManagementInteraction(interaction, channel, interaction.user.id, 'Canal bloqueado', {
                    isLocked: true
                });
            }
            return true;
        }

        if (action === 'info') {
            const ownerMember = await resolveOwnerMemberForPanel(channel.guild, interaction.user.id);
            const infoEmbed = buildVoiceChannelInfoEmbed(channel, interaction.user.id, ownerMember);
            await interaction.reply({
                embeds: infoEmbed ? [infoEmbed] : [],
                flags: 64
            }).catch(() => null);
            return true;
        }

        return true;
    }

    if (!interaction.customId.startsWith(CREATE_BUTTON_PREFIX)) return false;

    const guildId = String(interaction.customId.slice(CREATE_BUTTON_PREFIX.length) || '').trim();
    if (!interaction.guildId || String(interaction.guildId) !== guildId) {
        await interaction.deferUpdate().catch(() => null);
        return true;
    }

    const config = await tempVoiceStore.getTempVoiceConfig(guildId);
    if (!config || config.enabled !== true) {
        await interaction.deferUpdate().catch(() => null);
        return true;
    }

    if (config.allowCustomNames === false) {
        await interaction.deferUpdate().catch(() => null);
        return true;
    }

    const existingChannel = await getExistingOwnedTempChannel(interaction.guild, interaction.user.id);
    if (existingChannel) {
        await interaction.reply({
            content: `Ya tienes un canal temporal creado: <#${existingChannel.id}>.`,
            flags: 64
        }).catch(() => null);
        return true;
    }

    const currentName = await tempVoiceStore.getUserCustomName(guildId, interaction.user.id);
    const modal = new ModalBuilder()
        .setCustomId(`${NAME_MODAL_PREFIX}${guildId}`)
        .setTitle('Crear Canal De Voz');

    const previewDefault = `Canal de ${interaction.user.username}`.slice(0, 95);
    const nameInput = new TextInputBuilder()
        .setCustomId(NAME_INPUT_ID)
        .setLabel('Nombre personalizado del canal')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(95)
        .setPlaceholder(previewDefault)
        .setValue((currentName || '').slice(0, 95));

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    await interaction.showModal(modal).catch(() => null);
    return true;
}

async function handleTempVoiceModal(interaction) {
    if (!interaction?.isModalSubmit()) return false;

    if (interaction.customId.startsWith(RENAME_MODAL_PREFIX)) {
        const payload = interaction.customId.slice(RENAME_MODAL_PREFIX.length);
        const [guildId, channelId, messageId] = payload.split('_');
        if (!guildId || !channelId || String(interaction.guildId) !== String(guildId)) {
            await interaction.reply({ content: 'Formulario invalido para este servidor.', flags: 64 }).catch(() => null);
            return true;
        }

        const channelResult = await getOwnedTempVoiceChannel(interaction, channelId);
        if (!channelResult.ok) {
            await interaction.reply({ content: channelResult.error, flags: 64 }).catch(() => null);
            return true;
        }

        const requested = interaction.fields.getTextInputValue(RENAME_INPUT_ID) || '';
        const safeName = sanitizeChannelName(requested);
        if (!safeName) {
            await interaction.reply({ content: 'Escribe un nombre valido para renombrar el canal.', flags: 64 }).catch(() => null);
            return true;
        }

        const channel = channelResult.channel;
        await channel.setName(safeName).catch(() => null);
        await tempVoiceStore.setUserCustomName(interaction.guildId, interaction.user.id, safeName);

        if (messageId && messageId !== '0' && interaction.channel && typeof interaction.channel.messages?.fetch === 'function') {
            const panelMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
            await refreshManagementMessage(panelMessage, channel, interaction.user.id, `Canal renombrado: ${safeName}`);
        }

        await acknowledgeModalSilently(interaction);
        return true;
    }

    if (interaction.customId.startsWith(LIMIT_MODAL_PREFIX)) {
        const payload = interaction.customId.slice(LIMIT_MODAL_PREFIX.length);
        const [guildId, channelId, messageId] = payload.split('_');
        if (!guildId || !channelId || String(interaction.guildId) !== String(guildId)) {
            await interaction.reply({ content: 'Formulario invalido para este servidor.', flags: 64 }).catch(() => null);
            return true;
        }

        const channelResult = await getOwnedTempVoiceChannel(interaction, channelId);
        if (!channelResult.ok) {
            await interaction.reply({ content: channelResult.error, flags: 64 }).catch(() => null);
            return true;
        }

        const rawLimit = String(interaction.fields.getTextInputValue(LIMIT_INPUT_ID) || '').trim();
        if (!/^\d{1,2}$/.test(rawLimit)) {
            await interaction.reply({ content: 'Escribe un numero valido entre 0 y 99.', flags: 64 }).catch(() => null);
            return true;
        }

        const nextLimit = Math.max(0, Math.min(99, Number.parseInt(rawLimit, 10) || 0));
        const channel = channelResult.channel;
        await channel.edit({ userLimit: nextLimit }).catch(() => null);

        if (messageId && messageId !== '0' && interaction.channel && typeof interaction.channel.messages?.fetch === 'function') {
            const panelMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
            await refreshManagementMessage(panelMessage, channel, interaction.user.id, `Limite ${nextLimit > 0 ? nextLimit : 'sin limite'}`, {
                userLimit: nextLimit
            });
        }

        await acknowledgeModalSilently(interaction);
        return true;
    }

    if (!interaction.customId.startsWith(NAME_MODAL_PREFIX)) return false;

    const guildId = String(interaction.customId.slice(NAME_MODAL_PREFIX.length) || '').trim();
    if (!interaction.guildId || String(interaction.guildId) !== guildId) {
        await interaction.reply({ content: 'Este formulario no corresponde a este servidor.', flags: 64 }).catch(() => null);
        return true;
    }

    const config = await tempVoiceStore.getTempVoiceConfig(guildId);
    if (!config || config.enabled !== true) {
        await interaction.reply({ content: 'El sistema de voz temporal esta desactivado.', flags: 64 }).catch(() => null);
        return true;
    }

    if (config.allowCustomNames === false) {
        await interaction.reply({ content: 'En este servidor no se permiten nombres personalizados.', flags: 64 }).catch(() => null);
        return true;
    }

    const existingChannel = await getExistingOwnedTempChannel(interaction.guild, interaction.user.id);
    if (existingChannel) {
        await interaction.reply({
            content: `Ya tienes un canal temporal creado: <#${existingChannel.id}>.`,
            flags: 64
        }).catch(() => null);
        return true;
    }

    const requested = interaction.fields.getTextInputValue(NAME_INPUT_ID) || '';
    const safeName = sanitizeChannelName(requested);

    if (requested.trim() && !safeName) {
        await interaction.reply({ content: 'Escribe un nombre valido para tu canal.', flags: 64 }).catch(() => null);
        return true;
    }

    await tempVoiceStore.setUserCustomName(guildId, interaction.user.id, safeName || '');

    const previewName = safeName || `Canal de ${interaction.user.username}`;
    const result = await createOrMoveMemberTempChannel(interaction.member, safeName || null);

    if (result.ok && result.channel) {
        await interaction.reply({
            content: `Tu canal se creo con el nombre **${previewName}**. Ya fuiste movido a <#${result.channel.id}>.`,
            flags: 64
        }).catch(() => null);
        return true;
    }

    if (result.reason === 'not-in-creator') {
        await interaction.reply({
            content: `Nombre guardado. Tu canal se creara con el nombre **${previewName}** cuando entres al canal creador.`,
            flags: 64
        }).catch(() => null);
        return true;
    }

    await interaction.reply({
        content: `Nombre guardado. Tu canal se creara con el nombre **${previewName}** al usar el sistema de voz temporal.`,
        flags: 64
    }).catch(() => null);
    return true;
}

module.exports = {
    CREATE_BUTTON_PREFIX,
    handleTempVoiceButton,
    handleTempVoiceModal
};
