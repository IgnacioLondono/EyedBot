// Cargar variables de entorno desde la raíz del proyecto
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const session = require('express-session');
const DiscordOauth2 = require('discord-oauth2');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.WEB_PORT || 3000;

// Validar variables de entorno requeridas
if (!process.env.CLIENT_ID) {
    console.error('❌ ERROR: CLIENT_ID no está configurado en .env');
    console.log('💡 Agrega CLIENT_ID=tu_client_id a tu archivo .env');
}

if (!process.env.CLIENT_SECRET) {
    console.error('❌ ERROR: CLIENT_SECRET no está configurado en .env');
    console.log('💡 Agrega CLIENT_SECRET=tu_client_secret a tu archivo .env');
    console.log('💡 Obtén el CLIENT_SECRET de Discord Developer Portal > OAuth2');
}

// Configuración de OAuth2
const redirectUri = process.env.REDIRECT_URI || `http://localhost:${PORT}/callback`;

const oauth = new DiscordOauth2({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    redirectUri: redirectUri
});

console.log('🔐 OAuth2 configurado:');
console.log(`   Client ID: ${process.env.CLIENT_ID ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   Client Secret: ${process.env.CLIENT_SECRET ? '✅ Configurado' : '❌ Faltante'}`);
console.log(`   Redirect URI: ${redirectUri}`);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de sesiones
app.use(session({
    secret: process.env.SESSION_SECRET || 'tu-secret-super-seguro-cambiar-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // false en desarrollo (http)
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        sameSite: 'lax' // Ayuda con redirecciones de OAuth
    },
    name: 'tulabot.session' // Nombre personalizado para la cookie
}));

// Variable global para el cliente del bot (se inyectará desde index.js)
let botClient = null;

// Función para inyectar el cliente del bot
function setBotClient(client) {
    botClient = client;
}

// Rutas de autenticación
app.get('/login', (req, res) => {
    if (!process.env.CLIENT_ID) {
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
        
        const url = oauth.generateAuthUrl({
            scope: ['identify', 'guilds'],
            state: state
        });
        console.log(`🔗 Redirigiendo a Discord OAuth2...`);
        res.redirect(url);
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
            return res.redirect('/login?error=discord_error');
        }

        if (!code) {
            console.error('❌ No se recibió código de autorización');
            return res.redirect('/login?error=no_code');
        }

        // Verificar que CLIENT_SECRET esté configurado
        if (!process.env.CLIENT_SECRET) {
            console.error('❌ CLIENT_SECRET no está configurado en .env');
            return res.redirect('/login?error=config_error');
        }

        // Verificar estado (CSRF protection) - opcional pero recomendado
        if (state && req.session.oauthState && state !== req.session.oauthState) {
            console.error('❌ Estado OAuth no coincide - posible ataque CSRF');
            return res.redirect('/login?error=auth_failed');
        }

        console.log('🔐 Intercambiando código por token...');
        console.log(`   Redirect URI: ${redirectUri}`);
        console.log(`   Client ID: ${process.env.CLIENT_ID ? '✅ Configurado' : '❌ Faltante'}`);
        console.log(`   Client Secret: ${process.env.CLIENT_SECRET ? '✅ Configurado' : '❌ Faltante'}`);
        
        const tokenData = await oauth.tokenRequest({
            code,
            scope: 'identify guilds',
            grantType: 'authorization_code'
        });

        if (!tokenData || !tokenData.access_token) {
            console.error('❌ No se recibió token de acceso');
            return res.redirect('/login?error=auth_failed');
        }

        console.log('👤 Obteniendo información del usuario...');
        const user = await oauth.getUser(tokenData.access_token);
        const guilds = await oauth.getUserGuilds(tokenData.access_token);

        if (!user || !user.id) {
            console.error('❌ No se pudo obtener información del usuario');
            return res.redirect('/login?error=auth_failed');
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
                return res.redirect('/login?error=session_error');
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
            return res.redirect('/login?error=invalid_secret');
        }
        
        res.redirect('/login?error=auth_failed');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Middleware para verificar autenticación
function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        console.log('⚠️ Intento de acceso sin autenticación a:', req.path);
        return res.redirect('/login');
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
            .filter(channel => channel.type === 0 || channel.type === 2) // Solo texto y voz
            .map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                typeName: channel.type === 0 ? 'texto' : 'voz'
            }));

        res.json(channels);
    } catch (error) {
        console.error('Error obteniendo canales:', error);
        res.status(500).json({ error: 'Error al obtener canales' });
    }
});

// Ruta para enviar embeds
app.post('/api/send-embed', requireAuth, async (req, res) => {
    try {
        const { guildId, channelId, embed } = req.body;

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
        if (!channel.permissionsFor(guild.members.me)?.has(['SendMessages', 'EmbedLinks'])) {
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

        await channel.send({ embeds: [discordEmbed] });

        // Guardar en logs (opcional)
        console.log(`[Embed] ${req.session.user.username} envió un embed en ${guild.name}/${channel.name}`);

        res.json({ success: true, message: 'Embed enviado correctamente' });
    } catch (error) {
        console.error('Error enviando embed:', error);
        res.status(500).json({ error: error.message || 'Error al enviar embed' });
    }
});

// Ruta para obtener estadísticas del bot
app.get('/api/stats', requireAuth, (req, res) => {
    if (!botClient) {
        return res.status(500).json({ error: 'Bot no disponible' });
    }

    const stats = {
        guilds: botClient.guilds.cache.size,
        users: botClient.users.cache.size,
        channels: botClient.channels.cache.size,
        uptime: botClient.uptime,
        ping: botClient.ws.ping,
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
            })).sort((a, b) => b.position - a.position).slice(0, 20),
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

        await guild.members.fetch();
        
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

