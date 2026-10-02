-- Stok kategori (ana tur) tablosu
CREATE TABLE IF NOT EXISTS stok_kategoriler (
  id SERIAL PRIMARY KEY,
  ad TEXT NOT NULL UNIQUE,
  sira INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Stok alt tur tablosu
CREATE TABLE IF NOT EXISTS stok_alt_turler (
  id SERIAL PRIMARY KEY,
  kategori_id INTEGER NOT NULL REFERENCES stok_kategoriler(id) ON DELETE CASCADE,
  ad TEXT NOT NULL,
  sira INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(kategori_id, ad)
);

-- Mevcut 27 kategoriyi tabloya ekle
INSERT INTO stok_kategoriler (ad, sira) VALUES
  ('BANDAJ', 1),
  ('BANT - CITY BANT', 2),
  ('BANT - İSTANBUL BANT', 3),
  ('BANT - MİRAY BANT', 4),
  ('ELDİVEN', 5),
  ('ENJEKTÖR', 6),
  ('ETİKET', 7),
  ('HATALI ÜRÜNLER', 8),
  ('HAVLU', 9),
  ('İNSİZYON', 10),
  ('İPLİK-SÜTUR', 11),
  ('KARMA', 12),
  ('KOLİ', 13),
  ('KUMAŞ-2026', 14),
  ('LABARATUVAR NUMUNELERİ', 15),
  ('MASKE', 16),
  ('OPTAPE', 17),
  ('ÖNLÜK', 18),
  ('PE', 19),
  ('POŞ', 20),
  ('SOLÜSYON KABI', 21),
  ('SPANÇ', 22),
  ('STERİL ELDİVEN', 23),
  ('STERİLİZASYON RULOSU', 24),
  ('WROSSİ KREM', 25),
  ('YANKUER', 26),
  ('YARA ÖRTÜLERİ', 27)
ON CONFLICT (ad) DO NOTHING;

-- stok_items tablosuna alt_tur kolonu ekle
ALTER TABLE stok_items ADD COLUMN IF NOT EXISTS alt_tur TEXT;
