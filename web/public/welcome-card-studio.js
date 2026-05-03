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
    let canvasUserZoomPct = 100;

    function applyCanvasUserZoom() {
        if (rootEl) rootEl.style.setProperty('--wc-user-zoom', String(canvasUserZoomPct / 100));
    }

    function hideContextMenu() {
        const menu = rootEl?.querySelector('#wcContextMenu');
        if (!menu) return;
        menu.hidden = true;
        menu.innerHTML = '';
    }

    function studioKeyHandler(ev) {
        if (ev.key !== 'Escape') return;
        if (!rootEl?.classList.contains('is-open')) return;
        const menu = rootEl.querySelector('#wcContextMenu');
        if (menu && !menu.hidden) {
            hideContextMenu();
            return;
        }
        setSelectedLayer(null);
        clearGuides();
    }

    const LAYER_LABELS = {
        avatar: 'Avatar',
        title: 'Título',
        name: 'Nombre / línea central',
        subtitle: 'Subtítulo',
        overlay: 'Texto extra (esquina)'
    };

    function setActiveTool(tool) {
        activeTool = tool || 'select';
        rootEl?.querySelectorAll('.wc-studio__tool').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.tool === activeTool);
        });
        renderSidebar();
    }

    function resetLayerToDefault(key) {
        const d = DEFAULT_LAYOUT;
        if (key === 'avatar') {
            layout.avatarCx = d.avatarCx;
            layout.avatarCy = d.avatarCy;
            layout.avatarR = d.avatarR;
        } else if (key === 'title') {
            layout.titleX = d.titleX;
            layout.titleY = d.titleY;
        } else if (key === 'name') {
            layout.nameX = d.nameX;
            layout.nameY = d.nameY;
        } else if (key === 'subtitle') {
            layout.subtitleX = d.subtitleX;
            layout.subtitleY = d.subtitleY;
        } else if (key === 'overlay') {
            layout.overlayX = d.overlayX;
            layout.overlayY = d.overlayY;
        }
        syncDomFromLayout();
    }

    function centerLayerX(key) {
        const cx = W / 2;
        if (key === 'title') layout.titleX = cx;
        else if (key === 'name') layout.nameX = cx;
        else if (key === 'subtitle') layout.subtitleX = cx;
        else if (key === 'overlay') layout.overlayX = cx;
        else if (key === 'avatar') layout.avatarCx = cx;
        syncDomFromLayout();
    }

    function centerLayerY(key) {
        if (key === 'title') layout.titleY = Math.round(H * 0.36);
        else if (key === 'name') layout.nameY = Math.round(H * 0.48);
        else if (key === 'subtitle') layout.subtitleY = Math.round(H * 0.6);
        else if (key === 'avatar') layout.avatarCy = Math.round(H * 0.32);
        else if (key === 'overlay') layout.overlayY = H - 36;
        syncDomFromLayout();
    }

    function nudgeLayer(key, dx, dy) {
        if (key === 'avatar') {
            layout.avatarCx = clamp(layout.avatarCx + dx, layout.avatarR + 8, W - layout.avatarR - 8);
            layout.avatarCy = clamp(layout.avatarCy + dy, layout.avatarR + 8, H - layout.avatarR - 8);
        } else if (key === 'title') {
            layout.titleX = clamp(layout.titleX + dx, 40, W - 40);
            layout.titleY = clamp(layout.titleY + dy, 16, H - 100);
        } else if (key === 'name') {
            layout.nameX = clamp(layout.nameX + dx, 40, W - 40);
            layout.nameY = clamp(layout.nameY + dy, 16, H - 80);
        } else if (key === 'subtitle') {
            layout.subtitleX = clamp(layout.subtitleX + dx, 40, W - 40);
            layout.subtitleY = clamp(layout.subtitleY + dy, 16, H - 36);
        } else if (key === 'overlay') {
            layout.overlayX = clamp(layout.overlayX + dx, 48, W - 4);
            layout.overlayY = clamp(layout.overlayY + dy, 18, H - 4);
        }
        syncDomFromLayout();
    }

    function distributeTextsVertically() {
        const cx = W / 2;
        layout.titleX = cx;
        layout.nameX = cx;
        layout.subtitleX = cx;
        layout.titleY = 218;
        layout.nameY = 292;
        layout.subtitleY = 366;
        syncDomFromLayout();
        toast('Textos distribuidos en vertical', 'success');
    }

    function mirrorLayoutHorizontal() {
        layout.titleX = W - layout.titleX;
        layout.nameX = W - layout.nameX;
        layout.subtitleX = W - layout.subtitleX;
        layout.avatarCx = W - layout.avatarCx;
        layout.overlayX = W - layout.overlayX;
        syncDomFromLayout();
        toast('Diseño reflejado en horizontal', 'success');
    }

    function setBgFocal(fx, fy) {
        layout.bgFocalX = clamp(Number(fx) || 0.5, 0, 1);
        layout.bgFocalY = clamp(Number(fy) || 0.5, 0, 1);
        syncDomFromLayout();
        renderSidebar();
    }

    function flashCenterGuides() {
        renderGuides([W / 2], [H / 2]);
        window.setTimeout(() => {
            if (rootEl?.classList.contains('is-open')) clearGuides();
        }, 1400);
    }

    async function copyLayoutJson() {
        try {
            await navigator.clipboard.writeText(JSON.stringify(layout, null, 2));
            toast('Posiciones copiadas al portapapeles (JSON)', 'success');
        } catch {
            toast('No se pudo copiar (permiso del navegador)', 'error');
        }
    }

    async function pasteLayoutJson() {
        try {
            const raw = await navigator.clipboard.readText();
            const parsed = JSON.parse(raw);
            layout = mergeCardLayout(parsed);
            syncDomFromLayout();
            renderSidebar();
            toast('Posiciones pegadas desde JSON', 'success');
        } catch {
            toast('Portapapeles vacío o JSON inválido', 'error');
        }
    }

    function buildContextMenuHtml(layerKey) {
        const layerLabel = layerKey ? LAYER_LABELS[layerKey] || layerKey : null;
        const layerBlock =
            layerKey && layerLabel
                ? `
            <div class="wc-ctx__heading">Capa: ${layerLabel}</div>
            <button type="button" class="wc-ctx__item" data-action="layer-select" data-layer="${layerKey}">Seleccionar esta capa</button>
            <button type="button" class="wc-ctx__item" data-action="layer-center-x" data-layer="${layerKey}">Centrar en horizontal (X)</button>
            <button type="button" class="wc-ctx__item" data-action="layer-center-y" data-layer="${layerKey}">Centrar en vertical (Y sugerido)</button>
            <button type="button" class="wc-ctx__item" data-action="layer-reset" data-layer="${layerKey}">Restaurar posición por defecto de la capa</button>
            <div class="wc-ctx__subhead">Mover la capa (px)</div>
            <div class="wc-ctx__grid4">
                <button type="button" class="wc-ctx__mini" data-action="nudge" data-layer="${layerKey}" data-dx="0" data-dy="-10">↑</button>
                <button type="button" class="wc-ctx__mini" data-action="nudge" data-layer="${layerKey}" data-dx="-10" data-dy="0">←</button>
                <button type="button" class="wc-ctx__mini" data-action="nudge" data-layer="${layerKey}" data-dx="10" data-dy="0">→</button>
                <button type="button" class="wc-ctx__mini" data-action="nudge" data-layer="${layerKey}" data-dx="0" data-dy="10">↓</button>
            </div>
            <div class="wc-ctx__grid4">
                <button type="button" class="wc-ctx__mini" data-action="nudge" data-layer="${layerKey}" data-dx="0" data-dy="-1">▴</button>
                <button type="button" class="wc-ctx__mini" data-action="nudge" data-layer="${layerKey}" data-dx="-1" data-dy="0">◂</button>
                <button type="button" class="wc-ctx__mini" data-action="nudge" data-layer="${layerKey}" data-dx="1" data-dy="0">▸</button>
                <button type="button" class="wc-ctx__mini" data-action="nudge" data-layer="${layerKey}" data-dx="0" data-dy="1">▾</button>
            </div>
            <div class="wc-ctx__sep"></div>`
                : `
            <div class="wc-ctx__hint">Clic derecho sobre una capa para opciones de esa capa.</div>
            <div class="wc-ctx__sep"></div>`;

        return `
            <div class="wc-ctx__heading">Herramientas</div>
            <button type="button" class="wc-ctx__item" data-action="tool-select">Seleccionar y mover capas</button>
            <button type="button" class="wc-ctx__item" data-action="tool-avatar">Solo avatar (radio y arrastre)</button>
            <button type="button" class="wc-ctx__item" data-action="tool-bg">Encuadre del fondo</button>
            <div class="wc-ctx__sep"></div>
            ${layerBlock}
            <div class="wc-ctx__heading">Alineación global</div>
            <button type="button" class="wc-ctx__item" data-action="align-texts-x">Centrar textos en horizontal</button>
            <button type="button" class="wc-ctx__item" data-action="stack-texts">Apilar título · nombre · subtítulo</button>
            <button type="button" class="wc-ctx__item" data-action="distribute-texts-y">Distribuir textos en vertical (3 bandas)</button>
            <button type="button" class="wc-ctx__item" data-action="center-avatar">Centrar avatar en el lienzo</button>
            <button type="button" class="wc-ctx__item" data-action="mirror-h">Reflejar todo en horizontal (espejo)</button>
            <div class="wc-ctx__sep"></div>
            <div class="wc-ctx__heading">Avatar — tamaño rápido</div>
            <div class="wc-ctx__row">
                <button type="button" class="wc-ctx__pill" data-action="avatar-r" data-r="56">S</button>
                <button type="button" class="wc-ctx__pill" data-action="avatar-r" data-r="72">M</button>
                <button type="button" class="wc-ctx__pill" data-action="avatar-r" data-r="88">L</button>
                <button type="button" class="wc-ctx__pill" data-action="avatar-r" data-r="104">XL</button>
            </div>
            <div class="wc-ctx__sep"></div>
            <div class="wc-ctx__heading">Fondo — punto de encuadre</div>
            <button type="button" class="wc-ctx__item" data-action="bg-focal" data-fx="0.5" data-fy="0.5">Centro</button>
            <div class="wc-ctx__row2">
                <button type="button" class="wc-ctx__pill" data-action="bg-focal" data-fx="0" data-fy="0">↖</button>
                <button type="button" class="wc-ctx__pill" data-action="bg-focal" data-fx="0.5" data-fy="0">↑</button>
                <button type="button" class="wc-ctx__pill" data-action="bg-focal" data-fx="1" data-fy="0">↗</button>
            </div>
            <div class="wc-ctx__row2">
                <button type="button" class="wc-ctx__pill" data-action="bg-focal" data-fx="0" data-fy="0.5">←</button>
                <button type="button" class="wc-ctx__pill" data-action="bg-focal" data-fx="1" data-fy="0.5">→</button>
            </div>
            <div class="wc-ctx__row2">
                <button type="button" class="wc-ctx__pill" data-action="bg-focal" data-fx="0" data-fy="1">↙</button>
                <button type="button" class="wc-ctx__pill" data-action="bg-focal" data-fx="0.5" data-fy="1">↓</button>
                <button type="button" class="wc-ctx__pill" data-action="bg-focal" data-fx="1" data-fy="1">↘</button>
            </div>
            <div class="wc-ctx__sep"></div>
            <div class="wc-ctx__heading">Zoom del lienzo</div>
            <div class="wc-ctx__row">
                <button type="button" class="wc-ctx__pill" data-action="zoom" data-z="70">70%</button>
                <button type="button" class="wc-ctx__pill" data-action="zoom" data-z="85">85%</button>
                <button type="button" class="wc-ctx__pill" data-action="zoom" data-z="100">100%</button>
                <button type="button" class="wc-ctx__pill" data-action="zoom" data-z="115">115%</button>
                <button type="button" class="wc-ctx__pill" data-action="zoom" data-z="130">130%</button>
            </div>
            <div class="wc-ctx__sep"></div>
            <div class="wc-ctx__heading">Portapapeles</div>
            <button type="button" class="wc-ctx__item" data-action="copy-layout">Copiar posiciones (JSON)</button>
            <button type="button" class="wc-ctx__item" data-action="paste-layout">Pegar posiciones (JSON)</button>
            <div class="wc-ctx__sep"></div>
            <div class="wc-ctx__heading">Guías y vista</div>
            <button type="button" class="wc-ctx__item" data-action="flash-guides">Mostrar cruz en centro (1,4 s)</button>
            <button type="button" class="wc-ctx__item" data-action="clear-selection">Quitar selección de capa (Esc)</button>
            <div class="wc-ctx__sep"></div>
            <div class="wc-ctx__heading">Archivo y editor</div>
            <button type="button" class="wc-ctx__item" data-action="upload-bg">Subir imagen de fondo…</button>
            <button type="button" class="wc-ctx__item wc-ctx__item--warn" data-action="reset-all">Restablecer todo el diseño</button>
            <button type="button" class="wc-ctx__item wc-ctx__item--accent" data-action="save-design">Guardar diseño y volver</button>
            <button type="button" class="wc-ctx__item" data-action="close-studio">Cerrar sin guardar cambios del lienzo</button>
            <p class="wc-ctx__foot">Clic fuera o Esc cierra este menú.</p>
        `;
    }

    function positionContextMenu(menu, clientX, clientY) {
        menu.style.left = '0px';
        menu.style.top = '0px';
        menu.hidden = false;
        const w = menu.offsetWidth;
        const h = menu.offsetHeight;
        let x = clientX + 2;
        let y = clientY + 2;
        const maxX = window.innerWidth - w - 8;
        const maxY = window.innerHeight - h - 8;
        if (x > maxX) x = Math.max(8, maxX);
        if (y > maxY) y = Math.max(8, maxY);
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }

    function showContextMenu(clientX, clientY, layerKey) {
        const menu = rootEl?.querySelector('#wcContextMenu');
        if (!menu) return;
        menu.innerHTML = buildContextMenuHtml(layerKey);
        positionContextMenu(menu, clientX, clientY);
        menu.focus({ preventScroll: true });
    }

    function runContextAction(btn) {
        const action = btn.dataset.action;
        const layer = btn.dataset.layer;

        switch (action) {
            case 'tool-select':
                setActiveTool('select');
                break;
            case 'tool-avatar':
                setActiveTool('avatar');
                break;
            case 'tool-bg':
                setActiveTool('bg');
                break;
            case 'layer-select':
                if (layer) setSelectedLayer(layer);
                break;
            case 'layer-center-x':
                if (layer) centerLayerX(layer);
                break;
            case 'layer-center-y':
                if (layer) centerLayerY(layer);
                break;
            case 'layer-reset':
                if (layer) {
                    resetLayerToDefault(layer);
                    toast('Capa restaurada', 'success');
                }
                break;
            case 'nudge':
                if (layer) {
                    nudgeLayer(layer, Number(btn.dataset.dx) || 0, Number(btn.dataset.dy) || 0);
                }
                break;
            case 'align-texts-x':
                centerTextsX();
                break;
            case 'stack-texts':
                stackTitleNameSubtitle();
                break;
            case 'distribute-texts-y':
                distributeTextsVertically();
                break;
            case 'center-avatar':
                centerAvatarOnCanvas();
                break;
            case 'mirror-h':
                mirrorLayoutHorizontal();
                break;
            case 'avatar-r': {
                const r = Number(btn.dataset.r);
                if (Number.isFinite(r)) {
                    layout.avatarR = clamp(r, 36, 150);
                    syncDomFromLayout();
                    renderSidebar();
                    toast(`Radio del avatar: ${Math.round(layout.avatarR)} px`, 'success');
                }
                break;
            }
            case 'bg-focal':
                setBgFocal(btn.dataset.fx, btn.dataset.fy);
                toast('Encuadre del fondo actualizado', 'success');
                break;
            case 'zoom': {
                const z = Number(btn.dataset.z);
                if (Number.isFinite(z)) {
                    canvasUserZoomPct = clamp(z, 55, 130);
                    applyCanvasUserZoom();
                    renderSidebar();
                }
                break;
            }
            case 'copy-layout':
                copyLayoutJson();
                break;
            case 'paste-layout':
                pasteLayoutJson();
                break;
            case 'flash-guides':
                flashCenterGuides();
                break;
            case 'clear-selection':
                setSelectedLayer(null);
                clearGuides();
                break;
            case 'upload-bg':
                rootEl?.querySelector('#wcStudioBgFile')?.click();
                break;
            case 'reset-all':
                layout = { ...DEFAULT_LAYOUT };
                canvasUserZoomPct = 100;
                applyCanvasUserZoom();
                syncDomFromLayout();
                clearGuides();
                renderSidebar();
                toast('Diseño restablecido', 'success');
                break;
            case 'save-design':
                saveAndClose();
                break;
            case 'close-studio':
                close();
                break;
            default:
                break;
        }
    }

    function onStudioContextMenu(ev) {
        if (!rootEl?.classList.contains('is-open')) return;
        if (ev.target.closest('#wcStudioSidebar')) return;
        if (ev.target.closest('#wcContextMenu')) return;
        ev.preventDefault();
        const layerEl = ev.target.closest('[data-drag]');
        const layerKey = layerEl?.dataset?.drag && LAYER_LABELS[layerEl.dataset.drag] ? layerEl.dataset.drag : null;
        showContextMenu(ev.clientX, ev.clientY, layerKey);
    }

    function onDocumentClickCloseContext(ev) {
        if (!rootEl?.classList.contains('is-open')) return;
        const menu = rootEl.querySelector('#wcContextMenu');
        if (!menu || menu.hidden) return;
        if (menu.contains(ev.target)) return;
        hideContextMenu();
    }

    function onContextMenuClick(ev) {
        const menu = rootEl?.querySelector('#wcContextMenu');
        if (!menu || menu.hidden) return;
        const btn = ev.target.closest('button[data-action]');
        if (!btn || !menu.contains(btn)) return;
        ev.preventDefault();
        ev.stopPropagation();
        runContextAction(btn);
        hideContextMenu();
    }

    function bindContextMenuShell() {
        if (rootEl.dataset.ctxMenuBound) return;
        rootEl.dataset.ctxMenuBound = '1';
        rootEl.addEventListener('contextmenu', onStudioContextMenu);
        rootEl.addEventListener('click', onContextMenuClick);
        rootEl.addEventListener('pointerdown', (ev) => {
            if (ev.target.closest('#wcContextMenu')) ev.stopPropagation();
        }, true);
        document.addEventListener('click', onDocumentClickCloseContext, true);
        window.addEventListener('resize', hideContextMenu);
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
                </aside>
                <div class="wc-studio__canvas-wrap">
                    <div class="wc-studio__zoom-outer" id="wcStudioZoomOuter">
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
                </div>
                <aside class="wc-studio__sidebar" id="wcStudioSidebar">
                    <h3 class="wc-studio__side-title">Propiedades</h3>
                    <div id="wcStudioSideContent" class="wc-studio__side-content"></div>
                </aside>
            </div>
            <div id="wcContextMenu" class="wc-ctx" role="menu" aria-label="Menú contextual del editor" hidden tabindex="-1"></div>
        `;
        document.body.appendChild(rootEl);
        applyCanvasUserZoom();
        document.addEventListener('keydown', studioKeyHandler);
        bindChrome();
        bindContextMenuShell();
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
            canvasUserZoomPct = 100;
            applyCanvasUserZoom();
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
            if (ev.pointerType === 'mouse' && ev.button !== 0) return;
            if (activeTool === 'bg') return;
            if (activeTool === 'avatar' && key !== 'avatar') return;

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

    function sidebarEditBlock() {
        return `
            <div class="wc-studio__edit-block">
                <h4 class="wc-studio__edit-heading">Edición rápida</h4>
                <div class="wc-studio__btn-stack">
                    <button type="button" class="wc-studio__side-btn" id="wcAlignTextsX">Centrar textos (horizontal)</button>
                    <button type="button" class="wc-studio__side-btn" id="wcStackTexts">Apilar título · nombre · subtítulo</button>
                    <button type="button" class="wc-studio__side-btn" id="wcAlignAvatar">Centrar avatar en el lienzo</button>
                </div>
                <label class="wc-studio__label" for="wcCanvasZoom">Zoom del lienzo (${canvasUserZoomPct}%)</label>
                <input type="range" id="wcCanvasZoom" min="55" max="130" value="${canvasUserZoomPct}" class="wc-studio__range">
            </div>
        `;
    }

    function centerTextsX() {
        const cx = W / 2;
        layout.titleX = cx;
        layout.nameX = cx;
        layout.subtitleX = cx;
        syncDomFromLayout();
        toast('Textos centrados en X', 'success');
    }

    function stackTitleNameSubtitle() {
        const cx = W / 2;
        layout.titleX = cx;
        layout.nameX = cx;
        layout.subtitleX = cx;
        layout.titleY = 232;
        layout.nameY = 296;
        layout.subtitleY = 352;
        syncDomFromLayout();
        toast('Bloque de textos reapilado', 'success');
    }

    function centerAvatarOnCanvas() {
        layout.avatarCx = W / 2;
        layout.avatarCy = Math.round(H * 0.32);
        syncDomFromLayout();
        toast('Avatar centrado', 'success');
    }

    function bindSidebarCommonActions(box) {
        box.querySelector('#wcAlignTextsX')?.addEventListener('click', centerTextsX);
        box.querySelector('#wcStackTexts')?.addEventListener('click', stackTitleNameSubtitle);
        box.querySelector('#wcAlignAvatar')?.addEventListener('click', centerAvatarOnCanvas);
        const z = box.querySelector('#wcCanvasZoom');
        const zLabel = box.querySelector('label[for="wcCanvasZoom"]');
        z?.addEventListener('input', (e) => {
            canvasUserZoomPct = Number(e.target.value) || 100;
            applyCanvasUserZoom();
            if (zLabel) zLabel.textContent = `Zoom del lienzo (${canvasUserZoomPct}%)`;
        });
    }

    function renderSidebar() {
        const box = rootEl.querySelector('#wcStudioSideContent');
        if (!box) return;

        if (activeTool === 'avatar') {
            box.innerHTML = `
                ${sidebarEditBlock()}
                <label class="wc-studio__label">Radio del avatar (${Math.round(layout.avatarR)} px)</label>
                <input type="range" id="wcAvatarRadius" min="48" max="130" value="${Math.round(layout.avatarR)}" class="wc-studio__range">
                <p class="wc-studio__hint">Con esta herramienta solo se arrastra el <strong>avatar</strong>. Guías <strong>magenta</strong> al alinear.</p>
            `;
            bindSidebarCommonActions(box);
            box.querySelector('#wcAvatarRadius')?.addEventListener('input', (e) => {
                layout.avatarR = Number(e.target.value) || 78;
                syncDomFromLayout();
            });
            return;
        }

        if (activeTool === 'bg') {
            box.innerHTML = `
                ${sidebarEditBlock()}
                <p class="wc-studio__hint">Arrastra el <strong>fondo</strong> (zona sin capas) o usa los sliders.</p>
                <label class="wc-studio__label">Encuadre horizontal</label>
                <input type="range" id="wcBgFx" min="0" max="100" value="${Math.round(layout.bgFocalX * 100)}" class="wc-studio__range">
                <label class="wc-studio__label">Encuadre vertical</label>
                <input type="range" id="wcBgFy" min="0" max="100" value="${Math.round(layout.bgFocalY * 100)}" class="wc-studio__range">
            `;
            bindSidebarCommonActions(box);
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
            ${sidebarEditBlock()}
            <p class="wc-studio__hint">Arrastra cualquier capa (título, nombre, subtítulo, texto extra, avatar). Guías <strong>magenta</strong> al centrar. <strong>Esc</strong> quita la selección.</p>
        `;
        bindSidebarCommonActions(box);
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
        canvasUserZoomPct = 100;
        applyCanvasUserZoom();
        activeTool = 'select';
        rootEl.querySelectorAll('.wc-studio__tool').forEach((b) => b.classList.toggle('is-active', b.dataset.tool === 'select'));
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
        hideContextMenu();
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
