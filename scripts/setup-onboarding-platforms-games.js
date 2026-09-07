'use strict';

/**
 * Crea roles + emojis de plataformas/juegos y los agrega al Onboarding de Discord
 * (la pantalla de elegir roles al entrar). No es un panel web.
 *
 * Uso (dentro del contenedor):
 *   node scripts/setup-onboarding-platforms-games.js
 */
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, GuildOnboardingPromptType } = require('discord.js');

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
            color: item.color,
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

function mapExistingPrompt(prompt) {
    return {
        id: prompt.id,
        title: prompt.title,
        singleSelect: prompt.singleSelect,
        required: prompt.required,
        inOnboarding: prompt.inOnboarding,
        type: prompt.type,
        options: [...prompt.options.values()].map((o) => ({
            id: o.id,
            title: o.title,
            description: o.description || undefined,
            emoji: o.emoji
                ? (o.emoji.id
                    ? { id: o.emoji.id, name: o.emoji.name, animated: Boolean(o.emoji.animated) }
                    : o.emoji.name)
                : undefined,
            roleIds: o.roles ? [...o.roles.keys()] : [],
            channelIds: o.channels ? [...o.channels.keys()] : []
        }))
    };
}

function buildOptions(items, roleMap, emojiMap) {
    return items.map((item) => {
        const role = roleMap.get(item.key);
        const emoji = emojiMap.get(item.key);
        return {
            title: item.name.slice(0, 50),
            description: item.description.slice(0, 50),
            roleIds: role ? [role.id] : [],
            channelIds: [],
            emoji: emoji
                ? { id: emoji.id, name: emoji.name, animated: Boolean(emoji.animated) }
                : undefined
        };
    }).filter((o) => o.roleIds.length);
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

    const onboarding = await guild.fetchOnboarding();
    const existing = [...onboarding.prompts.values()].map(mapExistingPrompt);

    // Quitar prompts previos de plataformas/juegos si se re-ejecuta
    const filtered = existing.filter((p) => {
        const t = String(p.title || '').toLowerCase();
        return !t.includes('plataforma') && !t.includes('juegos jug') && t !== 'qué juegos jugás?' && t !== 'que juegos jugas?';
    });

    const platformPrompt = {
        title: 'En qué plataforma jugás?',
        singleSelect: false,
        required: false,
        inOnboarding: true,
        type: GuildOnboardingPromptType.MultipleChoice,
        options: buildOptions(PLATFORM_ROLES, roleMap, emojiMap)
    };

    const gamePrompt = {
        title: 'Qué juegos jugás?',
        singleSelect: false,
        required: false,
        inOnboarding: true,
        type: GuildOnboardingPromptType.MultipleChoice,
        options: buildOptions(GAME_ROLES, roleMap, emojiMap)
    };

    // Insertar antes de "Verificate" si existe
    const verifyIdx = filtered.findIndex((p) => String(p.title).toLowerCase().includes('verific'));
    const nextPrompts = [...filtered];
    if (verifyIdx >= 0) {
        nextPrompts.splice(verifyIdx, 0, platformPrompt, gamePrompt);
    } else {
        nextPrompts.push(platformPrompt, gamePrompt);
    }

    await guild.editOnboarding({
        enabled: true,
        mode: onboarding.mode,
        prompts: nextPrompts,
        defaultChannels: [...onboarding.defaultChannels.keys()]
    });

    console.log(JSON.stringify({
        ok: true,
        guild: guild.name,
        roles: [...roleMap.entries()].map(([k, r]) => ({ key: k, id: r.id, name: r.name })),
        emojis: [...emojiMap.entries()].map(([k, e]) => ({ key: k, id: e.id, name: e.name })),
        promptCount: nextPrompts.length
    }, null, 2));

    await client.destroy();
    process.exit(0);
})().catch((error) => {
    console.error('❌', error);
    process.exit(1);
});
