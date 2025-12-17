import { BaseAgent, AgentContext, AgentResult } from './base-agent.js';
import { TaskType } from '../gateway/ai-router.js';

const KNOWLEDGE_SYSTEM_PROMPT = `You are an expert researcher and knowledge curator for a software development team. You provide comprehensive, accurate, and well-sourced answers.

Your responsibilities:
1. Answer questions thoroughly using all available information sources.
2. Search the workspace codebase and documents for relevant context.
3. Search the web for supplementary information when needed.
4. Synthesize information from multiple sources into clear answers.
5. Maintain accuracy — clearly distinguish between facts and inferences.

Answer structure:
1. **Direct Answer** — Answer the question concisely first.
2. **Details** — Provide relevant context and explanation.
3. **Sources** — List where you found the information (files, documents, URLs).
4. **Related** — Suggest related topics or follow-up questions.
5. **Caveats** — Note any limitations, uncertainties, or assumptions.

Guidelines:
- Always search the codebase first for project-specific questions.
- Use web search for general programming questions, library docs, etc.
- If the information is not available, say so clearly.
- Quote relevant code snippets when they help answer the question.
- For "how to" questions, provide step-by-step instructions.
- For architectural questions, explain trade-offs and alternatives.`;

export class KnowledgeAgent extends BaseAgent {
  readonly name = 'Knowledge Agent';
  readonly type = 'knowledge';
  readonly capabilities = [
    'answer_questions',
    'find_information',
    'explain_concepts',
    'search_codebase',
    'search_web',
    'curate_knowledge',
  ];
  protected readonly systemPrompt = KNOWLEDGE_SYSTEM_PROMPT;
  protected readonly taskType: TaskType = 'complex_reasoning';

  constructor(id: string) {
    super(id);
  }

  async run(goal: string, context: AgentContext): Promise<AgentResult> {
    const enrichedGoal = `Answer the following question or research the following topic:

${goal}

Steps:
1. Determine whether this is a project-specific question or a general question.
2. For project-specific questions: search the codebase and documents first.
3. For general questions: search the web and combine with project context.
4. Synthesize all findings into a comprehensive answer.
5. Cite your sources and suggest related topics.

Begin by determining the question type and searching the most relevant source.`;

    return super.run(enrichedGoal, context);
  }

  protected observe(result: string): string {
    // Format search results into a more readable format
    try {
      const cleaned = result.replace(/^Tool \w+ succeeded: /, '');
      const data = JSON.parse(cleaned);

      if (data?.results && Array.isArray(data.results)) {
        const source = data.query ? `Search: "${data.query}"` : 'Search results';
        const items = data.results.slice(0, 8).map((r: Record<string, unknown>) => {
          const title = r.title ?? r.filePath ?? 'Untitled';
          const content = (r.content ?? r.snippet ?? r.excerpt ?? '').toString().slice(0, 300);
          const url = r.url ?? '';
          return `- **${title}**${url ? ` (${url})` : ''}\n  ${content}`;
        });

        return `${source} — ${data.total ?? data.results.length} results:\n\n${items.join('\n\n')}`;
      }

      if (data?.content && data?.title) {
        return `Document: "${data.title}"\n\n${data.content.slice(0, 3000)}`;
      }
    } catch {
      // Not JSON
    }

    return result;
  }
}
