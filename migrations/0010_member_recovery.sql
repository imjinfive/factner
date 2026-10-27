CREATE TABLE member_recovery (
 member_id TEXT PRIMARY KEY REFERENCES members(id),
 requested_at TEXT,
 token_hash TEXT,
 expires_at INTEGER,
 member_version INTEGER,
 issued_by TEXT,
 issued_at TEXT,
 used_at TEXT
);
