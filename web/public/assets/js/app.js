(function startApp(global) {
    const SECTIONS = [
        { id: 'dashboardSection', file: 'dashboard.html' },
        { id: 'aboutSection', file: 'about.html' },
        { id: 'commandsSection', file: 'commands.html' },
        { id: 'premiumSection', file: 'premium.html' },
        { id: 'serverSection', file: 'server.html' },
        { id: 'settingsSection', file: 'settings.html' },
        { id: 'embedSection', file: 'embed.html' }
    ];

    async function fetchHtml(url) {
        const response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
        if (!response.ok) throw new Error(`No se pudo cargar ${url}`);
        return response.text();
    }

    async function mountLayoutAndScreens() {
        const app = document.getElementById('app');
        if (!app) throw new Error('No existe #app');

        app.innerHTML = await fetchHtml('/partials/layout-shell.html');
        const mount = document.getElementById('screensMount');
        if (!mount) throw new Error('No existe #screensMount');

        const chunks = await Promise.all(
            SECTIONS.map((section) => fetchHtml(`/partials/screens/${section.file}`))
        );
        mount.innerHTML = chunks.join('\n');
    }

    function renderStats(stats) {
        const box = EyedUi.byId('dashboardStats');
        if (!box || !stats) return;
        box.innerHTML = [
            EyedUi.card('Servidores', String(stats.guilds || 0), null, ''),
            EyedUi.card('Miembros', String(stats.members || 0), null, ''),
            EyedUi.card('Comandos', String(stats.commands || 0), null, ''),
            EyedUi.card('Ping', `${stats.ping || 0} ms`, 'saludable', 'ok')
        ].join('');
    }

    function renderGuilds(guilds) {
        const grid = EyedUi.byId('guildGrid');
        if (!grid) return;
        grid.innerHTML = (guilds || []).map((guild) => {
            const badge = guild.hasBot ? 'Bot activo' : 'Bot no agregado';
            const badgeClass = guild.hasBot ? 'ok' : 'off';
            return EyedUi.card(guild.name, `${guild.members} miembros`, badge, badgeClass);
        }).join('');
    }

    function renderCommands(commands) {
        const grid = EyedUi.byId('commandsGrid');
        if (!grid) return;
        const query = String(EyedUi.byId('commandSearch')?.value || '').trim().toLowerCase();
        const filtered = (commands || []).filter((cmd) => {
            const hay = `${cmd.name} ${cmd.category} ${cmd.description}`.toLowerCase();
            return !query || hay.includes(query);
        });
        grid.innerHTML = filtered.map((cmd) =>
            EyedUi.card(cmd.name, cmd.description, cmd.category, '')
        ).join('');
    }

    function applySection(sectionId) {
        EyedState.set({ activeSection: sectionId });
        EyedUi.showSection(sectionId);
    }

    async function loadData() {
        const [userPayload, guildPayload, commandPayload, statsPayload] = await Promise.all([
            EyedApi.user(),
            EyedApi.guilds(),
            EyedApi.commands(),
            EyedApi.stats()
        ]);

        EyedState.set({
            user: userPayload.user || null,
            guilds: guildPayload.guilds || [],
            commands: commandPayload.commands || [],
            stats: statsPayload || null
        });

        const state = EyedState.get();
        renderStats(state.stats);
        renderGuilds(state.guilds);
        renderCommands(state.commands);

        const userName = state.user?.username || 'Usuario';
        const settingsUser = EyedUi.byId('settingsUserName');
        if (settingsUser) settingsUser.textContent = userName;

        const ownerCard = EyedUi.byId('ownerCard');
        if (ownerCard) {
            ownerCard.classList.toggle('hidden', !Boolean(userPayload?.isOwner));
        }

        const inviteBtn = EyedUi.byId('inviteBtn');
        if (inviteBtn) {
            inviteBtn.href = userPayload?.inviteUrl || '#';
        }
    }

    function bindSearch() {
        EyedUi.safeBind('commandSearch', 'input', () => {
            renderCommands(EyedState.get().commands);
        });
    }

    async function init() {
        await mountLayoutAndScreens();
        await loadData();
        bindSearch();

        EyedRouter.initRouter(applySection);
        const entry = String(global.__EYEDBOT_ENTRY_SECTION || 'dashboardSection');
        applySection(entry);
    }

    global.EyedApp = { init };
})(window);
