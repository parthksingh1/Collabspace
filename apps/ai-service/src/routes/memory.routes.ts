import { Router, Request, Response } from 'express';
import { AIMemoryManager } from '../memory/memory-manager';
import { logger } from '../utils/logger';

const router = Router();
const memoryManager = new AIMemoryManager();

// POST /ai/memory/store — Store a memory
router.post('/store', async (req: Request, res: Response) => {
  try {
    const { content, metadata, workspaceId, memoryType } = req.body;
    const userId = req.headers['x-user-id'] as string;

    if (!content) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'content is required' } });
    }

    const memoryId = await memoryManager.storeLongTerm(content, {
      ...metadata,
      userId,
      workspaceId,
      memoryType: memoryType || 'knowledge',
      storedAt: Date.now(),
    });

    res.status(201).json({ success: true, data: { id: memoryId } });
  } catch (error) {
    logger.error('Failed to store memory', { error: (error as Error).message });
    res.status(500).json({ success: false, error: { code: 'MEMORY_ERROR', message: (error as Error).message } });
  }
});

// POST /ai/memory/recall — Recall relevant memories
router.post('/recall', async (req: Request, res: Response) => {
  try {
    const { query, topK, workspaceId, filters } = req.body;

    if (!query) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'query is required' } });
    }

    const memories = await memoryManager.recallLongTerm(query, topK || 5, {
      workspaceId,
      ...filters,
    });

    res.json({ success: true, data: memories });
  } catch (error) {
    logger.error('Failed to recall memory', { error: (error as Error).message });
    res.status(500).json({ success: false, error: { code: 'MEMORY_ERROR', message: (error as Error).message } });
  }
});

// DELETE /ai/memory/:id — Forget a memory
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await memoryManager.forgetLongTerm(id);
    res.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'MEMORY_ERROR', message: (error as Error).message } });
  }
});

// GET /ai/memory/context/:workspaceId — Get workspace context
router.get('/context/:workspaceId', async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const context = await memoryManager.getWorkspaceContext(workspaceId);
    res.json({ success: true, data: context });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'MEMORY_ERROR', message: (error as Error).message } });
  }
});

export { router as memoryRoutes };
