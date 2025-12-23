import { Router, Request, Response } from 'express';
import { AgentOrchestrator } from '../agents/orchestrator';
import { logger } from '../utils/logger';

const router = Router();
const orchestrator = new AgentOrchestrator();

// POST /ai/agents/run — Execute an agent with a goal
router.post('/run', async (req: Request, res: Response) => {
  try {
    const { type, goal, context } = req.body;
    const userId = req.headers['x-user-id'] as string;

    if (!type || !goal) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'type and goal are required' } });
    }

    const validTypes = ['planner', 'developer', 'reviewer', 'meeting', 'knowledge', 'execution'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Invalid agent type. Must be one of: ${validTypes.join(', ')}` } });
    }

    const execution = await orchestrator.executeAgent(type, goal, { ...context, userId });

    res.status(201).json({
      success: true,
      data: {
        id: execution.id,
        agentType: type,
        goal,
        status: execution.status,
        steps: execution.steps,
        result: execution.result,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
      },
    });
  } catch (error) {
    logger.error('Agent execution failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: { code: 'AGENT_ERROR', message: (error as Error).message } });
  }
});

// GET /ai/agents/:executionId — Get agent execution status
router.get('/:executionId', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const execution = orchestrator.getExecutionStatus(executionId);

    if (!execution) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Execution not found' } });
    }

    res.json({ success: true, data: execution });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

// POST /ai/agents/:executionId/cancel — Cancel running agent
router.post('/:executionId/cancel', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    const cancelled = orchestrator.cancelExecution(executionId);

    if (!cancelled) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Execution not found or already completed' } });
    }

    res.json({ success: true, data: { id: executionId, status: 'cancelled' } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

// GET /ai/agents/history — Get agent execution history
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const history = orchestrator.getExecutionHistory({ limit, offset });
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

// POST /ai/agents/plan — Run planner agent for sprint planning
router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { projectId, goal, context } = req.body;
    const userId = req.headers['x-user-id'] as string;

    const execution = await orchestrator.executeAgent('planner', goal || `Plan sprint for project ${projectId}`, {
      ...context, userId, projectId,
    });

    res.status(201).json({ success: true, data: execution });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'AGENT_ERROR', message: (error as Error).message } });
  }
});

// POST /ai/agents/review — Run reviewer agent
router.post('/review', async (req: Request, res: Response) => {
  try {
    const { content, contentType, context } = req.body;
    const userId = req.headers['x-user-id'] as string;

    const execution = await orchestrator.executeAgent('reviewer', `Review ${contentType}: ${content.substring(0, 200)}`, {
      ...context, userId, content, contentType,
    });

    res.status(201).json({ success: true, data: execution });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'AGENT_ERROR', message: (error as Error).message } });
  }
});

// POST /ai/agents/develop — Run developer agent
router.post('/develop', async (req: Request, res: Response) => {
  try {
    const { description, language, context } = req.body;
    const userId = req.headers['x-user-id'] as string;

    const execution = await orchestrator.executeAgent('developer', description, {
      ...context, userId, language,
    });

    res.status(201).json({ success: true, data: execution });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'AGENT_ERROR', message: (error as Error).message } });
  }
});

export { router as agentRoutes };
