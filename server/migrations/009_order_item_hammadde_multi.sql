CREATE TABLE IF NOT EXISTS order_item_hammadde (
  id SERIAL PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  stok_item_id INTEGER NOT NULL,
  kullanim NUMERIC(10,3) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
