const path = require('path');

const SKIP_EXACT = new Set(['/callback', '/logout', '/favicon.ico', '/health']);
const SKIP_PREFIX = ['/api', '/webhooks', '/auth/discord', '/uploads'];

/** Rutas del panel v1 → panel Next.js */
const LEGACY_PAGE_REDIRECTS = {
    '/pages/dashboard.html': '/dashboard',
    '/pages/about.html': '/about',
    '/pages/commands.html': '/commands',
    '/pages/premium.html': '/premium',
    '/login.html': '/login',
    '/index.html': '/dashboard'
};

function shouldSkipNextPanel(pathname = '') {
    const p = String(pathname || '');
    if (SKIP_EXACT.has(p)) return true;
    return SKIP_PREFIX.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

function appendQuery(req, targetPath) {
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    return `${targetPath}${qs}`;
}

function applyPanelResponseHeaders(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!res.getHeader('Cross-Origin-Resource-Policy')) {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    }

    const path = String(req.path || '');
    if (path.startsWith('/_next/static/')) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(?:svg|ico|png|jpe?g|webp|gif|woff2?)$/i.test(path)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
    } else if (!res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', 'private, no-cache, must-revalidate');
    }
}

function handlePanelRequest(handle, req, res) {
    applyPanelResponseHeaders(req, res);
    return handle(req, res);
}

function registerLegacyPanelRedirects(app) {
    Object.entries(LEGACY_PAGE_REDIRECTS).forEach(([from, to]) => {
        app.get(from, (req, res) => {
            res.redirect(301, appendQuery(req, to));
        });
    });

    app.get('/pages/server.html', (req, res) => {
        const guildId = req.query.guild || req.query.guildId || req.query.id;
        if (guildId) {
            const pane = String(req.query.pane || req.query.tab || 'overview').replace(/[^a-z0-9-]/gi, '') || 'overview';
            return res.redirect(301, `/server/${encodeURIComponent(String(guildId))}/${pane}`);
        }
        res.redirect(301, '/dashboard');
    });

    app.get('/pages/settings.html', (req, res) => {
        const pane = String(req.query.pane || req.query.tab || 'account').replace(/[^a-z0-9-]/gi, '') || 'account';
        res.redirect(301, appendQuery(req, `/settings/${pane}`));
    });
}

/**
 * Monta el panel Next.js (App Router) en el mismo Express que sirve /api.
 * @param {import('express').Express} app
 */
async function attachNextPanel(app) {
    registerLegacyPanelRedirects(app);

    const panelDir = path.join(__dirname, 'panel');
    const next = require(path.join(panelDir, 'node_modules', 'next'));
    const dev = process.env.NODE_ENV !== 'production';
    const nextApp = next({ dev, dir: panelDir });
    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();

    app.get('/login', (req, res) => {
        if (req.session?.user) {
            return res.redirect('/dashboard');
        }
        return handlePanelRequest(handle, req, res);
    });

    app.get('/', (req, res) => {
        if (!req.session?.user) {
            return res.redirect('/login');
        }
        return res.redirect('/dashboard');
    });

    app.get('/dashboard', (req, res) => {
        if (!req.session?.user) {
            return res.redirect('/login');
        }
        return handlePanelRequest(handle, req, res);
    });

    app.use((req, res, nextMiddleware) => {
        if (shouldSkipNextPanel(req.path)) {
            return nextMiddleware();
        }
        return handlePanelRequest(handle, req, res);
    });

    console.log('✅ Panel Next.js montado (%s)', dev ? 'desarrollo' : 'producción');
    return true;
}

module.exports = {
    attachNextPanel,
    registerLegacyPanelRedirects
};
