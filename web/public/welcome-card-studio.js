/**
 * Editor visual a pantalla completa para la tarjeta de bienvenida (PNG).
 * Depende de: fetchWithCredentials, showToast, applyWelcomePreviewTemplate, resizeImageFile (app.js).
 */
(function (win) {
    'use strict';

    const W = 920;
    const H = 520;
    const SNAP = 14;
    const DRAG_THRESHOLD = 8;

    const LAYER_TO_RAW = {
        title: 'title',
        name: 'cardNameTemplate',
        subtitle: 'message',
        overlay: 'cardOverlayText'
    };

    let editingTextLayer = null;
    let textPreviewDebounceTimer = null;

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
    let rightPanelTab = 'layers';
    let snapEnabled = true;
    let showGrid = false;
    let showSafeZone = true;
    const layerHidden = new Set();
    const layerLocked = new Set();
    let historyPast = [];
    let historyFuture = [];
    const HISTORY_MAX = 48;
    let historyDragSnapshot = null;

    const LAYER_ORDER = ['overlay', 'subtitle', 'name', 'title', 'avatar'];
    const LAYER_ICONS = { avatar: '👤', title: 'T', name: 'N', subtitle: 'S', overlay: '◇' };

    const LAYOUT_PRESETS = {
        classic: {
            label: 'Centrado clásico',
            layout: { ...DEFAULT_LAYOUT }
        },
        hero: {
            label: 'Avatar destacado',
            layout: {
                ...DEFAULT_LAYOUT,
                avatarCy: 140,
                titleY: 248,
                nameY: 312,
                subtitleY: 368
            }
        },
        lower: {
            label: 'Textos abajo',
            layout: {
                ...DEFAULT_LAYOUT,
                avatarCy: 120,
                titleY: 300,
                nameY: 352,
                subtitleY: 400,
                bgFocalY: 0.35
            }
        },
        corner: {
            label: 'Esquina dinámica',
            layout: {
                ...DEFAULT_LAYOUT,
                avatarCx: 180,
                avatarCy: 160,
                titleX: 520,
                titleY: 200,
                nameX: 520,
                nameY: 268,
                subtitleX: 520,
                subtitleY: 330,
                overlayX: 880,
                overlayY: 480
            }
        }
    };

    function applyCanvasUserZoom() {
        if (rootEl) rootEl.style.setProperty('--wc-user-zoom', String(canvasUserZoomPct / 100));
    }

    function hideTextFormatMenu() {
        const m = rootEl?.querySelector('#wcTextFormatMenu');
        if (!m) return;
        m.hidden = true;
        m.innerHTML = '';
    }

    function hideContextMenu() {
        hideTextFormatMenu();
        const menu = rootEl?.querySelector('#wcContextMenu');
        if (!menu) return;
        menu.hidden = true;
        menu.innerHTML = '';
    }

    function recordHistoryBeforeChange() {
        historyPast.push(JSON.stringify(layout));
        if (historyPast.length > HISTORY_MAX) historyPast.shift();
        historyFuture = [];
        updateHistoryButtons();
    }

    function undoHistory() {
        if (!historyPast.length) {
            toast('No hay más pasos para deshacer', 'warning');
            return;
        }
        historyFuture.push(JSON.stringify(layout));
        layout = mergeCardLayout(JSON.parse(historyPast.pop()));
        syncDomFromLayout({ skipHistory: true });
        renderRightPanel();
        updateHistoryButtons();
        toast('Deshecho', 'success');
    }

    function redoHistory() {
        if (!historyFuture.length) {
            toast('No hay más pasos para rehacer', 'warning');
            return;
        }
        historyPast.push(JSON.stringify(layout));
        layout = mergeCardLayout(JSON.parse(historyFuture.pop()));
        syncDomFromLayout({ skipHistory: true });
        renderRightPanel();
        updateHistoryButtons();
        toast('Rehecho', 'success');
    }

    function updateHistoryButtons() {
        const undoBtn = rootEl?.querySelector('#wcStudioUndo');
        const redoBtn = rootEl?.querySelector('#wcStudioRedo');
        if (undoBtn) undoBtn.disabled = historyPast.length === 0;
        if (redoBtn) redoBtn.disabled = historyFuture.length === 0;
    }

    function resetHistory() {
        historyPast = [];
        historyFuture = [];
        updateHistoryButtons();
    }

    function applyLayoutPreset(key) {
        const preset = LAYOUT_PRESETS[key];
        if (!preset) return;
        recordHistoryBeforeChange();
        layout = mergeCardLayout(preset.layout);
        syncDomFromLayout({ skipHistory: true });
        renderRightPanel();
        toast(`Plantilla «${preset.label}» aplicada`, 'success');
    }

    function updateStatusBar() {
        const el = rootEl?.querySelector('#wcStudioStatus');
        if (!el) return;
        const layerLabel = selectedLayer ? LAYER_LABELS[selectedLayer] || selectedLayer : 'Ninguna';
        const toolNames = { select: 'Selección', avatar: 'Avatar', bg: 'Fondo' };
        el.innerHTML = `
            <span>Herramienta: <strong>${toolNames[activeTool] || activeTool}</strong></span>
            <span>Capa: <strong>${layerLabel}</strong></span>
            <span>Encuadre: <strong>${Math.round(layout.bgFocalX * 100)}% · ${Math.round(layout.bgFocalY * 100)}%</strong></span>
            <span>Zoom: <strong>${canvasUserZoomPct}%</strong></span>
        `;
    }

    function updateOverlayToggles() {
        rootEl?.querySelector('#wcToggleGrid')?.classList.toggle('is-on', showGrid);
        rootEl?.querySelector('#wcToggleSafe')?.classList.toggle('is-on', showSafeZone);
        rootEl?.querySelector('#wcToggleSnap')?.classList.toggle('is-on', snapEnabled);
        rootEl?.querySelector('#wcStudioGrid')?.classList.toggle('is-visible', showGrid);
        rootEl?.querySelector('#wcStudioSafe')?.classList.toggle('is-visible', showSafeZone);
    }

    function studioKeyHandler(ev) {
        if (!rootEl?.classList.contains('is-open')) return;

        const mod = ev.ctrlKey || ev.metaKey;
        if (mod && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
            ev.preventDefault();
            undoHistory();
            return;
        }
        if (mod && (ev.key.toLowerCase() === 'y' || (ev.key.toLowerCase() === 'z' && ev.shiftKey))) {
            ev.preventDefault();
            redoHistory();
            return;
        }
        if (mod && ev.key.toLowerCase() === 's') {
            ev.preventDefault();
            saveAndClose();
            return;
        }

        if (selectedLayer && !editingTextLayer && !ev.target.closest('input, textarea, select, [contenteditable="true"]')) {
            const step = ev.shiftKey ? 10 : 1;
            if (ev.key === 'ArrowLeft') {
                ev.preventDefault();
                recordHistoryBeforeChange();
                nudgeLayer(selectedLayer, -step, 0);
                return;
            }
            if (ev.key === 'ArrowRight') {
                ev.preventDefault();
                recordHistoryBeforeChange();
                nudgeLayer(selectedLayer, step, 0);
                return;
            }
            if (ev.key === 'ArrowUp') {
                ev.preventDefault();
                recordHistoryBeforeChange();
                nudgeLayer(selectedLayer, 0, -step);
                return;
            }
            if (ev.key === 'ArrowDown') {
                ev.preventDefault();
                recordHistoryBeforeChange();
                nudgeLayer(selectedLayer, 0, step);
                return;
            }
        }

        if (ev.key !== 'Escape') return;
        const tfm = rootEl.querySelector('#wcTextFormatMenu');
        if (tfm && !tfm.hidden) {
            hideTextFormatMenu();
            return;
        }
        const menu = rootEl.querySelector('#wcContextMenu');
        if (menu && !menu.hidden) {
            hideContextMenu();
            return;
        }
        if (editingTextLayer) {
            commitActiveTextEditIfAny();
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

    const WC_SWATCH_COLORS = ['ffffff', 'f8fafc', 'fca5a5', 'fdba74', 'fde047', '4ade80', '22d3ee', '60a5fa', 'a78bfa', 'f472b6', 'e2e8f0', '334155'];

    function parseMarkupSegs(input) {
        const s = String(input ?? '');
        const segments = [];
        let color = null;
        let buf = '';
        const flush = () => {
            if (!buf) return;
            segments.push({ text: buf, color });
            buf = '';
        };
        const re = /\[\[#([0-9a-fA-F]{6})\]\]|\[\[\/\]\]/gi;
        let last = 0;
        let m;
        while ((m = re.exec(s)) !== null) {
            buf += s.slice(last, m.index);
            if (m[0].toLowerCase().startsWith('[[#')) {
                flush();
                color = m[1].toLowerCase();
            } else {
                flush();
                color = null;
            }
            last = m.index + m[0].length;
        }
        buf += s.slice(last);
        flush();
        return segments.length ? segments : [{ text: s, color: null }];
    }

    function stripColorMarkup(input) {
        return String(input || '')
            .replace(/\[\[#([0-9a-fA-F]{6})\]\]/gi, '')
            .replace(/\[\[\/\]\]/g, '');
    }

    function escHtml(t) {
        return String(t)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function markupToHtml(src) {
        return parseMarkupSegs(src)
            .map((seg) => {
                const inner = escHtml(seg.text || '').replace(/\n/g, '<br>');
                if (seg.color && /^[0-9a-f]{6}$/i.test(seg.color)) {
                    const h = seg.color.toLowerCase();
                    return `<span class="wc-rich" data-wc-c="${h}" style="color:#${h}">${inner}</span>`;
                }
                return inner;
            })
            .join('');
    }

    function htmlToMarkup(root) {
        function walk(node) {
            if (node.nodeType === 3) return String(node.textContent || '').replace(/\u00a0/g, ' ');
            if (node.nodeType !== 1) return '';
            const el = node;
            if (el.tagName === 'BR') return '\n';
            if (el.classList && el.classList.contains('wc-rich')) {
                const hex = String(el.getAttribute('data-wc-c') || '').toLowerCase();
                let inner = '';
                for (const c of el.childNodes) inner += walk(c);
                if (/^[0-9a-f]{6}$/.test(hex) && inner) return `[[#${hex}]]${inner}[[/]]`;
                return inner;
            }
            let out = '';
            for (const c of el.childNodes) out += walk(c);
            return out;
        }
        let res = '';
        for (const c of root.childNodes) res += walk(c);
        return res;
    }

    function getEditingTextLayerEl() {
        return editingTextLayer ? rootEl?.querySelector(`[data-drag="${editingTextLayer}"]`) : null;
    }

    function wrapSelectionWithColor(hex) {
        const h = String(hex || '').replace('#', '').toLowerCase();
        if (!/^[0-9a-f]{6}$/.test(h)) return;
        const layer = getEditingTextLayerEl();
        if (!layer) return;
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !layer.contains(sel.anchorNode) || !layer.contains(sel.focusNode)) {
            toast('Selecciona un fragmento de texto primero', 'warning');
            return;
        }
        layer.focus();
        const range = sel.getRangeAt(0);
        const span = document.createElement('span');
        span.className = 'wc-rich';
        span.setAttribute('data-wc-c', h);
        span.style.color = `#${h}`;
        try {
            range.surroundContents(span);
        } catch {
            const frag = range.extractContents();
            span.appendChild(frag);
            range.insertNode(span);
        }
        sel.removeAllRanges();
        const nr = document.createRange();
        nr.selectNodeContents(span);
        nr.collapse(false);
        sel.addRange(nr);
        layer.dispatchEvent(new Event('input', { bubbles: true }));
        toast('Color aplicado al fragmento', 'success');
    }

    function unwrapSelectionColor() {
        const layer = getEditingTextLayerEl();
        if (!layer) return;
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        let node = sel.anchorNode;
        if (node.nodeType === 3) node = node.parentElement;
        const span = node && node.closest && node.closest('span.wc-rich');
        if (!span || !layer.contains(span)) {
            toast('Coloca el cursor dentro de un color aplicado', 'warning');
            return;
        }
        const parent = span.parentNode;
        if (!parent) return;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
        layer.dispatchEvent(new Event('input', { bubbles: true }));
        toast('Color quitado del fragmento', 'success');
    }

    function insertVarAtCaret(token) {
        const layer = getEditingTextLayerEl();
        if (!layer) return;
        layer.focus();
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const r = sel.getRangeAt(0);
        r.deleteContents();
        const tn = document.createTextNode(token);
        r.insertNode(tn);
        r.setStartAfter(tn);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        layer.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function buildTextFormatMenuHtml(hasSelection) {
        const sw = WC_SWATCH_COLORS.map(
            (c) =>
                `<button type="button" class="wc-txtfmt__sw" data-tfmt="color" data-hex="${c}" title="#${c}" style="--sw:#${c}"></button>`
        ).join('');
        const colorBlock = hasSelection
            ? `
            <div class="wc-txtfmt__heading">Color del fragmento</div>
            <div class="wc-txtfmt__swatches">${sw}</div>
            <label class="wc-txtfmt__colorpick"><span>Otro color</span><input type="color" id="wcTxtFmtColorPick" value="#ffffff"></label>
            <button type="button" class="wc-txtfmt__btn" data-tfmt="remove-color">Quitar color del fragmento</button>
            <div class="wc-txtfmt__sep"></div>`
            : '<p class="wc-txtfmt__hint">Selecciona texto para aplicar color.</p><div class="wc-txtfmt__sep"></div>';
        return `
            ${colorBlock}
            <div class="wc-txtfmt__heading">Insertar variable</div>
            <button type="button" class="wc-txtfmt__btn" data-tfmt="var" data-token="{user}">{user} — mención</button>
            <button type="button" class="wc-txtfmt__btn" data-tfmt="var" data-token="{username}">{username}</button>
            <button type="button" class="wc-txtfmt__btn" data-tfmt="var" data-token="{server}">{server}</button>
            <button type="button" class="wc-txtfmt__btn" data-tfmt="var" data-token="{memberCount}">{memberCount}</button>
            <p class="wc-txtfmt__foot">Los colores se guardan como [[#RRGGBB]]texto[[/]]. En subtítulo multilínea la PNG usa un solo color.</p>
        `;
    }

    function positionTextFormatMenu(menu, clientX, clientY) {
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

    function showTextFormatMenu(clientX, clientY, hasSelection) {
        hideContextMenu();
        const menu = rootEl?.querySelector('#wcTextFormatMenu');
        if (!menu) return;
        menu.innerHTML = buildTextFormatMenuHtml(hasSelection);
        positionTextFormatMenu(menu, clientX, clientY);
        menu.focus({ preventScroll: true });
        const pick = menu.querySelector('#wcTxtFmtColorPick');
        pick?.addEventListener('input', () => {
            const v = String(pick.value || '').replace('#', '').toLowerCase();
            if (/^[0-9a-f]{6}$/.test(v)) wrapSelectionWithColor(v);
            hideTextFormatMenu();
        });
    }

    function runTextFormatAction(btn) {
        const kind = btn.dataset.tfmt;
        if (kind === 'color') wrapSelectionWithColor(btn.dataset.hex || '');
        else if (kind === 'remove-color') unwrapSelectionColor();
        else if (kind === 'var') insertVarAtCaret(btn.dataset.token || '');
        hideTextFormatMenu();
    }

    function onTextFormatMenuClick(ev) {
        const menu = rootEl?.querySelector('#wcTextFormatMenu');
        if (!menu || menu.hidden) return;
        const btn = ev.target.closest('button[data-tfmt]');
        if (!btn || !menu.contains(btn)) return;
        ev.preventDefault();
        ev.stopPropagation();
        runTextFormatAction(btn);
    }

    function setActiveTool(tool) {
        activeTool = tool || 'select';
        rootEl?.querySelectorAll('.wc-studio__tool[data-tool]').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.tool === activeTool);
        });
        if (activeTool === 'bg' || activeTool === 'avatar') {
            rightPanelTab = 'adjust';
            rootEl?.querySelectorAll('.wc-studio__panel-tab').forEach((t) => {
                t.classList.toggle('is-active', t.dataset.panelTab === rightPanelTab);
            });
        }
        renderRightPanel();
        updateStatusBar();
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
        renderRightPanel();
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
            renderRightPanel();
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
        hideTextFormatMenu();
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
                    renderRightPanel();
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
                    renderRightPanel();
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
                renderRightPanel();
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
        if (ev.target.closest('#wcStudioPanel')) return;
        if (ev.target.closest('#wcContextMenu')) return;
        if (ev.target.closest('#wcTextFormatMenu')) return;
        const editLayer = ev.target.closest('.wc-layer--editing');
        if (editLayer && (ev.target === editLayer || editLayer.contains(ev.target))) {
            ev.preventDefault();
            const sel = window.getSelection();
            const hasSel =
                sel &&
                !sel.isCollapsed &&
                editLayer.contains(sel.anchorNode) &&
                editLayer.contains(sel.focusNode);
            showTextFormatMenu(ev.clientX, ev.clientY, Boolean(hasSel));
            return;
        }
        ev.preventDefault();
        const layerEl = ev.target.closest('[data-drag]');
        const layerKey = layerEl?.dataset?.drag && LAYER_LABELS[layerEl.dataset.drag] ? layerEl.dataset.drag : null;
        showContextMenu(ev.clientX, ev.clientY, layerKey);
    }

    function onDocumentClickCloseContext(ev) {
        if (!rootEl?.classList.contains('is-open')) return;
        const menu = rootEl.querySelector('#wcContextMenu');
        const tfm = rootEl.querySelector('#wcTextFormatMenu');
        if (tfm && !tfm.hidden) {
            if (!tfm.contains(ev.target)) hideTextFormatMenu();
        }
        if (menu && !menu.hidden) {
            if (!menu.contains(ev.target)) hideContextMenu();
        }
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
        rootEl.addEventListener('click', onTextFormatMenuClick);
        rootEl.addEventListener('pointerdown', (ev) => {
            if (ev.target.closest('#wcContextMenu') || ev.target.closest('#wcTextFormatMenu')) ev.stopPropagation();
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
                <div class="wc-studio__brand">
                    <button type="button" class="wc-studio__btn wc-studio__btn--ghost" id="wcStudioClose" aria-label="Cerrar editor">← Volver</button>
                    <div class="wc-studio__logo" aria-hidden="true">WC</div>
                    <div class="wc-studio__titlewrap">
                        <h2 class="wc-studio__title">Studio de bienvenida</h2>
                        <p class="wc-studio__subtitle">Tarjeta 920×520 · Editor profesional</p>
                    </div>
                </div>
                <div class="wc-studio__top-center">
                    <span class="wc-studio__chip">Lienzo <strong>${W}×${H}</strong></span>
                    <span class="wc-studio__chip">Variables <strong>{user}</strong> <strong>{server}</strong></span>
                </div>
                <div class="wc-studio__actions">
                    <button type="button" class="wc-studio__btn wc-studio__btn--ghost" id="wcStudioUndo" title="Deshacer (Ctrl+Z)" disabled>↶</button>
                    <button type="button" class="wc-studio__btn wc-studio__btn--ghost" id="wcStudioRedo" title="Rehacer (Ctrl+Y)" disabled>↷</button>
                    <input type="file" id="wcStudioBgFile" accept="image/*" class="wc-studio__file-input" aria-hidden="true" tabindex="-1">
                    <button type="button" class="wc-studio__btn wc-studio__btn--accent" id="wcStudioUploadBg" title="Subir imagen de fondo">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Fondo
                    </button>
                    <span class="wc-studio__upload-status" id="wcStudioUploadStatus" aria-live="polite"></span>
                    <button type="button" class="wc-studio__btn wc-studio__btn--ghost" id="wcStudioReset">Restablecer</button>
                    <button type="button" class="wc-studio__btn wc-studio__btn--primary" id="wcStudioSave">Guardar diseño</button>
                </div>
            </header>
            <div class="wc-studio__body">
                <aside class="wc-studio__toolbar" aria-label="Herramientas">
                    <div class="wc-studio__toolbar-group">
                        <span class="wc-studio__toolbar-label">Herramientas</span>
                        <button type="button" class="wc-studio__tool is-active" data-tool="select" title="Seleccionar (V)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>
                        </button>
                        <button type="button" class="wc-studio__tool" data-tool="avatar" title="Avatar">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>
                        </button>
                        <button type="button" class="wc-studio__tool" data-tool="bg" title="Encuadre fondo">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                        </button>
                    </div>
                    <div class="wc-studio__toolbar-divider"></div>
                    <div class="wc-studio__toolbar-group">
                        <span class="wc-studio__toolbar-label">Alinear</span>
                        <button type="button" class="wc-studio__tool" data-action="align-texts-x" title="Centrar textos">≡</button>
                        <button type="button" class="wc-studio__tool" data-action="mirror-h" title="Espejo horizontal">⇋</button>
                    </div>
                </aside>
                <div class="wc-studio__workspace">
                    <div class="wc-studio__canvas-toolbar">
                        <div class="wc-studio__canvas-tools">
                            <label class="wc-studio__toggle is-on" id="wcToggleSnap"><input type="checkbox" checked> Snap</label>
                            <label class="wc-studio__toggle" id="wcToggleGrid"><input type="checkbox"> Cuadrícula</label>
                            <label class="wc-studio__toggle is-on" id="wcToggleSafe"><input type="checkbox" checked> Zona segura</label>
                        </div>
                        <div class="wc-studio__zoom-pills" role="group" aria-label="Zoom">
                            <button type="button" class="wc-studio__zoom-pill" data-zoom="70">70%</button>
                            <button type="button" class="wc-studio__zoom-pill" data-zoom="85">85%</button>
                            <button type="button" class="wc-studio__zoom-pill is-active" data-zoom="100">100%</button>
                            <button type="button" class="wc-studio__zoom-pill" data-zoom="115">115%</button>
                        </div>
                    </div>
                    <div class="wc-studio__canvas-wrap">
                        <div class="wc-studio__zoom-outer" id="wcStudioZoomOuter">
                            <div class="wc-studio__canvas-scaler">
                                <div class="wc-studio__stage" id="wcStudioStage" style="width:${W}px;height:${H}px;">
                                    <div class="wc-stage-bg" id="wcStageBg"></div>
                                    <div class="wc-studio__grid-overlay" id="wcStudioGrid" aria-hidden="true"></div>
                                    <div class="wc-studio__safe-overlay is-visible" id="wcStudioSafe" aria-hidden="true"></div>
                                    <div class="wc-stage-vignette" aria-hidden="true"></div>
                                    <div class="wc-layer wc-layer--avatar" id="wcLayerAvatar" data-drag="avatar" tabindex="0" role="button" aria-label="Avatar">
                                        <div class="wc-avatar-ring" id="wcAvatarRing"></div>
                                        <img class="wc-avatar-img" id="wcAvatarImg" alt="" width="160" height="160" draggable="false" />
                                    </div>
                                    <div class="wc-layer wc-layer--text wc-layer--title" id="wcLayerTitle" data-drag="title" tabindex="0"></div>
                                    <div class="wc-layer wc-layer--text wc-layer--name" id="wcLayerName" data-drag="name" tabindex="0"></div>
                                    <div class="wc-layer wc-layer--text wc-layer--subtitle" id="wcLayerSubtitle" data-drag="subtitle" tabindex="0"></div>
                                    <div class="wc-layer wc-layer--text wc-layer--overlay" id="wcLayerOverlay" data-drag="overlay" tabindex="0"></div>
                                    <svg class="wc-studio-guides" id="wcStudioGuides" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>
                                    <div class="wc-studio__stage-frame" aria-hidden="true"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <aside class="wc-studio__panel" id="wcStudioPanel">
                    <div class="wc-studio__panel-tabs" role="tablist">
                        <button type="button" class="wc-studio__panel-tab is-active" data-panel-tab="layers" role="tab">Capas</button>
                        <button type="button" class="wc-studio__panel-tab" data-panel-tab="design" role="tab">Diseño</button>
                        <button type="button" class="wc-studio__panel-tab" data-panel-tab="adjust" role="tab">Ajustes</button>
                    </div>
                    <div class="wc-studio__panel-body" id="wcStudioPanelBody"></div>
                </aside>
            </div>
            <footer class="wc-studio__statusbar" id="wcStudioStatus" aria-live="polite"></footer>
            <div id="wcContextMenu" class="wc-ctx" role="menu" hidden tabindex="-1"></div>
            <div id="wcTextFormatMenu" class="wc-txtfmt" role="menu" hidden tabindex="-1"></div>
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
        if (!snapEnabled) return { value: val, hit: null };
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
            const k = el.dataset.drag;
            el.classList.toggle('wc-layer--selected', key != null && k === key);
            el.classList.toggle('wc-layer--hidden', layerHidden.has(k));
            el.classList.toggle('wc-layer--locked', layerLocked.has(k));
        });
        renderLayersList();
        renderPropertiesInspector();
        updateStatusBar();
    }

    function toggleLayerVisibility(key) {
        if (layerHidden.has(key)) layerHidden.delete(key);
        else layerHidden.add(key);
        setSelectedLayer(selectedLayer);
    }

    function toggleLayerLock(key) {
        if (layerLocked.has(key)) layerLocked.delete(key);
        else layerLocked.add(key);
        setSelectedLayer(selectedLayer);
    }

    function setLayerPositionFromInputs(key, x, y) {
        if (!key || layerLocked.has(key)) return;
        recordHistoryBeforeChange();
        if (key === 'avatar') {
            layout.avatarCx = clamp(x, layout.avatarR + 8, W - layout.avatarR - 8);
            layout.avatarCy = clamp(y, layout.avatarR + 8, H - layout.avatarR - 8);
        } else if (key === 'title') {
            layout.titleX = clamp(x, 40, W - 40);
            layout.titleY = clamp(y, 16, H - 100);
        } else if (key === 'name') {
            layout.nameX = clamp(x, 40, W - 40);
            layout.nameY = clamp(y, 16, H - 80);
        } else if (key === 'subtitle') {
            layout.subtitleX = clamp(x, 40, W - 40);
            layout.subtitleY = clamp(y, 16, H - 36);
        } else if (key === 'overlay') {
            layout.overlayX = clamp(x, 48, W - 4);
            layout.overlayY = clamp(y, 18, H - 4);
        }
        syncDomFromLayout({ skipHistory: true });
        renderPropertiesInspector();
    }

    function bindChrome() {
        rootEl.querySelector('#wcStudioClose')?.addEventListener('click', close);
        rootEl.querySelector('#wcStudioSave')?.addEventListener('click', saveAndClose);
        rootEl.querySelector('#wcStudioUndo')?.addEventListener('click', undoHistory);
        rootEl.querySelector('#wcStudioRedo')?.addEventListener('click', redoHistory);
        rootEl.querySelector('#wcStudioReset')?.addEventListener('click', () => {
            recordHistoryBeforeChange();
            layout = { ...DEFAULT_LAYOUT };
            canvasUserZoomPct = 100;
            applyCanvasUserZoom();
            syncDomFromLayout({ skipHistory: true });
            clearGuides();
            renderRightPanel();
            updateZoomPills();
            toast('Posiciones por defecto', 'success');
        });
        rootEl.querySelectorAll('.wc-studio__tool[data-tool]').forEach((btn) => {
            btn.addEventListener('click', () => setActiveTool(btn.dataset.tool || 'select'));
        });
        rootEl.querySelector('[data-action="align-texts-x"]')?.addEventListener('click', () => {
            recordHistoryBeforeChange();
            centerTextsX();
        });
        rootEl.querySelector('[data-action="mirror-h"]')?.addEventListener('click', () => {
            recordHistoryBeforeChange();
            mirrorLayoutHorizontal();
        });

        rootEl.querySelector('#wcToggleSnap')?.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            snapEnabled = !snapEnabled;
            const inp = rootEl.querySelector('#wcToggleSnap input');
            if (inp) inp.checked = snapEnabled;
            updateOverlayToggles();
        });
        rootEl.querySelector('#wcToggleSnap input')?.addEventListener('change', (e) => {
            snapEnabled = e.target.checked;
            updateOverlayToggles();
        });
        rootEl.querySelector('#wcToggleGrid')?.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            showGrid = !showGrid;
            const inp = rootEl.querySelector('#wcToggleGrid input');
            if (inp) inp.checked = showGrid;
            updateOverlayToggles();
        });
        rootEl.querySelector('#wcToggleGrid input')?.addEventListener('change', (e) => {
            showGrid = e.target.checked;
            updateOverlayToggles();
        });
        rootEl.querySelector('#wcToggleSafe')?.addEventListener('click', (e) => {
            if (e.target.tagName === 'INPUT') return;
            showSafeZone = !showSafeZone;
            const inp = rootEl.querySelector('#wcToggleSafe input');
            if (inp) inp.checked = showSafeZone;
            updateOverlayToggles();
        });
        rootEl.querySelector('#wcToggleSafe input')?.addEventListener('change', (e) => {
            showSafeZone = e.target.checked;
            updateOverlayToggles();
        });

        rootEl.querySelectorAll('.wc-studio__zoom-pill').forEach((pill) => {
            pill.addEventListener('click', () => {
                const z = Number(pill.dataset.zoom);
                if (!Number.isFinite(z)) return;
                canvasUserZoomPct = clamp(z, 55, 130);
                applyCanvasUserZoom();
                updateZoomPills();
                updateStatusBar();
            });
        });

        rootEl.querySelectorAll('.wc-studio__panel-tab').forEach((tab) => {
            tab.addEventListener('click', () => {
                rightPanelTab = tab.dataset.panelTab || 'layers';
                rootEl.querySelectorAll('.wc-studio__panel-tab').forEach((t) => {
                    t.classList.toggle('is-active', t.dataset.panelTab === rightPanelTab);
                });
                renderRightPanel();
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
        updateOverlayToggles();
    }

    function updateZoomPills() {
        rootEl?.querySelectorAll('.wc-studio__zoom-pill').forEach((pill) => {
            pill.classList.toggle('is-active', Number(pill.dataset.zoom) === canvasUserZoomPct);
        });
    }

    function getLayerCoords(key) {
        if (key === 'avatar') return { x: layout.avatarCx, y: layout.avatarCy };
        if (key === 'title') return { x: layout.titleX, y: layout.titleY };
        if (key === 'name') return { x: layout.nameX, y: layout.nameY };
        if (key === 'subtitle') return { x: layout.subtitleX, y: layout.subtitleY };
        if (key === 'overlay') return { x: layout.overlayX, y: layout.overlayY };
        return { x: 0, y: 0 };
    }

    function renderLayersList() {
        const host = rootEl?.querySelector('#wcStudioLayersList');
        if (!host) return;
        host.innerHTML = LAYER_ORDER.map((key) => {
            const selected = selectedLayer === key;
            const hidden = layerHidden.has(key);
            const locked = layerLocked.has(key);
            return `
                <li class="wc-studio__layer-item${selected ? ' is-selected' : ''}" data-layer-pick="${key}">
                    <span class="wc-studio__layer-icon">${LAYER_ICONS[key] || '·'}</span>
                    <span class="wc-studio__layer-name">${LAYER_LABELS[key] || key}</span>
                    <button type="button" class="wc-studio__layer-mini${hidden ? ' is-off' : ''}" data-layer-vis="${key}" title="Mostrar/ocultar">${hidden ? '○' : '●'}</button>
                    <button type="button" class="wc-studio__layer-mini${locked ? '' : ' is-off'}" data-layer-lock="${key}" title="Bloquear">${locked ? '🔒' : '🔓'}</button>
                </li>
            `;
        }).join('');

        host.querySelectorAll('[data-layer-pick]').forEach((row) => {
            row.addEventListener('click', (ev) => {
                if (ev.target.closest('[data-layer-vis],[data-layer-lock]')) return;
                setSelectedLayer(row.dataset.layerPick);
                setActiveTool(row.dataset.layerPick === 'avatar' ? 'avatar' : 'select');
            });
        });
        host.querySelectorAll('[data-layer-vis]').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                toggleLayerVisibility(btn.dataset.layerVis);
            });
        });
        host.querySelectorAll('[data-layer-lock]').forEach((btn) => {
            btn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                toggleLayerLock(btn.dataset.layerLock);
            });
        });
    }

    function renderPropertiesInspector() {
        const box = rootEl?.querySelector('#wcStudioProps');
        if (!box) return;
        if (!selectedLayer) {
            box.innerHTML = '<p class="wc-studio__hint">Selecciona una capa en la lista para editar posición exacta (px).</p>';
            return;
        }
        const c = getLayerCoords(selectedLayer);
        const locked = layerLocked.has(selectedLayer);
        box.innerHTML = `
            <div class="wc-studio__props-grid">
                <div class="wc-studio__field">
                    <label class="wc-studio__label">Posición X</label>
                    <input type="number" class="wc-studio__input" id="wcPropX" min="0" max="${W}" value="${Math.round(c.x)}" ${locked ? 'disabled' : ''}>
                </div>
                <div class="wc-studio__field">
                    <label class="wc-studio__label">Posición Y</label>
                    <input type="number" class="wc-studio__input" id="wcPropY" min="0" max="${H}" value="${Math.round(c.y)}" ${locked ? 'disabled' : ''}>
                </div>
            </div>
            ${selectedLayer === 'avatar' ? `
                <label class="wc-studio__label" style="margin-top:0.65rem">Radio avatar (${Math.round(layout.avatarR)} px)</label>
                <input type="range" id="wcPropAvatarR" min="48" max="130" value="${Math.round(layout.avatarR)}" class="wc-studio__range" ${locked ? 'disabled' : ''}>
            ` : ''}
            <p class="wc-studio__hint">Flechas del teclado: mover 1 px · Shift: 10 px</p>
        `;
        const applyXY = () => {
            const x = Number(box.querySelector('#wcPropX')?.value);
            const y = Number(box.querySelector('#wcPropY')?.value);
            if (Number.isFinite(x) && Number.isFinite(y)) setLayerPositionFromInputs(selectedLayer, x, y);
        };
        box.querySelector('#wcPropX')?.addEventListener('change', applyXY);
        box.querySelector('#wcPropY')?.addEventListener('change', applyXY);
        box.querySelector('#wcPropAvatarR')?.addEventListener('input', (e) => {
            recordHistoryBeforeChange();
            layout.avatarR = Number(e.target.value) || 78;
            syncDomFromLayout({ skipHistory: true });
            renderPropertiesInspector();
        });
    }

    function renderRightPanel() {
        const body = rootEl?.querySelector('#wcStudioPanelBody');
        if (!body) return;

        if (rightPanelTab === 'layers') {
            body.innerHTML = `
                <div class="wc-studio__section">
                    <h4 class="wc-studio__section-title">Capas</h4>
                    <ul class="wc-studio__layer-list" id="wcStudioLayersList"></ul>
                </div>
                <div class="wc-studio__section">
                    <h4 class="wc-studio__section-title">Transformar</h4>
                    <div id="wcStudioProps"></div>
                </div>
                <div class="wc-studio__section">
                    <h4 class="wc-studio__section-title">Atajos</h4>
                    <div class="wc-studio__kbd-row">
                        <span class="wc-studio__kbd">Ctrl+Z</span><span class="wc-studio__kbd">Ctrl+Y</span>
                        <span class="wc-studio__kbd">Ctrl+S</span><span class="wc-studio__kbd">Esc</span>
                    </div>
                    <p class="wc-studio__hint">Doble clic en texto para editar · Clic derecho: menú contextual y color de fragmento.</p>
                </div>
            `;
            renderLayersList();
            renderPropertiesInspector();
            return;
        }

        if (rightPanelTab === 'design') {
            const presets = Object.entries(LAYOUT_PRESETS)
                .map(([k, p]) => `<button type="button" class="wc-studio__preset" data-preset="${k}">${p.label}</button>`)
                .join('');
            body.innerHTML = `
                <div class="wc-studio__section">
                    <h4 class="wc-studio__section-title">Plantillas</h4>
                    <div class="wc-studio__preset-grid">${presets}</div>
                </div>
                <div class="wc-studio__section">
                    <h4 class="wc-studio__section-title">Alineación</h4>
                    <div class="wc-studio__btn-stack">
                        <button type="button" class="wc-studio__side-btn" id="wcAlignTextsX">Centrar textos (horizontal)</button>
                        <button type="button" class="wc-studio__side-btn" id="wcStackTexts">Apilar título · nombre · subtítulo</button>
                        <button type="button" class="wc-studio__side-btn" id="wcDistributeTexts">Distribuir en vertical</button>
                        <button type="button" class="wc-studio__side-btn" id="wcAlignAvatar">Centrar avatar</button>
                        <button type="button" class="wc-studio__side-btn" id="wcMirrorH">Espejo horizontal</button>
                    </div>
                </div>
            `;
            body.querySelectorAll('[data-preset]').forEach((btn) => {
                btn.addEventListener('click', () => applyLayoutPreset(btn.dataset.preset));
            });
            body.querySelector('#wcAlignTextsX')?.addEventListener('click', () => { recordHistoryBeforeChange(); centerTextsX(); });
            body.querySelector('#wcStackTexts')?.addEventListener('click', () => { recordHistoryBeforeChange(); stackTitleNameSubtitle(); });
            body.querySelector('#wcDistributeTexts')?.addEventListener('click', () => { recordHistoryBeforeChange(); distributeTextsVertically(); });
            body.querySelector('#wcAlignAvatar')?.addEventListener('click', () => { recordHistoryBeforeChange(); centerAvatarOnCanvas(); });
            body.querySelector('#wcMirrorH')?.addEventListener('click', () => { recordHistoryBeforeChange(); mirrorLayoutHorizontal(); });
            return;
        }

        body.innerHTML = `
            <div class="wc-studio__section">
                <h4 class="wc-studio__section-title">Herramienta activa</h4>
                <p class="wc-studio__hint">${activeTool === 'bg' ? 'Arrastra el fondo o usa los sliders de encuadre.' : activeTool === 'avatar' ? 'Arrastra solo el avatar y ajusta el radio.' : 'Selecciona capas y arrástralas con snap inteligente.'}</p>
            </div>
            ${activeTool === 'bg' ? `
            <div class="wc-studio__section">
                <label class="wc-studio__label">Encuadre horizontal</label>
                <input type="range" id="wcBgFx" min="0" max="100" value="${Math.round(layout.bgFocalX * 100)}" class="wc-studio__range">
                <label class="wc-studio__label">Encuadre vertical</label>
                <input type="range" id="wcBgFy" min="0" max="100" value="${Math.round(layout.bgFocalY * 100)}" class="wc-studio__range">
            </div>` : ''}
            ${activeTool === 'avatar' ? `
            <div class="wc-studio__section">
                <label class="wc-studio__label">Radio del avatar (${Math.round(layout.avatarR)} px)</label>
                <input type="range" id="wcAvatarRadius" min="48" max="130" value="${Math.round(layout.avatarR)}" class="wc-studio__range">
            </div>` : ''}
            <div class="wc-studio__section">
                <label class="wc-studio__label" for="wcCanvasZoom">Zoom (${canvasUserZoomPct}%)</label>
                <input type="range" id="wcCanvasZoom" min="55" max="130" value="${canvasUserZoomPct}" class="wc-studio__range">
            </div>
            <div class="wc-studio__section">
                <h4 class="wc-studio__section-title">Portapapeles</h4>
                <div class="wc-studio__btn-stack">
                    <button type="button" class="wc-studio__side-btn" id="wcCopyLayout">Copiar layout (JSON)</button>
                    <button type="button" class="wc-studio__side-btn" id="wcPasteLayout">Pegar layout (JSON)</button>
                </div>
            </div>
        `;
        body.querySelector('#wcBgFx')?.addEventListener('input', (e) => {
            layout.bgFocalX = (Number(e.target.value) || 0) / 100;
            syncDomFromLayout();
        });
        body.querySelector('#wcBgFy')?.addEventListener('input', (e) => {
            layout.bgFocalY = (Number(e.target.value) || 0) / 100;
            syncDomFromLayout();
        });
        body.querySelector('#wcAvatarRadius')?.addEventListener('input', (e) => {
            layout.avatarR = Number(e.target.value) || 78;
            syncDomFromLayout();
        });
        body.querySelector('#wcCanvasZoom')?.addEventListener('input', (e) => {
            canvasUserZoomPct = Number(e.target.value) || 100;
            applyCanvasUserZoom();
            updateZoomPills();
            updateStatusBar();
        });
        body.querySelector('#wcCopyLayout')?.addEventListener('click', copyLayoutJson);
        body.querySelector('#wcPasteLayout')?.addEventListener('click', () => {
            recordHistoryBeforeChange();
            pasteLayoutJson();
        });
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
        historyDragSnapshot = JSON.stringify(layout);
        const start = { x: ev.clientX, y: ev.clientY, fx: layout.bgFocalX, fy: layout.bgFocalY };
        let moved = false;
        const onMove = (e) => {
            moved = true;
            const dx = (e.clientX - start.x) / 400;
            const dy = (e.clientY - start.y) / 250;
            layout.bgFocalX = clamp(start.fx - dx, 0, 1);
            layout.bgFocalY = clamp(start.fy - dy, 0, 1);
            syncDomFromLayout();
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            if (moved && historyDragSnapshot && historyDragSnapshot !== JSON.stringify(layout)) {
                historyPast.push(historyDragSnapshot);
                if (historyPast.length > HISTORY_MAX) historyPast.shift();
                historyFuture = [];
                updateHistoryButtons();
            }
            historyDragSnapshot = null;
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    }

    function bindLayerDrag(el, key) {
        el.addEventListener('pointerdown', (ev) => {
            if (ev.pointerType === 'mouse' && ev.button !== 0) return;
            if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return;
            if (activeTool === 'bg') return;
            if (activeTool === 'avatar' && key !== 'avatar') return;
            if (layerLocked.has(key) || layerHidden.has(key)) {
                toast('Capa bloqueada u oculta', 'warning');
                return;
            }

            ev.preventDefault();
            ev.stopPropagation();
            setSelectedLayer(key);

            const sc = stageScale();
            const start = {
                x: ev.clientX,
                y: ev.clientY,
                layout: { ...layout }
            };
            let moved = false;

            const onMove = (e) => {
                if (!moved) {
                    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;
                    moved = true;
                }
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
                if (moved) {
                    clearGuides();
                    if (historyDragSnapshot && historyDragSnapshot !== JSON.stringify(layout)) {
                        historyPast.push(historyDragSnapshot);
                        if (historyPast.length > HISTORY_MAX) historyPast.shift();
                        historyFuture = [];
                        updateHistoryButtons();
                    }
                }
                historyDragSnapshot = null;
            };
            historyDragSnapshot = JSON.stringify(layout);
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    function syncDomFromLayout(opts = {}) {
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
        if (selectedLayer) {
            rootEl?.querySelectorAll('.wc-layer').forEach((el) => {
                const k = el.dataset.drag;
                el.classList.toggle('wc-layer--selected', k === selectedLayer);
                el.classList.toggle('wc-layer--hidden', layerHidden.has(k));
                el.classList.toggle('wc-layer--locked', layerLocked.has(k));
            });
        }
        updateStatusBar();
    }

    function resolveStudioBgUrl(raw) {
        const u = String(raw || '').trim();
        if (!u) return '';
        if (/^(https?:|blob:|data:)/i.test(u)) return u;
        if (u.startsWith('/') && typeof win.resolveWelcomePreviewMediaUrl === 'function') {
            return win.resolveWelcomePreviewMediaUrl(u);
        }
        if (u.startsWith('/')) {
            try {
                return new URL(u, win.location.origin).href;
            } catch {
                return u;
            }
        }
        return u;
    }

    function applyBgImage(url) {
        const bg = rootEl.querySelector('#wcStageBg');
        if (!bg) return;
        const loadUrl = resolveStudioBgUrl(url);
        if (loadUrl) {
            bg.style.background = '';
            bg.style.backgroundImage = `url("${loadUrl.replace(/"/g, '\\"')}")`;
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
        if (title) title.innerHTML = markupToHtml(String(lines.title || ''));
        if (name) name.innerHTML = markupToHtml(String(lines.name || ''));
        if (sub) sub.innerHTML = markupToHtml(String(lines.sub || ''));
        if (ov) {
            const ovLine = String(lines.overlay || '');
            const hasOverlay = stripColorMarkup(ovLine).replace(/\s+/g, ' ').trim().length > 0;
            if (hasOverlay) {
                ov.innerHTML = markupToHtml(ovLine);
                ov.classList.remove('wc-layer--overlay-empty');
                ov.style.display = '';
            } else {
                ov.innerHTML = '';
                ov.classList.add('wc-layer--overlay-empty');
                ov.style.display = 'block';
            }
        }
    }

    function onTextLayerInput() {
        if (!optsRef?.onCardTextsUpdated || !optsRef.getRawCardTexts || !editingTextLayer) return;
        window.clearTimeout(textPreviewDebounceTimer);
        textPreviewDebounceTimer = window.setTimeout(() => {
            textPreviewDebounceTimer = null;
            const rawField = LAYER_TO_RAW[editingTextLayer];
            const el = rootEl?.querySelector(`[data-drag="${editingTextLayer}"]`);
            if (!rawField || !el) return;
            const raw = { ...optsRef.getRawCardTexts() };
            raw[rawField] = htmlToMarkup(el).replace(/\r\n/g, '\n');
            optsRef.onCardTextsUpdated(raw, optsRef.guildId);
        }, 420);
    }

    function finishTextLayerEdit(el, layerKey) {
        if (!el || !layerKey || !LAYER_TO_RAW[layerKey] || !optsRef?.getRawCardTexts) return;
        if (el.contentEditable !== 'true') return;
        const rawField = LAYER_TO_RAW[layerKey];
        let val = htmlToMarkup(el).replace(/\r\n/g, '\n');
        if (layerKey === 'overlay') val = val.trim();
        const raw = { ...optsRef.getRawCardTexts() };
        raw[rawField] = val;
        el.contentEditable = 'false';
        el.classList.remove('wc-layer--editing');
        editingTextLayer = null;
        window.clearTimeout(textPreviewDebounceTimer);
        textPreviewDebounceTimer = null;
        optsRef.onCardTextsUpdated?.(raw, optsRef.guildId);
        if (typeof optsRef.getPreviewLines === 'function') applyTexts(optsRef.getPreviewLines());
    }

    function commitActiveTextEditIfAny() {
        if (!editingTextLayer || !rootEl) return;
        const key = editingTextLayer;
        const el = rootEl.querySelector(`[data-drag="${key}"]`);
        if (!el || el.contentEditable !== 'true') return;
        el.removeEventListener('input', onTextLayerInput);
        finishTextLayerEdit(el, key);
    }

    function beginTextLayerEdit(layerKey) {
        if (layerKey === 'avatar' || !LAYER_TO_RAW[layerKey] || !optsRef?.getRawCardTexts) return;
        commitActiveTextEditIfAny();
        const el = rootEl.querySelector(`[data-drag="${layerKey}"]`);
        if (!el) return;
        const rawField = LAYER_TO_RAW[layerKey];
        const raw = optsRef.getRawCardTexts();
        el.contentEditable = 'true';
        el.classList.add('wc-layer--editing');
        el.classList.remove('wc-layer--overlay-empty');
        el.innerHTML = markupToHtml(raw[rawField] != null ? String(raw[rawField]) : '');
        editingTextLayer = layerKey;
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
        el.addEventListener('input', onTextLayerInput);
        el.addEventListener(
            'blur',
            (ev) => {
                const t = ev.target;
                t.removeEventListener('input', onTextLayerInput);
                window.clearTimeout(textPreviewDebounceTimer);
                textPreviewDebounceTimer = null;
                finishTextLayerEdit(t, t.dataset.drag || layerKey);
            },
            { once: true }
        );
    }

    function bindTextLayerEditing() {
        ['title', 'name', 'subtitle', 'overlay'].forEach((key) => {
            const el = rootEl.querySelector(`[data-drag="${key}"]`);
            if (!el || el.dataset.wcTextDblBound) return;
            el.dataset.wcTextDblBound = '1';
            el.addEventListener('dblclick', (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (activeTool === 'bg' || activeTool === 'avatar') return;
                beginTextLayerEdit(key);
            });
        });
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
        layerHidden.clear();
        layerLocked.clear();
        resetHistory();
        canvasUserZoomPct = 100;
        applyCanvasUserZoom();
        updateZoomPills();
        activeTool = 'select';
        rightPanelTab = 'layers';
        rootEl.querySelectorAll('.wc-studio__panel-tab').forEach((t) => {
            t.classList.toggle('is-active', t.dataset.panelTab === 'layers');
        });
        setActiveTool('select');
        syncDomFromLayout({ skipHistory: true });
        renderRightPanel();
        setSelectedLayer(null);
        updateOverlayToggles();
        updateStatusBar();
        const st = rootEl.querySelector('#wcStudioUploadStatus');
        if (st) st.textContent = '';

        if (!rootEl.dataset.layersBound) {
            rootEl.dataset.layersBound = '1';
            ['avatar', 'title', 'name', 'subtitle', 'overlay'].forEach((k) => {
                const el = rootEl.querySelector(`[data-drag="${k}"]`);
                if (el) bindLayerDrag(el, k);
            });
            bindTextLayerEditing();
        }

        rootEl.classList.add('is-open');
        rootEl.setAttribute('aria-hidden', 'false');
        document.body.classList.add('wc-studio-open');
    }

    function close() {
        if (!rootEl) return;
        commitActiveTextEditIfAny();
        hideContextMenu();
        clearGuides();
        setSelectedLayer(null);
        rootEl.classList.remove('is-open');
        rootEl.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('wc-studio-open');
        optsRef?.onClose?.();
    }

    function saveAndClose() {
        commitActiveTextEditIfAny();
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
