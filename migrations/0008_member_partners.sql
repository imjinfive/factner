CREATE TABLE member_partners (
 id TEXT PRIMARY KEY,
 brand_id TEXT NOT NULL REFERENCES members(id),
 supplier_id TEXT NOT NULL REFERENCES members(id),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','ended')),
 version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(brand_id,supplier_id), CHECK(brand_id<>supplier_id)
);
CREATE INDEX member_partners_supplier ON member_partners(supplier_id,status);
CREATE TABLE member_partner_events (
 id TEXT PRIMARY KEY,partner_id TEXT NOT NULL REFERENCES member_partners(id),
 actor TEXT NOT NULL,action TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL
);
CREATE INDEX member_partner_events_partner ON member_partner_events(partner_id,created_at);
CREATE TABLE member_profile_events (
 id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),
 actor TEXT NOT NULL,changes TEXT NOT NULL,created_at TEXT NOT NULL
);
CREATE INDEX member_profile_events_member ON member_profile_events(member_id,created_at);
ALTER TABLE orders ADD COLUMN shared_at TEXT;
UPDATE orders SET shared_at=COALESCE(
 (SELECT created_at FROM order_events WHERE order_id=orders.id AND action='업체 연결 및 제작 자료 전달 동의' ORDER BY created_at LIMIT 1),
 created_at
) WHERE supplier_id IS NOT NULL AND (
 status NOT IN ('requested','matched','cancelled') OR
 EXISTS(SELECT 1 FROM order_events WHERE order_id=orders.id AND action='업체 연결 및 제작 자료 전달 동의')
);
