-- Reçete (BOM) tabloları — idempotent
CREATE TABLE IF NOT EXISTS recete_items (
  id SERIAL PRIMARY KEY,
  record_id INTEGER NOT NULL,
  stok_tur TEXT NOT NULL,
  stok_alt_tur TEXT NOT NULL,
  miktar NUMERIC(10,3) NOT NULL,
  birim TEXT NOT NULL DEFAULT 'adet',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recete_rezervasyon (
  id SERIAL PRIMARY KEY,
  recete_item_id INTEGER NOT NULL,
  stok_item_id INTEGER NOT NULL,
  rezerved_miktar NUMERIC(10,3) NOT NULL,
  dusen_miktar NUMERIC(10,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  tasindi BOOLEAN NOT NULL DEFAULT FALSE,
  tasindi_at TIMESTAMP,
  tasindi_by INTEGER REFERENCES users(id),
  tasindi_foto TEXT,
  tasindi_aciklama TEXT,
  tasindi_miktar NUMERIC(10,3)
);
