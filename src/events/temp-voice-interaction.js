const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');
const tempVoiceStore = require('../utils/temp-voice-store');
const { sanitizeChannelName, createOrMoveMemberTempChannel } = require('./temp-voice');

const CREATE_BUTTON_PREFIX = 'temp_voice_create_';
const NAME_MODAL_PREFIX = 'temp_voice_name_';
const NAME_INPUT_ID = 'tempVoiceCustomNameInput';

async function handleTempVoiceButton(interaction) {
    if (!interaction?.isButton()) return false;
    if (!interaction.customId.startsWith(CREATE_BUTTON_PREFIX)) return false;

    const guildId = String(interaction.customId.slice(CREATE_BUTTON_PREFIX.length) || '').trim();
    if (!interaction.guildId || String(interaction.guildId) !== guildId) {
        await interaction.reply({ content: 'Este boton no corresponde a este servidor.', flags: 64 }).catch(() => null);
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
