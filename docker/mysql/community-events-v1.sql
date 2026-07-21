-- Ejecutar seleccionando la base configurada:
-- mysql -u "$DB_USER" -p -h "$DB_HOST" "$DB_NAME" < docker/mysql/community-events-v1.sql

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
