-- 006: reserve the scarce 9500 serial numbers BEFORE initiating bank payment.
-- Apply against an isolated database before enabling paid checkout.
-- A reservation is intentionally NOT auto-released on expiry: bank confirmation
-- may arrive late. Release requires separate bank-state reconciliation.
ALTER TABLE lesson_number_pool
 ADD COLUMN IF NOT EXISTS reserved_order_id UUID REFERENCES orders(id),
 ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS lesson_number_pool_reservation_idx
 ON lesson_number_pool(reserved_order_id)
 WHERE reserved_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS lesson_number_pool_available_idx
 ON lesson_number_pool(number)
 WHERE order_id IS NULL AND reserved_order_id IS NULL;

COMMENT ON COLUMN lesson_number_pool.reservation_expires_at IS
 'Reconciliation deadline only. Expiration does not authorize reissue or release without confirmed bank cancellation.';
GRANT SELECT, UPDATE ON TABLE lesson_number_pool TO artems_app;
