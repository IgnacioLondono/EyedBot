let mysql = null;

const DB_RETRY_COOLDOWN_MS = Number.parseInt(process.env.DB_RETRY_COOLDOWN_MS || '30000', 10);

// Configuración de conexión a MySQL
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'tulabot',
    password: process.env.DB_PASSWORD || 'tulabot_password',
    database: process.env.DB_NAME || 'tulabot',
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: Number.parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '5000', 10) || 5000,
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
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS gacha_catalog_shop_image (
        guild_id VARCHAR(32) NOT NULL,
        character_id VARCHAR(128) NOT NULL,
        mime_type VARCHAR(80) NOT NULL,
        image LONGBLOB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, character_id),
        INDEX idx_shop_img_guild (guild_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS greeting_embed_image (
        guild_id VARCHAR(32) NOT NULL,
        slot VARCHAR(32) NOT NULL,
        mime_type VARCHAR(80) NOT NULL,
        image LONGBLOB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, slot),
        INDEX idx_greeting_img_guild (guild_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_user_daily_stats (
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        stat_date DATE NOT NULL,
        messages INT UNSIGNED NOT NULL DEFAULT 0,
        voice_minutes INT UNSIGNED NOT NULL DEFAULT 0,
        voice_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0,
        xp_earned INT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, user_id, stat_date),
        INDEX idx_community_daily_guild_date (guild_id, stat_date),
        INDEX idx_community_daily_user_date (user_id, stat_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_wrapped_snapshots (
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        wrapped_year SMALLINT UNSIGNED NOT NULL,
        payload JSON NOT NULL,
        data_from DATE NULL,
        data_to DATE NULL,
        generated_at DATETIME(3) NULL,
        finalized BOOLEAN NOT NULL DEFAULT FALSE,
        schema_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, user_id, wrapped_year),
        INDEX idx_community_wrapped_year (guild_id, wrapped_year)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_tracking_metadata (
        guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
        tracking_started_at DATETIME(3) NOT NULL,
        timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_user_totals (
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        messages BIGINT UNSIGNED NOT NULL DEFAULT 0,
        voice_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0,
        xp_earned BIGINT UNSIGNED NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, user_id),
        INDEX idx_community_totals_guild (guild_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_voice_sessions (
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        started_at DATETIME(3) NOT NULL,
        checkpoint_at DATETIME(3) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (guild_id, user_id),
        INDEX idx_community_voice_checkpoint (checkpoint_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_request_nonces (
        nonce VARCHAR(128) NOT NULL PRIMARY KEY,
        user_id VARCHAR(32) NOT NULL,
        request_timestamp BIGINT NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_community_nonce_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_events (
        event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        event_type VARCHAR(80) NOT NULL,
        scope ENUM('self','guild_public','participants','staff') NOT NULL,
        subject_user_id VARCHAR(32) NULL,
        aggregate_id VARCHAR(64) NULL,
        payload JSON NOT NULL,
        created_at DATETIME(3) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        INDEX idx_community_events_replay (guild_id, event_id),
        INDEX idx_community_events_cleanup (expires_at, event_id),
        INDEX idx_community_events_subject (guild_id, subject_user_id, event_id),
        INDEX idx_community_events_aggregate (guild_id, aggregate_id, event_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS challenge_definitions (
        challenge_id VARCHAR(64) NOT NULL PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        description VARCHAR(255) NOT NULL,
        metric ENUM('messages','voice_seconds','xp','active_days') NOT NULL,
        target_value BIGINT UNSIGNED NOT NULL,
        reward_coins INT UNSIGNED NOT NULL DEFAULT 0,
        cadence ENUM('weekly') NOT NULL DEFAULT 'weekly',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS challenge_periods (
        period_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        challenge_id VARCHAR(64) NOT NULL,
        period_key VARCHAR(32) NOT NULL,
        starts_on DATE NOT NULL,
        ends_on DATE NOT NULL,
        timezone VARCHAR(64) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_challenge_period (guild_id, challenge_id, period_key),
        INDEX idx_challenge_period_current (guild_id, starts_on, ends_on)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS challenge_progress (
        period_id BIGINT UNSIGNED NOT NULL,
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        challenge_id VARCHAR(64) NOT NULL,
        progress_value BIGINT UNSIGNED NOT NULL DEFAULT 0,
        completed_at DATETIME(3) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (period_id, user_id),
        UNIQUE KEY uq_challenge_progress (guild_id, user_id, challenge_id, period_id),
        INDEX idx_challenge_progress_user (guild_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS challenge_claims (
        period_id BIGINT UNSIGNED NOT NULL,
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        challenge_id VARCHAR(64) NOT NULL,
        reward_coins INT UNSIGNED NOT NULL,
        claimed_at DATETIME(3) NOT NULL,
        PRIMARY KEY (period_id, user_id),
        UNIQUE KEY uq_challenge_claim (guild_id, user_id, challenge_id, period_id),
        INDEX idx_challenge_claim_user (guild_id, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS achievement_definitions (
        achievement_id VARCHAR(64) NOT NULL PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        description VARCHAR(255) NOT NULL,
        metric ENUM('messages','voice_seconds','xp','level','gacha_pulls','gacha_claims','gacha_collection') NOT NULL,
        target_value BIGINT UNSIGNED NOT NULL,
        reward_coins INT UNSIGNED NOT NULL DEFAULT 0,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS achievement_unlocks (
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        achievement_id VARCHAR(64) NOT NULL,
        unlocked_at DATETIME(3) NOT NULL,
        reward_coins INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (guild_id, user_id, achievement_id),
        INDEX idx_achievement_unlock_user (guild_id, user_id, unlocked_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_reward_ledger (
        ledger_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        idempotency_key VARCHAR(191) NOT NULL,
        source_type VARCHAR(48) NOT NULL,
        source_id VARCHAR(191) NULL,
        amount INT UNSIGNED NOT NULL,
        balance_after BIGINT UNSIGNED NOT NULL,
        created_at DATETIME(3) NOT NULL,
        UNIQUE KEY uq_community_reward (guild_id, user_id, idempotency_key),
        INDEX idx_community_reward_user (guild_id, user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_discord_outbox (
        outbox_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        event_type VARCHAR(48) NOT NULL,
        event_key VARCHAR(191) NOT NULL,
        payload JSON NOT NULL,
        status ENUM('pending','processing','sent','dead') NOT NULL DEFAULT 'pending',
        attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        next_attempt_at DATETIME(3) NOT NULL,
        sent_at DATETIME(3) NULL,
        last_error VARCHAR(500) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_community_outbox_event (guild_id, user_id, event_type, event_key),
        INDEX idx_community_outbox_dispatch (status, next_attempt_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_plans (
        plan_id CHAR(36) NOT NULL PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        owner_id VARCHAR(32) NOT NULL,
        title VARCHAR(120) NOT NULL,
        description TEXT NOT NULL,
        location VARCHAR(200) NOT NULL DEFAULT '',
        starts_at DATETIME(3) NOT NULL,
        ends_at DATETIME(3) NULL,
        status ENUM('upcoming','active','completed','cancelled') NOT NULL DEFAULT 'upcoming',
        visibility ENUM('guild','private') NOT NULL DEFAULT 'guild',
        capacity SMALLINT UNSIGNED NOT NULL,
        attendee_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        version INT UNSIGNED NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        INDEX idx_community_plans_list (guild_id, status, starts_at),
        INDEX idx_community_plans_owner (guild_id, owner_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_plan_attendees (
        plan_id CHAR(36) NOT NULL,
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        joined_at DATETIME(3) NOT NULL,
        PRIMARY KEY (plan_id, user_id),
        INDEX idx_plan_attendee_user (guild_id, user_id, joined_at),
        CONSTRAINT fk_plan_attendee_plan FOREIGN KEY (plan_id)
            REFERENCES community_plans(plan_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_plan_invitations (
        plan_id CHAR(36) NOT NULL,
        guild_id VARCHAR(32) NOT NULL,
        invitee_id VARCHAR(32) NOT NULL,
        invited_by VARCHAR(32) NOT NULL,
        status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        responded_at DATETIME(3) NULL,
        PRIMARY KEY (plan_id, invitee_id),
        INDEX idx_plan_invitation_user (guild_id, invitee_id, status, updated_at),
        CONSTRAINT fk_plan_invitation_plan FOREIGN KEY (plan_id)
            REFERENCES community_plans(plan_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_party_sessions (
        party_id CHAR(36) NOT NULL PRIMARY KEY,
        guild_id VARCHAR(32) NOT NULL,
        owner_id VARCHAR(32) NOT NULL,
        title VARCHAR(100) NOT NULL,
        game_type ENUM('trivia','dice') NOT NULL,
        status ENUM('waiting','active','completed','cancelled') NOT NULL DEFAULT 'waiting',
        capacity TINYINT UNSIGNED NOT NULL,
        participant_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
        turn_user_id VARCHAR(32) NULL,
        state_json JSON NOT NULL,
        version INT UNSIGNED NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL,
        completed_at DATETIME(3) NULL,
        INDEX idx_party_sessions_list (guild_id, status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_party_participants (
        party_id CHAR(36) NOT NULL,
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        joined_at DATETIME(3) NOT NULL,
        PRIMARY KEY (party_id, user_id),
        INDEX idx_party_participant_user (guild_id, user_id, joined_at),
        CONSTRAINT fk_party_participant_session FOREIGN KEY (party_id)
            REFERENCES community_party_sessions(party_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_party_actions (
        party_id CHAR(36) NOT NULL,
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        action_id VARCHAR(80) NOT NULL,
        action_type VARCHAR(24) NOT NULL,
        request_json JSON NOT NULL,
        response_json JSON NOT NULL,
        resulting_version INT UNSIGNED NOT NULL,
        created_at DATETIME(3) NOT NULL,
        PRIMARY KEY (party_id, action_id),
        INDEX idx_party_actions_history (party_id, created_at),
        CONSTRAINT fk_party_action_session FOREIGN KEY (party_id)
            REFERENCES community_party_sessions(party_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS community_party_tickets (
        ticket_hash CHAR(64) NOT NULL PRIMARY KEY,
        party_id CHAR(36) NOT NULL,
        guild_id VARCHAR(32) NOT NULL,
        user_id VARCHAR(32) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_party_ticket_expiry (expires_at),
        INDEX idx_party_ticket_participant (party_id, user_id),
        CONSTRAINT fk_party_ticket_session FOREIGN KEY (party_id)
            REFERENCES community_party_sessions(party_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

const ADDITIVE_SCHEMA_STATEMENTS = [
    'ALTER TABLE community_user_daily_stats ADD COLUMN voice_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER voice_minutes',
    'ALTER TABLE community_wrapped_snapshots ADD COLUMN data_from DATE NULL AFTER payload',
    'ALTER TABLE community_wrapped_snapshots ADD COLUMN data_to DATE NULL AFTER data_from',
    'ALTER TABLE community_wrapped_snapshots ADD COLUMN generated_at DATETIME(3) NULL AFTER data_to',
    'ALTER TABLE community_wrapped_snapshots ADD COLUMN finalized BOOLEAN NOT NULL DEFAULT FALSE AFTER generated_at',
    'ALTER TABLE community_wrapped_snapshots ADD COLUMN schema_version SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER finalized'
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
        if (!mysql) mysql = require('mysql2/promise');
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
    for (const statement of ADDITIVE_SCHEMA_STATEMENTS) {
        try {
            await connection.execute(statement);
        } catch (error) {
            if (String(error?.code || '') !== 'ER_DUP_FIELDNAME') throw error;
        }
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

    transaction: async (work) => {
        if (typeof work !== 'function') throw new TypeError('database.transaction requiere una función');
        if (shouldSkipDbCall()) throw new Error('MySQL temporalmente no disponible');
        const connection = await initPool().getConnection();
        try {
            await connection.beginTransaction();
            const tx = {
                query: async (sql, params = []) => {
                    const [rows] = await connection.execute(sql, params);
                    return rows;
                }
            };
            const result = await work(tx);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback().catch(() => null);
            if (isConnectionError(error)) setDbUnavailable(error, 'transaction');
            throw error;
        } finally {
            connection.release();
        }
    },

    isAvailable: () => !shouldSkipDbCall(),

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
