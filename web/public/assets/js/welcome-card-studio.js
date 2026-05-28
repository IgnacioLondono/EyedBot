/**
 * Eyed Studio v3 — Editor de tarjeta de bienvenida (reescritura completa).
 * API: WelcomeCardStudio.mergeCardLayout, .open, .close
 */
(function (global) {
    'use strict';

    const W = 920;
    const H = 520;
    const SNAP = 12;
    const DRAG_MIN = 6;
    const HISTORY_MAX = 50;
    const PREVIEW_DEBOUNCE_MS = 480;

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

    const LAYERS = [
        { id: 'avatar', label: 'Avatar', kind: 'avatar' },
        { id: 'title', label: 'Título', kind: 'text' },
        { id: 'name', label: 'Nombre', kind: 'text' },
        { id: 'subtitle', label: 'Subtítulo', kind: 'text' },
        { id: 'overlay', label: 'Texto extra', kind: 'text' }
    ];

    const PRESETS = {
        classic: { name: 'Centrado clásico', layout: { ...DEFAULT_LAYOUT } },
        hero: {
            name: 'Hero superior',
            layout: { ...DEFAULT_LAYOUT, avatarCy: 132, titleY: 240, nameY: 304, subtitleY: 360 }
        },
        bottom: {
            name: 'Bloque inferior',
            layout: {
                ...DEFAULT_LAYOUT,
                avatarCy: 110,
                titleY: 298,
                nameY: 352,
                subtitleY: 402,
                bgFocalY: 0.38
            }
        },
        editorial: {
            name: 'Editorial lateral',
            layout: {
                ...DEFAULT_LAYOUT,
                avatarCx: 200,
                avatarCy: 200,
                titleX: 540,
                titleY: 210,
                nameX: 540,
                nameY: 278,
                subtitleX: 540,
                subtitleY: 338,
                overlayX: 860,
                overlayY: 490
            }
        }
    };

    const SWATCHES = ['ffffff', 'f8fafc', 'fde047', '4ade80', '22d3ee', '60a5fa', 'a78bfa', 'f472b6', 'fb923c', '94a3b8'];

    let root = null;
    let opts = null;
    let layout = { ...DEFAULT_LAYOUT };
    let tool = 'move';
    let section = 'design';
    let selectedId = 'title';
    let zoomPct = 100;
    let snapOn = true;
    let gridOn = false;
    let safeOn = true;
    let hidden = new Set();
    let locked = new Set();
    let past = [];
    let future = [];
    let editingId = null;
    let previewTimer = null;
    let previewUrl = '';

    function clamp(n, a, b) {
        return Math.min(b, Math.max(a, n));
    }

    function mergeCardLayout(raw) {
        const d = { ...DEFAULT_LAYOUT };
        if (!raw || typeof raw !== 'object') return d;
        const n = (v, def, min, max) => {
            const x = Number(v);
            return Number.isFinite(x) ? clamp(x, min, max) : def;
        };
        return {
            bgFocalX: n(raw.bgFocalX, d.bgFocalX, 0, 1),
            bgFocalY: n(raw.bgFocalY, d.bgFocalY, 0, 1),
            avatarCx: n(raw.avatarCx, d.avatarCx, 0, W),
            avatarCy: n(raw.avatarCy, d.avatarCy, 0, H),
            avatarR: n(raw.avatarR, d.avatarR, 36, 150),
            titleX: n(raw.titleX, d.titleX, 0, W),
            titleY: n(raw.titleY, d.titleY, 0, H),
            nameX: n(raw.nameX, d.nameX, 0, W),
            nameY: n(raw.nameY, d.nameY, 0, H),
            subtitleX: n(raw.subtitleX, d.subtitleX, 0, W),
            subtitleY: n(raw.subtitleY, d.subtitleY, 0, H),
            overlayX: n(raw.overlayX, d.overlayX, 0, W),
            overlayY: n(raw.overlayY, d.overlayY, 0, H)
        };
    }

    function toast(msg, type) {
        if (typeof global.showToast === 'function') global.showToast(msg, type);
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function pushHistory() {
        past.push(JSON.stringify(layout));
        if (past.length > HISTORY_MAX) past.shift();
        future = [];
        syncHistoryBtns();
    }

    function undo() {
        if (!past.length) return toast('Nada que deshacer', 'warning');
        future.push(JSON.stringify(layout));
        layout = mergeCardLayout(JSON.parse(past.pop()));
        paint();
        syncHistoryBtns();
        schedulePreview();
    }

    function redo() {
        if (!future.length) return toast('Nada que rehacer', 'warning');
        past.push(JSON.stringify(layout));
        layout = mergeCardLayout(JSON.parse(future.pop()));
        paint();
        syncHistoryBtns();
        schedulePreview();
    }

    function syncHistoryBtns() {
        root?.querySelector('#esUndo')?.toggleAttribute('disabled', past.length === 0);
        root?.querySelector('#esRedo')?.toggleAttribute('disabled', future.length === 0);
    }

    function coords(id) {
        if (id === 'avatar') return { x: layout.avatarCx, y: layout.avatarCy };
        if (id === 'title') return { x: layout.titleX, y: layout.titleY };
        if (id === 'name') return { x: layout.nameX, y: layout.nameY };
        if (id === 'subtitle') return { x: layout.subtitleX, y: layout.subtitleY };
        if (id === 'overlay') return { x: layout.overlayX, y: layout.overlayY };
        return { x: 0, y: 0 };
    }

    function setCoords(id, x, y) {
        if (id === 'avatar') {
            layout.avatarCx = clamp(x, layout.avatarR + 8, W - layout.avatarR - 8);
            layout.avatarCy = clamp(y, layout.avatarR + 8, H - layout.avatarR - 8);
        } else if (id === 'title') {
            layout.titleX = clamp(x, 32, W - 32);
            layout.titleY = clamp(y, 12, H - 80);
        } else if (id === 'name') {
            layout.nameX = clamp(x, 32, W - 32);
            layout.nameY = clamp(y, 12, H - 64);
        } else if (id === 'subtitle') {
            layout.subtitleX = clamp(x, 32, W - 32);
            layout.subtitleY = clamp(y, 12, H - 28);
        } else if (id === 'overlay') {
            layout.overlayX = clamp(x, 40, W - 8);
            layout.overlayY = clamp(y, 14, H - 8);
        }
    }

    function snapVal(v, targets) {
        if (!snapOn) return { v, hit: null };
        for (const t of targets) {
            if (Math.abs(v - t) <= SNAP) return { v: t, hit: t };
        }
        return { v, hit: null };
    }

    function snapMove(id, x, y) {
        const peersX = [W / 2];
        const peersY = [H / 2];
        LAYERS.forEach((L) => {
            if (L.id === id) return;
            const c = coords(L.id);
            peersX.push(c.x);
            peersY.push(c.y);
        });
        const sx = snapVal(x, peersX);
        const sy = snapVal(y, peersY);
        return { x: sx.v, y: sy.v, guidesX: sx.hit != null ? [sx.hit] : [], guidesY: sy.hit != null ? [sy.hit] : [] };
    }

    function drawGuides(gx, gy) {
        const svg = root?.querySelector('#esGuides');
        if (!svg) return;
        const parts = [];
        (gx || []).forEach((x) => parts.push(`<line class="eyestudio__guide" x1="${x}" y1="0" x2="${x}" y2="${H}"/>`));
        (gy || []).forEach((y) => parts.push(`<line class="eyestudio__guide" x1="0" y1="${y}" x2="${W}" y2="${y}"/>`));
        svg.innerHTML = parts.join('');
    }

    function clearGuides() {
        const svg = root?.querySelector('#esGuides');
        if (svg) svg.innerHTML = '';
    }

    function styleFromConfig() {
        const cfg = opts?.getWelcomeConfig?.() || {};
        return {
            accent: `#${String(cfg.cardAccentColor || '4ade80').replace('#', '')}`,
            title: `#${String(cfg.cardTitleColor || 'ffffff').replace('#', '')}`,
            name: `#${String(cfg.cardNameColor || 'f8fafc').replace('#', '')}`,
            sub: `#${String(cfg.cardSubtitleColor || 'e2e8f0').replace('#', '')}`,
            overlay: `#${String(cfg.cardOverlayColor || 'ffffff').replace('#', '')}`,
            font: String(cfg.cardFontKey || 'system')
        };
    }

    function fontFamily(key) {
        const map = {
            system: '"Plus Jakarta Sans", Arial, sans-serif',
            serif: '"Cormorant Garamond", Georgia, serif',
            mono: 'Consolas, monospace',
            rounded: 'Verdana, sans-serif',
            elegant: '"Cormorant Garamond", "Times New Roman", serif'
        };
        return map[key] || map.system;
    }

    function parseMarkup(src) {
        const s = String(src ?? '');
        const out = [];
        let color = null;
        let buf = '';
        const flush = () => {
            if (buf) out.push({ t: buf, c: color });
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
        return out.length ? out : [{ t: s, c: null }];
    }

    function markupHtml(src) {
        return parseMarkup(src)
            .map((seg) => {
                const inner = esc(seg.t).replace(/\n/g, '<br>');
                if (seg.c && /^[0-9a-f]{6}$/.test(seg.c)) {
                    return `<span class="eyestudio-rich" data-c="${seg.c}" style="color:#${seg.c}">${inner}</span>`;
                }
                return inner;
            })
            .join('');
    }

    function htmlToMarkup(node) {
        function walk(n) {
            if (n.nodeType === 3) return String(n.textContent || '').replace(/\u00a0/g, ' ');
            if (n.nodeType !== 1) return '';
            if (n.tagName === 'BR') return '\n';
            if (n.classList?.contains('eyestudio-rich')) {
                const hex = String(n.getAttribute('data-c') || '').toLowerCase();
                let inner = '';
                for (const c of n.childNodes) inner += walk(c);
                if (/^[0-9a-f]{6}$/.test(hex) && inner) return `[[#${hex}]]${inner}[[/]]`;
                return inner;
            }
            let o = '';
            for (const c of n.childNodes) o += walk(c);
            return o;
        }
        let r = '';
        for (const c of node.childNodes) r += walk(c);
        return r;
    }

    function previewTexts() {
        if (typeof opts?.getPreviewLines === 'function') return opts.getPreviewLines();
        const raw = opts?.getRawCardTexts?.() || {};
        return {
            title: raw.title || '¡Bienvenido!',
            name: raw.cardNameTemplate || '{username}',
            sub: raw.message || '',
            overlay: raw.cardOverlayText || ''
        };
    }

    function applyTextsToDom() {
        const lines = previewTexts();
        const st = styleFromConfig();
        const ff = fontFamily(st.font);
        const map = {
            title: { el: '#esTitle', html: lines.title, color: st.title, size: '2rem', weight: '800' },
            name: { el: '#esName', html: lines.name, color: st.name, size: '1.35rem', weight: '600' },
            subtitle: { el: '#esSub', html: lines.sub, color: st.sub, size: '1.05rem', weight: '500', italic: true },
            overlay: { el: '#esOverlay', html: lines.overlay, color: st.overlay, size: '0.95rem', weight: '700' }
        };
        Object.entries(map).forEach(([id, cfg]) => {
            const node = root?.querySelector(cfg.el);
            if (!node) return;
            node.innerHTML = markupHtml(cfg.html);
            node.style.color = cfg.color;
            node.style.fontFamily = ff;
            node.style.fontSize = cfg.size;
            node.style.fontWeight = cfg.weight;
            if (cfg.italic) node.style.fontStyle = 'italic';
            if (id === 'overlay') {
                const empty = !String(cfg.html || '').replace(/\[\[\/\]\]|\[\[#([0-9a-fA-F]{6})\]\]/gi, '').trim();
                node.classList.toggle('eyestudio__overlay-empty', empty);
            }
        });
        const ring = root?.querySelector('#esAvatarRing');
        if (ring) ring.style.background = `linear-gradient(135deg, ${st.accent}, ${st.accent}88)`;
    }

    function resolveBgUrl(raw) {
        const u = String(raw || '').trim();
        if (!u) return '';
        if (/^(https?:|blob:|data:)/i.test(u)) return u;
        if (typeof global.resolveWelcomePreviewMediaUrl === 'function') return global.resolveWelcomePreviewMediaUrl(u);
        if (u.startsWith('/')) {
            try {
                return new URL(u, global.location.origin).href;
            } catch {
                return u;
            }
        }
        return u;
    }

    function applyBackground() {
        const bg = root?.querySelector('#esBg');
        if (!bg) return;
        const url = resolveBgUrl(opts?.getBgUrl?.() || '');
        if (url) {
            bg.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
            bg.style.backgroundSize = 'cover';
            bg.style.backgroundRepeat = 'no-repeat';
        } else {
            bg.style.backgroundImage = 'none';
            bg.style.background = 'linear-gradient(135deg, #1e3a5f, #4c1d95, #065f46)';
        }
        bg.style.backgroundPosition = `${layout.bgFocalX * 100}% ${layout.bgFocalY * 100}%`;
    }

    function paint() {
        applyBackground();
        applyTextsToDom();
        const av = root?.querySelector('#esAvatar');
        const r = layout.avatarR;
        if (av) {
            av.style.left = `${layout.avatarCx}px`;
            av.style.top = `${layout.avatarCy}px`;
            av.style.width = `${r * 2}px`;
            av.style.height = `${r * 2}px`;
        }
        const ring = root?.querySelector('#esAvatarRing');
        if (ring) {
            const pad = r + Math.max(3, r * 0.08);
            ring.style.width = `${pad * 2}px`;
            ring.style.height = `${pad * 2}px`;
        }
        [['title', '#esTitle'], ['name', '#esName'], ['subtitle', '#esSub']].forEach(([id, sel]) => {
            const el = root?.querySelector(sel);
            const c = coords(id);
            if (el) {
                el.style.left = `${c.x}px`;
                el.style.top = `${c.y}px`;
            }
        });
        const ov = root?.querySelector('#esOverlay');
        if (ov) {
            ov.style.left = 'auto';
            ov.style.top = 'auto';
            ov.style.right = `${W - layout.overlayX}px`;
            ov.style.bottom = `${H - layout.overlayY}px`;
        }
        const domMap = {
            avatar: '#esAvatar',
            title: '#esTitle',
            name: '#esName',
            subtitle: '#esSub',
            overlay: '#esOverlay'
        };
        LAYERS.forEach((L) => {
            const dom = root?.querySelector(domMap[L.id]);
            if (!dom) return;
            dom.classList.toggle('is-selected', selectedId === L.id);
            dom.classList.toggle('is-hidden', hidden.has(L.id));
            dom.classList.toggle('is-locked', locked.has(L.id));
        });
        renderInspector();
        renderLayers();
        updateFooter();
        schedulePreview();
    }

    function updateFooter() {
        const f = root?.querySelector('#esFooter');
        if (!f) return;
        const L = LAYERS.find((x) => x.id === selectedId);
        f.innerHTML = `
            <span>Capa: <strong>${L ? L.label : '—'}</strong></span>
            <span>Zoom: <strong>${zoomPct}%</strong></span>
            <span>Fondo: <strong>${Math.round(layout.bgFocalX * 100)}% · ${Math.round(layout.bgFocalY * 100)}%</strong></span>
        `;
    }

    function readTextsFromDom() {
        if (!root?.classList.contains('is-open')) return null;
        const titleEl = root.querySelector('#esTitle');
        const nameEl = root.querySelector('#esName');
        const subEl = root.querySelector('#esSub');
        const ovEl = root.querySelector('#esOverlay');
        if (!titleEl || !nameEl) return null;
        return {
            previewHeadline: htmlToMarkup(titleEl),
            previewDisplayName: htmlToMarkup(nameEl),
            previewSubtitle: subEl ? htmlToMarkup(subEl) : '',
            previewOverlay: ovEl ? htmlToMarkup(ovEl) : ''
        };
    }

    function readStyleFromForm() {
        const hex = (id, fallback) =>
            String(document.getElementById(id)?.value || fallback)
                .replace('#', '')
                .trim();
        return {
            cardAccentColor: hex('welcomeCardAccent', '#4ade80'),
            cardTitleColor: hex('welcomeCardTitle', '#ffffff'),
            cardNameColor: hex('welcomeCardName', '#f8fafc'),
            cardSubtitleColor: hex('welcomeCardSubtitle', '#e2e8f0'),
            cardOverlayColor: hex('welcomeCardOverlayColor', '#ffffff'),
            cardFontKey: document.getElementById('welcomeCardFont')?.value || 'system'
        };
    }

    function buildPreviewPayload() {
        const cfg = opts?.getWelcomeConfig?.() || {};
        const raw = opts?.getRawCardTexts?.() || {};
        const domTexts = readTextsFromDom();
        const lines = previewTexts();
        const formStyle = readStyleFromForm();
        return {
            ...cfg,
            ...formStyle,
            welcomeStyle: 'card',
            cardLayout: { ...layout },
            title: raw.title ?? cfg.title ?? '',
            message: raw.message ?? cfg.message ?? '',
            cardNameTemplate: raw.cardNameTemplate ?? cfg.cardNameTemplate ?? '{username}',
            cardOverlayText: raw.cardOverlayText ?? cfg.cardOverlayText ?? '',
            previewHeadline: domTexts?.previewHeadline ?? lines.title ?? '',
            previewDisplayName: domTexts?.previewDisplayName ?? lines.name ?? '',
            previewSubtitle: domTexts?.previewSubtitle ?? lines.sub ?? '',
            previewOverlay: domTexts?.previewOverlay ?? lines.overlay ?? '',
            imageUrl: opts?.getBgUrl?.() || cfg.imageUrl || ''
        };
    }

    async function fetchLivePreview() {
        const guildId = opts?.guildId;
        const img = root?.querySelector('#esPreviewImg');
        const loading = root?.querySelector('#esPreviewLoading');
        if (!guildId || !img || typeof global.fetchWithCredentials !== 'function') return;
        if (loading) loading.hidden = false;
        img.style.opacity = '0.35';
        try {
            const res = await global.fetchWithCredentials(`/api/guild/${guildId}/welcome-card-preview`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildPreviewPayload())
            });
            if (!res.ok) throw new Error('preview failed');
            const blob = await res.blob();
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(blob);
            img.src = previewUrl;
            img.onload = () => {
                img.style.opacity = '1';
                if (loading) loading.hidden = true;
            };
        } catch {
            if (loading) {
                loading.textContent = 'Vista previa no disponible';
                loading.hidden = false;
            }
            img.style.opacity = '0.5';
        }
    }

    function schedulePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(fetchLivePreview, PREVIEW_DEBOUNCE_MS);
    }

    function renderLayers() {
        const list = root?.querySelector('#esLayerList');
        if (!list) return;
        list.innerHTML = LAYERS.slice()
            .reverse()
            .map((L) => {
                const sel = selectedId === L.id;
                const hid = hidden.has(L.id);
                const loc = locked.has(L.id);
                return `
                    <li class="eyestudio__layer${sel ? ' is-selected' : ''}" data-pick="${L.id}">
                        <span class="eyestudio__layer-dot"></span>
                        <span class="eyestudio__layer-name">${L.label}</span>
                        <span class="eyestudio__layer-actions">
                            <button type="button" class="eyestudio__icon-btn" data-vis="${L.id}" title="Visibilidad">${hid ? '○' : '●'}</button>
                            <button type="button" class="eyestudio__icon-btn" data-lock="${L.id}" title="Bloqueo">${loc ? '🔒' : '🔓'}</button>
                        </span>
                    </li>`;
            })
            .join('');
        list.querySelectorAll('[data-pick]').forEach((row) => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('[data-vis],[data-lock]')) return;
                selectedId = row.dataset.pick;
                paint();
            });
        });
        list.querySelectorAll('[data-vis]').forEach((b) => {
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = b.dataset.vis;
                if (hidden.has(id)) hidden.delete(id);
                else hidden.add(id);
                paint();
            });
        });
        list.querySelectorAll('[data-lock]').forEach((b) => {
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = b.dataset.lock;
                if (locked.has(id)) locked.delete(id);
                else locked.add(id);
                paint();
            });
        });
    }

    function renderInspector() {
        const box = root?.querySelector('#esInspector');
        if (!box) return;
        const c = coords(selectedId);
        const isBg = tool === 'bg' || section === 'background';
        const isText = ['title', 'name', 'subtitle', 'overlay'].includes(selectedId);
        const raw = opts?.getRawCardTexts?.() || {};

        let html = '';

        if (section === 'content' || (section === 'design' && isText)) {
            const fieldMap = {
                title: { label: 'Título', key: 'title', val: raw.title },
                name: { label: 'Línea central', key: 'cardNameTemplate', val: raw.cardNameTemplate },
                subtitle: { label: 'Subtítulo', key: 'message', val: raw.message },
                overlay: { label: 'Texto extra', key: 'cardOverlayText', val: raw.cardOverlayText }
            };
            const f = fieldMap[selectedId] || fieldMap.title;
            html += `
                <div class="eyestudio__field">
                    <label class="eyestudio__label">${f.label}</label>
                    <textarea class="eyestudio__textarea" id="esTextField" data-key="${f.key}">${esc(f.val || '')}</textarea>
                    <p class="eyestudio__hint">Variables: {user} {username} {server} {memberCount}. Color parcial: [[#RRGGBB]]texto[[/]]</p>
                </div>
                <div class="eyestudio__field">
                    <span class="eyestudio__label">Color rápido (selección en canvas con clic derecho)</span>
                    <div class="eyestudio__swatches">${SWATCHES.map((h) => `<button type="button" class="eyestudio__swatch" data-hex="${h}" style="background:#${h}" title="#${h}"></button>`).join('')}</div>
                </div>`;
        }

        if (section === 'design' || section === 'layers') {
            html += `
                <div class="eyestudio__field">
                    <span class="eyestudio__label">Posición (${selectedId})</span>
                    <div class="eyestudio__grid2">
                        <div><label class="eyestudio__label">X</label><input type="number" class="eyestudio__input" id="esPosX" value="${Math.round(c.x)}" min="0" max="${W}"></div>
                        <div><label class="eyestudio__label">Y</label><input type="number" class="eyestudio__input" id="esPosY" value="${Math.round(c.y)}" min="0" max="${H}"></div>
                    </div>
                </div>`;
            if (selectedId === 'avatar') {
                html += `
                    <div class="eyestudio__field">
                        <label class="eyestudio__label">Radio avatar (${Math.round(layout.avatarR)} px)</label>
                        <input type="range" class="eyestudio__range" id="esAvatarR" min="48" max="130" value="${Math.round(layout.avatarR)}">
                    </div>`;
            }
        }

        if (section === 'background' || isBg) {
            html += `
                <div class="eyestudio__field">
                    <label class="eyestudio__label">Encuadre horizontal</label>
                    <input type="range" class="eyestudio__range" id="esBgX" min="0" max="100" value="${Math.round(layout.bgFocalX * 100)}">
                </div>
                <div class="eyestudio__field">
                    <label class="eyestudio__label">Encuadre vertical</label>
                    <input type="range" class="eyestudio__range" id="esBgY" min="0" max="100" value="${Math.round(layout.bgFocalY * 100)}">
                </div>
                <p class="eyestudio__hint">Arrastra el fondo en el lienzo con la herramienta Fondo activa.</p>`;
        }

        if (section === 'design') {
            html += `<div class="eyestudio__divider"></div>
                <p class="eyestudio__hint">Atajos: Ctrl+Z deshacer · Ctrl+Y rehacer · Ctrl+S guardar · Flechas mover capa</p>`;
        }

        box.innerHTML = html || '<p class="eyestudio__hint">Elige una sección en el panel izquierdo.</p>';

        box.querySelector('#esTextField')?.addEventListener('input', (e) => {
            const key = e.target.dataset.key;
            const val = e.target.value;
            const next = { ...raw, [key]: val };
            opts?.onCardTextsUpdated?.(next);
            applyTextsToDom();
            schedulePreview();
        });

        const applyPos = () => {
            pushHistory();
            setCoords(selectedId, Number(box.querySelector('#esPosX')?.value), Number(box.querySelector('#esPosY')?.value));
            paint();
        };
        box.querySelector('#esPosX')?.addEventListener('change', applyPos);
        box.querySelector('#esPosY')?.addEventListener('change', applyPos);
        box.querySelector('#esAvatarR')?.addEventListener('input', (e) => {
            layout.avatarR = Number(e.target.value) || 78;
            paint();
        });
        box.querySelector('#esBgX')?.addEventListener('input', (e) => {
            layout.bgFocalX = Number(e.target.value) / 100;
            paint();
        });
        box.querySelector('#esBgY')?.addEventListener('input', (e) => {
            layout.bgFocalY = Number(e.target.value) / 100;
            paint();
        });
    }

    function mount() {
        if (root) return root;
        root = document.createElement('div');
        root.id = 'eyedWelcomeStudio';
        root.className = 'eyestudio';
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML = `
            <header class="eyestudio__header">
                <div class="eyestudio__brand">
                    <div class="eyestudio__mark">ES</div>
                    <div>
                        <h1>Eyed Studio</h1>
                        <p>Diseño de tarjeta de bienvenida</p>
                    </div>
                </div>
                <div class="eyestudio__header-meta">
                    <span class="eyestudio__pill">Lienzo <strong>${W}×${H}</strong></span>
                    <span class="eyestudio__pill">Salida <strong>PNG</strong></span>
                </div>
                <div class="eyestudio__header-actions">
                    <button type="button" class="eyestudio__btn eyestudio__btn--ghost" id="esClose">Cerrar</button>
                    <button type="button" class="eyestudio__btn eyestudio__btn--ghost" id="esUndo" disabled title="Ctrl+Z">Deshacer</button>
                    <button type="button" class="eyestudio__btn eyestudio__btn--ghost" id="esRedo" disabled title="Ctrl+Y">Rehacer</button>
                    <input type="file" id="esBgFile" class="eyestudio__file" accept="image/*">
                    <button type="button" class="eyestudio__btn eyestudio__btn--accent" id="esUploadBg">Subir fondo</button>
                    <span class="eyestudio__status-inline" id="esUploadStatus"></span>
                    <button type="button" class="eyestudio__btn eyestudio__btn--primary" id="esSave">Guardar y aplicar</button>
                </div>
            </header>
            <div class="eyestudio__body">
                <nav class="eyestudio__nav">
                    <div class="eyestudio__nav-section">
                        <p class="eyestudio__nav-title">Espacios</p>
                        <button type="button" class="eyestudio__nav-btn is-active" data-section="design"><span class="eyestudio__nav-icon">◫</span> Diseño</button>
                        <button type="button" class="eyestudio__nav-btn" data-section="content"><span class="eyestudio__nav-icon">T</span> Contenido</button>
                        <button type="button" class="eyestudio__nav-btn" data-section="background"><span class="eyestudio__nav-icon">▣</span> Fondo</button>
                        <button type="button" class="eyestudio__nav-btn" data-section="layers"><span class="eyestudio__nav-icon">☰</span> Capas</button>
                    </div>
                    <div class="eyestudio__nav-section">
                        <p class="eyestudio__nav-title">Herramientas</p>
                        <button type="button" class="eyestudio__nav-btn is-active" data-tool="move"><span class="eyestudio__nav-icon">↖</span> Mover</button>
                        <button type="button" class="eyestudio__nav-btn" data-tool="bg"><span class="eyestudio__nav-icon">⤢</span> Fondo</button>
                    </div>
                    <div class="eyestudio__nav-section">
                        <p class="eyestudio__nav-title">Plantillas</p>
                        <div class="eyestudio__preset-grid" id="esPresets"></div>
                    </div>
                    <div class="eyestudio__nav-section" style="flex:1;min-height:0">
                        <p class="eyestudio__nav-title">Capas</p>
                        <ul class="eyestudio__layer-list" id="esLayerList"></ul>
                    </div>
                </nav>
                <div class="eyestudio__workspace">
                    <div class="eyestudio__workspace-bar">
                        <div class="eyestudio__toggles">
                            <label class="eyestudio__toggle is-on" id="esSnapToggle"><input type="checkbox" checked> Snap</label>
                            <label class="eyestudio__toggle" id="esGridToggle"><input type="checkbox"> Cuadrícula</label>
                            <label class="eyestudio__toggle is-on" id="esSafeToggle"><input type="checkbox" checked> Zona segura</label>
                        </div>
                        <div class="eyestudio__zoom-group" id="esZoomGroup"></div>
                    </div>
                    <div class="eyestudio__workspace-main">
                        <div class="eyestudio__canvas-panel">
                            <div class="eyestudio__panel-head"><span>Editor</span><strong>Arrastra · Doble clic texto</strong></div>
                            <div class="eyestudio__canvas-scroll">
                                <div class="eyestudio__canvas-zoom" id="esCanvasZoom">
                                    <div class="eyestudio__stage-wrap">
                                        <div class="eyestudio__stage" id="esStage">
                                            <div class="eyestudio__stage-bg" id="esBg"></div>
                                            <div class="eyestudio__stage-grid" id="esGrid"></div>
                                            <div class="eyestudio__stage-safe is-on" id="esSafe"></div>
                                            <div class="eyestudio__stage-vignette"></div>
                                            <div class="eyestudio__el eyestudio__el--avatar" id="esAvatar" data-layer="avatar">
                                                <div class="eyestudio__avatar-ring" id="esAvatarRing"></div>
                                                <img class="eyestudio__avatar-img" id="esAvatarImg" alt="" draggable="false">
                                            </div>
                                            <div class="eyestudio__el eyestudio__el--text eyestudio__el--title" id="esTitle" data-layer="title"></div>
                                            <div class="eyestudio__el eyestudio__el--text eyestudio__el--name" id="esName" data-layer="name"></div>
                                            <div class="eyestudio__el eyestudio__el--text eyestudio__el--sub" id="esSub" data-layer="subtitle"></div>
                                            <div class="eyestudio__el eyestudio__el--text eyestudio__el--overlay" id="esOverlay" data-layer="overlay"></div>
                                            <svg class="eyestudio__guides" id="esGuides" viewBox="0 0 ${W} ${H}"></svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="eyestudio__preview-panel">
                            <div class="eyestudio__panel-head"><span>Vista Discord</span><strong>PNG real</strong></div>
                            <div class="eyestudio__preview-body">
                                <span class="eyestudio__preview-loading" id="esPreviewLoading">Generando vista previa…</span>
                                <img class="eyestudio__preview-img" id="esPreviewImg" alt="Vista previa PNG" decoding="async">
                            </div>
                        </div>
                    </div>
                </div>
                <aside class="eyestudio__inspector">
                    <div class="eyestudio__panel-head" style="padding:0.65rem 0.85rem;border-bottom:1px solid var(--es-border)"><strong>Inspector</strong></div>
                    <div class="eyestudio__inspector-scroll" id="esInspector"></div>
                </aside>
            </div>
            <footer class="eyestudio__footer" id="esFooter"></footer>
            <div id="esFormatMenu" class="eyestudio-menu" hidden></div>
        `;
        document.body.appendChild(root);

        const presets = root.querySelector('#esPresets');
        Object.entries(PRESETS).forEach(([k, p]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'eyestudio__preset';
            b.dataset.preset = k;
            b.textContent = p.name;
            b.addEventListener('click', () => {
                pushHistory();
                layout = mergeCardLayout(p.layout);
                paint();
                toast(`Plantilla «${p.name}»`, 'success');
            });
            presets.appendChild(b);
        });

        [70, 85, 100, 115].forEach((z) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `eyestudio__btn eyestudio__btn--ghost${z === 100 ? ' is-active' : ''}`;
            b.dataset.zoom = String(z);
            b.textContent = `${z}%`;
            b.addEventListener('click', () => {
                zoomPct = z;
                root.style.setProperty('--es-zoom', String(zoomPct / 100));
                root.querySelectorAll('#esZoomGroup .eyestudio__btn').forEach((x) => x.classList.toggle('is-active', Number(x.dataset.zoom) === z));
                updateFooter();
            });
            root.querySelector('#esZoomGroup').appendChild(b);
        });

        bindEvents();
        return root;
    }

    function stageScale() {
        const st = root?.querySelector('#esStage');
        if (!st) return 1;
        const r = st.getBoundingClientRect();
        return r.width > 0 ? W / r.width : 1;
    }

    function bindDrag(el, id) {
        el.addEventListener('pointerdown', (ev) => {
            if (ev.button !== 0 && ev.pointerType === 'mouse') return;
            if (locked.has(id) || hidden.has(id)) return toast('Capa bloqueada u oculta', 'warning');
            if (tool === 'bg') return;
            if (el.isContentEditable) return;
            ev.preventDefault();
            selectedId = id;
            const snap0 = JSON.stringify(layout);
            const start = { px: ev.clientX, py: ev.clientY, ...coords(id) };
            let moved = false;
            const onMove = (e) => {
                const dx = (e.clientX - start.px) * stageScale();
                const dy = (e.clientY - start.py) * stageScale();
                if (!moved && Math.hypot(dx, dy) < DRAG_MIN) return;
                moved = true;
                const s = snapMove(id, start.x + dx, start.y + dy);
                setCoords(id, s.x, s.y);
                paint();
                drawGuides(s.guidesX, s.guidesY);
            };
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                clearGuides();
                if (moved && snap0 !== JSON.stringify(layout)) {
                    past.push(snap0);
                    if (past.length > HISTORY_MAX) past.shift();
                    future = [];
                    syncHistoryBtns();
                }
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
        el.addEventListener('dblclick', (ev) => {
            if (!['title', 'name', 'subtitle', 'overlay'].includes(id)) return;
            ev.preventDefault();
            startTextEdit(el, id);
        });
    }

    function bindBgDrag() {
        const stage = root?.querySelector('#esStage');
        stage?.addEventListener('pointerdown', (ev) => {
            if (tool !== 'bg') return;
            if (ev.target.closest('[data-layer]') && ev.target.id !== 'esBg') return;
            ev.preventDefault();
            const snap0 = JSON.stringify(layout);
            const start = { x: ev.clientX, y: ev.clientY, fx: layout.bgFocalX, fy: layout.bgFocalY };
            let moved = false;
            const onMove = (e) => {
                moved = true;
                layout.bgFocalX = clamp(start.fx - (e.clientX - start.x) / 420, 0, 1);
                layout.bgFocalY = clamp(start.fy - (e.clientY - start.y) / 260, 0, 1);
                paint();
            };
            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                if (moved && snap0 !== JSON.stringify(layout)) {
                    past.push(snap0);
                    syncHistoryBtns();
                }
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
        });
    }

    function startTextEdit(el, id) {
        if (locked.has(id)) return;
        editingId = id;
        el.contentEditable = 'true';
        el.classList.add('is-editing');
        el.focus();
        const onBlur = () => {
            el.contentEditable = 'false';
            el.classList.remove('is-editing');
            editingId = null;
            const keyMap = { title: 'title', name: 'cardNameTemplate', subtitle: 'message', overlay: 'cardOverlayText' };
            const key = keyMap[id];
            const raw = opts?.getRawCardTexts?.() || {};
            raw[key] = htmlToMarkup(el);
            opts?.onCardTextsUpdated?.(raw);
            schedulePreview();
            el.removeEventListener('blur', onBlur);
        };
        el.addEventListener('blur', onBlur);
    }

    function showFormatMenu(x, y, hasSel) {
        const menu = root?.querySelector('#esFormatMenu');
        if (!menu) return;
        menu.innerHTML = `
            <div class="eyestudio-menu__title">Formato</div>
            ${hasSel ? `<div class="eyestudio__swatches" style="padding:0.4rem">${SWATCHES.map((h) => `<button type="button" class="eyestudio__swatch" data-pick="${h}" style="background:#${h}"></button>`).join('')}</div>` : '<p class="eyestudio__hint" style="padding:0.5rem">Selecciona texto para colorear</p>'}
            <button type="button" class="eyestudio-menu__item" data-ins="{user}">Insertar {user}</button>
            <button type="button" class="eyestudio-menu__item" data-ins="{username}">Insertar {username}</button>
        `;
        menu.hidden = false;
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.querySelectorAll('[data-pick]').forEach((b) => {
            b.addEventListener('click', () => wrapColor(b.dataset.pick));
        });
        menu.querySelectorAll('[data-ins]').forEach((b) => {
            b.addEventListener('click', () => insertToken(b.dataset.ins));
        });
    }

    function wrapColor(hex) {
        const el = editingId ? root?.querySelector(`#es${editingId === 'subtitle' ? 'Sub' : editingId.charAt(0).toUpperCase() + editingId.slice(1)}`) : null;
        if (!el) return;
        const sel = global.getSelection();
        if (!sel?.rangeCount || sel.isCollapsed) return toast('Selecciona texto', 'warning');
        const range = sel.getRangeAt(0);
        const span = document.createElement('span');
        span.className = 'eyestudio-rich';
        span.setAttribute('data-c', hex);
        span.style.color = `#${hex}`;
        try {
            range.surroundContents(span);
        } catch {
            span.appendChild(range.extractContents());
            range.insertNode(span);
        }
        opts?.onCardTextsUpdated?.({ ...opts.getRawCardTexts(), ...getTextPatchFromDom() });
        root.querySelector('#esFormatMenu').hidden = true;
    }

    function insertToken(tok) {
        document.execCommand('insertText', false, tok);
        root.querySelector('#esFormatMenu').hidden = true;
    }

    function getTextPatchFromDom() {
        return {
            title: htmlToMarkup(root.querySelector('#esTitle')),
            cardNameTemplate: htmlToMarkup(root.querySelector('#esName')),
            message: htmlToMarkup(root.querySelector('#esSub')),
            cardOverlayText: htmlToMarkup(root.querySelector('#esOverlay'))
        };
    }

    function bindEvents() {
        root.querySelector('#esClose').addEventListener('click', close);
        root.querySelector('#esSave').addEventListener('click', save);
        root.querySelector('#esUndo').addEventListener('click', undo);
        root.querySelector('#esRedo').addEventListener('click', redo);
        root.querySelector('#esUploadBg').addEventListener('click', () => root.querySelector('#esBgFile').click());
        root.querySelector('#esBgFile').addEventListener('change', async (ev) => {
            const file = ev.target.files?.[0];
            ev.target.value = '';
            if (!file?.type?.startsWith('image/')) return toast('Elige una imagen', 'warning');
            const st = root.querySelector('#esUploadStatus');
            if (st) st.textContent = 'Subiendo…';
            try {
                await opts?.processAndUploadBackground?.(file);
                opts?.onBackgroundUploaded?.();
                applyBackground();
                schedulePreview();
                if (st) st.textContent = 'Listo';
                toast('Fondo actualizado', 'success');
            } catch (err) {
                if (st) st.textContent = '';
                toast(err?.message || 'Error al subir', 'error');
            }
        });

        root.querySelectorAll('[data-section]').forEach((btn) => {
            btn.addEventListener('click', () => {
                section = btn.dataset.section;
                root.querySelectorAll('[data-section]').forEach((b) => b.classList.toggle('is-active', b === btn));
                renderInspector();
            });
        });
        root.querySelectorAll('[data-tool]').forEach((btn) => {
            btn.addEventListener('click', () => {
                tool = btn.dataset.tool;
                root.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('is-active', b === btn));
                if (tool === 'bg') section = 'background';
                renderInspector();
            });
        });

        const bindToggle = (labId, overlayId, get, set) => {
            const lab = root.querySelector(labId);
            const inp = lab?.querySelector('input');
            const overlay = overlayId ? root.querySelector(overlayId) : null;
            const apply = (on) => {
                set(on);
                if (inp) inp.checked = on;
                lab?.classList.toggle('is-on', on);
                overlay?.classList.toggle('is-on', on);
            };
            apply(get());
            lab?.addEventListener('click', (e) => {
                if (e.target === inp) return;
                apply(!get());
            });
            inp?.addEventListener('change', (e) => apply(e.target.checked));
        };
        bindToggle('#esSnapToggle', null, () => snapOn, (v) => { snapOn = v; });
        bindToggle('#esGridToggle', '#esGrid', () => gridOn, (v) => { gridOn = v; });
        bindToggle('#esSafeToggle', '#esSafe', () => safeOn, (v) => { safeOn = v; });

        LAYERS.forEach((L) => {
            const sel = L.id === 'avatar' ? '#esAvatar' : `#es${L.id === 'subtitle' ? 'Sub' : L.id.charAt(0).toUpperCase() + L.id.slice(1)}`;
            const el = root.querySelector(sel);
            if (el) bindDrag(el, L.id);
        });
        bindBgDrag();

        root.addEventListener('contextmenu', (ev) => {
            const edit = ev.target.closest('.is-editing');
            if (edit) {
                ev.preventDefault();
                const sel = global.getSelection();
                showFormatMenu(ev.clientX, ev.clientY, sel && !sel.isCollapsed);
            }
        });
        document.addEventListener('click', (ev) => {
            if (!root?.classList.contains('is-open')) return;
            const menu = root.querySelector('#esFormatMenu');
            if (menu && !menu.hidden && !menu.contains(ev.target)) menu.hidden = true;
        });

        document.addEventListener('keydown', onKey);
    }

    function onKey(ev) {
        if (!root?.classList.contains('is-open')) return;
        const mod = ev.ctrlKey || ev.metaKey;
        if (mod && ev.key.toLowerCase() === 'z' && !ev.shiftKey) {
            ev.preventDefault();
            undo();
            return;
        }
        if (mod && (ev.key.toLowerCase() === 'y' || (ev.key === 'z' && ev.shiftKey))) {
            ev.preventDefault();
            redo();
            return;
        }
        if (mod && ev.key.toLowerCase() === 's') {
            ev.preventDefault();
            save();
            return;
        }
        if (editingId || ev.target.closest('input, textarea, select')) return;
        const step = ev.shiftKey ? 10 : 1;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(ev.key)) {
            ev.preventDefault();
            pushHistory();
            const c = coords(selectedId);
            if (ev.key === 'ArrowLeft') setCoords(selectedId, c.x - step, c.y);
            if (ev.key === 'ArrowRight') setCoords(selectedId, c.x + step, c.y);
            if (ev.key === 'ArrowUp') setCoords(selectedId, c.x, c.y - step);
            if (ev.key === 'ArrowDown') setCoords(selectedId, c.x, c.y + step);
            paint();
        }
        if (ev.key === 'Escape') {
            clearGuides();
            root.querySelector('#esFormatMenu').hidden = true;
        }
    }

    function open(o) {
        opts = o;
        mount();
        layout = mergeCardLayout(o.getWelcomeConfig?.()?.cardLayout);
        hidden = new Set();
        locked = new Set();
        past = [];
        future = [];
        tool = 'move';
        section = 'design';
        selectedId = 'title';
        zoomPct = 100;
        snapOn = true;
        gridOn = false;
        safeOn = true;
        root.style.setProperty('--es-zoom', '1');
        const img = root.querySelector('#esAvatarImg');
        if (img) img.src = o.getAvatarUrl?.() || 'https://cdn.discordapp.com/embed/avatars/0.png';
        root.classList.add('is-open');
        root.setAttribute('aria-hidden', 'false');
        document.body.classList.add('eyestudio-open');
        paint();
        syncHistoryBtns();
        schedulePreview();
    }

    function close() {
        if (!root) return;
        root.classList.remove('is-open');
        root.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('eyestudio-open');
        clearTimeout(previewTimer);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = '';
        opts?.onClose?.();
        opts = null;
    }

    function save() {
        opts?.applyCardLayout?.({ ...layout });
        toast('Diseño aplicado. Guarda la bienvenida en el panel.', 'success');
        close();
    }

    global.WelcomeCardStudio = {
        mergeCardLayout,
        open,
        close
    };
})(typeof window !== 'undefined' ? window : globalThis);
