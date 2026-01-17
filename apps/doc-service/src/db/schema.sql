-- ============================================================================
-- CollabSpace Document Service Schema
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Documents ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title           VARCHAR(500) NOT NULL,
  workspace_id    UUID NOT NULL,
  owner_id        UUID NOT NULL,
  content_snapshot BYTEA,                     -- latest Y.Doc encoded state
  version         INT NOT NULL DEFAULT 1,
  collaborators   UUID[] DEFAULT '{}',
  settings        JSONB DEFAULT '{}',         -- { template, permissions, etc. }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ                 -- soft delete
);

CREATE INDEX IF NOT EXISTS idx_documents_workspace_id ON documents (workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_owner_id ON documents (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_documents_title_trgm ON documents USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents (updated_at DESC);

-- ── Document Updates (CRDT incremental updates) ────────────────────────────

CREATE TABLE IF NOT EXISTS document_updates (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  update_data     BYTEA NOT NULL,             -- encoded Y.js update
  user_id         UUID NOT NULL,
  version         INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_updates_document_id ON document_updates (document_id, version);
CREATE INDEX IF NOT EXISTS idx_document_updates_created_at ON document_updates (document_id, created_at);

-- ── Document Snapshots (periodic compacted state) ──────────────────────────

CREATE TABLE IF NOT EXISTS document_snapshots (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  snapshot_data   BYTEA NOT NULL,             -- full Y.Doc state at this version
  version         INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_snapshots_document_id ON document_snapshots (document_id, version DESC);

-- ── Document Comments ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_comments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  author_id       UUID NOT NULL,
  position        JSONB,                      -- { from: number, to: number, blockId?: string }
  parent_id       UUID REFERENCES document_comments(id) ON DELETE CASCADE,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_by     UUID,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_comments_document_id ON document_comments (document_id, created_at);
CREATE INDEX IF NOT EXISTS idx_document_comments_parent_id ON document_comments (parent_id);
CREATE INDEX IF NOT EXISTS idx_document_comments_author_id ON document_comments (author_id);

-- ── Triggers ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_document_comments_updated_at
  BEFORE UPDATE ON document_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
