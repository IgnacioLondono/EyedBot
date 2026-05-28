/**
 * Ordena web/public: assets/js, assets/css, assets/archive
 * Uso: node web/scripts/organize-public.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const jsDir = path.join(publicDir, 'assets', 'js');
const cssDir = path.join(publicDir, 'assets', 'css');
const proDir = path.join(cssDir, 'pro');
const archiveDir = path.join(publicDir, 'assets', 'archive');

const moves = [
    ['app.js', jsDir],
    ['screen-loader.js', jsDir],
    ['mobile-shell.js', jsDir],
    ['mobile-detect.js', jsDir],
    ['welcome-card-studio.js', jsDir],
    ['styles.css', cssDir],
    ['dashboard-pro.css', cssDir],
    ['mobile-app.css', cssDir],
    ['welcome-card-studio.css', cssDir],
    ['index.monolith.html', archiveDir],
    ['dashboard-pro.monolith.css', archiveDir],
];

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function moveFile(name, destDir) {
    const from = path.join(publicDir, name);
    const to = path.join(destDir, name);
    if (!fs.existsSync(from)) return false;
    ensureDir(destDir);
    if (fs.existsSync(to)) fs.unlinkSync(to);
    fs.renameSync(from, to);
    const rel = path.relative(publicDir, to).replace(/\\/g, '/');
    console.log(`→ ${rel}`);
    return true;
}

function moveProFolder() {
    const legacyPro = path.join(publicDir, 'css', 'pro');
    if (!fs.existsSync(legacyPro)) return;
    ensureDir(proDir);
    for (const file of fs.readdirSync(legacyPro)) {
        const from = path.join(legacyPro, file);
        const to = path.join(proDir, file);
        if (fs.existsSync(to)) fs.unlinkSync(to);
        fs.renameSync(from, to);
    }
    fs.rmdirSync(legacyPro);
    try {
        fs.rmdirSync(path.join(publicDir, 'css'));
    } catch {
        /* puede quedar uploads u otros */
    }
    console.log('→ assets/css/pro/*');
}

function fixDashboardProImports() {
    const file = path.join(cssDir, 'dashboard-pro.css');
    if (!fs.existsSync(file)) return;
    let text = fs.readFileSync(file, 'utf8');
    text = text.replace(/@import url\('css\/pro\//g, "@import url('pro/");
    fs.writeFileSync(file, text, 'utf8');
    console.log('✓ dashboard-pro.css imports → pro/');
}

function patchFile(filePath, replacers) {
    if (!fs.existsSync(filePath)) return;
    let text = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    for (const [from, to] of replacers) {
        if (text.includes(from)) {
            text = text.split(from).join(to);
            changed = true;
        }
    }
    if (changed) {
        fs.writeFileSync(filePath, text, 'utf8');
        console.log(`✓ ${path.relative(publicDir, filePath).replace(/\\/g, '/')}`);
    }
}

ensureDir(jsDir);
ensureDir(cssDir);
ensureDir(archiveDir);

for (const [name, dest] of moves) moveFile(name, dest);
moveProFolder();
fixDashboardProImports();

const assetCss = 'assets/css/';
const assetJs = 'assets/js/';

patchFile(path.join(publicDir, 'index.html'), [
    ['href="styles.css', `href="${assetCss}styles.css`],
    ['href="dashboard-pro.css', `href="${assetCss}dashboard-pro.css`],
    ['href="welcome-card-studio.css', `href="${assetCss}welcome-card-studio.css`],
    ['href="mobile-app.css', `href="${assetCss}mobile-app.css`],
    ['src="mobile-detect.js', `src="${assetJs}mobile-detect.js`],
    ['src="screen-loader.js', `src="${assetJs}screen-loader.js`],
    ['src="welcome-card-studio.js', `src="${assetJs}welcome-card-studio.js`],
    ['src="mobile-shell.js', `src="${assetJs}mobile-shell.js`],
    ['src="app.js', `src="${assetJs}app.js`],
]);

patchFile(path.join(publicDir, 'login.html'), [
    ['src="mobile-detect.js', `src="${assetJs}mobile-detect.js`],
]);

const splitScript = path.resolve(__dirname, 'split-panel-assets.mjs');
patchFile(splitScript, [
    ["path.join(publicDir, 'index.monolith.html')", "path.join(archiveDir, 'index.monolith.html')"],
    ["path.join(publicDir, 'dashboard-pro.monolith.css')", "path.join(archiveDir, 'dashboard-pro.monolith.css')"],
    ['const cssPath = path.join(publicDir, \'dashboard-pro.css\');', "const cssPath = path.join(publicDir, 'assets', 'css', 'dashboard-pro.css');"],
    ['const cssBackupPath = path.join(publicDir, \'dashboard-pro.monolith.css\');', "const cssBackupPath = path.join(publicDir, 'assets', 'archive', 'dashboard-pro.monolith.css');"],
    ['const proCssDir = path.join(publicDir, \'css\', \'pro\');', "const proCssDir = path.join(publicDir, 'assets', 'css', 'pro');"],
    ["@import url('css/pro/", "@import url('pro/"],
]);

// Fix split script archive paths properly
let splitText = fs.readFileSync(splitScript, 'utf8');
splitText = splitText.replace(
    /const publicDir = path\.resolve\(__dirname, '\.\.\/public'\);/,
    `const publicDir = path.resolve(__dirname, '../public');
const archiveDir = path.join(publicDir, 'assets', 'archive');`
);
if (!splitText.includes('const archiveDir')) {
    splitText = splitText.replace(
        "const publicDir = path.resolve(__dirname, '../public');",
        `const publicDir = path.resolve(__dirname, '../public');
const archiveDir = path.join(publicDir, 'assets', 'archive');`
    );
}
splitText = splitText.replace(
    /const monolithPath = path\.join\(publicDir, 'index\.monolith\.html'\);/g,
    "const monolithPath = path.join(archiveDir, 'index.monolith.html');"
);
splitText = splitText.replace(
    /path\.join\(publicDir, 'dashboard-pro\.monolith\.css'\)/g,
    "path.join(archiveDir, 'dashboard-pro.monolith.css')"
);
splitText = splitText.replace(
    /const cssPath = path\.join\(publicDir, 'dashboard-pro\.css'\);/,
    "const cssPath = path.join(publicDir, 'assets', 'css', 'dashboard-pro.css');"
);
splitText = splitText.replace(
    /const cssBackupPath = path\.join\(publicDir, 'dashboard-pro\.monolith\.css'\);/,
    "const cssBackupPath = path.join(archiveDir, 'dashboard-pro.monolith.css');"
);
splitText = splitText.replace(
    /const proCssDir = path\.join\(publicDir, 'css', 'pro'\);/,
    "const proCssDir = path.join(publicDir, 'assets', 'css', 'pro');"
);
splitText = splitText.replace(
    /\.map\(\(c\) => `@import url\('css\/pro\/\$\{c\.file\}'\)`\)/,
    ".map((c) => `@import url('pro/${c.file}')`)"
);
fs.writeFileSync(splitScript, splitText, 'utf8');
console.log('✓ web/scripts/split-panel-assets.mjs');

console.log('\nListo. Raíz public/: index.html, login.html, partials/, assets/');
