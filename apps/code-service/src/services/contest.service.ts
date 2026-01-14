import { query, getClient } from '../utils/db.js';
import { getRedis } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { ExecutionService } from './execution.service.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Problem {
  title: string;
  description: string;
  examples: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  testCases: Array<{
    input: string;
    expectedOutput: string;
    isHidden: boolean;
    timeLimit?: number;
  }>;
  constraints: string[];
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface CreateRoomInput {
  name: string;
  description?: string;
  workspaceId: string;
  problem: Problem;
  timeLimitMinutes: number;
}

export interface CodingRoomRow {
  id: string;
  name: string;
  description: string | null;
  workspace_id: string;
  owner_id: string;
  problem: Problem;
  time_limit_minutes: number;
  status: 'waiting' | 'active' | 'finished';
  started_at: Date | null;
  ended_at: Date | null;
  created_at: Date;
}

export interface CodingRoom {
  id: string;
  name: string;
  description: string | null;
  workspaceId: string;
  ownerId: string;
  problem: Problem;
  timeLimitMinutes: number;
  status: 'waiting' | 'active' | 'finished';
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  participants?: Participant[];
}

export interface Participant {
  userId: string;
  joinedAt: string;
}

export interface SubmissionInput {
  roomId: string;
  userId: string;
  code: string;
  language: string;
}

export interface TestResult {
  input: string;
  expected: string;
  actual: string;
  passed: boolean;
  executionTimeMs: number;
  isHidden: boolean;
}

export interface SubmissionRow {
  id: string;
  room_id: string;
  user_id: string;
  code: string;
  language: string;
  test_results: TestResult[] | null;
  score: number;
  submitted_at: Date;
}

export interface Submission {
  id: string;
  roomId: string;
  userId: string;
  code: string;
  language: string;
  testResults: TestResult[] | null;
  score: number;
  submittedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  bestScore: number;
  totalSubmissions: number;
  bestTime: number; // fastest execution time
  lastSubmittedAt: string;
}

// ── Contest Service ───────────────────────────────────────────────────────────

export class ContestService {
  private executionService: ExecutionService;
  private roomTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(executionService: ExecutionService) {
    this.executionService = executionService;
  }

  // ── Room management ───────────────────────────────────────────────────────

  async createRoom(data: CreateRoomInput, userId: string): Promise<CodingRoom> {
    const result = await query<CodingRoomRow>(
      `INSERT INTO coding_rooms (name, description, workspace_id, owner_id, problem, time_limit_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.name,
        data.description ?? null,
        data.workspaceId,
        userId,
        JSON.stringify(data.problem),
        data.timeLimitMinutes,
      ],
    );

    const room = this.rowToRoom(result.rows[0]!);

    // Auto-add creator as participant
    await this.joinRoom(room.id, userId);

    logger.info('Coding room created', { roomId: room.id, userId, name: data.name });
    return room;
  }

  async getRoom(roomId: string): Promise<CodingRoom | null> {
    const result = await query<CodingRoomRow>(
      `SELECT * FROM coding_rooms WHERE id = $1`,
      [roomId],
    );

    if (result.rows.length === 0) return null;

    const room = this.rowToRoom(result.rows[0]!);

    // Fetch participants
    const participantResult = await query<{ user_id: string; joined_at: Date }>(
      `SELECT user_id, joined_at FROM room_participants WHERE room_id = $1`,
      [roomId],
    );

    room.participants = participantResult.rows.map((p) => ({
      userId: p.user_id,
      joinedAt: p.joined_at.toISOString(),
    }));

    return room;
  }

  async joinRoom(roomId: string, userId: string): Promise<void> {
    await query(
      `INSERT INTO room_participants (room_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [roomId, userId],
    );

    logger.info('User joined coding room', { roomId, userId });
  }

  async startRoom(roomId: string, userId: string): Promise<CodingRoom | null> {
    const result = await query<CodingRoomRow>(
      `UPDATE coding_rooms
       SET status = 'active', started_at = NOW()
       WHERE id = $1 AND owner_id = $2 AND status = 'waiting'
       RETURNING *`,
      [roomId, userId],
    );

    if (result.rows.length === 0) return null;

    const room = this.rowToRoom(result.rows[0]!);

    // Set auto-finish timer
    const timeLimitMs = room.timeLimitMinutes * 60 * 1000;
    const timer = setTimeout(() => {
      this.finishRoom(roomId).catch((err) => {
        logger.error('Failed to auto-finish room', { roomId, error: (err as Error).message });
      });
    }, timeLimitMs);

    this.roomTimers.set(roomId, timer);

    // Store end time in Redis for real-time countdown
    const redis = getRedis();
    const endsAt = new Date(Date.now() + timeLimitMs).toISOString();
    await redis.setex(`contest:${roomId}:endsAt`, Math.ceil(timeLimitMs / 1000), endsAt);

    logger.info('Coding room started', { roomId, timeLimitMinutes: room.timeLimitMinutes });
    return room;
  }

  async finishRoom(roomId: string): Promise<CodingRoom | null> {
    const result = await query<CodingRoomRow>(
      `UPDATE coding_rooms
       SET status = 'finished', ended_at = NOW()
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [roomId],
    );

    if (result.rows.length === 0) return null;

    // Clear timer
    const timer = this.roomTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.roomTimers.delete(roomId);
    }

    const redis = getRedis();
    await redis.del(`contest:${roomId}:endsAt`);

    logger.info('Coding room finished', { roomId });
    return this.rowToRoom(result.rows[0]!);
  }

  // ── Submission and grading ────────────────────────────────────────────────

  async submitSolution(input: SubmissionInput): Promise<Submission> {
    const { roomId, userId, code, language } = input;

    // Verify room is active
    const room = await this.getRoom(roomId);
    if (!room) {
      throw Object.assign(new Error('Coding room not found'), { statusCode: 404, code: 'ROOM_NOT_FOUND' });
    }
    if (room.status !== 'active') {
      throw Object.assign(
        new Error('Coding room is not active'),
        { statusCode: 400, code: 'ROOM_NOT_ACTIVE' },
      );
    }

    // Run test cases
    const testResults = await this.gradeSubmission(code, language, room.problem);

    // Calculate score
    const totalTests = testResults.length;
    const passedTests = testResults.filter((t) => t.passed).length;
    const score = Math.round((passedTests / totalTests) * 100);

    // Save submission
    const result = await query<SubmissionRow>(
      `INSERT INTO submissions (room_id, user_id, code, language, test_results, score)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [roomId, userId, code, language, JSON.stringify(testResults), score],
    );

    const submission = this.rowToSubmission(result.rows[0]!);

    // Update leaderboard in Redis
    const redis = getRedis();
    await redis.zadd(
      `contest:${roomId}:leaderboard`,
      score,
      JSON.stringify({
        userId,
        score,
        submittedAt: submission.submittedAt,
      }),
    );

    logger.info('Solution submitted', {
      roomId,
      userId,
      score,
      passed: passedTests,
      total: totalTests,
    });

    return submission;
  }

  private async gradeSubmission(
    code: string,
    language: string,
    problem: Problem,
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const testCase of problem.testCases) {
      try {
        const execution = await this.executionService.execute({
          userId: 'grader',
          language,
          code,
          stdin: testCase.input,
        });

        const actualOutput = execution.stdout.trim();
        const expectedOutput = testCase.expectedOutput.trim();
        const passed = actualOutput === expectedOutput;

        results.push({
          input: testCase.input,
          expected: testCase.expectedOutput,
          actual: actualOutput,
          passed,
          executionTimeMs: execution.executionTimeMs,
          isHidden: testCase.isHidden,
        });
      } catch (err) {
        results.push({
          input: testCase.input,
          expected: testCase.expectedOutput,
          actual: `Execution error: ${(err as Error).message}`,
          passed: false,
          executionTimeMs: 0,
          isHidden: testCase.isHidden,
        });
      }
    }

    return results;
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────

  async getLeaderboard(roomId: string): Promise<LeaderboardEntry[]> {
    // Get all submissions grouped by user, with best score
    const result = await query<{
      user_id: string;
      best_score: number;
      total_submissions: number;
      best_time: number;
      last_submitted_at: Date;
    }>(
      `SELECT
         user_id,
         MAX(score) as best_score,
         COUNT(*)::int as total_submissions,
         MIN(
           CASE WHEN score = (SELECT MAX(score) FROM submissions s2 WHERE s2.room_id = submissions.room_id AND s2.user_id = submissions.user_id)
           THEN EXTRACT(EPOCH FROM (submitted_at - (SELECT started_at FROM coding_rooms WHERE id = submissions.room_id))) * 1000
           ELSE NULL END
         )::int as best_time,
         MAX(submitted_at) as last_submitted_at
       FROM submissions
       WHERE room_id = $1
       GROUP BY user_id
       ORDER BY best_score DESC, best_time ASC`,
      [roomId],
    );

    return result.rows.map((row, index) => ({
      rank: index + 1,
      userId: row.user_id,
      bestScore: row.best_score,
      totalSubmissions: row.total_submissions,
      bestTime: row.best_time ?? 0,
      lastSubmittedAt: row.last_submitted_at.toISOString(),
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private rowToRoom(row: CodingRoomRow): CodingRoom {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      workspaceId: row.workspace_id,
      ownerId: row.owner_id,
      problem: row.problem,
      timeLimitMinutes: row.time_limit_minutes,
      status: row.status,
      startedAt: row.started_at?.toISOString() ?? null,
      endedAt: row.ended_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
    };
  }

  private rowToSubmission(row: SubmissionRow): Submission {
    return {
      id: row.id,
      roomId: row.room_id,
      userId: row.user_id,
      code: row.code,
      language: row.language,
      testResults: row.test_results,
      score: row.score,
      submittedAt: row.submitted_at.toISOString(),
    };
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────

  shutdown(): void {
    for (const [roomId, timer] of this.roomTimers) {
      clearTimeout(timer);
    }
    this.roomTimers.clear();
  }
}
