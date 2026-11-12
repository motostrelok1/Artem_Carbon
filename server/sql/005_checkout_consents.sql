-- Track explicit checkout acknowledgements per order.
-- Execute before deploying updated API.
ALTER TABLE orders
 ADD COLUMN IF NOT EXISTS personal_data_consent_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS marketing_email_consent_at TIMESTAMPTZ,
 ADD COLUMN IF NOT EXISTS consent_policy_version TEXT;
COMMENT ON COLUMN orders.personal_data_consent_at IS 'Timestamp when purchaser actively acknowledged personal-data terms';
COMMENT ON COLUMN orders.marketing_email_consent_at IS 'Timestamp when purchaser actively opted in to event and email updates';
COMMENT ON COLUMN orders.consent_policy_version IS 'Version identifier of document presented during checkout';
