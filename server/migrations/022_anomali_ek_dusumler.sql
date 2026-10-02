ALTER TABLE stok_anomalileri
  ADD COLUMN IF NOT EXISTS ek_stok_dusumler JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE stok_anomalileri
  ADD COLUMN IF NOT EXISTS auto_dusuldu BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE stok_anomalileri
  ADD COLUMN IF NOT EXISTS bekleyen_miktar NUMERIC(10,3) NOT NULL DEFAULT 0;

ALTER TABLE stok_anomalileri
  ADD COLUMN IF NOT EXISTS bekleyen_urun_adi TEXT;

ALTER TABLE stok_anomalileri
  ADD COLUMN IF NOT EXISTS bekleyen_birim TEXT;

CREATE INDEX IF NOT EXISTS idx_stok_anomalileri_bekleyen ON stok_anomalileri(bekleyen_miktar) WHERE bekleyen_miktar > 0;
