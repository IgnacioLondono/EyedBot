/**
 * Script de migración de database.json a MySQL
 * Ejecutar: node docker/migrate-json-to-mysql.js
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbPath = path.join(__dirname, '../../data/database.json');

async function migrate() {
    // Leer database.json
    if (!fs.existsSync(dbPath)) {
        console.log('⚠️ No se encontró database.json. No hay nada que migrar.');
        return;
    }

    let jsonData = {};
    try {
        jsonData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        console.log('✅ database.json cargado correctamente');
    } catch (error) {
        console.error('❌ Error leyendo database.json:', error.message);
        return;
    }

    // Conectar a MySQL
    const dbConfig = {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER || 'tulabot',
        password: process.env.DB_PASSWORD || 'tulabot_password',
        database: process.env.DB_NAME || 'tulabot'
    };

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ Conectado a MySQL');
    } catch (error) {
        console.error('❌ Error conectando a MySQL:', error.message);
        return;
    }

    // Función para aplanar objetos anidados
    function flattenObject(obj, prefix = '') {
        const result = {};
        for (const key in obj) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                Object.assign(result, flattenObject(obj[key], fullKey));
            } else {
                result[fullKey] = obj[key];
            }
        }
        return result;
    }

    // Aplanar datos
    const flatData = flattenObject(jsonData);
    const entries = Object.entries(flatData);

    if (entries.length === 0) {
        console.log('⚠️ No hay datos para migrar');
        await connection.end();
        return;
    }

    console.log(`📦 Migrando ${entries.length} entradas...`);

    // Migrar datos
    let migrated = 0;
    let errors = 0;

    for (const [key, value] of entries) {
        try {
            const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
            
            await connection.execute(
                'INSERT INTO key_value_store (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
                [key, serialized, serialized]
            );
            
            migrated++;
        } catch (error) {
            console.error(`❌ Error migrando clave "${key}":`, error.message);
            errors++;
        }
    }

    await connection.end();

    console.log('\n✅ Migración completada:');
    console.log(`   - Migradas: ${migrated}`);
    console.log(`   - Errores: ${errors}`);
    console.log(`   - Total: ${entries.length}`);
}

// Ejecutar migración
migrate().catch(error => {
    console.error('❌ Error fatal en migración:', error);
    process.exit(1);
});

