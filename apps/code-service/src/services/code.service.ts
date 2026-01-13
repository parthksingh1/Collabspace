import * as Y from 'yjs';
import { query, getClient } from '../utils/db.js';
import { getRedis } from '../utils/redis.js';
import { logger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CreateCodeFileInput {
  name: string;
  language: string;
  workspaceId: string;
  parentPath?: string;
  initialContent?: string;
}

export interface CodeFileRow {
  id: string;
  name: string;
  language: string;
  workspace_id: string;
  owner_id: string;
  content_snapshot: Buffer | null;
  version: number;
  parent_path: string;
  settings: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CodeFileMeta {
  id: string;
  name: string;
  language: string;
  workspaceId: string;
  ownerId: string;
  version: number;
  parentPath: string;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  language?: string;
  fileId?: string;
  children?: FileTreeNode[];
}

// ── Language detection ────────────────────────────────────────────────────────

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.c': 'c',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.cs': 'csharp',
  '.html': 'html',
  '.css': 'css',
  '.json': 'json',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'bash',
  '.yml': 'yaml',
  '.yaml': 'yaml',
};

export function detectLanguage(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.'));
  return EXTENSION_TO_LANGUAGE[ext.toLowerCase()] ?? 'plaintext';
}

// ── Templates ─────────────────────────────────────────────────────────────────

const LANGUAGE_TEMPLATES: Record<string, string> = {
  javascript: '// JavaScript\nconsole.log("Hello, World!");\n',
  typescript: '// TypeScript\nconst greeting: string = "Hello, World!";\nconsole.log(greeting);\n',
  python: '# Python\nprint("Hello, World!")\n',
  java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}\n',
  cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}\n',
  rust: 'fn main() {\n    println!("Hello, World!");\n}\n',
};

// ── Code Service ──────────────────────────────────────────────────────────────

export class CodeService {
  // ── Create ────────────────────────────────────────────────────────────────

  async createFile(data: CreateCodeFileInput, userId: string): Promise<CodeFileMeta> {
    const language = data.language || detectLanguage(data.name);
    const parentPath = data.parentPath ?? '/';

    // Create Y.Doc with initial content
    const doc = new Y.Doc();
    const text = doc.getText('content');

    const initialContent = data.initialContent ?? LANGUAGE_TEMPLATES[language] ?? '';
    if (initialContent) {
      text.insert(0, initialContent);
    }

    const snapshot = Buffer.from(Y.encodeStateAsUpdate(doc));

    const result = await query<CodeFileRow>(
      `INSERT INTO code_files (name, language, workspace_id, owner_id, content_snapshot, parent_path)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.name, language, data.workspaceId, userId, snapshot, parentPath],
    );

    const row = result.rows[0]!;
    const meta = this.rowToMeta(row);

    // Cache
    const redis = getRedis();
    await redis.setex(`code:${row.id}:meta`, 3600, JSON.stringify(meta));

    logger.info('Code file created', { fileId: row.id, userId, language, name: data.name });
    return meta;
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async getFile(id: string): Promise<{ meta: CodeFileMeta; content: Uint8Array | null } | null> {
    const redis = getRedis();
    const cached = await redis.get(`code:${id}:meta`);

    const result = await query<CodeFileRow>(
      `SELECT * FROM code_files WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    const meta = this.rowToMeta(row);

    await redis.setex(`code:${id}:meta`, 3600, JSON.stringify(meta));

    return {
      meta,
      content: row.content_snapshot ? new Uint8Array(row.content_snapshot) : null,
    };
  }

  // ── List ──────────────────────────────────────────────────────────────────

  async listFiles(
    workspaceId: string,
    options: { page?: number; pageSize?: number; language?: string; parentPath?: string } = {},
  ): Promise<PaginatedResult<CodeFileMeta>> {
    const { page = 1, pageSize = 50, language, parentPath } = options;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['workspace_id = $1'];
    const params: unknown[] = [workspaceId];
    let paramIdx = 2;

    if (language) {
      conditions.push(`language = $${paramIdx++}`);
      params.push(language);
    }
    if (parentPath) {
      conditions.push(`parent_path = $${paramIdx++}`);
      params.push(parentPath);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM code_files WHERE ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0]!.count, 10);

    const listParams = [...params, pageSize, offset];
    const result = await query<CodeFileRow>(
      `SELECT * FROM code_files WHERE ${whereClause} ORDER BY parent_path, name LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      listParams,
    );

    return {
      items: result.rows.map((r) => this.rowToMeta(r)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async updateFile(
    id: string,
    updates: { name?: string; language?: string; parentPath?: string },
    userId: string,
  ): Promise<CodeFileMeta | null> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIdx++}`);
      params.push(updates.name);
    }
    if (updates.language !== undefined) {
      setClauses.push(`language = $${paramIdx++}`);
      params.push(updates.language);
    }
    if (updates.parentPath !== undefined) {
      setClauses.push(`parent_path = $${paramIdx++}`);
      params.push(updates.parentPath);
    }

    if (setClauses.length === 0) return null;

    params.push(id);
    const result = await query<CodeFileRow>(
      `UPDATE code_files SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params,
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0]!;
    const meta = this.rowToMeta(row);

    const redis = getRedis();
    await redis.setex(`code:${id}:meta`, 3600, JSON.stringify(meta));

    logger.info('Code file updated', { fileId: id, userId, fields: Object.keys(updates) });
    return meta;
  }

  // ── Apply CRDT update ─────────────────────────────────────────────────────

  async applyUpdate(fileId: string, update: Uint8Array, userId: string): Promise<number> {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const versionResult = await client.query<{ version: number }>(
        `UPDATE code_files SET version = version + 1 WHERE id = $1 RETURNING version`,
        [fileId],
      );

      if (versionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        throw new Error(`Code file not found: ${fileId}`);
      }

      const newVersion = versionResult.rows[0]!.version;

      // Load current state, apply update, store new snapshot
      const fileResult = await client.query<{ content_snapshot: Buffer }>(
        `SELECT content_snapshot FROM code_files WHERE id = $1`,
        [fileId],
      );

      const doc = new Y.Doc();
      if (fileResult.rows[0]?.content_snapshot) {
        Y.applyUpdate(doc, new Uint8Array(fileResult.rows[0].content_snapshot));
      }
      Y.applyUpdate(doc, update);

      const newSnapshot = Buffer.from(Y.encodeStateAsUpdate(doc));

      await client.query(
        `UPDATE code_files SET content_snapshot = $1 WHERE id = $2`,
        [newSnapshot, fileId],
      );

      await client.query('COMMIT');

      // Invalidate cache
      const redis = getRedis();
      await redis.del(`code:${fileId}:meta`);

      return newVersion;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async deleteFile(id: string, userId: string): Promise<boolean> {
    const result = await query(`DELETE FROM code_files WHERE id = $1`, [id]);
    const deleted = (result.rowCount ?? 0) > 0;

    if (deleted) {
      const redis = getRedis();
      await redis.del(`code:${id}:meta`);
      logger.info('Code file deleted', { fileId: id, userId });
    }

    return deleted;
  }

  // ── File tree ─────────────────────────────────────────────────────────────

  async getFileTree(workspaceId: string): Promise<FileTreeNode[]> {
    const result = await query<CodeFileRow>(
      `SELECT * FROM code_files WHERE workspace_id = $1 ORDER BY parent_path, name`,
      [workspaceId],
    );

    const root: FileTreeNode[] = [];
    const dirMap = new Map<string, FileTreeNode>();

    // Ensure root exists
    dirMap.set('/', { name: '/', path: '/', type: 'directory', children: [] });

    for (const row of result.rows) {
      const parentPath = row.parent_path || '/';

      // Ensure parent directories exist
      const parts = parentPath.split('/').filter(Boolean);
      let currentPath = '/';

      for (const part of parts) {
        const dirPath = currentPath === '/' ? `/${part}` : `${currentPath}/${part}`;
        if (!dirMap.has(dirPath)) {
          const dirNode: FileTreeNode = {
            name: part,
            path: dirPath,
            type: 'directory',
            children: [],
          };
          dirMap.set(dirPath, dirNode);

          const parent = dirMap.get(currentPath);
          if (parent?.children) {
            parent.children.push(dirNode);
          }
        }
        currentPath = dirPath;
      }

      // Add file node
      const fileNode: FileTreeNode = {
        name: row.name,
        path: parentPath === '/' ? `/${row.name}` : `${parentPath}/${row.name}`,
        type: 'file',
        language: row.language,
        fileId: row.id,
      };

      const parentDir = dirMap.get(parentPath);
      if (parentDir?.children) {
        parentDir.children.push(fileNode);
      } else {
        root.push(fileNode);
      }
    }

    const rootDir = dirMap.get('/');
    return rootDir?.children ?? root;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private rowToMeta(row: CodeFileRow): CodeFileMeta {
    return {
      id: row.id,
      name: row.name,
      language: row.language,
      workspaceId: row.workspace_id,
      ownerId: row.owner_id,
      version: row.version,
      parentPath: row.parent_path,
      settings: row.settings ?? {},
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
