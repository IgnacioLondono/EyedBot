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
        const touch = 'ontouchstart' in global || (global.navigator.maxTouchPoints || 0) > 0;
        const ua = String(global.navigator.userAgent || '');
        const uaDataMobile = global.navigator.userAgentData?.mobile === true;
        const isIpadLike = /\biPad\b/i.test(ua)
            || (/\bMacintosh\b/i.test(ua) && (global.navigator.maxTouchPoints || 0) > 1);
        const isAndroidTablet = /\bAndroid\b/i.test(ua) && !/\bMobile\b/i.test(ua);
        const isGenericTablet = /\bTablet|PlayBook|Silk|Kindle|Nexus 7|Nexus 9|SM-T|Tab\b/i.test(ua);
        const tabletLike = isIpadLike || isAndroidTablet || isGenericTablet;
        const phoneUa = /\biPhone|iPod|Windows Phone|IEMobile|Opera Mini\b/i.test(ua)
            || (/\bAndroid\b/i.test(ua) && /\bMobile\b/i.test(ua));
        const standalone = global.matchMedia('(display-mode: standalone)').matches;

        // Modo móvil exclusivo para teléfonos (evita tablets incluso en vertical).
        if (tabletLike) return false;
        if (uaDataMobile) return true;
        if (phoneUa) return true;
        if (touch && coarse && w > 0 && w <= 640) return true;
        if (standalone && touch && coarse && w > 0 && w <= 640) return true;
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
