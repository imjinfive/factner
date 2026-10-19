CREATE TABLE operational_incidents (
 id TEXT PRIMARY KEY, code TEXT NOT NULL, context TEXT NOT NULL,
 occurrences INTEGER NOT NULL DEFAULT 1, first_at TEXT NOT NULL, last_at TEXT NOT NULL
);
CREATE INDEX operational_incidents_last ON operational_incidents(last_at DESC);
CREATE TABLE notification_outbox (
 id TEXT PRIMARY KEY, event_key TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('quote','incident','test')),
 quote_id TEXT REFERENCES quotes(id) ON DELETE CASCADE,
 incident_id TEXT REFERENCES operational_incidents(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','failed','sent')),
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
 claim_token TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '', message_id TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, sent_at TEXT
);
CREATE INDEX notification_outbox_due ON notification_outbox(status,next_attempt_at,lease_until);
INSERT INTO settings(key,value) VALUES('operations','{"recipient":"","enabled":false}');
