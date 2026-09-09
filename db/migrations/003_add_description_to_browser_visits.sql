-- Add description column to store page meta descriptions (og:description, meta description)
ALTER TABLE browser_visits ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
