CREATE TABLE IF NOT EXISTS products (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL, game TEXT NOT NULL,
 title TEXT NOT NULL, price REAL NOT NULL CHECK(price>0),
 url TEXT NOT NULL, category TEXT NOT NULL, server TEXT,
 status TEXT NOT NULL DEFAULT 'unverified', source TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_game_price ON products(game,price);
CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updated_at);
