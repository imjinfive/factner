CREATE TABLE members (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('brand','supplier')),
 legal_type TEXT NOT NULL CHECK(legal_type IN ('individual','sole','corporate')),
 name TEXT NOT NULL, contact TEXT NOT NULL, phone TEXT NOT NULL, business_number TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended')),
 review_note TEXT NOT NULL DEFAULT '', consent_version TEXT NOT NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX members_status ON members(status,created_at DESC);
CREATE TABLE member_sessions(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),expires_at INTEGER NOT NULL,member_version INTEGER NOT NULL);
CREATE INDEX member_sessions_expiry ON member_sessions(expires_at);
CREATE TABLE member_reviews(id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),actor TEXT NOT NULL,status TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE member_files(id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),kind TEXT NOT NULL CHECK(kind IN ('certificate','workplace','design','sample')),name TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX member_files_owner ON member_files(member_id);
CREATE TABLE packagings(id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES members(id),spec TEXT NOT NULL,favorite INTEGER NOT NULL DEFAULT 0,archived INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX packagings_brand ON packagings(brand_id,archived);
CREATE TABLE orders (
 id TEXT PRIMARY KEY,brand_id TEXT NOT NULL REFERENCES members(id),supplier_id TEXT REFERENCES members(id),
 source_id TEXT REFERENCES orders(id),spec TEXT NOT NULL,quantity INTEGER NOT NULL,requested_date TEXT NOT NULL,address TEXT NOT NULL,note TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','matched','assigned','quoted','approved','producing','shipped','received','cancelled')),
 proposal TEXT,approved_snapshot TEXT,shipping TEXT,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE INDEX orders_brand ON orders(brand_id,created_at DESC);
CREATE INDEX orders_supplier ON orders(supplier_id,created_at DESC);
CREATE TABLE order_files(order_id TEXT NOT NULL REFERENCES orders(id),file_id TEXT NOT NULL REFERENCES member_files(id),PRIMARY KEY(order_id,file_id));
CREATE TABLE order_events(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),actor_id TEXT NOT NULL,actor_name TEXT NOT NULL,action TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);
