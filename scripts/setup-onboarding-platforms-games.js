'use strict';

/**
 * Crea roles + emojis de plataformas/juegos y los agrega al Onboarding de Discord
 * (la pantalla de elegir roles al entrar). No es un panel web.
 *
 * Uso (dentro del contenedor):
 *   GUILD_ID=... node scripts/setup-onboarding-platforms-games.js
 */
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, GuildOnboardingPromptType, Routes } = require('discord.js');

const GUILD_ID = String(process.env.GUILD_ID || process.env.DISCORD_GUILD_ID || '').trim();
const PACK_DIR = path.join(__dirname, '..', 'assets', 'server-emojis', 'discord-ready');

const PLATFORM_ROLES = [
    { key: 'pc', name: 'PC', color: 0x38bdf8, file: 'pc.png', description: 'Juego en PC' },
    { key: 'playstation', name: 'PlayStation', color: 0x2563eb, file: 'playstation.png', description: 'Juego en PlayStation' },
    { key: 'xbox', name: 'Xbox', color: 0x16a34a, file: 'xbox.png', description: 'Juego en Xbox' },
    { key: 'nintendo', name: 'Nintendo Switch', color: 0xe11d48, file: 'nintendo_switch.png', description: 'Juego en Switch' },
    { key: 'steam', name: 'Steam', color: 0x1e293b, file: 'steam.gif', description: 'Juego en Steam' }
];

const GAME_ROLES = [
    { key: 'valorant', name: 'Valorant', color: 0xff4655, file: 'valorant.png', description: 'Juego Valorant' },
    { key: 'league', name: 'League of Legends', color: 0xc89b3c, file: 'league_of_legends.png', description: 'Juego LoL' },
    { key: 'minecraft', name: 'Minecraft', color: 0x5d8c3e, file: 'minecraft.png', description: 'Juego Minecraft' },
    { key: 'roblox', name: 'Roblox', color: 0x00a2ff, file: 'roblox.png', description: 'Juego Roblox' },
    { key: 'cs2', name: 'Counter-Strike', color: 0xde9b35, file: 'counter_strike.png', description: 'Juego CS' }
];

function findRoleByName(guild, name) {
    const target = String(name).toLowerCase();
    return guild.roles.cache.find((r) => String(r.name).trim().toLowerCase() === target) || null;
}

async function ensureEmoji(guild, key, fileName) {
    const emojiName = `plat_${key}`.replace(/-/g, '_').slice(0, 32);
    const aliases = new Set([
        emojiName,
        key,
        key.replace(/-/g, '_'),
        String(fileName).replace(/\.(png|gif|webp)$/i, '').replace(/-/g, '_')
    ]);
    let emoji = guild.emojis.cache.find((e) => aliases.has(e.name));
    if (emoji) {
        console.log(`↩️ Emoji existente: ${emoji.name}`);
        return emoji;
    }
    const filePath = path.join(PACK_DIR, fileName);
    if (!fs.existsSync(filePath)) {
        console.warn(`⚠️ Emoji file missing: ${fileName}`);
        return null;
    }
    emoji = await guild.emojis.create({
        attachment: filePath,
        name: emojiName,
        reason: 'EyedBot: onboarding plataformas/juegos'
    });
    console.log(`✅ Emoji subido: ${emojiName}`);
    return emoji;
}

async function ensureRole(guild, item) {
    let role = findRoleByName(guild, item.name);
    if (!role) {
        role = await guild.roles.create({
            name: item.name,
            colors: { primaryColor: item.color },
            mentionable: true,
            hoist: false,
            reason: 'EyedBot: rol onboarding plataformas/juegos'
        });
        console.log(`✅ Rol creado: ${item.name}`);
    } else {
        console.log(`↩️ Rol existente: ${item.name}`);
    }
    return role;
}

function mapRawPrompt(prompt) {
    return {
        id: prompt.id,
        title: prompt.title,
        single_select: Boolean(prompt.single_select),
        required: Boolean(prompt.required),
        in_onboarding: prompt.in_onboarding !== false,
        type: prompt.type,
        options: (prompt.options || []).map((o) => {
            const out = {
                id: o.id,
                title: o.title,
                description: o.description || undefined,
                role_ids: Array.isArray(o.role_ids) ? o.role_ids.map(String) : [],
                channel_ids: Array.isArray(o.channel_ids) ? o.channel_ids.map(String) : []
            };
            if (o.emoji_id) {
                out.emoji = { id: String(o.emoji_id), name: o.emoji_name || 'emoji', animated: Boolean(o.emoji_animated) };
            } else if (o.emoji_name) {
                out.emoji = { name: o.emoji_name };
            }
            return out;
        })
    };
}

function fakeSnowflake() {
    // Discord snowflake-ish id for new onboarding prompts/options
    const ms = BigInt(Date.now() - 1_420_070_400_000);
    const rand = BigInt(Math.floor(Math.random() * 0x3fffff));
    return String((ms << 22n) | rand);
}

function buildRawOptions(items, roleMap, emojiMap) {
    return items.map((item) => {
        const role = roleMap.get(item.key);
        const emoji = emojiMap.get(item.key);
        if (!role) return null;
        const out = {
            id: fakeSnowflake(),
            title: item.name.slice(0, 50),
            description: item.description.slice(0, 50),
            role_ids: [role.id],
            channel_ids: []
        };
        if (emoji) {
            out.emoji = { id: emoji.id, name: emoji.name, animated: Boolean(emoji.animated) };
        }
        return out;
    }).filter(Boolean);
}

(async () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await new Promise((resolve, reject) => {
        client.once('clientReady', resolve);
        client.once('ready', resolve);
        client.login(process.env.DISCORD_TOKEN).catch(reject);
    });

    const guild = client.guilds.cache.get(GUILD_ID) || client.guilds.cache.first();
    if (!guild) throw new Error('Guild no encontrado');
    await guild.roles.fetch();
    await guild.emojis.fetch();

    const allItems = [...PLATFORM_ROLES, ...GAME_ROLES];
    const roleMap = new Map();
    const emojiMap = new Map();

    for (const item of allItems) {
        const emoji = await ensureEmoji(guild, item.key, item.file).catch((e) => {
            console.warn(`⚠️ Emoji ${item.key}: ${e.message}`);
            return null;
        });
        if (emoji) emojiMap.set(item.key, emoji);
        const role = await ensureRole(guild, item);
        roleMap.set(item.key, role);
    }

    // Raw API preserves role_ids even when roles aren't in cache
    const raw = await client.rest.get(Routes.guildOnboarding(guild.id));
    const existing = (raw.prompts || []).map(mapRawPrompt);

    const filtered = existing.filter((p) => {
        const t = String(p.title || '').toLowerCase();
        return !t.includes('plataforma') && !t.includes('juegos jug') && t !== 'plataformas y juegos';
    }).map((p) => {
        // Discord permite max 5 prompts en onboarding; liberamos "intereses" al customize
        const t = String(p.title || '').toLowerCase();
        if (t.includes('interes')) {
            return { ...p, in_onboarding: false };
        }
        return p;
    });

    const combinedPrompt = {
        id: fakeSnowflake(),
        title: 'Plataformas y juegos',
        single_select: false,
        required: false,
        in_onboarding: true,
        type: GuildOnboardingPromptType.MultipleChoice,
        options: [
            ...buildRawOptions(PLATFORM_ROLES, roleMap, emojiMap),
            ...buildRawOptions(GAME_ROLES, roleMap, emojiMap)
        ]
    };

    const verifyIdx = filtered.findIndex((p) => String(p.title).toLowerCase().includes('verific'));
    const nextPrompts = [...filtered];
    if (verifyIdx >= 0) {
        nextPrompts.splice(verifyIdx, 0, combinedPrompt);
    } else {
        nextPrompts.push(combinedPrompt);
    }

    // Validate every option has at least one role or channel
    for (const p of nextPrompts) {
        for (const o of p.options) {
            if (!(o.role_ids || []).length && !(o.channel_ids || []).length) {
                throw new Error(`Opción sin rol/canal: prompt="${p.title}" option="${o.title}"`);
            }
        }
    }

    await client.rest.put(Routes.guildOnboarding(guild.id), {
        body: {
            prompts: nextPrompts,
            default_channel_ids: raw.default_channel_ids || [],
            enabled: true,
            mode: raw.mode
        }
    });

    console.log(JSON.stringify({
        ok: true,
        guild: guild.name,
        roles: [...roleMap.entries()].map(([k, r]) => ({ key: k, id: r.id, name: r.name })),
        emojis: [...emojiMap.entries()].map(([k, e]) => ({ key: k, id: e.id, name: e.name })),
        promptTitles: nextPrompts.map((p) => p.title),
        promptCount: nextPrompts.length
    }, null, 2));

    await client.destroy();
    process.exit(0);
})().catch((error) => {
    console.error('❌', error);
    process.exit(1);
});
