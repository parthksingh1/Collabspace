import { query, transaction } from '../utils/db.js';
import { getRedis } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { publishBoardEvent } from '../kafka/producer.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Board {
  id: string;
  title: string;
  workspace_id: string;
  owner_id: string;
  viewport: { x: number; y: number; zoom: number };
  settings: BoardSettings;
  thumbnail_url: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface BoardSettings {
  background: string;
  gridEnabled: boolean;
  gridSize: number;
  snapToGrid: boolean;
  showMinimap: boolean;
}

export interface CreateBoardData {
  title?: string;
  workspace_id: string;
  settings?: Partial<BoardSettings>;
  viewport?: { x: number; y: number; zoom: number };
}

export interface UpdateBoardData {
  title?: string;
  settings?: Partial<BoardSettings>;
  viewport?: { x: number; y: number; zoom: number };
  thumbnail_url?: string;
}

export interface BoardListParams {
  workspace_id: string;
  page: number;
  limit: number;
  search?: string;
  sort_by?: 'created_at' | 'updated_at' | 'title';
  sort_order?: 'asc' | 'desc';
}

export interface BoardWithElements extends Board {
  elements: BoardElement[];
}

export interface BoardElement {
  id: string;
  board_id: string;
  type: string;
  properties: Record<string, unknown>;
  style: Record<string, unknown>;
  position: { x: number; y: number; width: number; height: number; rotation: number };
  z_index: number;
  group_id: string | null;
  locked: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const BOARD_CACHE_TTL = 600; // 10 minutes

async function getCachedBoard(boardId: string): Promise<Board | null> {
  try {
    const redis = getRedis();
    const cached = await redis.get(`board:${boardId}`);
    if (cached) {
      return JSON.parse(cached) as Board;
    }
  } catch (err) {
    logger.warn('Redis cache read failed', { boardId, message: (err as Error).message });
  }
  return null;
}

async function setCachedBoard(board: Board): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(`board:${board.id}`, JSON.stringify(board), 'EX', BOARD_CACHE_TTL);
  } catch (err) {
    logger.warn('Redis cache write failed', { boardId: board.id, message: (err as Error).message });
  }
}

async function invalidateBoardCache(boardId: string): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(`board:${boardId}`, `board:elements:${boardId}`);
  } catch (err) {
    logger.warn('Redis cache invalidation failed', { boardId, message: (err as Error).message });
  }
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function createBoard(data: CreateBoardData, userId: string): Promise<Board> {
  const defaultSettings: BoardSettings = {
    background: '#ffffff',
    gridEnabled: true,
    gridSize: 20,
    snapToGrid: false,
    showMinimap: true,
  };

  const settings = { ...defaultSettings, ...(data.settings ?? {}) };
  const viewport = data.viewport ?? { x: 0, y: 0, zoom: 1 };

  const result = await query<Board>(
    `INSERT INTO boards (title, workspace_id, owner_id, viewport, settings)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.title ?? 'Untitled Board',
      data.workspace_id,
      userId,
      JSON.stringify(viewport),
      JSON.stringify(settings),
    ],
  );

  const board = result.rows[0];

  await setCachedBoard(board);

  await publishBoardEvent({
    type: 'board.created',
    boardId: board.id,
    userId,
    workspaceId: data.workspace_id,
    data: { title: board.title },
    timestamp: new Date().toISOString(),
  });

  logger.info('Board created', { boardId: board.id, workspaceId: data.workspace_id });

  return board;
}

export async function getBoard(id: string): Promise<BoardWithElements> {
  // Try cache first
  const cached = await getCachedBoard(id);
  let board: Board;

  if (cached) {
    board = cached;
  } else {
    const result = await query<Board>(
      `SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Board not found');
    }

    board = result.rows[0];
    await setCachedBoard(board);
  }

  // Fetch elements
  const elementsResult = await query<BoardElement>(
    `SELECT * FROM board_elements WHERE board_id = $1 ORDER BY z_index ASC`,
    [id],
  );

  return {
    ...board,
    elements: elementsResult.rows,
  };
}

export async function listBoards(params: BoardListParams): Promise<{ boards: Board[]; total: number }> {
  const { workspace_id, page, limit, search, sort_by = 'updated_at', sort_order = 'desc' } = params;
  const offset = (page - 1) * limit;

  const allowedSortColumns = ['created_at', 'updated_at', 'title'];
  const sortColumn = allowedSortColumns.includes(sort_by) ? sort_by : 'updated_at';
  const order = sort_order === 'asc' ? 'ASC' : 'DESC';

  let whereClause = 'workspace_id = $1 AND deleted_at IS NULL';
  const queryParams: unknown[] = [workspace_id];

  if (search) {
    queryParams.push(`%${search}%`);
    whereClause += ` AND title ILIKE $${queryParams.length}`;
  }

  // Count total
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM boards WHERE ${whereClause}`,
    queryParams,
  );

  const total = parseInt(countResult.rows[0].count, 10);

  // Fetch page
  queryParams.push(limit, offset);
  const result = await query<Board>(
    `SELECT * FROM boards WHERE ${whereClause}
     ORDER BY ${sortColumn} ${order}
     LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
    queryParams,
  );

  return { boards: result.rows, total };
}

export async function updateBoard(id: string, updates: UpdateBoardData, userId: string): Promise<Board> {
  const board = await getCachedBoard(id);
  if (!board) {
    const check = await query<Board>(
      `SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (check.rows.length === 0) {
      throw new NotFoundError('Board not found');
    }
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    params.push(updates.title);
  }

  if (updates.settings !== undefined) {
    setClauses.push(`settings = settings || $${paramIndex++}::jsonb`);
    params.push(JSON.stringify(updates.settings));
  }

  if (updates.viewport !== undefined) {
    setClauses.push(`viewport = $${paramIndex++}`);
    params.push(JSON.stringify(updates.viewport));
  }

  if (updates.thumbnail_url !== undefined) {
    setClauses.push(`thumbnail_url = $${paramIndex++}`);
    params.push(updates.thumbnail_url);
  }

  setClauses.push(`version = version + 1`);

  if (setClauses.length === 1) {
    // Only version increment, nothing else to update
    const current = await query<Board>(`SELECT * FROM boards WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return current.rows[0];
  }

  params.push(id);
  const result = await query<Board>(
    `UPDATE boards SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Board not found');
  }

  const updated = result.rows[0];
  await invalidateBoardCache(id);
  await setCachedBoard(updated);

  // Create snapshot if version is at interval
  if (updated.version % config.snapshotInterval === 0) {
    await createSnapshot(id, updated.version, userId);
  }

  await publishBoardEvent({
    type: 'board.updated',
    boardId: id,
    userId,
    workspaceId: updated.workspace_id,
    data: { updates: Object.keys(updates), version: updated.version },
    timestamp: new Date().toISOString(),
  });

  return updated;
}

export async function deleteBoard(id: string, userId: string): Promise<void> {
  const result = await query<Board>(
    `UPDATE boards SET deleted_at = NOW()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Board not found');
  }

  const board = result.rows[0];
  await invalidateBoardCache(id);

  await publishBoardEvent({
    type: 'board.deleted',
    boardId: id,
    userId,
    workspaceId: board.workspace_id,
    data: { title: board.title },
    timestamp: new Date().toISOString(),
  });

  logger.info('Board soft deleted', { boardId: id });
}

export async function getBoardHistory(
  boardId: string,
  page = 1,
  limit = 20,
): Promise<{ snapshots: BoardSnapshot[]; total: number }> {
  // Verify board exists
  const boardCheck = await query(
    `SELECT id FROM boards WHERE id = $1 AND deleted_at IS NULL`,
    [boardId],
  );
  if (boardCheck.rows.length === 0) {
    throw new NotFoundError('Board not found');
  }

  const offset = (page - 1) * limit;

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM board_snapshots WHERE board_id = $1`,
    [boardId],
  );

  const total = parseInt(countResult.rows[0].count, 10);

  const result = await query<BoardSnapshot>(
    `SELECT id, board_id, version, created_by, created_at
     FROM board_snapshots
     WHERE board_id = $1
     ORDER BY version DESC
     LIMIT $2 OFFSET $3`,
    [boardId, limit, offset],
  );

  return { snapshots: result.rows, total };
}

// ---------------------------------------------------------------------------
// Snapshot helper
// ---------------------------------------------------------------------------

export interface BoardSnapshot {
  id: string;
  board_id: string;
  snapshot_data?: Buffer;
  version: number;
  created_by: string | null;
  created_at: string;
}

async function createSnapshot(boardId: string, version: number, userId: string): Promise<void> {
  try {
    // Fetch all current elements
    const elementsResult = await query(
      `SELECT * FROM board_elements WHERE board_id = $1 ORDER BY z_index ASC`,
      [boardId],
    );

    const boardResult = await query(
      `SELECT * FROM boards WHERE id = $1`,
      [boardId],
    );

    const snapshotData = Buffer.from(
      JSON.stringify({
        board: boardResult.rows[0],
        elements: elementsResult.rows,
        snapshotAt: new Date().toISOString(),
      }),
    );

    await query(
      `INSERT INTO board_snapshots (board_id, snapshot_data, version, created_by)
       VALUES ($1, $2, $3, $4)`,
      [boardId, snapshotData, version, userId],
    );

    logger.info('Board snapshot created', { boardId, version });
  } catch (err) {
    logger.error('Failed to create board snapshot', {
      boardId,
      version,
      message: (err as Error).message,
    });
  }
}
