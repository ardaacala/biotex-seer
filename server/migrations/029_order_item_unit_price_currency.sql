ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price_currency text NOT NULL DEFAULT 'TRY';
