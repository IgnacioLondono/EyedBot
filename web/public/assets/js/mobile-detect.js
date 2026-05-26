/**
 * Detección temprana de móvil (antes del paint). Expone window.EyedBotDevice.
 */
(function initEyedBotDeviceDetect(global) {
    const STORAGE_DESKTOP = 'eyedbot-force-desktop';
    const STORAGE_MOBILE = 'eyedbot-force-mobile';

    function readForceMode() {
        try {
            if (global.localStorage.getItem(STORAGE_DESKTOP) === '1') return 'desktop';
            if (global.localStorage.getItem(STORAGE_MOBILE) === '1') return 'mobile';
        } catch {
            /* ignore */
        }
        return '';
    }

    function computeIsMobile() {
        const forced = readForceMode();
        if (forced === 'desktop') return false;
        if (forced === 'mobile') return true;

        const w = global.innerWidth || 0;
        const coarse = global.matchMedia('(pointer: coarse)').matches;
        const narrow = global.matchMedia('(max-width: 768px)').matches;
        const touch = 'ontouchstart' in global || (global.navigator.maxTouchPoints || 0) > 0;
        const uaMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
            global.navigator.userAgent || ''
        );
        const standalone = global.matchMedia('(display-mode: standalone)').matches;

        if (narrow) return true;
        if (uaMobile && w < 1024) return true;
        if (touch && coarse && w < 900) return true;
        if (standalone && w < 1024) return true;
        return false;
    }

    function applyDeviceClasses() {
        const root = global.document.documentElement;
        const mobile = computeIsMobile();
        root.classList.toggle('is-mobile', mobile);
        root.classList.toggle('is-desktop', !mobile);
        root.classList.toggle('is-touch', 'ontouchstart' in global || (global.navigator.maxTouchPoints || 0) > 0);
        root.dataset.device = mobile ? 'mobile' : 'desktop';
        return mobile;
    }

    const api = {
        isMobile: () => applyDeviceClasses(),
        setForceMode(mode) {
            try {
                global.localStorage.removeItem(STORAGE_DESKTOP);
                global.localStorage.removeItem(STORAGE_MOBILE);
                if (mode === 'desktop') global.localStorage.setItem(STORAGE_DESKTOP, '1');
                if (mode === 'mobile') global.localStorage.setItem(STORAGE_MOBILE, '1');
            } catch {
                /* ignore */
            }
            applyDeviceClasses();
            global.dispatchEvent(new CustomEvent('eyedbot:device', { detail: { mobile: computeIsMobile() } }));
        },
        clearForceMode() {
            api.setForceMode('');
        }
    };

    applyDeviceClasses();
    global.EyedBotDevice = api;

    let resizeTimer = null;
    global.addEventListener('resize', () => {
        if (readForceMode()) return;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const was = global.document.documentElement.classList.contains('is-mobile');
            const now = applyDeviceClasses();
            if (was !== now) {
                global.dispatchEvent(new CustomEvent('eyedbot:device', { detail: { mobile: now } }));
            }
        }, 120);
    }, { passive: true });
})(typeof window !== 'undefined' ? window : globalThis);
