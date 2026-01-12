-- ============================================================================
-- CollabSpace Code Service Schema
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Code Files ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS code_files (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  language        VARCHAR(50) NOT NULL,
  workspace_id    UUID NOT NULL,
  owner_id        UUID NOT NULL,
  content_snapshot BYTEA,                     -- latest Y.Doc encoded state
  version         INT NOT NULL DEFAULT 1,
  parent_path     VARCHAR(1000) DEFAULT '/',  -- file tree path
  settings        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_code_files_workspace_id ON code_files (workspace_id);
CREATE INDEX IF NOT EXISTS idx_code_files_owner_id ON code_files (owner_id);
CREATE INDEX IF NOT EXISTS idx_code_files_language ON code_files (language);
CREATE INDEX IF NOT EXISTS idx_code_files_parent_path ON code_files (workspace_id, parent_path);

-- ── Code Executions ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS code_executions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id         UUID REFERENCES code_files(id) ON DELETE SET NULL,
  user_id         UUID NOT NULL,
  language        VARCHAR(50) NOT NULL,
  code            TEXT NOT NULL,
  stdin           TEXT DEFAULT '',
  stdout          TEXT DEFAULT '',
  stderr          TEXT DEFAULT '',
  exit_code       INT,
  execution_time_ms INT,
  memory_used_bytes BIGINT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed, timeout
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_code_executions_file_id ON code_executions (file_id);
CREATE INDEX IF NOT EXISTS idx_code_executions_user_id ON code_executions (user_id);
CREATE INDEX IF NOT EXISTS idx_code_executions_status ON code_executions (status);
CREATE INDEX IF NOT EXISTS idx_code_executions_created_at ON code_executions (created_at DESC);

-- ���─ Coding Rooms (Contest Mode) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coding_rooms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  workspace_id    UUID NOT NULL,
  owner_id        UUID NOT NULL,
  problem         JSONB NOT NULL,             -- { title, description, examples, testCases, constraints }
  time_limit_minutes INT NOT NULL DEFAULT 60,
  status          VARCHAR(20) NOT NULL DEFAULT 'waiting', -- waiting, active, finished
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coding_rooms_workspace_id ON coding_rooms (workspace_id);
CREATE INDEX IF NOT EXISTS idx_coding_rooms_status ON coding_rooms (status);
CREATE INDEX IF NOT EXISTS idx_coding_rooms_owner_id ON coding_rooms (owner_id);

-- ── Room Participants ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS room_participants (
  room_id         UUID NOT NULL REFERENCES coding_rooms(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_participants_user_id ON room_participants (user_id);

-- ── Submissions ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS submissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id         UUID NOT NULL REFERENCES coding_rooms(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  code            TEXT NOT NULL,
  language        VARCHAR(50) NOT NULL,
  test_results    JSONB,                      -- [{ input, expected, actual, passed, executionTimeMs }]
  score           INT DEFAULT 0,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_room_id ON submissions (room_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_user_id ON submissions (user_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions (submitted_at DESC);

-- ── Triggers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_code_files_updated_at
  BEFORE UPDATE ON code_files
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
