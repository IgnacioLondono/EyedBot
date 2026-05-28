(function boot(global) {
    const scripts = [
        '/assets/js/core/api.js?v=2',
        '/assets/js/core/state.js?v=2',
        '/assets/js/core/ui.js?v=2',
        '/assets/js/core/router.js?v=2',
        '/assets/js/app.js?v=2'
    ];

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
            document.head.appendChild(script);
        });
    }

    async function run() {
        for (const src of scripts) {
            await loadScript(src);
        }
        await global.EyedApp.init();
    }

    run().catch((error) => {
        console.error('Error inicializando EyedBot v2:', error);
        const app = document.getElementById('app');
        if (app) {
            app.innerHTML = `<div style="padding:24px;color:#fff;background:#2b114f;border-radius:12px;">Error cargando el panel: ${String(error.message || error)}</div>`;
        }
    });
})(window);
