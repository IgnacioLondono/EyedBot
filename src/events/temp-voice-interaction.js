const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ChannelType,
    PermissionsBitField
} = require('discord.js');
const tempVoiceStore = require('../utils/temp-voice-store');
const { sanitizeChannelName, createOrMoveMemberTempChannel, buildManagementPanelPayload } = require('./temp-voice');
const {
    CREATE_BUTTON_PREFIX,
    NAME_MODAL_PREFIX,
    NAME_INPUT_ID,
    CONTROL_BUTTON_PREFIX,
    RENAME_MODAL_PREFIX,
    RENAME_INPUT_ID,
    ADD_USER_MODAL_PREFIX,
    ADD_USER_INPUT_ID
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

async function getOwnedTempVoiceChannel(interaction, channelId) {
    const guild = interaction.guild;
    if (!guild) {
        return { ok: false, error: 'Servidor no disponible.' };
    }

    const ownerId = await tempVoiceStore.getOwnerByChannelId(guild.id, channelId);
    if (!ownerId) {
        return { ok: false, error: 'Ese canal ya no es temporal o no tiene dueño.' };
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

function extractUserIdFromInput(raw = '') {
    const match = String(raw || '').match(/\d{17,20}/);
    return match ? match[0] : '';
}

async function refreshManagementMessage(message, channel, ownerId, actionLabel = '') {
    if (!message || typeof message.edit !== 'function' || !channel || !ownerId) return;

    const payload = buildManagementPanelPayload(channel, ownerId, { userLimit: channel.userLimit || 0 }, {
        action: actionLabel
    });
    if (!payload) return;

    await message.edit(payload).catch(() => null);
}

async function acknowledgeButtonSilently(interaction) {
    if (!interaction) return;
    if (interaction.deferred || interaction.replied) return;
    await interaction.deferUpdate().catch(() => null);
}

async function handleTempVoiceButton(interaction) {
    if (!interaction?.isButton()) return false;

    const controlParsed = parseControlButton(interaction.customId);
    if (controlParsed) {
        const { action, channelId } = controlParsed;

        if (action !== 'rename' && action !== 'adduser') {
            await acknowledgeButtonSilently(interaction);
        }

        const channelResult = await getOwnedTempVoiceChannel(interaction, channelId);
        if (!channelResult.ok) {
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

        if (action === 'adduser') {
            const modal = new ModalBuilder()
                .setCustomId(`${ADD_USER_MODAL_PREFIX}${interaction.guildId}_${channel.id}_${interaction.message?.id || '0'}`)
                .setTitle('Agregar Usuario Al Canal');

            const userInput = new TextInputBuilder()
                .setCustomId(ADD_USER_INPUT_ID)
                .setLabel('Usuario (@mencion o ID)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(64)
                .setPlaceholder('@usuario o 123456789012345678');

            modal.addComponents(new ActionRowBuilder().addComponents(userInput));
            await interaction.showModal(modal).catch(() => null);
            return true;
        }

        if (action === 'lock') {
            await channel.permissionOverwrites.edit(everyoneRoleId, {
                Connect: false
            }).catch(() => null);
            await refreshManagementMessage(interaction.message, channel, interaction.user.id, 'Canal bloqueado');
            return true;
        }

        if (action === 'unlock') {
            await channel.permissionOverwrites.edit(everyoneRoleId, {
                Connect: null
            }).catch(() => null);
            await refreshManagementMessage(interaction.message, channel, interaction.user.id, 'Canal desbloqueado');
            return true;
        }

        if (action === 'limitup' || action === 'limitdown') {
            const currentLimit = Math.max(0, Math.min(99, Number.parseInt(channel.userLimit || 0, 10) || 0));
            const nextLimit = action === 'limitup'
                ? Math.min(99, currentLimit + 1)
                : Math.max(0, currentLimit - 1);

            await channel.edit({ userLimit: nextLimit }).catch(() => null);
            await refreshManagementMessage(interaction.message, channel, interaction.user.id, `Limite ${nextLimit > 0 ? nextLimit : 'sin limite'}`);
            return true;
        }

        return true;
    }

    if (!interaction.customId.startsWith(CREATE_BUTTON_PREFIX)) return false;

    const guildId = String(interaction.customId.slice(CREATE_BUTTON_PREFIX.length) || '').trim();
    if (!interaction.guildId || String(interaction.guildId) !== guildId) {
        await acknowledgeButtonSilently(interaction);
        return true;
    }

    const config = await tempVoiceStore.getTempVoiceConfig(guildId);
    if (!config || config.enabled !== true) {
        await acknowledgeButtonSilently(interaction);
        return true;
    }

    if (config.allowCustomNames === false) {
        await acknowledgeButtonSilently(interaction);
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

    if (interaction.customId.startsWith(ADD_USER_MODAL_PREFIX)) {
        const payload = interaction.customId.slice(ADD_USER_MODAL_PREFIX.length);
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

        const channel = channelResult.channel;
        const rawUser = interaction.fields.getTextInputValue(ADD_USER_INPUT_ID) || '';
        const targetUserId = extractUserIdFromInput(rawUser);
        if (!targetUserId) {
            await interaction.reply({ content: 'Debes escribir una mencion o ID valido.', flags: 64 }).catch(() => null);
            return true;
        }

        const member = await interaction.guild.members.fetch(targetUserId).catch(() => null);
        if (!member) {
            await interaction.reply({ content: 'No encontre ese usuario en este servidor.', flags: 64 }).catch(() => null);
            return true;
        }

        await channel.permissionOverwrites.edit(member.id, {
            Connect: true,
            Speak: true,
            Stream: true,
            UseVAD: true
        }).catch(() => null);

        if (messageId && messageId !== '0' && interaction.channel && typeof interaction.channel.messages?.fetch === 'function') {
            const panelMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
            await refreshManagementMessage(panelMessage, channel, interaction.user.id, `Usuario agregado: ${member.user.username}`);
        }

        await interaction.reply({
            content: `Usuario agregado correctamente: <@${member.id}>.`,
            flags: 64
        }).catch(() => null);
        return true;
    }

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

        await interaction.reply({ content: `Canal renombrado a **${safeName}**.`, flags: 64 }).catch(() => null);
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
