import { Router, Request, Response } from 'express';
import { CodeService } from '../services/code.service';
import { ExecutionService } from '../services/execution.service';
import { ContestService } from '../services/contest.service';
import { logger } from '../utils/logger';

const router = Router();
const codeService = new CodeService();
const executionService = new ExecutionService();
const contestService = new ContestService();

// ─── File CRUD ───

router.post('/files', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { name, language, workspaceId, content, parentFolderId, isFolder } = req.body;

    if (!name || !workspaceId) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name and workspaceId required' } });
    }

    const file = await codeService.createFile({
      name, language: language || 'javascript', workspaceId, content: content || '',
      ownerId: userId, parentFolderId, isFolder: isFolder || false,
    });

    res.status(201).json({ success: true, data: file });
  } catch (error) {
    logger.error('Create file failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

router.get('/files', async (req: Request, res: Response) => {
  try {
    const { workspaceId, parentFolderId, language } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;

    const files = await codeService.listFiles({
      workspaceId: workspaceId as string,
      parentFolderId: parentFolderId as string,
      language: language as string,
      page, pageSize,
    });

    res.json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

router.get('/files/:id', async (req: Request, res: Response) => {
  try {
    const file = await codeService.getFile(req.params.id);
    if (!file) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
    }
    res.json({ success: true, data: file });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

router.put('/files/:id', async (req: Request, res: Response) => {
  try {
    const file = await codeService.updateFile(req.params.id, req.body);
    res.json({ success: true, data: file });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

router.delete('/files/:id', async (req: Request, res: Response) => {
  try {
    await codeService.deleteFile(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

// ─── Code Execution ───

router.post('/execute', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { code, language, stdin, fileId } = req.body;

    if (!code || !language) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'code and language required' } });
    }

    const supportedLanguages = ['javascript', 'typescript', 'python', 'java', 'cpp', 'go', 'rust'];
    if (!supportedLanguages.includes(language)) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Unsupported language. Supported: ${supportedLanguages.join(', ')}` } });
    }

    const result = await executionService.execute({ code, language, stdin: stdin || '', userId, fileId });
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Execution failed', { error: (error as Error).message });
    res.status(500).json({ success: false, error: { code: 'EXECUTION_ERROR', message: (error as Error).message } });
  }
});

router.get('/execute/:executionId', async (req: Request, res: Response) => {
  try {
    const result = await executionService.getResult(req.params.executionId);
    if (!result) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Execution not found' } });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

// ─── Coding Rooms (Contest Mode) ───

router.post('/rooms', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { name, description, workspaceId, problem, timeLimitMinutes } = req.body;

    const room = await contestService.createRoom({
      name, description, workspaceId, ownerId: userId,
      problem, timeLimitMinutes: timeLimitMinutes || 60,
    });

    res.status(201).json({ success: true, data: room });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

router.get('/rooms', async (req: Request, res: Response) => {
  try {
    const { workspaceId, status } = req.query;
    const rooms = await contestService.listRooms(workspaceId as string, status as string);
    res.json({ success: true, data: rooms });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

router.get('/rooms/:id', async (req: Request, res: Response) => {
  try {
    const room = await contestService.getRoom(req.params.id);
    if (!room) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Room not found' } });
    }
    res.json({ success: true, data: room });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

router.post('/rooms/:id/start', async (req: Request, res: Response) => {
  try {
    const room = await contestService.startRoom(req.params.id);
    res.json({ success: true, data: room });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

router.post('/rooms/:id/submit', async (req: Request, res: Response) => {
  try {
    const userId = req.headers['x-user-id'] as string;
    const { code, language } = req.body;

    const submission = await contestService.submitSolution(req.params.id, userId, code, language);
    res.status(201).json({ success: true, data: submission });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SUBMISSION_ERROR', message: (error as Error).message } });
  }
});

router.get('/rooms/:id/leaderboard', async (req: Request, res: Response) => {
  try {
    const leaderboard = await contestService.getLeaderboard(req.params.id);
    res.json({ success: true, data: leaderboard });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: (error as Error).message } });
  }
});

export { router as codeRoutes };
