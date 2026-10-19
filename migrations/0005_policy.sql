CREATE TABLE policy_versions (
 id TEXT PRIMARY KEY,
 content TEXT NOT NULL,
 published INTEGER NOT NULL DEFAULT 0,
 actor TEXT NOT NULL,
 created_at TEXT NOT NULL
);
ALTER TABLE quotes ADD COLUMN terms_version TEXT NOT NULL DEFAULT '';
ALTER TABLE quotes ADD COLUMN intake_mode TEXT NOT NULL DEFAULT 'test';
