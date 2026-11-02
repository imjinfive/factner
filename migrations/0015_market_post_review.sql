ALTER TABLE market_posts ADD COLUMN review_status TEXT NOT NULL DEFAULT 'pending'
  CHECK(review_status IN ('pending','approved','rejected','withdrawn'));
ALTER TABLE market_posts ADD COLUMN review_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE market_posts ADD COLUMN review_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE market_posts ADD COLUMN reviewed_at TEXT;
CREATE INDEX market_posts_review ON market_posts(review_status,created_at);
CREATE TABLE market_post_reviews (
  post_id TEXT NOT NULL REFERENCES market_posts(id),
  version INTEGER NOT NULL, action TEXT NOT NULL CHECK(action IN ('approve','reject','withdraw')),
  actor TEXT NOT NULL CHECK(actor IN ('admin','author')), actor_id TEXT NOT NULL,
  reason TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(post_id,version)
);
