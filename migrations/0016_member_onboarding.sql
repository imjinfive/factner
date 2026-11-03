ALTER TABLE members ADD COLUMN packaging_design INTEGER CHECK (packaging_design IN (0,1));
ALTER TABLE members ADD COLUMN welcomed INTEGER NOT NULL DEFAULT 0 CHECK (welcomed IN (0,1));
UPDATE members SET welcomed=1
WHERE id IN (SELECT member_id FROM member_sessions) OR id IN (SELECT id FROM market_accounts);
