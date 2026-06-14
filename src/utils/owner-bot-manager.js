const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REST, Routes } = require('discord.js');
const {
    createEyedBotClient,
    bootstrapAuxiliaryClient
} = require('./bot-runtime');

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'owner-bots.json');
const runtime = new Map();

const INTENTS_SETUP_HINT =
    'En Discord Developer Portal → tu aplicación → Bot → Privileged Gateway Intents, activa '
    + '«SERVER MEMBERS INTENT» y «MESSAGE CONTENT INTENT». Guarda los cambios y pulsa Iniciar otra vez.';

function formatBotLoginError(raw) {
    const msg = String(raw || '').trim();
    if (/disallowed intents/i.test(msg)) {
        return `Intents no habilitados en Discord. ${INTENTS_SETUP_HINT}`;
    }
    return msg || 'No se pudo conectar el bot';
}

function asBotError(error, fallback = 'Error en bot auxiliar') {
    const message = formatBotLoginError(error?.message || error || fallback);
    return Object.assign(new Error(message), {
        statusCode: Number.isInteger(error?.statusCode) ? error.statusCode : 400
    });
}

function ensureStore() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STORE_PATH)) {
        fs.writeFileSync(STORE_PATH, JSON.stringify({ bots: [] }, null, 2), 'utf8');
    }
}

function readStore() {
    ensureStore();
    try {
        const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8') || '{}');
        if (!Array.isArray(parsed.bots)) parsed.bots = [];
        return parsed;
    } catch {
        return { bots: [] };
    }
}

function writeStore(data) {
    ensureStore();
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function newBotId() {
    return crypto.randomBytes(8).toString('hex');
}

function maskToken(token) {
    const value = String(token || '').trim();
    if (value.length <= 8) return '••••';
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function sanitizePublicRecord(record) {
    const rt = runtime.get(record.id);
    const client = rt?.client;
    const user = client?.user;
    return {
        id: record.id,
        label: record.label || 'Bot auxiliar',
        enabled: record.enabled !== false,
        status: rt?.status || (record.enabled === false ? 'stopped' : 'offline'),
        username: user?.username || record.username || '',
        discriminator: user?.discriminator || record.discriminator || '0',
        displayName: user?.globalName || user?.username || record.label || '',
        applicationId: user?.id || record.applicationId || '',
        avatar: user?.avatar || record.avatar || null,
        avatarUrl: user?.displayAvatarURL?.({ size: 128 }) || record.avatarUrl || null,
        guildCount: client?.guilds?.cache?.size ?? record.guildCount ?? 0,
        ping: client?.ws?.ping ?? null,
        tokenHint: maskToken(record.token),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastError: rt?.lastError || record.lastError || null
    };
}

async function validateBotToken(token) {
    const rest = new REST({ version: '10' }).setToken(token);
    const user = await rest.get(Routes.user());
    if (!user?.id) throw new Error('Token inválido');
    if (!user.bot) throw new Error('El token debe ser de un bot de Discord');
    return user;
}

function findRecord(store, id) {
    return store.bots.find((bot) => bot.id === id) || null;
}

async function stopBotRuntime(id) {
    const rt = runtime.get(id);
    if (!rt) return;
    runtime.delete(id);
    try {
        if (rt.client) {
            rt.status = 'stopping';
            await rt.client.destroy();
        }
    } catch (error) {
        console.warn(`⚠️ Error deteniendo bot auxiliar ${id}:`, error?.message || error);
    }
}

async function startBotRuntime(record) {
    await stopBotRuntime(record.id);

    const client = createEyedBotClient();
    const rt = { client, status: 'starting', lastError: null };
    runtime.set(record.id, rt);

    client.on('error', (error) => {
        rt.lastError = formatBotLoginError(error?.message || error);
        console.error(`❌ Bot auxiliar ${record.label}:`, rt.lastError);
    });

    bootstrapAuxiliaryClient(client, record.token, { label: record.label });

    client.once('clientReady', () => {
        rt.status = 'online';
        rt.lastError = null;
        const store = readStore();
        const idx = store.bots.findIndex((b) => b.id === record.id);
        if (idx >= 0) {
            store.bots[idx].username = client.user.username;
            store.bots[idx].discriminator = client.user.discriminator;
            store.bots[idx].applicationId = client.user.id;
            store.bots[idx].avatar = client.user.avatar;
            store.bots[idx].avatarUrl = client.user.displayAvatarURL({ size: 128 });
            store.bots[idx].guildCount = client.guilds.cache.size;
            store.bots[idx].updatedAt = new Date().toISOString();
            store.bots[idx].lastError = null;
            writeStore(store);
        }
    });

    try {
        await client.login(record.token);
    } catch (error) {
        rt.status = 'error';
        rt.lastError = formatBotLoginError(error?.message || error);
        runtime.delete(record.id);
        throw asBotError(error);
    }
}

async function initOwnerBots() {
    const store = readStore();
    for (const record of store.bots) {
        if (record.enabled === false || !record.token) continue;
        try {
            await startBotRuntime(record);
            console.log(`🤖 Bot auxiliar iniciado: ${record.label || record.id}`);
        } catch (error) {
            console.error(`❌ No se pudo iniciar bot auxiliar ${record.label || record.id}:`, error?.message || error);
            const idx = store.bots.findIndex((b) => b.id === record.id);
            if (idx >= 0) {
                store.bots[idx].lastError = formatBotLoginError(error?.message || error);
                writeStore(store);
            }
        }
    }
}

async function shutdownOwnerBots() {
    const ids = Array.from(runtime.keys());
    await Promise.all(ids.map((id) => stopBotRuntime(id)));
}

function listBotsPublic() {
    const store = readStore();
    return store.bots.map(sanitizePublicRecord);
}

async function createBot({ label, token }) {
    const cleanToken = String(token || '').trim();
    const cleanLabel = String(label || '').trim() || 'Bot auxiliar';
    if (!cleanToken) throw Object.assign(new Error('Falta el token del bot'), { statusCode: 400 });

    const user = await validateBotToken(cleanToken);
    const store = readStore();
    if (store.bots.some((bot) => bot.applicationId === user.id)) {
        throw Object.assign(new Error('Ese bot ya está registrado'), { statusCode: 409 });
    }

    const now = new Date().toISOString();
    const record = {
        id: newBotId(),
        label: cleanLabel,
        token: cleanToken,
        enabled: true,
        username: user.username,
        discriminator: user.discriminator,
        applicationId: user.id,
        avatar: user.avatar,
        avatarUrl: user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
            : null,
        guildCount: 0,
        createdAt: now,
        updatedAt: now,
        lastError: null
    };

    store.bots.push(record);
    writeStore(store);

    try {
        await startBotRuntime(record);
    } catch (error) {
        record.lastError = formatBotLoginError(error?.message || error);
        record.enabled = false;
        writeStore(store);
        throw asBotError(error);
    }

    return sanitizePublicRecord(record);
}

async function deleteBot(id) {
    const store = readStore();
    const idx = store.bots.findIndex((bot) => bot.id === id);
    if (idx < 0) throw Object.assign(new Error('Bot no encontrado'), { statusCode: 404 });
    await stopBotRuntime(id);
    store.bots.splice(idx, 1);
    writeStore(store);
    return { success: true };
}

async function updateBot(id, patch = {}) {
    const store = readStore();
    const record = findRecord(store, id);
    if (!record) throw Object.assign(new Error('Bot no encontrado'), { statusCode: 404 });

    if (patch.label != null) {
        record.label = String(patch.label).trim() || record.label;
    }

    if (patch.token != null) {
        const cleanToken = String(patch.token).trim();
        if (!cleanToken) throw Object.assign(new Error('Token vacío'), { statusCode: 400 });
        const user = await validateBotToken(cleanToken);
        record.token = cleanToken;
        record.applicationId = user.id;
        record.username = user.username;
        record.discriminator = user.discriminator;
        record.avatar = user.avatar;
        await stopBotRuntime(id);
        if (record.enabled !== false) {
            try {
                await startBotRuntime(record);
                record.lastError = null;
            } catch (error) {
                record.enabled = false;
                record.lastError = formatBotLoginError(error?.message || error);
                record.updatedAt = new Date().toISOString();
                writeStore(store);
                throw asBotError(error);
            }
        }
    }

    if (patch.enabled != null) {
        record.enabled = patch.enabled === true;
        if (record.enabled) {
            try {
                await startBotRuntime(record);
                record.lastError = null;
            } catch (error) {
                record.enabled = false;
                record.lastError = formatBotLoginError(error?.message || error);
                record.updatedAt = new Date().toISOString();
                writeStore(store);
                throw asBotError(error);
            }
        } else {
            await stopBotRuntime(id);
            record.lastError = null;
        }
    }

    record.updatedAt = new Date().toISOString();
    writeStore(store);
    return sanitizePublicRecord(record);
}

async function updateBotProfile(id, { username }) {
    const rt = runtime.get(id);
    if (!rt?.client?.user) {
        throw Object.assign(new Error('El bot no está en línea'), { statusCode: 409 });
    }
    const cleanName = String(username || '').trim();
    if (!cleanName || cleanName.length < 2 || cleanName.length > 32) {
        throw Object.assign(new Error('El nombre debe tener entre 2 y 32 caracteres'), { statusCode: 400 });
    }
    await rt.client.user.setUsername(cleanName);

    const store = readStore();
    const record = findRecord(store, id);
    if (record) {
        record.username = rt.client.user.username;
        record.updatedAt = new Date().toISOString();
        writeStore(store);
    }
    return sanitizePublicRecord(record || { id });
}

async function updateBotAvatar(id, buffer, mimeType = 'image/png') {
    const rt = runtime.get(id);
    if (!rt?.client?.user) {
        throw Object.assign(new Error('El bot no está en línea'), { statusCode: 409 });
    }
    if (!buffer?.length) throw Object.assign(new Error('Imagen vacía'), { statusCode: 400 });
    await rt.client.user.setAvatar(buffer);

    const store = readStore();
    const record = findRecord(store, id);
    if (record) {
        record.avatar = rt.client.user.avatar;
        record.avatarUrl = rt.client.user.displayAvatarURL({ size: 128 });
        record.updatedAt = new Date().toISOString();
        writeStore(store);
    }
    return sanitizePublicRecord(record || { id });
}

function getRuntimeClient(id) {
    const rt = runtime.get(id);
    if (!rt?.client || rt.status !== 'online') return null;
    return rt.client;
}

async function listBotGuilds(id) {
    const client = getRuntimeClient(id);
    if (!client) throw Object.assign(new Error('El bot no está en línea'), { statusCode: 409 });

    let guilds = client.guilds.cache;
    if (!guilds.size) {
        try {
            await client.guilds.fetch();
            guilds = client.guilds.cache;
        } catch {
            /* noop */
        }
    }

    return Array.from(guilds.values()).map((guild) => ({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        iconUrl: guild.iconURL({ size: 128 }),
        memberCount: guild.memberCount ?? null
    }));
}

async function listBotGuildChannels(id, guildId) {
    const client = getRuntimeClient(id);
    if (!client) throw Object.assign(new Error('El bot no está en línea'), { statusCode: 409 });

    let guild = client.guilds.cache.get(String(guildId));
    if (!guild) {
        try {
            guild = await client.guilds.fetch(String(guildId));
        } catch {
            throw Object.assign(new Error('Servidor no encontrado'), { statusCode: 404 });
        }
    }

    let channels = guild.channels.cache;
    if (!channels.size) {
        try {
            await guild.channels.fetch();
            channels = guild.channels.cache;
        } catch {
            /* noop */
        }
    }

    return Array.from(channels.values())
        .filter((ch) => ch.isTextBased?.() && !ch.isThread?.())
        .map((ch) => ({
            id: ch.id,
            name: ch.name,
            type: ch.type,
            parentId: ch.parentId || null
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

async function fetchBotChatMessages(id, { guildId, channelId, limit = 40, before }) {
    const client = getRuntimeClient(id);
    if (!client) throw Object.assign(new Error('El bot no está en línea'), { statusCode: 409 });

    const guild = await client.guilds.fetch(String(guildId)).catch(() => null);
    if (!guild) throw Object.assign(new Error('Servidor no encontrado'), { statusCode: 404 });

    const channel = await guild.channels.fetch(String(channelId)).catch(() => null);
    if (!channel?.isTextBased?.()) throw Object.assign(new Error('Canal no válido'), { statusCode: 404 });

    const perms = channel.permissionsFor(guild.members.me);
    if (!perms?.has(['ViewChannel', 'ReadMessageHistory'])) {
        throw Object.assign(new Error('El bot no puede leer este canal'), { statusCode: 403 });
    }

    const safeLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 40));
    const messages = await channel.messages.fetch({
        limit: safeLimit,
        ...(before ? { before: String(before) } : {})
    });

    const botId = client.user.id;
    const rows = Array.from(messages.values())
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((msg) => ({
            id: msg.id,
            content: msg.content || '',
            authorId: msg.author?.id || '',
            authorName: msg.member?.displayName || msg.author?.globalName || msg.author?.username || 'Usuario',
            authorAvatar: msg.author?.displayAvatarURL?.({ size: 64 }) || null,
            isBot: msg.author?.bot === true,
            isSelf: msg.author?.id === botId,
            timestamp: msg.createdAt?.toISOString?.() || new Date(msg.createdTimestamp).toISOString(),
            attachments: Array.from(msg.attachments.values()).map((att) => ({
                url: att.url,
                name: att.name,
                contentType: att.contentType || null
            }))
        }));

    return { messages: rows, botId };
}

async function sendBotChatMessage(id, { guildId, channelId, content, ownerTag }) {
    const client = getRuntimeClient(id);
    if (!client) throw Object.assign(new Error('El bot no está en línea'), { statusCode: 409 });

    const text = String(content || '').trim();
    if (!text) throw Object.assign(new Error('Mensaje vacío'), { statusCode: 400 });
    if (text.length > 2000) throw Object.assign(new Error('Máximo 2000 caracteres'), { statusCode: 400 });

    const guild = await client.guilds.fetch(String(guildId)).catch(() => null);
    if (!guild) throw Object.assign(new Error('Servidor no encontrado'), { statusCode: 404 });

    const channel = await guild.channels.fetch(String(channelId)).catch(() => null);
    if (!channel?.isTextBased?.()) throw Object.assign(new Error('Canal no válido'), { statusCode: 404 });

    const perms = channel.permissionsFor(guild.members.me);
    if (!perms?.has(['ViewChannel', 'SendMessages'])) {
        throw Object.assign(new Error('El bot no puede escribir en este canal'), { statusCode: 403 });
    }

    const prefix = ownerTag ? `**[${ownerTag}]** ` : '';
    const sent = await channel.send(`${prefix}${text}`);
    return {
        id: sent.id,
        content: sent.content,
        timestamp: sent.createdAt?.toISOString?.() || new Date().toISOString()
    };
}

module.exports = {
    initOwnerBots,
    shutdownOwnerBots,
    listBotsPublic,
    createBot,
    deleteBot,
    updateBot,
    updateBotProfile,
    updateBotAvatar,
    listBotGuilds,
    listBotGuildChannels,
    fetchBotChatMessages,
    sendBotChatMessage,
    getRuntimeClient
};
