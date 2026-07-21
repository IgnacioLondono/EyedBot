-- Inicialización de la base configurada mediante MYSQL_DATABASE.
-- El entrypoint de MySQL selecciona esa base antes de ejecutar este archivo.

-- Tabla para almacenar datos clave-valor (reemplazo de database.json)
CREATE TABLE IF NOT EXISTS key_value_store (
    id INT AUTO_INCREMENT PRIMARY KEY,
    `key` VARCHAR(255) NOT NULL UNIQUE,
    `value` TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para advertencias de usuarios
CREATE TABLE IF NOT EXISTS warnings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    moderator_id VARCHAR(255) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_guild_user (guild_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para configuración de servidores
CREATE TABLE IF NOT EXISTS guild_config (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL UNIQUE,
    prefix VARCHAR(10) DEFAULT '!',
    welcome_channel_id VARCHAR(255),
    autoresponder_enabled BOOLEAN DEFAULT FALSE,
    autoresponder_responses JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_guild (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para recordatorios
CREATE TABLE IF NOT EXISTS reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    guild_id VARCHAR(255),
    message TEXT NOT NULL,
    remind_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_remind (user_id, remind_at),
    INDEX idx_remind_at (remind_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabla para historial de conversaciones de IA
CREATE TABLE IF NOT EXISTS ai_conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    role ENUM('user', 'assistant') NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_channel (user_id, channel_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Métricas personales diarias para el portal comunitario y Wrapped
CREATE TABLE IF NOT EXISTS community_user_daily_stats (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_wrapped_snapshots (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Inicio real del tracking por servidor (no implica backfill histórico)
CREATE TABLE IF NOT EXISTS community_tracking_metadata (
    guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
    tracking_started_at DATETIME(3) NOT NULL,
    timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_user_totals (
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    messages BIGINT UNSIGNED NOT NULL DEFAULT 0,
    voice_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0,
    xp_earned BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id),
    INDEX idx_community_totals_guild (guild_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_voice_sessions (
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    started_at DATETIME(3) NOT NULL,
    checkpoint_at DATETIME(3) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id),
    INDEX idx_community_voice_checkpoint (checkpoint_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_request_nonces (
    nonce VARCHAR(128) NOT NULL PRIMARY KEY,
    user_id VARCHAR(32) NOT NULL,
    request_timestamp BIGINT NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_community_nonce_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stream persistente para replay SSE y fanout en tiempo real
CREATE TABLE IF NOT EXISTS community_events (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Retos semanales, logros y recompensas comunitarias idempotentes
CREATE TABLE IF NOT EXISTS challenge_definitions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS challenge_periods (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS challenge_progress (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS challenge_claims (
    period_id BIGINT UNSIGNED NOT NULL,
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    challenge_id VARCHAR(64) NOT NULL,
    reward_coins INT UNSIGNED NOT NULL,
    claimed_at DATETIME(3) NOT NULL,
    PRIMARY KEY (period_id, user_id),
    UNIQUE KEY uq_challenge_claim (guild_id, user_id, challenge_id, period_id),
    INDEX idx_challenge_claim_user (guild_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS achievement_definitions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS achievement_unlocks (
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    achievement_id VARCHAR(64) NOT NULL,
    unlocked_at DATETIME(3) NOT NULL,
    reward_coins INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id, achievement_id),
    INDEX idx_achievement_unlock_user (guild_id, user_id, unlocked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_reward_ledger (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_discord_outbox (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Planes comunitarios relacionales
CREATE TABLE IF NOT EXISTS community_plans (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_plan_attendees (
    plan_id CHAR(36) NOT NULL,
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    joined_at DATETIME(3) NOT NULL,
    PRIMARY KEY (plan_id, user_id),
    INDEX idx_plan_attendee_user (guild_id, user_id, joined_at),
    CONSTRAINT fk_plan_attendee_plan FOREIGN KEY (plan_id)
        REFERENCES community_plans(plan_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_plan_invitations (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- EyedParty: sesiones, participantes, acciones idempotentes y tickets efímeros
CREATE TABLE IF NOT EXISTS community_party_sessions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_party_participants (
    party_id CHAR(36) NOT NULL,
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    joined_at DATETIME(3) NOT NULL,
    PRIMARY KEY (party_id, user_id),
    INDEX idx_party_participant_user (guild_id, user_id, joined_at),
    CONSTRAINT fk_party_participant_session FOREIGN KEY (party_id)
        REFERENCES community_party_sessions(party_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_party_actions (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_party_tickets (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Crear usuario si no existe (ya debería estar creado por variables de entorno)
-- Pero por si acaso, aquí está el comando SQL equivalente:
-- CREATE USER IF NOT EXISTS 'tulabot'@'%' IDENTIFIED BY 'tulabot_password';
-- GRANT ALL PRIVILEGES ON tulabot.* TO 'tulabot'@'%';
-- FLUSH PRIVILEGES;

