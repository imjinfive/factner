ALTER TABLE admins ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN mfa_secret TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN mfa_pending_secret TEXT NOT NULL DEFAULT '';
ALTER TABLE admins ADD COLUMN mfa_pending_expires_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admins ADD COLUMN mfa_last_step INTEGER NOT NULL DEFAULT -1;
ALTER TABLE admins ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE sessions ADD COLUMN mfa_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE admin_recovery_codes (
 admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
 code_hash TEXT NOT NULL,
 PRIMARY KEY(admin_id,code_hash)
);
UPDATE admins SET must_change_password=1 WHERE role='owner';
DELETE FROM sessions;
