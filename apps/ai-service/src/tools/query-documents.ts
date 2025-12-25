import { Tool, ToolContext, ToolResult } from './tool-registry.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface DocumentResult {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  updatedAt: string;
  createdBy: string;
  tags?: string[];
  score?: number;
}

export const queryDocumentsTool: Tool = {
  name: 'query_documents',
  description:
    'Search and read documents in the workspace. Supports full-text search, fetching specific documents by ID, and listing recent documents.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'get', 'list'],
        description: 'The action to perform (default: search)',
      },
      query: {
        type: 'string',
        description: 'Search query for document search',
      },
      documentId: {
        type: 'string',
        description: 'Document ID for fetching a specific document',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter documents by tags',
      },
      includeContent: {
        type: 'boolean',
        description: 'Whether to include full document content (default: false for search, true for get)',
      },
    },
    required: [],
  },
  agentTypes: ['knowledge', 'reviewer', 'planner', 'meeting', 'developer'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const action = (args.action as string) ?? 'search';
    const query = args.query ? String(args.query) : undefined;
    const documentId = args.documentId ? String(args.documentId) : undefined;
    const maxResults = Number(args.maxResults ?? 5);
    const tags = args.tags as string[] | undefined;
    const includeContent = args.includeContent as boolean | undefined;

    const baseUrl = config.docServiceUrl;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (context.authToken) {
      headers['Authorization'] = `Bearer ${context.authToken}`;
    }

    try {
      switch (action) {
        case 'search': {
          if (!query) {
            return { success: false, data: null, error: 'query is required for document search' };
          }

          const url = new URL(`${baseUrl}/documents/search`);
          url.searchParams.set('q', query);
          url.searchParams.set('workspaceId', context.workspaceId);
          url.searchParams.set('limit', String(maxResults));
          if (includeContent !== undefined) {
            url.searchParams.set('includeContent', String(includeContent));
          }
          if (tags && tags.length > 0) {
            url.searchParams.set('tags', tags.join(','));
          }

          const response = await fetch(url.toString(), {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            if (response.status === 404 || response.status === 503) {
              return {
                success: true,
                data: { results: [], total: 0, message: 'Document service unavailable' },
              };
            }
            const errText = await response.text();
            return { success: false, data: null, error: `Doc search failed: ${response.status} ${errText}` };
          }

          const searchData = (await response.json()) as {
            results: DocumentResult[];
            total: number;
          };

          return {
            success: true,
            data: {
              results: searchData.results.map((d) => ({
                id: d.id,
                title: d.title,
                excerpt: d.excerpt ?? d.content?.slice(0, 500),
                ...(includeContent && { content: d.content }),
                updatedAt: d.updatedAt,
                tags: d.tags,
                score: d.score,
              })),
              total: searchData.total,
              query,
            },
          };
        }

        case 'get': {
          if (!documentId) {
            return { success: false, data: null, error: 'documentId is required for get' };
          }

          const response = await fetch(`${baseUrl}/documents/${documentId}`, {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            const errText = await response.text();
            return { success: false, data: null, error: `Get document failed: ${response.status} ${errText}` };
          }

          const doc = (await response.json()) as DocumentResult;

          return {
            success: true,
            data: {
              id: doc.id,
              title: doc.title,
              content: doc.content,
              updatedAt: doc.updatedAt,
              createdBy: doc.createdBy,
              tags: doc.tags,
            },
          };
        }

        case 'list': {
          const url = new URL(`${baseUrl}/documents`);
          url.searchParams.set('workspaceId', context.workspaceId);
          url.searchParams.set('limit', String(maxResults));
          url.searchParams.set('sort', 'updatedAt');
          url.searchParams.set('order', 'desc');
          if (tags && tags.length > 0) {
            url.searchParams.set('tags', tags.join(','));
          }

          const response = await fetch(url.toString(), {
            method: 'GET',
            headers,
            signal: AbortSignal.timeout(10_000),
          });

          if (!response.ok) {
            if (response.status === 404 || response.status === 503) {
              return {
                success: true,
                data: { documents: [], total: 0, message: 'Document service unavailable' },
              };
            }
            const errText = await response.text();
            return { success: false, data: null, error: `List documents failed: ${response.status} ${errText}` };
          }

          const listData = (await response.json()) as {
            documents: DocumentResult[];
            total: number;
          };

          return {
            success: true,
            data: {
              documents: listData.documents.map((d) => ({
                id: d.id,
                title: d.title,
                excerpt: d.excerpt ?? d.content?.slice(0, 200),
                updatedAt: d.updatedAt,
                tags: d.tags,
              })),
              total: listData.total,
            },
          };
        }

        default:
          return { success: false, data: null, error: `Unknown action: ${action}` };
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('query_documents tool error', { error: errorMsg, action });
      return { success: false, data: null, error: errorMsg };
    }
  },
};
