const fs = require('fs');
const path = require('path');
const db = require('./database');

const DB_NAME = process.env.DB_NAME || 'tulabot';
const BACKUP_ENABLED = (process.env.BACKUP_ENABLED || (process.env.NODE_ENV === 'production' ? 'true' : 'false')).toLowerCase() === 'true';
const BACKUP_RUN_ON_START = (process.env.BACKUP_RUN_ON_START || 'true').toLowerCase() === 'true';
const BACKUP_INTERVAL_MINUTES = Math.max(10, Number.parseInt(process.env.BACKUP_INTERVAL_MINUTES || '360', 10));
const BACKUP_RETENTION_DAYS = Math.max(1, Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '14', 10));
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', '..', 'backups');
const INCLUDE_DATA_DIR = (process.env.BACKUP_INCLUDE_DATA || 'true').toLowerCase() === 'true';

let intervalRef = null;
let running = false;

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function nowStamp() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

async function exportDatabaseSnapshot() {
    const snapshot = {
        database: DB_NAME,
        exportedAt: new Date().toISOString(),
        tables: {}
    };

    try {
        const tables = await db.query(
            'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ? ORDER BY table_name',
            [DB_NAME]
        );

        for (const table of tables) {
            const tableName = table.name;
            try {
                const rows = await db.query(`SELECT * FROM \`${tableName}\``);
                snapshot.tables[tableName] = rows;
            } catch (error) {
                snapshot.tables[tableName] = { error: error.message || 'error' };
            }
        }

        return snapshot;
    } catch (error) {
        snapshot.error = error.message || 'Error exportando base de datos';
        return snapshot;
    }
}

function cleanupOldBackups(baseDir) {
    const maxAgeMs = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('backup-'));

    for (const entry of entries) {
        const fullPath = path.join(baseDir, entry.name);
        try {
            const stat = fs.statSync(fullPath);
            if ((now - stat.mtimeMs) > maxAgeMs) {
                fs.rmSync(fullPath, { recursive: true, force: true });
                console.log(`🧹 Backup antiguo eliminado: ${entry.name}`);
            }
        } catch {
            // ignore cleanup errors
        }
    }
}

async function createBackupNow(reason = 'scheduled') {
    if (running) return null;

    running = true;
    const startedAt = Date.now();

    try {
        ensureDir(BACKUP_DIR);
        const folderName = `backup-${nowStamp()}`;
        const targetDir = path.join(BACKUP_DIR, folderName);
        ensureDir(targetDir);

        const dbSnapshot = await exportDatabaseSnapshot();
        fs.writeFileSync(path.join(targetDir, 'database.json'), JSON.stringify(dbSnapshot, null, 2), 'utf8');

        if (INCLUDE_DATA_DIR) {
            const dataDir = path.join(__dirname, '..', '..', 'data');
            if (fs.existsSync(dataDir)) {
                fs.cpSync(dataDir, path.join(targetDir, 'data'), { recursive: true });
            }
        }

        const manifest = {
            reason,
            createdAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt,
            backupDir: targetDir,
            includes: {
                database: true,
                dataDir: INCLUDE_DATA_DIR
            },
            dbError: dbSnapshot.error || null
        };
        fs.writeFileSync(path.join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

        cleanupOldBackups(BACKUP_DIR);
        console.log(`💾 Backup completado (${reason}): ${targetDir}`);
        if (dbSnapshot.error) {
            console.warn(`⚠️ Backup de DB incompleto: ${dbSnapshot.error}`);
        }

        return targetDir;
    } catch (error) {
        console.error('❌ Error creando backup automático:', error.message || error);
        return null;
    } finally {
        running = false;
    }
}

function startBackupScheduler() {
    if (!BACKUP_ENABLED) {
        console.log('ℹ️ Backups automáticos desactivados (BACKUP_ENABLED=false).');
        return;
    }

    if (intervalRef) return;

    const everyMs = BACKUP_INTERVAL_MINUTES * 60 * 1000;
    ensureDir(BACKUP_DIR);
    console.log(`💾 Backups automáticos activados cada ${BACKUP_INTERVAL_MINUTES} min en: ${BACKUP_DIR}`);

    if (BACKUP_RUN_ON_START) {
        createBackupNow('startup').catch(() => null);
    }

    intervalRef = setInterval(() => {
        createBackupNow('interval').catch(() => null);
    }, everyMs);
}

function stopBackupScheduler() {
    if (intervalRef) {
        clearInterval(intervalRef);
        intervalRef = null;
    }
}

module.exports = {
    startBackupScheduler,
    stopBackupScheduler,
    createBackupNow
};
