import { logger } from '../utils/logger.js';
import { config } from '../config.js';
import { LLMMessage } from '../providers/base-provider.js';

// ---------------------------------------------------------------------------
// Prompt template
// ---------------------------------------------------------------------------

export class PromptTemplate {
  readonly name: string;
  readonly version: number;
  private template: string;
  private variables: string[];

  constructor(name: string, template: string, version: number = 1) {
    this.name = name;
    this.template = template;
    this.version = version;
    this.variables = this.extractVariables(template);
  }

  private extractVariables(template: string): string[] {
    const matches = template.matchAll(/\{\{(\w+)\}\}/g);
    const vars = new Set<string>();
    for (const match of matches) {
      vars.add(match[1]);
    }
    return [...vars];
  }

  render(vars: Record<string, string>): string {
    let result = this.template;
    for (const key of this.variables) {
      const value = vars[key];
      if (value === undefined) {
        logger.warn(`Missing template variable: ${key}`, { template: this.name });
        result = result.replaceAll(`{{${key}}}`, '');
      } else {
        result = result.replaceAll(`{{${key}}}`, value);
      }
    }
    return result;
  }

  getVariables(): string[] {
    return [...this.variables];
  }
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS: Record<string, PromptTemplate> = {
  coding: new PromptTemplate(
    'coding',
    `You are an expert full-stack software developer. You write clean, maintainable, production-quality code.

Guidelines:
- Write TypeScript unless another language is specified.
- Follow best practices for the relevant framework/library.
- Include proper error handling and input validation.
- Add concise but helpful comments for complex logic.
- Prefer composition over inheritance.
- Follow SOLID principles.

{{context}}`,
    1,
  ),

  writing: new PromptTemplate(
    'writing',
    `You are a professional technical writer and editor. You produce clear, concise, and well-structured content.

Guidelines:
- Use active voice and present tense where possible.
- Keep paragraphs short and focused.
- Use headings and bullet points for scannability.
- Tailor tone to the audience: {{audience}}.

{{context}}`,
    1,
  ),

  planning: new PromptTemplate(
    'planning',
    `You are an expert project manager and agile coach. You break complex goals into actionable, well-estimated tasks.

Guidelines:
- Each task should be completable in one sprint or less.
- Include acceptance criteria for every task.
- Identify dependencies and blockers.
- Estimate using story points (1, 2, 3, 5, 8, 13).
- Prioritize by value and risk.

Project context: {{context}}
Team size: {{teamSize}}`,
    1,
  ),

  reviewing: new PromptTemplate(
    'reviewing',
    `You are a senior code reviewer and security analyst. You provide thorough, constructive feedback.

Guidelines:
- Check for bugs, security vulnerabilities, and performance issues.
- Rate issues by severity: critical, major, minor, suggestion.
- Explain why something is an issue, not just what.
- Suggest specific fixes with code examples.
- Acknowledge good patterns and practices.

Review scope: {{scope}}
{{context}}`,
    1,
  ),

  summarizing: new PromptTemplate(
    'summarizing',
    `You are an expert at extracting key information and producing concise summaries.

Guidelines:
- Start with a one-sentence TL;DR.
- Organize by topic or theme, not chronologically.
- Highlight decisions, action items, and open questions.
- Keep the summary under {{maxLength}} words.

{{context}}`,
    1,
  ),

  explaining: new PromptTemplate(
    'explaining',
    `You are a patient and knowledgeable teacher who explains complex topics clearly.

Guidelines:
- Start with a high-level overview before diving into details.
- Use analogies and examples to illustrate concepts.
- Adjust complexity to the audience level: {{level}}.
- Break down complex ideas into smaller, digestible pieces.

{{context}}`,
    1,
  ),

  meeting: new PromptTemplate(
    'meeting',
    `You are an expert meeting facilitator. You extract actionable insights from discussions.

Guidelines:
- Identify key discussion topics and decisions made.
- Extract all action items with owners and deadlines.
- Note open questions and unresolved issues.
- Summarize each participant's main contributions.
- Keep notes structured and scannable.

Meeting type: {{meetingType}}
{{context}}`,
    1,
  ),

  knowledge: new PromptTemplate(
    'knowledge',
    `You are a thorough researcher who provides comprehensive, well-sourced answers.

Guidelines:
- Answer the question directly first, then provide context.
- Cite sources when referencing specific information.
- Distinguish between established facts and opinions.
- Acknowledge uncertainty or gaps in available information.
- Suggest related topics for further exploration.

Domain: {{domain}}
{{context}}`,
    1,
  ),
};

// ---------------------------------------------------------------------------
// Few-shot examples
// ---------------------------------------------------------------------------

interface FewShotExample {
  taskType: string;
  messages: LLMMessage[];
}

const FEW_SHOT_EXAMPLES: FewShotExample[] = [
  {
    taskType: 'code_generation',
    messages: [
      { role: 'user', content: 'Write a function to debounce another function' },
      {
        role: 'assistant',
        content: `\`\`\`typescript
function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delayMs: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return function debounced(this: unknown, ...args: Parameters<T>): void {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn.apply(this, args);
    }, delayMs);
  };
}
\`\`\``,
      },
    ],
  },
  {
    taskType: 'code_review',
    messages: [
      {
        role: 'user',
        content: 'Review this code:\n```\nfunction getUser(id) { return fetch("/api/users/" + id).then(r => r.json()); }\n```',
      },
      {
        role: 'assistant',
        content: `**Code Review**

| Severity | Issue |
|----------|-------|
| Major | No error handling — network failures and non-200 responses will silently produce invalid data |
| Major | No input validation on \`id\` — potential injection if user-controlled |
| Minor | String concatenation instead of template literal |
| Suggestion | Add TypeScript types for the return value |

**Suggested fix:**
\`\`\`typescript
async function getUser(id: string): Promise<User> {
  if (!id || typeof id !== 'string') {
    throw new Error('Invalid user ID');
  }
  const response = await fetch(\`/api/users/\${encodeURIComponent(id)}\`);
  if (!response.ok) {
    throw new Error(\`Failed to fetch user: \${response.status}\`);
  }
  return response.json() as Promise<User>;
}
\`\`\``,
      },
    ],
  },
  {
    taskType: 'task_breakdown',
    messages: [
      { role: 'user', content: 'Break down: Add dark mode support to the app' },
      {
        role: 'assistant',
        content: `## Task Breakdown: Dark Mode Support

1. **Define color tokens** (2 pts)
   - Create light/dark theme token sets
   - AC: All semantic color tokens defined for both themes

2. **Create ThemeProvider** (3 pts)
   - React context for theme state
   - Persist preference to localStorage
   - AC: Theme toggles and persists across sessions

3. **Update component library** (5 pts)
   - Replace hardcoded colors with tokens
   - AC: All components render correctly in both themes

4. **Add system preference detection** (2 pts)
   - Use \`prefers-color-scheme\` media query
   - AC: App defaults to OS preference on first visit

5. **Add theme toggle UI** (1 pt)
   - Toggle button in header/settings
   - AC: Users can switch themes from the UI

**Total: 13 story points**
**Dependencies: 1 → 2 → 3 (sequential), 4 & 5 can parallel after 2**`,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Context window management
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(messages: LLMMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content) + 4; // message overhead
    if (msg.name) total += estimateTokens(msg.name);
  }
  return total;
}

export function truncateMessages(
  messages: LLMMessage[],
  maxTokens: number,
  preserveSystemMessages: boolean = true,
): LLMMessage[] {
  const currentTokens = estimateMessageTokens(messages);
  if (currentTokens <= maxTokens) return messages;

  const systemMessages = preserveSystemMessages
    ? messages.filter((m) => m.role === 'system')
    : [];
  const nonSystemMessages = preserveSystemMessages
    ? messages.filter((m) => m.role !== 'system')
    : [...messages];

  const systemTokens = estimateMessageTokens(systemMessages);
  let remainingBudget = maxTokens - systemTokens;

  // Always keep the most recent messages
  const result: LLMMessage[] = [];
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(nonSystemMessages[i].content) + 4;
    if (remainingBudget - msgTokens < 0 && result.length > 0) break;
    remainingBudget -= msgTokens;
    result.unshift(nonSystemMessages[i]);
  }

  return [...systemMessages, ...result];
}

export async function summarizeMessages(
  messages: LLMMessage[],
  summarizer: (prompt: string) => Promise<string>,
): Promise<LLMMessage[]> {
  if (messages.length <= 4) return messages;

  const systemMessages = messages.filter((m) => m.role === 'system');
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  // Keep the last 4 messages as-is, summarize the rest
  const toSummarize = conversationMessages.slice(0, -4);
  const toKeep = conversationMessages.slice(-4);

  if (toSummarize.length === 0) return messages;

  const conversationText = toSummarize
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n\n');

  const summary = await summarizer(
    `Summarize the following conversation concisely, preserving key decisions, questions, and context:\n\n${conversationText}`,
  );

  return [
    ...systemMessages,
    { role: 'user' as const, content: `[Previous conversation summary]\n${summary}` },
    { role: 'assistant' as const, content: 'Understood. I have the context from our previous conversation. How can I help?' },
    ...toKeep,
  ];
}

// ---------------------------------------------------------------------------
// PromptManager
// ---------------------------------------------------------------------------

export class PromptManager {
  private templates: Map<string, PromptTemplate[]> = new Map(); // name -> versions
  private fewShotExamples: Map<string, FewShotExample[]> = new Map();

  constructor() {
    // Load built-in templates
    for (const [name, template] of Object.entries(SYSTEM_PROMPTS)) {
      this.templates.set(name, [template]);
    }

    // Load built-in few-shot examples
    for (const example of FEW_SHOT_EXAMPLES) {
      const existing = this.fewShotExamples.get(example.taskType) ?? [];
      existing.push(example);
      this.fewShotExamples.set(example.taskType, existing);
    }
  }

  getSystemPrompt(name: string, vars: Record<string, string> = {}): string {
    const versions = this.templates.get(name);
    if (!versions || versions.length === 0) {
      logger.warn(`No system prompt found for: ${name}`);
      return '';
    }
    // Return latest version
    const latest = versions[versions.length - 1];
    return latest.render(vars);
  }

  addTemplate(name: string, template: string, version?: number): void {
    const versions = this.templates.get(name) ?? [];
    const v = version ?? (versions.length > 0 ? versions[versions.length - 1].version + 1 : 1);
    versions.push(new PromptTemplate(name, template, v));
    this.templates.set(name, versions);
    logger.info(`Added prompt template: ${name} v${v}`);
  }

  getTemplateVersion(name: string, version: number): PromptTemplate | undefined {
    const versions = this.templates.get(name);
    return versions?.find((t) => t.version === version);
  }

  getFewShotExamples(taskType: string): LLMMessage[] {
    const examples = this.fewShotExamples.get(taskType);
    if (!examples || examples.length === 0) return [];
    return examples[0].messages;
  }

  buildMessages(opts: {
    systemPromptName: string;
    systemVars?: Record<string, string>;
    fewShotTaskType?: string;
    userMessages: LLMMessage[];
    maxTokens?: number;
  }): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // System prompt
    const systemContent = this.getSystemPrompt(opts.systemPromptName, opts.systemVars ?? {});
    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    // Few-shot examples
    if (opts.fewShotTaskType) {
      const examples = this.getFewShotExamples(opts.fewShotTaskType);
      messages.push(...examples);
    }

    // User messages
    messages.push(...opts.userMessages);

    // Truncate if needed
    const maxTokens = opts.maxTokens ?? config.memoryMaxContextTokens;
    return truncateMessages(messages, maxTokens);
  }
}

export const promptManager = new PromptManager();
