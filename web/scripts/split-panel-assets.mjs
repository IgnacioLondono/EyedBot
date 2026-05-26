/**
 * Divide index.html en pantallas y dashboard-pro.css en módulos.
 * Uso: node web/scripts/split-panel-assets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');
const archiveDir = path.join(publicDir, 'assets', 'archive');
const screensDir = path.join(publicDir, 'partials', 'screens');
const overlaysPath = path.join(publicDir, 'partials', 'overlays.html');
const proCssDir = path.join(publicDir, 'assets', 'css', 'pro');

const indexPath = path.join(publicDir, 'index.html');
const cssPath = path.join(publicDir, 'assets', 'css', 'dashboard-pro.css');
const cssBackupPath = path.join(archiveDir, 'dashboard-pro.monolith.css');

/** Rangos 1-based [inicio, fin] del index.html monolítico */
const htmlLineRanges = [
    { file: 'dashboard.html', from: 162, to: 190 },
    { file: 'about.html', from: 192, to: 478 },
    { file: 'premium.html', from: 480, to: 530 },
    { file: 'settings.html', from: 532, to: 845 },
    { file: 'embed.html', from: 848, to: 1180 },
    { file: 'stats.html', from: 1183, to: 1295 },
    { file: 'logs.html', from: 1298, to: 1337 },
    { file: 'nuke.html', from: 1340, to: 1370 },
    { file: 'commands.html', from: 1373, to: 1407 },
    { file: 'server.html', from: 1410, to: 1823 },
    { file: 'overlays.html', from: 1827, to: 1983, dest: overlaysPath },
];

const cssChunks = [
    { file: '00-tokens.css', from: 1, to: 43 },
    { file: '01-shell-base.css', from: 44, to: 1436 },
    { file: '02-about-legacy.css', from: 1437, to: 1776 },
    { file: '03-about-rb3.css', from: 1777, to: 2678 },
    { file: '04-tickets-manage.css', from: 2679, to: 3797 },
    { file: '05-receipt-modal.css', from: 3798, to: 4264 },
    { file: '06-server-overview.css', from: 4265, to: 5072 },
    { file: '07-server-insights.css', from: 5073, to: 5909 },
    { file: '08-server-panes.css', from: 5910, to: 7082 },
    { file: '09-free-games.css', from: 7083, to: 8027 },
    { file: '10-mobile-levels-modules.css', from: 8028, to: 12748 },
    { file: '11-server-dashboard-v2.css', from: 12749, to: 16107 },
    { file: '12-card-accents.css', from: 16108, to: 16221 },
    { file: '13-eyedplus-lock.css', from: 16222, to: null },
];

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function sliceLines(lines, from, to) {
    return lines.slice(from - 1, to).join('\n').trim();
}

function splitHtml() {
    const lines = fs.readFileSync(indexPath, 'utf8').split(/\r?\n/);
    ensureDir(screensDir);

    for (const block of htmlLineRanges) {
        const content = sliceLines(lines, block.from, block.to);
        const out = block.dest || path.join(screensDir, block.file);
        ensureDir(path.dirname(out));
        fs.writeFileSync(out, `${content}\n`, 'utf8');
        const label = block.dest ? 'partials/overlays.html' : `screens/${block.file}`;
        console.log(`HTML → ${label} (${block.to - block.from + 1} líneas)`);
    }
}

function splitCss() {
    const sourcePath = fs.existsSync(cssBackupPath) ? cssBackupPath : cssPath;
    const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);
    const total = lines.length;

    if (!fs.existsSync(cssBackupPath) && fs.readFileSync(cssPath, 'utf8').includes('@import')) {
        throw new Error('dashboard-pro.css ya es agregador; falta dashboard-pro.monolith.css');
    }
    if (!fs.existsSync(cssBackupPath)) {
        fs.copyFileSync(cssPath, cssBackupPath);
        console.log('CSS backup → dashboard-pro.monolith.css');
    }

    ensureDir(proCssDir);

    for (const chunk of cssChunks) {
        const from = chunk.from;
        const to = chunk.to === null ? total : chunk.to;
        const body = sliceLines(lines, from, to);
        fs.writeFileSync(path.join(proCssDir, chunk.file), `${body}\n`, 'utf8');
        console.log(`CSS → pro/${chunk.file} (${to - from + 1} líneas)`);
    }

    const imports = cssChunks.map((c) => `@import url('pro/${c.file}');`).join('\n');
    fs.writeFileSync(cssPath, `/* EyedBot — Dashboard Pro (módulos en css/pro/) */\n${imports}\n`, 'utf8');
    console.log('CSS → dashboard-pro.css (agregador)');
}

function buildIndexShell() {
    const monolithPath = path.join(archiveDir, 'index.monolith.html');
    const sourcePath = fs.existsSync(monolithPath) ? monolithPath : indexPath;
    const lines = fs.readFileSync(sourcePath, 'utf8').split(/\r?\n/);

    if (!fs.existsSync(monolithPath) && lines.length > 500) {
        fs.copyFileSync(indexPath, monolithPath);
        console.log('HTML backup → index.monolith.html');
    }

    const head = lines.slice(0, 157).join('\n');
    const tailLines = lines.slice(1984);
    const tail = tailLines
        .join('\n')
        .replace(
            '<script src="https://cdn.jsdelivr.net/npm/chart.js',
            '<script src="screen-loader.js?v=20260524-modular"></script>\n    <script src="https://cdn.jsdelivr.net/npm/chart.js'
        );

    const middle = `
    <!-- Pantallas: partials/screens/*.html (cargadas por screen-loader.js) -->
    <main id="appScreensMount" class="main-content"></main>
    <div id="appOverlaysMount"></div>
`;

    const shell = `${head}\n${middle}\n${tail}`;
    fs.writeFileSync(indexPath, shell, 'utf8');
    console.log(`index.html shell (${shell.split(/\n/).length} líneas)`);
}

const args = process.argv.slice(2);
if (args.includes('--shell-only')) {
    buildIndexShell();
} else if (args.includes('--css-only')) {
    splitCss();
} else if (args.includes('--html-only')) {
    splitHtml();
} else {
    splitHtml();
    splitCss();
    buildIndexShell();
}
console.log('Listo.');
