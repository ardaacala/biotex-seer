-- Make the depo_hareketleri unique index partial (only rr/hm), so fazlalik entries can repeat
DROP INDEX IF EXISTS depo_hareketleri_kaynak_idx;
CREATE UNIQUE INDEX IF NOT EXISTS depo_hareketleri_kaynak_idx
  ON depo_hareketleri (kaynak, kaynak_id)
  WHERE kaynak IN ('rr', 'hm');
