CREATE TABLE member_support (
 member_id TEXT PRIMARY KEY REFERENCES members(id),
 details TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE member_requests (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id),
 kind TEXT NOT NULL CHECK(kind IN ('profile','company','matching','inquiry')),
 message TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewing','completed','rejected')),
 note TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX member_requests_queue ON member_requests(status,created_at);
CREATE INDEX member_requests_member ON member_requests(member_id,created_at);
CREATE TABLE member_request_events (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES member_requests(id),
 actor TEXT NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL
);
