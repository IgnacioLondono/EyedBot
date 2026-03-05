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
        await interaction.deferReply(options);
        return true;
    } catch (error) {
        if (isUnknownInteractionError(error) || isAlreadyAcknowledgedError(error)) return false;
        throw error;
    }
}

async function safeReply(interaction, options) {
    if (!interaction) return null;

    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.followUp(options);
        }
        return await interaction.reply(options);
    } catch (error) {
        if (isAlreadyAcknowledgedError(error)) {
            return await interaction.followUp(options).catch(() => null);
        }
        if (isUnknownInteractionError(error)) return null;
        throw error;
    }
}

async function safeEditReply(interaction, options) {
    if (!interaction) return null;

    try {
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(options);
        }
        return await safeReply(interaction, options);
    } catch (error) {
        if (isUnknownInteractionError(error)) return null;
        if (isAlreadyAcknowledgedError(error)) {
            return await safeReply(interaction, options).catch(() => null);
        }
        throw error;
    }
}

module.exports = {
    safeDeferReply,
    safeReply,
    safeEditReply,
    isUnknownInteractionError,
    isAlreadyAcknowledgedError
};
