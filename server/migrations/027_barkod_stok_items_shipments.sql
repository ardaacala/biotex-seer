-- stok_items ve shipments tablolarına barkod doğrulama kolonları (nullable)
ALTER TABLE stok_items ADD COLUMN IF NOT EXISTS barkod_dogrulandi BOOLEAN DEFAULT false;
ALTER TABLE stok_items ADD COLUMN IF NOT EXISTS barkod_kaynak TEXT;

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS barkod_dogrulandi BOOLEAN DEFAULT false;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS barkod_kaynak TEXT;
