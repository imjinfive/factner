-- Password-only login replaces authenticator enrollment. Revoke old sessions.
DELETE FROM sessions;
DELETE FROM admin_recovery_codes;
UPDATE admins SET mfa_secret='',mfa_pending_secret='',mfa_pending_expires_at=0,mfa_last_step=-1,auth_version=auth_version+1;
UPDATE admins SET must_change_password=0 WHERE role='owner';
