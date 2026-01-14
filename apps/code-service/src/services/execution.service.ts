import { query } from '../utils/db.js';
import { getRedis } from '../utils/redis.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { SandboxManager, type SupportedLanguage } from './sandbox-manager.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExecutionRequest {
  fileId?: string;
  userId: string;
  language: string;
  code: string;
  stdin?: string;
}

export interface ExecutionResult {
  id: string;
  fileId: string | null;
  userId: string;
  language: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTimeMs: number;
  memoryUsedBytes: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'timeout';
  createdAt: string;
}

interface ExecutionRow {
  id: string;
  file_id: string | null;
  user_id: string;
  language: string;
  code: string;
  stdin: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  execution_time_ms: number | null;
  memory_used_bytes: number | null;
  status: string;
  created_at: Date;
}

interface QueuedJob {
  executionId: string;
  request: ExecutionRequest;
  resolve: (result: ExecutionResult) => void;
  reject: (error: Error) => void;
}

// ─��� Execution Service ─────────────────────────────────────────────────────────

export class ExecutionService {
  private sandboxManager: SandboxManager;
  private queue: QueuedJob[] = [];
  private activeCount = 0;
  private isProcessing = false;

  constructor(sandboxManager: SandboxManager) {
    this.sandboxManager = sandboxManager;
  }

  // ── Execute code ──────────────────────────────────────────────────────────

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const { language, code, userId, fileId, stdin } = request;

    // Validate language
    if (!this.sandboxManager.isSupported(language)) {
      throw Object.assign(
        new Error(`Unsupported language: ${language}. Supported: ${this.sandboxManager.getSupportedLanguages().join(', ')}`),
        { statusCode: 400, code: 'UNSUPPORTED_LANGUAGE' },
      );
    }

    // Validate code size (max 1MB)
    if (code.length > 1_000_000) {
      throw Object.assign(
        new Error('Code exceeds maximum size of 1MB'),
        { statusCode: 400, code: 'CODE_TOO_LARGE' },
      );
    }

    // Create execution record
    const insertResult = await query<ExecutionRow>(
      `INSERT INTO code_executions (file_id, user_id, language, code, stdin, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [fileId ?? null, userId, language, code, stdin ?? ''],
    );

    const executionId = insertResult.rows[0]!.id;

    // Check concurrent execution limit
    if (this.activeCount >= config.maxConcurrentExecutions) {
      logger.info('Execution queued', { executionId, queueSize: this.queue.length + 1 });

      return new Promise<ExecutionResult>((resolve, reject) => {
        this.queue.push({ executionId, request, resolve, reject });
        this.processQueue();
      });
    }

    return this.runExecution(executionId, request);
  }

  // ── Get execution result ──────────────────────────────────────────────────

  async getExecution(executionId: string): Promise<ExecutionResult | null> {
    // Try cache first
    const redis = getRedis();
    const cached = await redis.get(`exec:${executionId}`);
    if (cached) {
      try {
        return JSON.parse(cached) as ExecutionResult;
      } catch {
        // fall through
      }
    }

    const result = await query<ExecutionRow>(
      `SELECT * FROM code_executions WHERE id = $1`,
      [executionId],
    );

    if (result.rows.length === 0) return null;
    return this.rowToResult(result.rows[0]!);
  }

  // ── Get execution history ─────────────────────────────────────────────────

  async getExecutionHistory(
    userId: string,
    options: { fileId?: string; limit?: number; offset?: number } = {},
  ): Promise<ExecutionResult[]> {
    const { fileId, limit = 20, offset = 0 } = options;

    let queryText: string;
    let params: unknown[];

    if (fileId) {
      queryText = `SELECT * FROM code_executions
        WHERE user_id = $1 AND file_id = $2
        ORDER BY created_at DESC LIMIT $3 OFFSET $4`;
      params = [userId, fileId, limit, offset];
    } else {
      queryText = `SELECT * FROM code_executions
        WHERE user_id = $1
        ORDER BY created_at DESC LIMIT $2 OFFSET $3`;
      params = [userId, limit, offset];
    }

    const result = await query<ExecutionRow>(queryText, params);
    return result.rows.map((r) => this.rowToResult(r));
  }

  // ── Internal execution ────────────────────────────────────────────────────

  private async runExecution(
    executionId: string,
    request: ExecutionRequest,
  ): Promise<ExecutionResult> {
    this.activeCount++;

    try {
      // Update status to running
      await query(
        `UPDATE code_executions SET status = 'running' WHERE id = $1`,
        [executionId],
      );

      const { language, code, stdin } = request;

      logger.info('Starting code execution', {
        executionId,
        language,
        codeSize: code.length,
      });

      // Create and run container
      const { container } = await this.sandboxManager.createContainer(
        language as SupportedLanguage,
        code,
        stdin ?? '',
      );

      try {
        const result = await this.sandboxManager.executeInContainer(
          container,
          config.executionTimeoutMs,
        );

        const status = result.timedOut
          ? 'timeout'
          : result.exitCode === 0
            ? 'completed'
            : 'failed';

        // Update DB record
        const updateResult = await query<ExecutionRow>(
          `UPDATE code_executions
           SET stdout = $1, stderr = $2, exit_code = $3,
               execution_time_ms = $4, memory_used_bytes = $5, status = $6
           WHERE id = $7
           RETURNING *`,
          [
            result.stdout,
            result.stderr,
            result.exitCode,
            result.executionTimeMs,
            result.memoryUsedBytes,
            status,
            executionId,
          ],
        );

        const executionResult = this.rowToResult(updateResult.rows[0]!);

        // Cache result (5 minute TTL)
        const redis = getRedis();
        await redis.setex(`exec:${executionId}`, 300, JSON.stringify(executionResult));

        logger.info('Code execution completed', {
          executionId,
          status,
          exitCode: result.exitCode,
          executionTimeMs: result.executionTimeMs,
          timedOut: result.timedOut,
        });

        return executionResult;
      } finally {
        // Always clean up container
        await this.sandboxManager.removeContainer(container);
      }
    } catch (err) {
      logger.error('Code execution failed', {
        executionId,
        error: (err as Error).message,
      });

      // Update status to failed
      await query(
        `UPDATE code_executions
         SET status = 'failed', stderr = $1
         WHERE id = $2`,
        [(err as Error).message, executionId],
      );

      const failedResult = await this.getExecution(executionId);
      if (failedResult) return failedResult;

      throw err;
    } finally {
      this.activeCount--;
      this.processQueue();
    }
  }

  // ── Queue processing ──────────────────────────────────────────────────────

  private processQueue(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && this.activeCount < config.maxConcurrentExecutions) {
      const job = this.queue.shift()!;
      this.runExecution(job.executionId, job.request)
        .then(job.resolve)
        .catch(job.reject);
    }

    this.isProcessing = false;
  }

  // ── Stream execution output ───────────────────────────────────────────────

  async streamExecution(
    executionId: string,
    onOutput: (stream: 'stdout' | 'stderr', data: string) => void,
  ): Promise<ExecutionResult | null> {
    const redis = getRedis();
    const channelStdout = `exec:${executionId}:stdout`;
    const channelStderr = `exec:${executionId}:stderr`;

    // Subscribe to output channels
    const sub = redis.duplicate();
    await sub.subscribe(channelStdout, channelStderr);

    sub.on('message', (channel: string, message: string) => {
      if (channel === channelStdout) {
        onOutput('stdout', message);
      } else if (channel === channelStderr) {
        onOutput('stderr', message);
      }
    });

    // Wait for completion
    return new Promise<ExecutionResult | null>((resolve) => {
      const checkInterval = setInterval(async () => {
        const result = await this.getExecution(executionId);
        if (result && result.status !== 'pending' && result.status !== 'running') {
          clearInterval(checkInterval);
          await sub.unsubscribe();
          sub.disconnect();
          resolve(result);
        }
      }, 500);

      // Timeout after max execution time + buffer
      setTimeout(async () => {
        clearInterval(checkInterval);
        await sub.unsubscribe();
        sub.disconnect();
        resolve(await this.getExecution(executionId));
      }, config.executionTimeoutMs + 5000);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private rowToResult(row: ExecutionRow): ExecutionResult {
    return {
      id: row.id,
      fileId: row.file_id,
      userId: row.user_id,
      language: row.language,
      stdout: row.stdout,
      stderr: row.stderr,
      exitCode: row.exit_code ?? 1,
      executionTimeMs: row.execution_time_ms ?? 0,
      memoryUsedBytes: Number(row.memory_used_bytes ?? 0),
      status: row.status as ExecutionResult['status'],
      createdAt: row.created_at.toISOString(),
    };
  }
}
