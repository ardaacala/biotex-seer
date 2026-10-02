CREATE TABLE IF NOT EXISTS order_title_library (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL UNIQUE,
  reference_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
