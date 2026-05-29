/**
 * Vigilante de arranque: si el panel sigue en "Cargando..." demasiado tiempo, muestra ayuda.
 */
(function panelBootWatchdog(global) {
    const doc = global.document;
    if (!doc) return;

    const DEADLINE_MS = Number.parseInt(global.__EYEDBOT_BOOT_DEADLINE_MS || '28000', 10) || 28000;

    function isStuckLoading() {
        if (global.__EYEDBOT_BOOT_DONE === true) return false;
        const userName = doc.getElementById('userName');
        const guildsList = doc.getElementById('guildsList');
        const userStuck = userName && /cargando/i.test(String(userName.textContent || '').trim());
        const guildsStuck = guildsList && /cargando servidores/i.test(String(guildsList.textContent || '').toLowerCase());
        return userStuck || guildsStuck;
    }

    function showWatchdogMessage() {
        if (!isStuckLoading()) return;

        const userName = doc.getElementById('userName');
        if (userName && /cargando/i.test(String(userName.textContent || ''))) {
            userName.textContent = 'Panel no respondió';
        }

        const guildsList = doc.getElementById('guildsList');
        if (guildsList) {
            guildsList.className = 'dashboard-guilds-board';
            guildsList.innerHTML = `
                <div class="dashboard-guild-empty">
                    <h3>El panel tardó demasiado en iniciar</h3>
                    <p>Recarga con <strong>Ctrl+F5</strong>. Si persiste, revisa que el contenedor del bot esté en línea y que MySQL responda.</p>
                    <button type="button" class="btn btn-primary dashboard-guild-retry" onclick="location.reload()">Recargar página</button>
                </div>`;
        }

        global.console?.warn?.('⚠️ EyedBot panel: watchdog de arranque activado');
    }

    global.setTimeout(showWatchdogMessage, DEADLINE_MS);
})(window);
