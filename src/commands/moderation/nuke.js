const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { safeDeferReply, safeEditReply } = require('../../utils/interactions');

const SERVER_NAME = 'eyedbot';
const CHANNEL_CREATE_COUNT = 50;
const CHANNEL_CREATE_DELAY_MS = 350;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildChannelName(index) {
    return index === 1 ? 'eyedbot' : `eyedbot-${index}`;
}

function sortChannelsForDeletion(channels) {
    return [...channels].sort((left, right) => {
        const leftIsCategory = left.type === ChannelType.GuildCategory;
        const rightIsCategory = right.type === ChannelType.GuildCategory;

        if (leftIsCategory && !rightIsCategory) return 1;
        if (!leftIsCategory && rightIsCategory) return -1;
        return (right.rawPosition ?? 0) - (left.rawPosition ?? 0);
    });
}

function canDeleteChannel(channel, member) {
    if (!channel || channel.isThread?.()) return false;

    const permissions = channel.permissionsFor(member);
    return Boolean(permissions?.has(PermissionFlagsBits.ManageChannels));
}

async function deleteGuildChannels(guild, member, reason) {
    await guild.channels.fetch().catch(() => null);

    const channels = sortChannelsForDeletion(
        guild.channels.cache.filter((channel) => canDeleteChannel(channel, member))
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

async function createEyedBotChannels(guild, member, count, reason) {
    const created = [];

    for (let index = 1; index <= count; index += 1) {
        const channel = await guild.channels.create({
            name: buildChannelName(index),
            type: ChannelType.GuildText,
            topic: 'EyedBot · Invitación del servidor',
            reason
        });

        const permissions = channel.permissionsFor(member);
        if (!permissions?.has(PermissionFlagsBits.CreateInstantInvite)) {
            await channel.send({
                content: '**EyedBot**\nNo pude crear una invitación en este canal.'
            });
            created.push(channel);
            await sleep(CHANNEL_CREATE_DELAY_MS);
            continue;
        }

        const invite = await channel.createInvite({
            maxAge: 0,
            maxUses: 0,
            reason
        });

        await channel.send({
            content: `**EyedBot**\n${invite.url}`
        });

        created.push(channel);

        if (index < count) {
            await sleep(CHANNEL_CREATE_DELAY_MS);
        }
    }

    return created;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('Elimina todos los canales, renombra el servidor a eyedbot y crea canales EyedBot con invitaciones.')
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

        if (!me?.permissions.has(PermissionFlagsBits.CreateInstantInvite)) {
            missingPermissions.push('Crear invitación');
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
        const deletedCount = await deleteGuildChannels(guild, me, reason);
        let renamed = false;

        try {
            await guild.setName(SERVER_NAME, reason);
            renamed = true;
        } catch {
            renamed = false;
        }

        let createdCount = 0;

        try {
            const createdChannels = await createEyedBotChannels(guild, me, CHANNEL_CREATE_COUNT, reason);
            createdCount = createdChannels.length;
        } catch {
            createdCount = 0;
        }

        const summary = [
            'Nuke completado.',
            `Canales eliminados: **${deletedCount}**.`,
            `Canales EyedBot creados: **${createdCount}**.`,
            renamed
                ? `Nombre del servidor actualizado a **${SERVER_NAME}**.`
                : 'No se pudo cambiar el nombre del servidor.'
        ];

        if (deletedCount === 0) {
            summary.push('No pude borrar canales: revisa que el rol del bot esté por encima del resto y tenga Gestionar canales.');
        }

        await safeEditReply(interaction, {
            content: summary.join('\n')
        });
    }
};
