/**
 * Carga pantallas HTML y overlays antes de inicializar app.js.
 */
(function initScreenLoader(global) {
    const SCREENS = [
        'partials/screens/dashboard.html',
        'partials/screens/about.html',
        'partials/screens/premium.html',
        'partials/screens/settings.html',
        'partials/screens/embed.html',
        'partials/screens/commands.html',
        'partials/screens/server.html'
    ];

    const OVERLAYS_URL = 'partials/overlays.html';

    async function fetchPartial(url) {
        if (typeof global.fetch !== 'function') {
            throw new Error('fetch no disponible');
        }
        const response = await fetch(url, {
            cache: 'no-store',
            credentials: 'same-origin',
            headers: { Accept: 'text/html, */*' }
        });
        if (!response.ok) {
            throw new Error(`No se pudo cargar ${url} (${response.status})`);
        }
        return response.text();
    }

    async function loadPanelPartials() {
        const screensMount = document.getElementById('appScreensMount');
        const overlaysMount = document.getElementById('appOverlaysMount');
        if (!screensMount || !overlaysMount) {
            throw new Error('Faltan #appScreensMount o #appOverlaysMount en index.html');
        }

        const [screenParts, overlaysHtml] = await Promise.all([
            Promise.all(SCREENS.map(fetchPartial)),
            fetchPartial(OVERLAYS_URL)
        ]);

        screensMount.innerHTML = screenParts.join('\n');
        overlaysMount.innerHTML = overlaysHtml;
        document.dispatchEvent(new CustomEvent('eyedbot:screens-ready'));
    }

    global.__appScreensReady = loadPanelPartials().catch((error) => {
        console.error('❌ Error cargando pantallas del panel:', error);
        const screensMount = document.getElementById('appScreensMount');
        if (screensMount) {
            screensMount.innerHTML = `
                <section class="section active" style="padding:2rem;text-align:center;">
                    <h2>No se pudo cargar el panel</h2>
                    <p>Recarga la página. Si persiste, revisa que existan los archivos en <code>partials/screens/</code>.</p>
                </section>`;
        }
        throw error;
    });
})(window);
