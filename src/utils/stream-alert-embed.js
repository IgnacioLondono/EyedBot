const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PLATFORM_META = {
    twitch: { name: 'Twitch', color: 0x9146ff, emoji: '🟣', label: 'Ver en Twitch' },
    youtube: { name: 'YouTube', color: 0xff0000, emoji: '🔴', label: 'Ver en YouTube' },
    kick: { name: 'Kick', color: 0x53fc18, emoji: '🟢', label: 'Ver en Kick' },
    rumble: { name: 'Rumble', color: 0x85c742, emoji: '🟢', label: 'Ver en Rumble' },
    tiktok: { name: 'TikTok', color: 0x010101, emoji: '⚫', label: 'Ver en TikTok' },
    custom: { name: 'Directo', color: 0x7c4dff, emoji: '📡', label: 'Ver directo' }
};

function formatNumber(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '';
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return String(num);
}

function applyTemplate(template = '', values = {}) {
    return String(template || '').replace(/\{(\w+)\}/g, (_, key) => {
        const value = values[key];
        return value === undefined || value === null ? '' : String(value);
    });
}

function buildRichStreamEmbed(config, source, item) {
    const plat = String(source?.platform || 'custom').toLowerCase();
    const meta = PLATFORM_META[plat] || PLATFORM_META.custom;
    const live = item?.liveStatus;
    const url = String(item?.url || source?.url || '').trim();
    const name = source?.name || live?.username || url || 'Canal';

    const values = {
        platform: meta.name.toUpperCase(),
        name,
        title: item?.title || live?.title || 'En directo',
        url,
        description: item?.description || '',
        viewers: live?.viewers != null ? formatNumber(live.viewers) : '',
        category: live?.category || ''
    };

    const useRich = (process.env.STREAM_ALERT_RICH_EMBED || 'true').toLowerCase() !== 'false';

    if (!useRich || !live) {
        const title = applyTemplate(config.titleTemplate || '🔴 {platform}: {name} en directo', values).slice(0, 256);
        const description = applyTemplate(config.descriptionTemplate || '{title}\n{url}', values).slice(0, 4000);
        const embed = new EmbedBuilder()
            .setColor(`#${String(config.color || '7c4dff').replace('#', '')}`)
            .setTitle(title)
            .setDescription(description || null)
            .setTimestamp(new Date());
        if (url) embed.setURL(url);
        const imageUrl = String(item?.imageUrl || source?.imageUrl || '').trim();
        if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
            if (config.embedLargePreview) embed.setImage(imageUrl);
            else embed.setThumbnail(imageUrl);
        }
        const footerText = String(config.footerText || '').trim();
        if (footerText) embed.setFooter({ text: footerText.slice(0, 200) });
        return embed;
    }

    const verified = live.verified ? ' ✓' : '';
    const embed = new EmbedBuilder()
        .setColor(meta.color)
        .setURL(url)
        .setTimestamp(new Date())
        .setAuthor({
            name: `${live.username || name}${verified} está EN VIVO`,
            iconURL: live.profileImage || undefined,
            url
        });

    if (live.title) embed.setTitle(String(live.title).slice(0, 256));

    const descParts = [];
    if (live.category) descParts.push(`**Jugando:** ${live.category}`);
    if (live.viewers != null) descParts.push(`**Espectadores:** ${formatNumber(live.viewers)}`);
    if (live.followers != null) {
        const label = plat === 'youtube' ? 'Suscriptores' : 'Seguidores';
        descParts.push(`**${label}:** ${formatNumber(live.followers)}`);
    }
    if (descParts.length) embed.setDescription(descParts.join(' • '));

    if (live.thumbnail) embed.setImage(live.thumbnail);
    else if (live.categoryIcon) embed.setThumbnail(live.categoryIcon);
    else if (live.profileImage && !live.thumbnail) embed.setThumbnail(live.profileImage);

    embed.setFooter({ text: meta.name });

    return embed;
}

function buildWatchButtonRow(source, item) {
    const plat = String(source?.platform || 'custom').toLowerCase();
    const meta = PLATFORM_META[plat] || PLATFORM_META.custom;
    const url = String(item?.url || source?.url || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) return null;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(meta.label)
            .setStyle(ButtonStyle.Link)
            .setURL(url)
            .setEmoji(meta.emoji)
    );
}

module.exports = {
    PLATFORM_META,
    buildRichStreamEmbed,
    buildWatchButtonRow,
    applyTemplate
};
