'use strict';

/**
 * Compacta canales de voz EyedComun sin borrar salas:
 * CREA TU SALA (solo generador) + una categoría VOZ con secciones.
 *
 *   GUILD_ID=1428561902086262908 node scripts/compact-eyedcomun-voice.js
 */
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');

const GUILD_ID = String(process.env.GUILD_ID || '1428561902086262908').trim();
const SLEEP = 400;

const CAT = (label) => `° ˖ ✧ ❥ ${label}`;
const DIV_TOP = (emoji, label) => `┏━━ ${emoji} ${label} ━━┓`;

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function key(name) {
    return String(name || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function isDivider(name) {
    return /[┏┗┐┘╔╚━─]/.test(String(name || '')) || String(name).includes('»»');
}

function isVoiceRelatedCat(name) {
    const k = key(name);
    return (
        k.includes('voz') ||
        k.includes('crea') ||
        k.includes('lobby') ||
        k.includes('cine') ||
        k.includes('duo') ||
        k.includes('squad') ||
        k.includes('gaming') ||
        k.includes('ranked')
    );
}

function sectionOf(name) {
    const k = key(name);
    if (k.includes('duo')) return 'DUO';
    if (k.includes('squad')) return 'SQUAD';
    if (k.includes('ranked') || k.includes('competitivo')) return 'RANKED';
    if (k.includes('peli') || k.includes('series') || k.includes('watch') || k.includes('cine') || k.includes('silent')) {
        return 'CINE';
    }
    if (k.includes('gaming') || k.includes('flex') || k.includes('lfg') || k.includes('casual')) return 'GAMING';
    return 'SOCIAL';
}

const SECTION_ORDER = [
    { id: 'SOCIAL', emoji: '💬', label: 'SOCIAL' },
    { id: 'DUO', emoji: '💕', label: 'DUO' },
    { id: 'SQUAD', emoji: '👥', label: 'SQUAD' },
    { id: 'GAMING', emoji: '🎮', label: 'GAMING' },
    { id: 'RANKED', emoji: '🏆', label: 'RANKED' },
    { id: 'CINE', emoji: '🎬', label: 'CINE' }
];

function kidsOf(guild, parentId) {
    return [...guild.channels.cache.values()]
        .filter((c) => c.parentId === parentId)
        .sort((a, b) => (a.rawPosition ?? a.position) - (b.rawPosition ?? b.position));
}

function findCat(guild, needle) {
    const k = key(needle);
    return [...guild.channels.cache.values()].find(
        (c) => c.type === ChannelType.GuildCategory && key(c.name).includes(k)
    );
}

(async () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
    await new Promise((resolve, reject) => {
        client.once('clientReady', resolve);
        client.once('ready', resolve);
        client.login(process.env.DISCORD_TOKEN).catch(reject);
    });

    const guild = await client.guilds.fetch(GUILD_ID);
    await guild.channels.fetch();

    const crea = findCat(guild, 'crea');
    const dest = findCat(guild, 'vozsocial') || findCat(guild, 'voz');
    if (!crea || !dest) throw new Error('Falta CREA TU SALA o VOZ SOCIAL');

    const staff = findCat(guild, 'staff');
    const sourceCats = [...guild.channels.cache.values()].filter((c) => {
        if (c.type !== ChannelType.GuildCategory) return false;
        if (c.id === crea.id || c.id === dest.id) return false;
        if (staff && c.id === staff.id) return false;
        return isVoiceRelatedCat(c.name);
    });

    const rooms = [];
    for (const cat of [dest, ...sourceCats]) {
        for (const ch of kidsOf(guild, cat.id)) {
            if (ch.type !== ChannelType.GuildVoice && ch.type !== ChannelType.GuildStageVoice) continue;
            if (isDivider(ch.name)) continue;
            rooms.push(ch);
        }
    }

    if (dest.name !== CAT('VOZ')) {
        await dest.setName(CAT('VOZ'), 'EyedComun: compactar voz');
        await sleep(SLEEP);
    }

    for (const ch of rooms) {
        if (ch.parentId !== dest.id) {
            await ch.setParent(dest.id, { lockPermissions: false, reason: 'EyedComun: compactar voz' });
            await sleep(SLEEP);
        }
    }

    for (const cat of sourceCats) {
        for (const ch of kidsOf(guild, cat.id)) {
            if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
                await ch.delete('EyedComun: divisor viejo al compactar voz').catch(() => null);
                await sleep(SLEEP);
            }
        }
        await cat.delete('EyedComun: categoría de voz vacía').catch(() => null);
        await sleep(SLEEP);
    }

    for (const ch of kidsOf(guild, dest.id)) {
        if (isDivider(ch.name)) {
            await ch.delete('EyedComun: divisor viejo').catch(() => null);
            await sleep(SLEEP);
        }
    }

    const grouped = new Map(SECTION_ORDER.map((s) => [s.id, []]));
    for (const ch of rooms) {
        grouped.get(sectionOf(ch.name)).push(ch);
    }

    const ordered = [];
    for (const section of SECTION_ORDER) {
        const list = grouped.get(section.id) || [];
        if (!list.length) continue;
        const div = await guild.channels.create({
            name: DIV_TOP(section.emoji, section.label),
            type: ChannelType.GuildVoice,
            parent: dest.id,
            reason: 'EyedComun: sección compacta'
        });
        await sleep(SLEEP);
        ordered.push(div, ...list);
    }

    for (let i = 0; i < ordered.length; i += 1) {
        const ch = ordered[i];
        const pos = ch.rawPosition ?? ch.position;
        if (pos !== i) {
            await ch.setPosition(i, { reason: 'EyedComun: orden secciones voz' });
            await sleep(SLEEP);
        }
    }

    await guild.channels.fetch();
    const cats = [...guild.channels.cache.values()]
        .filter((c) => c.type === ChannelType.GuildCategory)
        .sort((a, b) => (a.rawPosition ?? a.position) - (b.rawPosition ?? b.position));

    const textCats = cats.filter((c) => !isVoiceRelatedCat(c.name) && (!staff || c.id !== staff.id) && c.id !== dest.id && c.id !== crea.id);
    const other = cats.filter(
        (c) =>
            c.id !== crea.id &&
            c.id !== dest.id &&
            (!staff || c.id !== staff.id) &&
            !textCats.some((t) => t.id === c.id)
    );
    const order = [...textCats, crea, dest, ...other, ...(staff ? [staff] : [])];
    const unique = [];
    const seen = new Set();
    for (const c of order) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        unique.push(c);
    }
    await guild.channels.setPositions(unique.map((c, i) => ({ channel: c.id, position: i })));

    const summary = SECTION_ORDER.map((s) => ({
        section: s.id,
        rooms: (grouped.get(s.id) || []).map((c) => c.name)
    })).filter((s) => s.rooms.length);

    console.log(JSON.stringify({
        ok: true,
        crea: crea.name,
        voz: dest.name,
        roomsKept: rooms.length,
        sections: summary,
        catOrder: unique.map((c) => c.name)
    }, null, 2));

    await client.destroy();
    process.exit(0);
})().catch((e) => {
    console.error('❌', e);
    process.exit(1);
});
