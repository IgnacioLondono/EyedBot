require('dotenv').config();

const db = require('../utils/database');
const { createBackupNow } = require('../utils/backup-scheduler');

(async () => {
    try {
        await db.init().catch(() => false);
        const result = await createBackupNow('manual');
        if (!result) {
            console.error('No se pudo crear el backup manual.');
            process.exit(1);
        }

        console.log(`Backup manual creado en: ${result}`);
        await db.close().catch(() => null);
        process.exit(0);
    } catch (error) {
        console.error('Error en backup manual:', error.message || error);
        process.exit(1);
    }
})();
