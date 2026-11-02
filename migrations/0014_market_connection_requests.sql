-- Shared member matching only. Review rooms continue to use their own isolated schema.
CREATE TABLE market_connection_requests (
  post_id TEXT PRIMARY KEY REFERENCES market_posts(id),
  offer_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  unit_price INTEGER NOT NULL CHECK(unit_price > 0),
  request_id TEXT NOT NULL REFERENCES matching_requests(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL,
  FOREIGN KEY(post_id, offer_id) REFERENCES market_offers(post_id,id)
);
CREATE INDEX market_connection_request_link ON market_connection_requests(request_id);
