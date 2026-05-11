const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { safeDeferReply, safeEditReply } = require('../../utils/interactions');

const SERVER_NAME = 'eyedbot';

function sortChannelsForDeletion(channels) {
    return [...channels].sort((left, right) => {
        const leftIsCategory = left.type === ChannelType.GuildCategory;
        const rightIsCategory = right.type === ChannelType.GuildCategory;

        if (leftIsCategory && !rightIsCategory) return 1;
        if (!leftIsCategory && rightIsCategory) return -1;
        return (right.rawPosition ?? 0) - (left.rawPosition ?? 0);
    });
}

async function deleteGuildChannels(guild, reason) {
    const channels = sortChannelsForDeletion(
        guild.channels.cache.filter((channel) => channel.deletable)
    );

    let deleted = 0;

    for (const channel of channels) {
        try {
            await channel.delete(reason);
            deleted += 1;
        } catch {
            // Ignorar canales que no se pudieron borrar.
        }
    }

    return deleted;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('Elimina todos los canales del servidor y renombra el servidor a eyedbot.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addBooleanOption((option) => option
            .setName('confirmar')
            .setDescription('Debe ser true para ejecutar el borrado total.')
            .setRequired(true)),
    async execute(interaction) {
        const confirmed = interaction.options.getBoolean('confirmar');

        if (!confirmed) {
            await interaction.reply({
                content: 'Operación cancelada. Activa `confirmar` para ejecutar el nuke.',
                ephemeral: true
            });
            return;
        }

        const guild = interaction.guild;
        const me = guild.members.me;
        const missingPermissions = [];

        if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
            missingPermissions.push('Gestionar canales');
        }

        if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
            missingPermissions.push('Gestionar servidor');
        }

        if (missingPermissions.length > 0) {
            await interaction.reply({
                content: `No tengo permiso para: ${missingPermissions.join(', ')}.`,
                ephemeral: true
            });
            return;
        }

        await safeDeferReply(interaction, { ephemeral: true });

        const reason = `Nuke ejecutado por ${interaction.user.tag}`;
        const deletedCount = await deleteGuildChannels(guild, reason);
        let renamed = false;

        try {
            await guild.setName(SERVER_NAME, reason);
            renamed = true;
        } catch {
            renamed = false;
        }

        const summary = [
            'Nuke completado.',
            `Canales eliminados: **${deletedCount}**.`,
            renamed
                ? `Nombre del servidor actualizado a **${SERVER_NAME}**.`
                : 'No se pudo cambiar el nombre del servidor.'
        ];

        await safeEditReply(interaction, {
            content: summary.join('\n')
        });
    }
};
