-- Customer library: reusable customer records for use across orders, gelen siparişler and samples.
-- Fully additive: new table only, no ALTER on existing tables, no ID type changes.
CREATE TABLE IF NOT EXISTS customer_library (
  id           serial PRIMARY KEY,
  name         text   NOT NULL UNIQUE,
  phone        text,
  email        text,
  address      text,
  notes        text,
  created_at   timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_library_name_lower ON customer_library (lower(name));
