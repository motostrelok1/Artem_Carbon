-- Apply after 001_sales.sql and before starting the email worker.
CREATE TABLE IF NOT EXISTS email_outbox (
 id BIGSERIAL PRIMARY KEY,
 order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK (kind IN ('order_confirmation')),
 state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sending','sent','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 locked_at TIMESTAMPTZ,
 sent_at TIMESTAMPTZ,
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(order_id,kind)
);
CREATE INDEX IF NOT EXISTS email_outbox_ready_idx ON email_outbox(next_attempt_at) WHERE state IN ('queued','failed');
