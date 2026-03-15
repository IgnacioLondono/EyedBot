// Cargar variables de entorno desde la raíz del proyecto
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const session = require('express-session');
const DiscordOauth2 = require('discord-oauth2');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const db = require('../src/utils/database');
const welcomeStore = require('../src/utils/welcome-config-store');
const verifyStore = require('../src/utils/verify-config-store');
const ticketStore = require('../src/utils/ticket-config-store');
const levelingStore = require('../src/utils/leveling-store');
const tempVoiceStore = require('../src/utils/temp-voice-store');
const antiRaidStore = require('../src/utils/anti-raid-config-store');
const streamAlertStore = require('../src/utils/stream-alert-store');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { ticketButtonCustomIdForGuild } = require('../src/events/ticket-interaction');
const { sanitizeDifficulty, getProgress } = require('../src/utils/leveling-math');

const app = express();
const PORT = process.env.WEB_PORT || 3000;

app.get('/health', (req, res) => {
    res.status(200).json({ ok: true, service: 'web-panel' });
});

function envValue(name, fallback = '') {
    const raw = process.env[name];
    if (raw === undefined || raw === null) return fallback;
    return String(raw).trim();
}

const CLIENT_ID = envValue('CLIENT_ID');
const CLIENT_SECRET = envValue('CLIENT_SECRET');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }
});

function timeoutAfter(ms, label = 'timeout') {
    return new Promise((_, reject) => {
        setTimeout(() => reject(new Error(label)), ms);
    });
}

async function safeDbGet(key, fallback = null, timeoutMs = 3000) {
    try {
        return await Promise.race([db.get(key), timeoutAfter(timeoutMs, `db.get timeout: ${key}`)]);
    } catch (error) {
        console.warn(`⚠️ safeDbGet fallback for ${key}:`, error.message);
        return fallback;
    }
}

async function safeDbSet(key, value, timeoutMs = 3000) {
    try {
        await Promise.race([db.set(key, value), timeoutAfter(timeoutMs, `db.set timeout: ${key}`)]);
        return true;
    } catch (error) {
        console.warn(`⚠️ safeDbSet failed for ${key}:`, error.message);
        return false;
    }
}

// Validar variables de entorno requeridas
if (!CLIENT_ID) {
    console.error('❌ ERROR: CLIENT_ID no está configurado en .env');
    console.log('💡 Agrega CLIENT_ID=tu_client_id a tu archivo .env');
}

if (!CLIENT_SECRET) {
    console.error('❌ ERROR: CLIENT_SECRET no está configurado en .env');
    console.log('💡 Agrega CLIENT_SECRET=tu_client_secret a tu archivo .env');
    console.log('💡 Obtén el CLIENT_SECRET de Discord Developer Portal > OAuth2');
}

// Configuración de OAuth2
const redirectUri = process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;
const redirectIsHttps = /^https:\/\//i.test(redirectUri);
const cookieSecure = (process.env.SESSION_COOKIE_SECURE || (redirectIsHttps ? 'true' : 'false')).toLowerCase() === 'true';

const oauth = new DiscordOauth2({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: redirectUri
});

console.log('🔐 OAuth2 configurado:');
console.log(`   Client ID: ${CLIENT_ID ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   Client Secret: ${CLIENT_SECRET ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   Redirect URI: ${redirectUri}`);
console.log(`   Session Cookie Secure: ${cookieSecure ? '✅ true' : '⚠️ false (HTTP/local)'}`);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Necesario si se usa proxy inverso para respetar cookies seguras.
app.set('trust proxy', 1);

// Configuración de sesiones
app.use(session({
    secret: process.env.SESSION_SECRET || 'tu-secret-super-seguro-cambiar-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: cookieSecure,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        sameSite: 'lax' // Ayuda con redirecciones de OAuth
    },
    name: 'tulabot.session' // Nombre personalizado para la cookie
}));

// Variable global para el cliente del bot (se inyectará desde index.js)
let botClient = null;

const templatesFilePath = path.join(__dirname, '..', 'data', 'embed-templates.json');

function ensureTemplateStore() {
    const dir = path.dirname(templatesFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(templatesFilePath)) fs.writeFileSync(templatesFilePath, JSON.stringify({ guilds: {} }, null, 2), 'utf8');
}

function readTemplateStore() {
    ensureTemplateStore();
    try {
        const raw = fs.readFileSync(templatesFilePath, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        if (!parsed || typeof parsed !== 'object') return { guilds: {} };
        if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
        return parsed;
    } catch {
        return { guilds: {} };
    }
}

function writeTemplateStore(data) {
    ensureTemplateStore();
    fs.writeFileSync(templatesFilePath, JSON.stringify(data, null, 2), 'utf8');
}

function ensureWelcomeUploadsDir() {
    const uploadsDir = path.join(__dirname, 'public', 'uploads', 'welcome');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    return uploadsDir;
}

function ensureVerifyUploadsDir() {
    const uploadsDir = path.join(__dirname, 'public', 'uploads', 'verify');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    return uploadsDir;
}

function sanitizeUploadName(name = 'welcome-image') {
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .slice(0, 60) || 'welcome-image';
}

function extFromMimeOrName(mimeType = '', originalName = '') {
    const mime = String(mimeType).toLowerCase();
    if (mime === 'image/png') return '.png';
    if (mime === 'image/webp') return '.webp';
    if (mime === 'image/gif') return '.gif';
    if (mime === 'image/jpeg' || mime === 'image/jpg') return '.jpg';

    const fromName = path.extname(String(originalName).toLowerCase());
    return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(fromName) ? (fromName === '.jpeg' ? '.jpg' : fromName) : '.jpg';
}

function extractUploadPath(rawUrl = '') {
    const raw = String(rawUrl || '').trim();
    if (!raw) return '';

    if (raw.startsWith('/uploads/')) return raw;

    try {
        const parsed = new URL(raw);
        if (String(parsed.pathname || '').startsWith('/uploads/')) return parsed.pathname;
    } catch {
        // non-URL strings
    }

    return '';
}

function resolveLocalUploadFile(rawUrl = '') {
    const uploadPath = extractUploadPath(rawUrl);
    if (!uploadPath) return null;

    const cleaned = uploadPath.replace(/^\/+/, '');
    const absolute = path.join(__dirname, 'public', cleaned);
    if (!fs.existsSync(absolute)) return null;
    return absolute;
}

// Función para inyectar el cliente del bot
function setBotClient(client) {
    botClient = client;
}

// Rutas de autenticación
app.get('/login', (req, res) => {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(`/login.html${query}`);
});

app.get('/auth/discord', (req, res) => {
    if (!CLIENT_ID) {
        return res.status(500).send(`
            <html>
                <head><title>Error de Configuración</title></head>
                <body style="font-family: Arial; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1>❌ Error de Configuración</h1>
                    <p>CLIENT_ID no está configurado en el archivo .env</p>
                    <p>Por favor, agrega <code>CLIENT_ID=tu_client_id</code> a tu archivo .env</p>
                    <p><a href="/" style="color: #FFA500;">Volver</a></p>
                </body>
            </html>
        `);
    }

    try {
        // Generar URL de autorización con estado para prevenir CSRF
        const state = Math.random().toString(36).substring(7);
        req.session.oauthState = state; // Guardar estado en sesión

        req.session.save((sessionError) => {
            if (sessionError) {
                console.error('❌ Error guardando estado OAuth en sesión:', sessionError);
                return res.redirect('/login.html?error=session_error');
            }

            const url = oauth.generateAuthUrl({
                scope: ['identify', 'guilds'],
                state: state
            });
            console.log('🔗 Redirigiendo a Discord OAuth2...');
            res.redirect(url);
        });
    } catch (error) {
        console.error('❌ Error generando URL de autorización:', error);
        res.status(500).send(`
            <html>
                <head><title>Error</title></head>
                <body style="font-family: Arial; padding: 2rem; background: #1a1a1a; color: white;">
                    <h1>❌ Error</h1>
                    <p>Error al generar URL de autorización: ${error.message}</p>
                    <p>Verifica que CLIENT_ID y CLIENT_SECRET estén correctamente configurados.</p>
                    <p><a href="/" style="color: #FFA500;">Volver</a></p>
                </body>
            </html>
        `);
    }
});

app.get('/callback', async (req, res) => {
    try {
        const { code, error, state } = req.query;
        
        // Si Discord devuelve un error
        if (error) {
            console.error('❌ Error de Discord OAuth2:', error);
            return res.redirect('/login.html?error=discord_error');
        }

        if (!code) {
            console.error('❌ No se recibió código de autorización');
            return res.redirect('/login.html?error=no_code');
        }

        // Verificar que CLIENT_SECRET esté configurado
        if (!CLIENT_SECRET) {
            console.error('❌ CLIENT_SECRET no está configurado en .env');
            return res.redirect('/login.html?error=config_error');
        }

        // Verificar estado (CSRF protection) - opcional pero recomendado
        if (state && req.session.oauthState && state !== req.session.oauthState) {
            console.error('❌ Estado OAuth no coincide - posible ataque CSRF');
            return res.redirect('/login.html?error=auth_failed');
        }

        console.log('🔐 Intercambiando código por token...');
        console.log(`   Redirect URI: ${redirectUri}`);
        console.log(`   Client ID: ${CLIENT_ID ? '✅ Configurado' : '❌ Faltante'}`);
        console.log(`   Client Secret: ${CLIENT_SECRET ? '✅ Configurado' : '❌ Faltante'}`);
        
        const tokenData = await oauth.tokenRequest({
            code,
            scope: 'identify guilds',
            grantType: 'authorization_code'
        });

        if (!tokenData || !tokenData.access_token) {
            console.error('❌ No se recibió token de acceso');
            return res.redirect('/login.html?error=auth_failed');
        }

        console.log('👤 Obteniendo información del usuario...');
        const user = await oauth.getUser(tokenData.access_token);
        const guilds = await oauth.getUserGuilds(tokenData.access_token);

        if (!user || !user.id) {
            console.error('❌ No se pudo obtener información del usuario');
            return res.redirect('/login.html?error=auth_failed');
        }

        // Guardar en sesión
        req.session.user = user;
        req.session.guilds = guilds || [];
        req.session.accessToken = tokenData.access_token;
        delete req.session.oauthState; // Limpiar estado OAuth

        // Guardar sesión antes de redirigir
        req.session.save((err) => {
            if (err) {
                console.error('❌ Error guardando sesión:', err);
                return res.redirect('/login.html?error=session_error');
            }
            console.log(`✅ Usuario autenticado: ${user.username}#${user.discriminator} (${user.id})`);
            console.log(`   Servidores: ${guilds?.length || 0}`);
            // Redirigir a la raíz en lugar de /dashboard
            res.redirect('/');
        });
    } catch (error) {
        console.error('❌ Error en callback:', error);
        console.error('   Mensaje:', error.message);
        
        // Manejar específicamente el error 401
        if (error.message && error.message.includes('401')) {
            console.error('❌ Error 401: CLIENT_SECRET incorrecto o no coincide');
            console.error('💡 Verifica:');
            console.error('   1. CLIENT_SECRET en .env coincide con Discord Developer Portal');
            console.error('   2. Redirect URI coincide exactamente: ' + redirectUri);
            console.error('   3. La aplicación OAuth2 está habilitada en Discord');
            return res.redirect('/login.html?error=invalid_secret');
        }

        res.redirect('/login.html?error=auth_failed');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// Middleware para verificar autenticación
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        console.log('⚠️ Intento de acceso sin autenticación a:', req.path);
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'No autenticado', redirect: '/login.html' });
        }
        return res.redirect('/login.html');
    }
    next();
}

// Rutas protegidas
app.get('/api/user', requireAuth, (req, res) => {
    res.json({
        user: req.session.user,
        guilds: req.session.guilds
    });
});

app.get('/api/guilds', requireAuth, async (req, res) => {
    try {
        const guilds = req.session.guilds || [];
        
        // Filtrar solo servidores donde el bot está presente
        const botGuilds = [];
        if (botClient) {
            for (const guild of guilds) {
                const botGuild = botClient.guilds.cache.get(guild.id);
                if (botGuild) {
                    botGuilds.push({
                        id: guild.id,
                        name: guild.name,
                        icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
                        permissions: guild.permissions,
                        botGuild: {
                            memberCount: botGuild.memberCount,
                            channels: botGuild.channels.cache.filter(c => c.type === 0 || c.type === 2).map(c => ({
                                id: c.id,
                                name: c.name,
                                type: c.type
                            }))
                        }
                    });
                }
            }
        }
        
        res.json(botGuilds);
    } catch (error) {
        console.error('Error obteniendo servidores:', error);
        res.status(500).json({ error: 'Error al obtener servidores' });
    }
});

app.get('/api/guild/:guildId/channels', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        // Verificar que el usuario tenga permisos en el servidor
        const userGuild = req.session.guilds?.find(g => g.id === guildId);
        if (!userGuild) {
            return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        }

        const channels = guild.channels.cache
            .filter(channel => channel.type === 0 || channel.type === 2 || channel.type === 4) // Texto, voz y categorías
            .map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                typeName: channel.type === 0 ? 'texto' : (channel.type === 2 ? 'voz' : 'categoria')
            }));

        res.json(channels);
    } catch (error) {
        console.error('Error obteniendo canales:', error);
        res.status(500).json({ error: 'Error al obtener canales' });
    }
});

function applyWelcomeTemplate(text, member) {
    return String(text || '')
        .replace(/\{user\}/gi, `<@${member.id}>`)
        .replace(/\{username\}/gi, member.user.username)
        .replace(/\{server\}/gi, member.guild.name)
        .replace(/\{memberCount\}/gi, String(member.guild.memberCount));
}

function buildDefaultGreetingConfig(mode, fallbackChannel = '') {
    if (mode === 'goodbye') {
        return {
            enabled: Boolean(fallbackChannel),
            channelId: fallbackChannel || '',
            mentionUser: false,
            title: 'Hasta pronto',
            message: '{username} ha salido de **{server}**. Ahora somos {memberCount} miembros.',
            color: 'ff5f9e',
            footer: 'EyedBot Goodbye System',
            imageUrl: '',
            thumbnailMode: 'avatar',
            thumbnailUrl: '',
            dmEnabled: false,
            dmMessage: ''
        };
    }

    return {
        enabled: Boolean(fallbackChannel),
        channelId: fallbackChannel || '',
        mentionUser: true,
        title: '¡Bienvenido!',
        message: '¡Hola {user}! Bienvenido a **{server}**. Eres el miembro #{memberCount}.',
        color: '7c4dff',
        footer: 'EyedBot Welcome System',
        imageUrl: '',
        thumbnailMode: 'avatar',
        thumbnailUrl: '',
        dmEnabled: false,
        dmMessage: 'Bienvenido a {server}, {username}.'
    };
}

function normalizeGreetingConfigInput(body = {}, mode, userId) {
    const fallback = mode === 'goodbye'
        ? { title: 'Hasta pronto', message: '{username} ha salido de **{server}**.' }
        : { title: '¡Bienvenido!', message: '¡Hola {user}! Bienvenido a **{server}**.' };

    return {
        enabled: body.enabled !== false,
        channelId: String(body.channelId || ''),
        mentionUser: body.mentionUser !== false,
        title: String(body.title || fallback.title).slice(0, 256),
        message: String(body.message || fallback.message).slice(0, 2000),
        color: String(body.color || (mode === 'goodbye' ? 'ff5f9e' : '7c4dff')).replace('#', '').slice(0, 6),
        footer: String(body.footer || '').slice(0, 300),
        imageUrl: String(body.imageUrl || '').slice(0, 1000),
        thumbnailMode: ['none', 'avatar', 'url'].includes(String(body.thumbnailMode || 'avatar')) ? String(body.thumbnailMode) : 'avatar',
        thumbnailUrl: String(body.thumbnailUrl || '').slice(0, 1000),
        dmEnabled: body.dmEnabled === true,
        dmMessage: String(body.dmMessage || '').slice(0, 1000),
        updatedAt: new Date().toISOString(),
        updatedBy: userId || 'unknown'
    };
}

function normalizeVerifyEmojiInput(rawEmoji = '✅') {
    const raw = String(rawEmoji || '✅').trim();
    const custom = raw.match(/^<a?:\w+:(\d+)>$/);
    if (custom?.[1]) {
        return { reactValue: custom[1], stored: custom[1], display: raw };
    }
    return { reactValue: raw, stored: raw, display: raw };
}

app.get('/api/guild/:guildId/verify-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const cfg = await verifyStore.getVerifyConfig(guildId);
        if (!cfg) {
            return res.json({
                enabled: false,
                channelId: '',
                roleId: '',
                emoji: '✅',
                title: 'Verify',
                message: '¡Reacciona a este mensaje para ver los demás canales!',
                color: '7c4dff',
                footer: '',
                imageUrl: '',
                removeRoleOnUnreact: false,
                messageId: ''
            });
        }

        return res.json(cfg);
    } catch (error) {
        console.error('Error obteniendo verify config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de verificación' });
    }
});

app.post('/api/guild/:guildId/verify-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const body = req.body || {};
        const config = {
            enabled: body.enabled === true,
            channelId: String(body.channelId || '').trim(),
            roleId: String(body.roleId || '').trim(),
            emoji: String(body.emoji || '✅').trim().slice(0, 80),
            title: String(body.title || 'Verify').slice(0, 256),
            message: String(body.message || '¡Reacciona a este mensaje para ver los demás canales!').slice(0, 2000),
            color: String(body.color || '7c4dff').replace('#', '').slice(0, 6),
            footer: String(body.footer || '').slice(0, 300),
            imageUrl: String(body.imageUrl || '').slice(0, 1000),
            removeRoleOnUnreact: body.removeRoleOnUnreact === true,
            messageId: String(body.messageId || '').trim(),
            updatedAt: new Date().toISOString(),
            updatedBy: req.session.user?.id || 'unknown'
        };

        await verifyStore.setVerifyConfig(guildId, config);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando verify config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de verificación' });
    }
});

app.post('/api/guild/:guildId/verify-publish', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const cfg = await verifyStore.getVerifyConfig(guildId);
        if (!cfg?.channelId || !cfg?.roleId) {
            return res.status(400).json({ error: 'Configura canal y rol antes de publicar' });
        }

        const channel = guild.channels.cache.get(cfg.channelId) || await guild.channels.fetch(cfg.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return res.status(404).json({ error: 'Canal de verificación no encontrado o no es de texto' });
        }

        const role = guild.roles.cache.get(cfg.roleId) || await guild.roles.fetch(cfg.roleId).catch(() => null);
        if (!role) return res.status(404).json({ error: 'Rol de verificación no encontrado' });

        const me = guild.members.me || await guild.members.fetch(botClient.user.id).catch(() => null);
        if (!me) return res.status(500).json({ error: 'No pude obtener los permisos del bot en el servidor' });

        if (!channel.permissionsFor(me)?.has(['SendMessages', 'EmbedLinks', 'AddReactions'])) {
            return res.status(403).json({ error: 'Faltan permisos: Enviar mensajes, Insertar enlaces o Añadir reacciones' });
        }

        if (!me.permissions.has('ManageRoles') || me.roles.highest.position <= role.position) {
            return res.status(403).json({ error: 'El bot no puede administrar ese rol (revisa jerarquía y permiso Gestionar roles)' });
        }

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor((cfg.color || '7c4dff').replace('#', ''))
            .setTitle(cfg.title || 'Verify')
            .setDescription(cfg.message || '¡Reacciona para verificarte!');

        if (cfg.footer) embed.setFooter({ text: cfg.footer });
        const files = [];
        if (cfg.imageUrl) {
            const localImagePath = resolveLocalUploadFile(cfg.imageUrl);
            if (localImagePath) {
                const attachmentName = path.basename(localImagePath);
                embed.setImage(`attachment://${attachmentName}`);
                files.push({ attachment: localImagePath, name: attachmentName });
            } else {
                embed.setImage(cfg.imageUrl);
            }
        }

        const posted = await channel.send({ embeds: [embed], files });

        const emojiData = normalizeVerifyEmojiInput(cfg.emoji || '✅');
        await posted.react(emojiData.reactValue).catch(() => null);

        const updatedCfg = {
            ...cfg,
            enabled: true,
            emoji: emojiData.stored,
            emojiDisplay: emojiData.display,
            messageId: posted.id,
            channelId: channel.id,
            updatedAt: new Date().toISOString(),
            updatedBy: req.session.user?.id || 'unknown'
        };

        await verifyStore.setVerifyConfig(guildId, updatedCfg);

        res.json({ success: true, config: updatedCfg, messageId: posted.id, channelId: channel.id });
    } catch (error) {
        console.error('Error publicando verify embed:', error);
        res.status(500).json({ error: 'Error al publicar el embed de verificación' });
    }
});

app.get('/api/guild/:guildId/ticket-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const cfg = await ticketStore.getTicketConfig(guildId);
        if (!cfg) {
            return res.json({
                enabled: false,
                panelChannelId: '',
                adminRoleIds: [],
                title: 'Soporte',
                message: 'Presiona el boton para abrir un ticket y explica el motivo de tu solicitud.',
                color: '7c4dff',
                footer: 'Sistema de Tickets',
                buttonLabel: 'Solicitar ticket',
                messageId: ''
            });
        }

        res.json(cfg);
    } catch (error) {
        console.error('Error obteniendo ticket config:', error);
        res.status(500).json({ error: 'Error al obtener configuracion de tickets' });
    }
});

app.post('/api/guild/:guildId/ticket-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const body = req.body || {};
        const adminRoleIds = Array.isArray(body.adminRoleIds)
            ? body.adminRoleIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 20)
            : [];

        const config = {
            enabled: body.enabled === true,
            panelChannelId: String(body.panelChannelId || '').trim(),
            adminRoleIds,
            title: String(body.title || 'Soporte').slice(0, 256),
            message: String(body.message || 'Presiona el boton para abrir un ticket y explica el motivo de tu solicitud.').slice(0, 2000),
            color: String(body.color || '7c4dff').replace('#', '').slice(0, 6),
            footer: String(body.footer || '').slice(0, 300),
            buttonLabel: String(body.buttonLabel || 'Solicitar ticket').slice(0, 80),
            messageId: String(body.messageId || '').trim(),
            updatedAt: new Date().toISOString(),
            updatedBy: req.session.user?.id || 'unknown'
        };

        await ticketStore.setTicketConfig(guildId, config);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando ticket config:', error);
        res.status(500).json({ error: 'Error al guardar configuracion de tickets' });
    }
});

app.post('/api/guild/:guildId/ticket-publish', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const cfg = await ticketStore.getTicketConfig(guildId);
        if (!cfg?.panelChannelId) {
            return res.status(400).json({ error: 'Configura el canal de tickets antes de publicar' });
        }

        const channel = guild.channels.cache.get(cfg.panelChannelId) || await guild.channels.fetch(cfg.panelChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return res.status(404).json({ error: 'Canal de panel no encontrado o no es de texto' });
        }

        const me = guild.members.me || await guild.members.fetch(botClient.user.id).catch(() => null);
        if (!me) return res.status(500).json({ error: 'No pude obtener los permisos del bot en el servidor' });

        if (!channel.permissionsFor(me)?.has(['SendMessages', 'EmbedLinks'])) {
            return res.status(403).json({ error: 'Faltan permisos: Enviar mensajes o Insertar enlaces' });
        }

        const embed = new EmbedBuilder()
            .setColor((cfg.color || '7c4dff').replace('#', ''))
            .setTitle(cfg.title || 'Soporte')
            .setDescription(cfg.message || 'Presiona el boton para abrir un ticket y explica el motivo de tu solicitud.');

        if (cfg.footer) embed.setFooter({ text: cfg.footer });

        const openTicketBtn = new ButtonBuilder()
            .setCustomId(ticketButtonCustomIdForGuild(guildId))
            .setStyle(ButtonStyle.Primary)
            .setLabel(cfg.buttonLabel || 'Solicitar ticket');

        const posted = await channel.send({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(openTicketBtn)]
        });

        const updatedCfg = {
            ...cfg,
            enabled: true,
            panelChannelId: channel.id,
            messageId: posted.id,
            updatedAt: new Date().toISOString(),
            updatedBy: req.session.user?.id || 'unknown'
        };

        await ticketStore.setTicketConfig(guildId, updatedCfg);
        res.json({ success: true, config: updatedCfg, messageId: posted.id, channelId: channel.id });
    } catch (error) {
        console.error('Error publicando ticket panel:', error);
        res.status(500).json({ error: 'Error al publicar panel de tickets' });
    }
});

function normalizeLevelingConfigInput(body = {}, current = null, userId = 'unknown') {
    const base = current && typeof current === 'object' ? current : levelingStore.defaultConfig();

    const messageXpMin = Math.max(1, Math.min(300, Number.parseInt(body.messageXpMin ?? base.messageXpMin ?? 10, 10) || 10));
    const messageXpMax = Math.max(messageXpMin, Math.min(500, Number.parseInt(body.messageXpMax ?? base.messageXpMax ?? 16, 10) || 16));

    const roleRewards = Array.isArray(body.roleRewards)
        ? body.roleRewards
            .map((item) => ({
                level: Math.max(1, Number.parseInt(item?.level, 10) || 1),
                roleId: String(item?.roleId || '').trim()
            }))
            .filter((item) => item.roleId)
            .sort((a, b) => a.level - b.level)
            .slice(0, 50)
        : (Array.isArray(base.roleRewards) ? base.roleRewards : []);

    return {
        enabled: body.enabled === true,
        messageXpEnabled: body.messageXpEnabled !== false,
        voiceXpEnabled: body.voiceXpEnabled !== false,
        messageCooldownMs: Math.max(10000, Math.min(300000, Number.parseInt(body.messageCooldownMs ?? base.messageCooldownMs ?? 45000, 10) || 45000)),
        messageXpMin,
        messageXpMax,
        voiceXpPerMinute: Math.max(1, Math.min(100, Number.parseInt(body.voiceXpPerMinute ?? base.voiceXpPerMinute ?? 6, 10) || 6)),
        voiceRequirePeers: body.voiceRequirePeers !== false,
        difficulty: sanitizeDifficulty(body.difficulty || base.difficulty || {}),
        roleRewards,
        updatedAt: new Date().toISOString(),
        updatedBy: userId
    };
}

function normalizeTempVoiceConfigInput(body = {}, current = null, userId = 'unknown') {
    const base = current && typeof current === 'object' ? current : tempVoiceStore.defaultConfig();

    const template = String(body.channelNameTemplate ?? base.channelNameTemplate ?? 'Canal de {username}')
        .replace(/[\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 95);

    return {
        enabled: body.enabled === true,
        creatorChannelId: String(body.creatorChannelId ?? base.creatorChannelId ?? '').trim(),
        categoryId: String(body.categoryId ?? base.categoryId ?? '').trim(),
        channelNameTemplate: template || 'Canal de {username}',
        allowCustomNames: body.allowCustomNames !== false,
        userLimit: Math.max(0, Math.min(99, Number.parseInt(body.userLimit ?? base.userLimit ?? 0, 10) || 0)),
        updatedAt: new Date().toISOString(),
        updatedBy: userId
    };
}

function normalizeAntiRaidConfigInput(body = {}, current = null, userId = 'unknown') {
    const base = current && typeof current === 'object' ? current : antiRaidStore.defaultConfig();
    const trustedRoleIds = Array.isArray(body.trustedRoleIds)
        ? body.trustedRoleIds.map((id) => String(id || '').trim()).filter(Boolean).slice(0, 50)
        : (Array.isArray(base.trustedRoleIds) ? base.trustedRoleIds : []);

    return {
        enabled: body.enabled !== false,
        antiSpamEnabled: body.antiSpamEnabled !== false,
        spamMessages: Math.max(3, Math.min(40, Number.parseInt(body.spamMessages ?? base.spamMessages ?? 7, 10) || 7)),
        spamWindowSec: Math.max(3, Math.min(120, Number.parseInt(body.spamWindowSec ?? base.spamWindowSec ?? 8, 10) || 8)),
        blockInvites: body.blockInvites !== false,
        blockLinks: body.blockLinks === true,
        maxMentions: Math.max(1, Math.min(50, Number.parseInt(body.maxMentions ?? base.maxMentions ?? 6, 10) || 6)),
        maxRoleMentions: Math.max(1, Math.min(25, Number.parseInt(body.maxRoleMentions ?? base.maxRoleMentions ?? 3, 10) || 3)),
        joinRateThreshold: Math.max(2, Math.min(60, Number.parseInt(body.joinRateThreshold ?? base.joinRateThreshold ?? 8, 10) || 8)),
        raidJoinHardThreshold: Math.max(4, Math.min(120, Number.parseInt(body.raidJoinHardThreshold ?? base.raidJoinHardThreshold ?? 15, 10) || 15)),
        accountAgeDays: Math.max(0, Math.min(365, Number.parseInt(body.accountAgeDays ?? base.accountAgeDays ?? 3, 10) || 3)),
        actionMode: ['timeout', 'kick', 'ban'].includes(String(body.actionMode || base.actionMode || 'timeout'))
            ? String(body.actionMode || base.actionMode || 'timeout')
            : 'timeout',
        timeoutMinutes: Math.max(1, Math.min(40320, Number.parseInt(body.timeoutMinutes ?? base.timeoutMinutes ?? 30, 10) || 30)),
        actionCooldownSec: Math.max(5, Math.min(600, Number.parseInt(body.actionCooldownSec ?? base.actionCooldownSec ?? 30, 10) || 30)),
        duplicateMessageThreshold: Math.max(2, Math.min(12, Number.parseInt(body.duplicateMessageThreshold ?? base.duplicateMessageThreshold ?? 3, 10) || 3)),
        duplicateWindowSec: Math.max(3, Math.min(120, Number.parseInt(body.duplicateWindowSec ?? base.duplicateWindowSec ?? 20, 10) || 20)),
        protectChannels: body.protectChannels !== false,
        protectRoles: body.protectRoles !== false,
        destructiveActionThreshold: Math.max(1, Math.min(30, Number.parseInt(body.destructiveActionThreshold ?? base.destructiveActionThreshold ?? 3, 10) || 3)),
        actionWindowSec: Math.max(10, Math.min(300, Number.parseInt(body.actionWindowSec ?? base.actionWindowSec ?? 60, 10) || 60)),
        trustedRoleIds,
        alertChannelId: String(body.alertChannelId ?? base.alertChannelId ?? '').trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: userId
    };
}

function normalizeStreamAlertConfigInput(body = {}, current = null, userId = 'unknown') {
    const base = current && typeof current === 'object' ? current : streamAlertStore.defaultConfig();
    const rawSources = Array.isArray(body.sources)
        ? body.sources
        : (Array.isArray(base.sources) ? base.sources : []);

    const sources = rawSources
        .map((source, index) => {
            const fallbackId = String(source?.id || `src_${Date.now()}_${index}`);
            const platform = String(source?.platform || 'custom').toLowerCase();
            return {
                id: fallbackId.slice(0, 60),
                enabled: source?.enabled !== false,
                platform: ['twitch', 'youtube', 'tiktok', 'custom'].includes(platform) ? platform : 'custom',
                name: String(source?.name || 'Fuente').slice(0, 80),
                url: String(source?.url || '').trim().slice(0, 600),
                feedUrl: String(source?.feedUrl || '').trim().slice(0, 800),
                imageUrl: String(source?.imageUrl || '').trim().slice(0, 800),
                lastItemId: String(source?.lastItemId || '').slice(0, 500),
                lastPostedAt: String(source?.lastPostedAt || '')
            };
        })
        .filter((source) => Boolean(source.id))
        .slice(0, 20);

    return {
        enabled: body.enabled === true,
        channelId: String(body.channelId ?? base.channelId ?? '').trim(),
        mentionText: String(body.mentionText ?? base.mentionText ?? '').slice(0, 300),
        titleTemplate: String(body.titleTemplate ?? base.titleTemplate ?? '🔴 {platform}: {name} en directo').slice(0, 200),
        descriptionTemplate: String(body.descriptionTemplate ?? base.descriptionTemplate ?? '{title}\n{url}').slice(0, 1500),
        color: String(body.color ?? base.color ?? '7c4dff').replace('#', '').slice(0, 6) || '7c4dff',
        footerText: String(body.footerText ?? base.footerText ?? 'EyedBot Stream Alerts').slice(0, 200),
        sources,
        updatedAt: new Date().toISOString(),
        updatedBy: userId
    };
}

app.get('/api/guild/:guildId/anti-raid-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await antiRaidStore.getAntiRaidConfig(guildId);
        res.json(config || antiRaidStore.defaultConfig());
    } catch (error) {
        console.error('Error obteniendo anti-raid config:', error);
        res.status(500).json({ error: 'Error al obtener configuración anti-raid' });
    }
});

app.post('/api/guild/:guildId/anti-raid-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const current = await antiRaidStore.getAntiRaidConfig(guildId);
        const config = normalizeAntiRaidConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');
        await antiRaidStore.setAntiRaidConfig(guildId, config);

        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando anti-raid config:', error);
        res.status(500).json({ error: 'Error al guardar configuración anti-raid' });
    }
});

app.get('/api/guild/:guildId/temp-voice-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await tempVoiceStore.getTempVoiceConfig(guildId);
        res.json(config || tempVoiceStore.defaultConfig());
    } catch (error) {
        console.error('Error obteniendo temp voice config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de voz temporal' });
    }
});

app.post('/api/guild/:guildId/temp-voice-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const current = await tempVoiceStore.getTempVoiceConfig(guildId);
        const config = normalizeTempVoiceConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');

        if (!config.creatorChannelId) {
            return res.status(400).json({ error: 'Debes seleccionar un canal creador de voz' });
        }

        await tempVoiceStore.setTempVoiceConfig(guildId, config);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando temp voice config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de voz temporal' });
    }
});

app.get('/api/guild/:guildId/stream-alert-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await streamAlertStore.getStreamAlertConfig(guildId);
        res.json(config || streamAlertStore.defaultConfig());
    } catch (error) {
        console.error('Error obteniendo stream alert config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de stream alerts' });
    }
});

app.post('/api/guild/:guildId/stream-alert-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const current = await streamAlertStore.getStreamAlertConfig(guildId);
        const config = normalizeStreamAlertConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');

        if (config.enabled && !config.channelId) {
            return res.status(400).json({ error: 'Debes seleccionar un canal de notificaciones' });
        }

        await streamAlertStore.setStreamAlertConfig(guildId, config);
        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando stream alert config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de stream alerts' });
    }
});

app.post('/api/guild/:guildId/stream-alert-test', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const current = await streamAlertStore.getStreamAlertConfig(guildId);
        const config = normalizeStreamAlertConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');

        const channel = guild.channels.cache.get(config.channelId)
            || await guild.channels.fetch(config.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            return res.status(400).json({ error: 'Canal de notificaciones no válido' });
        }

        const firstSource = Array.isArray(config.sources) && config.sources.length > 0
            ? config.sources[0]
            : {
                platform: 'custom',
                name: 'Fuente de prueba',
                url: 'https://example.com/stream',
                imageUrl: ''
            };

        const values = {
            platform: String(firstSource.platform || 'custom').toUpperCase(),
            name: firstSource.name || 'Fuente',
            title: 'Stream de prueba en vivo',
            url: firstSource.url || 'https://example.com/stream',
            description: 'Este es un mensaje de prueba desde el panel web.'
        };

        const template = (text) => String(text || '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
        const templateTitle = template(config.titleTemplate || '🔴 {platform}: {name} en directo').trim();
        const finalTitle = String(values.title || templateTitle || 'Directo detectado').slice(0, 256);

        const embed = new EmbedBuilder()
            .setColor(`#${String(config.color || '7c4dff').replace('#', '')}`)
            .setTitle(finalTitle)
            .setDescription(template(config.descriptionTemplate || '{title}\n{url}').slice(0, 4000))
            .setURL(values.url)
            .setTimestamp(new Date());

        const imageUrl = String(firstSource.imageUrl || '').trim();
        if (imageUrl) embed.setImage(imageUrl);

        const footerText = String(config.footerText || '').trim();
        if (footerText) embed.setFooter({ text: footerText.slice(0, 200) });

        await channel.send({
            content: String(config.mentionText || '').trim() || undefined,
            embeds: [embed]
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error enviando stream alert test:', error);
        res.status(500).json({ error: 'Error al enviar prueba de stream alert' });
    }
});

app.get('/api/guild/:guildId/leveling-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await levelingStore.getLevelingConfig(guildId);
        res.json(config || levelingStore.defaultConfig());
    } catch (error) {
        console.error('Error obteniendo leveling config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de niveles' });
    }
});

app.post('/api/guild/:guildId/leveling-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const current = await levelingStore.getLevelingConfig(guildId);
        const config = normalizeLevelingConfigInput(req.body || {}, current, req.session.user?.id || 'unknown');
        await levelingStore.setLevelingConfig(guildId, config);

        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando leveling config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de niveles' });
    }
});

app.get('/api/guild/:guildId/leveling-leaderboard', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const config = await levelingStore.getLevelingConfig(guildId);
        const users = await levelingStore.listGuildUsers(guildId);

        const top = users
            .sort((a, b) => (b.xp || 0) - (a.xp || 0))
            .slice(0, 25)
            .map((entry) => {
                const member = guild.members.cache.get(entry.userId);
                const user = member?.user || botClient.users.cache.get(entry.userId) || null;
                const progress = getProgress(entry.xp || 0, config?.difficulty || {});
                return {
                    userId: entry.userId,
                    username: user?.username || 'Usuario',
                    tag: user?.tag || `ID ${entry.userId}`,
                    avatar: user?.displayAvatarURL?.({ dynamic: true, size: 128 }) || null,
                    xp: entry.xp || 0,
                    level: progress.level,
                    messageCount: entry.messageCount || 0,
                    voiceMinutes: entry.voiceMinutes || 0,
                    progressPercent: progress.percent
                };
            });

        res.json({
            enabled: config?.enabled === true,
            totalTrackedUsers: users.length,
            leaderboard: top
        });
    } catch (error) {
        console.error('Error obteniendo leaderboard de niveles:', error);
        res.status(500).json({ error: 'Error al obtener leaderboard de niveles' });
    }
});

app.get('/api/guild/:guildId/welcome-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await welcomeStore.getWelcomeConfig(guildId);
        const fallbackChannel = await welcomeStore.getWelcomeChannelId(guildId);

        if (!config) return res.json(buildDefaultGreetingConfig('welcome', fallbackChannel));

        if (!config.channelId && fallbackChannel) config.channelId = fallbackChannel;
        res.json(config);
    } catch (error) {
        console.error('Error obteniendo welcome config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de bienvenida' });
    }
});

app.post('/api/guild/:guildId/verify-image', requireAuth, upload.single('imageFile'), async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const file = req.file;
        if (!file?.buffer) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
        if (!String(file.mimetype || '').startsWith('image/')) {
            return res.status(400).json({ error: 'El archivo debe ser una imagen' });
        }

        const uploadsDir = ensureVerifyUploadsDir();
        const baseName = sanitizeUploadName(path.parse(file.originalname || '').name || `verify-${guildId}`);
        const extension = extFromMimeOrName(file.mimetype, file.originalname);
        const fileName = `${guildId}_${Date.now()}_${baseName}${extension}`;
        const outputPath = path.join(uploadsDir, fileName);

        fs.writeFileSync(outputPath, file.buffer);

        const publicPath = `/uploads/verify/${fileName}`;
        const publicUrl = `${req.protocol}://${req.get('host')}${publicPath}`;
        res.json({ success: true, url: publicUrl, path: publicPath });
    } catch (error) {
        console.error('Error subiendo imagen de verify:', error);
        res.status(500).json({ error: 'Error al subir imagen de verify' });
    }
});

app.post('/api/guild/:guildId/welcome-image', requireAuth, upload.single('imageFile'), async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const file = req.file;
        if (!file?.buffer) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
        if (!String(file.mimetype || '').startsWith('image/')) {
            return res.status(400).json({ error: 'El archivo debe ser una imagen' });
        }

        const uploadsDir = ensureWelcomeUploadsDir();
        const baseName = sanitizeUploadName(path.parse(file.originalname || '').name || `welcome-${guildId}`);
        const extension = extFromMimeOrName(file.mimetype, file.originalname);
        const fileName = `${guildId}_${Date.now()}_${baseName}${extension}`;
        const outputPath = path.join(uploadsDir, fileName);

        fs.writeFileSync(outputPath, file.buffer);

        const publicPath = `/uploads/welcome/${fileName}`;
        const publicUrl = `${req.protocol}://${req.get('host')}${publicPath}`;
        res.json({ success: true, url: publicUrl, path: publicPath });
    } catch (error) {
        console.error('Error subiendo imagen de bienvenida:', error);
        res.status(500).json({ error: 'Error al subir imagen de bienvenida' });
    }
});

app.post('/api/guild/:guildId/welcome-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const body = req.body || {};
        if (!body.channelId) return res.status(400).json({ error: 'Debes seleccionar un canal de bienvenida' });

        const config = normalizeGreetingConfigInput(body, 'welcome', req.session.user?.id);

        await welcomeStore.setWelcomeConfig(guildId, config);
        await welcomeStore.setWelcomeChannelId(guildId, config.channelId);

        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando welcome config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de bienvenida' });
    }
});

app.post('/api/guild/:guildId/welcome-test', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const cfg = await welcomeStore.getWelcomeConfig(guildId);
        const channelId = cfg?.channelId || await welcomeStore.getWelcomeChannelId(guildId);
        const channel = channelId ? guild.channels.cache.get(channelId) : null;
        if (!channel) return res.status(404).json({ error: 'Canal de bienvenida no encontrado' });

        const member = guild.members.cache.get(req.session.user?.id) || await guild.members.fetch(req.session.user?.id).catch(() => null);
        if (!member) return res.status(404).json({ error: 'No pude obtener tu usuario en este servidor' });

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor(cfg?.color || '7c4dff')
            .setTitle(applyWelcomeTemplate(cfg?.title || '¡Bienvenido!', member))
            .setDescription(applyWelcomeTemplate(cfg?.message || '¡Hola {user}!', member));

        if (cfg?.footer) embed.setFooter({ text: applyWelcomeTemplate(cfg.footer, member) });
        const files = [];
        if (cfg?.imageUrl) {
            const localImagePath = resolveLocalUploadFile(cfg.imageUrl);
            if (localImagePath) {
                const attachmentName = path.basename(localImagePath);
                embed.setImage(`attachment://${attachmentName}`);
                files.push({ attachment: localImagePath, name: attachmentName });
            } else {
                embed.setImage(cfg.imageUrl);
            }
        }
        if (cfg?.thumbnailMode === 'avatar') embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
        if (cfg?.thumbnailMode === 'url' && cfg?.thumbnailUrl) embed.setThumbnail(cfg.thumbnailUrl);

        const content = cfg?.mentionUser ? `<@${member.id}>` : null;
        await channel.send({ content, embeds: [embed], files });

        res.json({ success: true, message: 'Prueba de bienvenida enviada' });
    } catch (error) {
        console.error('Error enviando welcome test:', error);
        res.status(500).json({ error: 'Error al enviar prueba de bienvenida' });
    }
});

app.get('/api/guild/:guildId/goodbye-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const config = await welcomeStore.getGoodbyeConfig(guildId);
        const fallbackChannel = await welcomeStore.getGoodbyeChannelId(guildId);

        if (!config) return res.json(buildDefaultGreetingConfig('goodbye', fallbackChannel));

        if (!config.channelId && fallbackChannel) config.channelId = fallbackChannel;
        res.json(config);
    } catch (error) {
        console.error('Error obteniendo goodbye config:', error);
        res.status(500).json({ error: 'Error al obtener configuración de despedida' });
    }
});

app.post('/api/guild/:guildId/goodbye-config', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const body = req.body || {};
        if (!body.channelId) return res.status(400).json({ error: 'Debes seleccionar un canal de despedida' });

        const config = normalizeGreetingConfigInput(body, 'goodbye', req.session.user?.id);

        await welcomeStore.setGoodbyeConfig(guildId, config);
        await welcomeStore.setGoodbyeChannelId(guildId, config.channelId);

        res.json({ success: true, config });
    } catch (error) {
        console.error('Error guardando goodbye config:', error);
        res.status(500).json({ error: 'Error al guardar configuración de despedida' });
    }
});

app.post('/api/guild/:guildId/goodbye-test', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        if (!botClient) return res.status(500).json({ error: 'Bot no disponible' });

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });

        const cfg = await welcomeStore.getGoodbyeConfig(guildId);
        const channelId = cfg?.channelId || await welcomeStore.getGoodbyeChannelId(guildId);
        const channel = channelId ? guild.channels.cache.get(channelId) : null;
        if (!channel) return res.status(404).json({ error: 'Canal de despedida no encontrado' });

        const member = guild.members.cache.get(req.session.user?.id) || await guild.members.fetch(req.session.user?.id).catch(() => null);
        if (!member) return res.status(404).json({ error: 'No pude obtener tu usuario en este servidor' });

        const { EmbedBuilder } = require('discord.js');
        const embed = new EmbedBuilder()
            .setColor(cfg?.color || 'ff5f9e')
            .setTitle(applyWelcomeTemplate(cfg?.title || 'Hasta pronto', member))
            .setDescription(applyWelcomeTemplate(cfg?.message || '{username} ha salido de {server}.', member));

        if (cfg?.footer) embed.setFooter({ text: applyWelcomeTemplate(cfg.footer, member) });
        const files = [];
        if (cfg?.imageUrl) {
            const localImagePath = resolveLocalUploadFile(cfg.imageUrl);
            if (localImagePath) {
                const attachmentName = path.basename(localImagePath);
                embed.setImage(`attachment://${attachmentName}`);
                files.push({ attachment: localImagePath, name: attachmentName });
            } else {
                embed.setImage(cfg.imageUrl);
            }
        }
        if (cfg?.thumbnailMode === 'avatar') embed.setThumbnail(member.user.displayAvatarURL({ dynamic: true }));
        if (cfg?.thumbnailMode === 'url' && cfg?.thumbnailUrl) embed.setThumbnail(cfg.thumbnailUrl);

        const content = cfg?.mentionUser ? `<@${member.id}>` : null;
        await channel.send({ content, embeds: [embed], files });

        res.json({ success: true, message: 'Prueba de despedida enviada' });
    } catch (error) {
        console.error('Error enviando goodbye test:', error);
        res.status(500).json({ error: 'Error al enviar prueba de despedida' });
    }
});

// Ruta para enviar embeds
app.post('/api/send-embed', requireAuth, upload.fields([{ name: 'imageFile', maxCount: 1 }, { name: 'thumbnailFile', maxCount: 1 }]), async (req, res) => {
    try {
        const { guildId, channelId } = req.body;
        const embedRaw = req.body?.embed;
        const embed = typeof embedRaw === 'string' ? JSON.parse(embedRaw) : embedRaw;

        if (!embed || typeof embed !== 'object') {
            return res.status(400).json({ error: 'Payload de embed inválido' });
        }

        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel) {
            return res.status(404).json({ error: 'Canal no encontrado' });
        }

        // Verificar permisos
        const hasFiles = (req.files?.imageFile?.length || 0) > 0 || (req.files?.thumbnailFile?.length || 0) > 0;
        const requiredPerms = hasFiles ? ['SendMessages', 'EmbedLinks', 'AttachFiles'] : ['SendMessages', 'EmbedLinks'];
        if (!channel.permissionsFor(guild.members.me)?.has(requiredPerms)) {
            return res.status(403).json({ error: 'El bot no tiene permisos en este canal' });
        }

        // Crear embed usando discord.js
        const { EmbedBuilder } = require('discord.js');
        const discordEmbed = new EmbedBuilder();

        if (embed.title) discordEmbed.setTitle(embed.title);
        if (embed.description) discordEmbed.setDescription(embed.description);
        if (embed.color) discordEmbed.setColor(embed.color);
        if (embed.footer) discordEmbed.setFooter({ text: embed.footer });
        if (embed.image) discordEmbed.setImage(embed.image);
        if (embed.thumbnail) discordEmbed.setThumbnail(embed.thumbnail);
        if (embed.timestamp) discordEmbed.setTimestamp();
        if (embed.author) {
            discordEmbed.setAuthor({
                name: embed.author.name || '',
                iconURL: embed.author.iconURL,
                url: embed.author.url
            });
        }
        if (embed.fields && Array.isArray(embed.fields)) {
            embed.fields.forEach(field => {
                if (field.name && field.value) {
                    discordEmbed.addFields({
                        name: field.name,
                        value: field.value,
                        inline: field.inline || false
                    });
                }
            });
        }

        const files = [];
        const imageUpload = req.files?.imageFile?.[0];
        const thumbnailUpload = req.files?.thumbnailFile?.[0];

        if (imageUpload?.buffer) {
            const imageName = imageUpload.originalname || `embed_image_${Date.now()}.jpg`;
            files.push({ attachment: imageUpload.buffer, name: imageName });
            if (!embed.image) discordEmbed.setImage(`attachment://${imageName}`);
        }

        if (thumbnailUpload?.buffer) {
            const thumbName = thumbnailUpload.originalname || `embed_thumb_${Date.now()}.jpg`;
            files.push({ attachment: thumbnailUpload.buffer, name: thumbName });
            if (!embed.thumbnail) discordEmbed.setThumbnail(`attachment://${thumbName}`);
        }

        await channel.send({ embeds: [discordEmbed], files });

        // Guardar en logs (opcional)
        console.log(`[Embed] ${req.session.user.username} envió un embed en ${guild.name}/${channel.name}`);

        res.json({ success: true, message: 'Embed enviado correctamente' });
    } catch (error) {
        console.error('Error enviando embed:', error);
        res.status(500).json({ error: error.message || 'Error al enviar embed' });
    }
});

app.get('/api/embed-templates/:guildId', requireAuth, (req, res) => {
    try {
        const { guildId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const store = readTemplateStore();
        const list = Array.isArray(store.guilds[guildId]) ? store.guilds[guildId] : [];
        res.json(list);
    } catch (error) {
        console.error('Error listando plantillas de embed:', error);
        res.status(500).json({ error: 'Error al listar plantillas' });
    }
});

app.post('/api/embed-templates', requireAuth, (req, res) => {
    try {
        const { guildId, name, embed } = req.body || {};
        if (!guildId || !name || !embed || typeof embed !== 'object') {
            return res.status(400).json({ error: 'Datos incompletos para guardar plantilla' });
        }

        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const cleanName = String(name).trim().slice(0, 80);
        if (!cleanName) return res.status(400).json({ error: 'Nombre de plantilla inválido' });

        const store = readTemplateStore();
        if (!Array.isArray(store.guilds[guildId])) store.guilds[guildId] = [];

        // Reemplaza por nombre si ya existe para no duplicar spam.
        const existingIndex = store.guilds[guildId].findIndex((t) => String(t.name).toLowerCase() === cleanName.toLowerCase());
        const template = {
            id: existingIndex >= 0 ? store.guilds[guildId][existingIndex].id : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: cleanName,
            guildId,
            createdBy: req.session.user?.id || 'unknown',
            updatedAt: new Date().toISOString(),
            embed
        };

        if (existingIndex >= 0) {
            store.guilds[guildId][existingIndex] = template;
        } else {
            store.guilds[guildId].push(template);
        }

        writeTemplateStore(store);
        res.json({ success: true, template });
    } catch (error) {
        console.error('Error guardando plantilla de embed:', error);
        res.status(500).json({ error: 'Error al guardar plantilla' });
    }
});

app.delete('/api/embed-templates/:guildId/:templateId', requireAuth, (req, res) => {
    try {
        const { guildId, templateId } = req.params;
        const userGuild = req.session.guilds?.find((g) => g.id === guildId);
        if (!userGuild) return res.status(403).json({ error: 'No tienes acceso a este servidor' });

        const store = readTemplateStore();
        const list = Array.isArray(store.guilds[guildId]) ? store.guilds[guildId] : [];
        const next = list.filter((t) => t.id !== templateId);
        store.guilds[guildId] = next;
        writeTemplateStore(store);
        res.json({ success: true });
    } catch (error) {
        console.error('Error eliminando plantilla de embed:', error);
        res.status(500).json({ error: 'Error al eliminar plantilla' });
    }
});

// Ruta para obtener estadísticas del bot
app.get('/api/stats', requireAuth, (req, res) => {
    if (!botClient) {
        return res.status(500).json({ error: 'Bot no disponible' });
    }

    const rawPing = Number(botClient.ws?.ping);
    const normalizedPing = Number.isFinite(rawPing) && rawPing >= 0 ? Math.round(rawPing) : null;

    const stats = {
        guilds: botClient.guilds.cache.size,
        users: botClient.users.cache.size,
        channels: botClient.channels.cache.size,
        uptime: botClient.uptime,
        ping: normalizedPing,
        commands: botClient.commands?.size || 0,
        memory: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
    };

    res.json(stats);
});

// Almacenar logs recientes
const recentLogs = [];
const MAX_LOGS = 500;

// Interceptar console.log para capturar logs
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function addLog(level, message) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message: typeof message === 'string' ? message : JSON.stringify(message)
    };
    recentLogs.push(logEntry);
    if (recentLogs.length > MAX_LOGS) {
        recentLogs.shift();
    }
}

console.log = function(...args) {
    originalLog.apply(console, args);
    addLog('info', args.join(' '));
};

console.error = function(...args) {
    originalError.apply(console, args);
    addLog('error', args.join(' '));
};

console.warn = function(...args) {
    originalWarn.apply(console, args);
    addLog('warn', args.join(' '));
};

// Ruta para obtener logs
app.get('/api/logs', requireAuth, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const level = req.query.level;
    
    let logs = recentLogs.slice(-limit);
    if (level) {
        logs = logs.filter(log => log.level === level);
    }
    
    res.json(logs.reverse());
});

// Server-Sent Events para logs en tiempo real
app.get('/api/logs/stream', requireAuth, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const sendLog = (log) => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
    };
    
    // Enviar logs recientes
    recentLogs.slice(-50).reverse().forEach(sendLog);
    
    // Interceptar nuevos logs
    const logListener = (log) => {
        sendLog(log);
    };
    
    // Agregar listener temporal
    const originalAddLog = addLog;
    const originalAddLogRef = addLog;
    
    req.on('close', () => {
        // Limpiar cuando el cliente se desconecta
    });
});

// Ruta para obtener lista de comandos
app.get('/api/commands', requireAuth, (req, res) => {
    if (!botClient || !botClient.commands) {
        return res.status(500).json({ error: 'Bot no disponible' });
    }

    const fs = require('fs');
    const path = require('path');
    const commandsPath = path.join(__dirname, '..', 'src', 'commands');
    
    const commands = Array.from(botClient.commands.values()).map(cmd => {
        // Intentar obtener la categoría de la ruta del archivo
        let category = 'other';
        
        // Buscar el archivo del comando en las carpetas
        try {
            const categories = ['config', 'fun', 'moderation', 'music', 'utility'];
            for (const cat of categories) {
                const catPath = path.join(commandsPath, cat);
                if (fs.existsSync(catPath)) {
                    const files = fs.readdirSync(catPath);
                    if (files.includes(`${cmd.data.name}.js`)) {
                        category = cat;
                        break;
                    }
                }
            }
        } catch (e) {
            // Si no se puede determinar, usar 'other'
            console.error('Error determinando categoría:', e);
        }
        
        return {
            name: cmd.data.name,
            description: cmd.data.description || 'Sin descripción',
            category: category,
            options: (cmd.data.options || []).map(opt => ({
                name: opt.name,
                description: opt.description || 'Sin descripción',
                type: opt.type,
                required: opt.required || false
            }))
        };
    });

    res.json(commands);
});

// Ruta para obtener información detallada del servidor
app.get('/api/guild/:guildId/info', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const userGuild = req.session.guilds?.find(g => g.id === guildId);
        if (!userGuild) {
            return res.status(403).json({ error: 'No tienes acceso a este servidor' });
        }

        const info = {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ dynamic: true, size: 256 }),
            owner: {
                id: guild.ownerId,
                tag: guild.members.cache.get(guild.ownerId)?.user?.tag || 'Desconocido'
            },
            memberCount: guild.memberCount,
            channelCount: guild.channels.cache.size,
            roleCount: guild.roles.cache.size,
            createdAt: guild.createdAt.toISOString(),
            features: guild.features,
            verificationLevel: guild.verificationLevel,
            premiumTier: guild.premiumTier,
            premiumSubscriptionCount: guild.premiumSubscriptionCount || 0,
            channels: {
                text: guild.channels.cache.filter(c => c.type === 0).size,
                voice: guild.channels.cache.filter(c => c.type === 2).size,
                category: guild.channels.cache.filter(c => c.type === 4).size
            },
            roles: guild.roles.cache.map(role => ({
                id: role.id,
                name: role.name,
                color: role.hexColor,
                position: role.position,
                members: role.members.size
            })).sort((a, b) => b.position - a.position),
            emojis: guild.emojis.cache.size,
            stickers: guild.stickers?.cache?.size || 0
        };

        res.json(info);
    } catch (error) {
        console.error('Error obteniendo información del servidor:', error);
        res.status(500).json({ error: 'Error al obtener información del servidor' });
    }
});

// Ruta para ejecutar comandos de moderación
app.post('/api/moderate', requireAuth, async (req, res) => {
    try {
        const { guildId, action, userId, reason } = req.body;

        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const moderator = req.session.user.username;
        const actionReason = reason || `Moderado por ${moderator} desde el panel web`;

        let result;
        switch (action) {
            case 'kick':
                await member.kick(actionReason);
                result = { success: true, message: `Usuario ${member.user.tag} expulsado` };
                break;
            case 'ban':
                await member.ban({ reason: actionReason });
                result = { success: true, message: `Usuario ${member.user.tag} baneado` };
                break;
            case 'timeout':
                const duration = req.body.duration || 600000; // 10 minutos por defecto
                await member.timeout(duration, actionReason);
                result = { success: true, message: `Usuario ${member.user.tag} silenciado` };
                break;
            case 'removeTimeout':
                await member.timeout(null);
                result = { success: true, message: `Timeout removido de ${member.user.tag}` };
                break;
            default:
                return res.status(400).json({ error: 'Acción no válida' });
        }

        console.log(`[Moderación] ${moderator} ejecutó ${action} en ${member.user.tag} en ${guild.name}`);
        res.json(result);
    } catch (error) {
        console.error('Error en moderación:', error);
        res.status(500).json({ error: error.message || 'Error al ejecutar acción de moderación' });
    }
});

// Ruta para obtener información de música
app.get('/api/guild/:guildId/music', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        // Intentar obtener información del sistema de música
        const musicSystem = botClient.musicSystem;
        if (!musicSystem) {
            return res.json({ 
                playing: false, 
                message: 'Sistema de música no disponible' 
            });
        }

        const queue = musicSystem.getQueue(guildId);
        if (!queue || !queue.current) {
            return res.json({ 
                playing: false,
                queue: [],
                current: null
            });
        }

        res.json({
            playing: true,
            current: {
                title: queue.current.title,
                url: queue.current.url,
                thumbnail: queue.current.thumbnail,
                duration: queue.current.duration,
                requestedBy: queue.current.requestedBy
            },
            queue: queue.songs.slice(1).map(song => ({
                title: song.title,
                url: song.url,
                duration: song.duration,
                requestedBy: song.requestedBy
            })),
            queueLength: queue.songs.length
        });
    } catch (error) {
        console.error('Error obteniendo información de música:', error);
        res.status(500).json({ error: 'Error al obtener información de música' });
    }
});

// Ruta para controlar música
app.post('/api/guild/:guildId/music/control', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const { action } = req.body;
        
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        const musicSystem = botClient.musicSystem;
        if (!musicSystem) {
            return res.status(500).json({ error: 'Sistema de música no disponible' });
        }

        // Simular interacción para el sistema de música
        const fakeInteraction = {
            guild: guild,
            member: guild.members.cache.get(req.session.user.id),
            reply: async (options) => {
                return { success: true };
            },
            deferReply: async () => {},
            editReply: async () => {}
        };

        let result;
        switch (action) {
            case 'pause':
                await musicSystem.handleMusicControl(fakeInteraction, 'pause');
                result = { success: true, message: 'Reproducción pausada' };
                break;
            case 'resume':
                await musicSystem.handleMusicControl(fakeInteraction, 'resume');
                result = { success: true, message: 'Reproducción reanudada' };
                break;
            case 'skip':
                await musicSystem.handleMusicControl(fakeInteraction, 'skip');
                result = { success: true, message: 'Canción saltada' };
                break;
            case 'stop':
                await musicSystem.handleMusicControl(fakeInteraction, 'stop');
                result = { success: true, message: 'Reproducción detenida' };
                break;
            case 'shuffle':
                await musicSystem.handleMusicControl(fakeInteraction, 'shuffle');
                result = { success: true, message: 'Cola mezclada' };
                break;
            default:
                return res.status(400).json({ error: 'Acción no válida' });
        }

        res.json(result);
    } catch (error) {
        console.error('Error controlando música:', error);
        res.status(500).json({ error: error.message || 'Error al controlar música' });
    }
});

// Ruta para buscar miembros
app.get('/api/guild/:guildId/members', requireAuth, async (req, res) => {
    try {
        const { guildId } = req.params;
        const query = req.query.q || '';
        
        if (!botClient) {
            return res.status(500).json({ error: 'Bot no disponible' });
        }

        const guild = botClient.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Servidor no encontrado' });
        }

        try {
            // Evita que la UI se quede cargando si Discord/API tarda demasiado.
            const fetchPromise = guild.members.fetch().catch(() => null);
            await Promise.race([
                fetchPromise,
                timeoutAfter(7000, 'guild.members.fetch timeout')
            ]);
        } catch (error) {
            console.warn(`⚠️ members fetch fallback (${guildId}):`, error.message);
        }
        
        let members = Array.from(guild.members.cache.values())
            .filter(m => !m.user.bot)
            .map(m => ({
                id: m.user.id,
                username: m.user.username,
                discriminator: m.user.discriminator,
                tag: m.user.tag,
                avatar: m.user.displayAvatarURL({ dynamic: true }),
                joinedAt: m.joinedAt?.toISOString(),
                roles: m.roles.cache.map(r => ({ id: r.id, name: r.name, color: r.hexColor }))
            }));

        if (query) {
            const lowerQuery = query.toLowerCase();
            members = members.filter(m => 
                m.username.toLowerCase().includes(lowerQuery) ||
                m.tag.toLowerCase().includes(lowerQuery)
            );
        }

        res.json(members.slice(0, 50));
    } catch (error) {
        console.error('Error obteniendo miembros:', error);
        res.status(500).json({ error: 'Error al obtener miembros' });
    }
});

// Ruta para login (mostrar página de login)
app.get('/login', (req, res) => {
    // Si ya está autenticado, redirigir al dashboard
    if (req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Ruta principal - verificar autenticación antes de servir
app.get('/', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Ruta para dashboard (alias de /)
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    res.redirect('/');
});

// Iniciar servidor con manejo de errores
const server = app.listen(PORT, () => {
    console.log(`🌐 Panel web iniciado en http://localhost:${PORT}`);
}).on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Error: El puerto ${PORT} ya está en uso`);
        console.log(`💡 Soluciones:`);
        console.log(`   1. Cambia el puerto en .env: WEB_PORT=3001`);
        console.log(`   2. O detén el proceso que usa el puerto ${PORT}`);
        console.log(`   3. O deshabilita el panel: WEB_ENABLED=false`);
        console.log(`\n⚠️  El bot continuará funcionando sin el panel web.`);
    } else {
        console.error(`❌ Error iniciando panel web:`, error);
    }
});

module.exports = { setBotClient, app, server };

