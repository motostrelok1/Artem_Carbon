-- 004: fixed-size pool, immutable numbered records and a refund audit status.
-- Apply before deploying updated webhook and email worker.
CREATE TABLE IF NOT EXISTS lesson_number_pool (
 number integer PRIMARY KEY CHECK(number BETWEEN 1 AND 9500),
 order_id uuid REFERENCES orders(id),
 assigned_at timestamptz,
 voided_at timestamptz
);
INSERT INTO lesson_number_pool(number)
 SELECT generate_series(1,9500)
 ON CONFLICT (number) DO NOTHING;
CREATE INDEX IF NOT EXISTS lesson_number_pool_order_idx ON lesson_number_pool(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lesson_number_pool_free_idx ON lesson_number_pool(number) WHERE order_id IS NULL;

COMMENT ON TABLE lesson_number_pool IS 'One row per serial number 1..9500. Never delete/reassign assigned numbers; database is authoritative.';

-- Internal read-only registry for authorized administration. Do not expose publicly.
CREATE OR REPLACE VIEW active_lesson_number_registry AS
SELECT p.number, p.order_id, o.customer_id, c.email,
 o.buyer_last_name, o.buyer_first_name, o.buyer_patronymic,
 o.buyer_phone, o.buyer_instagram, o.paid_at, p.assigned_at
FROM lesson_number_pool p
JOIN orders o ON o.id=p.order_id
JOIN customers c ON c.id=o.customer_id
WHERE o.status='paid' AND p.voided_at IS NULL;
