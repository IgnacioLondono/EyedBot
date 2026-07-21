-- Migración aditiva e idempotente para planes comunitarios y EyedParty.
-- Ejecución explícita (selecciona DB_NAME, no se codifica aquí):
-- mysql -u "$DB_USER" -p -h "$DB_HOST" "$DB_NAME" < docker/mysql/community-plans-parties-v3.sql

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
