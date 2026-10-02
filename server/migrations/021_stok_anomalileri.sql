CREATE TABLE IF NOT EXISTS stok_anomalileri (
  id SERIAL PRIMARY KEY,
  depo_hareket_id INTEGER NOT NULL REFERENCES depo_hareketleri(id) ON DELETE CASCADE,
  tur VARCHAR(10) NOT NULL,
  beklenen_miktar NUMERIC(10,3) NOT NULL,
  gercek_miktar NUMERIC(10,3) NOT NULL,
  fark NUMERIC(10,3) NOT NULL,
  birim TEXT NOT NULL,
  aciklama TEXT NOT NULL,
  fotograf TEXT,
  reported_by INTEGER NOT NULL REFERENCES users(id),
  reported_by_username TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by INTEGER REFERENCES users(id),
  resolved_by_username TEXT,
  resolved_at TIMESTAMP,
  resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_stok_anomalileri_depo_hareket ON stok_anomalileri(depo_hareket_id);
CREATE INDEX IF NOT EXISTS idx_stok_anomalileri_resolved ON stok_anomalileri(resolved);
