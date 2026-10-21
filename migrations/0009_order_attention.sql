ALTER TABLE orders ADD COLUMN supplier_seen_at TEXT;
ALTER TABLE orders ADD COLUMN response_requested_at TEXT;
-- Existing views were not tracked; do not infer that an old request was read.
UPDATE orders SET response_requested_at=COALESCE(
 (SELECT created_at FROM order_events WHERE order_id=orders.id AND actor_id=orders.brand_id AND action IN ('조건 재확인 요청','업체 연결 및 제작 자료 전달 동의','연결된 제작 업체에 발주 요청') ORDER BY created_at DESC,rowid DESC LIMIT 1),
 shared_at,created_at
) WHERE status='assigned' AND supplier_id IS NOT NULL AND shared_at IS NOT NULL;
CREATE INDEX orders_supplier_attention ON orders(supplier_id,status,response_requested_at);
CREATE INDEX orders_pending_attention ON orders(status,response_requested_at);
