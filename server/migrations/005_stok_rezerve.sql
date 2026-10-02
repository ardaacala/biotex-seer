-- Stok kaleminin rezerve edilmiş miktarı (miktar = serbest + rezerve)
ALTER TABLE stok_items ADD COLUMN IF NOT EXISTS rezerve_miktar INTEGER NOT NULL DEFAULT 0;
