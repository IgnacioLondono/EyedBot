/**
 * Editor visual a pantalla completa para la tarjeta de bienvenida (PNG).
 * Depende de: fetchWithCredentials, showToast, applyWelcomePreviewTemplate, resizeImageFile (app.js).
 */
(function (win) {
    'use strict';

    const W = 920;
    const H = 520;
    const SNAP = 14;

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
    let selectedLayer = null;

    function studioKeyHandler(ev) {
        if (ev.key !== 'Escape') return;
        if (!rootEl?.classList.contains('is-open')) return;
        setSelectedLayer(null);
        clearGuides();
    }

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
                    <p class="wc-studio__subtitle">920×520 px · Guías magenta al centrar · Suelta para fijar.</p>
                </div>
                <div class="wc-studio__actions wc-studio__actions--grow">
                    <input type="file" id="wcStudioBgFile" accept="image/*" class="wc-studio__file-input" aria-hidden="true" tabindex="-1">
                    <button type="button" class="wc-studio__btn wc-studio__btn--accent" id="wcStudioUploadBg" title="Redimensiona, optimiza y sube el fondo">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Subir fondo
                    </button>
                    <span class="wc-studio__upload-status" id="wcStudioUploadStatus" aria-live="polite"></span>
                    <button type="button" class="wc-studio__btn wc-studio__btn--ghost" id="wcStudioReset">Restablecer</button>
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
                    <div class="wc-studio__toolbar-divider" role="separator"></div>
                    <button type="button" class="wc-studio__tool" data-tool="title" title="Título"><span class="wc-studio__tool-letter">T</span></button>
                    <button type="button" class="wc-studio__tool" data-tool="name" title="Línea central"><span class="wc-studio__tool-letter">N</span></button>
                    <button type="button" class="wc-studio__tool" data-tool="subtitle" title="Subtítulo"><span class="wc-studio__tool-letter">S</span></button>
                    <button type="button" class="wc-studio__tool" data-tool="overlay" title="Texto extra"><span class="wc-studio__tool-letter">+</span></button>
                </aside>
                <div class="wc-studio__canvas-wrap">
                    <div class="wc-studio__canvas-scaler">
                        <div class="wc-studio__stage" id="wcStudioStage" style="width:${W}px;height:${H}px;">
                            <div class="wc-stage-bg" id="wcStageBg"></div>
                            <div class="wc-stage-vignette" aria-hidden="true"></div>
                            <div class="wc-layer wc-layer--avatar" id="wcLayerAvatar" data-drag="avatar" tabindex="0" role="button" aria-label="Avatar — arrastra para mover">
                                <div class="wc-avatar-ring" id="wcAvatarRing"></div>
                                <img class="wc-avatar-img" id="wcAvatarImg" alt="" width="160" height="160" draggable="false" />
                            </div>
                            <div class="wc-layer wc-layer--text wc-layer--title" id="wcLayerTitle" data-drag="title" tabindex="0"></div>
                            <div class="wc-layer wc-layer--text wc-layer--name" id="wcLayerName" data-drag="name" tabindex="0"></div>
                            <div class="wc-layer wc-layer--text wc-layer--subtitle" id="wcLayerSubtitle" data-drag="subtitle" tabindex="0"></div>
                            <div class="wc-layer wc-layer--text wc-layer--overlay" id="wcLayerOverlay" data-drag="overlay" tabindex="0"></div>
                            <svg class="wc-studio-guides" id="wcStudioGuides" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"></svg>
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
        document.addEventListener('keydown', studioKeyHandler);
        bindChrome();
        return rootEl;
    }

    function toast(msg, type) {
        if (typeof win.showToast === 'function') win.showToast(msg, type);
    }

    function clearGuides() {
        const svg = rootEl?.querySelector('#wcStudioGuides');
        if (svg) svg.innerHTML = '';
    }

    function renderGuides(verticalXs, horizontalYs) {
        const svg = rootEl?.querySelector('#wcStudioGuides');
        if (!svg) return;
        const parts = [];
        const vset = new Set(verticalXs.filter((x) => Number.isFinite(x)));
        const hset = new Set(horizontalYs.filter((y) => Number.isFinite(y)));
        vset.forEach((x) => {
            parts.push(`<line class="wc-guide-line wc-guide-line--v" x1="${x}" y1="0" x2="${x}" y2="${H}" />`);
        });
        hset.forEach((y) => {
            parts.push(`<line class="wc-guide-line wc-guide-line--h" x1="0" y1="${y}" x2="${W}" y2="${y}" />`);
        });
        if (vset.has(W / 2) && hset.has(H / 2)) {
            parts.push(`<circle class="wc-guide-crosshair" cx="${W / 2}" cy="${H / 2}" r="6" />`);
        }
        svg.innerHTML = parts.join('');
    }

    function snapScalar(val, targets) {
        let best = val;
        let hit = null;
        for (const t of targets) {
            if (Math.abs(val - t) <= SNAP) {
                best = t;
                hit = t;
                break;
            }
        }
        return { value: best, hit };
    }

    /** Alineaciones X compartidas entre textos + centro lienzo + avatar. */
    function snapXForLayer(key, x) {
        const peers = [W / 2];
        if (key !== 'title') peers.push(layout.titleX);
        if (key !== 'name') peers.push(layout.nameX);
        if (key !== 'subtitle') peers.push(layout.subtitleX);
        if (key !== 'avatar') peers.push(layout.avatarCx);
        const r = snapScalar(x, peers);
        const guides = [];
        if (r.hit != null) guides.push(r.hit);
        return { x: r.value, guides };
    }

    function snapYForLayer(key, y) {
        const peers = [H / 2];
        if (key !== 'title') peers.push(layout.titleY);
        if (key !== 'name') peers.push(layout.nameY);
        if (key !== 'subtitle') peers.push(layout.subtitleY);
        if (key !== 'avatar') peers.push(layout.avatarCy);
        const r = snapScalar(y, peers);
        const guides = [];
        if (r.hit != null) guides.push(r.hit);
        return { y: r.value, guides };
    }

    function snapOverlay(x, y) {
        const xTargets = [W - 24, W / 2, 24];
        const yTargets = [H - 20, H / 2, 24];
        const sx = snapScalar(x, xTargets);
        const sy = snapScalar(y, yTargets);
        const gv = sx.hit != null ? [sx.hit] : [];
        const gh = sy.hit != null ? [sy.hit] : [];
        return { x: sx.value, y: sy.value, gv, gh };
    }

    function setSelectedLayer(key) {
        selectedLayer = key;
        rootEl?.querySelectorAll('.wc-layer').forEach((el) => {
            el.classList.toggle('wc-layer--selected', key != null && el.dataset.drag === key);
        });
    }

    function bindChrome() {
        rootEl.querySelector('#wcStudioClose')?.addEventListener('click', close);
        rootEl.querySelector('#wcStudioSave')?.addEventListener('click', saveAndClose);
        rootEl.querySelector('#wcStudioReset')?.addEventListener('click', () => {
            layout = { ...DEFAULT_LAYOUT };
            syncDomFromLayout();
            clearGuides();
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
        stage.addEventListener('pointerdown', (ev) => {
            if (ev.target === stage || ev.target.id === 'wcStageBg' || ev.target.id === 'wcStudioGuides' || ev.target.classList.contains('wc-stage-vignette')) {
                if (activeTool !== 'bg') setSelectedLayer(null);
            }
        });

        const fileInput = rootEl.querySelector('#wcStudioBgFile');
        const uploadBtn = rootEl.querySelector('#wcStudioUploadBg');
        uploadBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', onBackgroundFileSelected);
    }

    async function onBackgroundFileSelected(ev) {
        const file = ev.target.files?.[0];
        ev.target.value = '';
        if (!file || !String(file.type || '').startsWith('image/')) {
            toast('Elige un archivo de imagen', 'warning');
            return;
        }
        const status = rootEl.querySelector('#wcStudioUploadStatus');
        if (!optsRef?.processAndUploadBackground) {
            toast('No hay procesador de imagen disponible.', 'error');
            return;
        }
        if (status) status.textContent = 'Procesando y subiendo…';
        uploadBtnBusy(true);
        try {
            const url = await optsRef.processAndUploadBackground(file);
            applyBgImage(url);
            if (optsRef?.onBackgroundUploaded) optsRef.onBackgroundUploaded(url);
            toast('Fondo procesado y subido', 'success');
            if (status) status.textContent = 'Listo';
        } catch (err) {
            console.error(err);
            toast(err?.message || 'Error al subir el fondo', 'error');
            if (status) status.textContent = '';
        } finally {
            uploadBtnBusy(false);
        }
    }

    function uploadBtnBusy(busy) {
        const b = rootEl?.querySelector('#wcStudioUploadBg');
        if (b) {
            b.disabled = busy;
            b.classList.toggle('is-loading', busy);
        }
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
            setSelectedLayer(key);

            const sc = stageScale();
            const start = {
                x: ev.clientX,
                y: ev.clientY,
                layout: { ...layout }
            };

            const onMove = (e) => {
                const dx = (e.clientX - start.x) * sc;
                const dy = (e.clientY - start.y) * sc;
                const verticalGuides = [];
                const horizontalGuides = [];

                if (key === 'avatar') {
                    let cx = clamp(start.layout.avatarCx + dx, layout.avatarR + 8, W - layout.avatarR - 8);
                    let cy = clamp(start.layout.avatarCy + dy, layout.avatarR + 8, H - layout.avatarR - 8);
                    const sx = snapXForLayer('avatar', cx);
                    const sy = snapYForLayer('avatar', cy);
                    cx = sx.x;
                    cy = sy.y;
                    verticalGuides.push(...sx.guides);
                    horizontalGuides.push(...sy.guides);
                    layout.avatarCx = cx;
                    layout.avatarCy = cy;
                } else if (key === 'title') {
                    let tx = clamp(start.layout.titleX + dx, 40, W - 40);
                    let ty = clamp(start.layout.titleY + dy, 16, H - 100);
                    const sx = snapXForLayer('title', tx);
                    const sy = snapYForLayer('title', ty);
                    tx = sx.x;
                    ty = sy.y;
                    verticalGuides.push(...sx.guides);
                    horizontalGuides.push(...sy.guides);
                    layout.titleX = tx;
                    layout.titleY = ty;
                } else if (key === 'name') {
                    let nx = clamp(start.layout.nameX + dx, 40, W - 40);
                    let ny = clamp(start.layout.nameY + dy, 16, H - 80);
                    const sx = snapXForLayer('name', nx);
                    const sy = snapYForLayer('name', ny);
                    nx = sx.x;
                    ny = sy.y;
                    verticalGuides.push(...sx.guides);
                    horizontalGuides.push(...sy.guides);
                    layout.nameX = nx;
                    layout.nameY = ny;
                } else if (key === 'subtitle') {
                    let sx0 = clamp(start.layout.subtitleX + dx, 40, W - 40);
                    let sy0 = clamp(start.layout.subtitleY + dy, 16, H - 36);
                    const sx = snapXForLayer('subtitle', sx0);
                    const sy = snapYForLayer('subtitle', sy0);
                    sx0 = sx.x;
                    sy0 = sy.y;
                    verticalGuides.push(...sx.guides);
                    horizontalGuides.push(...sy.guides);
                    layout.subtitleX = sx0;
                    layout.subtitleY = sy0;
                } else if (key === 'overlay') {
                    let ox = clamp(start.layout.overlayX + dx, 48, W - 4);
                    let oy = clamp(start.layout.overlayY + dy, 18, H - 4);
                    const so = snapOverlay(ox, oy);
                    ox = so.x;
                    oy = so.y;
                    verticalGuides.push(...so.gv);
                    horizontalGuides.push(...so.gh);
                    layout.overlayX = ox;
                    layout.overlayY = oy;
                }

                syncDomFromLayout();
                renderGuides(verticalGuides, horizontalGuides);
            };
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                clearGuides();
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
            bg.style.background = '';
            bg.style.backgroundImage = `url("${url.replace(/"/g, '\\"')}")`;
            bg.style.backgroundSize = 'cover';
            bg.style.backgroundRepeat = 'no-repeat';
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
                <p class="wc-studio__hint">Al mover, las <strong>líneas magenta</strong> marcan centro del lienzo o alineación con otros textos.</p>
            `;
            box.querySelector('#wcAvatarRadius')?.addEventListener('input', (e) => {
                layout.avatarR = Number(e.target.value) || 78;
                syncDomFromLayout();
            });
            return;
        }

        if (activeTool === 'bg') {
            box.innerHTML = `
                <p class="wc-studio__hint">Arrastra el <strong>fondo</strong> (zona sin capas) o usa los sliders.</p>
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
            <p class="wc-studio__hint">Herramienta <strong>${activeTool}</strong>. Guías <strong>magenta</strong> al centrar o alinear con otra capa. <strong>Esc</strong> quita la selección.</p>
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
        clearGuides();
        syncDomFromLayout();
        renderSidebar();
        setSelectedLayer(null);
        const st = rootEl.querySelector('#wcStudioUploadStatus');
        if (st) st.textContent = '';

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
        clearGuides();
        setSelectedLayer(null);
        rootEl.classList.remove('is-open');
        rootEl.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('wc-studio-open');
        optsRef?.onClose?.();
    }

    function saveAndClose() {
        clearGuides();
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
