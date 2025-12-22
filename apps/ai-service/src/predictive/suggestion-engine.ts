import { aiRouter } from '../gateway/ai-router.js';
import { intentDetector, UserIntent } from './intent-detector.js';
import { memoryManager } from '../memory/memory-manager.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Suggestion {
  id: string;
  type: 'autocomplete' | 'next_action' | 'template' | 'info';
  content: string;
  title: string;
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: number;
}

export interface SuggestionContext {
  userId: string;
  workspaceId: string;
  filePath?: string;
  currentContent?: string;
  cursorPosition?: { line: number; column: number };
  recentActions?: string[];
  intent?: UserIntent;
}

// ---------------------------------------------------------------------------
// Suggestion Engine
// ---------------------------------------------------------------------------

export class SuggestionEngine {
  private templateCache: Map<string, string[]> = new Map();
  private recentSuggestions: Map<string, Suggestion[]> = new Map(); // userId -> suggestions

  // -----------------------------------------------------------------------
  // Context-aware autocomplete
  // -----------------------------------------------------------------------

  async getAutocompleteSuggestions(context: SuggestionContext): Promise<Suggestion[]> {
    const { userId, currentContent, filePath, cursorPosition } = context;

    if (!currentContent || !cursorPosition) return [];

    // Get the current line and surrounding context
    const lines = currentContent.split('\n');
    const currentLine = lines[cursorPosition.line - 1] ?? '';
    const previousLines = lines.slice(Math.max(0, cursorPosition.line - 10), cursorPosition.line - 1);
    const nextLines = lines.slice(cursorPosition.line, cursorPosition.line + 5);

    const fileExtension = filePath?.split('.').pop() ?? '';
    const intent = context.intent ?? intentDetector.getIntent(userId)?.intent ?? 'unknown';

    const prompt = `Complete the current line of code/text. Provide 1-3 short completions.

File type: ${fileExtension}
User intent: ${intent}

Context before cursor:
\`\`\`
${previousLines.join('\n')}
${currentLine}
\`\`\`

Context after cursor:
\`\`\`
${nextLines.join('\n')}
\`\`\`

Current line up to cursor: "${currentLine.slice(0, cursorPosition.column)}"

Return completions as a JSON array of strings. Each completion should continue from the cursor position.`;

    try {
      const response = await aiRouter.chat(
        [{ role: 'user', content: prompt }],
        {
          temperature: 0.2,
          maxTokens: 512,
          responseFormat: 'json',
        },
        'fast_response',
        userId,
      );

      let completions: string[] = [];
      try {
        const parsed = JSON.parse(response.content);
        if (Array.isArray(parsed)) {
          completions = parsed.filter((c): c is string => typeof c === 'string').slice(0, 3);
        } else if (parsed.completions && Array.isArray(parsed.completions)) {
          completions = parsed.completions.filter((c: unknown): c is string => typeof c === 'string').slice(0, 3);
        }
      } catch {
        // If the response isn't valid JSON, try to extract completions
        completions = [response.content.trim()];
      }

      return completions.map((content, idx) => ({
        id: `ac_${Date.now()}_${idx}`,
        type: 'autocomplete' as const,
        content,
        title: 'Autocomplete suggestion',
        confidence: 0.8 - idx * 0.1,
        metadata: { filePath, line: cursorPosition.line, intent },
        createdAt: Date.now(),
      }));
    } catch (err) {
      logger.error('Failed to generate autocomplete suggestions', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Next action prediction
  // -----------------------------------------------------------------------

  async predictNextAction(context: SuggestionContext): Promise<Suggestion[]> {
    const { userId, workspaceId, recentActions } = context;
    const intent = context.intent ?? intentDetector.getIntent(userId)?.intent ?? 'unknown';

    if (!recentActions || recentActions.length === 0) return [];

    // Get workspace context
    let workspaceContext = '';
    try {
      const wsCtx = await memoryManager.getWorkspaceContext(workspaceId);
      workspaceContext = wsCtx.contextSummary;
    } catch {
      // Not critical
    }

    const prompt = `Based on the user's recent actions, predict what they might want to do next. Provide 1-3 actionable suggestions.

User intent: ${intent}
Recent actions:
${recentActions.slice(-10).map((a) => `- ${a}`).join('\n')}

Workspace context: ${workspaceContext.slice(0, 500)}

Return as JSON: [{ "title": "short title", "description": "what to do", "actionType": "create_task|write_code|write_doc|run_test|review|search" }]`;

    try {
      const response = await aiRouter.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.4, maxTokens: 512, responseFormat: 'json' },
        'fast_response',
        userId,
      );

      let suggestions: { title: string; description: string; actionType: string }[] = [];
      try {
        const parsed = JSON.parse(response.content);
        suggestions = Array.isArray(parsed) ? parsed : parsed.suggestions ?? [];
      } catch {
        return [];
      }

      return suggestions.slice(0, 3).map((s, idx) => ({
        id: `na_${Date.now()}_${idx}`,
        type: 'next_action' as const,
        content: s.description,
        title: s.title,
        confidence: 0.7 - idx * 0.1,
        metadata: { actionType: s.actionType, intent },
        createdAt: Date.now(),
      }));
    } catch (err) {
      logger.error('Failed to predict next actions', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Smart templates
  // -----------------------------------------------------------------------

  async getSmartTemplates(context: SuggestionContext): Promise<Suggestion[]> {
    const { userId, filePath, intent } = context;
    const fileExt = filePath?.split('.').pop() ?? '';
    const detectedIntent = intent ?? intentDetector.getIntent(userId)?.intent ?? 'unknown';

    // Check cache
    const cacheKey = `${fileExt}_${detectedIntent}`;
    const cached = this.templateCache.get(cacheKey);
    if (cached) {
      return cached.map((t, idx) => ({
        id: `tpl_${Date.now()}_${idx}`,
        type: 'template' as const,
        content: t,
        title: `${detectedIntent} template`,
        confidence: 0.6,
        metadata: { fileType: fileExt, intent: detectedIntent },
        createdAt: Date.now(),
      }));
    }

    const prompt = `Generate 2-3 useful code/text templates for a user who is ${detectedIntent} in a .${fileExt || 'ts'} file.

Return as JSON array of objects with "title" and "template" fields. Templates should be practical and follow best practices.`;

    try {
      const response = await aiRouter.chat(
        [{ role: 'user', content: prompt }],
        { temperature: 0.5, maxTokens: 1024, responseFormat: 'json' },
        'fast_response',
        userId,
      );

      let templates: { title: string; template: string }[] = [];
      try {
        const parsed = JSON.parse(response.content);
        templates = Array.isArray(parsed) ? parsed : parsed.templates ?? [];
      } catch {
        return [];
      }

      // Cache for 10 minutes
      this.templateCache.set(cacheKey, templates.map((t) => t.template));
      setTimeout(() => this.templateCache.delete(cacheKey), 10 * 60 * 1000);

      return templates.slice(0, 3).map((t, idx) => ({
        id: `tpl_${Date.now()}_${idx}`,
        type: 'template' as const,
        content: t.template,
        title: t.title,
        confidence: 0.6,
        metadata: { fileType: fileExt, intent: detectedIntent },
        createdAt: Date.now(),
      }));
    } catch (err) {
      logger.error('Failed to generate templates', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Proactive information surfacing
  // -----------------------------------------------------------------------

  async getProactiveInfo(context: SuggestionContext): Promise<Suggestion[]> {
    const { userId, workspaceId, currentContent, filePath } = context;

    if (!currentContent || !filePath) return [];

    // Look for patterns that suggest the user needs information
    const patterns = [
      { regex: /TODO|FIXME|HACK|XXX/i, type: 'todo_detected' },
      { regex: /import .+ from ['"]([^'"]+)['"]/g, type: 'dependency_usage' },
      { regex: /\/\/ ?\?|\/\* ?\?/g, type: 'question_in_comment' },
      { regex: /throw new Error/g, type: 'error_handling' },
    ];

    const detectedPatterns: string[] = [];
    for (const { regex, type } of patterns) {
      if (regex.test(currentContent)) {
        detectedPatterns.push(type);
      }
    }

    if (detectedPatterns.length === 0) return [];

    // Get relevant memories
    let relevantInfo = '';
    try {
      const memories = await memoryManager.recallLongTerm(
        `${filePath} ${detectedPatterns.join(' ')}`,
        3,
        { workspaceId: { $eq: workspaceId } },
        `ws_${workspaceId}`,
      );

      if (memories.length > 0) {
        relevantInfo = memories
          .map((m) => m.content.slice(0, 200))
          .join('\n');
      }
    } catch {
      // Not critical
    }

    const suggestions: Suggestion[] = [];

    if (detectedPatterns.includes('todo_detected')) {
      suggestions.push({
        id: `info_${Date.now()}_todo`,
        type: 'info',
        content: 'There are TODO items in this file. Would you like me to create tasks for them?',
        title: 'TODO items detected',
        confidence: 0.5,
        metadata: { trigger: 'todo_detected', filePath },
        createdAt: Date.now(),
      });
    }

    if (detectedPatterns.includes('question_in_comment') && relevantInfo) {
      suggestions.push({
        id: `info_${Date.now()}_question`,
        type: 'info',
        content: `Related context found:\n${relevantInfo}`,
        title: 'Related information available',
        confidence: 0.6,
        metadata: { trigger: 'question_in_comment', filePath },
        createdAt: Date.now(),
      });
    }

    // Store suggestions for deduplication
    const existing = this.recentSuggestions.get(userId) ?? [];
    existing.push(...suggestions);
    if (existing.length > 50) {
      existing.splice(0, existing.length - 50);
    }
    this.recentSuggestions.set(userId, existing);

    return suggestions;
  }

  // -----------------------------------------------------------------------
  // Aggregate suggestions
  // -----------------------------------------------------------------------

  async getSuggestions(
    context: SuggestionContext,
    types: ('autocomplete' | 'next_action' | 'template' | 'info')[] = ['autocomplete', 'next_action'],
  ): Promise<Suggestion[]> {
    const allSuggestions: Suggestion[] = [];

    const promises: Promise<Suggestion[]>[] = [];

    if (types.includes('autocomplete')) {
      promises.push(this.getAutocompleteSuggestions(context));
    }
    if (types.includes('next_action')) {
      promises.push(this.predictNextAction(context));
    }
    if (types.includes('template')) {
      promises.push(this.getSmartTemplates(context));
    }
    if (types.includes('info')) {
      promises.push(this.getProactiveInfo(context));
    }

    const results = await Promise.allSettled(promises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        allSuggestions.push(...result.value);
      }
    }

    // Sort by confidence
    allSuggestions.sort((a, b) => b.confidence - a.confidence);

    return allSuggestions;
  }
}

export const suggestionEngine = new SuggestionEngine();
