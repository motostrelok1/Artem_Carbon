-- 007: immutable audit trail for reconciliation decisions.
-- This is deployed only after 006, in an isolated test DB before production.
CREATE TABLE IF NOT EXISTS lesson_reservation_release_audit (
 id BIGSERIAL PRIMARY KEY,
 order_id UUID NOT NULL REFERENCES orders(id),
 provider_payment_id TEXT NOT NULL,
 bank_status TEXT NOT NULL CHECK (bank_status IN ('CANCELED','REJECTED')),
 released_quantity INTEGER NOT NULL CHECK (released_quantity BETWEEN 1 AND 100),
 reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (order_id)
);
GRANT SELECT, INSERT ON lesson_reservation_release_audit TO artems_app;
GRANT USAGE, SELECT ON SEQUENCE lesson_reservation_release_audit_id_seq TO artems_app;
