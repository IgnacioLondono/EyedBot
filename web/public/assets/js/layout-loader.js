/**
 * Carga el layout base (fondo + navbar + mounts) para entradas por pantalla.
 */
(function initLayoutLoader(global) {
    const doc = global.document;
    if (!doc) return;

    function resolveUrl(relativePath) {
        const clean = String(relativePath || '').replace(/^\/+/, '');
        const origin = String(global.location?.origin || '').replace(/\/$/, '');
        if (!origin) return `/${clean}`;
        return `${origin}/${clean}`;
    }

    async function loadLayout() {
        const mount = doc.getElementById('appLayoutMount');
        if (!mount) {
            throw new Error('Falta #appLayoutMount en la página');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        let response;
        try {
            response = await fetch(resolveUrl('partials/layout-shell.html'), {
                cache: 'default',
                credentials: 'same-origin',
                headers: { Accept: 'text/html, */*' },
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }
        if (!response.ok) {
            throw new Error(`No se pudo cargar layout-shell (${response.status})`);
        }

        mount.innerHTML = await response.text();
        global.EyedBotPerformance?.syncBackgroundBubbles?.();
        if (typeof global.rehydrateThemeWallpaper === 'function') {
            global.rehydrateThemeWallpaper();
        }
    }

    global.__appLayoutReady = loadLayout().catch((error) => {
        console.error('❌ Error cargando layout base:', error);
        const mount = doc.getElementById('appLayoutMount');
        if (mount) {
            mount.innerHTML = `
                <section style="padding:2rem;text-align:center;max-width:36rem;margin:0 auto;">
                    <h2>No se pudo cargar el panel</h2>
                    <p>Recarga con <strong>Ctrl+F5</strong>. Si persiste, verifica el despliegue de <code>partials/layout-shell.html</code>.</p>
                </section>
            `;
        }
        throw error;
    });
})(window);
