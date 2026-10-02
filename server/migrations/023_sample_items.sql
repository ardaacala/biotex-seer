CREATE TABLE IF NOT EXISTS sample_items (
  id SERIAL PRIMARY KEY,
  sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit_quantity INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL DEFAULT 'Diğer',
  fabric_type TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sample_items_sample_id ON sample_items(sample_id);
