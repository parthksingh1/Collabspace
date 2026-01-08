import { query } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { config } from '../config.js';
import { ElementData, ElementType } from './element.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiagramGenerationResult {
  elements: ElementData[];
  description: string;
  diagramType: string;
}

export interface CodeGenerationResult {
  language: string;
  code: string;
  description: string;
}

export interface LayoutSuggestion {
  elementId: string;
  suggestedPosition: { x: number; y: number };
  reason: string;
}

export interface HandwritingRecognitionResult {
  elementId: string;
  recognizedType: 'shape' | 'text';
  suggestedElement: ElementData;
  confidence: number;
}

// ---------------------------------------------------------------------------
// AI Service client helper
// ---------------------------------------------------------------------------

async function callAiService<T>(endpoint: string, payload: Record<string, unknown>): Promise<T> {
  const url = `${config.aiServiceUrl}${endpoint}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('AI service request failed', { endpoint, status: response.status, body: errorBody });
      throw new BadRequestError(`AI service returned error: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    logger.error('AI service call failed', { endpoint, message: (err as Error).message });
    throw new BadRequestError('AI service is unavailable. Please try again later.');
  }
}

// ---------------------------------------------------------------------------
// Diagram layout helpers
// ---------------------------------------------------------------------------

interface LayoutNode {
  id: string;
  label: string;
  type: ElementType;
}

interface LayoutEdge {
  from: string;
  to: string;
  label?: string;
}

function layoutGrid(nodes: LayoutNode[], startX = 100, startY = 100, colWidth = 250, rowHeight = 150, maxCols = 4): ElementData[] {
  const elements: ElementData[] = [];
  let col = 0;
  let row = 0;

  for (const node of nodes) {
    const x = startX + col * colWidth;
    const y = startY + row * rowHeight;

    elements.push({
      type: node.type,
      position: { x, y, width: 180, height: 80, rotation: 0 },
      style: { fill: '#f1f5f9', stroke: '#475569', strokeWidth: 2, opacity: 1 },
      properties: { text: node.label, nodeId: node.id },
    });

    col++;
    if (col >= maxCols) {
      col = 0;
      row++;
    }
  }

  return elements;
}

function layoutTree(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  startX = 400,
  startY = 60,
  levelSpacing = 150,
  siblingSpacing = 220,
): ElementData[] {
  const elements: ElementData[] = [];
  const nodeMap = new Map<string, LayoutNode>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  // Find root nodes (no incoming edges)
  const hasParent = new Set(edges.map((e) => e.to));
  const roots = nodes.filter((n) => !hasParent.has(n.id));

  // BFS to assign levels
  const levels = new Map<string, number>();
  const children = new Map<string, string[]>();

  edges.forEach((e) => {
    const existing = children.get(e.from) ?? [];
    existing.push(e.to);
    children.set(e.from, existing);
  });

  const queue = roots.map((r) => ({ id: r.id, level: 0 }));
  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    if (levels.has(id)) continue;
    levels.set(id, level);
    const kids = children.get(id) ?? [];
    for (const kid of kids) {
      queue.push({ id: kid, level: level + 1 });
    }
  }

  // Assign positions per level
  const levelNodes = new Map<number, string[]>();
  for (const [id, level] of levels) {
    const existing = levelNodes.get(level) ?? [];
    existing.push(id);
    levelNodes.set(level, existing);
  }

  const positions = new Map<string, { x: number; y: number }>();

  for (const [level, ids] of levelNodes) {
    const totalWidth = (ids.length - 1) * siblingSpacing;
    let x = startX - totalWidth / 2;
    const y = startY + level * levelSpacing;

    for (const id of ids) {
      positions.set(id, { x, y });
      const node = nodeMap.get(id);
      if (node) {
        elements.push({
          type: node.type,
          position: { x, y, width: 180, height: 80, rotation: 0 },
          style: { fill: '#eff6ff', stroke: '#3b82f6', strokeWidth: 2, opacity: 1 },
          properties: { text: node.label, nodeId: node.id },
        });
      }
      x += siblingSpacing;
    }
  }

  // Add connectors
  for (const edge of edges) {
    const fromPos = positions.get(edge.from);
    const toPos = positions.get(edge.to);
    if (fromPos && toPos) {
      elements.push({
        type: 'connector',
        position: { x: fromPos.x + 90, y: fromPos.y + 80, width: 0, height: 0, rotation: 0 },
        style: { fill: 'transparent', stroke: '#6366f1', strokeWidth: 2, opacity: 1 },
        properties: {
          fromElementId: edge.from,
          toElementId: edge.to,
          pathType: 'straight',
          label: edge.label ?? '',
          calculatedPath: [
            { x: fromPos.x + 90, y: fromPos.y + 80 },
            { x: toPos.x + 90, y: toPos.y },
          ],
        },
      });
    }
  }

  return elements;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function promptToDiagram(prompt: string): Promise<DiagramGenerationResult> {
  if (!prompt || prompt.trim().length < 3) {
    throw new BadRequestError('Prompt must be at least 3 characters long');
  }

  try {
    // Call AI service to generate diagram structure
    const aiResult = await callAiService<{
      nodes: Array<{ id: string; label: string; type?: string }>;
      edges: Array<{ from: string; to: string; label?: string }>;
      diagramType: string;
      description: string;
    }>('/ai/board/generate-diagram', { prompt });

    const nodes: LayoutNode[] = aiResult.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: (n.type as ElementType) ?? 'rectangle',
    }));

    const edges: LayoutEdge[] = aiResult.edges;

    // Choose layout strategy based on diagram type
    let elements: ElementData[];
    switch (aiResult.diagramType) {
      case 'flowchart':
      case 'tree':
      case 'org_chart':
        elements = layoutTree(nodes, edges);
        break;
      case 'grid':
      case 'matrix':
        elements = layoutGrid(nodes);
        break;
      default:
        elements = edges.length > 0
          ? layoutTree(nodes, edges)
          : layoutGrid(nodes);
    }

    return {
      elements,
      description: aiResult.description,
      diagramType: aiResult.diagramType,
    };
  } catch (err) {
    if (err instanceof BadRequestError) throw err;

    // Fallback: generate a simple diagram from the prompt locally
    logger.warn('AI service unavailable, generating fallback diagram', { message: (err as Error).message });

    const words = prompt.split(/[,.\n;]+/).map((w) => w.trim()).filter(Boolean).slice(0, 10);
    const nodes: LayoutNode[] = words.map((w, i) => ({
      id: `node-${i}`,
      label: w.substring(0, 40),
      type: 'rectangle' as ElementType,
    }));

    const edges: LayoutEdge[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ from: nodes[i].id, to: nodes[i + 1].id });
    }

    const elements = nodes.length > 3 && edges.length > 0
      ? layoutTree(nodes, edges)
      : layoutGrid(nodes);

    return {
      elements,
      description: `Generated diagram with ${nodes.length} nodes from prompt`,
      diagramType: 'flowchart',
    };
  }
}

export async function diagramToCode(boardId: string): Promise<CodeGenerationResult> {
  // Verify board exists
  const boardResult = await query<{ id: string; title: string }>(
    `SELECT id, title FROM boards WHERE id = $1 AND deleted_at IS NULL`,
    [boardId],
  );
  if (boardResult.rows.length === 0) {
    throw new NotFoundError('Board not found');
  }

  // Fetch all elements
  const elementsResult = await query<{
    type: string;
    properties: Record<string, unknown>;
    position: { x: number; y: number; width: number; height: number };
    style: Record<string, unknown>;
  }>(
    `SELECT type, properties, position, style FROM board_elements WHERE board_id = $1 ORDER BY z_index ASC`,
    [boardId],
  );

  const elements = elementsResult.rows;

  try {
    const aiResult = await callAiService<CodeGenerationResult>('/ai/board/diagram-to-code', {
      boardId,
      boardTitle: boardResult.rows[0].title,
      elements: elements.map((e) => ({
        type: e.type,
        text: e.properties.text ?? e.properties.label ?? '',
        connections: e.properties.fromElementId
          ? { from: e.properties.fromElementId, to: e.properties.toElementId }
          : undefined,
      })),
    });

    return aiResult;
  } catch (err) {
    if (err instanceof NotFoundError) throw err;

    // Fallback: generate basic structure
    logger.warn('AI service unavailable, generating fallback code', { message: (err as Error).message });

    const nodeLabels = elements
      .filter((e) => e.type !== 'connector' && e.type !== 'line' && e.type !== 'arrow')
      .map((e) => (e.properties.text as string) ?? 'Component')
      .filter(Boolean);

    const interfaces = nodeLabels.map((label) => {
      const name = label.replace(/[^a-zA-Z0-9]/g, '');
      return `interface ${name || 'Component'} {\n  // TODO: Define properties\n  id: string;\n  name: string;\n}`;
    });

    return {
      language: 'typescript',
      code: `// Auto-generated from board: ${boardResult.rows[0].title}\n\n${interfaces.join('\n\n')}`,
      description: `Generated TypeScript interfaces from ${nodeLabels.length} diagram nodes`,
    };
  }
}

export async function suggestLayout(boardId: string): Promise<LayoutSuggestion[]> {
  // Verify board exists
  const boardResult = await query(
    `SELECT id FROM boards WHERE id = $1 AND deleted_at IS NULL`,
    [boardId],
  );
  if (boardResult.rows.length === 0) {
    throw new NotFoundError('Board not found');
  }

  // Fetch elements
  const elementsResult = await query<{
    id: string;
    type: string;
    position: { x: number; y: number; width: number; height: number };
    properties: Record<string, unknown>;
  }>(
    `SELECT id, type, position, properties FROM board_elements WHERE board_id = $1 ORDER BY z_index ASC`,
    [boardId],
  );

  const elements = elementsResult.rows;
  if (elements.length === 0) {
    return [];
  }

  try {
    const aiResult = await callAiService<{ suggestions: LayoutSuggestion[] }>(
      '/ai/board/suggest-layout',
      {
        boardId,
        elements: elements.map((e) => ({
          id: e.id,
          type: e.type,
          position: e.position,
          connections: e.properties.fromElementId
            ? { from: e.properties.fromElementId, to: e.properties.toElementId }
            : undefined,
        })),
      },
    );

    return aiResult.suggestions;
  } catch {
    // Fallback: auto-arrange in a grid
    logger.warn('AI service unavailable, using grid layout fallback');

    const nonConnectors = elements.filter((e) => e.type !== 'connector');
    const spacing = 250;
    const maxCols = Math.ceil(Math.sqrt(nonConnectors.length));
    const suggestions: LayoutSuggestion[] = [];

    nonConnectors.forEach((el, i) => {
      const col = i % maxCols;
      const row = Math.floor(i / maxCols);
      const suggestedX = 100 + col * spacing;
      const suggestedY = 100 + row * spacing;

      if (Math.abs(el.position.x - suggestedX) > 20 || Math.abs(el.position.y - suggestedY) > 20) {
        suggestions.push({
          elementId: el.id,
          suggestedPosition: { x: suggestedX, y: suggestedY },
          reason: `Auto-arranged to grid position (row ${row + 1}, col ${col + 1})`,
        });
      }
    });

    return suggestions;
  }
}

export async function recognizeHandwriting(
  boardId: string,
  elementIds?: string[],
): Promise<HandwritingRecognitionResult[]> {
  // Verify board exists
  const boardResult = await query(
    `SELECT id FROM boards WHERE id = $1 AND deleted_at IS NULL`,
    [boardId],
  );
  if (boardResult.rows.length === 0) {
    throw new NotFoundError('Board not found');
  }

  // Fetch freehand elements
  let elementsQuery = `SELECT * FROM board_elements WHERE board_id = $1 AND type = 'freehand'`;
  const params: unknown[] = [boardId];

  if (elementIds && elementIds.length > 0) {
    elementsQuery += ` AND id = ANY($2)`;
    params.push(elementIds);
  }

  const elementsResult = await query<{
    id: string;
    type: string;
    properties: Record<string, unknown>;
    position: { x: number; y: number; width: number; height: number; rotation: number };
    style: Record<string, unknown>;
  }>(elementsQuery, params);

  const freehandElements = elementsResult.rows;
  if (freehandElements.length === 0) {
    return [];
  }

  try {
    const aiResult = await callAiService<{ results: HandwritingRecognitionResult[] }>(
      '/ai/board/recognize-handwriting',
      {
        elements: freehandElements.map((e) => ({
          id: e.id,
          points: e.properties.points,
          position: e.position,
        })),
      },
    );

    return aiResult.results;
  } catch {
    // Fallback: basic shape recognition using point analysis
    logger.warn('AI service unavailable, using basic shape recognition');

    const results: HandwritingRecognitionResult[] = [];

    for (const el of freehandElements) {
      const points = (el.properties.points as Array<{ x: number; y: number }>) ?? [];
      if (points.length < 4) continue;

      // Simple heuristic: check if path forms a closed shape
      const firstPoint = points[0];
      const lastPoint = points[points.length - 1];
      const distance = Math.sqrt(
        Math.pow(firstPoint.x - lastPoint.x, 2) + Math.pow(firstPoint.y - lastPoint.y, 2),
      );
      const pathLength = points.reduce((acc, p, i) => {
        if (i === 0) return 0;
        const prev = points[i - 1];
        return acc + Math.sqrt(Math.pow(p.x - prev.x, 2) + Math.pow(p.y - prev.y, 2));
      }, 0);

      const isClosed = distance < pathLength * 0.15;

      if (isClosed) {
        // Approximate as rectangle or ellipse based on aspect ratio
        const minX = Math.min(...points.map((p) => p.x));
        const maxX = Math.max(...points.map((p) => p.x));
        const minY = Math.min(...points.map((p) => p.y));
        const maxY = Math.max(...points.map((p) => p.y));
        const width = maxX - minX;
        const height = maxY - minY;

        // Check "roundness" by measuring variance from center
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const avgRadius = points.reduce((acc, p) => {
          return acc + Math.sqrt(Math.pow(p.x - cx, 2) + Math.pow(p.y - cy, 2));
        }, 0) / points.length;
        const radiusVariance = points.reduce((acc, p) => {
          const r = Math.sqrt(Math.pow(p.x - cx, 2) + Math.pow(p.y - cy, 2));
          return acc + Math.pow(r - avgRadius, 2);
        }, 0) / points.length;

        const isCircular = radiusVariance / (avgRadius * avgRadius) < 0.1;

        results.push({
          elementId: el.id,
          recognizedType: 'shape',
          suggestedElement: {
            type: isCircular ? 'ellipse' : 'rectangle',
            position: { x: minX, y: minY, width, height, rotation: 0 },
            style: {
              fill: '#ffffff',
              stroke: '#000000',
              strokeWidth: 2,
              opacity: 1,
            },
          },
          confidence: isCircular ? 0.7 : 0.6,
        });
      } else {
        // Open path - might be a line or text
        results.push({
          elementId: el.id,
          recognizedType: 'text',
          suggestedElement: {
            type: 'text',
            position: {
              x: el.position.x,
              y: el.position.y,
              width: el.position.width,
              height: el.position.height,
              rotation: 0,
            },
            properties: { text: '(handwritten text)' },
          },
          confidence: 0.3,
        });
      }
    }

    return results;
  }
}
