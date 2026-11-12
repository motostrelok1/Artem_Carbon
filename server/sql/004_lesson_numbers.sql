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
