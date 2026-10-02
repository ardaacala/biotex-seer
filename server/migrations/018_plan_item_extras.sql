ALTER TABLE shipment_plan_items
  ADD COLUMN IF NOT EXISTS address_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS irsaliye_photo text;
