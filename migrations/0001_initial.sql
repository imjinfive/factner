PRAGMA foreign_keys = ON;
CREATE TABLE admins (
 id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','staff')),
 active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, admin_id TEXT NOT NULL REFERENCES admins(id), expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE quotes (
 id TEXT PRIMARY KEY, receipt_hash TEXT NOT NULL, brand TEXT NOT NULL, category TEXT NOT NULL,
 quantity INTEGER NOT NULL, size TEXT NOT NULL DEFAULT '', deadline TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL, supplier TEXT NOT NULL DEFAULT '', contact_name TEXT NOT NULL,
 email TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', reference_url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'received', assignee TEXT NOT NULL DEFAULT '',
 internal_note TEXT NOT NULL DEFAULT '', customer_message TEXT NOT NULL DEFAULT '',
 consent_version TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX quotes_created ON quotes(created_at DESC);
CREATE INDEX quotes_status ON quotes(status);
CREATE TABLE quote_events (
 id TEXT PRIMARY KEY, quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
 actor TEXT NOT NULL, action TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO settings VALUES ('service', '{"accepting":false,"operator":"","contactEmail":""}');
