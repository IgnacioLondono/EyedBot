require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const EYED = process.env.GUILD_ID || '1428561902086262908';
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const BATCH_SIZE = Math.max(1, Number.parseInt(process.env.SLASH_TURBO_BATCH || '8', 10));
const POST_GAP_MS = Math.max(200, Number.parseInt(process.env.SLASH_POST_DELAY_MS || '350', 10));
const POST_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.SLASH_REQUEST_TIMEOUT_MS || '10000', 10));
const SETTLE_MS = Math.max(5000, Number.parseInt(process.env.SLASH_TURBO_SETTLE_MS || '12000', 10));
const MAX_ROUNDS = Math.max(1, Number.parseInt(process.env.SLASH_TURBO_ROUNDS || '6', 10));

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

async function getExistingNames() {
    const list = await rest.get(Routes.applicationGuildCommands(CLIENT_ID, EYED));
    return { list, names: new Set(list.map((c) => c.name)) };
}

async function postFast(body) {
    try {
        await Promise.race([
            rest.post(Routes.applicationGuildCommands(CLIENT_ID, EYED), { body }),
            sleep(POST_TIMEOUT_MS).then(() => Promise.reject(new Error('timeout')))
        ]);
        return true;
    } catch (error) {
        if (error.status === 429) {
            const wait = Math.ceil((error.rawError?.retry_after || 3) * 1000) + 300;
            await sleep(wait);
            return postFast(body);
        }
        return false;
    }
}

(async () => {
    try {
        const all = loadCommands();
        let { list, names } = await getExistingNames();
        console.log(`EyedComun (${EYED}): ${names.size}/${all.length} comandos. Modo turbo...`);

        let remaining = all.filter((c) => !names.has(c.name));
        if (!remaining.length) {
            console.log('Ya están todos.');
            return;
        }

        for (let round = 1; round <= MAX_ROUNDS && remaining.length; round++) {
            console.log(`Ronda ${round}/${MAX_ROUNDS}: enviando ${remaining.length}...`);
            for (let i = 0; i < remaining.length; i++) {
                await postFast(remaining[i]);
                if ((i + 1) % BATCH_SIZE === 0) await sleep(1500);
                else await sleep(POST_GAP_MS);
            }

            console.log(`Esperando ${SETTLE_MS}ms a que Discord aplique...`);
            await sleep(SETTLE_MS);
            ({ list, names } = await getExistingNames());
            remaining = all.filter((c) => !names.has(c.name));
            console.log(`→ ${names.size}/${all.length} registrados, faltan ${remaining.length}`);
        }

        if (remaining.length) {
            console.log(`Pendientes (${remaining.length}): ${remaining.map((c) => c.name).join(', ')}`);
            process.exit(1);
        }
        console.log(`Listo: ${list.length} comandos en EyedComun.`);
    } catch (e) {
        console.error('Error:', e.message);
        if (e.rawError) console.error(JSON.stringify(e.rawError));
        process.exit(1);
    }
})();
