CREATE TABLE IF NOT EXISTS stok_items (
  id SERIAL PRIMARY KEY,
  urun_adi TEXT NOT NULL,
  lot TEXT,
  aciklama TEXT,
  foto_url TEXT,
  giris_tarihi DATE NOT NULL DEFAULT CURRENT_DATE,
  son_kullanma_tarihi DATE,
  tur TEXT NOT NULL,
  uretici_firma TEXT,
  birim TEXT NOT NULL DEFAULT 'adet',
  miktar REAL NOT NULL DEFAULT 0,
  kritik_stok REAL NOT NULL DEFAULT 0,
  stok_durumu TEXT NOT NULL DEFAULT 'stok',
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
