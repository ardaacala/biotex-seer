ALTER TABLE production_records ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'musteri';
ALTER TABLE production_records ADD COLUMN IF NOT EXISTS stok_transferred_at timestamp;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS stok_tur_hedef text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS stok_alt_tur_hedef text;
