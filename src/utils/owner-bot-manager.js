const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REST, Routes } = require('discord.js');
const {
    createEyedBotClient,
    bootstrapAuxiliaryClient
} = require('./bot-runtime');
const { buildBotInviteUrl } = require('./bot-invite');

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

function slugify(input, fallback = 'bot') {
    const base = String(input || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32);
    return base || fallback;
}

function uniqueSlug(store, desired, excludeId = null) {
    let slug = slugify(desired);
    if (!slug) slug = 'bot';
    let candidate = slug;
    let n = 2;
    while (store.bots.some((bot) => bot.slug === candidate && bot.id !== excludeId)) {
        candidate = `${slug}-${n}`.slice(0, 40);
        n += 1;
    }
    return candidate;
}

function sanitizeBrand(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const name = String(src.name || '').trim().slice(0, 64);
    const logoUrl = String(src.logoUrl || src.logo || '').trim().slice(0, 500);
    let primaryColor = String(src.primaryColor || src.color || '').trim().replace('#', '').slice(0, 6);
    if (primaryColor && !/^[0-9a-fA-F]{6}$/.test(primaryColor)) primaryColor = '';
    return {
        name,
        logoUrl,
        primaryColor: primaryColor ? primaryColor.toLowerCase() : ''
    };
}

function sanitizePublicRecord(record) {
    const rt = runtime.get(record.id);
    const client = rt?.client;
    const user = client?.user;
    const brand = sanitizeBrand(record.brand);
    const clientId = String(record.clientId || user?.id || record.applicationId || '').trim();
    return {
        id: record.id,
        label: record.label || 'Bot auxiliar',
        slug: record.slug || '',
        enabled: record.enabled !== false,
        panelEnabled: record.panelEnabled === true,
        status: rt?.status || (record.enabled === false ? 'stopped' : 'offline'),
        username: user?.username || record.username || '',
        discriminator: user?.discriminator || record.discriminator || '0',
        displayName: user?.globalName || user?.username || record.label || '',
        applicationId: user?.id || record.applicationId || '',
        clientId,
        hasClientSecret: Boolean(String(record.clientSecret || '').trim()),
        assignedDiscordUserId: String(record.assignedDiscordUserId || '').trim(),
        brand,
        panelPath: record.slug ? `/t/${record.slug}` : '',
        panelAuthPath: record.slug ? `/t/${record.slug}/auth` : '',
        avatar: user?.avatar || record.avatar || null,
        avatarUrl: user?.displayAvatarURL?.({ size: 128 }) || record.avatarUrl || null,
        guildCount: client?.guilds?.cache?.size ?? record.guildCount ?? 0,
        ping: client?.ws?.ping ?? null,
        commandsEnabled: record.commandsEnabled !== false,
        tokenHint: maskToken(record.token),
        inviteUrl: buildBotInviteUrl(clientId || client?.user?.id || record.applicationId),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        lastError: rt?.lastError || record.lastError || null
    };
}

function getRecordById(id) {
    return findRecord(readStore(), id);
}

function getRecordBySlug(slug) {
    const clean = String(slug || '').trim().toLowerCase();
    if (!clean) return null;
    return readStore().bots.find((bot) => String(bot.slug || '').toLowerCase() === clean) || null;
}

function listBotsForAssignee(discordUserId) {
    const uid = String(discordUserId || '').trim();
    if (!uid) return [];
    return readStore().bots
        .filter((bot) => String(bot.assignedDiscordUserId || '') === uid && bot.panelEnabled === true)
        .map(sanitizePublicRecord);
}

function userCanAccessTenant(record, discordUserId, { isOwner = false } = {}) {
    if (!record) return false;
    if (isOwner) return true;
    if (record.panelEnabled !== true) return false;
    const assigned = String(record.assignedDiscordUserId || '').trim();
    return Boolean(assigned && assigned === String(discordUserId || '').trim());
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

    bootstrapAuxiliaryClient(client, record.token, {
        label: record.label,
        commandsEnabled: record.commandsEnabled !== false,
        // Panel asignable: mismos handlers de módulos que el bot principal.
        fullFeatures: record.panelEnabled === true,
        tenantBotId: record.id
    });

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
    let dirty = false;
    for (const record of store.bots) {
        if (!record.slug) {
            record.slug = uniqueSlug(store, record.label || record.id, record.id);
            dirty = true;
        }
        if (!record.brand) {
            record.brand = sanitizeBrand({ name: record.label });
            dirty = true;
        }
        if (record.clientId == null && record.applicationId) {
            record.clientId = record.applicationId;
            dirty = true;
        }
    }
    if (dirty) writeStore(store);
    return store.bots.map(sanitizePublicRecord);
}

async function createBot({
    label,
    token,
    clientId,
    clientSecret,
    assignedDiscordUserId,
    slug,
    brand,
    panelEnabled
} = {}) {
    const cleanToken = String(token || '').trim();
    const cleanLabel = String(label || '').trim() || 'Bot auxiliar';
    if (!cleanToken) throw Object.assign(new Error('Falta el token del bot'), { statusCode: 400 });

    const user = await validateBotToken(cleanToken);
    const store = readStore();
    if (store.bots.some((bot) => bot.applicationId === user.id)) {
        throw Object.assign(new Error('Ese bot ya está registrado'), { statusCode: 409 });
    }

    const cleanClientId = String(clientId || user.id || '').trim();
    if (cleanClientId && cleanClientId !== user.id) {
        throw Object.assign(
            new Error('El Client ID no coincide con la aplicación del token (debe ser el Application ID del bot)'),
            { statusCode: 400 }
        );
    }

    const now = new Date().toISOString();
    const record = {
        id: newBotId(),
        label: cleanLabel,
        slug: uniqueSlug(store, slug || cleanLabel, null),
        token: cleanToken,
        clientId: cleanClientId || user.id,
        clientSecret: String(clientSecret || '').trim(),
        assignedDiscordUserId: String(assignedDiscordUserId || '').replace(/\D/g, '').slice(0, 32),
        brand: sanitizeBrand(brand || { name: cleanLabel }),
        panelEnabled: panelEnabled === true,
        enabled: true,
        commandsEnabled: true,
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

    let needsRestart = false;

    if (patch.label != null) {
        record.label = String(patch.label).trim() || record.label;
    }

    if (patch.slug != null) {
        record.slug = uniqueSlug(store, patch.slug || record.label, record.id);
    } else if (!record.slug) {
        record.slug = uniqueSlug(store, record.label, record.id);
    }

    if (patch.clientId != null) {
        const cleanClientId = String(patch.clientId).trim();
        if (cleanClientId && record.applicationId && cleanClientId !== record.applicationId) {
            throw Object.assign(
                new Error('El Client ID debe coincidir con el Application ID del bot'),
                { statusCode: 400 }
            );
        }
        record.clientId = cleanClientId || record.applicationId || record.clientId;
    }

    if (patch.clientSecret != null) {
        const secret = String(patch.clientSecret).trim();
        if (secret) record.clientSecret = secret;
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'assignedDiscordUserId')) {
        record.assignedDiscordUserId = String(patch.assignedDiscordUserId || '').replace(/\D/g, '').slice(0, 32);
    }

    if (patch.brand != null) {
        record.brand = sanitizeBrand({ ...sanitizeBrand(record.brand), ...patch.brand });
    }

    if (patch.panelEnabled != null) {
        const next = patch.panelEnabled === true;
        if (next !== (record.panelEnabled === true)) {
            record.panelEnabled = next;
            needsRestart = true;
        }
    }

    if (patch.token != null) {
        const cleanToken = String(patch.token).trim();
        if (!cleanToken) throw Object.assign(new Error('Token vacío'), { statusCode: 400 });
        const user = await validateBotToken(cleanToken);
        record.token = cleanToken;
        record.applicationId = user.id;
        record.clientId = record.clientId || user.id;
        record.username = user.username;
        record.discriminator = user.discriminator;
        record.avatar = user.avatar;
        needsRestart = true;
    }

    if (patch.commandsEnabled != null) {
        const nextCommandsEnabled = patch.commandsEnabled === true;
        if (nextCommandsEnabled !== (record.commandsEnabled !== false)) {
            record.commandsEnabled = nextCommandsEnabled;
            needsRestart = true;
        }
    }

    if (patch.enabled != null) {
        record.enabled = patch.enabled === true;
        if (record.enabled) {
            needsRestart = true;
        } else {
            await stopBotRuntime(id);
            record.lastError = null;
            needsRestart = false;
        }
    }

    if (needsRestart && record.enabled !== false) {
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

    // El mensaje sale como el bot, sin exponer quién lo envió desde el panel.
    const sent = await channel.send(text);
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
    listBotsForAssignee,
    createBot,
    deleteBot,
    updateBot,
    updateBotProfile,
    updateBotAvatar,
    listBotGuilds,
    listBotGuildChannels,
    fetchBotChatMessages,
    sendBotChatMessage,
    getRuntimeClient,
    getRecordById,
    getRecordBySlug,
    userCanAccessTenant,
    sanitizeBrand,
    sanitizePublicRecord
};
