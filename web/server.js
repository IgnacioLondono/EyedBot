const path = require('path');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MOCK_USER = {
    id: '399740358101303316',
    username: 'kiddis_',
    avatar: '',
    isOwner: true
};

const MOCK_GUILDS = [
    { id: '1', name: 'Eyed Community', members: 1245, hasBot: true },
    { id: '2', name: 'Beta Testers', members: 382, hasBot: true },
    { id: '3', name: 'Design Lab', members: 97, hasBot: false }
];

const COMMANDS = [
    { name: '/help', category: 'general', description: 'Muestra comandos disponibles' },
    { name: '/ping', category: 'general', description: 'Mide latencia del bot' },
    { name: '/setup welcome', category: 'welcome', description: 'Configura mensajes de bienvenida' },
    { name: '/embed send', category: 'embed', description: 'Envia embeds al canal seleccionado' },
    { name: '/tickets setup', category: 'tickets', description: 'Habilita sistema de tickets' },
    { name: '/mod ban', category: 'moderation', description: 'Banea un usuario' }
];

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
    if (/\.(js|css|png|jpg|jpeg|gif|webp|svg|ico)$/i.test(req.path)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (req.path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else {
        res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
    }
    next();
});

app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'eyedbot-web',
        version: '2.0.0',
        now: new Date().toISOString()
    });
});

app.get('/api/user', (_req, res) => {
    res.json({
        user: MOCK_USER,
        isOwner: MOCK_USER.isOwner,
        guilds: MOCK_GUILDS,
        inviteUrl: 'https://discord.com/oauth2/authorize?client_id=000000000000000000&permissions=8&scope=bot%20applications.commands'
    });
});

app.get('/api/guilds', (_req, res) => {
    res.json({ guilds: MOCK_GUILDS });
});

app.get('/api/commands', (_req, res) => {
    res.json({ commands: COMMANDS });
});

app.get('/api/stats', (_req, res) => {
    const totalMembers = MOCK_GUILDS.reduce((acc, guild) => acc + Number(guild.members || 0), 0);
    res.json({
        guilds: MOCK_GUILDS.length,
        members: totalMembers,
        commands: COMMANDS.length,
        ping: 42
    });
});

app.get('/login', (_req, res) => {
    res.redirect('/login.html');
});

app.get('/logout', (_req, res) => {
    res.redirect('/login.html');
});

app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`EyedBot web v2 corriendo en http://localhost:${PORT}`);
});
