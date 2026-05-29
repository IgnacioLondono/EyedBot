/**
 * Carga progresiva: dashboard primero, demás pantallas y CSS en segundo plano.
 */
(function initScreenLoader(global) {
    const VERSION = '20260528-min9';

    const SCREEN_FILES = {
        dashboard: 'partials/screens/dashboard.html',
        controlCenterSection: 'partials/screens/about.html',
        premiumSection: 'partials/screens/premium.html',
        profileSettingsSection: 'partials/screens/settings.html',
        embedSection: 'partials/screens/embed.html',
        commandsSection: 'partials/screens/commands.html',
        serverSection: 'partials/screens/server.html'
    };

    const PRIORITY_BOOT = ['dashboard'];
    const DEFERRED_SCREENS = Object.keys(SCREEN_FILES).filter((id) => !PRIORITY_BOOT.includes(id));

    const CSS_DEFERRED = [
        `assets/css/pro/02-about-legacy.min.css?v=${VERSION}`,
        `assets/css/pro/03-about-rb3.min.css?v=${VERSION}`,
        `assets/css/pro/04-tickets-manage.min.css?v=${VERSION}`,
        `assets/css/pro/05-receipt-modal.min.css?v=${VERSION}`,
        `assets/css/pro/06-server-overview.min.css?v=${VERSION}`,
        `assets/css/pro/07-server-insights.min.css?v=${VERSION}`,
        `assets/css/pro/08-server-panes.min.css?v=${VERSION}`,
        `assets/css/pro/09-free-games.min.css?v=${VERSION}`,
        `assets/css/pro/10-mobile-levels-modules.min.css?v=${VERSION}`,
        `assets/css/pro/12-card-accents.min.css?v=${VERSION}`,
        `assets/css/pro/13-eyedplus-lock.min.css?v=${VERSION}`,
        `assets/css/mobile-app-complete.min.css?v=${VERSION}`
    ];

    const CSS_BY_SECTION = {
        controlCenterSection: [
            `assets/css/pro/02-about-legacy.min.css?v=${VERSION}`,
            `assets/css/pro/03-about-rb3.min.css?v=${VERSION}`
        ],
        premiumSection: [`assets/css/pro/13-eyedplus-lock.min.css?v=${VERSION}`],
        profileSettingsSection: [],
        embedSection: [`assets/css/pro/05-receipt-modal.min.css?v=${VERSION}`],
        commandsSection: [],
        serverSection: [
            `assets/css/pro/04-tickets-manage.min.css?v=${VERSION}`,
            `assets/css/pro/06-server-overview.min.css?v=${VERSION}`,
            `assets/css/pro/07-server-insights.min.css?v=${VERSION}`,
            `assets/css/pro/08-server-panes.min.css?v=${VERSION}`,
            `assets/css/pro/09-free-games.min.css?v=${VERSION}`,
            `assets/css/pro/10-mobile-levels-modules.min.css?v=${VERSION}`
        ]
    };

    const OVERLAYS_URL = 'partials/overlays.html';

    const loadedScreens = new Set();
    const loadedCss = new Set();
    const screenPromises = new Map();

    function resolvePanelAssetUrl(relativePath) {
        const clean = String(relativePath || '').replace(/^\/+/, '');
        const origin = String(global.location?.origin || '').replace(/\/$/, '');
        if (!origin) return `/${clean}`;
        return `${origin}/${clean}`;
    }

    async function fetchPartial(relativePath) {
        if (typeof global.fetch !== 'function') {
            throw new Error('fetch no disponible');
        }
        const url = resolvePanelAssetUrl(relativePath);
        const response = await fetch(url, {
            cache: 'default',
            credentials: 'same-origin',
            headers: { Accept: 'text/html, */*' }
        });
        if (!response.ok) {
            throw new Error(`No se pudo cargar ${relativePath} (${response.status})`);
        }
        return response.text();
    }

    function loadStylesheet(href) {
        if (!href || loadedCss.has(href)) return Promise.resolve();
        loadedCss.add(href);
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            link.onload = () => resolve();
            link.onerror = () => {
                loadedCss.delete(href);
                reject(new Error(`CSS no cargado: ${href}`));
            };
            document.head.appendChild(link);
        });
    }

    function loadStylesheets(urls = []) {
        const list = urls.filter(Boolean);
        if (!list.length) return Promise.resolve();
        return Promise.all(list.map((href) => loadStylesheet(href).catch(() => {})));
    }

    function preloadDeferredCss() {
        const run = () => loadStylesheets(CSS_DEFERRED);
        if (typeof global.requestIdleCallback === 'function') {
            global.requestIdleCallback(() => { run(); }, { timeout: 4000 });
        } else {
            global.setTimeout(run, 1200);
        }
    }

    function mountScreenHtml(sectionId, html) {
        const screensMount = document.getElementById('appScreensMount');
        if (!screensMount || !html) return;

        const temp = document.createElement('div');
        temp.innerHTML = html.trim();
        const section = temp.querySelector('section');
        if (!section) return;

        const existing = document.getElementById(sectionId);
        if (existing) {
            existing.replaceWith(section);
        } else {
            screensMount.appendChild(section);
        }
        loadedScreens.add(sectionId);
        document.dispatchEvent(new CustomEvent('eyedbot:screen-mounted', { detail: { sectionId } }));
        global.applyOwnerRestrictedVisibility?.();
    }

    async function loadScreen(sectionId) {
        if (loadedScreens.has(sectionId)) return;
        if (screenPromises.has(sectionId)) {
            return screenPromises.get(sectionId);
        }

        const path = SCREEN_FILES[sectionId];
        if (!path) return;

        const promise = fetchPartial(path)
            .then((html) => {
                mountScreenHtml(sectionId, html);
                return loadStylesheets(CSS_BY_SECTION[sectionId] || []);
            })
            .catch((error) => {
                screenPromises.delete(sectionId);
                throw error;
            });

        screenPromises.set(sectionId, promise);
        return promise;
    }

    async function loadDeferredScreens() {
        for (const sectionId of DEFERRED_SCREENS) {
            try {
                await loadScreen(sectionId);
            } catch (error) {
                console.warn(`⚠️ Pantalla ${sectionId} no precargada:`, error.message);
            }
        }
        document.dispatchEvent(new CustomEvent('eyedbot:screens-all-ready'));
    }

    async function loadPanelPartials() {
        if (global.__appLayoutReady && typeof global.__appLayoutReady.then === 'function') {
            await global.__appLayoutReady;
        }

        const screensMount = document.getElementById('appScreensMount');
        const overlaysMount = document.getElementById('appOverlaysMount');
        if (!screensMount || !overlaysMount) {
            throw new Error('Faltan #appScreensMount o #appOverlaysMount en el layout base');
        }

        const [dashboardHtml, overlaysHtml] = await Promise.all([
            fetchPartial(SCREEN_FILES.dashboard),
            fetchPartial(OVERLAYS_URL)
        ]);

        screensMount.innerHTML = dashboardHtml;
        loadedScreens.add('dashboard');
        overlaysMount.innerHTML = overlaysHtml;

        document.dispatchEvent(new CustomEvent('eyedbot:screens-ready'));
        preloadDeferredCss();

        const scheduleDeferred = () => {
            loadDeferredScreens().catch((error) => {
                console.warn('⚠️ Precarga de pantallas diferida:', error.message);
            });
        };

        if (typeof global.requestIdleCallback === 'function') {
            global.requestIdleCallback(scheduleDeferred, { timeout: 2500 });
        } else {
            global.setTimeout(scheduleDeferred, 800);
        }
    }

    async function ensureScreen(sectionId) {
        const normalized = sectionId === 'dashboard' ? 'dashboard' : sectionId;
        if (!SCREEN_FILES[normalized]) return;
        await loadScreen(normalized);
        await loadStylesheets(CSS_BY_SECTION[normalized] || []);
    }

    global.EyedBotPanelLoader = {
        ensureScreen,
        loadScreen,
        isScreenLoaded: (sectionId) => loadedScreens.has(sectionId),
        loadChartJs() {
            if (global.Chart) return Promise.resolve(global.Chart);
            if (global.__chartJsLoading) return global.__chartJsLoading;
            global.__chartJsLoading = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js';
                script.crossOrigin = 'anonymous';
                script.onload = () => resolve(global.Chart);
                script.onerror = () => reject(new Error('No se pudo cargar Chart.js'));
                document.head.appendChild(script);
            });
            return global.__chartJsLoading;
        }
    };

    global.__appScreensReady = loadPanelPartials().catch((error) => {
        console.error('❌ Error cargando pantallas del panel:', error);
        const screensMount = document.getElementById('appScreensMount');
        const detail = error?.message ? String(error.message) : 'Error desconocido';
        if (screensMount) {
            screensMount.innerHTML = `
                <section class="section active" style="padding:2rem;text-align:center;max-width:36rem;margin:0 auto;">
                    <h2>No se pudo cargar el panel</h2>
                    <p>Recarga la página con <strong>Ctrl+F5</strong>. Si persiste, comprueba que el despliegue incluya <code>web/public/partials/</code>.</p>
                    <p style="margin-top:1rem;font-size:0.9rem;opacity:0.85;"><code>${detail.replace(/</g, '&lt;')}</code></p>
                </section>`;
        }
        throw error;
    });
})(window);
