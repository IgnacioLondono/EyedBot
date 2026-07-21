-- Inicialización de la base de datos para TulaBot
-- Este script se ejecuta automáticamente al crear el contenedor MySQL

USE tulabot;

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id, wrapped_year),
    INDEX idx_community_wrapped_year (guild_id, wrapped_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Crear usuario si no existe (ya debería estar creado por variables de entorno)
-- Pero por si acaso, aquí está el comando SQL equivalente:
-- CREATE USER IF NOT EXISTS 'tulabot'@'%' IDENTIFIED BY 'tulabot_password';
-- GRANT ALL PRIVILEGES ON tulabot.* TO 'tulabot'@'%';
-- FLUSH PRIVILEGES;

