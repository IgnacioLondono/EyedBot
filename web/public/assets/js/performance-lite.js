/**
 * Detecta dispositivos/navegadores lentos y activa modo rendimiento (menos animaciones y blur).
 */
(function initEyedBotPerformanceLite(global) {
    const doc = global.document;
    if (!doc) return;

    const STORAGE_KEY = 'eyedbot-force-perf-lite';
    const STORAGE_OFF = 'eyedbot-force-perf-off';
    const THEME_STORAGE_KEY = 'eyedbot_theme_settings_v1';

    function readForcePerf() {
        try {
            if (global.localStorage.getItem(STORAGE_OFF) === '1') return false;
            if (global.localStorage.getItem(STORAGE_KEY) === '1') return true;
        } catch {
            /* ignore */
        }
        return null;
    }

    function detectPerfLite() {
        const forced = readForcePerf();
        if (forced === true) return true;
        if (forced === false) return false;

        const reduceMotion = global.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        if (reduceMotion) return true;

        const mem = Number(global.navigator?.deviceMemory || 0);
        if (mem > 0 && mem <= 4) return true;

        const cores = Number(global.navigator?.hardwareConcurrency || 0);
        if (cores > 0 && cores <= 4) return true;

        const conn = global.navigator?.connection || global.navigator?.mozConnection;
        if (conn?.saveData) return true;

        const ua = String(global.navigator?.userAgent || '');
        const isFirefox = /\bFirefox\//i.test(ua);
        const isSafari = /\bSafari\//i.test(ua) && !/\bChrome\//i.test(ua) && !/\bChromium\//i.test(ua);
        if (isFirefox || isSafari) return true;

        return false;
    }

    function applyPerfLite(enabled) {
        const root = doc.documentElement;
        root.classList.toggle('perf-lite', enabled);
        root.dataset.perfLite = enabled ? '1' : '0';
        return enabled;
    }

    function readThemeBackgroundBubblesEnabled() {
        try {
            const raw = global.localStorage.getItem(THEME_STORAGE_KEY);
            if (!raw) return false;
            const saved = JSON.parse(raw);
            return saved?.backgroundBubbles === true;
        } catch {
            return false;
        }
    }

    function shouldShowBackgroundBubbles() {
        if (applyPerfLite._enabled) return false;
        return readThemeBackgroundBubblesEnabled();
    }

    function syncBackgroundBubbles() {
        const show = shouldShowBackgroundBubbles();
        doc.querySelectorAll('.gradient-bg').forEach((bg) => {
            if (!(bg instanceof HTMLElement)) return;
            bg.classList.toggle('gradient-bg--no-bubbles', !show);
        });
        return show;
    }

    const enabled = applyPerfLite(detectPerfLite());
    applyPerfLite._enabled = enabled;

    const runBubbleSync = () => {
        syncBackgroundBubbles();
    };

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', runBubbleSync, { once: true });
    } else {
        runBubbleSync();
    }

    global.EyedBotPerformance = {
        isLite: () => doc.documentElement.classList.contains('perf-lite'),
        shouldShowBackgroundBubbles,
        syncBackgroundBubbles,
        setForceLite(on) {
            try {
                global.localStorage.removeItem(STORAGE_OFF);
                global.localStorage.removeItem(STORAGE_KEY);
                if (on) global.localStorage.setItem(STORAGE_KEY, '1');
                else global.localStorage.setItem(STORAGE_OFF, '1');
            } catch {
                /* ignore */
            }
            applyPerfLite._enabled = applyPerfLite(on);
            syncBackgroundBubbles();
        },
        clearForce() {
            try {
                global.localStorage.removeItem(STORAGE_OFF);
                global.localStorage.removeItem(STORAGE_KEY);
            } catch {
                /* ignore */
            }
            applyPerfLite._enabled = applyPerfLite(detectPerfLite());
            syncBackgroundBubbles();
        }
    };
})(window);
