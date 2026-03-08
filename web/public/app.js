// Estado de la aplicación
let currentUser = null;
let currentGuilds = [];
let embedFields = [];
let currentEmbedTemplates = [];
let uploadedImageFile = null;
let uploadedImagePreviewUrl = '';
let uploadedThumbnailFile = null;
let uploadedThumbnailPreviewUrl = '';
let currentWelcomeConfig = null;
let currentGoodbyeConfig = null;
let currentServerGuildId = '';
let currentServerGuilds = [];
let welcomeImageFile = null;
let welcomeImagePreviewUrl = '';
let currentGreetingMode = 'welcome';
const gatedNavButtonIds = [];
let serverFeaturesUnlocked = false;
let currentServerPaneId = 'serverPaneOverview';

const DASHBOARD_ICON = `
    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7"></rect>
        <rect x="14" y="3" width="7" height="7"></rect>
        <rect x="14" y="14" width="7" height="7"></rect>
        <rect x="3" y="14" width="7" height="7"></rect>
    </svg>
`;

const HOME_ICON = `
    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 10.5L12 3l9 7.5"></path>
        <path d="M5 9.5V21h14V9.5"></path>
    </svg>
`;

function updateDashboardButtonState() {
    const dashboardBtn = document.getElementById('dashboardBtn');
    if (!dashboardBtn) return;

    if (hasSelectedGuildContext()) {
        dashboardBtn.innerHTML = `${HOME_ICON}<span>Volver a inicio</span>`;
    } else {
        dashboardBtn.innerHTML = `${DASHBOARD_ICON}<span>Dashboard</span>`;
    }
}

function setServerFeaturesNavigationVisible(isVisible) {
    gatedNavButtonIds.forEach((id) => {
        const button = document.getElementById(id);
        if (!button) return;
        button.classList.toggle('nav-hidden', !isVisible);
    });
    updateDashboardButtonState();
}

function hasSelectedGuildContext() {
    return serverFeaturesUnlocked && Boolean(currentServerGuildId);
}

function updateServerMenuIdentity() {
    const guildNameEl = document.getElementById('serverMenuGuildName');
    const guildIconEl = document.getElementById('serverMenuGuildIcon');
    if (!guildNameEl || !guildIconEl) return;

    if (!hasSelectedGuildContext()) {
        guildNameEl.textContent = 'Sin servidor seleccionado';
        guildIconEl.style.display = 'none';
        guildIconEl.src = '';
        return;
    }

    const selectedGuild = currentServerGuilds.find((g) => String(g.id) === String(currentServerGuildId));
    if (!selectedGuild) {
        guildNameEl.textContent = 'Servidor activo';
        guildIconEl.style.display = 'none';
        guildIconEl.src = '';
        return;
    }

    guildNameEl.textContent = selectedGuild.name || 'Servidor activo';
    if (selectedGuild.icon) {
        guildIconEl.style.display = 'block';
        guildIconEl.src = selectedGuild.icon;
    } else {
        guildIconEl.style.display = 'none';
        guildIconEl.src = '';
    }
}

function updateBackToServerButtonsVisibility(sectionId = '') {
    const isVisible = hasSelectedGuildContext() && ['embedSection', 'statsSection', 'logsSection', 'commandsSection'].includes(sectionId);
    ['backToServerFromEmbed', 'backToServerFromStats', 'backToServerFromLogs', 'backToServerFromCommands'].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.style.display = isVisible ? 'inline-flex' : 'none';
    });
}

const SERVER_UI_PREFS_KEY = 'eyedbot_server_ui_prefs_v1';

function getServerUIPreferences() {
    try {
        const raw = localStorage.getItem(SERVER_UI_PREFS_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function getServerPreference(guildId, key, fallback = {}) {
    const prefs = getServerUIPreferences();
    const guildPrefs = prefs[String(guildId)] || {};
    const value = guildPrefs[key];
    if (!value || typeof value !== 'object') return { ...fallback };
    return { ...fallback, ...value };
}

function setServerPreference(guildId, key, value) {
    const prefs = getServerUIPreferences();
    const guildKey = String(guildId);
    if (!prefs[guildKey] || typeof prefs[guildKey] !== 'object') prefs[guildKey] = {};
    prefs[guildKey][key] = value;
    localStorage.setItem(SERVER_UI_PREFS_KEY, JSON.stringify(prefs));
}

function clearServerBoundSectionState() {
    const channelSelect = document.getElementById('channelSelect');
    if (channelSelect) {
        channelSelect.disabled = true;
        channelSelect.innerHTML = '<option value="">Selecciona un servidor desde el Dashboard</option>';
    }

    const guildSelect = document.getElementById('guildSelect');
    if (guildSelect) {
        guildSelect.disabled = true;
        guildSelect.innerHTML = '<option value="">Selecciona un servidor en el Dashboard</option>';
    }

    const templateSelect = document.getElementById('templateSelect');
    if (templateSelect) {
        templateSelect.disabled = true;
        templateSelect.innerHTML = '<option value="">Selecciona un servidor para cargar plantillas</option>';
    }

    const serverSelect = document.getElementById('serverSelect');
    if (serverSelect) {
        serverSelect.disabled = true;
        serverSelect.innerHTML = '<option value="">Selecciona un servidor desde el Dashboard</option>';
    }

    const containerIds = ['serverTabs', 'serverInfoContainer', 'moderationContainer', 'welcomeContainer', 'verifyContainer', 'ticketContainer', 'levelsContainer', 'voiceCreatorContainer', 'automationContainer', 'securityContainer', 'notificationsContainer'];
    containerIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

function resetServerContextToDashboard() {
    serverFeaturesUnlocked = false;
    currentServerGuildId = '';
    currentServerGuilds = [];
    setServerFeaturesNavigationVisible(false);
    clearServerBoundSectionState();
    updateServerMenuIdentity();
    updateBackToServerButtonsVisibility('dashboard');
    updateDashboardButtonState();
    saveState();
}

function activateServerSideButton(button) {
    const allButtons = document.querySelectorAll('.side-menu-btn');
    allButtons.forEach((btn) => btn.classList.remove('active'));
    if (button) button.classList.add('active');
}

function switchServerPane(paneId, button = null) {
    if (!paneId) return;
    const panes = document.querySelectorAll('.server-pane');
    panes.forEach((pane) => pane.classList.remove('active'));

    const targetPane = document.getElementById(paneId);
    if (!targetPane) return;
    targetPane.classList.add('active');
    currentServerPaneId = paneId;

    if (button) activateServerSideButton(button);
}

function handleServerSideAction(button) {
    if (!button) return;

    const paneId = button.dataset.serverPane || '';
    const quickSection = button.dataset.quickSection || '';

    if (paneId) {
        showSection('serverSection');
        switchServerPane(paneId, button);
        return;
    }

    if (quickSection) {
        activateServerSideButton(button);
        showSection(quickSection);
        const quickName = (button.textContent || '').trim();
        if (quickName) {
            showToast(`Abriendo atajo rapido: ${quickName}`, 'success');
        }
    }
}

// Función auxiliar para fetch con credenciales
async function fetchWithCredentials(url, options = {}) {
    return fetch(url, {
        ...options,
        credentials: 'include' // Siempre incluir cookies
    });
}

// Clave para localStorage
const STORAGE_KEY = 'tulabot_panel_state';

// Guardar estado en localStorage
function saveState() {
    const state = {
        activeSection: document.querySelector('.section.active')?.id || 'dashboard',
        embedForm: {
            guildId: document.getElementById('guildSelect')?.value || '',
            channelId: document.getElementById('channelSelect')?.value || '',
            title: document.getElementById('embedTitle')?.value || '',
            description: document.getElementById('embedDescription')?.value || '',
            color: document.getElementById('embedColor')?.value || '#C41E3A',
            footer: document.getElementById('embedFooter')?.value || '',
            image: document.getElementById('embedImage')?.value || '',
            thumbnail: document.getElementById('embedThumbnail')?.value || '',
            imageScale: Number.parseInt(document.getElementById('embedImageScale')?.value || '100', 10),
            thumbnailScale: Number.parseInt(document.getElementById('embedThumbnailScale')?.value || '100', 10),
            imageCropX: Number.parseInt(document.getElementById('embedImageCropX')?.value || '0', 10),
            imageCropY: Number.parseInt(document.getElementById('embedImageCropY')?.value || '0', 10),
            imageCropW: Number.parseInt(document.getElementById('embedImageCropW')?.value || '100', 10),
            imageCropH: Number.parseInt(document.getElementById('embedImageCropH')?.value || '100', 10),
            thumbnailCropX: Number.parseInt(document.getElementById('embedThumbnailCropX')?.value || '0', 10),
            thumbnailCropY: Number.parseInt(document.getElementById('embedThumbnailCropY')?.value || '0', 10),
            thumbnailCropW: Number.parseInt(document.getElementById('embedThumbnailCropW')?.value || '100', 10),
            thumbnailCropH: Number.parseInt(document.getElementById('embedThumbnailCropH')?.value || '100', 10),
            timestamp: document.getElementById('embedTimestamp')?.checked || false,
            fields: []
        },
        serverSection: {
            selectedGuildId: document.getElementById('serverSelect')?.value || ''
        },
        logs: {
            levelFilter: document.getElementById('logLevelFilter')?.value || '',
            autoScroll: autoScroll !== undefined ? autoScroll : true
        }
    };

    // Guardar campos del embed
    document.querySelectorAll('.field-item').forEach(field => {
        const name = field.querySelector('.field-name')?.value || '';
        const value = field.querySelector('.field-value')?.value || '';
        const inline = field.querySelector('.field-inline')?.checked || false;
        if (name || value) {
            state.embedForm.fields.push({ name, value, inline });
        }
    });

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('No se pudo guardar el estado:', e);
    }
}

// Cargar estado desde localStorage
function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return null;
        return JSON.parse(saved);
    } catch (e) {
        console.warn('No se pudo cargar el estado:', e);
        return null;
    }
}

// Función auxiliar para escapar HTML (definida temprano)
function escapeHtmlForValue(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Restaurar estado del formulario de embed
function restoreEmbedForm(state) {
    if (!state.embedForm) return;

    const form = state.embedForm;
    
    // Restaurar valores básicos
    if (document.getElementById('embedTitle')) document.getElementById('embedTitle').value = form.title || '';
    if (document.getElementById('embedDescription')) document.getElementById('embedDescription').value = form.description || '';
    if (document.getElementById('embedColor')) document.getElementById('embedColor').value = form.color || '#C41E3A';
    if (document.getElementById('embedFooter')) document.getElementById('embedFooter').value = form.footer || '';
    if (document.getElementById('embedImage')) document.getElementById('embedImage').value = form.image || '';
    if (document.getElementById('embedThumbnail')) document.getElementById('embedThumbnail').value = form.thumbnail || '';
    if (document.getElementById('embedImageScale')) document.getElementById('embedImageScale').value = `${form.imageScale || 100}`;
    if (document.getElementById('embedThumbnailScale')) document.getElementById('embedThumbnailScale').value = `${form.thumbnailScale || 100}`;
    if (document.getElementById('embedImageScaleValue')) document.getElementById('embedImageScaleValue').textContent = `${form.imageScale || 100}%`;
    if (document.getElementById('embedThumbnailScaleValue')) document.getElementById('embedThumbnailScaleValue').textContent = `${form.thumbnailScale || 100}%`;
    if (document.getElementById('embedImageCropX')) document.getElementById('embedImageCropX').value = `${form.imageCropX || 0}`;
    if (document.getElementById('embedImageCropY')) document.getElementById('embedImageCropY').value = `${form.imageCropY || 0}`;
    if (document.getElementById('embedImageCropW')) document.getElementById('embedImageCropW').value = `${form.imageCropW || 100}`;
    if (document.getElementById('embedImageCropH')) document.getElementById('embedImageCropH').value = `${form.imageCropH || 100}`;
    if (document.getElementById('embedThumbnailCropX')) document.getElementById('embedThumbnailCropX').value = `${form.thumbnailCropX || 0}`;
    if (document.getElementById('embedThumbnailCropY')) document.getElementById('embedThumbnailCropY').value = `${form.thumbnailCropY || 0}`;
    if (document.getElementById('embedThumbnailCropW')) document.getElementById('embedThumbnailCropW').value = `${form.thumbnailCropW || 100}`;
    if (document.getElementById('embedThumbnailCropH')) document.getElementById('embedThumbnailCropH').value = `${form.thumbnailCropH || 100}`;
    if (document.getElementById('embedTimestamp')) document.getElementById('embedTimestamp').checked = form.timestamp || false;

    // Restaurar servidor y canal (después de cargar los servidores)
    if (form.guildId) {
        setTimeout(async () => {
            await loadGuildsForEmbed();
            if (document.getElementById('guildSelect')) {
                document.getElementById('guildSelect').value = form.guildId;
                await handleGuildSelect();
                
                // Esperar a que se carguen los canales antes de seleccionar
                setTimeout(() => {
                    if (document.getElementById('channelSelect') && form.channelId) {
                        document.getElementById('channelSelect').value = form.channelId;
                    }
                }, 500);
            }
        }, 100);
    }

    // Restaurar campos
    if (form.fields && form.fields.length > 0) {
        const container = document.getElementById('fieldsContainer');
        if (container) {
            container.innerHTML = '';
            form.fields.forEach((field, index) => {
                const fieldId = `field_${Date.now()}_${index}`;
                const fieldName = escapeHtmlForValue(field.name || '');
                const fieldValue = escapeHtmlForValue(field.value || '');
                const fieldHTML = `
                    <div class="field-item" id="${fieldId}">
                        <div class="field-item-header">
                            <h5>Campo ${index + 1}</h5>
                            <button type="button" class="btn-remove-field" onclick="removeField('${fieldId}')">Eliminar</button>
                        </div>
                        <div class="form-group">
                            <label>Nombre</label>
                            <input type="text" class="form-control field-name" placeholder="Nombre del campo" value="${fieldName}" oninput="updateEmbedPreview(); saveState();">
                        </div>
                        <div class="form-group">
                            <label>Valor</label>
                            <textarea class="form-control field-value" rows="2" placeholder="Valor del campo" oninput="updateEmbedPreview(); saveState();">${fieldValue}</textarea>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" class="field-inline" ${field.inline ? 'checked' : ''} onchange="updateEmbedPreview(); saveState();"> Inline
                            </label>
                        </div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', fieldHTML);
            });
            updateEmbedPreview();
        }
    }
}

// Restaurar estado de logs
function restoreLogsState(state) {
    if (!state.logs) return;
    
    if (document.getElementById('logLevelFilter') && state.logs.levelFilter) {
        document.getElementById('logLevelFilter').value = state.logs.levelFilter;
    }
    
    if (state.logs.autoScroll !== undefined) {
        autoScroll = state.logs.autoScroll;
        if (document.getElementById('autoScrollText')) {
            document.getElementById('autoScrollText').textContent = `Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`;
        }
    }
}

// Restaurar estado de servidor
function restoreServerState(state) {
    if (!state.serverSection || !state.serverSection.selectedGuildId) return;
    
    setTimeout(async () => {
        await loadGuildsForServer();
        if (document.getElementById('serverSelect') && state.serverSection.selectedGuildId) {
            document.getElementById('serverSelect').value = state.serverSection.selectedGuildId;
            // Disparar evento change para cargar la información
            const event = new Event('change');
            document.getElementById('serverSelect').dispatchEvent(event);
        }
    }, 100);
}

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    const isAuthenticated = await checkAuth();
    
    // Solo continuar si el usuario está autenticado
    if (!isAuthenticated) {
        return; // No cargar datos si no hay autenticación
    }
    
    setupEventListeners();
    
    // Cargar estado guardado
    const savedState = loadState();
    serverFeaturesUnlocked = false;
    currentServerGuildId = '';
    setServerFeaturesNavigationVisible(false);
    updateServerMenuIdentity();
    updateDashboardButtonState();
    
    await loadGuilds();
    await loadStats();
    
    // Restaurar sección activa
    if (savedState && savedState.activeSection) {
        showSection(savedState.activeSection);
    }
    
    // Restaurar estados específicos
    if (savedState) {
        restoreEmbedForm(savedState);
        restoreLogsState(savedState);
        restoreServerState(savedState);
    }
    
    // Guardar estado periódicamente y en eventos
    setInterval(saveState, 2000); // Guardar cada 2 segundos
});

// Verificar autenticación
async function checkAuth() {
    try {
        const response = await fetchWithCredentials('/api/user');
        if (response.ok) {
            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            if (!contentType.includes('application/json')) {
                window.location.replace('/login.html');
                return false;
            }

            const data = await response.json();
            if (!data || !data.user) {
                window.location.replace('/login.html');
                return false;
            }

            currentUser = data.user;
            currentGuilds = data.guilds || [];
            updateUserUI();
            return true;
        }

        if (response.status === 401) {
            const data = await response.json().catch(() => ({}));
            const target = data.redirect || '/login.html';
            window.location.replace(target);
            return false;
        }

        console.error('Error verificando autenticación:', response.status);
        if (!window.location.pathname.includes('login')) {
            window.location.replace('/login.html');
        }
        return false;
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        if (!window.location.pathname.includes('login')) {
            window.location.replace('/login.html');
        }
        return false;
    }
}

// Actualizar UI del usuario
function updateUserUI() {
    if (currentUser) {
        document.getElementById('userName').textContent = currentUser.username;
        if (currentUser.avatar) {
            document.getElementById('userAvatar').src = `https://cdn.discordapp.com/avatars/${currentUser.id}/${currentUser.avatar}.png`;
        } else {
            document.getElementById('userAvatar').src = `https://cdn.discordapp.com/embed/avatars/${currentUser.discriminator % 5}.png`;
        }
    }
}

// Configurar event listeners
function setupEventListeners() {
    // Navegación
    document.getElementById('dashboardBtn').addEventListener('click', async () => {
        if (hasSelectedGuildContext()) {
            resetServerContextToDashboard();
        }
        showSection('dashboard');
        await loadGuilds();
    });
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const sideBtn = target.closest('.side-menu-btn');
        if (!sideBtn) return;
        event.preventDefault();
        handleServerSideAction(sideBtn);
    });

    ['backToServerFromEmbed', 'backToServerFromStats', 'backToServerFromLogs', 'backToServerFromCommands'].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.addEventListener('click', () => {
            showSection('serverSection');
            switchServerPane('serverPaneSettings');
        });
    });

    const serverTabSearch = document.getElementById('serverTabSearch');
    if (serverTabSearch) {
        serverTabSearch.addEventListener('input', (event) => {
            const query = String(event.target?.value || '').trim().toLowerCase();
            document.querySelectorAll('.side-menu-btn').forEach((btn) => {
                const label = (btn.textContent || '').trim().toLowerCase();
                const isVisible = !query || label.includes(query);
                btn.classList.toggle('hidden', !isVisible);
            });

            document.querySelectorAll('.side-menu-group').forEach((group) => {
                const title = group.querySelector('h4');
                const visibleButtons = group.querySelectorAll('.side-menu-btn:not(.hidden)');
                if (title) title.classList.toggle('hidden', visibleButtons.length === 0);
            });
        });
    }

    // Menú de usuario
    document.getElementById('userMenu').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('dropdownMenu').classList.toggle('show');
    });

    document.addEventListener('click', () => {
        document.getElementById('dropdownMenu').classList.remove('show');
    });

    // Embed form
    document.getElementById('guildSelect').addEventListener('change', () => {
        handleGuildSelect();
        saveState();
    });
    document.getElementById('embedTitle').addEventListener('input', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedDescription').addEventListener('input', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedColor').addEventListener('input', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedFooter').addEventListener('input', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedImage').addEventListener('input', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedThumbnail').addEventListener('input', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedImageFile').addEventListener('change', (e) => {
        handleImageFileSelection(e, 'image');
    });
    document.getElementById('embedThumbnailFile').addEventListener('change', (e) => {
        handleImageFileSelection(e, 'thumbnail');
    });
    document.getElementById('embedImageScale').addEventListener('input', (e) => {
        document.getElementById('embedImageScaleValue').textContent = `${e.target.value}%`;
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('embedThumbnailScale').addEventListener('input', (e) => {
        document.getElementById('embedThumbnailScaleValue').textContent = `${e.target.value}%`;
        updateEmbedPreview();
        saveState();
    });
    ['embedImageCropX', 'embedImageCropY', 'embedImageCropW', 'embedImageCropH', 'embedThumbnailCropX', 'embedThumbnailCropY', 'embedThumbnailCropW', 'embedThumbnailCropH']
        .forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('input', () => {
                updateEmbedPreview();
                saveState();
            });
        });
    document.getElementById('embedTimestamp').addEventListener('change', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('channelSelect').addEventListener('change', saveState);
    document.getElementById('previewBtn').addEventListener('click', updateEmbedPreview);
    document.getElementById('sendEmbedBtn').addEventListener('click', sendEmbed);
    document.getElementById('addFieldBtn').addEventListener('click', addField);
    document.getElementById('saveTemplateBtn').addEventListener('click', saveEmbedTemplate);
    document.getElementById('loadTemplateBtn').addEventListener('click', loadSelectedTemplate);
    document.getElementById('deleteTemplateBtn').addEventListener('click', deleteSelectedTemplate);
    
    // Guardar estado al cambiar de sección
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            setTimeout(saveState, 100);
        });
    });
    
    // Guardar estado en logs
    if (document.getElementById('logLevelFilter')) {
        document.getElementById('logLevelFilter').addEventListener('change', () => {
            saveState();
        });
    }
    
    if (document.getElementById('autoScrollBtn')) {
        document.getElementById('autoScrollBtn').addEventListener('click', () => {
            setTimeout(saveState, 100);
        });
    }
    
    // Guardar estado en servidor
    if (document.getElementById('serverSelect')) {
        document.getElementById('serverSelect').addEventListener('change', () => {
            saveState();
        });
    }
}

// Mostrar sección
function showSection(sectionId) {
    if (!hasSelectedGuildContext() && ['embedSection', 'statsSection', 'commandsSection', 'logsSection', 'serverSection'].includes(sectionId)) {
        showToast('Primero selecciona un servidor en el dashboard', 'warning');
        sectionId = 'dashboard';
    }

    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    if (sectionId === 'dashboard') {
        const dashboardBtn = document.getElementById('dashboardBtn');
        if (dashboardBtn) dashboardBtn.classList.add('active');
    } else if (sectionId === 'embedSection') {
        loadGuildsForEmbed();
    } else if (sectionId === 'statsSection') {
        loadStats();
    } else if (sectionId === 'logsSection') {
        loadLogs();
    } else if (sectionId === 'commandsSection') {
        loadCommands();
    } else if (sectionId === 'serverSection') {
        loadGuildsForServer();
        switchServerPane(currentServerPaneId || 'serverPaneOverview');
    }

    updateBackToServerButtonsVisibility(sectionId);
    
    // Guardar sección activa
    saveState();
}

// Cargar servidores
async function loadGuilds() {
    try {
        const response = await fetchWithCredentials('/api/guilds');
        if (response.ok) {
            const guilds = await response.json();
            displayGuilds(guilds);
        } else {
            showToast('Error al cargar servidores', 'error');
        }
    } catch (error) {
        console.error('Error cargando servidores:', error);
        showToast('Error al cargar servidores', 'error');
    }
}

// Mostrar servidores
function displayGuilds(guilds) {
    const container = document.getElementById('guildsList');
    
    if (guilds.length === 0) {
        container.innerHTML = '<div class="loading">No hay servidores disponibles</div>';
        return;
    }

    container.innerHTML = guilds.map(guild => `
        <div class="guild-card" onclick="selectGuild('${guild.id}')">
            <div class="guild-icon">
                ${guild.icon ? `<img src="${guild.icon}" alt="${guild.name}" style="width: 100%; height: 100%; border-radius: 12px; object-fit: cover;">` : `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 40px; height: 40px; color: var(--fate-red);">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                `}
            </div>
            <div class="guild-name">${escapeHtml(guild.name)}</div>
            <div class="guild-info">
                ${guild.botGuild?.memberCount || 0} miembros
            </div>
        </div>
    `).join('');
}

// Cargar servidores para el formulario de embed
async function loadGuildsForEmbed() {
    try {
        const response = await fetchWithCredentials('/api/guilds');
        if (response.ok) {
            const guilds = await response.json();
            const select = document.getElementById('guildSelect');
            const channelSelect = document.getElementById('channelSelect');

            if (!hasSelectedGuildContext()) {
                select.disabled = true;
                select.innerHTML = '<option value="">Selecciona un servidor en el Dashboard</option>';
                if (channelSelect) {
                    channelSelect.disabled = true;
                    channelSelect.innerHTML = '<option value="">Selecciona un servidor desde el Dashboard</option>';
                }
                return;
            }

            const selectedGuild = guilds.find((g) => String(g.id) === String(currentServerGuildId));
            if (!selectedGuild) {
                select.disabled = true;
                select.innerHTML = '<option value="">Servidor seleccionado no disponible</option>';
                if (channelSelect) {
                    channelSelect.disabled = true;
                    channelSelect.innerHTML = '<option value="">Servidor seleccionado no disponible</option>';
                }
                return;
            }

            select.disabled = true;
            select.innerHTML = `<option value="${selectedGuild.id}">${escapeHtml(selectedGuild.name)}</option>`;
            select.value = selectedGuild.id;
            await handleGuildSelect();
        }
    } catch (error) {
        console.error('Error cargando servidores:', error);
    }
}

// Manejar selección de servidor
async function handleGuildSelect() {
    const guildId = document.getElementById('guildSelect').value;
    const channelSelect = document.getElementById('channelSelect');
    
    if (!guildId) {
        channelSelect.disabled = true;
        channelSelect.innerHTML = '<option value="">Primero selecciona un servidor</option>';
        renderTemplateSelect([]);
        return;
    }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/channels`);
        if (response.ok) {
            const channels = await response.json();
            channelSelect.disabled = false;
            channelSelect.innerHTML = '<option value="">Selecciona un canal</option>' +
                channels
                    .filter(ch => ch.type === 0) // Solo canales de texto
                    .map(ch => `<option value="${ch.id}"># ${ch.name}</option>`).join('');
            await loadEmbedTemplates(guildId);
        } else {
            showToast('Error al cargar canales', 'error');
        }
    } catch (error) {
        console.error('Error cargando canales:', error);
        showToast('Error al cargar canales', 'error');
    }
}

function renderTemplateSelect(templates) {
    const select = document.getElementById('templateSelect');
    if (!select) return;

    currentEmbedTemplates = Array.isArray(templates) ? templates : [];

    if (!currentEmbedTemplates.length) {
        select.disabled = true;
        select.innerHTML = '<option value="">No hay plantillas guardadas</option>';
        return;
    }

    select.disabled = false;
    select.innerHTML = '<option value="">Selecciona una plantilla</option>' +
        currentEmbedTemplates.map((t) => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
}

async function loadEmbedTemplates(guildId) {
    if (!guildId) {
        renderTemplateSelect([]);
        return;
    }

    try {
        const response = await fetchWithCredentials(`/api/embed-templates/${guildId}`);
        if (!response.ok) {
            renderTemplateSelect([]);
            return;
        }

        const templates = await response.json();
        renderTemplateSelect(templates);
    } catch (error) {
        console.error('Error cargando plantillas:', error);
        renderTemplateSelect([]);
    }
}

// Agregar campo al embed
function addField() {
    const container = document.getElementById('fieldsContainer');
    const fieldId = `field_${Date.now()}`;
    
    const fieldHTML = `
        <div class="field-item" id="${fieldId}">
            <div class="field-item-header">
                <h5>Campo ${container.children.length + 1}</h5>
                <button type="button" class="btn-remove-field" onclick="removeField('${fieldId}')">Eliminar</button>
            </div>
            <div class="form-group">
                <label>Nombre</label>
                <input type="text" class="form-control field-name" placeholder="Nombre del campo" oninput="updateEmbedPreview(); saveState();">
            </div>
            <div class="form-group">
                <label>Valor</label>
                <textarea class="form-control field-value" rows="2" placeholder="Valor del campo" oninput="updateEmbedPreview(); saveState();"></textarea>
            </div>
            <div class="form-group">
                <label>
                    <input type="checkbox" class="field-inline" onchange="updateEmbedPreview(); saveState();"> Inline
                </label>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', fieldHTML);
    updateEmbedPreview();
    saveState();
}

// Eliminar campo
function removeField(fieldId) {
    document.getElementById(fieldId).remove();
    updateEmbedPreview();
    saveState();
}

function getEmbedPayloadFromForm() {
    const embed = {
        title: document.getElementById('embedTitle').value,
        description: document.getElementById('embedDescription').value,
        color: document.getElementById('embedColor').value.replace('#', ''),
        footer: document.getElementById('embedFooter').value,
        image: document.getElementById('embedImage').value || null,
        thumbnail: document.getElementById('embedThumbnail').value || null,
        timestamp: document.getElementById('embedTimestamp').checked,
        fields: []
    };

    document.querySelectorAll('.field-item').forEach(field => {
        const name = field.querySelector('.field-name').value;
        const value = field.querySelector('.field-value').value;
        const inline = field.querySelector('.field-inline').checked;

        if (name && value) {
            embed.fields.push({ name, value, inline });
        }
    });

    return embed;
}

function applyEmbedToForm(embed = {}) {
    document.getElementById('embedTitle').value = embed.title || '';
    document.getElementById('embedDescription').value = embed.description || '';
    document.getElementById('embedColor').value = embed.color ? `#${embed.color}` : '#C41E3A';
    document.getElementById('embedFooter').value = embed.footer || '';
    document.getElementById('embedImage').value = embed.image || '';
    document.getElementById('embedThumbnail').value = embed.thumbnail || '';
    document.getElementById('embedTimestamp').checked = !!embed.timestamp;

    const container = document.getElementById('fieldsContainer');
    container.innerHTML = '';

    (embed.fields || []).forEach((field, index) => {
        const fieldId = `field_${Date.now()}_${index}`;
        const fieldHTML = `
            <div class="field-item" id="${fieldId}">
                <div class="field-item-header">
                    <h5>Campo ${index + 1}</h5>
                    <button type="button" class="btn-remove-field" onclick="removeField('${fieldId}')">Eliminar</button>
                </div>
                <div class="form-group">
                    <label>Nombre</label>
                    <input type="text" class="form-control field-name" placeholder="Nombre del campo" value="${escapeHtmlForValue(field.name || '')}" oninput="updateEmbedPreview(); saveState();">
                </div>
                <div class="form-group">
                    <label>Valor</label>
                    <textarea class="form-control field-value" rows="2" placeholder="Valor del campo" oninput="updateEmbedPreview(); saveState();">${escapeHtmlForValue(field.value || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>
                        <input type="checkbox" class="field-inline" ${field.inline ? 'checked' : ''} onchange="updateEmbedPreview(); saveState();"> Inline
                    </label>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', fieldHTML);
    });

    updateEmbedPreview();
    saveState();
}

async function saveEmbedTemplate() {
    const guildId = document.getElementById('guildSelect').value;
    const name = document.getElementById('templateName').value.trim();
    if (!guildId) return showToast('Selecciona un servidor para guardar la plantilla', 'warning');
    if (!name) return showToast('Escribe un nombre para la plantilla', 'warning');

    try {
        const response = await fetchWithCredentials('/api/embed-templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId, name, embed: getEmbedPayloadFromForm() })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) return showToast(data.error || 'No se pudo guardar la plantilla', 'error');

        showToast('Plantilla guardada', 'success');
        await loadEmbedTemplates(guildId);
    } catch (error) {
        console.error('Error guardando plantilla:', error);
        showToast('Error guardando plantilla', 'error');
    }
}

function loadSelectedTemplate() {
    const selected = document.getElementById('templateSelect').value;
    if (!selected) return showToast('Selecciona una plantilla', 'warning');
    const tpl = currentEmbedTemplates.find((t) => t.id === selected);
    if (!tpl) return showToast('Plantilla no encontrada', 'error');
    applyEmbedToForm(tpl.embed || {});
    showToast('Plantilla cargada', 'success');
}

async function deleteSelectedTemplate() {
    const guildId = document.getElementById('guildSelect').value;
    const selected = document.getElementById('templateSelect').value;
    if (!guildId || !selected) return showToast('Selecciona una plantilla para eliminar', 'warning');

    try {
        const response = await fetchWithCredentials(`/api/embed-templates/${guildId}/${selected}`, {
            method: 'DELETE'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return showToast(data.error || 'No se pudo eliminar la plantilla', 'error');
        showToast('Plantilla eliminada', 'success');
        await loadEmbedTemplates(guildId);
    } catch (error) {
        console.error('Error eliminando plantilla:', error);
        showToast('Error eliminando plantilla', 'error');
    }
}

// Actualizar vista previa del embed
function updateEmbedPreview() {
    const title = document.getElementById('embedTitle').value;
    const description = document.getElementById('embedDescription').value;
    const color = document.getElementById('embedColor').value;
    const footer = document.getElementById('embedFooter').value;
    const image = document.getElementById('embedImage').value;
    const thumbnail = document.getElementById('embedThumbnail').value;
    const imageScale = Number.parseInt(document.getElementById('embedImageScale').value || '100', 10);
    const thumbnailScale = Number.parseInt(document.getElementById('embedThumbnailScale').value || '100', 10);
    const timestamp = document.getElementById('embedTimestamp').checked;

    const imageSource = uploadedImagePreviewUrl || image;
    const thumbSource = uploadedThumbnailPreviewUrl || thumbnail;

    const preview = document.getElementById('embedPreview');
    
    if (!title && !description && !footer) {
        preview.innerHTML = '<div class="embed-placeholder">El embed aparecerá aquí</div>';
        return;
    }

    let fieldsHTML = '';
    document.querySelectorAll('.field-item').forEach(field => {
        const name = field.querySelector('.field-name').value;
        const value = field.querySelector('.field-value').value;
        const inline = field.querySelector('.field-inline').checked;
        
        if (name && value) {
            fieldsHTML += `
                <div class="discord-embed-field" style="display: ${inline ? 'inline-block' : 'block'}; width: ${inline ? '48%' : '100%'};">
                    <div class="discord-embed-field-name">${escapeHtml(name)}</div>
                    <div class="discord-embed-field-value">${escapeHtml(value)}</div>
                </div>
            `;
        }
    });

    preview.innerHTML = `
        <div class="discord-embed" style="border-left-color: ${color};">
            ${title ? `<div class="discord-embed-title">${escapeHtml(title)}</div>` : ''}
            ${description ? `<div class="discord-embed-description">${escapeHtml(description)}</div>` : ''}
            ${thumbSource ? `<img src="${thumbSource}" alt="Thumbnail" class="discord-embed-thumbnail" style="float: right; max-width: ${Math.max(30, Math.round(80 * (thumbnailScale / 100)))}px; border-radius: 4px; margin-left: 1rem;">` : ''}
            ${fieldsHTML ? `<div class="discord-embed-fields">${fieldsHTML}</div>` : ''}
            ${imageSource ? `<img src="${imageSource}" alt="Image" class="discord-embed-image" style="max-width: ${imageScale}%;">` : ''}
            ${footer || timestamp ? `<div class="discord-embed-footer">${footer || ''} ${timestamp ? '• ' + new Date().toLocaleString() : ''}</div>` : ''}
        </div>
    `;
}

function handleImageFileSelection(event, target) {
    const file = event.target.files?.[0] || null;
    if (!file) {
        if (target === 'image') {
            uploadedImageFile = null;
            uploadedImagePreviewUrl = '';
        } else {
            uploadedThumbnailFile = null;
            uploadedThumbnailPreviewUrl = '';
        }
        updateEmbedPreview();
        saveState();
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('Solo puedes subir archivos de imagen', 'warning');
        event.target.value = '';
        return;
    }

    const previewUrl = URL.createObjectURL(file);
    if (target === 'image') {
        uploadedImageFile = file;
        if (uploadedImagePreviewUrl) URL.revokeObjectURL(uploadedImagePreviewUrl);
        uploadedImagePreviewUrl = previewUrl;
    } else {
        uploadedThumbnailFile = file;
        if (uploadedThumbnailPreviewUrl) URL.revokeObjectURL(uploadedThumbnailPreviewUrl);
        uploadedThumbnailPreviewUrl = previewUrl;
    }

    updateEmbedPreview();
    saveState();
}

function getCropSettings(target) {
    if (target === 'thumbnail') {
        return {
            x: Number.parseInt(document.getElementById('embedThumbnailCropX')?.value || '0', 10),
            y: Number.parseInt(document.getElementById('embedThumbnailCropY')?.value || '0', 10),
            w: Number.parseInt(document.getElementById('embedThumbnailCropW')?.value || '100', 10),
            h: Number.parseInt(document.getElementById('embedThumbnailCropH')?.value || '100', 10)
        };
    }

    return {
        x: Number.parseInt(document.getElementById('embedImageCropX')?.value || '0', 10),
        y: Number.parseInt(document.getElementById('embedImageCropY')?.value || '0', 10),
        w: Number.parseInt(document.getElementById('embedImageCropW')?.value || '100', 10),
        h: Number.parseInt(document.getElementById('embedImageCropH')?.value || '100', 10)
    };
}

function resizeImageFile(file, scalePercent = 100, maxSide = 1600, crop = { x: 0, y: 0, w: 100, h: 100 }) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type.startsWith('image/')) return resolve(file);

        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const cropX = Math.max(0, Math.min(100, Number(crop?.x) || 0));
                const cropY = Math.max(0, Math.min(100, Number(crop?.y) || 0));
                const cropW = Math.max(1, Math.min(100, Number(crop?.w) || 100));
                const cropH = Math.max(1, Math.min(100, Number(crop?.h) || 100));

                const sx = Math.round((cropX / 100) * img.width);
                const sy = Math.round((cropY / 100) * img.height);
                const maxCropW = img.width - sx;
                const maxCropH = img.height - sy;
                const sw = Math.max(1, Math.min(maxCropW, Math.round((cropW / 100) * img.width)));
                const sh = Math.max(1, Math.min(maxCropH, Math.round((cropH / 100) * img.height)));

                const scale = Math.max(0.25, Math.min(1, scalePercent / 100));
                let width = Math.max(1, Math.round(sw * scale));
                let height = Math.max(1, Math.round(sh * scale));

                const largest = Math.max(width, height);
                if (largest > maxSide) {
                    const ratio = maxSide / largest;
                    width = Math.max(1, Math.round(width * ratio));
                    height = Math.max(1, Math.round(height * ratio));
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (!blob) return resolve(file);
                    resolve(new File([blob], file.name.replace(/\s+/g, '_'), { type: blob.type || 'image/jpeg' }));
                }, file.type && file.type !== 'image/gif' ? file.type : 'image/jpeg', 0.9);
            };
            img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
            img.src = reader.result;
        };
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(file);
    });
}

// Enviar embed
async function sendEmbed() {
    const guildId = document.getElementById('guildSelect').value;
    const channelId = document.getElementById('channelSelect').value;

    if (!guildId || !channelId) {
        showToast('Por favor selecciona un servidor y un canal', 'warning');
        return;
    }

    const embed = getEmbedPayloadFromForm();
    const imageScale = Number.parseInt(document.getElementById('embedImageScale').value || '100', 10);
    const thumbnailScale = Number.parseInt(document.getElementById('embedThumbnailScale').value || '100', 10);

    try {
        const formData = new FormData();
        formData.append('guildId', guildId);
        formData.append('channelId', channelId);

        if (uploadedImageFile) {
            const resizedMain = await resizeImageFile(uploadedImageFile, imageScale, 1600, getCropSettings('image'));
            const imageName = `embed_image_${Date.now()}.${(resizedMain.name.split('.').pop() || 'jpg').toLowerCase()}`;
            formData.append('imageFile', resizedMain, imageName);
            embed.image = `attachment://${imageName}`;
        }

        if (uploadedThumbnailFile) {
            const resizedThumb = await resizeImageFile(uploadedThumbnailFile, thumbnailScale, 512, getCropSettings('thumbnail'));
            const thumbName = `embed_thumb_${Date.now()}.${(resizedThumb.name.split('.').pop() || 'jpg').toLowerCase()}`;
            formData.append('thumbnailFile', resizedThumb, thumbName);
            embed.thumbnail = `attachment://${thumbName}`;
        }

        formData.append('embed', JSON.stringify(embed));

        const response = await fetchWithCredentials('/api/send-embed', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Embed enviado correctamente', 'success');
            // Limpiar formulario
            document.getElementById('embedTitle').value = '';
            document.getElementById('embedDescription').value = '';
            document.getElementById('embedFooter').value = '';
            document.getElementById('embedImage').value = '';
            document.getElementById('embedThumbnail').value = '';
            document.getElementById('embedImageFile').value = '';
            document.getElementById('embedThumbnailFile').value = '';
            document.getElementById('embedImageScale').value = '100';
            document.getElementById('embedThumbnailScale').value = '100';
            document.getElementById('embedImageScaleValue').textContent = '100%';
            document.getElementById('embedThumbnailScaleValue').textContent = '100%';
            document.getElementById('embedImageCropX').value = '0';
            document.getElementById('embedImageCropY').value = '0';
            document.getElementById('embedImageCropW').value = '100';
            document.getElementById('embedImageCropH').value = '100';
            document.getElementById('embedThumbnailCropX').value = '0';
            document.getElementById('embedThumbnailCropY').value = '0';
            document.getElementById('embedThumbnailCropW').value = '100';
            document.getElementById('embedThumbnailCropH').value = '100';
            document.getElementById('embedTimestamp').checked = false;
            document.getElementById('fieldsContainer').innerHTML = '';
            if (uploadedImagePreviewUrl) URL.revokeObjectURL(uploadedImagePreviewUrl);
            if (uploadedThumbnailPreviewUrl) URL.revokeObjectURL(uploadedThumbnailPreviewUrl);
            uploadedImageFile = null;
            uploadedImagePreviewUrl = '';
            uploadedThumbnailFile = null;
            uploadedThumbnailPreviewUrl = '';
            updateEmbedPreview();
            saveState(); // Guardar estado limpio
        } else {
            showToast(data.error || 'Error al enviar embed', 'error');
        }
    } catch (error) {
        console.error('Error enviando embed:', error);
        showToast('Error al enviar embed', 'error');
    }
}

// Cargar estadísticas
async function loadStats() {
    try {
        const response = await fetchWithCredentials('/api/stats');
        if (response.ok) {
            const stats = await response.json();
            document.getElementById('statGuilds').textContent = stats.guilds || 0;
            document.getElementById('statUsers').textContent = stats.users || 0;
            document.getElementById('statChannels').textContent = stats.channels || 0;
            document.getElementById('statPing').textContent = Number.isFinite(stats.ping) && stats.ping >= 0 ? stats.ping : '--';
            document.getElementById('statCommands').textContent = stats.commands || 0;
            
            // Formatear uptime
            const uptime = stats.uptime || 0;
            const days = Math.floor(uptime / 86400000);
            const hours = Math.floor((uptime % 86400000) / 3600000);
            const minutes = Math.floor((uptime % 3600000) / 60000);
            document.getElementById('statUptime').textContent = `${days}d ${hours}h ${minutes}m`;
            
            // Mostrar información del sistema
            if (stats.memory) {
                const systemInfo = document.getElementById('systemInfo');
                systemInfo.innerHTML = `
                    <div class="system-info-card">
                        <h4>Memoria</h4>
                        <div class="system-info-item">
                            <span class="system-info-label">Heap Usado</span>
                            <span class="system-info-value">${(stats.memory.heapUsed / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                        <div class="system-info-item">
                            <span class="system-info-label">Heap Total</span>
                            <span class="system-info-value">${(stats.memory.heapTotal / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                        <div class="system-info-item">
                            <span class="system-info-label">RSS</span>
                            <span class="system-info-value">${(stats.memory.rss / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                    </div>
                    <div class="system-info-card">
                        <h4>Sistema</h4>
                        <div class="system-info-item">
                            <span class="system-info-label">Node.js</span>
                            <span class="system-info-value">${stats.nodeVersion || 'N/A'}</span>
                        </div>
                        <div class="system-info-item">
                            <span class="system-info-label">Plataforma</span>
                            <span class="system-info-value">${stats.platform || 'N/A'}</span>
                        </div>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

// Cargar logs
let autoScroll = true;
let logsEventSource = null;
let logsInterval = null;
let logsListenersSetup = false;

async function loadLogs() {
    const container = document.getElementById('logsContainer');
    
    try {
        container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando logs...</p></div>';
        
        const response = await fetchWithCredentials('/api/logs?limit=100');
        if (response.ok) {
            const logs = await response.json();
            if (logs && logs.length > 0) {
                displayLogs(logs);
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p>No hay logs disponibles aún</p></div>';
            }
        } else {
            const error = await response.json().catch(() => ({ error: 'Error al cargar logs' }));
            container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>${error.error || 'Error al cargar logs'}</p></div>`;
        }
        
        // Configurar auto-scroll
        container.scrollTop = container.scrollHeight;
        
        // Event listeners (solo una vez)
        if (!logsListenersSetup) {
            logsListenersSetup = true;
            
            document.getElementById('logLevelFilter').addEventListener('change', async (e) => {
                const level = e.target.value;
                const response = await fetchWithCredentials(`/api/logs?limit=100${level ? '&level=' + level : ''}`);
                if (response.ok) {
                    const logs = await response.json();
                    displayLogs(logs || []);
                }
                saveState();
            });
            
            document.getElementById('clearLogsBtn').addEventListener('click', () => {
                container.innerHTML = '';
                saveState();
            });
            
            document.getElementById('autoScrollBtn').addEventListener('click', () => {
                autoScroll = !autoScroll;
                document.getElementById('autoScrollText').textContent = `Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`;
                saveState();
            });
        }
        
        // Limpiar intervalo anterior si existe
        if (logsInterval) {
            clearInterval(logsInterval);
        }
        
        // Actualizar logs cada 2 segundos
        logsInterval = setInterval(async () => {
            const level = document.getElementById('logLevelFilter').value;
            const response = await fetchWithCredentials(`/api/logs?limit=100${level ? '&level=' + level : ''}`);
            if (response.ok) {
                const logs = await response.json();
                if (logs && logs.length > 0) {
                    displayLogs(logs);
                    if (autoScroll) {
                        container.scrollTop = container.scrollHeight;
                    }
                }
            }
        }, 2000);
    } catch (error) {
        console.error('Error cargando logs:', error);
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>Error al cargar logs: ${error.message}</p></div>`;
    }
}

function displayLogs(logs) {
    const container = document.getElementById('logsContainer');
    if (!logs || logs.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);"><p>No hay logs disponibles</p></div>';
        return;
    }
    
    container.innerHTML = logs.map(log => {
        const date = new Date(log.timestamp);
        const timeStr = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const level = log.level || 'info';
        const levelColors = {
            'info': 'var(--fate-gold)',
            'warn': 'var(--warning-color)',
            'error': 'var(--error-color)'
        };
        
        return `
            <div class="log-entry" style="padding: 0.5rem 0; border-bottom: 1px dashed rgba(255,255,255,0.1); display: flex; gap: 1rem; align-items: flex-start;">
                <span style="color: var(--text-muted); min-width: 100px; font-size: 0.85rem;">[${timeStr}]</span>
                <span style="color: ${levelColors[level] || 'var(--text-secondary)'}; font-weight: 600; min-width: 60px; text-transform: uppercase; font-size: 0.85rem;">${level}</span>
                <span style="color: var(--text-secondary); flex-grow: 1; word-break: break-word; font-family: 'Fira Code', monospace; font-size: 0.9rem;">${escapeHtml(log.message || 'Sin mensaje')}</span>
            </div>
        `;
    }).join('');
    
    // Auto-scroll si está habilitado
    if (autoScroll) {
        container.scrollTop = container.scrollHeight;
    }
}

// Cargar comandos
async function loadCommands() {
    const container = document.getElementById('commandsContainer');
    
    try {
        container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando comandos...</p></div>';
        
        const response = await fetchWithCredentials('/api/commands');
        if (response.ok) {
            const commands = await response.json();
            if (commands && commands.length > 0) {
                displayCommands(commands);
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p>No hay comandos disponibles</p></div>';
            }
        } else {
            const error = await response.json().catch(() => ({ error: 'Error al cargar comandos' }));
            container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>${error.error || 'Error al cargar comandos'}</p></div>`;
        }
    } catch (error) {
        console.error('Error cargando comandos:', error);
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>Error al cargar comandos: ${error.message}</p></div>`;
    }
}

function displayCommands(commands) {
    const container = document.getElementById('commandsContainer');
    
    if (!commands || commands.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p>No hay comandos disponibles</p></div>';
        return;
    }
    
    // Agrupar por categoría (extraer de la ruta del archivo o usar 'other')
    const categories = {};
    commands.forEach(cmd => {
        // Intentar obtener la categoría del nombre del comando o usar 'other'
        let cat = 'other';
        if (cmd.category) {
            cat = cmd.category;
        } else {
            // Intentar inferir de la estructura
            cat = 'other';
        }
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(cmd);
    });
    
    if (Object.keys(categories).length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p>No hay comandos disponibles</p></div>';
        return;
    }
    
    const categoryNames = {
        'config': 'Configuración',
        'fun': 'Diversión',
        'moderation': 'Moderación',
        'music': 'Música',
        'utility': 'Utilidades',
        'other': 'Otros'
    };
    
    container.innerHTML = Object.entries(categories).map(([category, cmds]) => `
        <div class="command-card">
            <h3 style="color: var(--fate-red); margin-bottom: 1rem; font-family: 'Cinzel', serif; text-transform: capitalize;">
                ${categoryNames[category] || category.charAt(0).toUpperCase() + category.slice(1)}
            </h3>
            ${cmds.map(cmd => `
                <div style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1);">
                    <div style="font-weight: 600; color: var(--fate-gold); font-size: 1.1rem; margin-bottom: 0.5rem;">/${cmd.name || 'comando'}</div>
                    <div style="color: var(--text-secondary); margin-bottom: 0.75rem;">${cmd.description || 'Sin descripción'}</div>
                    ${cmd.options && cmd.options.length > 0 ? `
                        <div style="margin-top: 0.75rem; padding-left: 1rem; border-left: 2px solid var(--fate-red);">
                            <strong style="color: var(--text-secondary); font-size: 0.9rem; display: block; margin-bottom: 0.5rem;">Opciones:</strong>
                            ${cmd.options.map(opt => `
                                <div style="margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.9rem;">
                                    <strong style="color: var(--fate-gold);">${opt.name || 'opción'}</strong>: ${opt.description || 'Sin descripción'}
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    `).join('');
}

// Cargar servidores para sección de servidor

function renderServerTabs(guilds, selectedGuildId = '') {
    const tabsContainer = document.getElementById('serverTabs');
    if (!tabsContainer) return;

    if (!Array.isArray(guilds) || !guilds.length) {
        tabsContainer.innerHTML = '<div class="server-tabs-empty">No hay servidores disponibles</div>';
        return;
    }

    tabsContainer.innerHTML = guilds.map((guild) => {
        const isActive = String(guild.id) === String(selectedGuildId);
        return `
            <button type="button" class="server-tab-btn ${isActive ? 'active' : ''}" data-guild-id="${guild.id}" disabled>
                ${guild.icon ? `<img class="server-tab-icon" src="${guild.icon}" alt="${escapeHtml(guild.name)}">` : '<div class="server-tab-icon server-tab-icon-placeholder">#</div>'}
                <span class="server-tab-name">${escapeHtml(guild.name)}</span>
            </button>
        `;
    }).join('');
}

async function selectServerGuild(guildId) {
    const serverInfoContainer = document.getElementById('serverInfoContainer');
    const moderationContainer = document.getElementById('moderationContainer');
    const welcomeContainer = document.getElementById('welcomeContainer');
    const verifyContainer = document.getElementById('verifyContainer');
    const ticketContainer = document.getElementById('ticketContainer');
    const levelsContainer = document.getElementById('levelsContainer');
    const voiceCreatorContainer = document.getElementById('voiceCreatorContainer');
    const automationContainer = document.getElementById('automationContainer');
    const securityContainer = document.getElementById('securityContainer');
    const notificationsContainer = document.getElementById('notificationsContainer');
    const serverSelect = document.getElementById('serverSelect');

    if (!guildId) {
        currentServerGuildId = '';
        setServerFeaturesNavigationVisible(serverFeaturesUnlocked && hasSelectedGuildContext());
        if (serverSelect) serverSelect.value = '';
        renderServerTabs(currentServerGuilds, '');
        if (serverInfoContainer) serverInfoContainer.innerHTML = '';
        if (moderationContainer) moderationContainer.innerHTML = '';
        if (welcomeContainer) welcomeContainer.innerHTML = '';
        if (verifyContainer) verifyContainer.innerHTML = '';
        if (ticketContainer) ticketContainer.innerHTML = '';
        if (levelsContainer) levelsContainer.innerHTML = '';
        if (voiceCreatorContainer) voiceCreatorContainer.innerHTML = '';
        if (automationContainer) automationContainer.innerHTML = '';
        if (securityContainer) securityContainer.innerHTML = '';
        if (notificationsContainer) notificationsContainer.innerHTML = '';
        saveState();
        return;
    }

    currentServerGuildId = guildId;
    setServerFeaturesNavigationVisible(serverFeaturesUnlocked && hasSelectedGuildContext());
    updateServerMenuIdentity();
    if (serverSelect) serverSelect.value = guildId;
    renderServerTabs(currentServerGuilds, guildId);

    if (serverInfoContainer) {
        serverInfoContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando información...</p></div>';
    }
    if (moderationContainer) moderationContainer.innerHTML = '';
    if (welcomeContainer) {
        welcomeContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando sistema de bienvenida...</p></div>';
    }
    if (verifyContainer) {
        verifyContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando sistema de verificación...</p></div>';
    }
    if (ticketContainer) {
        ticketContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando sistema de tickets...</p></div>';
    }
    if (levelsContainer) {
        levelsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando sistema de niveles...</p></div>';
    }
    if (voiceCreatorContainer) {
        voiceCreatorContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando canales de voz temporales...</p></div>';
    }
    if (automationContainer) {
        automationContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando opciones de automatización...</p></div>';
    }
    if (securityContainer) {
        securityContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando opciones de seguridad...</p></div>';
    }
    if (notificationsContainer) {
        notificationsContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando notificaciones...</p></div>';
    }

    await loadServerInfo(guildId);
    await loadServerMembers(guildId);
    await loadWelcomePanel(guildId);
    await loadVerifyPanel(guildId);
    await loadTicketPanel(guildId);
    await loadLevelsPanel(guildId);
    await loadVoiceCreatorPanel(guildId);
    await loadAutomationPanel(guildId);
    await loadSecurityPanel(guildId);
    await loadNotificationsPanel(guildId);
    saveState();
}

async function loadGuildsForServer() {
    try {
        const select = document.getElementById('serverSelect');
        const tabsContainer = document.getElementById('serverTabs');
        const serverInfoContainer = document.getElementById('serverInfoContainer');
        const moderationContainer = document.getElementById('moderationContainer');
        const welcomeContainer = document.getElementById('welcomeContainer');
        const verifyContainer = document.getElementById('verifyContainer');
        const ticketContainer = document.getElementById('ticketContainer');
        const levelsContainer = document.getElementById('levelsContainer');
        const voiceCreatorContainer = document.getElementById('voiceCreatorContainer');
        const automationContainer = document.getElementById('automationContainer');
        const securityContainer = document.getElementById('securityContainer');
        const notificationsContainer = document.getElementById('notificationsContainer');
        
        // Limpiar contenedores
        serverInfoContainer.innerHTML = '';
        moderationContainer.innerHTML = '';
        if (welcomeContainer) welcomeContainer.innerHTML = '';
        if (verifyContainer) verifyContainer.innerHTML = '';
        if (ticketContainer) ticketContainer.innerHTML = '';
        if (levelsContainer) levelsContainer.innerHTML = '';
        if (voiceCreatorContainer) voiceCreatorContainer.innerHTML = '';
        if (automationContainer) automationContainer.innerHTML = '';
        if (securityContainer) securityContainer.innerHTML = '';
        if (notificationsContainer) notificationsContainer.innerHTML = '';
        if (tabsContainer) tabsContainer.innerHTML = '';
        
        if (!hasSelectedGuildContext()) {
            if (select) {
                select.disabled = true;
                select.innerHTML = '<option value="">Selecciona un servidor desde el Dashboard</option>';
            }
            return;
        }

        const response = await fetchWithCredentials('/api/guilds');
        if (response.ok) {
            const guilds = await response.json();
            currentServerGuilds = Array.isArray(guilds) ? guilds : [];
            updateServerMenuIdentity();

            const selectedGuild = guilds.find((g) => String(g.id) === String(currentServerGuildId));
            if (!selectedGuild) {
                select.disabled = true;
                select.innerHTML = '<option value="">Servidor seleccionado no disponible</option>';
                return;
            }

            select.disabled = true;
            select.innerHTML = `<option value="${selectedGuild.id}">${escapeHtml(selectedGuild.name)}</option>`;
            select.value = selectedGuild.id;
            renderServerTabs([selectedGuild], selectedGuild.id);
            await selectServerGuild(selectedGuild.id);
        } else {
            const error = await response.json().catch(() => ({ error: 'Error al cargar servidores' }));
            select.innerHTML = '<option value="">Error al cargar servidores</option>';
            showToast(error.error || 'Error al cargar servidores', 'error');
        }
    } catch (error) {
        console.error('Error cargando servidores:', error);
        showToast('Error al cargar servidores', 'error');
    }
}

function collectPanelValues(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return {};
    const values = {};
    container.querySelectorAll('[data-pref-key]').forEach((el) => {
        const key = el.getAttribute('data-pref-key');
        if (!key) return;
        if (el.type === 'checkbox') {
            values[key] = !!el.checked;
        } else if (el.tagName === 'SELECT' && el.multiple) {
            values[key] = Array.from(el.selectedOptions || []).map((opt) => opt.value);
        } else {
            values[key] = el.value;
        }
    });
    return values;
}

async function loadVoiceCreatorPanel(guildId) {
    const container = document.getElementById('voiceCreatorContainer');
    if (!container) return;

    try {
        const [channelsResponse, configResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/temp-voice-config`)
        ]);

        if (!channelsResponse.ok || !configResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar el sistema de voz temporal.</div>';
            return;
        }

        const channels = await channelsResponse.json();
        const config = await configResponse.json();

        const voiceChannels = (Array.isArray(channels) ? channels : []).filter((c) => c.type === 2);
        const categories = (Array.isArray(channels) ? channels : []).filter((c) => c.type === 4);

        container.innerHTML = `
            <h3 class="welcome-panel-title">Canales de Voz Temporales</h3>
            <p class="welcome-panel-subtitle">Al entrar al canal creador, el bot genera automáticamente tu canal de voz y lo elimina cuando queda vacío.</p>
            <div class="welcome-layout">
                <div class="welcome-editor">
                    <div class="form-row">
                        <div class="form-group checkbox-group">
                            <label><input type="checkbox" id="tempVoiceEnabled" ${config.enabled ? 'checked' : ''}> <span>Activar sistema de voz temporal</span></label>
                        </div>
                        <div class="form-group checkbox-group">
                            <label><input type="checkbox" id="tempVoiceAllowCustomNames" ${config.allowCustomNames !== false ? 'checked' : ''}> <span>Permitir nombre personalizado por usuario</span></label>
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="tempVoiceCreatorChannel">Canal creador (voz)</label>
                            <select id="tempVoiceCreatorChannel" class="form-control">
                                <option value="">Selecciona un canal de voz</option>
                                ${voiceChannels.map((c) => `<option value="${c.id}" ${String(config.creatorChannelId || '') === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="tempVoiceCategory">Categoría para canales creados</label>
                            <select id="tempVoiceCategory" class="form-control">
                                <option value="">Usar categoría del canal creador</option>
                                ${categories.map((c) => `<option value="${c.id}" ${String(config.categoryId || '') === String(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="tempVoiceTemplate">Formato del nombre automático</label>
                            <input type="text" id="tempVoiceTemplate" class="form-control" value="${escapeHtmlForValue(config.channelNameTemplate || 'Canal de {username}')}" placeholder="Canal de {username}">
                            <small style="color:var(--text-muted);">Variables: <code>{username}</code>, <code>{displayName}</code></small>
                        </div>
                        <div class="form-group">
                            <label for="tempVoiceUserLimit">Límite de usuarios (0 = sin límite)</label>
                            <input type="number" min="0" max="99" id="tempVoiceUserLimit" class="form-control" value="${Math.max(0, Number.parseInt(config.userLimit || 0, 10) || 0)}">
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" id="saveTempVoiceBtn" class="btn btn-primary">Guardar sistema de voz temporal</button>
                    </div>
                </div>

                <div class="welcome-preview-panel">
                    <h4>Como usarlo</h4>
                    <p style="color:var(--text-secondary); margin-bottom:0.65rem;">1. El usuario entra al canal creador.</p>
                    <p style="color:var(--text-secondary); margin-bottom:0.65rem;">2. Se crea su canal privado temporal.</p>
                    <p style="color:var(--text-secondary); margin-bottom:0.65rem;">3. Cuando se vacía, se elimina solo.</p>
                    <p style="color:var(--text-secondary); margin-top:0.8rem;">Nombre personalizado: <code>/voznombre nombre:&lt;tu nombre&gt;</code>.</p>
                    <p style="color:var(--text-secondary); margin-top:0.45rem;">Privado/público: <code>/vozprivado activar:true|false</code>.</p>
                    <p style="color:var(--text-secondary); margin-top:0.45rem;">Invitar a privado: <code>/vozinvitar usuario:@alguien</code>.</p>
                    <p style="color:var(--text-secondary); margin-top:0.45rem;">Quitar del privado: <code>/vozquitar usuario:@alguien</code>.</p>
                </div>
            </div>
        `;

        const saveBtn = document.getElementById('saveTempVoiceBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const payload = {
                    enabled: document.getElementById('tempVoiceEnabled')?.checked ?? false,
                    allowCustomNames: document.getElementById('tempVoiceAllowCustomNames')?.checked ?? true,
                    creatorChannelId: document.getElementById('tempVoiceCreatorChannel')?.value || '',
                    categoryId: document.getElementById('tempVoiceCategory')?.value || '',
                    channelNameTemplate: document.getElementById('tempVoiceTemplate')?.value || 'Canal de {username}',
                    userLimit: Math.max(0, Math.min(99, Number.parseInt(document.getElementById('tempVoiceUserLimit')?.value || '0', 10) || 0))
                };

                if (!payload.creatorChannelId) {
                    showToast('Selecciona el canal creador de voz', 'warning');
                    return;
                }

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/temp-voice-config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo guardar el sistema de voz temporal', 'error');
                        return;
                    }
                    showToast('Sistema de voz temporal guardado', 'success');
                    await loadVoiceCreatorPanel(guildId);
                } catch (error) {
                    console.error('Error guardando voz temporal:', error);
                    showToast('Error guardando voz temporal', 'error');
                }
            });
        }
    } catch (error) {
        console.error('Error cargando sistema de voz temporal:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando sistema de voz temporal.</div>';
    }
}

async function loadAutomationPanel(guildId) {
    const container = document.getElementById('automationContainer');
    if (!container) return;

    const defaults = {
        antiSpamEnabled: true,
        spamMessages: '6',
        spamWindow: '10',
        antiLinksEnabled: true,
        antiCapsEnabled: false,
        antiInvitesEnabled: true,
        antiFloodAttachments: false,
        maxMentions: '5',
        raidMode: 'balanced',
        punishmentMode: 'mute'
    };
    const prefs = getServerPreference(guildId, 'automation', defaults);

    container.innerHTML = `
        <h3 class="welcome-panel-title">Centro de automatizacion</h3>
        <p class="welcome-panel-subtitle">Configura reglas rapidas para prevenir spam y comportamiento abusivo sin perder control manual.</p>
        <div class="control-grid">
            <div class="control-card">
                <h4>Anti Spam</h4>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="antiSpamEnabled" ${prefs.antiSpamEnabled ? 'checked' : ''}> Activar filtro</label>
                <div class="form-row" style="margin-top:0.6rem;">
                    <div class="form-group">
                        <label>Mensajes límite</label>
                        <input type="number" min="3" max="20" class="form-control" data-pref-key="spamMessages" value="${escapeHtmlForValue(prefs.spamMessages)}">
                    </div>
                    <div class="form-group">
                        <label>Ventana (s)</label>
                        <input type="number" min="3" max="60" class="form-control" data-pref-key="spamWindow" value="${escapeHtmlForValue(prefs.spamWindow)}">
                    </div>
                </div>
            </div>
            <div class="control-card">
                <h4>Contenido</h4>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="antiLinksEnabled" ${prefs.antiLinksEnabled ? 'checked' : ''}> Bloquear enlaces sospechosos</label>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="antiCapsEnabled" ${prefs.antiCapsEnabled ? 'checked' : ''}> Bloquear exceso de mayúsculas</label>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="antiInvitesEnabled" ${prefs.antiInvitesEnabled ? 'checked' : ''}> Bloquear invitaciones externas</label>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="antiFloodAttachments" ${prefs.antiFloodAttachments ? 'checked' : ''}> Limitar flood de adjuntos</label>
                <div class="form-group" style="margin-top:0.6rem;">
                    <label>Máximo menciones por mensaje</label>
                    <input type="number" min="1" max="25" class="form-control" data-pref-key="maxMentions" value="${escapeHtmlForValue(prefs.maxMentions)}">
                </div>
            </div>
            <div class="control-card">
                <h4>Modo anti-raid</h4>
                <div class="form-group">
                    <label>Perfil</label>
                    <select class="form-control" data-pref-key="raidMode">
                        <option value="soft" ${prefs.raidMode === 'soft' ? 'selected' : ''}>Suave</option>
                        <option value="balanced" ${prefs.raidMode === 'balanced' ? 'selected' : ''}>Equilibrado</option>
                        <option value="strict" ${prefs.raidMode === 'strict' ? 'selected' : ''}>Estricto</option>
                    </select>
                </div>
                <div class="form-group" style="margin-top:0.55rem;">
                    <label>Accion automatica</label>
                    <select class="form-control" data-pref-key="punishmentMode">
                        <option value="warn" ${prefs.punishmentMode === 'warn' ? 'selected' : ''}>Advertir</option>
                        <option value="mute" ${prefs.punishmentMode === 'mute' ? 'selected' : ''}>Silenciar</option>
                        <option value="kick" ${prefs.punishmentMode === 'kick' ? 'selected' : ''}>Expulsar</option>
                    </select>
                </div>
                <small style="color:var(--text-muted);">Puedes usar presets y luego ajustar campos puntuales.</small>
            </div>
        </div>
        <div class="form-actions" style="margin-top:1rem;">
            <button type="button" class="btn btn-secondary" id="presetSoftAutomationBtn">Preset Suave</button>
            <button type="button" class="btn btn-secondary" id="presetStrictAutomationBtn">Preset Estricto</button>
            <button type="button" class="btn btn-primary" id="saveAutomationBtn">Guardar Automatización</button>
        </div>
    `;

    const presetSoftBtn = document.getElementById('presetSoftAutomationBtn');
    const presetStrictBtn = document.getElementById('presetStrictAutomationBtn');
    if (presetSoftBtn) {
        presetSoftBtn.addEventListener('click', () => {
            const softPreset = {
                antiSpamEnabled: true,
                spamMessages: '8',
                spamWindow: '12',
                antiLinksEnabled: false,
                antiCapsEnabled: false,
                antiInvitesEnabled: true,
                antiFloodAttachments: false,
                maxMentions: '8',
                raidMode: 'soft',
                punishmentMode: 'warn'
            };
            setServerPreference(guildId, 'automation', softPreset);
            showToast('Preset suave aplicado', 'success');
            loadAutomationPanel(guildId);
        });
    }
    if (presetStrictBtn) {
        presetStrictBtn.addEventListener('click', () => {
            const strictPreset = {
                antiSpamEnabled: true,
                spamMessages: '4',
                spamWindow: '8',
                antiLinksEnabled: true,
                antiCapsEnabled: true,
                antiInvitesEnabled: true,
                antiFloodAttachments: true,
                maxMentions: '3',
                raidMode: 'strict',
                punishmentMode: 'mute'
            };
            setServerPreference(guildId, 'automation', strictPreset);
            showToast('Preset estricto aplicado', 'success');
            loadAutomationPanel(guildId);
        });
    }

    const saveBtn = document.getElementById('saveAutomationBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const values = collectPanelValues('automationContainer');
            setServerPreference(guildId, 'automation', values);
            showToast('Opciones de automatizacion guardadas', 'success');
        });
    }
}

async function loadSecurityPanel(guildId) {
    const container = document.getElementById('securityContainer');
    if (!container) return;

    try {
        const [infoResponse, channelsResponse, configResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/info`),
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/anti-raid-config`)
        ]);

        if (!infoResponse.ok || !channelsResponse.ok || !configResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar la configuración anti-raid.</div>';
            return;
        }

        const info = await infoResponse.json();
        const cfg = await configResponse.json();
        const channels = (await channelsResponse.json()).filter((c) => c.type === 0);
        const roles = (Array.isArray(info?.roles) ? info.roles : []).filter((r) => r && r.id && r.name && r.name !== '@everyone');
        const verificationLevel = String(info?.verificationLevel ?? 'unknown');
        const trustedSet = new Set(Array.isArray(cfg.trustedRoleIds) ? cfg.trustedRoleIds.map(String) : []);

        container.innerHTML = `
            <h3 class="welcome-panel-title">Centro de seguridad anti-raid</h3>
            <p class="welcome-panel-subtitle">Protege contra spam, raids de joins y cambios destructivos de canales/roles en segundos.</p>
            <div class="control-grid">
                <div class="control-card">
                    <h4>Estado y acción</h4>
                    <label class="checkbox-inline"><input type="checkbox" id="antiRaidEnabled" ${cfg.enabled !== false ? 'checked' : ''}> Activar anti-raid</label>
                    <div class="form-group" style="margin-top:0.55rem;">
                        <label>Acción automática</label>
                        <select id="antiRaidActionMode" class="form-control">
                            <option value="timeout" ${cfg.actionMode === 'timeout' ? 'selected' : ''}>Timeout</option>
                            <option value="kick" ${cfg.actionMode === 'kick' ? 'selected' : ''}>Kick</option>
                            <option value="ban" ${cfg.actionMode === 'ban' ? 'selected' : ''}>Ban</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-top:0.55rem;">
                        <label>Minutos timeout (si aplica)</label>
                        <input type="number" min="1" max="40320" id="antiRaidTimeoutMinutes" class="form-control" value="${Math.max(1, Number.parseInt(cfg.timeoutMinutes || 30, 10) || 30)}">
                    </div>
                    <div class="form-group" style="margin-top:0.55rem;">
                        <label>Canal de alertas</label>
                        <select id="antiRaidAlertChannelId" class="form-control">
                            <option value="">Sin alertas</option>
                            ${channels.map((c) => `<option value="${c.id}" ${String(cfg.alertChannelId || '') === String(c.id) ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="control-card">
                    <h4>Protección de mensajes</h4>
                    <label class="checkbox-inline"><input type="checkbox" id="antiRaidSpamEnabled" ${cfg.antiSpamEnabled !== false ? 'checked' : ''}> Anti spam</label>
                    <label class="checkbox-inline"><input type="checkbox" id="antiRaidBlockInvites" ${cfg.blockInvites !== false ? 'checked' : ''}> Bloquear invitaciones</label>
                    <label class="checkbox-inline"><input type="checkbox" id="antiRaidBlockLinks" ${cfg.blockLinks === true ? 'checked' : ''}> Bloquear enlaces sospechosos</label>
                    <div class="form-grid" style="margin-top:0.45rem;">
                        <div class="form-group">
                            <label>Mensajes límite</label>
                            <input type="number" min="3" max="40" id="antiRaidSpamMessages" class="form-control" value="${Math.max(3, Number.parseInt(cfg.spamMessages || 7, 10) || 7)}">
                        </div>
                        <div class="form-group">
                            <label>Ventana spam (s)</label>
                            <input type="number" min="3" max="120" id="antiRaidSpamWindowSec" class="form-control" value="${Math.max(3, Number.parseInt(cfg.spamWindowSec || 8, 10) || 8)}">
                        </div>
                    </div>
                    <div class="form-group" style="margin-top:0.55rem;">
                        <label>Máximo menciones por mensaje</label>
                        <input type="number" min="1" max="50" id="antiRaidMaxMentions" class="form-control" value="${Math.max(1, Number.parseInt(cfg.maxMentions || 6, 10) || 6)}">
                    </div>
                </div>

                <div class="control-card">
                    <h4>Entrada y destrucción</h4>
                    <p style="color:var(--text-secondary); margin-bottom:0.45rem;">Verificación Discord actual: <strong>${escapeHtml(verificationLevel)}</strong></p>
                    <div class="form-group">
                        <label>Joins por minuto (umbral raid)</label>
                        <input type="number" min="2" max="60" id="antiRaidJoinRateThreshold" class="form-control" value="${Math.max(2, Number.parseInt(cfg.joinRateThreshold || 8, 10) || 8)}">
                    </div>
                    <div class="form-group" style="margin-top:0.55rem;">
                        <label>Edad mínima de cuenta (días)</label>
                        <input type="number" min="0" max="365" id="antiRaidAccountAgeDays" class="form-control" value="${Math.max(0, Number.parseInt(cfg.accountAgeDays || 3, 10) || 3)}">
                    </div>
                    <label class="checkbox-inline"><input type="checkbox" id="antiRaidProtectChannels" ${cfg.protectChannels !== false ? 'checked' : ''}> Proteger canales (creación/eliminación masiva)</label>
                    <label class="checkbox-inline"><input type="checkbox" id="antiRaidProtectRoles" ${cfg.protectRoles !== false ? 'checked' : ''}> Proteger roles (creación/eliminación masiva)</label>
                    <div class="form-grid" style="margin-top:0.45rem;">
                        <div class="form-group">
                            <label>Acciones destructivas permitidas</label>
                            <input type="number" min="1" max="30" id="antiRaidDestructiveActionThreshold" class="form-control" value="${Math.max(1, Number.parseInt(cfg.destructiveActionThreshold || 3, 10) || 3)}">
                        </div>
                        <div class="form-group">
                            <label>Ventana (s)</label>
                            <input type="number" min="10" max="300" id="antiRaidActionWindowSec" class="form-control" value="${Math.max(10, Number.parseInt(cfg.actionWindowSec || 60, 10) || 60)}">
                        </div>
                    </div>
                </div>

                <div class="control-card">
                    <h4>Roles confiables</h4>
                    <p style="color:var(--text-secondary); margin-bottom:0.45rem;">Estos roles quedan exentos del anti-raid.</p>
                    <select id="antiRaidTrustedRoles" class="form-control" multiple style="min-height:180px;">
                        ${roles.map((role) => `<option value="${role.id}" ${trustedSet.has(String(role.id)) ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}
                    </select>
                </div>
            </div>

            <div class="form-actions" style="margin-top:1rem;">
                <button type="button" class="btn btn-primary" id="saveAntiRaidBtn">Guardar Anti-Raid</button>
            </div>
        `;

        const saveBtn = document.getElementById('saveAntiRaidBtn');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const trustedRolesEl = document.getElementById('antiRaidTrustedRoles');
                const trustedRoleIds = trustedRolesEl
                    ? Array.from(trustedRolesEl.selectedOptions || []).map((opt) => opt.value)
                    : [];

                const payload = {
                    enabled: document.getElementById('antiRaidEnabled')?.checked ?? true,
                    antiSpamEnabled: document.getElementById('antiRaidSpamEnabled')?.checked ?? true,
                    spamMessages: Number.parseInt(document.getElementById('antiRaidSpamMessages')?.value || '7', 10) || 7,
                    spamWindowSec: Number.parseInt(document.getElementById('antiRaidSpamWindowSec')?.value || '8', 10) || 8,
                    blockInvites: document.getElementById('antiRaidBlockInvites')?.checked ?? true,
                    blockLinks: document.getElementById('antiRaidBlockLinks')?.checked ?? false,
                    maxMentions: Number.parseInt(document.getElementById('antiRaidMaxMentions')?.value || '6', 10) || 6,
                    joinRateThreshold: Number.parseInt(document.getElementById('antiRaidJoinRateThreshold')?.value || '8', 10) || 8,
                    accountAgeDays: Number.parseInt(document.getElementById('antiRaidAccountAgeDays')?.value || '3', 10) || 3,
                    actionMode: document.getElementById('antiRaidActionMode')?.value || 'timeout',
                    timeoutMinutes: Number.parseInt(document.getElementById('antiRaidTimeoutMinutes')?.value || '30', 10) || 30,
                    protectChannels: document.getElementById('antiRaidProtectChannels')?.checked ?? true,
                    protectRoles: document.getElementById('antiRaidProtectRoles')?.checked ?? true,
                    destructiveActionThreshold: Number.parseInt(document.getElementById('antiRaidDestructiveActionThreshold')?.value || '3', 10) || 3,
                    actionWindowSec: Number.parseInt(document.getElementById('antiRaidActionWindowSec')?.value || '60', 10) || 60,
                    trustedRoleIds,
                    alertChannelId: document.getElementById('antiRaidAlertChannelId')?.value || ''
                };

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/anti-raid-config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo guardar anti-raid', 'error');
                        return;
                    }
                    showToast('Configuración anti-raid guardada', 'success');
                    await loadSecurityPanel(guildId);
                } catch (error) {
                    console.error('Error guardando anti-raid:', error);
                    showToast('Error guardando anti-raid', 'error');
                }
            });
        }
    } catch (error) {
        console.error('Error cargando anti-raid:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando centro de seguridad anti-raid.</div>';
    }
}

async function loadNotificationsPanel(guildId) {
    const container = document.getElementById('notificationsContainer');
    if (!container) return;

    const defaults = {
        notifyChannelId: '',
        joinLeave: true,
        moderationActions: true,
        ticketAlerts: true,
        levelingAlerts: false,
        streamAlerts: false,
        dailyDigest: false,
        digestHour: '21'
    };
    const prefs = getServerPreference(guildId, 'notifications', defaults);

    const channelsResponse = await fetchWithCredentials(`/api/guild/${guildId}/channels`).catch(() => null);
    const channels = channelsResponse && channelsResponse.ok
        ? (await channelsResponse.json()).filter((c) => c.type === 0)
        : [];

    container.innerHTML = `
        <h3 class="welcome-panel-title">Centro de notificaciones</h3>
        <p class="welcome-panel-subtitle">Define que eventos quieres notificar y en que canal centralizarlos.</p>
        <div class="control-grid">
            <div class="control-card">
                <h4>Canal principal</h4>
                <div class="form-group">
                    <label>Canal de notificaciones</label>
                    <select class="form-control" data-pref-key="notifyChannelId">
                        <option value="">Selecciona un canal</option>
                        ${channels.map((c) => `<option value="${c.id}" ${String(prefs.notifyChannelId) === String(c.id) ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="control-card">
                <h4>Eventos</h4>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="joinLeave" ${prefs.joinLeave ? 'checked' : ''}> Entradas / salidas</label>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="moderationActions" ${prefs.moderationActions ? 'checked' : ''}> Acciones de moderación</label>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="ticketAlerts" ${prefs.ticketAlerts ? 'checked' : ''}> Alertas de tickets</label>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="levelingAlerts" ${prefs.levelingAlerts ? 'checked' : ''}> Subidas de nivel</label>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="streamAlerts" ${prefs.streamAlerts ? 'checked' : ''}> Twitch / YouTube</label>
                <label class="checkbox-inline"><input type="checkbox" data-pref-key="dailyDigest" ${prefs.dailyDigest ? 'checked' : ''}> Resumen diario</label>
                <div class="form-group" style="margin-top:0.55rem;">
                    <label>Hora del resumen (0-23)</label>
                    <input type="number" min="0" max="23" class="form-control" data-pref-key="digestHour" value="${escapeHtmlForValue(prefs.digestHour)}">
                </div>
            </div>
        </div>
        <div class="form-actions" style="margin-top:1rem;">
            <button type="button" class="btn btn-secondary" id="testNotificationsBtn">Enviar prueba visual</button>
            <button type="button" class="btn btn-primary" id="saveNotificationsBtn">Guardar Notificaciones</button>
        </div>
    `;

    const saveBtn = document.getElementById('saveNotificationsBtn');
    const testBtn = document.getElementById('testNotificationsBtn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            const values = collectPanelValues('notificationsContainer');
            const channelId = values.notifyChannelId ? `#${values.notifyChannelId}` : 'sin canal';
            showToast(`Prueba enviada (simulada) en ${channelId}`, 'success');
        });
    }
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const values = collectPanelValues('notificationsContainer');
            setServerPreference(guildId, 'notifications', values);
            showToast('Opciones de notificaciones guardadas', 'success');
        });
    }
}

function collectVerifyConfigFromForm() {
    return {
        enabled: document.getElementById('verifyEnabled')?.checked ?? true,
        channelId: document.getElementById('verifyChannelSelect')?.value || '',
        roleId: document.getElementById('verifyRoleSelect')?.value || '',
        emoji: document.getElementById('verifyEmoji')?.value?.trim() || '✅',
        title: document.getElementById('verifyTitle')?.value || 'Verify',
        message: document.getElementById('verifyMessage')?.value || '¡Reacciona a este mensaje para ver los demás canales!',
        color: (document.getElementById('verifyColor')?.value || '#7c4dff').replace('#', ''),
        footer: document.getElementById('verifyFooter')?.value || '',
        imageUrl: document.getElementById('verifyImageUrl')?.value || '',
        removeRoleOnUnreact: document.getElementById('verifyRemoveOnUnreact')?.checked ?? false,
        messageId: document.getElementById('verifyMessageId')?.value || ''
    };
}

async function saveVerifyConfig(guildId, showSuccessToast = true) {
    const payload = collectVerifyConfigFromForm();
    if (!payload.channelId || !payload.roleId) {
        showToast('Selecciona canal y rol de verificación', 'warning');
        return false;
    }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/verify-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo guardar verificación', 'error');
            return false;
        }

        if (showSuccessToast) showToast('Configuración de verificación guardada', 'success');
        if (document.getElementById('verifyMessageId')) {
            document.getElementById('verifyMessageId').value = data.config?.messageId || payload.messageId || '';
        }
        return true;
    } catch (error) {
        console.error('Error guardando verify config:', error);
        showToast('Error guardando verificación', 'error');
        return false;
    }
}

async function publishVerifyEmbed(guildId) {
    const saved = await saveVerifyConfig(guildId, false);
    if (!saved) return;

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/verify-publish`, {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo publicar verify embed', 'error');
            return;
        }

        if (document.getElementById('verifyMessageId')) {
            document.getElementById('verifyMessageId').value = data.messageId || '';
        }
        if (document.getElementById('verifyEnabled')) {
            document.getElementById('verifyEnabled').checked = true;
        }

        showToast('Embed de verificación publicado', 'success');
    } catch (error) {
        console.error('Error publicando verify embed:', error);
        showToast('Error publicando verify embed', 'error');
    }
}

async function uploadVerifyImage(guildId) {
    const fileInput = document.getElementById('verifyImageFile');
    const imageUrlInput = document.getElementById('verifyImageUrl');
    const status = document.getElementById('verifyImageUploadStatus');
    const file = fileInput?.files?.[0] || null;

    if (!file) {
        showToast('Selecciona una imagen primero', 'warning');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('Solo puedes subir archivos de imagen', 'warning');
        return;
    }

    if (status) status.textContent = 'Subiendo imagen...';

    try {
        const formData = new FormData();
        formData.append('imageFile', file, `verify_${Date.now()}_${file.name}`);

        const response = await fetchWithCredentials(`/api/guild/${guildId}/verify-image`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.url) {
            showToast(data.error || 'No se pudo subir la imagen de verify', 'error');
            if (status) status.textContent = '';
            return;
        }

        if (imageUrlInput) imageUrlInput.value = data.url;
        if (status) status.textContent = 'Imagen subida';
        showToast('Imagen de verify subida correctamente', 'success');
    } catch (error) {
        console.error('Error subiendo imagen verify:', error);
        showToast('Error subiendo imagen verify', 'error');
        if (status) status.textContent = '';
    }
}

async function loadVerifyPanel(guildId) {
    const container = document.getElementById('verifyContainer');
    if (!container) return;

    try {
        const [infoResponse, channelsResponse, configResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/info`),
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/verify-config`)
        ]);

        if (!infoResponse.ok || !channelsResponse.ok || !configResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar el sistema de verificación.</div>';
            return;
        }

        const info = await infoResponse.json();
        const channels = (await channelsResponse.json()).filter((c) => c.type === 0);
        const cfg = await configResponse.json();

        const roles = (Array.isArray(info?.roles) ? info.roles : [])
            .filter((role) => role && role.id && role.name && role.name !== '@everyone')
            .sort((a, b) => (b.position || 0) - (a.position || 0));

        container.innerHTML = `
            <h3 class="welcome-panel-title">Sistema de Verificación</h3>
            <p class="welcome-panel-subtitle">Publica un embed con reacción para asignar automáticamente el rol de verificado.</p>
            <div class="welcome-layout">
                <div class="welcome-editor">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="verifyChannelSelect">Canal de verificación</label>
                            <select id="verifyChannelSelect" class="form-control">
                                <option value="">Selecciona un canal</option>
                                ${channels.map((c) => `<option value="${c.id}" ${cfg.channelId === c.id ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="verifyRoleSelect">Rol de verificado</label>
                            <select id="verifyRoleSelect" class="form-control">
                                <option value="">Selecciona un rol</option>
                                ${roles.map((r) => `<option value="${r.id}" ${cfg.roleId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group checkbox-group">
                            <label><input type="checkbox" id="verifyEnabled" ${cfg.enabled ? 'checked' : ''}> <span>Activar sistema de verificación</span></label>
                        </div>
                        <div class="form-group checkbox-group">
                            <label><input type="checkbox" id="verifyRemoveOnUnreact" ${cfg.removeRoleOnUnreact ? 'checked' : ''}> <span>Quitar rol al quitar reacción</span></label>
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="verifyEmoji">Emoji de reacción</label>
                            <input type="text" id="verifyEmoji" class="form-control" value="${escapeHtmlForValue(cfg.emoji || '✅')}" placeholder="✅ o <:emoji:id>">
                        </div>
                        <div class="form-group">
                            <label for="verifyColor">Color del embed</label>
                            <input type="color" id="verifyColor" class="form-control color-input" value="#${(cfg.color || '7c4dff').replace('#', '')}">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="verifyTitle">Título</label>
                        <input type="text" id="verifyTitle" class="form-control" value="${escapeHtmlForValue(cfg.title || 'Verify')}">
                    </div>

                    <div class="form-group">
                        <label for="verifyMessage">Mensaje</label>
                        <textarea id="verifyMessage" class="form-control" rows="4">${escapeHtmlForValue(cfg.message || '¡Reacciona a este mensaje para ver los demás canales!')}</textarea>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="verifyFooter">Footer</label>
                            <input type="text" id="verifyFooter" class="form-control" value="${escapeHtmlForValue(cfg.footer || '')}">
                        </div>
                        <div class="form-group">
                            <label for="verifyImageUrl">URL imagen (opcional)</label>
                            <input type="url" id="verifyImageUrl" class="form-control" value="${escapeHtmlForValue(cfg.imageUrl || '')}" placeholder="https://...">
                            <input type="file" id="verifyImageFile" class="form-control" accept="image/*" style="margin-top:0.5rem;">
                            <div class="form-actions" style="margin-top:0.5rem;">
                                <button type="button" id="verifyUploadImageBtn" class="btn btn-secondary">Subir Imagen</button>
                                <small id="verifyImageUploadStatus"></small>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="verifyMessageId">Message ID publicado</label>
                        <input type="text" id="verifyMessageId" class="form-control" value="${escapeHtmlForValue(cfg.messageId || '')}" readonly>
                    </div>

                    <div class="form-actions">
                        <button type="button" id="saveVerifyBtn" class="btn btn-secondary">Guardar Configuración</button>
                        <button type="button" id="publishVerifyBtn" class="btn btn-primary">Publicar Verify Embed</button>
                    </div>
                </div>

                <div class="welcome-preview-panel">
                    <h4>Resumen</h4>
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">Canal: <strong>${cfg.channelId ? escapeHtml(channels.find((c) => c.id === cfg.channelId)?.name || 'Desconocido') : 'No configurado'}</strong></p>
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">Rol: <strong>${cfg.roleId ? escapeHtml(roles.find((r) => r.id === cfg.roleId)?.name || 'Desconocido') : 'No configurado'}</strong></p>
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">Emoji: <strong>${escapeHtml(cfg.emoji || '✅')}</strong></p>
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">Estado: <strong>${cfg.enabled ? 'Activo' : 'Inactivo'}</strong></p>
                    ${cfg.messageId ? `<p style="color: var(--text-secondary);">Message ID: <code>${escapeHtml(cfg.messageId)}</code></p>` : '<p style="color: var(--text-secondary);">Aún no publicado.</p>'}
                </div>
            </div>
        `;

        const saveBtn = document.getElementById('saveVerifyBtn');
        const publishBtn = document.getElementById('publishVerifyBtn');
        const uploadBtn = document.getElementById('verifyUploadImageBtn');
        if (saveBtn) saveBtn.addEventListener('click', () => saveVerifyConfig(guildId, true));
        if (publishBtn) publishBtn.addEventListener('click', () => publishVerifyEmbed(guildId));
        if (uploadBtn) uploadBtn.addEventListener('click', () => uploadVerifyImage(guildId));
    } catch (error) {
        console.error('Error cargando panel de verificación:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando sistema de verificación.</div>';
    }
}

function collectTicketConfigFromForm() {
    const adminRoleSelect = document.getElementById('ticketAdminRoles');
    const adminRoleIds = adminRoleSelect
        ? Array.from(adminRoleSelect.selectedOptions || []).map((opt) => opt.value).filter(Boolean)
        : [];

    return {
        enabled: document.getElementById('ticketEnabled')?.checked ?? true,
        panelChannelId: document.getElementById('ticketChannelSelect')?.value || '',
        adminRoleIds,
        title: document.getElementById('ticketTitle')?.value || 'Soporte',
        message: document.getElementById('ticketMessage')?.value || 'Presiona el boton para abrir un ticket y explica el motivo de tu solicitud.',
        color: (document.getElementById('ticketColor')?.value || '#7c4dff').replace('#', ''),
        footer: document.getElementById('ticketFooter')?.value || '',
        buttonLabel: document.getElementById('ticketButtonLabel')?.value || 'Solicitar ticket',
        messageId: document.getElementById('ticketMessageId')?.value || ''
    };
}

async function saveTicketConfig(guildId, showSuccessToast = true) {
    const payload = collectTicketConfigFromForm();
    if (!payload.panelChannelId) {
        showToast('Selecciona el canal donde se publicara el panel de tickets', 'warning');
        return false;
    }
    if (!payload.adminRoleIds.length) {
        showToast('Selecciona al menos un rol administrador para ver tickets', 'warning');
        return false;
    }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/ticket-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo guardar el sistema de tickets', 'error');
            return false;
        }

        if (document.getElementById('ticketMessageId')) {
            document.getElementById('ticketMessageId').value = data.config?.messageId || payload.messageId || '';
        }
        if (showSuccessToast) showToast('Configuracion de tickets guardada', 'success');
        return true;
    } catch (error) {
        console.error('Error guardando ticket config:', error);
        showToast('Error guardando configuracion de tickets', 'error');
        return false;
    }
}

async function publishTicketPanel(guildId) {
    const saved = await saveTicketConfig(guildId, false);
    if (!saved) return;

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/ticket-publish`, {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || 'No se pudo publicar el panel de tickets', 'error');
            return;
        }

        if (document.getElementById('ticketMessageId')) {
            document.getElementById('ticketMessageId').value = data.messageId || '';
        }
        if (document.getElementById('ticketEnabled')) {
            document.getElementById('ticketEnabled').checked = true;
        }
        showToast('Panel de tickets publicado', 'success');
    } catch (error) {
        console.error('Error publicando panel de tickets:', error);
        showToast('Error publicando panel de tickets', 'error');
    }
}

async function loadTicketPanel(guildId) {
    const container = document.getElementById('ticketContainer');
    if (!container) return;

    try {
        const [channelsResponse, infoResponse, configResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/info`),
            fetchWithCredentials(`/api/guild/${guildId}/ticket-config`)
        ]);

        if (!channelsResponse.ok || !infoResponse.ok || !configResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar el sistema de tickets.</div>';
            return;
        }

        const channels = (await channelsResponse.json()).filter((c) => c.type === 0);
        const info = await infoResponse.json();
        const cfg = await configResponse.json();
        const selectedRoleIds = new Set(Array.isArray(cfg.adminRoleIds) ? cfg.adminRoleIds.map(String) : []);

        const roles = (Array.isArray(info?.roles) ? info.roles : [])
            .filter((role) => role && role.id && role.name && role.name !== '@everyone')
            .sort((a, b) => (b.position || 0) - (a.position || 0));

        container.innerHTML = `
            <h3 class="welcome-panel-title">Sistema de Tickets</h3>
            <p class="welcome-panel-subtitle">Publica un embed interactivo con el boton <code>Solicitar ticket</code>; al pulsarlo, se pedira el motivo y se abrira un canal privado para los roles que elijas para gestionar solicitudes.</p>
            <div class="welcome-layout">
                <div class="welcome-editor">
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="ticketChannelSelect">Canal para publicar panel</label>
                            <select id="ticketChannelSelect" class="form-control">
                                <option value="">Selecciona un canal</option>
                                ${channels.map((c) => `<option value="${c.id}" ${cfg.panelChannelId === c.id ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="ticketColor">Color del embed</label>
                            <input type="color" id="ticketColor" class="form-control color-input" value="#${(cfg.color || '7c4dff').replace('#', '')}">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group checkbox-group">
                            <label><input type="checkbox" id="ticketEnabled" ${cfg.enabled ? 'checked' : ''}> <span>Activar sistema de tickets</span></label>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="ticketAdminRoles">Roles que pueden gestionar solicitudes</label>
                        <select id="ticketAdminRoles" class="form-control" multiple size="7">
                            ${roles.map((r) => `<option value="${r.id}" ${selectedRoleIds.has(String(r.id)) ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}
                        </select>
                        <small style="color: var(--text-muted);">Mantén <code>Ctrl</code> (o <code>Cmd</code>) para seleccionar varios roles.</small>
                    </div>

                    <div class="form-group">
                        <label for="ticketTitle">Titulo</label>
                        <input type="text" id="ticketTitle" class="form-control" value="${escapeHtmlForValue(cfg.title || 'Soporte')}">
                    </div>

                    <div class="form-group">
                        <label for="ticketMessage">Mensaje</label>
                        <textarea id="ticketMessage" class="form-control" rows="4">${escapeHtmlForValue(cfg.message || 'Presiona el boton para abrir un ticket y explica el motivo de tu solicitud.')}</textarea>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="ticketButtonLabel">Texto del boton</label>
                            <input type="text" id="ticketButtonLabel" class="form-control" value="${escapeHtmlForValue(cfg.buttonLabel || 'Solicitar ticket')}" maxlength="80">
                        </div>
                        <div class="form-group">
                            <label for="ticketFooter">Footer</label>
                            <input type="text" id="ticketFooter" class="form-control" value="${escapeHtmlForValue(cfg.footer || 'Sistema de Tickets')}">
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="ticketMessageId">Message ID publicado</label>
                        <input type="text" id="ticketMessageId" class="form-control" value="${escapeHtmlForValue(cfg.messageId || '')}" readonly>
                    </div>

                    <div class="form-actions">
                        <button type="button" id="saveTicketBtn" class="btn btn-secondary">Guardar Configuracion</button>
                        <button type="button" id="publishTicketBtn" class="btn btn-primary">Publicar Panel de Tickets</button>
                    </div>
                </div>

                <div class="welcome-preview-panel">
                    <h4>Resumen</h4>
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">Canal: <strong>${cfg.panelChannelId ? escapeHtml(channels.find((c) => c.id === cfg.panelChannelId)?.name || 'Desconocido') : 'No configurado'}</strong></p>
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">Roles admin: <strong>${selectedRoleIds.size}</strong></p>
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">Boton: <strong>${escapeHtml(cfg.buttonLabel || 'Solicitar ticket')}</strong></p>
                    <p style="color: var(--text-secondary); margin-bottom: 0.5rem;">Estado: <strong>${cfg.enabled ? 'Activo' : 'Inactivo'}</strong></p>
                    ${cfg.messageId ? `<p style="color: var(--text-secondary);">Message ID: <code>${escapeHtml(cfg.messageId)}</code></p>` : '<p style="color: var(--text-secondary);">Aun no publicado.</p>'}
                </div>
            </div>
        `;

        const saveBtn = document.getElementById('saveTicketBtn');
        const publishBtn = document.getElementById('publishTicketBtn');
        if (saveBtn) saveBtn.addEventListener('click', () => saveTicketConfig(guildId, true));
        if (publishBtn) publishBtn.addEventListener('click', () => publishTicketPanel(guildId));
    } catch (error) {
        console.error('Error cargando panel de tickets:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando sistema de tickets.</div>';
    }
}

function getLevelingRewardRows() {
    return Array.from(document.querySelectorAll('.level-reward-row')).map((row) => {
        const levelInput = row.querySelector('.level-reward-level');
        const roleSelect = row.querySelector('.level-reward-role');
        return {
            level: Math.max(1, Number.parseInt(levelInput?.value || '1', 10) || 1),
            roleId: roleSelect?.value || ''
        };
    }).filter((item) => item.roleId);
}

function collectLevelingConfigFromForm() {
    return {
        enabled: document.getElementById('levelingEnabled')?.checked ?? false,
        messageXpEnabled: document.getElementById('levelingMessageEnabled')?.checked ?? true,
        voiceXpEnabled: document.getElementById('levelingVoiceEnabled')?.checked ?? true,
        messageCooldownMs: Math.max(10000, (Number.parseInt(document.getElementById('levelingMsgCooldown')?.value || '45', 10) || 45) * 1000),
        messageXpMin: Math.max(1, Number.parseInt(document.getElementById('levelingMsgXpMin')?.value || '10', 10) || 10),
        messageXpMax: Math.max(1, Number.parseInt(document.getElementById('levelingMsgXpMax')?.value || '16', 10) || 16),
        voiceXpPerMinute: Math.max(1, Number.parseInt(document.getElementById('levelingVoiceXp')?.value || '6', 10) || 6),
        voiceRequirePeers: document.getElementById('levelingVoicePeers')?.checked ?? true,
        difficulty: {
            baseXp: Math.max(50, Number.parseInt(document.getElementById('levelingBaseXp')?.value || '280', 10) || 280),
            exponent: Math.max(1.2, Number.parseFloat(document.getElementById('levelingExponent')?.value || '2.08') || 2.08)
        },
        roleRewards: getLevelingRewardRows()
    };
}

function renderLevelRewardRows(roles, rewards) {
    const rows = Array.isArray(rewards) ? rewards : [];
    if (!rows.length) return '<p style="color: var(--text-muted);">Aún no hay roles por nivel configurados.</p>';

    return rows.map((reward, index) => `
        <div class="form-row level-reward-row" data-index="${index}" style="margin-bottom:0.5rem;">
            <div class="form-group" style="max-width:140px;">
                <label>Nivel</label>
                <input type="number" min="1" max="500" class="form-control level-reward-level" value="${Math.max(1, Number.parseInt(reward.level || '1', 10) || 1)}">
            </div>
            <div class="form-group" style="flex:1;">
                <label>Rol</label>
                <select class="form-control level-reward-role">
                    <option value="">Selecciona un rol</option>
                    ${roles.map((role) => `<option value="${role.id}" ${String(reward.roleId) === String(role.id) ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group" style="max-width:130px; display:flex; align-items:flex-end;">
                <button type="button" class="btn btn-secondary remove-level-reward" style="width:100%;">Eliminar</button>
            </div>
        </div>
    `).join('');
}

function buildLeaderboardHtml(payload) {
    const rows = Array.isArray(payload?.leaderboard) ? payload.leaderboard : [];
    if (!rows.length) {
        return '<p style="color: var(--text-muted);">Todavía no hay datos de niveles.</p>';
    }

    return rows.slice(0, 10).map((item, index) => `
        <div style="display:flex; align-items:center; gap:0.75rem; padding:0.5rem 0; border-bottom:1px solid var(--border-color);">
            <strong style="min-width:28px; color: var(--fate-gold);">#${index + 1}</strong>
            <img src="${item.avatar || ''}" alt="avatar" style="width:28px; height:28px; border-radius:50%; object-fit:cover;">
            <div style="flex:1; min-width:0;">
                <div style="font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.tag || item.username || 'Usuario')}</div>
                <div style="font-size:0.82rem; color:var(--text-secondary);">Nivel ${item.level} • XP ${item.xp} • Msg ${item.messageCount} • Voz ${item.voiceMinutes}m</div>
            </div>
            <span style="font-size:0.78rem; color: var(--text-secondary);">${item.progressPercent || 0}%</span>
        </div>
    `).join('');
}

async function loadLevelsPanel(guildId) {
    const container = document.getElementById('levelsContainer');
    if (!container) return;

    try {
        const [infoResponse, configResponse, leaderboardResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/info`),
            fetchWithCredentials(`/api/guild/${guildId}/leveling-config`),
            fetchWithCredentials(`/api/guild/${guildId}/leveling-leaderboard`)
        ]);

        if (!infoResponse.ok || !configResponse.ok || !leaderboardResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar el sistema de niveles.</div>';
            return;
        }

        const info = await infoResponse.json();
        const config = await configResponse.json();
        const leaderboard = await leaderboardResponse.json();

        const roles = (Array.isArray(info?.roles) ? info.roles : [])
            .filter((role) => role && role.id && role.name && role.name !== '@everyone')
            .sort((a, b) => (b.position || 0) - (a.position || 0));

        const rewards = Array.isArray(config.roleRewards) ? config.roleRewards : [];
        const difficulty = config.difficulty || {};

        container.innerHTML = `
            <h3 class="welcome-panel-title">Sistema de Niveles</h3>
            <p class="welcome-panel-subtitle">Asigna XP por mensajes y tiempo en voz. Es un sistema más difícil de subir para mantener el progreso equilibrado y premiar actividad real.</p>
            <div class="welcome-layout">
                <div class="welcome-editor">
                    <div class="form-row">
                        <div class="form-group checkbox-group">
                            <label><input type="checkbox" id="levelingEnabled" ${config.enabled ? 'checked' : ''}> <span>Activar niveles</span></label>
                        </div>
                        <div class="form-group checkbox-group">
                            <label><input type="checkbox" id="levelingMessageEnabled" ${config.messageXpEnabled !== false ? 'checked' : ''}> <span>Dar XP por mensajes</span></label>
                        </div>
                        <div class="form-group checkbox-group">
                            <label><input type="checkbox" id="levelingVoiceEnabled" ${config.voiceXpEnabled !== false ? 'checked' : ''}> <span>Dar XP por voz</span></label>
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="levelingMsgCooldown">Cooldown mensajes (segundos)</label>
                            <input type="number" min="10" max="300" id="levelingMsgCooldown" class="form-control" value="${Math.max(10, Math.round((config.messageCooldownMs || 45000) / 1000))}">
                        </div>
                        <div class="form-group">
                            <label for="levelingVoiceXp">XP por minuto en voz</label>
                            <input type="number" min="1" max="100" id="levelingVoiceXp" class="form-control" value="${Math.max(1, Number.parseInt(config.voiceXpPerMinute || 6, 10) || 6)}">
                        </div>
                        <div class="form-group checkbox-group" style="align-self:end;">
                            <label><input type="checkbox" id="levelingVoicePeers" ${config.voiceRequirePeers !== false ? 'checked' : ''}> <span>Voz exige al menos 2 usuarios</span></label>
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="levelingMsgXpMin">XP mínimo por mensaje</label>
                            <input type="number" min="1" max="300" id="levelingMsgXpMin" class="form-control" value="${Math.max(1, Number.parseInt(config.messageXpMin || 10, 10) || 10)}">
                        </div>
                        <div class="form-group">
                            <label for="levelingMsgXpMax">XP máximo por mensaje</label>
                            <input type="number" min="1" max="500" id="levelingMsgXpMax" class="form-control" value="${Math.max(1, Number.parseInt(config.messageXpMax || 16, 10) || 16)}">
                        </div>
                    </div>

                    <div class="form-grid">
                        <div class="form-group">
                            <label for="levelingBaseXp">Dificultad base XP</label>
                            <input type="number" min="50" max="5000" id="levelingBaseXp" class="form-control" value="${Math.max(50, Number.parseInt(difficulty.baseXp || 280, 10) || 280)}">
                        </div>
                        <div class="form-group">
                            <label for="levelingExponent">Exponente de dificultad</label>
                            <input type="number" min="1.2" max="3.5" step="0.01" id="levelingExponent" class="form-control" value="${Number.parseFloat(difficulty.exponent || 2.08).toFixed(2)}">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Roles por nivel</label>
                        <div id="levelRewardRows">${renderLevelRewardRows(roles, rewards)}</div>
                        <div class="form-actions" style="margin-top:0.5rem;">
                            <button type="button" id="addLevelRewardBtn" class="btn btn-secondary">Agregar rol por nivel</button>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" id="saveLevelingBtn" class="btn btn-primary">Guardar sistema de niveles</button>
                    </div>
                </div>

                <div class="welcome-preview-panel">
                    <h4>Leaderboard</h4>
                    <p style="color: var(--text-secondary); margin-bottom:0.75rem;">Usuarios seguidos: <strong>${leaderboard.totalTrackedUsers || 0}</strong></p>
                    <div id="levelingLeaderboardWrap">${buildLeaderboardHtml(leaderboard)}</div>
                </div>
            </div>
        `;

        const rewardRows = document.getElementById('levelRewardRows');
        const addRewardBtn = document.getElementById('addLevelRewardBtn');
        const saveBtn = document.getElementById('saveLevelingBtn');

        if (rewardRows) {
            rewardRows.addEventListener('click', (event) => {
                const target = event.target;
                if (!(target instanceof HTMLElement)) return;
                if (!target.classList.contains('remove-level-reward')) return;
                const row = target.closest('.level-reward-row');
                if (row) row.remove();
            });
        }

        if (addRewardBtn) {
            addRewardBtn.addEventListener('click', () => {
                const wrapper = document.getElementById('levelRewardRows');
                if (!wrapper) return;

                const empty = wrapper.querySelector('p');
                if (empty) wrapper.innerHTML = '';

                const row = document.createElement('div');
                row.className = 'form-row level-reward-row';
                row.style.marginBottom = '0.5rem';
                row.innerHTML = `
                    <div class="form-group" style="max-width:140px;">
                        <label>Nivel</label>
                        <input type="number" min="1" max="500" class="form-control level-reward-level" value="1">
                    </div>
                    <div class="form-group" style="flex:1;">
                        <label>Rol</label>
                        <select class="form-control level-reward-role">
                            <option value="">Selecciona un rol</option>
                            ${roles.map((role) => `<option value="${role.id}">${escapeHtml(role.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="max-width:130px; display:flex; align-items:flex-end;">
                        <button type="button" class="btn btn-secondary remove-level-reward" style="width:100%;">Eliminar</button>
                    </div>
                `;
                wrapper.appendChild(row);
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const payload = collectLevelingConfigFromForm();
                if (payload.messageXpMax < payload.messageXpMin) {
                    showToast('El XP máximo por mensaje no puede ser menor que el mínimo', 'warning');
                    return;
                }

                try {
                    const response = await fetchWithCredentials(`/api/guild/${guildId}/leveling-config`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                        showToast(data.error || 'No se pudo guardar el sistema de niveles', 'error');
                        return;
                    }
                    showToast('Sistema de niveles guardado', 'success');
                    await loadLevelsPanel(guildId);
                } catch (error) {
                    console.error('Error guardando sistema de niveles:', error);
                    showToast('Error guardando sistema de niveles', 'error');
                }
            });
        }
    } catch (error) {
        console.error('Error cargando panel de niveles:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando sistema de niveles.</div>';
    }
}

// Cargar información del servidor
async function loadServerInfo(guildId) {
    const container = document.getElementById('serverInfoContainer');
    
    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/info`);
        if (response.ok) {
            const info = await response.json();
            displayServerInfo(info);
        } else {
            const error = await response.json().catch(() => ({ error: 'Error al cargar información' }));
            container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>${error.error || 'Error al cargar información del servidor'}</p></div>`;
        }
    } catch (error) {
        console.error('Error cargando información del servidor:', error);
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>Error al cargar información: ${error.message}</p></div>`;
    }
}

function displayServerInfo(info) {
    const container = document.getElementById('serverInfoContainer');
    
    if (!info) {
        container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>Error al cargar información del servidor</p></div>';
        return;
    }
    
    container.innerHTML = `
        <div class="server-info-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-top: 2rem;">
            <div class="info-item" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem;">
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Propietario</div>
                <div style="color: var(--fate-gold); font-size: 1.2rem; font-weight: 600;">${escapeHtml(info.owner?.tag || 'Desconocido')}</div>
            </div>
            <div class="info-item" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem;">
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Miembros</div>
                <div style="color: var(--fate-gold); font-size: 1.2rem; font-weight: 600;">${info.memberCount || 0}</div>
            </div>
            <div class="info-item" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem;">
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Canales</div>
                <div style="color: var(--fate-gold); font-size: 1.2rem; font-weight: 600;">
                    ${info.channelCount || 0} 
                    ${info.channels ? `(${info.channels.text || 0} texto, ${info.channels.voice || 0} voz)` : ''}
                </div>
            </div>
            <div class="info-item" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem;">
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Roles</div>
                <div style="color: var(--fate-gold); font-size: 1.2rem; font-weight: 600;">${info.roleCount || 0}</div>
            </div>
            <div class="info-item" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem;">
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Emojis</div>
                <div style="color: var(--fate-gold); font-size: 1.2rem; font-weight: 600;">${info.emojis || 0}</div>
            </div>
            <div class="info-item" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; padding: 1.5rem;">
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px;">Creado</div>
                <div style="color: var(--fate-gold); font-size: 1.2rem; font-weight: 600;">${info.createdAt ? new Date(info.createdAt).toLocaleDateString('es-ES') : 'N/A'}</div>
            </div>
        </div>
    `;
}

// Cargar miembros del servidor
async function loadServerMembers(guildId) {
    const container = document.getElementById('moderationContainer');
    
    try {
        container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando miembros...</p></div>';
        
        const response = await fetchWithCredentials(`/api/guild/${guildId}/members`);
        if (response.ok) {
            const members = await response.json();
            if (members && members.length > 0) {
                displayMembers(members, guildId);
            } else {
                container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);"><p>No hay miembros disponibles</p></div>';
            }
        } else {
            const error = await response.json().catch(() => ({ error: 'Error al cargar miembros' }));
            container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>${error.error || 'Error al cargar miembros'}</p></div>`;
        }
    } catch (error) {
        console.error('Error cargando miembros:', error);
        container.innerHTML = `<div style="text-align: center; padding: 3rem; color: var(--error-color);"><p>Error al cargar miembros: ${error.message}</p></div>`;
    }
}

function displayMembers(members, guildId) {
    const container = document.getElementById('moderationContainer');
    container.innerHTML = `
        <h3 style="margin-bottom: 1.5rem; color: var(--fate-red); font-family: 'Cinzel', serif;">Moderación</h3>
        <div class="member-search">
            <input type="text" id="memberSearch" class="form-control" placeholder="Buscar miembro...">
        </div>
        <div class="member-list" id="memberList">
            ${members.map(member => `
                <div class="member-item">
                    <div class="member-info">
                        <img src="${member.avatar}" alt="${member.tag}" class="member-avatar">
                        <div class="member-details">
                            <h4>${escapeHtml(member.tag)}</h4>
                            <p>ID: ${member.id}</p>
                        </div>
                    </div>
                    <div class="member-actions">
                        <button class="action-btn btn-kick" onclick="moderateUser('${guildId}', '${member.id}', 'kick')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"></path>
                            </svg>
                            Kick
                        </button>
                        <button class="action-btn btn-ban" onclick="moderateUser('${guildId}', '${member.id}', 'ban')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"></path>
                            </svg>
                            Ban
                        </button>
                        <button class="action-btn btn-timeout" onclick="moderateUser('${guildId}', '${member.id}', 'timeout')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            Timeout
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    // Buscar miembros
    document.getElementById('memberSearch').addEventListener('input', async (e) => {
        const query = e.target.value;
        const response = await fetchWithCredentials(`/api/guild/${guildId}/members?q=${encodeURIComponent(query)}`);
        if (response.ok) {
            const members = await response.json();
            displayMembers(members, guildId);
        }
    });
}

function getGreetingPanelMeta(mode) {
    if (mode === 'goodbye') {
        return {
            key: 'goodbye',
            panelTitle: 'Sistema de Despedidas',
            subtitle: 'Configura el mensaje de salida para cuando un usuario abandone el servidor.',
            channelLabel: 'Canal de despedida',
            toggleLabel: 'Activar despedidas',
            saveButton: 'Guardar Despedida',
            testButton: 'Guardar y Enviar Prueba',
            uploadSuccess: 'Imagen de despedida subida correctamente',
            saveSuccess: 'Configuración de despedida guardada',
            testSuccess: 'Prueba de despedida enviada',
            channelRequired: 'Selecciona un canal para la despedida',
            defaultTitle: 'Hasta pronto',
            defaultMessage: '{username} ha salido de **{server}**. Ahora somos {memberCount} miembros.',
            defaultColor: 'ff5f9e',
            defaultFooter: 'EyedBot Goodbye System',
            disabledText: 'Despedidas desactivadas'
        };
    }

    return {
        key: 'welcome',
        panelTitle: 'Sistema de Bienvenidas',
        subtitle: 'Configura mensaje, imagen y comportamiento para este servidor. Usa variables: <code>{user}</code>, <code>{username}</code>, <code>{server}</code>, <code>{memberCount}</code>.',
        channelLabel: 'Canal de bienvenida',
        toggleLabel: 'Activar bienvenidas',
        saveButton: 'Guardar Bienvenida',
        testButton: 'Guardar y Enviar Prueba',
        uploadSuccess: 'Imagen de bienvenida subida correctamente',
        saveSuccess: 'Configuración de bienvenida guardada',
        testSuccess: 'Prueba de bienvenida enviada',
        channelRequired: 'Selecciona un canal para la bienvenida',
        defaultTitle: '¡Bienvenido!',
        defaultMessage: '¡Hola {user}! Bienvenido a {server}.',
        defaultColor: '7c4dff',
        defaultFooter: 'EyedBot Welcome System',
        disabledText: 'Bienvenidas desactivadas'
    };
}

function getCurrentGreetingConfig(mode) {
    return mode === 'goodbye' ? currentGoodbyeConfig : currentWelcomeConfig;
}

function setCurrentGreetingConfig(mode, config) {
    if (mode === 'goodbye') {
        currentGoodbyeConfig = config;
        return;
    }
    currentWelcomeConfig = config;
}

function saveCurrentGreetingDraft() {
    const formExists = document.getElementById('welcomeChannelSelect');
    if (!formExists) return;
    setCurrentGreetingConfig(currentGreetingMode, collectWelcomeConfigFromForm());
}

function renderGreetingPanel(guildId, channels, mode) {
    const container = document.getElementById('welcomeContainer');
    if (!container) return;

    const meta = getGreetingPanelMeta(mode);
    const cfg = getCurrentGreetingConfig(mode) || {};
    const subtitleHtml = mode === 'welcome' ? meta.subtitle : escapeHtml(meta.subtitle);

    container.innerHTML = `
        <h3 class="welcome-panel-title">Bienvenida y Despedida</h3>
        <div class="greeting-tabs" role="tablist" aria-label="Pestañas de configuración">
            <button type="button" class="greeting-tab-btn ${mode === 'welcome' ? 'active' : ''}" data-greeting-tab="welcome" role="tab" aria-selected="${mode === 'welcome' ? 'true' : 'false'}">Bienvenida</button>
            <button type="button" class="greeting-tab-btn ${mode === 'goodbye' ? 'active' : ''}" data-greeting-tab="goodbye" role="tab" aria-selected="${mode === 'goodbye' ? 'true' : 'false'}">Despedida</button>
        </div>
        <p class="welcome-panel-subtitle">${subtitleHtml}</p>
        <div class="welcome-layout">
            <div class="welcome-editor">
                <div class="form-grid">
                    <div class="form-group">
                        <label for="welcomeChannelSelect">${escapeHtml(meta.channelLabel)}</label>
                        <select id="welcomeChannelSelect" class="form-control">
                            <option value="">Selecciona un canal</option>
                            ${channels.map((c) => `<option value="${c.id}" ${cfg.channelId === c.id ? 'selected' : ''}># ${escapeHtml(c.name)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="welcomeColor">Color del embed</label>
                        <input type="color" id="welcomeColor" class="form-control color-input" value="#${(cfg.color || meta.defaultColor).replace('#', '')}">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group checkbox-group">
                        <label><input type="checkbox" id="welcomeEnabled" ${cfg.enabled !== false ? 'checked' : ''}> <span>${escapeHtml(meta.toggleLabel)}</span></label>
                    </div>
                    <div class="form-group checkbox-group">
                        <label><input type="checkbox" id="welcomeMentionUser" ${cfg.mentionUser !== false ? 'checked' : ''}> <span>Mencionar usuario</span></label>
                    </div>
                    <div class="form-group checkbox-group">
                        <label><input type="checkbox" id="welcomeDmEnabled" ${cfg.dmEnabled ? 'checked' : ''}> <span>Enviar DM</span></label>
                    </div>
                </div>

                <div class="form-group">
                    <label for="welcomeTitle">Titulo</label>
                    <input type="text" id="welcomeTitle" class="form-control" value="${escapeHtmlForValue(cfg.title || meta.defaultTitle)}">
                </div>

                <div class="form-group">
                    <label for="welcomeMessage">Mensaje</label>
                    <textarea id="welcomeMessage" class="form-control" rows="4">${escapeHtmlForValue(cfg.message || meta.defaultMessage)}</textarea>
                </div>

                <div class="form-group">
                    <label for="welcomeFooter">Footer</label>
                    <input type="text" id="welcomeFooter" class="form-control" value="${escapeHtmlForValue(cfg.footer || meta.defaultFooter)}">
                </div>

                <div class="welcome-image-editor">
                    <h4>Editor de Imagen</h4>
                    <div class="form-group">
                        <label for="welcomeImageUrl">URL de imagen principal</label>
                        <input type="url" id="welcomeImageUrl" class="form-control" value="${escapeHtmlForValue(cfg.imageUrl || '')}" placeholder="https://...">
                    </div>
                    <div class="form-group">
                        <label for="welcomeImageFile">Subir imagen para editar</label>
                        <input type="file" id="welcomeImageFile" class="form-control" accept="image/*">
                    </div>
                    <div class="form-group">
                        <label for="welcomeImageScale">Escala</label>
                        <input type="range" id="welcomeImageScale" class="form-control" min="25" max="100" step="5" value="100">
                        <small id="welcomeImageScaleValue">100%</small>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="welcomeImageCropX">X (%)</label>
                            <input type="range" id="welcomeImageCropX" class="form-control" min="0" max="80" step="1" value="0">
                        </div>
                        <div class="form-group">
                            <label for="welcomeImageCropY">Y (%)</label>
                            <input type="range" id="welcomeImageCropY" class="form-control" min="0" max="80" step="1" value="0">
                        </div>
                        <div class="form-group">
                            <label for="welcomeImageCropW">Ancho (%)</label>
                            <input type="range" id="welcomeImageCropW" class="form-control" min="20" max="100" step="1" value="100">
                        </div>
                        <div class="form-group">
                            <label for="welcomeImageCropH">Alto (%)</label>
                            <input type="range" id="welcomeImageCropH" class="form-control" min="20" max="100" step="1" value="100">
                        </div>
                    </div>
                    <div class="form-actions welcome-editor-actions">
                        <button type="button" id="welcomeUploadImageBtn" class="btn btn-secondary">Procesar y Subir Imagen</button>
                        <small id="welcomeImageUploadStatus"></small>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="welcomeThumbnailMode">Miniatura</label>
                        <select id="welcomeThumbnailMode" class="form-control">
                            <option value="avatar" ${cfg.thumbnailMode === 'avatar' ? 'selected' : ''}>Avatar del usuario</option>
                            <option value="url" ${cfg.thumbnailMode === 'url' ? 'selected' : ''}>URL personalizada</option>
                            <option value="none" ${cfg.thumbnailMode === 'none' ? 'selected' : ''}>Sin miniatura</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="welcomeThumbnailUrl">URL miniatura</label>
                        <input type="url" id="welcomeThumbnailUrl" class="form-control" value="${escapeHtmlForValue(cfg.thumbnailUrl || '')}" placeholder="https://...">
                    </div>
                </div>

                <div class="form-group">
                    <label for="welcomeDmMessage">Mensaje DM (opcional)</label>
                    <textarea id="welcomeDmMessage" class="form-control" rows="3">${escapeHtmlForValue(cfg.dmMessage || '')}</textarea>
                </div>

                <div class="form-actions">
                    <button type="button" id="saveWelcomeBtn" class="btn btn-primary">${escapeHtml(meta.saveButton)}</button>
                    <button type="button" id="testWelcomeBtn" class="btn btn-secondary">${escapeHtml(meta.testButton)}</button>
                </div>
            </div>

            <div class="welcome-preview-panel">
                <h4>Vista Previa del Embed</h4>
                <div id="welcomePreviewCard" class="embed-preview"></div>
            </div>
        </div>
    `;

    const previewListeners = [
        'welcomeChannelSelect',
        'welcomeColor',
        'welcomeEnabled',
        'welcomeMentionUser',
        'welcomeDmEnabled',
        'welcomeTitle',
        'welcomeMessage',
        'welcomeFooter',
        'welcomeImageUrl',
        'welcomeThumbnailMode',
        'welcomeThumbnailUrl',
        'welcomeDmMessage',
        'welcomeImageScale',
        'welcomeImageCropX',
        'welcomeImageCropY',
        'welcomeImageCropW',
        'welcomeImageCropH'
    ];

    previewListeners.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const eventName = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(eventName, () => {
            if (id === 'welcomeImageScale') {
                const value = Number.parseInt(el.value || '100', 10);
                const label = document.getElementById('welcomeImageScaleValue');
                if (label) label.textContent = `${value}%`;
            }

            if (id === 'welcomeThumbnailMode') {
                const thumbUrlInput = document.getElementById('welcomeThumbnailUrl');
                if (thumbUrlInput) thumbUrlInput.disabled = String(el.value || 'avatar') !== 'url';
            }

            renderWelcomeEmbedPreview(guildId);
        });
    });

    container.querySelectorAll('[data-greeting-tab]').forEach((tabBtn) => {
        tabBtn.addEventListener('click', () => {
            const nextMode = tabBtn.dataset.greetingTab;
            if (!nextMode || nextMode === currentGreetingMode) return;
            saveCurrentGreetingDraft();
            currentGreetingMode = nextMode;
            renderGreetingPanel(guildId, channels, currentGreetingMode);
        });
    });

    const thumbUrlInput = document.getElementById('welcomeThumbnailUrl');
    const thumbMode = document.getElementById('welcomeThumbnailMode')?.value || 'avatar';
    if (thumbUrlInput) thumbUrlInput.disabled = thumbMode !== 'url';

    const imageFileInput = document.getElementById('welcomeImageFile');
    if (imageFileInput) {
        imageFileInput.addEventListener('change', handleWelcomeImageSelection);
    }

    const uploadBtn = document.getElementById('welcomeUploadImageBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => uploadWelcomeEditedImage(guildId));
    }

    const saveBtn = document.getElementById('saveWelcomeBtn');
    const testBtn = document.getElementById('testWelcomeBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => saveWelcomeConfig(guildId));
    if (testBtn) testBtn.addEventListener('click', () => sendWelcomeTest(guildId));
    renderWelcomeEmbedPreview(guildId);
}

async function loadWelcomePanel(guildId) {
    const container = document.getElementById('welcomeContainer');
    if (!container) return;

    try {
        const [channelsResponse, welcomeResponse, goodbyeResponse] = await Promise.all([
            fetchWithCredentials(`/api/guild/${guildId}/channels`),
            fetchWithCredentials(`/api/guild/${guildId}/welcome-config`),
            fetchWithCredentials(`/api/guild/${guildId}/goodbye-config`)
        ]);

        if (!channelsResponse.ok || !welcomeResponse.ok || !goodbyeResponse.ok) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">No se pudo cargar la configuración de bienvenida y despedida.</div>';
            return;
        }

        const channels = (await channelsResponse.json()).filter((c) => c.type === 0);
        currentWelcomeConfig = await welcomeResponse.json();
        currentGoodbyeConfig = await goodbyeResponse.json();

        if (welcomeImagePreviewUrl) URL.revokeObjectURL(welcomeImagePreviewUrl);
        welcomeImageFile = null;
        welcomeImagePreviewUrl = '';

        if (!['welcome', 'goodbye'].includes(currentGreetingMode)) currentGreetingMode = 'welcome';
        renderGreetingPanel(guildId, channels, currentGreetingMode);
    } catch (error) {
        console.error('Error cargando panel de bienvenida/despedida:', error);
        container.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--error-color);">Error cargando sistema de bienvenida y despedida.</div>';
    }
}

function applyWelcomePreviewTemplate(text, sample) {
    return String(text || '')
        .replace(/\{user\}/gi, sample.userMention)
        .replace(/\{username\}/gi, sample.username)
        .replace(/\{server\}/gi, sample.server)
        .replace(/\{memberCount\}/gi, String(sample.memberCount));
}

function renderWelcomeEmbedPreview(guildId) {
    const preview = document.getElementById('welcomePreviewCard');
    if (!preview) return;

    const guild = currentServerGuilds.find((g) => String(g.id) === String(guildId));
    const meta = getGreetingPanelMeta(currentGreetingMode);
    const payload = collectWelcomeConfigFromForm();

    const sample = {
        userMention: `@${currentUser?.username || 'NuevoUsuario'}`,
        username: currentUser?.username || 'NuevoUsuario',
        server: guild?.name || 'Tu Servidor',
        memberCount: guild?.botGuild?.memberCount || 123
    };

    const colorHex = (payload.color || meta.defaultColor).replace('#', '');
    const color = `#${colorHex}`;
    const title = applyWelcomePreviewTemplate(payload.title, sample);
    const message = applyWelcomePreviewTemplate(payload.message, sample);
    const footer = applyWelcomePreviewTemplate(payload.footer, sample);

    const image = welcomeImagePreviewUrl || payload.imageUrl;
    const showThumb = payload.thumbnailMode === 'avatar' || (payload.thumbnailMode === 'url' && payload.thumbnailUrl);
    const thumbSrc = payload.thumbnailMode === 'url'
        ? payload.thumbnailUrl
        : `https://cdn.discordapp.com/embed/avatars/${(Number(currentUser?.discriminator || 0) % 5 + 5) % 5}.png`;
    const safeThumbSrc = escapeHtmlForValue(thumbSrc);
    const safeImageSrc = escapeHtmlForValue(image);

    preview.innerHTML = `
        <div class="discord-embed" style="border-left-color:${color};">
            ${title ? `<div class="discord-embed-title">${escapeHtml(title)}</div>` : ''}
            ${message ? `<div class="discord-embed-description">${escapeHtml(message)}</div>` : ''}
            ${showThumb ? `<img src="${safeThumbSrc}" alt="thumbnail" class="discord-embed-thumbnail" style="float:right;max-width:80px;border-radius:4px;margin-left:1rem;">` : ''}
            ${image ? `<img src="${safeImageSrc}" alt="welcome image" class="discord-embed-image">` : ''}
            ${(footer || payload.enabled === false) ? `<div class="discord-embed-footer">${escapeHtml(footer || '')}${payload.enabled === false ? ` - ${escapeHtml(meta.disabledText)}` : ''}</div>` : ''}
        </div>
    `;
}

function handleWelcomeImageSelection(event) {
    const file = event.target.files?.[0] || null;
    const status = document.getElementById('welcomeImageUploadStatus');

    if (!file) {
        welcomeImageFile = null;
        if (welcomeImagePreviewUrl) {
            URL.revokeObjectURL(welcomeImagePreviewUrl);
            welcomeImagePreviewUrl = '';
        }
        if (status) status.textContent = '';
        renderWelcomeEmbedPreview(currentServerGuildId);
        return;
    }

    if (!file.type.startsWith('image/')) {
        showToast('Solo puedes subir archivos de imagen', 'warning');
        event.target.value = '';
        return;
    }

    welcomeImageFile = file;
    if (welcomeImagePreviewUrl) URL.revokeObjectURL(welcomeImagePreviewUrl);
    welcomeImagePreviewUrl = URL.createObjectURL(file);
    if (status) status.textContent = `Archivo listo: ${file.name}`;
    renderWelcomeEmbedPreview(currentServerGuildId);
}

function getWelcomeImageCropSettings() {
    return {
        x: Number.parseInt(document.getElementById('welcomeImageCropX')?.value || '0', 10),
        y: Number.parseInt(document.getElementById('welcomeImageCropY')?.value || '0', 10),
        w: Number.parseInt(document.getElementById('welcomeImageCropW')?.value || '100', 10),
        h: Number.parseInt(document.getElementById('welcomeImageCropH')?.value || '100', 10)
    };
}

async function uploadWelcomeEditedImage(guildId) {
    if (!welcomeImageFile) {
        showToast('Selecciona una imagen primero', 'warning');
        return;
    }

    const uploadBtn = document.getElementById('welcomeUploadImageBtn');
    const status = document.getElementById('welcomeImageUploadStatus');
    const imageUrlInput = document.getElementById('welcomeImageUrl');
    const scale = Number.parseInt(document.getElementById('welcomeImageScale')?.value || '100', 10);

    if (uploadBtn) uploadBtn.disabled = true;
    if (status) status.textContent = 'Procesando imagen...';

    try {
        const resized = await resizeImageFile(welcomeImageFile, scale, 1600, getWelcomeImageCropSettings());
        const extension = (resized.name.split('.').pop() || 'jpg').toLowerCase();
        const uploadName = `welcome_${Date.now()}.${extension}`;

        const formData = new FormData();
        formData.append('imageFile', resized, uploadName);

        const response = await fetchWithCredentials(`/api/guild/${guildId}/welcome-image`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.url) {
            showToast(data.error || 'No se pudo subir la imagen', 'error');
            return;
        }

        if (imageUrlInput) imageUrlInput.value = data.url;
        if (status) status.textContent = 'Imagen subida y aplicada';
        showToast(getGreetingPanelMeta(currentGreetingMode).uploadSuccess, 'success');
        renderWelcomeEmbedPreview(guildId);
    } catch (error) {
        console.error('Error subiendo imagen de bienvenida:', error);
        showToast('Error subiendo la imagen', 'error');
    } finally {
        if (uploadBtn) uploadBtn.disabled = false;
    }
}

function collectWelcomeConfigFromForm() {
    const meta = getGreetingPanelMeta(currentGreetingMode);
    return {
        enabled: document.getElementById('welcomeEnabled')?.checked ?? true,
        channelId: document.getElementById('welcomeChannelSelect')?.value || '',
        mentionUser: document.getElementById('welcomeMentionUser')?.checked ?? true,
        title: document.getElementById('welcomeTitle')?.value || meta.defaultTitle,
        message: document.getElementById('welcomeMessage')?.value || meta.defaultMessage,
        color: (document.getElementById('welcomeColor')?.value || `#${meta.defaultColor}`).replace('#', ''),
        footer: document.getElementById('welcomeFooter')?.value || meta.defaultFooter,
        imageUrl: document.getElementById('welcomeImageUrl')?.value || '',
        thumbnailMode: document.getElementById('welcomeThumbnailMode')?.value || 'avatar',
        thumbnailUrl: document.getElementById('welcomeThumbnailUrl')?.value || '',
        dmEnabled: document.getElementById('welcomeDmEnabled')?.checked ?? false,
        dmMessage: document.getElementById('welcomeDmMessage')?.value || ''
    };
}

async function saveWelcomeConfig(guildId, showSuccessToast = true) {
    const meta = getGreetingPanelMeta(currentGreetingMode);
    const payload = collectWelcomeConfigFromForm();
    if (!payload.channelId) {
        showToast(meta.channelRequired, 'warning');
        return false;
    }

    try {
        const response = await fetchWithCredentials(`/api/guild/${guildId}/${meta.key}-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showToast(data.error || `No se pudo guardar la ${meta.key === 'welcome' ? 'bienvenida' : 'despedida'}`, 'error');
            return false;
        }

        if (showSuccessToast) showToast(meta.saveSuccess, 'success');
        setCurrentGreetingConfig(currentGreetingMode, data.config || payload);
        return true;
    } catch (error) {
        console.error('Error guardando configuración de greetings:', error);
        showToast(`Error guardando ${meta.key === 'welcome' ? 'bienvenida' : 'despedida'}`, 'error');
        return false;
    }
}

async function sendWelcomeTest(guildId) {
    try {
        const meta = getGreetingPanelMeta(currentGreetingMode);
        const saved = await saveWelcomeConfig(guildId, false);
        if (!saved) return;

        const response = await fetchWithCredentials(`/api/guild/${guildId}/${meta.key}-test`, {
            method: 'POST'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) return showToast(data.error || 'No se pudo enviar la prueba', 'error');
        showToast(meta.testSuccess, 'success');
    } catch (error) {
        console.error('Error enviando prueba:', error);
        showToast('Error enviando prueba', 'error');
    }
}

// Moderar usuario
async function moderateUser(guildId, userId, action) {
    const reason = prompt(`Razón para ${action}:`);
    if (!reason) return;
    
    try {
        const response = await fetchWithCredentials('/api/moderate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guildId, userId, action, reason })
        });
        
        const data = await response.json();
        if (response.ok) {
            showToast(data.message, 'success');
            await loadServerMembers(guildId);
        } else {
            showToast(data.error || 'Error al ejecutar acción', 'error');
        }
    } catch (error) {
        console.error('Error moderando usuario:', error);
        showToast('Error al ejecutar acción', 'error');
    }
}


// Funciones globales
window.selectGuild = async function(guildId) {
    serverFeaturesUnlocked = true;
    currentServerGuildId = guildId;
    setServerFeaturesNavigationVisible(true);
    updateDashboardButtonState();

    showSection('serverSection');
    await loadGuildsForServer();
    switchServerPane('serverPaneOverview');
    updateServerMenuIdentity();

    saveState();
};

window.removeField = removeField;
window.moderateUser = moderateUser;

// Mostrar toast
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
    };
    
    toast.innerHTML = `${icons[type] || icons.success}<span>${escapeHtml(message)}</span>`;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'toastSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1) reverse';
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// Escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}




