const mysql = require('mysql2/promise');

const DB_RETRY_COOLDOWN_MS = Number.parseInt(process.env.DB_RETRY_COOLDOWN_MS || '30000', 10);

// Configuración de conexión a MySQL
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'tulabot',
    password: process.env.DB_PASSWORD || 'tulabot_password',
    database: process.env.DB_NAME || 'tulabot',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

const CORE_SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS key_value_store (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(255) NOT NULL UNIQUE,
        \`value\` TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_key (\`key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS warnings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        moderator_id VARCHAR(255) NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_guild_user (guild_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS guild_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(255) NOT NULL UNIQUE,
        prefix VARCHAR(10) DEFAULT '!',
        welcome_channel_id VARCHAR(255),
        autoresponder_enabled BOOLEAN DEFAULT FALSE,
        autoresponder_responses JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_guild (guild_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        guild_id VARCHAR(255),
        message TEXT NOT NULL,
        remind_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_remind (user_id, remind_at),
        INDEX idx_remind_at (remind_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS ai_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        role ENUM('user', 'assistant') NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_channel (user_id, channel_id),
        INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

// Pool de conexiones
let pool = null;
let dbUnavailableUntil = 0;
let lastConnectionWarningAt = 0;

function isConnectionError(error) {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('pool is closed')) return true;
    return [
        'EAI_AGAIN',
        'ENOTFOUND',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'PROTOCOL_CONNECTION_LOST',
        'ER_CON_COUNT_ERROR'
    ].includes(code);
}

function isMissingTableError(error) {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    return code === 'ER_NO_SUCH_TABLE' || message.includes("doesn't exist") || message.includes('does not exist');
}

function setDbUnavailable(error, context) {
    dbUnavailableUntil = Date.now() + DB_RETRY_COOLDOWN_MS;

    if (pool) {
        pool.end().catch(() => null);
        pool = null;
    }

    const now = Date.now();
    if (now - lastConnectionWarningAt >= DB_RETRY_COOLDOWN_MS) {
        lastConnectionWarningAt = now;
        console.warn(`⚠️ MySQL no disponible (${context}): ${error?.message || 'error desconocido'}`);
        console.warn(`💡 Reintentando conexión en ~${Math.round(DB_RETRY_COOLDOWN_MS / 1000)}s. Host actual: ${dbConfig.host}:${dbConfig.port}`);
    }
}

function shouldSkipDbCall() {
    return Date.now() < dbUnavailableUntil;
}

// Inicializar pool de conexiones
function initPool() {
    if (!pool) {
        pool = mysql.createPool(dbConfig);
        console.log('✅ Pool de conexiones MySQL inicializado');
    }
    return pool;
}

// Obtener conexión del pool
async function getConnection() {
    if (!pool) {
        initPool();
    }
    return pool;
}

async function ensureSchema(connection) {
    for (const statement of CORE_SCHEMA_STATEMENTS) {
        await connection.execute(statement);
    }
}

/** Informes de tickets pueden superar el limite TEXT (~64KB); ampliar a LONGTEXT si hace falta. */
async function ensureKeyValueStoreLongValue(connection) {
    try {
        await connection.execute(
            'ALTER TABLE key_value_store MODIFY COLUMN `value` LONGTEXT'
        );
    } catch {
        // Ya LONGTEXT, permisos, o motor distinto: ignorar
    }
}

async function executeWithSchemaRecovery(connection, sql, params = [], context = 'query') {
    try {
        return await connection.execute(sql, params);
    } catch (error) {
        if (isMissingTableError(error)) {
            try {
                await ensureSchema(connection);
                return await connection.execute(sql, params);
            } catch (schemaError) {
                console.error(`Error creando esquema MySQL (${context}):`, schemaError.message);
                throw schemaError;
            }
        }

        throw error;
    }
}

// Función auxiliar para serializar valores
function serializeValue(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

// Función auxiliar para deserializar valores
function deserializeValue(value) {
    if (value === null || value === undefined) {
        return null;
    }
    try {
        // Intentar parsear como JSON
        const parsed = JSON.parse(value);
        return parsed;
    } catch (e) {
        // Si no es JSON, devolver el valor tal cual
        return value;
    }
}

// API compatible con quick.db
const database = {
    // Inicializar conexión
    init: async () => {
        try {
            const connection = await initPool().getConnection();
            await connection.ping();
            await ensureSchema(connection);
            await ensureKeyValueStoreLongValue(connection);
            connection.release();
            console.log('✅ Conexión a MySQL establecida correctamente');
            dbUnavailableUntil = 0;
            return true;
        } catch (error) {
            if (isConnectionError(error)) {
                setDbUnavailable(error, 'init');
            } else {
                console.error('❌ Error conectando a MySQL:', error.message);
            }
            console.warn('💡 Verifica las variables: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME');
            // No lanzar error, permitir que el bot continúe funcionando
            // Las funciones que requieren DB fallarán de forma controlada
            return false;
        }
    },

    get: async (key) => {
        if (shouldSkipDbCall()) return null;
        try {
            const conn = await getConnection();
            const [rows] = await executeWithSchemaRecovery(
                conn,
                'SELECT `value` FROM key_value_store WHERE `key` = ?',
                [key],
                `get:${key}`
            );
            
            if (rows.length === 0) {
                return null;
            }
            
            return deserializeValue(rows[0].value);
        } catch (error) {
            if (isConnectionError(error)) {
                setDbUnavailable(error, `get:${key}`);
                return null;
            }
            console.error(`Error en database.get("${key}"):`, error.message);
            return null;
        }
    },
    
    set: async (key, value) => {
        if (shouldSkipDbCall()) return value;
        try {
            const conn = await getConnection();
            const serialized = serializeValue(value);
            
            await executeWithSchemaRecovery(
                conn,
                'INSERT INTO key_value_store (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
                [key, serialized, serialized],
                `set:${key}`
            );
            
            return value;
        } catch (error) {
            if (isConnectionError(error)) {
                setDbUnavailable(error, `set:${key}`);
                return value;
            }
            console.error(`Error en database.set("${key}"):`, error.message);
            return value;
        }
    },
    
    delete: async (key) => {
        if (shouldSkipDbCall()) return false;
        try {
            const conn = await getConnection();
            const [result] = await executeWithSchemaRecovery(
                conn,
                'DELETE FROM key_value_store WHERE `key` = ?',
                [key],
                `delete:${key}`
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            if (isConnectionError(error)) {
                setDbUnavailable(error, `delete:${key}`);
                return false;
            }
            console.error(`Error en database.delete("${key}"):`, error.message);
            return false;
        }
    },
    
    has: async (key) => {
        if (shouldSkipDbCall()) return false;
        try {
            const conn = await getConnection();
            const [rows] = await executeWithSchemaRecovery(
                conn,
                'SELECT 1 FROM key_value_store WHERE `key` = ? LIMIT 1',
                [key],
                `has:${key}`
            );
            
            return rows.length > 0;
        } catch (error) {
            if (isConnectionError(error)) {
                setDbUnavailable(error, `has:${key}`);
                return false;
            }
            console.error(`Error en database.has("${key}"):`, error.message);
            return false;
        }
    },
    
    all: async () => {
        if (shouldSkipDbCall()) return [];
        try {
            const conn = await getConnection();
            const [rows] = await executeWithSchemaRecovery(
                conn,
                'SELECT `key` as ID, `value` as data FROM key_value_store',
                [],
                'all'
            );
            
            return rows.map(row => ({
                ID: row.ID,
                data: deserializeValue(row.data)
            }));
        } catch (error) {
            if (isConnectionError(error)) {
                setDbUnavailable(error, 'all');
                return [];
            }
            console.error('Error en database.all():', error.message);
            return [];
        }
    },

    /**
     * Lista pares key/value con clave leveling_user_{guildId}_{userId} (MySQL REGEXP).
     */
    listLevelingUserKeysForGuild: async (guildId) => {
        if (shouldSkipDbCall()) return [];
        const gid = String(guildId || '').replace(/\\/g, '\\\\').replace(/[.^$*+?()[\]{}|]/g, '\\$&');
        const pattern = `^leveling_user_${gid}_[0-9]+$`;
        try {
            const conn = await getConnection();
            const [rows] = await executeWithSchemaRecovery(
                conn,
                'SELECT `key`, `value` FROM key_value_store WHERE `key` REGEXP ?',
                [pattern],
                `listLevelingUserKeysForGuild:${guildId}`
            );
            return rows.map((row) => ({ key: row.key, value: deserializeValue(row.value) }));
        } catch (error) {
            if (isConnectionError(error)) {
                setDbUnavailable(error, `listLevelingUserKeysForGuild:${guildId}`);
                return [];
            }
            console.error(`Error en database.listLevelingUserKeysForGuild("${guildId}"):`, error.message);
            return [];
        }
    },

    // Métodos adicionales para MySQL
    query: async (sql, params = []) => {
        if (shouldSkipDbCall()) {
            throw new Error('MySQL temporalmente no disponible');
        }
        try {
            const conn = await getConnection();
            const [rows] = await executeWithSchemaRecovery(conn, sql, params, 'query');
            return rows;
        } catch (error) {
            if (isConnectionError(error)) {
                setDbUnavailable(error, 'query');
            }
            console.error('Error en database.query():', error.message);
            throw error;
        }
    },

    // Cerrar conexiones (útil para shutdown graceful)
    close: async () => {
        if (pool) {
            await pool.end();
            pool = null;
            console.log('✅ Pool de conexiones MySQL cerrado');
        }
    }
};

// No inicializar automáticamente - se inicializa desde index.js
// Esto evita inicializaciones duplicadas y mejor control de errores

module.exports = database;
