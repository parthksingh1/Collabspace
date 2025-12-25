import { Tool, ToolContext, ToolResult } from './tool-registry.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface SearchResult {
  filePath: string;
  lineNumber: number;
  content: string;
  matchType: 'regex' | 'semantic' | 'filename';
  score: number;
}

export const searchCodebaseTool: Tool = {
  name: 'search_codebase',
  description:
    'Search the workspace codebase for files, code snippets, or patterns. Supports regex search and file name matching. Returns relevant code snippets with file paths and line numbers.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query — can be a keyword, regex pattern, or natural language description',
      },
      filePattern: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.ts", "src/**/*.tsx")',
      },
      searchType: {
        type: 'string',
        enum: ['regex', 'semantic', 'filename'],
        description: 'Type of search to perform (default: regex)',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 10)',
      },
      contextLines: {
        type: 'number',
        description: 'Number of context lines around each match (default: 3)',
      },
    },
    required: ['query'],
  },
  agentTypes: ['developer', 'reviewer', 'knowledge', 'planner'],

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const query = String(args.query ?? '');
    const filePattern = args.filePattern ? String(args.filePattern) : undefined;
    const searchType = (args.searchType as string) ?? 'regex';
    const maxResults = Number(args.maxResults ?? 10);
    const contextLines = Number(args.contextLines ?? 3);

    if (!query) {
      return { success: false, data: null, error: 'Search query is required' };
    }

    try {
      const url = new URL(`${config.codeServiceUrl}/code/search`);
      const body: Record<string, unknown> = {
        workspaceId: context.workspaceId,
        query,
        searchType,
        maxResults,
        contextLines,
      };

      if (filePattern) {
        body.filePattern = filePattern;
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(context.authToken && { Authorization: `Bearer ${context.authToken}` }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        // Fallback: construct basic results if the service is unavailable
        if (response.status === 404 || response.status === 503) {
          logger.warn('Code service unavailable, returning empty results');
          return {
            success: true,
            data: {
              results: [] as SearchResult[],
              total: 0,
              message: 'Code search service is currently unavailable',
            },
          };
        }
        const errText = await response.text();
        return { success: false, data: null, error: `Code service error: ${response.status} ${errText}` };
      }

      const data = (await response.json()) as {
        results: SearchResult[];
        total: number;
      };

      // Format results for LLM consumption
      const formattedResults = data.results.map((r) => ({
        filePath: r.filePath,
        lineNumber: r.lineNumber,
        content: r.content,
        matchType: r.matchType,
        score: r.score,
      }));

      return {
        success: true,
        data: {
          results: formattedResults,
          total: data.total,
          query,
          searchType,
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('search_codebase tool error', { error: errorMsg, query });

      // Return empty results on timeout or network errors
      if (errorMsg.includes('timeout') || errorMsg.includes('ECONNREFUSED')) {
        return {
          success: true,
          data: {
            results: [],
            total: 0,
            message: 'Search timed out or service unavailable',
          },
        };
      }

      return { success: false, data: null, error: errorMsg };
    }
  },
};
