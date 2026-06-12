const { MessageFlags } = require('discord.js');

const EPHEMERAL_FLAG = MessageFlags.Ephemeral;

function normalizeInteractionOptions(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        return options;
    }

    if (options.ephemeral !== true) {
        return options;
    }

    const { ephemeral, flags, ...rest } = options;
    return {
        ...rest,
        flags: (typeof flags === 'number' ? flags : 0) | EPHEMERAL_FLAG
    };
}

function isUnknownInteractionError(error) {
    return error?.code === 10062
        || error?.rawError?.code === 10062
        || String(error?.message || '').includes('Unknown interaction');
}

function isAlreadyAcknowledgedError(error) {
    return error?.code === 40060
        || error?.rawError?.code === 40060
        || String(error?.message || '').includes('already been acknowledged');
}

async function safeDeferReply(interaction, options = {}) {
    if (!interaction || interaction.deferred || interaction.replied) return false;
    try {
        await interaction.deferReply(normalizeInteractionOptions(options));
        return true;
    } catch (error) {
        if (isUnknownInteractionError(error) || isAlreadyAcknowledgedError(error)) return false;
        throw error;
    }
}

async function safeReply(interaction, options) {
    if (!interaction) return null;

    const normalized = normalizeInteractionOptions(options);

    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.followUp(normalized);
        }
        return await interaction.reply(normalized);
    } catch (error) {
        if (isAlreadyAcknowledgedError(error)) {
            return await interaction.followUp(normalized).catch(() => null);
        }
        if (isUnknownInteractionError(error)) return null;
        throw error;
    }
}

async function safeEditReply(interaction, options) {
    if (!interaction) return null;

    const normalized = normalizeInteractionOptions(options);

    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(normalized);
        }
        return await safeReply(interaction, normalized);
    } catch (error) {
        if (isUnknownInteractionError(error)) return null;
        if (isAlreadyAcknowledgedError(error)) {
            return await safeReply(interaction, normalized).catch(() => null);
        }
        throw error;
    }
}

module.exports = {
    EPHEMERAL_FLAG,
    MessageFlags,
    normalizeInteractionOptions,
    safeDeferReply,
    safeReply,
    safeEditReply,
    isUnknownInteractionError,
    isAlreadyAcknowledgedError
};
