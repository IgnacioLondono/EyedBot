-- Migración aditiva. No deriva totales ni inventa actividad histórica.
-- mysql -u "$DB_USER" -p -h "$DB_HOST" "$DB_NAME" < docker/mysql/community-tracking-v2.sql
-- MySQL 8.4 no acepta ADD COLUMN IF NOT EXISTS. El procedimiento consulta
-- INFORMATION_SCHEMA y funciona también en MariaDB.
DROP PROCEDURE IF EXISTS community_add_column_if_missing;
DELIMITER //
CREATE PROCEDURE community_add_column_if_missing(
    IN target_table VARCHAR(64),
    IN target_column VARCHAR(64),
    IN alter_sql TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = target_table
          AND COLUMN_NAME = target_column
    ) THEN
        SET @community_alter_sql = alter_sql;
        PREPARE community_alter_stmt FROM @community_alter_sql;
        EXECUTE community_alter_stmt;
        DEALLOCATE PREPARE community_alter_stmt;
    END IF;
END//
DELIMITER ;

CALL community_add_column_if_missing(
    'community_user_daily_stats',
    'voice_seconds',
    'ALTER TABLE community_user_daily_stats ADD COLUMN voice_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER voice_minutes'
);
CALL community_add_column_if_missing(
    'community_wrapped_snapshots',
    'data_from',
    'ALTER TABLE community_wrapped_snapshots ADD COLUMN data_from DATE NULL AFTER payload'
);
CALL community_add_column_if_missing(
    'community_wrapped_snapshots',
    'data_to',
    'ALTER TABLE community_wrapped_snapshots ADD COLUMN data_to DATE NULL AFTER data_from'
);
CALL community_add_column_if_missing(
    'community_wrapped_snapshots',
    'generated_at',
    'ALTER TABLE community_wrapped_snapshots ADD COLUMN generated_at DATETIME(3) NULL AFTER data_to'
);
CALL community_add_column_if_missing(
    'community_wrapped_snapshots',
    'finalized',
    'ALTER TABLE community_wrapped_snapshots ADD COLUMN finalized BOOLEAN NOT NULL DEFAULT FALSE AFTER generated_at'
);
CALL community_add_column_if_missing(
    'community_wrapped_snapshots',
    'schema_version',
    'ALTER TABLE community_wrapped_snapshots ADD COLUMN schema_version SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER finalized'
);
DROP PROCEDURE community_add_column_if_missing;

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
