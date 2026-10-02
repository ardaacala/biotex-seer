-- Additive: add small thumbnail columns alongside existing *_photo_url fields.
-- Original photo columns are untouched; this migration is safe to re-run.

ALTER TABLE production_records
  ADD COLUMN IF NOT EXISTS photo_thumb_url text,
  ADD COLUMN IF NOT EXISTS pastal_photo_thumb_url text,
  ADD COLUMN IF NOT EXISTS urun_islem_photo_thumb_url text,
  ADD COLUMN IF NOT EXISTS katlama_photo_thumb_url text,
  ADD COLUMN IF NOT EXISTS set_toplama_photo_thumb_url text,
  ADD COLUMN IF NOT EXISTS kolileme_photo_thumb_url text,
  ADD COLUMN IF NOT EXISTS sevkiyat_photo_thumb_url text,
  ADD COLUMN IF NOT EXISTS sevkiyat_zeos_photo_thumb_url text,
  ADD COLUMN IF NOT EXISTS sterilizasyon_photo_thumb_url text;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS pastal_photo_thumb_url text,
  ADD COLUMN IF NOT EXISTS urun_islem_photo_thumb_url text,
  ADD COLUMN IF NOT EXISTS katlama_photo_thumb_url text;

ALTER TABLE sample_items
  ADD COLUMN IF NOT EXISTS photo_thumb_url text;
