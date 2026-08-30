const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const EYED = process.env.GUILD_ID || '1428561902086262908';
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const DELAY_MS = Math.max(300, Number.parseInt(process.env.SLASH_POST_DELAY_MS || '1200', 10));

if (!TOKEN || !CLIENT_ID) {
    console.error('Falta DISCORD_TOKEN o CLIENT_ID');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        const existing = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, EYED));
        const existingNames = new Set(existing.map((c) => c.name));
        console.log(`EyedComun: ${existing.length} comandos actuales`);

        const all = loadCommands();
        const missing = all.filter((c) => !existingNames.has(c.name));
        console.log(`Faltan por registrar: ${missing.length} de ${all.length}`);

        if (!missing.length) {
            console.log('Nada que hacer.');
            return;
        }

        let ok = 0;
        let fail = 0;
        for (const cmd of missing) {
            let posted = false;
            for (let attempt = 1; attempt <= 4; attempt++) {
                try {
                    await Promise.race([
                        rest.post(Routes.applicationGuildCommands(CLIENT_ID, EYED), { body: cmd }),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 45s')), 45000))
                    ]);
                    ok++;
                    posted = true;
                    console.log(`+ ${cmd.name} (${ok}/${missing.length})`);
                    break;
                } catch (err) {
                    if (err.status === 429) {
                        const wait = Math.ceil((err.rawError?.retry_after || 5) * 1000) + 500;
                        console.log(`  rate limit ${cmd.name}, espera ${wait}ms`);
                        await sleep(wait);
                    } else if (attempt === 4) {
                        fail++;
                        console.error(`x ${cmd.name}:`, err.message);
                    } else {
                        await sleep(1500);
                    }
                }
            }
            if (!posted) continue;
            await sleep(DELAY_MS);
        }

        const after = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, EYED));
        console.log(`\nListo: +${ok} nuevos, ${fail} fallidos, total API: ${after.length}`);
    } catch (e) {
        console.error('Error:', e.message);
        if (e.rawError) console.error(JSON.stringify(e.rawError));
        process.exit(1);
    }
})();
