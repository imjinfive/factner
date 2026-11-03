-- Request estimates may be unknown. Supplier quotes remain strictly positive.
PRAGMA defer_foreign_keys=ON;
CREATE TABLE market_posts_consultation (
 id TEXT PRIMARY KEY, brand_id TEXT NOT NULL REFERENCES market_accounts(id),
 category TEXT NOT NULL CHECK (category IN ('design','packaging')), title TEXT NOT NULL,
 quantity INTEGER CHECK (quantity>0), unit_price INTEGER CHECK (unit_price>0),
 size TEXT NOT NULL, description TEXT NOT NULL, deadline TEXT NOT NULL, created_at TEXT NOT NULL,
 review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending','approved','rejected','withdrawn')),
 review_version INTEGER NOT NULL DEFAULT 1, review_reason TEXT NOT NULL DEFAULT '', reviewed_at TEXT
);
INSERT INTO market_posts_consultation SELECT * FROM market_posts;
DROP TABLE market_posts;
ALTER TABLE market_posts_consultation RENAME TO market_posts;
CREATE INDEX market_posts_category ON market_posts(category,created_at);
CREATE INDEX market_posts_review ON market_posts(review_status,created_at);
PRAGMA defer_foreign_keys=OFF;
