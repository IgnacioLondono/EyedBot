const path = require('path');

const SKIP_EXACT = new Set(['/callback', '/logout', '/favicon.ico', '/health']);
const SKIP_PREFIX = ['/api', '/webhooks', '/auth/discord'];

function shouldSkipNextPanel(pathname = '') {
    const p = String(pathname || '');
    if (SKIP_EXACT.has(p)) return true;
    return SKIP_PREFIX.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

function isNextPanelEnabled() {
    return (process.env.PANEL_NEXT_ENABLED || 'true').toLowerCase() !== 'false';
}

/**
 * Monta el panel Next.js (App Router) en el mismo Express que sirve /api.
 * @param {import('express').Express} app
 */
async function attachNextPanel(app) {
    if (!isNextPanelEnabled()) {
        console.log('ℹ️ Panel Next desactivado (PANEL_NEXT_ENABLED=false). Usando frontend legacy en public/.');
        return false;
    }

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
        return handle(req, res);
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
        return handle(req, res);
    });

    app.use((req, res, nextMiddleware) => {
        if (shouldSkipNextPanel(req.path)) {
            return nextMiddleware();
        }
        return handle(req, res);
    });

    console.log(`✅ Panel Next.js montado (${dev ? 'desarrollo' : 'producción'})`);
    return true;
}

module.exports = {
    attachNextPanel,
    isNextPanelEnabled
};
