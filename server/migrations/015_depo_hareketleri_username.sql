-- Add tasindi_by_username column for denormalized username storage (no JOIN needed)
ALTER TABLE depo_hareketleri ADD COLUMN IF NOT EXISTS tasindi_by_username TEXT;

-- Backfill from existing tasindi_by → users.display_name
UPDATE depo_hareketleri dh
SET tasindi_by_username = COALESCE(u.display_name, u.username)
FROM users u
WHERE dh.tasindi_by = u.id
  AND dh.tasindi_by_username IS NULL;
