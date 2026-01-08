import { query, transaction } from '../utils/db.js';
import { getRedis } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { publishBoardEvent } from '../kafka/producer.js';
import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ElementType =
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'text'
  | 'sticky_note'
  | 'image'
  | 'freehand'
  | 'connector'
  | 'group'
  | 'frame';

export interface ElementPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface ElementStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: string;
  borderRadius?: number;
  dashPattern?: number[];
  arrowHead?: 'none' | 'arrow' | 'diamond' | 'circle';
  arrowTail?: 'none' | 'arrow' | 'diamond' | 'circle';
}

export interface ConnectorProperties {
  fromElementId: string;
  toElementId: string;
  fromAnchor: 'top' | 'bottom' | 'left' | 'right' | 'center';
  toAnchor: 'top' | 'bottom' | 'left' | 'right' | 'center';
  pathType: 'straight' | 'curved' | 'elbow';
  waypoints: Array<{ x: number; y: number }>;
  label?: string;
}

export interface ElementData {
  type: ElementType;
  position: ElementPosition;
  style?: Partial<ElementStyle>;
  properties?: Record<string, unknown>;
  z_index?: number;
  group_id?: string;
  locked?: boolean;
}

export interface BoardElement {
  id: string;
  board_id: string;
  type: string;
  properties: Record<string, unknown>;
  style: Record<string, unknown>;
  position: ElementPosition;
  z_index: number;
  group_id: string | null;
  locked: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface UpdateElementData {
  position?: Partial<ElementPosition>;
  style?: Partial<ElementStyle>;
  properties?: Record<string, unknown>;
  z_index?: number;
  group_id?: string | null;
  locked?: boolean;
}

// ---------------------------------------------------------------------------
// Default styles per element type
// ---------------------------------------------------------------------------

const DEFAULT_STYLES: Record<ElementType, ElementStyle> = {
  rectangle: { fill: '#ffffff', stroke: '#000000', strokeWidth: 2, opacity: 1 },
  ellipse: { fill: '#ffffff', stroke: '#000000', strokeWidth: 2, opacity: 1 },
  triangle: { fill: '#ffffff', stroke: '#000000', strokeWidth: 2, opacity: 1 },
  line: { fill: 'transparent', stroke: '#000000', strokeWidth: 2, opacity: 1 },
  arrow: { fill: 'transparent', stroke: '#000000', strokeWidth: 2, opacity: 1, arrowHead: 'arrow' },
  text: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0, opacity: 1, fontSize: 16, fontFamily: 'Inter', textAlign: 'left' },
  sticky_note: { fill: '#fef08a', stroke: '#eab308', strokeWidth: 1, opacity: 1, fontSize: 14, fontFamily: 'Inter' },
  image: { fill: 'transparent', stroke: 'transparent', strokeWidth: 0, opacity: 1 },
  freehand: { fill: 'transparent', stroke: '#000000', strokeWidth: 2, opacity: 1 },
  connector: { fill: 'transparent', stroke: '#6366f1', strokeWidth: 2, opacity: 1, arrowHead: 'arrow' },
  group: { fill: 'transparent', stroke: '#94a3b8', strokeWidth: 1, opacity: 0.5 },
  frame: { fill: 'transparent', stroke: '#64748b', strokeWidth: 2, opacity: 1, fontSize: 14, fontFamily: 'Inter' },
};

// ---------------------------------------------------------------------------
// Connector path calculation
// ---------------------------------------------------------------------------

interface Point {
  x: number;
  y: number;
}

function getAnchorPoint(
  position: ElementPosition,
  anchor: 'top' | 'bottom' | 'left' | 'right' | 'center',
): Point {
  const cx = position.x + position.width / 2;
  const cy = position.y + position.height / 2;

  switch (anchor) {
    case 'top':
      return { x: cx, y: position.y };
    case 'bottom':
      return { x: cx, y: position.y + position.height };
    case 'left':
      return { x: position.x, y: cy };
    case 'right':
      return { x: position.x + position.width, y: cy };
    case 'center':
      return { x: cx, y: cy };
  }
}

function calculateElbowPath(from: Point, to: Point): Point[] {
  const midX = (from.x + to.x) / 2;
  return [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to];
}

function calculateCurvedPath(from: Point, to: Point): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cp1: Point = { x: from.x + dx * 0.5, y: from.y };
  const cp2: Point = { x: to.x - dx * 0.5, y: to.y };
  return [from, cp1, cp2, to];
}

async function calculateConnectorPath(
  connectorProps: ConnectorProperties,
  boardId: string,
): Promise<Point[]> {
  // Fetch connected elements to get their positions
  const fromResult = await query<BoardElement>(
    `SELECT * FROM board_elements WHERE id = $1 AND board_id = $2`,
    [connectorProps.fromElementId, boardId],
  );
  const toResult = await query<BoardElement>(
    `SELECT * FROM board_elements WHERE id = $1 AND board_id = $2`,
    [connectorProps.toElementId, boardId],
  );

  if (fromResult.rows.length === 0 || toResult.rows.length === 0) {
    throw new BadRequestError('Connected elements not found');
  }

  const fromPos = fromResult.rows[0].position;
  const toPos = toResult.rows[0].position;

  const fromPoint = getAnchorPoint(fromPos, connectorProps.fromAnchor);
  const toPoint = getAnchorPoint(toPos, connectorProps.toAnchor);

  switch (connectorProps.pathType) {
    case 'straight':
      return [fromPoint, toPoint];
    case 'curved':
      return calculateCurvedPath(fromPoint, toPoint);
    case 'elbow':
      return calculateElbowPath(fromPoint, toPoint);
    default:
      return [fromPoint, toPoint];
  }
}

// ---------------------------------------------------------------------------
// Element count validation
// ---------------------------------------------------------------------------

async function validateElementCount(boardId: string, addCount = 1): Promise<void> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM board_elements WHERE board_id = $1`,
    [boardId],
  );
  const currentCount = parseInt(result.rows[0].count, 10);

  if (currentCount + addCount > config.maxBoardElements) {
    throw new BadRequestError(
      `Board element limit reached. Maximum ${config.maxBoardElements} elements allowed.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Z-index management
// ---------------------------------------------------------------------------

async function getMaxZIndex(boardId: string): Promise<number> {
  const result = await query<{ max_z: number | null }>(
    `SELECT MAX(z_index) as max_z FROM board_elements WHERE board_id = $1`,
    [boardId],
  );
  return result.rows[0].max_z ?? 0;
}

export async function bringToFront(boardId: string, elementId: string, userId: string): Promise<BoardElement> {
  const maxZ = await getMaxZIndex(boardId);
  return updateElement(boardId, elementId, { z_index: maxZ + 1 }, userId);
}

export async function sendToBack(boardId: string, elementId: string, userId: string): Promise<BoardElement> {
  // Shift all elements up by 1 then set this element to 0
  await transaction(async (client) => {
    await client.query(
      `UPDATE board_elements SET z_index = z_index + 1 WHERE board_id = $1`,
      [boardId],
    );
    await client.query(
      `UPDATE board_elements SET z_index = 0 WHERE id = $1 AND board_id = $2`,
      [elementId, boardId],
    );
  });

  const result = await query<BoardElement>(
    `SELECT * FROM board_elements WHERE id = $1 AND board_id = $2`,
    [elementId, boardId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Element not found');
  }

  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function addElement(
  boardId: string,
  data: ElementData,
  userId: string,
): Promise<BoardElement> {
  await validateElementCount(boardId);

  const defaultStyle = DEFAULT_STYLES[data.type] ?? DEFAULT_STYLES.rectangle;
  const style = { ...defaultStyle, ...(data.style ?? {}) };
  const position: ElementPosition = {
    x: data.position.x,
    y: data.position.y,
    width: data.position.width,
    height: data.position.height,
    rotation: data.position.rotation ?? 0,
  };

  let zIndex = data.z_index;
  if (zIndex === undefined) {
    zIndex = (await getMaxZIndex(boardId)) + 1;
  }

  let properties = data.properties ?? {};

  // For connectors, calculate the path
  if (data.type === 'connector' && properties.fromElementId && properties.toElementId) {
    const connectorProps = properties as unknown as ConnectorProperties;
    const path = await calculateConnectorPath(connectorProps, boardId);
    properties = { ...properties, calculatedPath: path };
  }

  const result = await query<BoardElement>(
    `INSERT INTO board_elements (board_id, type, properties, style, position, z_index, group_id, locked, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      boardId,
      data.type,
      JSON.stringify(properties),
      JSON.stringify(style),
      JSON.stringify(position),
      zIndex,
      data.group_id ?? null,
      data.locked ?? false,
      userId,
    ],
  );

  const element = result.rows[0];

  // Increment board version
  await query(`UPDATE boards SET version = version + 1 WHERE id = $1`, [boardId]);

  // Invalidate cache
  const redis = getRedis();
  await redis.del(`board:${boardId}`, `board:elements:${boardId}`).catch(() => {});

  await publishBoardEvent({
    type: 'board.element.added',
    boardId,
    userId,
    workspaceId: '',
    data: { elementId: element.id, elementType: data.type },
    timestamp: new Date().toISOString(),
  });

  return element;
}

export async function addElements(
  boardId: string,
  elements: ElementData[],
  userId: string,
): Promise<BoardElement[]> {
  await validateElementCount(boardId, elements.length);

  const results: BoardElement[] = [];
  let currentMaxZ = await getMaxZIndex(boardId);

  await transaction(async (client) => {
    for (const data of elements) {
      const defaultStyle = DEFAULT_STYLES[data.type] ?? DEFAULT_STYLES.rectangle;
      const style = { ...defaultStyle, ...(data.style ?? {}) };
      const position: ElementPosition = {
        x: data.position.x,
        y: data.position.y,
        width: data.position.width,
        height: data.position.height,
        rotation: data.position.rotation ?? 0,
      };

      const zIndex = data.z_index ?? ++currentMaxZ;
      const properties = data.properties ?? {};

      const result = await client.query<BoardElement>(
        `INSERT INTO board_elements (board_id, type, properties, style, position, z_index, group_id, locked, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          boardId,
          data.type,
          JSON.stringify(properties),
          JSON.stringify(style),
          JSON.stringify(position),
          zIndex,
          data.group_id ?? null,
          data.locked ?? false,
          userId,
        ],
      );

      results.push(result.rows[0]);
    }

    // Increment board version
    await client.query(`UPDATE boards SET version = version + 1 WHERE id = $1`, [boardId]);
  });

  // Invalidate cache
  const redis = getRedis();
  await redis.del(`board:${boardId}`, `board:elements:${boardId}`).catch(() => {});

  await publishBoardEvent({
    type: 'board.elements.batch_added',
    boardId,
    userId,
    workspaceId: '',
    data: { count: elements.length, elementIds: results.map((e) => e.id) },
    timestamp: new Date().toISOString(),
  });

  return results;
}

export async function updateElement(
  boardId: string,
  elementId: string,
  updates: UpdateElementData,
  userId: string,
): Promise<BoardElement> {
  // Check element exists
  const existing = await query<BoardElement>(
    `SELECT * FROM board_elements WHERE id = $1 AND board_id = $2`,
    [elementId, boardId],
  );

  if (existing.rows.length === 0) {
    throw new NotFoundError('Element not found');
  }

  const element = existing.rows[0];

  if (element.locked && updates.locked !== false) {
    throw new BadRequestError('Element is locked. Unlock it first to make changes.');
  }

  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.position !== undefined) {
    const mergedPosition = { ...element.position, ...updates.position };
    setClauses.push(`position = $${paramIndex++}`);
    params.push(JSON.stringify(mergedPosition));
  }

  if (updates.style !== undefined) {
    setClauses.push(`style = style || $${paramIndex++}::jsonb`);
    params.push(JSON.stringify(updates.style));
  }

  if (updates.properties !== undefined) {
    // For connectors, recalculate path if endpoints changed
    let properties = updates.properties;
    if (element.type === 'connector') {
      const currentProps = element.properties as unknown as ConnectorProperties;
      const mergedProps = { ...currentProps, ...properties } as unknown as ConnectorProperties;
      if (mergedProps.fromElementId && mergedProps.toElementId) {
        try {
          const path = await calculateConnectorPath(mergedProps, boardId);
          properties = { ...properties, calculatedPath: path };
        } catch {
          // If path calculation fails, keep existing path
        }
      }
    }
    setClauses.push(`properties = properties || $${paramIndex++}::jsonb`);
    params.push(JSON.stringify(properties));
  }

  if (updates.z_index !== undefined) {
    setClauses.push(`z_index = $${paramIndex++}`);
    params.push(updates.z_index);
  }

  if (updates.group_id !== undefined) {
    setClauses.push(`group_id = $${paramIndex++}`);
    params.push(updates.group_id);
  }

  if (updates.locked !== undefined) {
    setClauses.push(`locked = $${paramIndex++}`);
    params.push(updates.locked);
  }

  if (setClauses.length === 0) {
    return element;
  }

  params.push(elementId, boardId);
  const result = await query<BoardElement>(
    `UPDATE board_elements SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex++} AND board_id = $${paramIndex}
     RETURNING *`,
    params,
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Element not found');
  }

  // Increment board version
  await query(`UPDATE boards SET version = version + 1 WHERE id = $1`, [boardId]);

  // Invalidate cache
  const redis = getRedis();
  await redis.del(`board:${boardId}`, `board:elements:${boardId}`).catch(() => {});

  await publishBoardEvent({
    type: 'board.element.updated',
    boardId,
    userId,
    workspaceId: '',
    data: { elementId, updates: Object.keys(updates) },
    timestamp: new Date().toISOString(),
  });

  return result.rows[0];
}

export async function deleteElement(
  boardId: string,
  elementId: string,
  userId: string,
): Promise<void> {
  const result = await query(
    `DELETE FROM board_elements WHERE id = $1 AND board_id = $2 RETURNING id`,
    [elementId, boardId],
  );

  if (result.rowCount === 0) {
    throw new NotFoundError('Element not found');
  }

  // Also delete any connectors pointing to/from this element
  await query(
    `DELETE FROM board_elements
     WHERE board_id = $1
       AND type = 'connector'
       AND (properties->>'fromElementId' = $2 OR properties->>'toElementId' = $2)`,
    [boardId, elementId],
  );

  // Remove children if it was a group
  await query(
    `UPDATE board_elements SET group_id = NULL WHERE group_id = $1 AND board_id = $2`,
    [elementId, boardId],
  );

  // Increment board version
  await query(`UPDATE boards SET version = version + 1 WHERE id = $1`, [boardId]);

  // Invalidate cache
  const redis = getRedis();
  await redis.del(`board:${boardId}`, `board:elements:${boardId}`).catch(() => {});

  await publishBoardEvent({
    type: 'board.element.deleted',
    boardId,
    userId,
    workspaceId: '',
    data: { elementId },
    timestamp: new Date().toISOString(),
  });
}

export async function moveElement(
  boardId: string,
  elementId: string,
  x: number,
  y: number,
  userId: string,
): Promise<BoardElement> {
  return updateElement(boardId, elementId, {
    position: { x, y } as Partial<ElementPosition>,
  }, userId);
}

export async function resizeElement(
  boardId: string,
  elementId: string,
  width: number,
  height: number,
  userId: string,
): Promise<BoardElement> {
  if (width <= 0 || height <= 0) {
    throw new BadRequestError('Width and height must be positive');
  }

  return updateElement(boardId, elementId, {
    position: { width, height } as Partial<ElementPosition>,
  }, userId);
}

export async function batchUpdate(
  boardId: string,
  updates: Array<{ elementId: string; data: UpdateElementData }>,
  userId: string,
): Promise<BoardElement[]> {
  const results: BoardElement[] = [];

  await transaction(async (client) => {
    for (const { elementId, data } of updates) {
      const existing = await client.query<BoardElement>(
        `SELECT * FROM board_elements WHERE id = $1 AND board_id = $2`,
        [elementId, boardId],
      );

      if (existing.rows.length === 0) {
        throw new NotFoundError(`Element ${elementId} not found`);
      }

      const element = existing.rows[0];
      if (element.locked && data.locked !== false) {
        continue; // Skip locked elements in batch operations
      }

      const setClauses: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (data.position !== undefined) {
        const mergedPosition = { ...element.position, ...data.position };
        setClauses.push(`position = $${paramIndex++}`);
        params.push(JSON.stringify(mergedPosition));
      }

      if (data.style !== undefined) {
        setClauses.push(`style = style || $${paramIndex++}::jsonb`);
        params.push(JSON.stringify(data.style));
      }

      if (data.properties !== undefined) {
        setClauses.push(`properties = properties || $${paramIndex++}::jsonb`);
        params.push(JSON.stringify(data.properties));
      }

      if (data.z_index !== undefined) {
        setClauses.push(`z_index = $${paramIndex++}`);
        params.push(data.z_index);
      }

      if (data.group_id !== undefined) {
        setClauses.push(`group_id = $${paramIndex++}`);
        params.push(data.group_id);
      }

      if (data.locked !== undefined) {
        setClauses.push(`locked = $${paramIndex++}`);
        params.push(data.locked);
      }

      if (setClauses.length > 0) {
        params.push(elementId, boardId);
        const result = await client.query<BoardElement>(
          `UPDATE board_elements SET ${setClauses.join(', ')}
           WHERE id = $${paramIndex++} AND board_id = $${paramIndex}
           RETURNING *`,
          params,
        );
        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        }
      }
    }

    // Increment board version once for the whole batch
    await client.query(`UPDATE boards SET version = version + 1 WHERE id = $1`, [boardId]);
  });

  // Invalidate cache
  const redis = getRedis();
  await redis.del(`board:${boardId}`, `board:elements:${boardId}`).catch(() => {});

  await publishBoardEvent({
    type: 'board.elements.batch_updated',
    boardId,
    userId,
    workspaceId: '',
    data: { count: results.length, elementIds: results.map((e) => e.id) },
    timestamp: new Date().toISOString(),
  });

  return results;
}

export async function batchDelete(
  boardId: string,
  elementIds: string[],
  userId: string,
): Promise<number> {
  let deletedCount = 0;

  await transaction(async (client) => {
    for (const elementId of elementIds) {
      const result = await client.query(
        `DELETE FROM board_elements WHERE id = $1 AND board_id = $2 RETURNING id`,
        [elementId, boardId],
      );
      if (result.rowCount && result.rowCount > 0) {
        deletedCount += result.rowCount;
      }

      // Clean up connectors
      await client.query(
        `DELETE FROM board_elements
         WHERE board_id = $1
           AND type = 'connector'
           AND (properties->>'fromElementId' = $2 OR properties->>'toElementId' = $2)`,
        [boardId, elementId],
      );

      // Ungroup children
      await client.query(
        `UPDATE board_elements SET group_id = NULL WHERE group_id = $1 AND board_id = $2`,
        [elementId, boardId],
      );
    }

    await client.query(`UPDATE boards SET version = version + 1 WHERE id = $1`, [boardId]);
  });

  const redis = getRedis();
  await redis.del(`board:${boardId}`, `board:elements:${boardId}`).catch(() => {});

  await publishBoardEvent({
    type: 'board.elements.batch_deleted',
    boardId,
    userId,
    workspaceId: '',
    data: { count: deletedCount, elementIds },
    timestamp: new Date().toISOString(),
  });

  return deletedCount;
}
