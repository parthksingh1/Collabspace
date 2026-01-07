-- ============================================================================
-- Board Service Database Schema
-- ============================================================================

-- Boards table
CREATE TABLE IF NOT EXISTS boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL DEFAULT 'Untitled Board',
    workspace_id UUID NOT NULL,
    owner_id UUID NOT NULL,
    viewport JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "zoom": 1}',
    settings JSONB NOT NULL DEFAULT '{
        "background": "#ffffff",
        "gridEnabled": true,
        "gridSize": 20,
        "snapToGrid": false,
        "showMinimap": true
    }',
    thumbnail_url TEXT,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Board elements table
CREATE TABLE IF NOT EXISTS board_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    properties JSONB NOT NULL DEFAULT '{}',
    style JSONB NOT NULL DEFAULT '{
        "fill": "transparent",
        "stroke": "#000000",
        "strokeWidth": 2,
        "opacity": 1,
        "fontSize": 16,
        "fontFamily": "Inter",
        "textAlign": "left"
    }',
    position JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "width": 100, "height": 100, "rotation": 0}',
    z_index INT NOT NULL DEFAULT 0,
    group_id UUID,
    locked BOOLEAN NOT NULL DEFAULT false,
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Board snapshots table (version history)
CREATE TABLE IF NOT EXISTS board_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    snapshot_data BYTEA NOT NULL,
    version INT NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Boards indexes
CREATE INDEX IF NOT EXISTS idx_boards_workspace_id ON boards(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_boards_owner_id ON boards(owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_boards_created_at ON boards(created_at DESC) WHERE deleted_at IS NULL;

-- Board elements indexes
CREATE INDEX IF NOT EXISTS idx_board_elements_board_id ON board_elements(board_id);
CREATE INDEX IF NOT EXISTS idx_board_elements_type ON board_elements(type);
CREATE INDEX IF NOT EXISTS idx_board_elements_group_id ON board_elements(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_board_elements_z_index ON board_elements(board_id, z_index);

-- Board snapshots indexes
CREATE INDEX IF NOT EXISTS idx_board_snapshots_board_id ON board_snapshots(board_id);
CREATE INDEX IF NOT EXISTS idx_board_snapshots_version ON board_snapshots(board_id, version DESC);

-- ============================================================================
-- Check constraints
-- ============================================================================

ALTER TABLE board_elements
    ADD CONSTRAINT chk_element_type CHECK (
        type IN ('rectangle', 'ellipse', 'triangle', 'line', 'arrow', 'text',
                 'sticky_note', 'image', 'freehand', 'connector', 'group', 'frame')
    );

-- ============================================================================
-- Trigger: auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER boards_updated_at
    BEFORE UPDATE ON boards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER board_elements_updated_at
    BEFORE UPDATE ON board_elements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
