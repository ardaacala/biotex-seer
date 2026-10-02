-- Migration: Create direct_messages table for DM feature
CREATE TABLE IF NOT EXISTS direct_messages (
  id SERIAL PRIMARY KEY,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  is_read BOOLEAN NOT NULL DEFAULT false
);
