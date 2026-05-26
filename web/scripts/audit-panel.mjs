/**
 * Auditoría del panel web modular.
 * Uso: node web/scripts/audit-panel.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

const errors = [];
const warnings = [];
const ok = [];

function err(msg) {
    errors.push(msg);
}
function warn(msg) {
    warnings.push(msg);
}
function pass(msg) {
    ok.push(msg);
}

function fileExists(rel) {
    return fs.existsSync(path.join(publicDir, rel));
}

function read(rel) {
    return fs.readFileSync(path.join(publicDir, rel), 'utf8');
}

// --- 1. Raíz limpia ---
const rootAllowed = new Set(['index.html', 'login.html', 'README.md']);
for (const name of fs.readdirSync(publicDir)) {
    const full = path.join(publicDir, name);
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    if (!rootAllowed.has(name)) {
        err(`Archivo suelto en raíz public/: ${name} (mover a assets/ o eliminar duplicado)`);
    }
}

// --- 2. Assets requeridos desde index.html ---
const indexHtml = read('index.html');
const assetRefs = [
    ...indexHtml.matchAll(/(?:href|src)="([^"?]+\?[^"]*|[^"?]+)"/g),
].map((m) => m[1].split('?')[0]);

for (const ref of assetRefs) {
    if (ref.startsWith('http') || ref.startsWith('//')) continue;
    if (ref === '#' || ref.startsWith('/')) continue;
    if (!ref.includes('.')) continue;
    if (!fileExists(ref)) {
        err(`index.html referencia archivo inexistente: ${ref}`);
    } else {
        pass(`Asset index: ${ref}`);
    }
}

// --- 3. login.html ---
const loginHtml = read('login.html');
const loginScript = loginHtml.match(/src="([^"]+)"/);
if (loginScript) {
    const ref = loginScript[1].split('?')[0];
    if (!fileExists(ref)) err(`login.html: falta ${ref}`);
    else pass(`login.html: ${ref}`);
}

// --- 4. Partials screen-loader ---
const screens = [
    'partials/screens/dashboard.html',
    'partials/screens/about.html',
    'partials/screens/premium.html',
    'partials/screens/settings.html',
    'partials/screens/embed.html',
    'partials/screens/stats.html',
    'partials/screens/logs.html',
    'partials/screens/nuke.html',
    'partials/screens/commands.html',
    'partials/screens/server.html',
    'partials/overlays.html',
];
for (const s of screens) {
    if (!fileExists(s)) err(`Falta partial: ${s}`);
    else pass(`Partial: ${s}`);
}

// --- 5. CSS pro (links en index o @import legacy) ---
const proModules = [
    '00-tokens.css', '01-shell-base.css', '02-about-legacy.css', '03-about-rb3.css',
    '04-tickets-manage.css', '05-receipt-modal.css', '06-server-overview.css',
    '07-server-insights.css', '08-server-panes.css', '09-free-games.css',
    '10-mobile-levels-modules.css', '11-server-dashboard-v2.css', '12-card-accents.css',
    '13-eyedplus-lock.css',
];
for (const mod of proModules) {
    const cssPath = `assets/css/pro/${mod}`;
    if (!fileExists(cssPath)) err(`Falta módulo CSS: ${cssPath}`);
    else pass(`CSS pro: ${mod}`);
}
if (!indexHtml.includes('assets/css/pro/00-tokens.css')) {
    warn('index.html no enlaza módulos pro directamente (¿usa @import?)');
}

// --- 6. Duplicados legacy css/pro vs assets/css/pro ---
const legacyPro = path.join(publicDir, 'css', 'pro');
const assetsPro = path.join(publicDir, 'assets', 'css', 'pro');
if (fs.existsSync(legacyPro)) {
    warn(`Carpeta duplicada obsoleta: css/pro/ (usar assets/css/pro/)`);
}

// --- 7. IDs críticos en partials vs app.js ---
const CRITICAL_IDS = [
    'dashboard',
    'controlCenterSection',
    'premiumSection',
    'profileSettingsSection',
    'embedSection',
    'statsSection',
    'logsSection',
    'nukeSection',
    'commandsSection',
    'serverSection',
    'guildsList',
    'serverMenuGuildName',
    'toastContainer',
    'appDialogModal',
    'appScreensMount',
    'userMenu',
    'userAvatar',
    'userName',
    'premiumSectionBillingHost',
    'aboutTotalServers',
    'aboutTotalCommands',
];

const combinedPartials = screens
    .map((s) => read(s))
    .join('\n');

for (const id of CRITICAL_IDS) {
    if (id === 'appScreensMount') {
        if (!indexHtml.includes(`id="${id}"`)) err(`Falta #${id} en index.html`);
        else pass(`ID shell: ${id}`);
        continue;
    }
    const re = new RegExp(`id=["']${id}["']`);
    if (!re.test(combinedPartials) && !re.test(indexHtml)) {
        err(`ID crítico no encontrado en partials/index: #${id}`);
    } else {
        pass(`ID: #${id}`);
    }
}

// --- 8. app.js boot ---
const appJs = read('assets/js/app.js');
if (!appJs.includes('__appScreensReady')) err('app.js no espera __appScreensReady');
else pass('app.js integración screen-loader');

if (!appJs.includes('bootEyedBotPanel')) err('app.js sin bootEyedBotPanel');
else pass('app.js bootEyedBotPanel');

// --- 9. mobile-shell event ---
const mobileShell = read('assets/js/mobile-shell.js');
if (!mobileShell.includes('eyedbot:screens-ready')) warn('mobile-shell.js: revisar eyedbot:screens-ready');
else pass('mobile-shell.js escucha screens-ready');

// --- 10. Secciones data-section en nav ---
const navSections = [
    'controlCenterSection',
    'commandsSection',
    'premiumSection',
    'profileSettingsSection',
];
for (const sec of navSections) {
    if (!indexHtml.includes(sec) && !combinedPartials.includes(`id="${sec}"`)) {
        err(`Nav/sección desincronizada: ${sec}`);
    }
}

// --- 11. Comparar app.js duplicado en raíz ---
if (fileExists('app.js')) {
    const rootApp = read('app.js');
    const assetsApp = read('assets/js/app.js');
    if (rootApp.length === assetsApp.length) {
        warn('app.js duplicado en raíz (mismo tamaño que assets/js/app.js) — eliminar raíz');
    } else {
        err('app.js en raíz difiere de assets/js/app.js — consolidar');
    }
}

// --- 12. IDs getElementById en app.js ---
const appJsPath = 'assets/js/app.js';
if (fileExists(appJsPath)) {
    const appJs = read(appJsPath);
    const idRefs = [...appJs.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
    const uniqIds = [...new Set(idRefs)];
    const domHtml = indexHtml + combinedPartials;
    const dynamicIds = new Set([
        'billingPanelCard',
        'billingPanelCardPremium',
        'billingUpgradeBtn',
        'billingManageBtn',
        'billingUpgradeBtnPremium',
        'billingManageBtnPremium',
        'billingStatusValue',
        'billingPeriodValue',
        'billingActionHint',
        'mobileForceDesktopSettings',
        'mobileServerTopbar',
        'mobileServerTopbarTitle',
    ]);
    const missingIds = [];
    for (const id of uniqIds) {
        if (dynamicIds.has(id)) continue;
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`id=["']${escaped}["']`);
        if (!re.test(domHtml)) missingIds.push(id);
    }
    if (missingIds.length) {
        warn(`${missingIds.length} getElementById sin id en HTML (pueden ser dinámicos): ${missingIds.slice(0, 8).join(', ')}${missingIds.length > 8 ? '…' : ''}`);
    } else {
        pass(`Todos los getElementById (${uniqIds.length}) tienen id en DOM o lista dinámica`);
    }
}

// --- Report ---
console.log('\n=== AUDITORÍA PANEL EYEDBOT ===\n');
console.log(`✅ OK: ${ok.length}`);
ok.slice(0, 5).forEach((m) => console.log(`   · ${m}`));
if (ok.length > 5) console.log(`   … y ${ok.length - 5} más`);

if (warnings.length) {
    console.log(`\n⚠️  ADVERTENCIAS: ${warnings.length}`);
    warnings.forEach((m) => console.log(`   · ${m}`));
}

if (errors.length) {
    console.log(`\n❌ ERRORES: ${errors.length}`);
    errors.forEach((m) => console.log(`   · ${m}`));
    process.exit(1);
}

console.log('\n✅ Auditoría pasada sin errores críticos.\n');
process.exit(0);
