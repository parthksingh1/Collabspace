import { logger } from '../utils/logger.js';
import { aiRouter } from '../gateway/ai-router.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CursorPosition {
  userId: string;
  filePath: string;
  line: number;
  column: number;
  timestamp: number;
}

export interface EditEvent {
  userId: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  content: string;
  timestamp: number;
}

export interface ConflictPrediction {
  severity: 'low' | 'medium' | 'high';
  filePath: string;
  region: { lineStart: number; lineEnd: number };
  users: string[];
  message: string;
  suggestedResolution: string;
  confidence: number;
  predictedAt: number;
}

// ---------------------------------------------------------------------------
// Conflict Predictor
// ---------------------------------------------------------------------------

export class ConflictPredictor {
  private cursorHistory: Map<string, CursorPosition[]> = new Map(); // userId -> positions
  private editHistory: Map<string, EditEvent[]> = new Map(); // filePath -> edits
  private activeSessions: Map<string, { filePath: string; lastActive: number }> = new Map(); // userId -> session
  private predictions: ConflictPrediction[] = [];

  // -----------------------------------------------------------------------
  // Tracking
  // -----------------------------------------------------------------------

  trackCursor(position: CursorPosition): void {
    const history = this.cursorHistory.get(position.userId) ?? [];
    history.push(position);

    // Keep last 100 positions per user
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    this.cursorHistory.set(position.userId, history);
    this.activeSessions.set(position.userId, {
      filePath: position.filePath,
      lastActive: position.timestamp,
    });

    // Check for potential conflicts after each cursor update
    this.checkForConflicts(position);
  }

  trackEdit(edit: EditEvent): void {
    const history = this.editHistory.get(edit.filePath) ?? [];
    history.push(edit);

    // Keep last 200 edits per file
    if (history.length > 200) {
      history.splice(0, history.length - 200);
    }

    this.editHistory.set(edit.filePath, history);
    this.checkEditConflicts(edit);
  }

  // -----------------------------------------------------------------------
  // Conflict detection
  // -----------------------------------------------------------------------

  private checkForConflicts(position: CursorPosition): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    // Find other active users in the same file
    const sameFileUsers: string[] = [];
    for (const [userId, session] of this.activeSessions) {
      if (
        userId !== position.userId &&
        session.filePath === position.filePath &&
        now - session.lastActive < staleThreshold
      ) {
        sameFileUsers.push(userId);
      }
    }

    if (sameFileUsers.length === 0) return;

    // Check if cursors are near each other (within 10 lines)
    const proximityThreshold = 10;

    for (const otherUserId of sameFileUsers) {
      const otherHistory = this.cursorHistory.get(otherUserId) ?? [];
      const otherRecent = otherHistory
        .filter((p) => p.filePath === position.filePath && now - p.timestamp < staleThreshold)
        .pop();

      if (!otherRecent) continue;

      const distance = Math.abs(position.line - otherRecent.line);

      if (distance <= proximityThreshold) {
        const severity: ConflictPrediction['severity'] =
          distance <= 2 ? 'high' : distance <= 5 ? 'medium' : 'low';

        const existingPrediction = this.predictions.find(
          (p) =>
            p.filePath === position.filePath &&
            p.users.includes(position.userId) &&
            p.users.includes(otherUserId) &&
            now - p.predictedAt < 30_000, // Deduplicate within 30 seconds
        );

        if (existingPrediction) continue;

        const prediction: ConflictPrediction = {
          severity,
          filePath: position.filePath,
          region: {
            lineStart: Math.min(position.line, otherRecent.line),
            lineEnd: Math.max(position.line, otherRecent.line),
          },
          users: [position.userId, otherUserId],
          message: `Users are editing nearby lines (${distance} lines apart) in ${position.filePath}`,
          suggestedResolution:
            severity === 'high'
              ? 'Consider coordinating edits — you are modifying the same code section.'
              : 'Different users are working in the same area. Stay aware of potential merge conflicts.',
          confidence: Math.max(0.3, 1 - distance / proximityThreshold),
          predictedAt: now,
        };

        this.predictions.push(prediction);

        // Keep predictions manageable
        if (this.predictions.length > 500) {
          this.predictions = this.predictions.slice(-250);
        }

        logger.info('Conflict predicted', {
          severity,
          filePath: position.filePath,
          users: prediction.users,
          distance,
        });
      }
    }
  }

  private checkEditConflicts(edit: EditEvent): void {
    const now = Date.now();
    const recentWindow = 60_000; // 1 minute
    const history = this.editHistory.get(edit.filePath) ?? [];

    // Find recent edits by other users in overlapping line ranges
    const overlappingEdits = history.filter(
      (e) =>
        e.userId !== edit.userId &&
        now - e.timestamp < recentWindow &&
        e.lineStart <= edit.lineEnd &&
        e.lineEnd >= edit.lineStart,
    );

    if (overlappingEdits.length === 0) return;

    const otherUsers = [...new Set(overlappingEdits.map((e) => e.userId))];

    const prediction: ConflictPrediction = {
      severity: 'high',
      filePath: edit.filePath,
      region: {
        lineStart: Math.min(edit.lineStart, ...overlappingEdits.map((e) => e.lineStart)),
        lineEnd: Math.max(edit.lineEnd, ...overlappingEdits.map((e) => e.lineEnd)),
      },
      users: [edit.userId, ...otherUsers],
      message: `Multiple users edited overlapping lines in ${edit.filePath} within the last minute.`,
      suggestedResolution:
        'A merge conflict is likely. Coordinate with the other editor(s) or resolve conflicts promptly.',
      confidence: 0.9,
      predictedAt: now,
    };

    this.predictions.push(prediction);

    logger.warn('Edit conflict detected', {
      filePath: edit.filePath,
      users: prediction.users,
      region: prediction.region,
    });
  }

  // -----------------------------------------------------------------------
  // AI-powered resolution suggestions
  // -----------------------------------------------------------------------

  async getResolutionSuggestion(
    filePath: string,
    conflictingEdits: EditEvent[],
  ): Promise<string> {
    if (conflictingEdits.length === 0) return 'No conflicting edits to resolve.';

    const editsDescription = conflictingEdits
      .map(
        (e) =>
          `User ${e.userId} edited lines ${e.lineStart}-${e.lineEnd}:\n${e.content}`,
      )
      .join('\n\n');

    try {
      const response = await aiRouter.chat(
        [
          {
            role: 'user',
            content: `Two or more users have made conflicting edits to ${filePath}. Analyze the edits and suggest a resolution strategy.

Conflicting edits:
${editsDescription}

Provide:
1. A brief analysis of what each user was trying to do.
2. Whether the changes conflict or can be merged automatically.
3. A specific resolution suggestion.`,
          },
        ],
        { temperature: 0.3, maxTokens: 1024 },
        'fast_response',
      );

      return response.content;
    } catch (err) {
      logger.error('Failed to generate resolution suggestion', {
        error: err instanceof Error ? err.message : String(err),
      });
      return 'Unable to generate AI-powered resolution. Please coordinate manually.';
    }
  }

  // -----------------------------------------------------------------------
  // Query
  // -----------------------------------------------------------------------

  getActivePredictions(filePath?: string): ConflictPrediction[] {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    return this.predictions.filter((p) => {
      if (now - p.predictedAt > maxAge) return false;
      if (filePath && p.filePath !== filePath) return false;
      return true;
    });
  }

  getActiveUsersInFile(filePath: string): string[] {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000;

    const users: string[] = [];
    for (const [userId, session] of this.activeSessions) {
      if (session.filePath === filePath && now - session.lastActive < staleThreshold) {
        users.push(userId);
      }
    }
    return users;
  }

  // Cleanup stale data
  cleanup(): void {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000;

    for (const [userId, session] of this.activeSessions) {
      if (now - session.lastActive > staleThreshold) {
        this.activeSessions.delete(userId);
        this.cursorHistory.delete(userId);
      }
    }

    // Clean old predictions
    this.predictions = this.predictions.filter(
      (p) => now - p.predictedAt < staleThreshold,
    );

    // Clean old edit history
    for (const [filePath, edits] of this.editHistory) {
      const filtered = edits.filter((e) => now - e.timestamp < staleThreshold);
      if (filtered.length === 0) {
        this.editHistory.delete(filePath);
      } else {
        this.editHistory.set(filePath, filtered);
      }
    }
  }
}

export const conflictPredictor = new ConflictPredictor();

// Periodic cleanup every 5 minutes
setInterval(() => {
  conflictPredictor.cleanup();
}, 5 * 60 * 1000);
