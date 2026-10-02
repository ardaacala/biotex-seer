-- Barkod ile lot doğrulama: depo hareketleri için doğrulama kolonları
ALTER TABLE depo_hareketleri
  ADD COLUMN IF NOT EXISTS barkod_dogrulandi BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS barkod_kaynak TEXT;

-- Genel uygulama ayarları için key/value tablosu
CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Varsayılan barkod doğrulama modu (esnek): yanlış/eksik tarama uyarı verir ama engellemez
INSERT INTO app_settings (key, value)
VALUES ('barkod_dogrulama_modu', 'esnek')
ON CONFLICT (key) DO NOTHING;
