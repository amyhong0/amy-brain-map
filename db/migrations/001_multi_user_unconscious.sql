-- Amy Brain Map multi-user storage schema
-- Run with: npm run db:migrate
-- All user-owned tables include user_id and are always queried with that scope.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS extension_installations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL UNIQUE,
  connect_code_hash TEXT,
  connect_code_expires_at TIMESTAMPTZ,
  access_token_hash TEXT,
  connected_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS extension_installations_user_id_idx ON extension_installations(user_id);
CREATE INDEX IF NOT EXISTS extension_installations_connect_code_hash_idx ON extension_installations(connect_code_hash);
CREATE INDEX IF NOT EXISTS extension_installations_access_token_hash_idx ON extension_installations(access_token_hash);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  analysis_runs_per_day SMALLINT NOT NULL DEFAULT 1 CHECK (analysis_runs_per_day IN (1, 2)),
  auto_apply_threshold DOUBLE PRECISION NOT NULL DEFAULT 0.88 CHECK (auto_apply_threshold >= 0.5 AND auto_apply_threshold <= 1),
  max_visits_per_run INTEGER NOT NULL DEFAULT 500 CHECK (max_visits_per_run BETWEEN 10 AND 2000),
  retention_days INTEGER NOT NULL DEFAULT 365 CHECK (retention_days BETWEEN 7 AND 3650),
  last_analyzed_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS domain_policies (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('allow', 'block')),
  collect_content BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, domain)
);

CREATE TABLE IF NOT EXISTS browser_visits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL REFERENCES extension_installations(id) ON DELETE CASCADE,
  normalized_url TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  domain TEXT NOT NULL,
  last_visit_time BIGINT NOT NULL,
  visit_count INTEGER NOT NULL CHECK (visit_count >= 1),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_status TEXT NOT NULL CHECK (content_status IN ('metadata_only', 'eligible', 'extracted', 'blocked')),
  UNIQUE (installation_id, normalized_url)
);
CREATE INDEX IF NOT EXISTS browser_visits_user_recent_idx ON browser_visits(user_id, last_visit_time DESC);
CREATE INDEX IF NOT EXISTS browser_visits_user_domain_idx ON browser_visits(user_id, domain);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  visit_count INTEGER NOT NULL DEFAULT 0,
  candidate_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT
);
CREATE INDEX IF NOT EXISTS analysis_runs_user_started_idx ON analysis_runs(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS discovery_candidates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('interest', 'revisit', 'bridge')),
  subject TEXT NOT NULL,
  relation TEXT NOT NULL,
  object TEXT NOT NULL,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'auto_applied')),
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_visit_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_run_id TEXT REFERENCES analysis_runs(id) ON DELETE SET NULL,
  promoted_document_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, subject, relation, object)
);
CREATE INDEX IF NOT EXISTS discovery_candidates_user_created_idx ON discovery_candidates(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS discovery_candidates_user_status_idx ON discovery_candidates(user_id, status);

CREATE TABLE IF NOT EXISTS storage_exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('backup', 'export', 'analysis_artifact')),
  encryption_version SMALLINT NOT NULL DEFAULT 1,
  content_type TEXT NOT NULL,
  byte_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS storage_exports_user_created_idx ON storage_exports(user_id, created_at DESC);
