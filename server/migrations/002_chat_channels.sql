CREATE TABLE IF NOT EXISTS chat_channels (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  is_default BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  added_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS channel_id INTEGER REFERENCES chat_channels(id) ON DELETE CASCADE;
