const fs = require('fs');
const path = require('path');
const { REST, Routes, Client, GatewayIntentBits } = require('discord.js');

const EYED = process.env.GUILD_ID || '1428561902086262908';
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('Falta DISCORD_TOKEN o CLIENT_ID');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function countGuild(gid) {
    try {
        const cmds = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, gid));
        return { gid, count: cmds.length, ok: true };
    } catch (e) {
        return { gid, count: 0, ok: false, err: e.message, status: e.status, raw: e.rawError };
    }
}

function loadCommands() {
    const byName = new Map();
    const root = path.join(__dirname, '..', 'src', 'commands');
    const skip = new Set(['voznombre', 'vozprivado']);
    for (const folder of fs.readdirSync(root)) {
        if (folder.toLowerCase() === 'music') continue;
        const dir = path.join(root, folder);
        if (!fs.statSync(dir).isDirectory()) continue;
        for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
            const cmd = require(path.join(dir, file));
            if (!cmd?.data?.name || !cmd.execute) continue;
            if (skip.has(cmd.data.name)) continue;
            byName.set(cmd.data.name, cmd.data.toJSON());
        }
    }
    return [...byName.values()];
}

(async () => {
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(TOKEN);
    const guilds = [...client.guilds.cache.values()].map((g) => ({ id: g.id, name: g.name }));
    await client.destroy();

    console.log('=== ANTES ===');
    for (const g of guilds) {
        const r = await countGuild(g.id);
        const mark = g.id === EYED ? ' <EYEDCOMUN' : '';
        console.log(`${g.name}: ${r.ok ? r.count + ' cmds' : 'ERR ' + r.err}${mark}`);
    }

    const all = loadCommands();
    console.log(`\nRegistrando ${all.length} comandos en EyedComun (${EYED})...`);

    try {
        const result = await Promise.race([
            rest.put(Routes.applicationGuildCommands(CLIENT_ID, EYED), { body: all }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 180s')), 180000))
        ]);
        console.log('OK:', result.length, 'comandos registrados');
    } catch (e) {
        console.error('FALLO:', e.message);
        if (e.status) console.error('HTTP', e.status);
        if (e.rawError) console.error('Discord:', JSON.stringify(e.rawError));
        process.exit(1);
    }

    const after = await countGuild(EYED);
    console.log('\n=== DESPUES EYEDCOMUN ===', after.count, 'comandos');
})();
