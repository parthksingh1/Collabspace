-- ─────────────────────────────────────────────────────────────────────────────
-- CollabSpace - PostgreSQL Initialization Script
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────── Schemas ─────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS documents;
CREATE SCHEMA IF NOT EXISTS code;
CREATE SCHEMA IF NOT EXISTS boards;
CREATE SCHEMA IF NOT EXISTS projects;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS ai;

-- ─────────────────────────── Auth Schema ─────────────────────────────────────
CREATE TABLE auth.organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    logo_url TEXT,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    max_members INTEGER NOT NULL DEFAULT 10,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth.organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES auth.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, user_id)
);

CREATE TABLE auth.oauth_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, provider_account_id)
);

CREATE TABLE auth.refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    device_info JSONB,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────── Documents Schema ────────────────────────────────
CREATE TABLE documents.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    project_id UUID,
    title VARCHAR(500) NOT NULL,
    content JSONB NOT NULL DEFAULT '{}',
    content_text TEXT NOT NULL DEFAULT '',
    created_by UUID NOT NULL,
    is_template BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE documents.document_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents.documents(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    content JSONB NOT NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(document_id, version)
);

CREATE TABLE documents.document_collaborators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    permission VARCHAR(50) NOT NULL DEFAULT 'edit',
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(document_id, user_id)
);

CREATE TABLE documents.document_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    content TEXT NOT NULL,
    selection_range JSONB,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    parent_id UUID REFERENCES documents.document_comments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────── Code Schema ─────────────────────────────────────
CREATE TABLE code.code_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    project_id UUID,
    title VARCHAR(500) NOT NULL,
    language VARCHAR(50) NOT NULL DEFAULT 'javascript',
    content TEXT NOT NULL DEFAULT '',
    created_by UUID NOT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE code.code_session_participants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES code.code_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    cursor_position JSONB,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, user_id)
);

CREATE TABLE code.code_execution_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES code.code_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    language VARCHAR(50) NOT NULL,
    code TEXT NOT NULL,
    output TEXT,
    error TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────── Boards Schema ───────────────────────────────────
CREATE TABLE boards.boards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    project_id UUID,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    board_data JSONB NOT NULL DEFAULT '{}',
    thumbnail_url TEXT,
    created_by UUID NOT NULL,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE boards.board_elements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    board_id UUID NOT NULL REFERENCES boards.boards(id) ON DELETE CASCADE,
    element_type VARCHAR(50) NOT NULL,
    element_data JSONB NOT NULL,
    z_index INTEGER NOT NULL DEFAULT 0,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────── Projects Schema ─────────────────────────────────
CREATE TABLE projects.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#6366f1',
    icon VARCHAR(50) DEFAULT 'folder',
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, slug)
);

CREATE TABLE projects.project_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, user_id)
);

CREATE TABLE projects.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects.projects(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'todo',
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    assignee_id UUID,
    due_date DATE,
    tags TEXT[] DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    parent_id UUID REFERENCES projects.tasks(id) ON DELETE SET NULL,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────── Notifications Schema ────────────────────────────
CREATE TABLE notifications.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    body TEXT,
    data JSONB NOT NULL DEFAULT '{}',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications.notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    channel VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(user_id, channel, event_type)
);

-- ─────────────────────────── AI Schema ───────────────────────────────────────
CREATE TABLE ai.ai_conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    context_type VARCHAR(50) NOT NULL,
    context_id UUID,
    title VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai.ai_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES ai.ai_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    tokens_used INTEGER,
    model VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai.ai_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    user_id UUID NOT NULL,
    model VARCHAR(100) NOT NULL,
    tokens_input INTEGER NOT NULL DEFAULT 0,
    tokens_output INTEGER NOT NULL DEFAULT 0,
    cost_cents INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────── Indexes ─────────────────────────────────────────
-- Auth indexes
CREATE INDEX idx_users_email ON auth.users(email);
CREATE INDEX idx_users_active ON auth.users(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_org_members_org ON auth.organization_members(organization_id);
CREATE INDEX idx_org_members_user ON auth.organization_members(user_id);
CREATE INDEX idx_refresh_tokens_user ON auth.refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON auth.refresh_tokens(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_oauth_accounts_user ON auth.oauth_accounts(user_id);

-- Documents indexes
CREATE INDEX idx_documents_org ON documents.documents(organization_id);
CREATE INDEX idx_documents_project ON documents.documents(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_documents_created_by ON documents.documents(created_by);
CREATE INDEX idx_documents_search ON documents.documents USING gin(content_text gin_trgm_ops);
CREATE INDEX idx_document_versions_doc ON documents.document_versions(document_id);
CREATE INDEX idx_document_collaborators_user ON documents.document_collaborators(user_id);
CREATE INDEX idx_document_comments_doc ON documents.document_comments(document_id);

-- Code indexes
CREATE INDEX idx_code_sessions_org ON code.code_sessions(organization_id);
CREATE INDEX idx_code_sessions_project ON code.code_sessions(project_id) WHERE project_id IS NOT NULL;

-- Boards indexes
CREATE INDEX idx_boards_org ON boards.boards(organization_id);
CREATE INDEX idx_boards_project ON boards.boards(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_board_elements_board ON boards.board_elements(board_id);

-- Projects indexes
CREATE INDEX idx_projects_org ON projects.projects(organization_id);
CREATE INDEX idx_project_members_project ON projects.project_members(project_id);
CREATE INDEX idx_project_members_user ON projects.project_members(user_id);
CREATE INDEX idx_tasks_project ON projects.tasks(project_id);
CREATE INDEX idx_tasks_assignee ON projects.tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_tasks_status ON projects.tasks(project_id, status);
CREATE INDEX idx_tasks_due_date ON projects.tasks(due_date) WHERE due_date IS NOT NULL;

-- Notifications indexes
CREATE INDEX idx_notifications_user ON notifications.notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications.notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created ON notifications.notifications(created_at DESC);
CREATE INDEX idx_notification_prefs_user ON notifications.notification_preferences(user_id);

-- AI indexes
CREATE INDEX idx_ai_conversations_user ON ai.ai_conversations(user_id);
CREATE INDEX idx_ai_conversations_org ON ai.ai_conversations(organization_id);
CREATE INDEX idx_ai_messages_conversation ON ai.ai_messages(conversation_id);
CREATE INDEX idx_ai_usage_org ON ai.ai_usage(organization_id, created_at);
CREATE INDEX idx_ai_usage_user ON ai.ai_usage(user_id, created_at);

-- ─────────────────────────── Seed Data ───────────────────────────────────────

-- Default organization
INSERT INTO auth.organizations (id, name, slug, plan, max_members, settings)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'CollabSpace',
    'collabspace',
    'enterprise',
    1000,
    '{"features": ["ai", "code_execution", "unlimited_projects"]}'
);

-- Admin user (password: Admin@123456 hashed with pgcrypto)
INSERT INTO auth.users (id, email, password_hash, first_name, last_name, is_active, is_email_verified)
VALUES (
    'b0000000-0000-0000-0000-000000000001',
    'admin@collabspace.io',
    crypt('Admin@123456', gen_salt('bf', 12)),
    'System',
    'Admin',
    TRUE,
    TRUE
);

-- Add admin to default organization
INSERT INTO auth.organization_members (organization_id, user_id, role)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'owner'
);

-- Default project
INSERT INTO projects.projects (id, organization_id, name, slug, description, created_by)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Getting Started',
    'getting-started',
    'Welcome to CollabSpace! This is your first project.',
    'b0000000-0000-0000-0000-000000000001'
);

-- Add admin to default project
INSERT INTO projects.project_members (project_id, user_id, role)
VALUES (
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'owner'
);

-- Welcome document
INSERT INTO documents.documents (organization_id, project_id, title, content, content_text, created_by)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'Welcome to CollabSpace',
    '{"type": "doc", "content": [{"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Welcome to CollabSpace"}]}, {"type": "paragraph", "content": [{"type": "text", "text": "Start collaborating with your team in real-time."}]}]}',
    'Welcome to CollabSpace. Start collaborating with your team in real-time.',
    'b0000000-0000-0000-0000-000000000001'
);

-- Default notification preferences for admin
INSERT INTO notifications.notification_preferences (user_id, channel, event_type, enabled)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'email', 'mention', TRUE),
    ('b0000000-0000-0000-0000-000000000001', 'email', 'task_assigned', TRUE),
    ('b0000000-0000-0000-0000-000000000001', 'push', 'mention', TRUE),
    ('b0000000-0000-0000-0000-000000000001', 'push', 'task_assigned', TRUE),
    ('b0000000-0000-0000-0000-000000000001', 'push', 'document_shared', TRUE),
    ('b0000000-0000-0000-0000-000000000001', 'in_app', 'mention', TRUE),
    ('b0000000-0000-0000-0000-000000000001', 'in_app', 'task_assigned', TRUE),
    ('b0000000-0000-0000-0000-000000000001', 'in_app', 'document_shared', TRUE),
    ('b0000000-0000-0000-0000-000000000001', 'in_app', 'project_invite', TRUE);

-- ─────────────────────────── Functions ───────────────────────────────────────

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON auth.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents.documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_code_sessions_updated_at BEFORE UPDATE ON code.code_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_boards_updated_at BEFORE UPDATE ON boards.boards FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_board_elements_updated_at BEFORE UPDATE ON boards.board_elements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON projects.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_conversations_updated_at BEFORE UPDATE ON ai.ai_conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_document_comments_updated_at BEFORE UPDATE ON documents.document_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA auth TO collabspace;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA documents TO collabspace;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA code TO collabspace;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA boards TO collabspace;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA projects TO collabspace;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA notifications TO collabspace;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ai TO collabspace;
GRANT USAGE ON ALL SCHEMAS TO collabspace;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA auth TO collabspace;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA documents TO collabspace;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA code TO collabspace;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA boards TO collabspace;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA projects TO collabspace;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA notifications TO collabspace;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ai TO collabspace;
