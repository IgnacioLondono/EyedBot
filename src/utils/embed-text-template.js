/**
 * Plantillas de texto para embeds configurables desde el panel.
 * Variables de miembro: {user}, {mention}, {username}, {server}, {memberCount}, …
 * Canales: {#nombre-canal}, {channel:nombre-canal}, {channel:123456789} o <#id> (se conserva).
 */

function findGuildChannel(guild, ref) {
    if (!guild || ref == null) return null;

    const raw = String(ref).trim().replace(/^#/, '');
    if (!raw) return null;

    if (/^\d{17,20}$/.test(raw)) {
        const byId = guild.channels?.cache?.get(raw);
        if (byId) return byId;
        return null;
    }

    const lower = raw.toLowerCase();
    const cache = guild.channels?.cache;
    if (!cache) return null;

    return cache.find((channel) => {
        if (!channel?.name || channel.name.toLowerCase() !== lower) return false;
        if (typeof channel.isTextBased === 'function') return channel.isTextBased();
        return true;
    }) || null;
}

function resolveChannelMentions(text, guild) {
    if (!guild || text == null || text === '') return String(text ?? '');

    let out = String(text);

    out = out.replace(/\{channel:([^}]+)\}/gi, (match, ref) => {
        const channel = findGuildChannel(guild, ref);
        return channel ? `<#${channel.id}>` : match;
    });

    out = out.replace(/\{#([^}]+)\}/gi, (match, ref) => {
        const channel = findGuildChannel(guild, ref);
        return channel ? `<#${channel.id}>` : match;
    });

    return out;
}

function applyMemberVariables(text, member) {
    if (!member) return String(text ?? '');

    const uid = member?.user?.id ?? member?.id;
    const discordMention = uid && String(uid) !== '0' ? `<@${uid}>` : '@usuario';
    const uname = member?.user?.username || member?.displayName || 'Usuario';
    const srv = member?.guild?.name || 'Servidor';
    const mc = String(member?.guild?.memberCount ?? '');

    return String(text || '')
        .replace(/\{mention\}/gi, discordMention)
        .replace(/\{user\}/gi, discordMention)
        .replace(/\{username\}|\{usuario\}|\{nombre\}/gi, uname)
        .replace(/\{server\}|\{guild\}/gi, srv)
        .replace(/\{memberCount\}|\{members\}|\{member_count\}/gi, mc);
}

/**
 * @param {string} text
 * @param {{ guild?: import('discord.js').Guild, member?: import('discord.js').GuildMember }} context
 */
function applyGuildEmbedText(text, context = {}) {
    const { guild, member } = context;
    let out = String(text ?? '');
    if (member) out = applyMemberVariables(out, member);
    if (guild) out = resolveChannelMentions(out, guild);
    return out;
}

module.exports = {
    findGuildChannel,
    resolveChannelMentions,
    applyMemberVariables,
    applyGuildEmbedText
};
