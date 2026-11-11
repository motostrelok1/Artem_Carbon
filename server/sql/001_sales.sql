-- ARTEMS CARBON: paid order ledger, no invented sales.
CREATE TABLE IF NOT EXISTS customers (
 id BIGSERIAL PRIMARY KEY,
 email TEXT NOT NULL UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS orders (
 id UUID PRIMARY KEY,
 customer_id BIGINT NOT NULL REFERENCES customers(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refunded')),
 amount_kopecks BIGINT NOT NULL CHECK (amount_kopecks >= 0),
 provider_payment_id TEXT UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 paid_at TIMESTAMPTZ,
 refunded_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS order_items (
 id BIGSERIAL PRIMARY KEY,
 order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 sku TEXT NOT NULL CHECK (sku IN ('video_lesson','carbon_helmet','carbon_spoon','carbon_knife')),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 unit_price_kopecks BIGINT NOT NULL CHECK(unit_price_kopecks >= 0)
);
CREATE INDEX IF NOT EXISTS orders_paid_at_idx ON orders(paid_at) WHERE status = 'paid';
CREATE INDEX IF NOT EXISTS order_items_sku_idx ON order_items(sku);
CREATE TABLE IF NOT EXISTS payment_events (
 id BIGSERIAL PRIMARY KEY,
 provider_payment_id TEXT NOT NULL,
 status TEXT NOT NULL,
 order_id UUID,
 payload JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(provider_payment_id,status)
);
-- The public total must come only from confirmed, non-refunded payments.
-- Product orders must never contribute to the 9500 lesson counter.
CREATE OR REPLACE VIEW public_lesson_sales AS
 SELECT COALESCE(SUM(oi.quantity),0)::BIGINT AS sold_lessons
 FROM orders o JOIN order_items oi ON oi.order_id = o.id
 WHERE o.status = 'paid' AND oi.sku = 'video_lesson';
