CREATE TABLE IF NOT EXISTS community_shop_products (
    product_id CHAR(36) NOT NULL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    product_type ENUM('character','role','item') NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    image_url VARCHAR(500) NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'general',
    price_coins BIGINT UNSIGNED NOT NULL,
    stock_total INT UNSIGNED NULL,
    sold_count INT UNSIGNED NOT NULL DEFAULT 0,
    per_user_limit INT UNSIGNED NULL,
    character_id VARCHAR(128) NULL,
    role_id VARCHAR(32) NULL,
    item_key VARCHAR(64) NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    created_by VARCHAR(32) NOT NULL,
    updated_by VARCHAR(32) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    INDEX idx_community_shop_list (guild_id, active, category, sort_order, created_at),
    INDEX idx_community_shop_type (guild_id, product_type, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_shop_purchases (
    purchase_id CHAR(36) NOT NULL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    product_id CHAR(36) NOT NULL,
    idempotency_key VARCHAR(64) NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    unit_price BIGINT UNSIGNED NOT NULL,
    total_price BIGINT UNSIGNED NOT NULL,
    status ENUM('pending','completed','refunded','failed') NOT NULL,
    delivery_json JSON NULL,
    failure_reason VARCHAR(255) NULL,
    created_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3) NULL,
    updated_at DATETIME(3) NOT NULL,
    UNIQUE KEY uq_community_shop_idempotency (guild_id, user_id, idempotency_key),
    INDEX idx_community_shop_user (guild_id, user_id, created_at),
    INDEX idx_community_shop_product_user (product_id, user_id, status),
    CONSTRAINT fk_community_shop_purchase_product FOREIGN KEY (product_id)
        REFERENCES community_shop_products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS community_shop_inventory (
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    product_id CHAR(36) NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 0,
    metadata JSON NULL,
    updated_at DATETIME(3) NOT NULL,
    PRIMARY KEY (guild_id, user_id, product_id),
    INDEX idx_community_shop_inventory_user (guild_id, user_id, updated_at),
    CONSTRAINT fk_community_shop_inventory_product FOREIGN KEY (product_id)
        REFERENCES community_shop_products(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
