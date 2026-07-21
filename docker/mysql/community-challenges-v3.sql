-- Migración aditiva v3: retos, logros, recompensas y outbox comunitario.
-- mysql -u "$DB_USER" -p -h "$DB_HOST" "$DB_NAME" < docker/mysql/community-challenges-v3.sql
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
