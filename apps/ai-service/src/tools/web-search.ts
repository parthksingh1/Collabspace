import { Tool, ToolContext, ToolResult } from './tool-registry.js';
import { logger } from '../utils/logger.js';

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export const webSearchTool: Tool = {
  name: 'web_search',
  description:
    'Search the web for information. Returns summarized results with titles, URLs, and snippets. Useful for finding documentation, examples, and current information.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
      site: {
        type: 'string',
        description: 'Restrict search to a specific site (e.g., "stackoverflow.com")',
      },
    },
    required: ['query'],
  },
  agentTypes: ['knowledge', 'developer'],

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const query = String(args.query ?? '');
    const maxResults = Number(args.maxResults ?? 5);
    const site = args.site ? String(args.site) : undefined;

    if (!query) {
      return { success: false, data: null, error: 'Search query is required' };
    }

    const searchQuery = site ? `site:${site} ${query}` : query;

    try {
      // Attempt to use a search API. First try the DuckDuckGo instant answer API,
      // which is free and does not require an API key.
      const ddgUrl = new URL('https://api.duckduckgo.com/');
      ddgUrl.searchParams.set('q', searchQuery);
      ddgUrl.searchParams.set('format', 'json');
      ddgUrl.searchParams.set('no_redirect', '1');
      ddgUrl.searchParams.set('no_html', '1');
      ddgUrl.searchParams.set('skip_disambig', '1');

      const response = await fetch(ddgUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        return {
          success: true,
          data: {
            results: [] as WebSearchResult[],
            total: 0,
            message: `Web search returned status ${response.status}`,
            query: searchQuery,
          },
        };
      }

      const data = (await response.json()) as {
        Abstract?: string;
        AbstractURL?: string;
        AbstractText?: string;
        Heading?: string;
        RelatedTopics?: {
          Text?: string;
          FirstURL?: string;
          Result?: string;
          Topics?: { Text?: string; FirstURL?: string }[];
        }[];
        Results?: { Text?: string; FirstURL?: string }[];
      };

      const results: WebSearchResult[] = [];

      // Add abstract if present
      if (data.AbstractText && data.AbstractURL) {
        results.push({
          title: data.Heading ?? 'Search Result',
          url: data.AbstractURL,
          snippet: data.AbstractText,
        });
      }

      // Add direct results
      if (data.Results) {
        for (const r of data.Results) {
          if (r.Text && r.FirstURL && results.length < maxResults) {
            results.push({
              title: r.Text.slice(0, 100),
              url: r.FirstURL,
              snippet: r.Text,
            });
          }
        }
      }

      // Add related topics
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics) {
          if (results.length >= maxResults) break;

          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.slice(0, 100),
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }

          // Nested topics
          if (topic.Topics) {
            for (const sub of topic.Topics) {
              if (results.length >= maxResults) break;
              if (sub.Text && sub.FirstURL) {
                results.push({
                  title: sub.Text.slice(0, 100),
                  url: sub.FirstURL,
                  snippet: sub.Text,
                });
              }
            }
          }
        }
      }

      return {
        success: true,
        data: {
          results: results.slice(0, maxResults),
          total: results.length,
          query: searchQuery,
        },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('web_search tool error', { error: errorMsg, query });

      // Return empty results on network errors rather than failing
      return {
        success: true,
        data: {
          results: [],
          total: 0,
          message: `Web search failed: ${errorMsg}`,
          query: searchQuery,
        },
      };
    }
  },
};
