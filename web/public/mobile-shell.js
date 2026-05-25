/**
 * Shell móvil: bottom nav, drawer servidor, sheet «Más», sincronía con app.js
 */
(function initEyedBotMobileShell(global) {
    const doc = global.document;
    if (!doc) return;

    const NAV_SECTIONS = {
        home: 'dashboard',
        server: 'serverSection',
        commands: 'commandsSection',
        account: 'profileSettingsSection'
    };

    let bottomNavBuilt = false;
    let serverTopbarBuilt = false;

    function isMobileActive() {
        return doc.documentElement.classList.contains('is-mobile');
    }

    function navigateToSection(sectionId) {
        const dataLink = doc.querySelector(`[data-section="${sectionId}"]`);
        if (dataLink) {
            dataLink.click();
            return;
        }
        const btnMap = {
            dashboard: 'dashboardBtn',
            commandsSection: 'aboutCommandsBtn',
            controlCenterSection: 'controlCenterBtn',
            premiumSection: 'premiumNavBtn'
        };
        const btn = doc.getElementById(btnMap[sectionId] || '');
        if (btn) {
            btn.click();
            return;
        }
        if (typeof global.showSection === 'function') global.showSection(sectionId);
    }

    function hasGuildSelected() {
        const name = doc.getElementById('serverMenuGuildName')?.textContent?.trim() || '';
        return name && name !== 'Sin servidor seleccionado';
    }

    function buildBottomNav() {
        if (bottomNavBuilt) return;
        bottomNavBuilt = true;

        const nav = doc.createElement('nav');
        nav.className = 'mobile-bottom-nav';
        nav.setAttribute('aria-label', 'Navegación principal');
        nav.innerHTML = `
            <button type="button" class="mobile-bottom-nav__btn" data-mobile-nav="home" aria-label="Inicio">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9.5z"/></svg>
                <span>Inicio</span>
            </button>
            <button type="button" class="mobile-bottom-nav__btn" data-mobile-nav="server" aria-label="Servidor">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10h8M8 14h5"/></svg>
                <span>Servidor</span>
            </button>
            <button type="button" class="mobile-bottom-nav__btn" data-mobile-nav="commands" aria-label="Comandos">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h14"/></svg>
                <span>Comandos</span>
            </button>
            <button type="button" class="mobile-bottom-nav__btn" data-mobile-nav="more" aria-label="Más">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/></svg>
                <span>Más</span>
            </button>
            <button type="button" class="mobile-bottom-nav__btn" data-mobile-nav="account" aria-label="Cuenta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/></svg>
                <span>Cuenta</span>
            </button>
        `;
        doc.body.appendChild(nav);

        const backdrop = doc.createElement('div');
        backdrop.className = 'mobile-drawer-backdrop';
        backdrop.id = 'mobileDrawerBackdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        doc.body.appendChild(backdrop);

        const sheet = doc.createElement('div');
        sheet.className = 'mobile-more-sheet';
        sheet.id = 'mobileMoreSheet';
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-label', 'Más opciones');
        sheet.innerHTML = `
            <div class="mobile-more-sheet__head">
                <h3>Más</h3>
                <button type="button" class="mobile-more-sheet__close" id="mobileMoreClose" aria-label="Cerrar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
                </button>
            </div>
            <div class="mobile-more-sheet__grid">
                <button type="button" class="mobile-more-sheet__item" data-more-section="controlCenterSection">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>
                    Acerca de
                </button>
                <button type="button" class="mobile-more-sheet__item" data-more-section="embedSection">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="2"/></svg>
                    Embed
                </button>
                <a class="mobile-more-sheet__item" href="#" id="mobileMoreDiscord">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 4.4A17.5 17.5 0 0015.5 3a12 12 0 00-.6 1.2 16.2 16.2 0 00-4.8 0A11.6 11.6 0 009.5 3 17.4 17.4 0 004.7 4.4 18.6 18.6 0 001.4 18.2a17.7 17.7 0 005.4 2.7 12.5 12.5 0 001.1-1.8 11.4 11.4 0 01-1.7-.8l.4-.3a12.2 12.2 0 0010.4 0l.4.3c-.5.3-1.1.6-1.7.8.3.7.7 1.3 1.1 1.8A17.6 17.6 0 0022.6 18.2 18.5 18.5 0 0020.3 4.4zM8.7 15.2c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm6.6 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>
                    Discord
                </a>
                <button type="button" class="mobile-more-sheet__item" id="mobileMoreAddBot">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                    Añadir bot
                </button>
                <button type="button" class="mobile-more-sheet__item" id="mobileForceDesktop">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 20h8"/></svg>
                    Vista escritorio
                </button>
            </div>
        `;
        doc.body.appendChild(sheet);

        nav.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-mobile-nav]');
            if (!btn) return;
            const key = btn.dataset.mobileNav;
            if (key === 'more') {
                openMoreSheet();
                return;
            }
            closeMoreSheet();
            closeServerDrawer();
            if (key === 'server') {
                if (hasGuildSelected()) {
                    navigateToSection('serverSection');
                } else {
                    navigateToSection('dashboard');
                    if (typeof global.showToast === 'function') {
                        global.showToast('Elige un servidor desde Inicio', 'info');
                    }
                }
            } else {
                navigateToSection(NAV_SECTIONS[key] || 'dashboard');
            }
            syncBottomNavActive();
        });

        backdrop.addEventListener('click', () => {
            closeMoreSheet();
            closeServerDrawer();
        });

        doc.getElementById('mobileMoreClose')?.addEventListener('click', closeMoreSheet);

        sheet.querySelectorAll('[data-more-section]').forEach((el) => {
            el.addEventListener('click', () => {
                closeMoreSheet();
                navigateToSection(el.dataset.moreSection);
                syncBottomNavActive();
            });
        });

        doc.getElementById('mobileMoreDiscord')?.addEventListener('click', (e) => {
            e.preventDefault();
            closeMoreSheet();
            doc.getElementById('discordBtn')?.click();
        });

        doc.getElementById('mobileMoreAddBot')?.addEventListener('click', () => {
            closeMoreSheet();
            doc.getElementById('addBotBtn')?.click();
        });

        doc.getElementById('mobileForceDesktop')?.addEventListener('click', () => {
            closeMoreSheet();
            global.EyedBotDevice?.setForceMode('desktop');
            global.location.reload();
        });
    }

    function openMoreSheet() {
        doc.getElementById('mobileMoreSheet')?.classList.add('is-open');
        doc.getElementById('mobileDrawerBackdrop')?.classList.add('is-open');
    }

    function closeMoreSheet() {
        doc.getElementById('mobileMoreSheet')?.classList.remove('is-open');
        if (!doc.querySelector('.server-side-menu.is-drawer-open')) {
            doc.getElementById('mobileDrawerBackdrop')?.classList.remove('is-open');
        }
    }

    function buildServerTopbar() {
        if (serverTopbarBuilt) return;
        const serverSection = doc.getElementById('serverSection');
        const container = serverSection?.querySelector('.container');
        if (!container) return;
        serverTopbarBuilt = true;

        const bar = doc.createElement('div');
        bar.className = 'mobile-server-topbar';
        bar.id = 'mobileServerTopbar';
        bar.innerHTML = `
            <button type="button" class="mobile-server-topbar__menu" id="mobileServerMenuBtn" aria-label="Menú del servidor">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
            <div class="mobile-server-topbar__title" id="mobileServerTopbarTitle">Servidor</div>
            <button type="button" class="mobile-server-topbar__switch" id="mobileServerSwitchBtn" aria-label="Cambiar servidor">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
            </button>
        `;
        container.insertBefore(bar, container.firstChild);

        doc.getElementById('mobileServerMenuBtn')?.addEventListener('click', () => {
            const menu = doc.querySelector('.server-side-menu');
            if (!menu) return;
            const open = menu.classList.toggle('is-drawer-open');
            doc.getElementById('mobileDrawerBackdrop')?.classList.toggle('is-open', open);
            if (open) closeMoreSheet();
        });

        doc.getElementById('mobileServerSwitchBtn')?.addEventListener('click', () => {
            closeServerDrawer();
            if (typeof global.openServerSwitcherModal === 'function') {
                void global.openServerSwitcherModal();
            } else {
                doc.getElementById('changeServerBtn')?.click();
            }
        });

        doc.querySelectorAll('.side-menu-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (isMobileActive()) closeServerDrawer();
            });
        });
    }

    function closeServerDrawer() {
        doc.querySelector('.server-side-menu')?.classList.remove('is-drawer-open');
        if (!doc.getElementById('mobileMoreSheet')?.classList.contains('is-open')) {
            doc.getElementById('mobileDrawerBackdrop')?.classList.remove('is-open');
        }
    }

    function syncBottomNavActive() {
        if (!isMobileActive()) return;
        const activeSection = doc.querySelector('.section.active');
        const id = activeSection?.id || 'dashboard';
        const map = {
            dashboard: 'home',
            serverSection: 'server',
            commandsSection: 'commands',
            profileSettingsSection: 'account',
            controlCenterSection: 'more',
            embedSection: 'more',
            statsSection: 'more',
            logsSection: 'more'
        };
        const key = map[id] || 'home';
        doc.querySelectorAll('.mobile-bottom-nav__btn').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.mobileNav === key);
        });
    }

    function updateServerTopbarTitle() {
        const titleEl = doc.getElementById('mobileServerTopbarTitle');
        if (!titleEl) return;
        const name =
            doc.getElementById('serverMenuGuildName')?.textContent?.trim() || 'Servidor';
        titleEl.textContent = name;
    }

    function injectSettingsHint() {
        const settings = doc.getElementById('profileSettingsSection');
        if (!settings || settings.querySelector('.mobile-desktop-hint')) return;
        const hint = doc.createElement('div');
        hint.className = 'mobile-desktop-hint';
        hint.innerHTML =
            '<span>Vista móvil activa.</span> <button type="button" class="btn btn-ghost btn-sm" id="mobileForceDesktopSettings">Usar escritorio</button>';
        const container = settings.querySelector('.container');
        if (container) container.insertBefore(hint, container.firstChild);
        doc.getElementById('mobileForceDesktopSettings')?.addEventListener('click', () => {
            global.EyedBotDevice?.setForceMode('desktop');
            global.location.reload();
        });
    }

    function onSectionChange(sectionId) {
        syncBottomNavActive();
        if (sectionId === 'serverSection') updateServerTopbarTitle();
        closeServerDrawer();
    }

    function onServerPaneChange() {
        updateServerTopbarTitle();
    }

    function watchGuildName() {
        const el = doc.getElementById('serverMenuGuildName');
        if (!el || el.dataset.mobileObserved === '1') return;
        el.dataset.mobileObserved = '1';
        const obs = new MutationObserver(() => updateServerTopbarTitle());
        obs.observe(el, { childList: true, characterData: true, subtree: true });
    }

    function boot() {
        buildBottomNav();
        buildServerTopbar();
        injectSettingsHint();
        watchGuildName();
        syncBottomNavActive();

        const discordLink = doc.getElementById('discordBtn');
        const mobileDiscord = doc.getElementById('mobileMoreDiscord');
        if (discordLink && mobileDiscord && discordLink.href) mobileDiscord.href = discordLink.href;
    }

    if (doc.readyState === 'loading') {
        doc.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    global.addEventListener('eyedbot:device', () => {
        if (isMobileActive()) boot();
        syncBottomNavActive();
    });

    global.EyedBotMobile = {
        onSectionChange,
        onServerPaneChange,
        syncBottomNavActive,
        closeServerDrawer,
        closeMoreSheet
    };
})(window);
