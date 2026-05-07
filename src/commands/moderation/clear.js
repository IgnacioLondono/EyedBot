const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Embeds = require('../../utils/embeds');

const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

async function deleteMessagesWithoutAgeLimit(channel, amount) {
    let remaining = amount;
    let before = null;
    let deleted = 0;

    while (remaining > 0) {
        const limit = Math.min(100, remaining);
        const fetched = await channel.messages.fetch(before ? { limit, before } : { limit });
        if (!fetched.size) break;

        const messages = Array.from(fetched.values());
        before = messages[messages.length - 1]?.id || null;
        const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;

        const recent = messages.filter((msg) => msg.createdTimestamp >= cutoff);
        const old = messages.filter((msg) => msg.createdTimestamp < cutoff);

        if (recent.length) {
            try {
                const deletedRecent = await channel.bulkDelete(recent, false);
                deleted += deletedRecent.size;
            } catch {
                for (const msg of recent) {
                    try {
                        await msg.delete();
                        deleted += 1;
                    } catch {
                        // Ignore per-message delete errors and continue.
                    }
                }
            }
        }

        for (const msg of old) {
            try {
                await msg.delete();
                deleted += 1;
            } catch {
                // Ignore per-message delete errors and continue.
            }
        }

        remaining -= messages.length;
    }

    return deleted;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Elimina mensajes del canal')
        .addIntegerOption(option =>
            option.setName('cantidad')
                .setDescription('Cantidad de mensajes a eliminar (1-1000)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
    cooldown: 5,
    async execute(interaction) {
        const amount = interaction.options.getInteger('cantidad');

        try {
            await interaction.deferReply({ flags: 64 });

            const deletedCount = await deleteMessagesWithoutAgeLimit(interaction.channel, amount);

            if (deletedCount === 0) {
                await interaction.editReply({
                    embeds: [Embeds.error('Error', 'No se pudieron eliminar mensajes en este canal.')]
                });
                return;
            }

            await interaction.editReply({
                embeds: [Embeds.success('Mensajes Eliminados', `Se eliminaron ${deletedCount} mensajes.`)]
            });

            setTimeout(() => {
                interaction.deleteReply().catch(() => {});
            }, 5000);
        } catch (error) {
            console.error('Error en clear:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    embeds: [Embeds.error('Error', `No se pudieron eliminar los mensajes: ${error.message || 'Error desconocido'}`)]
                }).catch(() => null);
                return;
            }

            await interaction.reply({
                embeds: [Embeds.error('Error', `No se pudieron eliminar los mensajes: ${error.message || 'Error desconocido'}`)],
                flags: 64
            }).catch(() => null);
        }
    }
};






