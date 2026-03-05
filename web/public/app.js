// Estado de la aplicación
let currentUser = null;
let currentGuilds = [];
let embedFields = [];

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
            const data = await response.json();
            currentUser = data.user;
            currentGuilds = data.guilds || [];
            updateUserUI();
            return true;
        } else if (response.status === 401) {
            // No autenticado, redirigir a login solo una vez
            const data = await response.json().catch(() => ({}));
            if (data.redirect) {
                window.location.href = data.redirect;
            } else {
                window.location.href = '/login';
            }
            return false;
        } else {
            console.error('Error verificando autenticación:', response.status);
            // Solo redirigir si no estamos ya en la página de login
            if (!window.location.pathname.includes('login')) {
                window.location.href = '/login';
            }
            return false;
        }
    } catch (error) {
        console.error('Error verificando autenticación:', error);
        // Solo redirigir si no estamos ya en la página de login
        if (!window.location.pathname.includes('login')) {
            window.location.href = '/login';
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
    document.getElementById('dashboardBtn').addEventListener('click', () => showSection('dashboard'));
    document.getElementById('embedBtn').addEventListener('click', () => showSection('embedSection'));
    document.getElementById('statsBtn').addEventListener('click', () => {
        showSection('statsSection');
        loadStats();
    });
    document.getElementById('logsBtn').addEventListener('click', () => {
        showSection('logsSection');
        loadLogs();
    });
    document.getElementById('commandsBtn').addEventListener('click', () => {
        showSection('commandsSection');
        loadCommands();
    });
    document.getElementById('serverBtn').addEventListener('click', () => {
        showSection('serverSection');
        loadGuildsForServer();
    });

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
    document.getElementById('embedTimestamp').addEventListener('change', () => {
        updateEmbedPreview();
        saveState();
    });
    document.getElementById('channelSelect').addEventListener('change', saveState);
    document.getElementById('previewBtn').addEventListener('click', updateEmbedPreview);
    document.getElementById('sendEmbedBtn').addEventListener('click', sendEmbed);
    document.getElementById('addFieldBtn').addEventListener('click', addField);
    
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
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    if (sectionId === 'dashboard') {
        document.getElementById('dashboardBtn').classList.add('active');
    } else if (sectionId === 'embedSection') {
        document.getElementById('embedBtn').classList.add('active');
        loadGuildsForEmbed();
    } else if (sectionId === 'statsSection') {
        document.getElementById('statsBtn').classList.add('active');
    } else if (sectionId === 'logsSection') {
        document.getElementById('logsBtn').classList.add('active');
    } else if (sectionId === 'commandsSection') {
        document.getElementById('commandsBtn').classList.add('active');
    } else if (sectionId === 'serverSection') {
        document.getElementById('serverBtn').classList.add('active');
    }
    
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
            select.innerHTML = '<option value="">Selecciona un servidor</option>' +
                guilds.map(guild => `<option value="${guild.id}">${guild.name}</option>`).join('');
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
        } else {
            showToast('Error al cargar canales', 'error');
        }
    } catch (error) {
        console.error('Error cargando canales:', error);
        showToast('Error al cargar canales', 'error');
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

// Actualizar vista previa del embed
function updateEmbedPreview() {
    const title = document.getElementById('embedTitle').value;
    const description = document.getElementById('embedDescription').value;
    const color = document.getElementById('embedColor').value;
    const footer = document.getElementById('embedFooter').value;
    const image = document.getElementById('embedImage').value;
    const thumbnail = document.getElementById('embedThumbnail').value;
    const timestamp = document.getElementById('embedTimestamp').checked;

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
            ${thumbnail ? `<img src="${thumbnail}" alt="Thumbnail" class="discord-embed-thumbnail" style="float: right; max-width: 80px; border-radius: 4px; margin-left: 1rem;">` : ''}
            ${fieldsHTML ? `<div class="discord-embed-fields">${fieldsHTML}</div>` : ''}
            ${image ? `<img src="${image}" alt="Image" class="discord-embed-image">` : ''}
            ${footer || timestamp ? `<div class="discord-embed-footer">${footer || ''} ${timestamp ? '• ' + new Date().toLocaleString() : ''}</div>` : ''}
        </div>
    `;
}

// Enviar embed
async function sendEmbed() {
    const guildId = document.getElementById('guildSelect').value;
    const channelId = document.getElementById('channelSelect').value;

    if (!guildId || !channelId) {
        showToast('Por favor selecciona un servidor y un canal', 'warning');
        return;
    }

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

    // Recopilar campos
    document.querySelectorAll('.field-item').forEach(field => {
        const name = field.querySelector('.field-name').value;
        const value = field.querySelector('.field-value').value;
        const inline = field.querySelector('.field-inline').checked;
        
        if (name && value) {
            embed.fields.push({ name, value, inline });
        }
    });

    try {
        const response = await fetchWithCredentials('/api/send-embed', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ guildId, channelId, embed })
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
            document.getElementById('embedTimestamp').checked = false;
            document.getElementById('fieldsContainer').innerHTML = '';
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
            document.getElementById('statPing').textContent = stats.ping || 0;
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
let serverSelectListenerSetup = false;

async function loadGuildsForServer() {
    try {
        const select = document.getElementById('serverSelect');
        const serverInfoContainer = document.getElementById('serverInfoContainer');
        const moderationContainer = document.getElementById('moderationContainer');
        
        // Limpiar contenedores
        serverInfoContainer.innerHTML = '';
        moderationContainer.innerHTML = '';
        
        const response = await fetchWithCredentials('/api/guilds');
        if (response.ok) {
            const guilds = await response.json();
            if (guilds && guilds.length > 0) {
                select.innerHTML = '<option value="">Selecciona un servidor</option>' +
                    guilds.map(guild => `<option value="${guild.id}">${escapeHtml(guild.name)}</option>`).join('');
            } else {
                select.innerHTML = '<option value="">No hay servidores disponibles</option>';
            }
            
            // Event listener (solo una vez)
            if (!serverSelectListenerSetup) {
                serverSelectListenerSetup = true;
                select.addEventListener('change', async (e) => {
                    if (e.target.value) {
                        serverInfoContainer.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Cargando información...</p></div>';
                        moderationContainer.innerHTML = '';
                        await loadServerInfo(e.target.value);
                        await loadServerMembers(e.target.value);
                    } else {
                        serverInfoContainer.innerHTML = '';
                        moderationContainer.innerHTML = '';
                    }
                    saveState();
                });
            }
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
window.selectGuild = function(guildId) {
    showSection('embedSection');
    document.getElementById('guildSelect').value = guildId;
    handleGuildSelect();
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

// Funciones globales
window.selectGuild = function(guildId) {
    showSection('embedSection');
    document.getElementById('guildSelect').value = guildId;
    handleGuildSelect();
};

window.removeField = removeField;




