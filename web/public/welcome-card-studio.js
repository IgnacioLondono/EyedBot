/**
 * Editor visual a pantalla completa para la tarjeta de bienvenida (PNG).
 * Depende de: fetchWithCredentials, showToast, applyWelcomePreviewTemplate (app.js).
 */
(function (win) {
    'use strict';

    const W = 920;
    const H = 520;

    const DEFAULT_LAYOUT = {
        bgFocalX: 0.5,
        bgFocalY: 0.5,
        avatarCx: 460,
        avatarCy: 168,
        avatarR: 78,
        titleX: 460,
        titleY: 262,
        nameX: 460,
        nameY: 320,
        subtitleX: 460,
        subtitleY: 368,
        overlayX: 892,
        overlayY: 498
    };

    function clamp(n, a, b) {
        return Math.min(b, Math.max(a, n));
    }

    function mergeCardLayout(raw) {
        const d = { ...DEFAULT_LAYOUT };
        if (!raw || typeof raw !== 'object') return d;
        const num = (v, def, min, max) => {
            const x = Number(v);
            return Number.isFinite(x) ? clamp(x, min, max) : def;
        };
        return {
            bgFocalX: num(raw.bgFocalX, d.bgFocalX, 0, 1),
            bgFocalY: num(raw.bgFocalY, d.bgFocalY, 0, 1),
            avatarCx: num(raw.avatarCx, d.avatarCx, 0, W),
            avatarCy: num(raw.avatarCy, d.avatarCy, 0, H),
            avatarR: num(raw.avatarR, d.avatarR, 36, 150),
            titleX: num(raw.titleX, d.titleX, 0, W),
            titleY: num(raw.titleY, d.titleY, 0, H),
            nameX: num(raw.nameX, d.nameX, 0, W),
            nameY: num(raw.nameY, d.nameY, 0, H),
            subtitleX: num(raw.subtitleX, d.subtitleX, 0, W),
            subtitleY: num(raw.subtitleY, d.subtitleY, 0, H),
            overlayX: num(raw.overlayX, d.overlayX, 0, W),
            overlayY: num(raw.overlayY, d.overlayY, 0, H)
        };
    }

    let rootEl = null;
    let optsRef = null;
    let layout = { ...DEFAULT_LAYOUT };
    let activeTool = 'select';
    let dragState = null;

    function ensureRoot() {
        if (rootEl) return rootEl;
        rootEl = document.createElement('div');
        rootEl.id = 'welcomeCardStudio';
        rootEl.className = 'wc-studio';
        rootEl.setAttribute('aria-hidden', 'true');
        rootEl.innerHTML = `
            <header class="wc-studio__topbar">
                <button type="button" class="wc-studio__btn wc-studio__btn--ghost" id="wcStudioClose" aria-label="Cerrar editor">← Volver</button>
                <div class="wc-studio__titlewrap">
                    <h2 class="wc-studio__title">Editor de tarjeta</h2>
                    <p class="wc-studio__subtitle">920×520 px · Arrastra cada elemento. Usa la herramienta de fondo para encuadrar la imagen.</p>
                </div>
                <div class="wc-studio__actions">
                    <button type="button" class="wc-studio__btn wc-studio__btn--ghost" id="wcStudioReset">Restablecer posiciones</button>
                    <button type="button" class="wc-studio__btn wc-studio__btn--primary" id="wcStudioSave">Guardar diseño</button>
                </div>
            </header>
            <div class="wc-studio__body">
                <aside class="wc-studio__toolbar" aria-label="Herramientas">
                    <button type="button" class="wc-studio__tool is-active" data-tool="select" title="Seleccionar y mover">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
                    </button>
                    <button type="button" class="wc-studio__tool" data-tool="avatar" title="Foto de perfil">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
                    </button>
                    <button type="button" class="wc-studio__tool" data-tool="bg" title="Encuadre del fondo">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    </button>
                    <button type="button" class="wc-studio__tool" data-tool="title" title="Título">
                        <span class="wc-studio__tool-letter">T</span>
                    </button>
                    <button type="button" class="wc-studio__tool" data-tool="name" title="Línea central">
                        <span class="wc-studio__tool-letter">N</span>
                    </button>
                    <button type="button" class="wc-studio__tool" data-tool="subtitle" title="Subtítulo">
                        <span class="wc-studio__tool-letter">S</span>
                    </button>
                    <button type="button" class="wc-studio__tool" data-tool="overlay" title="Texto extra">
                        <span class="wc-studio__tool-letter">+</span>
                    </button>
                </aside>
                <div class="wc-studio__canvas-wrap">
                    <div class="wc-studio__canvas-scaler">
                        <div class="wc-studio__stage" id="wcStudioStage" style="width:${W}px;height:${H}px;">
                            <div class="wc-stage-bg" id="wcStageBg" aria-hidden="true"></div>
                            <div class="wc-stage-vignette" aria-hidden="true"></div>
                            <div class="wc-layer wc-layer--avatar" id="wcLayerAvatar" data-drag="avatar">
                                <div class="wc-avatar-ring" id="wcAvatarRing"></div>
                                <img class="wc-avatar-img" id="wcAvatarImg" alt="" width="160" height="160" draggable="false" />
                            </div>
                            <div class="wc-layer wc-layer--text wc-layer--title" id="wcLayerTitle" data-drag="title"></div>
                            <div class="wc-layer wc-layer--text wc-layer--name" id="wcLayerName" data-drag="name"></div>
                            <div class="wc-layer wc-layer--text wc-layer--subtitle" id="wcLayerSubtitle" data-drag="subtitle"></div>
                            <div class="wc-layer wc-layer--text wc-layer--overlay" id="wcLayerOverlay" data-drag="overlay"></div>
                        </div>
                    </div>
                </div>
                <aside class="wc-studio__sidebar" id="wcStudioSidebar">
                    <h3 class="wc-studio__side-title">Propiedades</h3>
                    <div id="wcStudioSideContent" class="wc-studio__side-content"></div>
                </aside>
            </div>
        `;
        document.body.appendChild(rootEl);
        bindChrome();
        return rootEl;
    }

    function toast(msg, type) {
        if (typeof win.showToast === 'function') win.showToast(msg, type);
    }

    function bindChrome() {
        rootEl.querySelector('#wcStudioClose')?.addEventListener('click', close);
        rootEl.querySelector('#wcStudioSave')?.addEventListener('click', saveAndClose);
        rootEl.querySelector('#wcStudioReset')?.addEventListener('click', () => {
            layout = { ...DEFAULT_LAYOUT };
            syncDomFromLayout();
            renderSidebar();
            toast('Posiciones por defecto', 'success');
        });
        rootEl.querySelectorAll('.wc-studio__tool').forEach((btn) => {
            btn.addEventListener('click', () => {
                activeTool = btn.dataset.tool || 'select';
                rootEl.querySelectorAll('.wc-studio__tool').forEach((b) => b.classList.toggle('is-active', b === btn));
                renderSidebar();
            });
        });

        const stage = rootEl.querySelector('#wcStudioStage');
        stage.addEventListener('pointerdown', onStagePointerDown);
    }

    function stageScale() {
        const stage = rootEl.querySelector('#wcStudioStage');
        if (!stage) return 1;
        const r = stage.getBoundingClientRect();
        return W / r.width;
    }

    function onStagePointerDown(ev) {
        if (activeTool !== 'bg') return;
        const stage = rootEl.querySelector('#wcStudioStage');
        if (!stage || ev.target.closest('[data-drag]')) return;
        if (!ev.target.closest('#wcStudioStage')) return;
        ev.preventDefault();
        const start = { x: ev.clientX, y: ev.clientY, fx: layout.bgFocalX, fy: layout.bgFocalY };
        const onMove = (e) => {
            const dx = (e.clientX - start.x) / 400;
            const dy = (e.clientY - start.y) / 250;
            layout.bgFocalX = clamp(start.fx - dx, 0, 1);
            layout.bgFocalY = clamp(start.fy - dy, 0, 1);
            syncDomFromLayout();
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }

    function bindLayerDrag(el, key) {
        el.addEventListener('pointerdown', (ev) => {
            if (activeTool === 'bg') return;
            if (key === 'avatar' && activeTool !== 'avatar' && activeTool !== 'select') return;
            if (key === 'title' && activeTool !== 'title' && activeTool !== 'select') return;
            if (key === 'name' && activeTool !== 'name' && activeTool !== 'select') return;
            if (key === 'subtitle' && activeTool !== 'subtitle' && activeTool !== 'select') return;
            if (key === 'overlay' && activeTool !== 'overlay' && activeTool !== 'select') return;

            ev.preventDefault();
            ev.stopPropagation();
            const stage = rootEl.querySelector('#wcStudioStage');
            const sr = stage.getBoundingClientRect();
            const sc = stageScale();
            const start = {
                x: ev.clientX,
                y: ev.clientY,
                layout: { ...layout }
            };

            const onMove = (e) => {
                const dx = (e.clientX - start.x) * sc;
                const dy = (e.clientY - start.y) * sc;
                if (key === 'avatar') {
                    layout.avatarCx = clamp(start.layout.avatarCx + dx, layout.avatarR + 8, W - layout.avatarR - 8);
                    layout.avatarCy = clamp(start.layout.avatarCy + dy, layout.avatarR + 8, H - layout.avatarR - 8);
                } else if (key === 'title') {
                    layout.titleX = clamp(start.layout.titleX + dx, 40, W - 40);
                    layout.titleY = clamp(start.layout.titleY + dy, 20, H - 80);
                } else if (key === 'name') {
                    layout.nameX = clamp(start.layout.nameX + dx, 40, W - 40);
                    layout.nameY = clamp(start.layout.nameY + dy, 20, H - 60);
                } else if (key === 'subtitle') {
                    layout.subtitleX = clamp(start.layout.subtitleX + dx, 40, W - 40);
                    layout.subtitleY = clamp(start.layout.subtitleY + dy, 20, H - 40);
                } else if (key === 'overlay') {
                    layout.overlayX = clamp(start.layout.overlayX + dx, 80, W - 8);
                    layout.overlayY = clamp(start.layout.overlayY + dy, 24, H - 8);
                }
                syncDomFromLayout();
            };
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    function syncDomFromLayout() {
        const bg = rootEl.querySelector('#wcStageBg');
        if (bg) {
            bg.style.backgroundPosition = `${layout.bgFocalX * 100}% ${layout.bgFocalY * 100}%`;
        }

        const av = rootEl.querySelector('#wcLayerAvatar');
        if (av) {
            const r = layout.avatarR;
            av.style.left = `${layout.avatarCx}px`;
            av.style.top = `${layout.avatarCy}px`;
            av.style.width = `${r * 2}px`;
            av.style.height = `${r * 2}px`;
        }

        const ring = rootEl.querySelector('#wcAvatarRing');
        if (ring) {
            const r = layout.avatarR;
            ring.style.width = `${(r + Math.max(3, r * 0.07)) * 2}px`;
            ring.style.height = `${(r + Math.max(3, r * 0.07)) * 2}px`;
        }

        const title = rootEl.querySelector('#wcLayerTitle');
        const name = rootEl.querySelector('#wcLayerName');
        const sub = rootEl.querySelector('#wcLayerSubtitle');
        const ov = rootEl.querySelector('#wcLayerOverlay');
        if (title) {
            title.style.left = `${layout.titleX}px`;
            title.style.top = `${layout.titleY}px`;
        }
        if (name) {
            name.style.left = `${layout.nameX}px`;
            name.style.top = `${layout.nameY}px`;
        }
        if (sub) {
            sub.style.left = `${layout.subtitleX}px`;
            sub.style.top = `${layout.subtitleY}px`;
        }
        if (ov) {
            ov.style.left = 'auto';
            ov.style.top = 'auto';
            ov.style.right = `${W - layout.overlayX}px`;
            ov.style.bottom = `${H - layout.overlayY}px`;
        }
    }

    function applyBgImage(url) {
        const bg = rootEl.querySelector('#wcStageBg');
        if (!bg) return;
        if (url) {
            bg.style.backgroundImage = `url("${url.replace(/"/g, '\\"')}")`;
            bg.style.backgroundSize = 'cover';
        } else {
            bg.style.backgroundImage = 'none';
            bg.style.background = 'linear-gradient(135deg, #38bdf8 0%, #a78bfa 50%, #34d399 100%)';
        }
    }

    function applyTexts(lines) {
        const title = rootEl.querySelector('#wcLayerTitle');
        const name = rootEl.querySelector('#wcLayerName');
        const sub = rootEl.querySelector('#wcLayerSubtitle');
        const ov = rootEl.querySelector('#wcLayerOverlay');
        if (title) title.textContent = lines.title || '';
        if (name) name.textContent = lines.name || '';
        if (sub) sub.textContent = lines.sub || '';
        if (ov) {
            ov.textContent = lines.overlay || '';
            ov.style.display = lines.overlay ? '' : 'none';
        }
    }

    function renderSidebar() {
        const box = rootEl.querySelector('#wcStudioSideContent');
        if (!box) return;

        if (activeTool === 'avatar') {
            box.innerHTML = `
                <label class="wc-studio__label">Radio del avatar (${Math.round(layout.avatarR)} px)</label>
                <input type="range" id="wcAvatarRadius" min="48" max="130" value="${Math.round(layout.avatarR)}" class="wc-studio__range">
                <p class="wc-studio__hint">Arrastra el círculo en el lienzo para moverlo.</p>
            `;
            box.querySelector('#wcAvatarRadius')?.addEventListener('input', (e) => {
                layout.avatarR = Number(e.target.value) || 78;
                syncDomFromLayout();
            });
            return;
        }

        if (activeTool === 'bg') {
            box.innerHTML = `
                <p class="wc-studio__hint">Arrastra sobre el <strong>fondo vacío</strong> (no sobre el avatar ni textos) para desplazar el encuadre.</p>
                <label class="wc-studio__label">Encuadre horizontal</label>
                <input type="range" id="wcBgFx" min="0" max="100" value="${Math.round(layout.bgFocalX * 100)}" class="wc-studio__range">
                <label class="wc-studio__label">Encuadre vertical</label>
                <input type="range" id="wcBgFy" min="0" max="100" value="${Math.round(layout.bgFocalY * 100)}" class="wc-studio__range">
            `;
            box.querySelector('#wcBgFx')?.addEventListener('input', (e) => {
                layout.bgFocalX = (Number(e.target.value) || 0) / 100;
                syncDomFromLayout();
            });
            box.querySelector('#wcBgFy')?.addEventListener('input', (e) => {
                layout.bgFocalY = (Number(e.target.value) || 0) / 100;
                syncDomFromLayout();
            });
            return;
        }

        box.innerHTML = `
            <p class="wc-studio__hint">Herramienta: <strong>${activeTool}</strong>. Arrastra el elemento en el lienzo o elige otra herramienta en la barra izquierda.</p>
        `;
    }

    function open(opts) {
        optsRef = opts;
        ensureRoot();
        layout = mergeCardLayout(opts.getWelcomeConfig().cardLayout);
        applyBgImage(opts.getBgUrl() || '');
        applyTexts(opts.getPreviewLines());
        const av = opts.getAvatarUrl?.() || '';
        const img = rootEl.querySelector('#wcAvatarImg');
        if (img) {
            img.src = av || 'https://cdn.discordapp.com/embed/avatars/0.png';
        }
        syncDomFromLayout();
        renderSidebar();

        if (!rootEl.dataset.layersBound) {
            rootEl.dataset.layersBound = '1';
            ['avatar', 'title', 'name', 'subtitle', 'overlay'].forEach((k) => {
                const el = rootEl.querySelector(`[data-drag="${k}"]`);
                if (el) bindLayerDrag(el, k);
            });
        }

        rootEl.classList.add('is-open');
        rootEl.setAttribute('aria-hidden', 'false');
        document.body.classList.add('wc-studio-open');
    }

    function close() {
        if (!rootEl) return;
        rootEl.classList.remove('is-open');
        rootEl.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('wc-studio-open');
        optsRef?.onClose?.();
    }

    function saveAndClose() {
        if (optsRef?.applyCardLayout) {
            optsRef.applyCardLayout({ ...layout });
        }
        toast('Diseño aplicado. Pulsa «Guardar Bienvenida» en el panel para enviarlo al servidor.', 'success');
        close();
    }

    win.WelcomeCardStudio = {
        mergeCardLayout,
        open,
        close
    };
})(typeof window !== 'undefined' ? window : globalThis);
