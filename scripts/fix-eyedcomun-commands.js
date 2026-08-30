require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST } = require('discord.js');
const { registerGuildCommandsIncremental } = require('../src/utils/slash-command-register');

const EYED = process.env.GUILD_ID || '1428561902086262908';
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN || !CLIENT_ID) {
    console.error('Falta DISCORD_TOKEN o CLIENT_ID');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

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
    try {
        const all = loadCommands();
        console.log(`EyedComun (${EYED}): registrando ${all.length} comandos (modo incremental, timeout 120s)...`);

        const stats = await registerGuildCommandsIncremental(rest, CLIENT_ID, EYED, all, {
            onProgress: (action, name, err) => {
                if (action === 'error') console.error(`x ${name}: ${err}`);
                else console.log(`${action === 'create' ? '+' : '~'} ${name}`);
            }
        });

        console.log(`\nListo: total API ${stats.total} (+${stats.created} nuevos, ~${stats.updated} actualizados, =${stats.skipped} sin cambios, x${stats.failed} fallidos)`);
        if (stats.failed > 0) process.exit(1);
    } catch (e) {
        console.error('Error:', e.message);
        if (e.rawError) console.error(JSON.stringify(e.rawError));
        process.exit(1);
    }
})();
