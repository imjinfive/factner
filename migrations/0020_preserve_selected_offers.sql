-- Existing live matching requests retain their reviewed price snapshot and eligibility.
UPDATE market_offers SET review_status='approved'
 WHERE id IN (SELECT offer_id FROM market_connection_requests);
