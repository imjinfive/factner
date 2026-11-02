CREATE TABLE market_accounts (
 id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE, name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('brand','design','packaging','both')), password_hash TEXT NOT NULL
);
CREATE TABLE market_sessions (
 token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES market_accounts(id), expires_at INTEGER NOT NULL
);
CREATE INDEX market_sessions_expiry ON market_sessions(expires_at);
CREATE TABLE market_posts (
 id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES market_accounts(id),
 category TEXT NOT NULL CHECK (category IN ('design','packaging')), title TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK (quantity>0), unit_price INTEGER NOT NULL CHECK (unit_price>0),
 size TEXT NOT NULL, description TEXT NOT NULL, deadline TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX market_posts_category ON market_posts(category,created_at);
CREATE TABLE market_offers (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES market_posts(id),
 supplier_id TEXT NOT NULL REFERENCES market_accounts(id), alias TEXT NOT NULL,
 tiers TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(post_id,supplier_id), UNIQUE(post_id,alias), UNIQUE(post_id,id)
);
CREATE TABLE market_contracts (
 id TEXT PRIMARY KEY, post_id TEXT NOT NULL UNIQUE REFERENCES market_posts(id), offer_id TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK (quantity>0), unit_price INTEGER NOT NULL CHECK (unit_price>0),
 version TEXT NOT NULL, terms_json TEXT NOT NULL, brand_signature TEXT NOT NULL, brand_signed_at TEXT NOT NULL,
 supplier_signature TEXT, supplier_signed_at TEXT, revealed_at TEXT, revealed_by TEXT,
 FOREIGN KEY(post_id,offer_id) REFERENCES market_offers(post_id,id)
);
CREATE TABLE market_payments (
 id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES market_contracts(id),
 kind TEXT NOT NULL CHECK(kind IN ('sample','production')), amount INTEGER NOT NULL CHECK(amount>0),
 created_at TEXT NOT NULL, UNIQUE(contract_id,kind)
);
