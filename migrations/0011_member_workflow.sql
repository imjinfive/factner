CREATE TABLE member_companies (
 member_id TEXT PRIMARY KEY REFERENCES members(id),
 profile TEXT NOT NULL DEFAULT '{}', listed INTEGER NOT NULL DEFAULT 0,
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE matching_requests (
 id TEXT PRIMARY KEY, requester_id TEXT NOT NULL REFERENCES members(id), target_id TEXT NOT NULL REFERENCES members(id),
 category TEXT NOT NULL CHECK(category IN ('box','packaging','supplies')), capacity INTEGER,
 snapshot TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','completed','rejected')),
 note TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK(requester_id<>target_id)
);
CREATE UNIQUE INDEX matching_requests_pending ON matching_requests(requester_id,target_id,category) WHERE status IN ('pending','reviewing');
CREATE INDEX matching_requests_target ON matching_requests(target_id,status);
CREATE TABLE matching_request_events (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES matching_requests(id),actor TEXT NOT NULL,status TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL
);
ALTER TABLE packagings ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending' CHECK(approval_status IN ('pending','approved'));
CREATE TABLE packaging_reviews (
 id TEXT PRIMARY KEY, packaging_id TEXT NOT NULL REFERENCES packagings(id), brand_id TEXT NOT NULL REFERENCES members(id),
 spec TEXT NOT NULL, base_version INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 note TEXT NOT NULL DEFAULT '', submitted_by TEXT NOT NULL, reviewed_by TEXT,
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX packaging_reviews_pending ON packaging_reviews(packaging_id) WHERE status='pending';
CREATE INDEX packaging_reviews_brand ON packaging_reviews(brand_id,status);
INSERT INTO packaging_reviews(id,packaging_id,brand_id,spec,base_version,submitted_by,created_at,updated_at)
 SELECT lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(6))),id,brand_id,spec,version,brand_id,created_at,updated_at FROM packagings WHERE archived=0;
ALTER TABLE orders ADD COLUMN packaging_id TEXT REFERENCES packagings(id);
ALTER TABLE orders ADD COLUMN packaging_version INTEGER;
