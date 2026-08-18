-- Keep the most recently observed row for each user's normalized URL before enforcing idempotency.
WITH ranked_visits AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, normalized_url
      ORDER BY last_visit_time DESC, updated_at DESC, id ASC
    ) AS position
  FROM browser_visits
)
DELETE FROM browser_visits
WHERE id IN (
  SELECT id
  FROM ranked_visits
  WHERE position > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS browser_visits_user_normalized_url_uidx
  ON browser_visits (user_id, normalized_url);
