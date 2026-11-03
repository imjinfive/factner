ALTER TABLE market_offers ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'
  CHECK(review_status IN ('pending','approved','rejected','withdrawn'));
ALTER TABLE market_offers ADD COLUMN review_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE market_offers ADD COLUMN review_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE market_offers ADD COLUMN reviewed_at TEXT;
CREATE INDEX market_offers_review ON market_offers(review_status,created_at);
CREATE TABLE market_offer_reviews (
  offer_id TEXT NOT NULL REFERENCES market_offers(id),
  version INTEGER NOT NULL, action TEXT NOT NULL CHECK(action IN ('approve','reject','withdraw')),
  actor_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY(offer_id,version)
);
-- Preserve selections already confirmed before offer moderation was introduced.
UPDATE market_offers SET review_status='approved'
 WHERE id IN (SELECT offer_id FROM market_contracts);
