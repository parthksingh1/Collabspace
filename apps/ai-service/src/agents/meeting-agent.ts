import { BaseAgent, AgentContext, AgentResult } from './base-agent.js';
import { TaskType } from '../gateway/ai-router.js';

const MEETING_SYSTEM_PROMPT = `You are an expert meeting facilitator and note taker. You transform unstructured discussions into clear, actionable meeting notes.

Your responsibilities:
1. Identify key discussion topics and themes.
2. Extract all decisions made during the meeting.
3. Identify action items with owners and deadlines.
4. Note open questions and unresolved issues.
5. Summarize each participant's main contributions.
6. Detect sentiment and potential conflicts.

Meeting notes structure:
{
  "title": "Meeting title/topic",
  "date": "ISO date string",
  "participants": ["Name/ID list"],
  "duration": "Estimated duration",
  "summary": "1-2 paragraph executive summary",
  "topics": [
    {
      "title": "Topic discussed",
      "summary": "Key points",
      "decisions": ["Decisions made"],
      "openQuestions": ["Unresolved questions"]
    }
  ],
  "actionItems": [
    {
      "description": "What needs to be done",
      "owner": "Person responsible",
      "deadline": "Due date if mentioned",
      "priority": "high/medium/low"
    }
  ],
  "keyDecisions": ["Major decisions with context"],
  "nextSteps": ["Agreed next steps"],
  "followUp": "When/how to follow up"
}

After extracting meeting notes:
- Create tasks for each action item using the manage_tasks tool.
- Send notifications to action item owners.
- Reference any existing documents mentioned in the meeting.`;

export class MeetingAgent extends BaseAgent {
  readonly name = 'Meeting Agent';
  readonly type = 'meeting';
  readonly capabilities = [
    'summarize_discussions',
    'extract_action_items',
    'generate_meeting_notes',
    'identify_decisions',
    'track_follow_ups',
  ];
  protected readonly systemPrompt = MEETING_SYSTEM_PROMPT;
  protected readonly taskType: TaskType = 'complex_reasoning';

  constructor(id: string) {
    super(id);
  }

  async run(goal: string, context: AgentContext): Promise<AgentResult> {
    const enrichedGoal = `Process the following meeting transcript or discussion:

${goal}

Steps:
1. Analyze the transcript to identify speakers, topics, and flow.
2. Extract all action items, decisions, and open questions.
3. Search for any referenced documents or tasks using available tools.
4. Create tasks for each action item using the manage_tasks tool.
5. Send notifications to action item owners using the send_notification tool.
6. Generate comprehensive, well-structured meeting notes.

Begin by analyzing the content and identifying key elements.`;

    return super.run(enrichedGoal, context);
  }

  protected observe(result: string): string {
    // Track created tasks and sent notifications
    try {
      const cleaned = result.replace(/^Tool \w+ (succeeded|failed): /, '');
      const data = JSON.parse(cleaned);

      if (data?.notificationId) {
        return `Notification sent successfully (ID: ${data.notificationId}, delivered to ${data.deliveredTo} recipients)`;
      }

      if (data?.id && data?.title) {
        return `Task created: "${data.title}" (ID: ${data.id}, status: ${data.status ?? 'todo'})`;
      }

      if (data?.created) {
        return `Bulk operation: ${data.totalCreated}/${data.totalRequested} items created successfully`;
      }
    } catch {
      // Not JSON, return as-is
    }

    return result;
  }
}
