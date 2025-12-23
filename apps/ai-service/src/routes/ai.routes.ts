import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { aiRouter, TaskType } from '../gateway/ai-router.js';
import { promptManager, truncateMessages } from '../gateway/prompt-manager.js';
import { userRateLimiter, RateLimitError } from '../gateway/rate-limiter.js';
import { LLMMessage } from '../providers/base-provider.js';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

export const aiRoutes = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: z.string(),
      name: z.string().optional(),
      toolCallId: z.string().optional(),
    }),
  ),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(128000).optional(),
  systemPrompt: z.string().optional(),
  stream: z.boolean().optional().default(false),
});

const completeSchema = z.object({
  prompt: z.string().min(1).max(100000),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(1).max(16000).optional(),
  systemPrompt: z.string().optional(),
});

const embedSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(100),
});

const summarizeSchema = z.object({
  content: z.string().min(1).max(500000),
  maxLength: z.number().min(50).max(5000).optional().default(500),
  format: z.enum(['paragraph', 'bullets', 'structured']).optional().default('paragraph'),
});

const codeGenerateSchema = z.object({
  description: z.string().min(1).max(10000),
  language: z.string().optional().default('typescript'),
  context: z.string().optional(),
  style: z.string().optional(),
});

const codeReviewSchema = z.object({
  code: z.string().min(1).max(100000),
  language: z.string().optional(),
  focus: z.array(z.string()).optional(),
  context: z.string().optional(),
});

const explainSchema = z.object({
  content: z.string().min(1).max(50000),
  type: z.enum(['code', 'concept', 'error', 'architecture']).optional().default('code'),
  level: z.enum(['beginner', 'intermediate', 'expert']).optional().default('intermediate'),
});

const suggestTasksSchema = z.object({
  description: z.string().min(1).max(20000),
  teamSize: z.number().optional().default(3),
  sprintLength: z.number().optional().default(14),
});

const diagramSchema = z.object({
  description: z.string().min(1).max(10000),
  type: z.enum(['flowchart', 'sequence', 'class', 'erd', 'architecture']).optional().default('flowchart'),
  format: z.enum(['mermaid', 'plantuml', 'ascii']).optional().default('mermaid'),
});

const translateSchema = z.object({
  text: z.string().min(1).max(50000),
  from: z.string().min(1),
  to: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserId(req: Request): string {
  return (req.headers['x-user-id'] as string) ?? 'anonymous';
}

function getWorkspaceId(req: Request): string {
  return (req.headers['x-workspace-id'] as string) ?? 'default';
}

async function checkRateLimit(userId: string, estimatedTokens: number): Promise<void> {
  try {
    await userRateLimiter.acquire(userId, estimatedTokens);
  } catch (err) {
    if (err instanceof RateLimitError) {
      const error = new Error('Rate limit exceeded') as Error & { statusCode: number; retryAfterMs: number };
      error.statusCode = 429;
      error.retryAfterMs = err.retryAfterMs;
      throw error;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// POST /ai/chat — Chat with AI (streaming SSE or regular)
// ---------------------------------------------------------------------------

aiRoutes.post('/chat', async (req: Request, res: Response) => {
  try {
    const body = chatSchema.parse(req.body);
    const userId = getUserId(req);

    const estimatedTokens = body.messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    await checkRateLimit(userId, estimatedTokens);

    const messages: LLMMessage[] = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
      name: m.name,
      toolCallId: m.toolCallId,
    }));

    const truncated = truncateMessages(messages, config.memoryMaxContextTokens);

    if (body.stream) {
      // SSE streaming response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        const generator = aiRouter.stream(
          truncated,
          {
            model: body.model,
            temperature: body.temperature,
            maxTokens: body.maxTokens,
            systemPrompt: body.systemPrompt,
          },
          'general',
        );

        for await (const chunk of generator) {
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }

        res.write('data: [DONE]\n\n');
        res.end();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Stream error';
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.end();
      }
      return;
    }

    // Non-streaming response
    const response = await aiRouter.chat(
      truncated,
      {
        model: body.model,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        systemPrompt: body.systemPrompt,
      },
      'general',
      userId,
    );

    res.json({
      success: true,
      data: {
        content: response.content,
        model: response.model,
        usage: response.usage,
        finishReason: response.finishReason,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/complete — Text completion
// ---------------------------------------------------------------------------

aiRoutes.post('/complete', async (req: Request, res: Response) => {
  try {
    const body = completeSchema.parse(req.body);
    const userId = getUserId(req);
    await checkRateLimit(userId, Math.ceil(body.prompt.length / 4));

    const messages: LLMMessage[] = [{ role: 'user', content: body.prompt }];

    const response = await aiRouter.chat(
      messages,
      {
        model: body.model,
        temperature: body.temperature ?? 0.7,
        maxTokens: body.maxTokens ?? 2048,
        systemPrompt: body.systemPrompt ?? 'You are a helpful assistant. Complete the given text naturally.',
      },
      'fast_response',
      userId,
    );

    res.json({
      success: true,
      data: {
        completion: response.content,
        model: response.model,
        usage: response.usage,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/embed — Generate embeddings
// ---------------------------------------------------------------------------

aiRoutes.post('/embed', async (req: Request, res: Response) => {
  try {
    const body = embedSchema.parse(req.body);
    const userId = getUserId(req);
    await checkRateLimit(userId, body.texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0));

    const embeddings = await aiRouter.embed(body.texts);

    res.json({
      success: true,
      data: {
        embeddings,
        dimensions: embeddings[0]?.length ?? 0,
        count: embeddings.length,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/summarize — Summarize content
// ---------------------------------------------------------------------------

aiRoutes.post('/summarize', async (req: Request, res: Response) => {
  try {
    const body = summarizeSchema.parse(req.body);
    const userId = getUserId(req);
    await checkRateLimit(userId, Math.ceil(body.content.length / 4));

    const formatInstructions: Record<string, string> = {
      paragraph: 'Write a concise paragraph summary.',
      bullets: 'Provide a bulleted list of key points.',
      structured: `Provide a structured summary with sections:
1. TL;DR (one sentence)
2. Key Points (bullet list)
3. Decisions Made (if any)
4. Action Items (if any)
5. Open Questions (if any)`,
    };

    const systemPrompt = promptManager.getSystemPrompt('summarizing', {
      maxLength: String(body.maxLength),
      context: '',
    });

    const response = await aiRouter.chat(
      [
        {
          role: 'user',
          content: `${formatInstructions[body.format]}\n\nContent to summarize:\n\n${body.content}`,
        },
      ],
      {
        systemPrompt,
        temperature: 0.3,
        maxTokens: Math.min(body.maxLength * 2, 4096),
      },
      'fast_response',
      userId,
    );

    res.json({
      success: true,
      data: {
        summary: response.content,
        format: body.format,
        model: response.model,
        usage: response.usage,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/generate-code — Generate code from description
// ---------------------------------------------------------------------------

aiRoutes.post('/generate-code', async (req: Request, res: Response) => {
  try {
    const body = codeGenerateSchema.parse(req.body);
    const userId = getUserId(req);
    await checkRateLimit(userId, Math.ceil(body.description.length / 4));

    const systemPrompt = promptManager.getSystemPrompt('coding', {
      context: body.context ?? '',
    });

    const userContent = `Generate ${body.language} code for the following:\n\n${body.description}${
      body.style ? `\n\nCoding style: ${body.style}` : ''
    }\n\nProvide complete, production-ready code with error handling and comments.`;

    const messages = promptManager.buildMessages({
      systemPromptName: 'coding',
      systemVars: { context: body.context ?? '' },
      fewShotTaskType: 'code_generation',
      userMessages: [{ role: 'user', content: userContent }],
    });

    const response = await aiRouter.chat(
      messages,
      { temperature: 0.3, maxTokens: 4096 },
      'code_generation',
      userId,
    );

    res.json({
      success: true,
      data: {
        code: response.content,
        language: body.language,
        model: response.model,
        usage: response.usage,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/review-code — Review code for issues
// ---------------------------------------------------------------------------

aiRoutes.post('/review-code', async (req: Request, res: Response) => {
  try {
    const body = codeReviewSchema.parse(req.body);
    const userId = getUserId(req);
    await checkRateLimit(userId, Math.ceil(body.code.length / 4));

    const focusAreas = body.focus?.join(', ') ?? 'bugs, security, performance, code quality';

    const messages = promptManager.buildMessages({
      systemPromptName: 'reviewing',
      systemVars: { scope: focusAreas, context: body.context ?? '' },
      fewShotTaskType: 'code_review',
      userMessages: [
        {
          role: 'user',
          content: `Review the following ${body.language ?? 'code'} for issues:\n\n\`\`\`${body.language ?? ''}\n${body.code}\n\`\`\`\n\nFocus on: ${focusAreas}\n\nProvide a structured review with severity ratings.`,
        },
      ],
    });

    const response = await aiRouter.chat(
      messages,
      { temperature: 0.2, maxTokens: 4096, responseFormat: 'json' },
      'complex_reasoning',
      userId,
    );

    // Try to parse as structured review
    let review: unknown;
    try {
      review = JSON.parse(response.content);
    } catch {
      review = { rawReview: response.content };
    }

    res.json({
      success: true,
      data: {
        review,
        model: response.model,
        usage: response.usage,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/explain — Explain code/concept
// ---------------------------------------------------------------------------

aiRoutes.post('/explain', async (req: Request, res: Response) => {
  try {
    const body = explainSchema.parse(req.body);
    const userId = getUserId(req);
    await checkRateLimit(userId, Math.ceil(body.content.length / 4));

    const typePrompts: Record<string, string> = {
      code: 'Explain the following code in detail:',
      concept: 'Explain the following concept:',
      error: 'Explain the following error and how to fix it:',
      architecture: 'Explain the following system architecture:',
    };

    const messages = promptManager.buildMessages({
      systemPromptName: 'explaining',
      systemVars: { level: body.level, context: '' },
      userMessages: [
        {
          role: 'user',
          content: `${typePrompts[body.type]}\n\n${body.content}`,
        },
      ],
    });

    const response = await aiRouter.chat(
      messages,
      { temperature: 0.4, maxTokens: 4096 },
      'general',
      userId,
    );

    res.json({
      success: true,
      data: {
        explanation: response.content,
        type: body.type,
        level: body.level,
        model: response.model,
        usage: response.usage,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/suggest-tasks — Break down work into tasks
// ---------------------------------------------------------------------------

aiRoutes.post('/suggest-tasks', async (req: Request, res: Response) => {
  try {
    const body = suggestTasksSchema.parse(req.body);
    const userId = getUserId(req);
    await checkRateLimit(userId, Math.ceil(body.description.length / 4));

    const messages = promptManager.buildMessages({
      systemPromptName: 'planning',
      systemVars: {
        context: body.description,
        teamSize: String(body.teamSize),
      },
      fewShotTaskType: 'task_breakdown',
      userMessages: [
        {
          role: 'user',
          content: `Break down the following into actionable tasks for a team of ${body.teamSize} over a ${body.sprintLength}-day sprint:\n\n${body.description}\n\nReturn a structured JSON plan with tasks, estimates, priorities, and dependencies.`,
        },
      ],
    });

    const response = await aiRouter.chat(
      messages,
      { temperature: 0.3, maxTokens: 4096, responseFormat: 'json' },
      'complex_reasoning',
      userId,
    );

    let tasks: unknown;
    try {
      tasks = JSON.parse(response.content);
    } catch {
      tasks = { rawPlan: response.content };
    }

    res.json({
      success: true,
      data: {
        plan: tasks,
        model: response.model,
        usage: response.usage,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/diagram — Generate diagram from description
// ---------------------------------------------------------------------------

aiRoutes.post('/diagram', async (req: Request, res: Response) => {
  try {
    const body = diagramSchema.parse(req.body);
    const userId = getUserId(req);
    await checkRateLimit(userId, Math.ceil(body.description.length / 4));

    const formatExamples: Record<string, string> = {
      mermaid: 'Use Mermaid.js syntax. Start with the diagram type declaration (graph TD, sequenceDiagram, classDiagram, erDiagram, etc.).',
      plantuml: 'Use PlantUML syntax. Wrap in @startuml/@enduml.',
      ascii: 'Use ASCII art with box-drawing characters.',
    };

    const response = await aiRouter.chat(
      [
        {
          role: 'user',
          content: `Generate a ${body.type} diagram for the following:\n\n${body.description}\n\n${formatExamples[body.format]}\n\nReturn ONLY the diagram code, no explanation.`,
        },
      ],
      {
        systemPrompt: 'You are an expert at creating technical diagrams. Generate clean, well-organized diagrams.',
        temperature: 0.3,
        maxTokens: 2048,
      },
      'code_generation',
      userId,
    );

    res.json({
      success: true,
      data: {
        diagram: response.content,
        type: body.type,
        format: body.format,
        model: response.model,
        usage: response.usage,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ---------------------------------------------------------------------------
// POST /ai/translate — Translate between languages
// ---------------------------------------------------------------------------

aiRoutes.post('/translate', async (req: Request, res: Response) => {
  try {
    const body = translateSchema.parse(req.body);
    const userId = getUserId(req);
    await checkRateLimit(userId, Math.ceil(body.text.length / 4));

    const response = await aiRouter.chat(
      [
        {
          role: 'user',
          content: `Translate the following text from ${body.from} to ${body.to}. Preserve formatting, tone, and meaning as closely as possible.\n\nText:\n${body.text}`,
        },
      ],
      {
        systemPrompt: 'You are an expert translator. Provide accurate, natural-sounding translations that preserve the original meaning and tone.',
        temperature: 0.3,
        maxTokens: Math.ceil(body.text.length / 2) + 1024,
      },
      'general',
      userId,
    );

    res.json({
      success: true,
      data: {
        translation: response.content,
        from: body.from,
        to: body.to,
        model: response.model,
        usage: response.usage,
      },
    });
  } catch (err) {
    handleRouteError(res, err);
  }
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

function handleRouteError(res: Response, err: unknown): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: err.errors,
      },
    });
    return;
  }

  const error = err as Error & { statusCode?: number; retryAfterMs?: number };

  if (error.statusCode === 429) {
    res.setHeader('Retry-After', String(Math.ceil((error.retryAfterMs ?? 1000) / 1000)));
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfterMs: error.retryAfterMs,
      },
    });
    return;
  }

  logger.error('AI route error', {
    message: error.message,
    stack: config.nodeEnv === 'development' ? error.stack : undefined,
  });

  res.status(error.statusCode ?? 500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: error.statusCode ? error.message : 'An internal server error occurred',
    },
  });
}
