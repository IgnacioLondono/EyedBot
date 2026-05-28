/**
 * Polyfills y comprobaciones mínimas para navegadores modernos y legacy recientes.
 */
(function initEyedBotBrowserCompat(global) {
    const doc = global.document;
    if (!doc) return;

    if (typeof global.CustomEvent !== 'function') {
        global.CustomEvent = function CustomEvent(type, params) {
            params = params || { bubbles: false, cancelable: false, detail: null };
            const ev = doc.createEvent('CustomEvent');
            ev.initCustomEvent(type, params.bubbles, params.cancelable, params.detail);
            return ev;
        };
        global.CustomEvent.prototype = global.Event.prototype;
    }

    if (typeof global.fetch !== 'function') {
        doc.documentElement.classList.add('no-fetch');
        console.error('Este navegador no soporta fetch(). Actualiza el navegador para usar EyedBot.');
    }

    if (!('inert' in HTMLElement.prototype)) {
        const markInertTree = (root) => {
            if (!root || !root.hasAttribute('inert')) return;
            root.setAttribute('aria-hidden', 'true');
            root.querySelectorAll(
                'a, button, input, select, textarea, [tabindex], [contenteditable="true"]'
            ).forEach((el) => {
                if (!el.hasAttribute('data-inert-tabindex')) {
                    el.setAttribute('data-inert-tabindex', el.getAttribute('tabindex') || '');
                }
                el.setAttribute('tabindex', '-1');
            });
        };

        const clearInertTree = (root) => {
            if (!root) return;
            root.removeAttribute('aria-hidden');
            root.querySelectorAll('[data-inert-tabindex]').forEach((el) => {
                const prev = el.getAttribute('data-inert-tabindex');
                if (prev) el.setAttribute('tabindex', prev);
                else el.removeAttribute('tabindex');
                el.removeAttribute('data-inert-tabindex');
            });
        };

        const syncInert = (el) => {
            if (!el || el.nodeType !== 1) return;
            if (el.hasAttribute('inert')) markInertTree(el);
            else clearInertTree(el);
        };

        doc.addEventListener(
            'DOMContentLoaded',
            () => {
                doc.querySelectorAll('[inert]').forEach(markInertTree);
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((m) => {
                        if (m.type === 'attributes' && m.attributeName === 'inert') {
                            syncInert(m.target);
                        }
                        m.addedNodes.forEach((node) => {
                            if (node.nodeType !== 1) return;
                            if (node.hasAttribute('inert')) markInertTree(node);
                            node.querySelectorAll?.('[inert]').forEach(markInertTree);
                        });
                    });
                });
                observer.observe(doc.body, {
                    subtree: true,
                    childList: true,
                    attributes: true,
                    attributeFilter: ['inert']
                });
            },
            { once: true }
        );
    }

    const applyPassiveTouch = () => {
        let supportsPassive = false;
        try {
            const opts = Object.defineProperty({}, 'passive', {
                get() {
                    supportsPassive = true;
                    return true;
                }
            });
            global.addEventListener('testPassive', null, opts);
            global.removeEventListener('testPassive', null, opts);
        } catch {
            supportsPassive = false;
        }
        if (!supportsPassive) {
            doc.documentElement.classList.add('no-passive-touch');
        }
    };
    applyPassiveTouch();

    global.EyedBotBrowserCompat = {
        version: 1
    };
})(window);
