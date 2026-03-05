const mysql = require('mysql2/promise');

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

// Pool de conexiones
let pool = null;

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
            connection.release();
            console.log('✅ Conexión a MySQL establecida correctamente');
            return true;
        } catch (error) {
            console.error('❌ Error conectando a MySQL:', error.message);
            console.warn('💡 Verifica las variables de entorno: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME');
            // No lanzar error, permitir que el bot continúe funcionando
            // Las funciones que requieren DB fallarán de forma controlada
            return false;
        }
    },

    get: async (key) => {
        try {
            const conn = await getConnection();
            const [rows] = await conn.execute(
                'SELECT `value` FROM key_value_store WHERE `key` = ?',
                [key]
            );
            
            if (rows.length === 0) {
                return null;
            }
            
            return deserializeValue(rows[0].value);
        } catch (error) {
            console.error(`Error en database.get("${key}"):`, error.message);
            return null;
        }
    },
    
    set: async (key, value) => {
        try {
            const conn = await getConnection();
            const serialized = serializeValue(value);
            
            await conn.execute(
                'INSERT INTO key_value_store (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = ?',
                [key, serialized, serialized]
            );
            
            return value;
        } catch (error) {
            console.error(`Error en database.set("${key}"):`, error.message);
            throw error;
        }
    },
    
    delete: async (key) => {
        try {
            const conn = await getConnection();
            const [result] = await conn.execute(
                'DELETE FROM key_value_store WHERE `key` = ?',
                [key]
            );
            
            return result.affectedRows > 0;
        } catch (error) {
            console.error(`Error en database.delete("${key}"):`, error.message);
            return false;
        }
    },
    
    has: async (key) => {
        try {
            const conn = await getConnection();
            const [rows] = await conn.execute(
                'SELECT 1 FROM key_value_store WHERE `key` = ? LIMIT 1',
                [key]
            );
            
            return rows.length > 0;
        } catch (error) {
            console.error(`Error en database.has("${key}"):`, error.message);
            return false;
        }
    },
    
    all: async () => {
        try {
            const conn = await getConnection();
            const [rows] = await conn.execute(
                'SELECT `key` as ID, `value` as data FROM key_value_store'
            );
            
            return rows.map(row => ({
                ID: row.ID,
                data: deserializeValue(row.data)
            }));
        } catch (error) {
            console.error('Error en database.all():', error.message);
            return [];
        }
    },

    // Métodos adicionales para MySQL
    query: async (sql, params = []) => {
        try {
            const conn = await getConnection();
            const [rows] = await conn.execute(sql, params);
            return rows;
        } catch (error) {
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
