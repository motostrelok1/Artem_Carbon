-- Extend orders with buyer contact snapshot for video lessons.
-- Existing orders stay valid; new lesson purchases are validated by API.
ALTER TABLE orders
 ADD COLUMN IF NOT EXISTS buyer_last_name TEXT,
 ADD COLUMN IF NOT EXISTS buyer_first_name TEXT,
 ADD COLUMN IF NOT EXISTS buyer_patronymic TEXT,
 ADD COLUMN IF NOT EXISTS buyer_phone TEXT,
 ADD COLUMN IF NOT EXISTS buyer_instagram TEXT;

COMMENT ON COLUMN orders.buyer_last_name IS 'Фамилия покупателя видеоурока';
COMMENT ON COLUMN orders.buyer_first_name IS 'Имя покупателя видеоурока';
COMMENT ON COLUMN orders.buyer_patronymic IS 'Отчество покупателя видеоурока';
COMMENT ON COLUMN orders.buyer_phone IS 'Нормализованный российский телефон +7XXXXXXXXXX';
COMMENT ON COLUMN orders.buyer_instagram IS 'Необязательный ник Instagram, без @';
