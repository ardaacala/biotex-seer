CREATE TABLE IF NOT EXISTS depo_hareketleri (
  id SERIAL PRIMARY KEY,
  stok_item_id INTEGER NOT NULL,
  stok_adi TEXT NOT NULL,
  lot TEXT,
  birim TEXT NOT NULL DEFAULT 'adet',
  rezerve_miktar NUMERIC(10,3) NOT NULL,
  kaynak VARCHAR(10) NOT NULL,
  kaynak_id INTEGER NOT NULL,
  siparis_id INTEGER NOT NULL,
  siparis_title TEXT NOT NULL,
  siparis_lot TEXT,
  tasindi BOOLEAN NOT NULL DEFAULT false,
  tasindi_at TIMESTAMP,
  tasindi_by INTEGER,
  tasindi_foto TEXT,
  tasindi_aciklama TEXT,
  tasindi_miktar NUMERIC(10,3),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS depo_hareketleri_kaynak_idx ON depo_hareketleri (kaynak, kaynak_id);

INSERT INTO depo_hareketleri (
  stok_item_id, stok_adi, lot, birim, rezerve_miktar,
  kaynak, kaynak_id, siparis_id, siparis_title, siparis_lot,
  tasindi, tasindi_at, tasindi_by, tasindi_foto, tasindi_aciklama, tasindi_miktar, created_at
)
SELECT
  rr.stok_item_id,
  s.urun_adi,
  s.lot,
  COALESCE(s.birim, 'adet'),
  rr.rezerved_miktar,
  'rr',
  rr.id,
  pr.id,
  pr.title,
  COALESCE(pr.lot_number, ''),
  rr.tasindi,
  rr.tasindi_at,
  rr.tasindi_by,
  rr.tasindi_foto,
  rr.tasindi_aciklama,
  rr.tasindi_miktar,
  COALESCE(rr.created_at, NOW())
FROM recete_rezervasyon rr
INNER JOIN stok_items s ON s.id = rr.stok_item_id
INNER JOIN recete_items ri ON ri.id = rr.recete_item_id
INNER JOIN production_records pr ON pr.id = ri.record_id
WHERE pr.status NOT IN ('completed', 'cancelled')
ON CONFLICT DO NOTHING;

INSERT INTO depo_hareketleri (
  stok_item_id, stok_adi, lot, birim, rezerve_miktar,
  kaynak, kaynak_id, siparis_id, siparis_title, siparis_lot,
  tasindi, tasindi_at, tasindi_by, tasindi_foto, tasindi_aciklama, tasindi_miktar, created_at
)
SELECT
  oih.stok_item_id,
  s.urun_adi,
  s.lot,
  COALESCE(s.birim, 'adet'),
  (oih.kullanim * pr.total_quantity),
  'hm',
  oih.id,
  pr.id,
  pr.title,
  COALESCE(pr.lot_number, ''),
  oih.tasindi,
  oih.tasindi_at,
  oih.tasindi_by,
  oih.tasindi_foto,
  oih.tasindi_aciklama,
  oih.tasindi_miktar,
  COALESCE(oih.created_at, NOW())
FROM order_item_hammadde oih
INNER JOIN stok_items s ON s.id = oih.stok_item_id
INNER JOIN order_items oi ON oi.id = oih.order_item_id
INNER JOIN production_records pr ON pr.id = oi.record_id
WHERE pr.status NOT IN ('completed', 'cancelled')
ON CONFLICT DO NOTHING;
