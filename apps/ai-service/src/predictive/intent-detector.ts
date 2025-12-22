import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserIntent =
  | 'writing'
  | 'coding'
  | 'reviewing'
  | 'brainstorming'
  | 'navigating'
  | 'debugging'
  | 'unknown';

export interface EditingPattern {
  userId: string;
  timestamp: number;
  action: 'insert' | 'delete' | 'replace' | 'cursor_move' | 'select' | 'scroll' | 'search';
  metadata: {
    filePath?: string;
    fileType?: string;
    characterCount?: number;
    lineCount?: number;
    deletedCount?: number;
    isComment?: boolean;
    searchQuery?: string;
  };
}

export interface IntentDetection {
  intent: UserIntent;
  confidence: number;
  signals: string[];
  detectedAt: number;
}

export interface CursorHeatmapEntry {
  filePath: string;
  line: number;
  visits: number;
  totalDwellMs: number;
  lastVisit: number;
}

// ---------------------------------------------------------------------------
// Intent Detector
// ---------------------------------------------------------------------------

export class IntentDetector {
  private patternHistory: Map<string, EditingPattern[]> = new Map(); // userId -> patterns
  private intentCache: Map<string, IntentDetection> = new Map(); // userId -> latest intent
  private heatmapData: Map<string, Map<string, CursorHeatmapEntry>> = new Map(); // userId -> (key -> entry)
  private cursorDwellStart: Map<string, { filePath: string; line: number; timestamp: number }> = new Map();

  // -----------------------------------------------------------------------
  // Pattern tracking
  // -----------------------------------------------------------------------

  recordPattern(pattern: EditingPattern): void {
    const history = this.patternHistory.get(pattern.userId) ?? [];
    history.push(pattern);

    // Keep last 500 patterns per user
    if (history.length > 500) {
      history.splice(0, history.length - 500);
    }

    this.patternHistory.set(pattern.userId, history);

    // Update heatmap for cursor moves
    if (pattern.action === 'cursor_move' && pattern.metadata.filePath && pattern.metadata.lineCount !== undefined) {
      this.updateHeatmap(pattern.userId, pattern.metadata.filePath, pattern.metadata.lineCount, pattern.timestamp);
    }

    // Detect intent after each pattern
    this.detectIntent(pattern.userId);
  }

  private updateHeatmap(userId: string, filePath: string, line: number, timestamp: number): void {
    // Close previous dwell
    const prevDwell = this.cursorDwellStart.get(userId);
    if (prevDwell) {
      const dwellMs = timestamp - prevDwell.timestamp;
      if (dwellMs > 100 && dwellMs < 300_000) {
        // Between 100ms and 5min
        const userMap = this.heatmapData.get(userId) ?? new Map();
        const key = `${prevDwell.filePath}:${prevDwell.line}`;
        const existing = userMap.get(key) ?? {
          filePath: prevDwell.filePath,
          line: prevDwell.line,
          visits: 0,
          totalDwellMs: 0,
          lastVisit: 0,
        };
        existing.visits++;
        existing.totalDwellMs += dwellMs;
        existing.lastVisit = timestamp;
        userMap.set(key, existing);
        this.heatmapData.set(userId, userMap);
      }
    }

    // Start new dwell
    this.cursorDwellStart.set(userId, { filePath, line, timestamp });
  }

  // -----------------------------------------------------------------------
  // Intent detection
  // -----------------------------------------------------------------------

  private detectIntent(userId: string): IntentDetection {
    const history = this.patternHistory.get(userId) ?? [];
    const now = Date.now();
    const windowMs = 60_000; // Analyze last 60 seconds

    const recent = history.filter((p) => now - p.timestamp < windowMs);
    if (recent.length === 0) {
      const detection: IntentDetection = {
        intent: 'unknown',
        confidence: 0,
        signals: [],
        detectedAt: now,
      };
      this.intentCache.set(userId, detection);
      return detection;
    }

    const signals: string[] = [];
    const scores: Record<UserIntent, number> = {
      writing: 0,
      coding: 0,
      reviewing: 0,
      brainstorming: 0,
      navigating: 0,
      debugging: 0,
      unknown: 0,
    };

    // Analyze action distribution
    const actionCounts: Record<string, number> = {};
    for (const p of recent) {
      actionCounts[p.action] = (actionCounts[p.action] ?? 0) + 1;
    }

    // High insert rate with code files → coding
    const insertCount = actionCounts['insert'] ?? 0;
    const deleteCount = actionCounts['delete'] ?? 0;
    const replaceCount = actionCounts['replace'] ?? 0;
    const cursorMoveCount = actionCounts['cursor_move'] ?? 0;
    const scrollCount = actionCounts['scroll'] ?? 0;
    const selectCount = actionCounts['select'] ?? 0;
    const searchCount = actionCounts['search'] ?? 0;

    const totalEdits = insertCount + deleteCount + replaceCount;
    const totalActions = recent.length;

    // --- Coding signals ---
    const codeFiles = recent.filter((p) => {
      const ext = p.metadata.fileType ?? '';
      return ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'cpp', 'c'].includes(ext);
    });

    if (codeFiles.length > totalActions * 0.5) {
      scores.coding += 2;
      signals.push('Primarily editing code files');
    }

    if (insertCount > totalActions * 0.3) {
      scores.coding += 1;
      scores.writing += 1;
      signals.push('High insertion rate');
    }

    // --- Writing signals ---
    const docFiles = recent.filter((p) => {
      const ext = p.metadata.fileType ?? '';
      return ['md', 'txt', 'doc', 'rtf', 'html'].includes(ext);
    });

    if (docFiles.length > totalActions * 0.5) {
      scores.writing += 3;
      signals.push('Primarily editing document files');
    }

    const longInserts = recent.filter(
      (p) => p.action === 'insert' && (p.metadata.characterCount ?? 0) > 50,
    );
    if (longInserts.length > 3) {
      scores.writing += 2;
      signals.push('Long text insertions detected');
    }

    // --- Reviewing signals ---
    if (scrollCount > totalActions * 0.3 && totalEdits < totalActions * 0.1) {
      scores.reviewing += 3;
      signals.push('Mostly scrolling with few edits');
    }

    if (selectCount > totalActions * 0.2 && totalEdits < totalActions * 0.1) {
      scores.reviewing += 2;
      signals.push('Selecting text without editing');
    }

    const commentEdits = recent.filter((p) => p.metadata.isComment);
    if (commentEdits.length > 2) {
      scores.reviewing += 2;
      signals.push('Adding comments');
    }

    // --- Brainstorming signals ---
    const rapidEdits = recent.filter((p, i) => {
      if (i === 0) return false;
      return p.timestamp - recent[i - 1].timestamp < 500;
    });
    const hasFrequentDeletes = deleteCount > totalEdits * 0.4;

    if (rapidEdits.length > totalActions * 0.5 && hasFrequentDeletes) {
      scores.brainstorming += 2;
      signals.push('Rapid edits with frequent deletions');
    }

    // --- Navigating signals ---
    if (cursorMoveCount > totalActions * 0.5 && totalEdits < totalActions * 0.1) {
      scores.navigating += 3;
      signals.push('Primarily cursor movement');
    }

    if (searchCount > 0) {
      scores.navigating += 2;
      signals.push('Using search');
    }

    // --- Debugging signals ---
    if (searchCount > 2) {
      scores.debugging += 2;
      signals.push('Multiple searches');
    }

    const searchesForErrors = recent.filter(
      (p) =>
        p.action === 'search' &&
        p.metadata.searchQuery &&
        /error|bug|fix|issue|undefined|null|exception|crash/i.test(p.metadata.searchQuery),
    );
    if (searchesForErrors.length > 0) {
      scores.debugging += 3;
      signals.push('Searching for error-related terms');
    }

    // Determine winner
    let maxScore = 0;
    let detectedIntent: UserIntent = 'unknown';

    for (const [intent, score] of Object.entries(scores) as [UserIntent, number][]) {
      if (score > maxScore) {
        maxScore = score;
        detectedIntent = intent;
      }
    }

    const totalScoreSum = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalScoreSum > 0 ? maxScore / totalScoreSum : 0;

    const detection: IntentDetection = {
      intent: detectedIntent,
      confidence: Math.min(1, confidence),
      signals,
      detectedAt: now,
    };

    this.intentCache.set(userId, detection);

    logger.debug('Intent detected', { userId, intent: detectedIntent, confidence, signals });

    return detection;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  getIntent(userId: string): IntentDetection | null {
    return this.intentCache.get(userId) ?? null;
  }

  getCursorHeatmap(
    userId: string,
    filePath?: string,
  ): CursorHeatmapEntry[] {
    const userMap = this.heatmapData.get(userId);
    if (!userMap) return [];

    let entries = [...userMap.values()];

    if (filePath) {
      entries = entries.filter((e) => e.filePath === filePath);
    }

    // Sort by total dwell time descending
    entries.sort((a, b) => b.totalDwellMs - a.totalDwellMs);
    return entries.slice(0, 50);
  }

  getAISuggestionConfig(userId: string): {
    intent: UserIntent;
    suggestCompletions: boolean;
    suggestRefactorings: boolean;
    suggestDocumentation: boolean;
    suggestTests: boolean;
    proactiveMode: boolean;
  } {
    const detection = this.intentCache.get(userId);
    const intent = detection?.intent ?? 'unknown';

    return {
      intent,
      suggestCompletions: intent === 'coding' || intent === 'writing',
      suggestRefactorings: intent === 'coding' || intent === 'reviewing',
      suggestDocumentation: intent === 'writing' || intent === 'reviewing',
      suggestTests: intent === 'coding' || intent === 'debugging',
      proactiveMode: intent === 'brainstorming' || intent === 'coding',
    };
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  cleanup(): void {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [userId, history] of this.patternHistory) {
      const filtered = history.filter((p) => now - p.timestamp < maxAge);
      if (filtered.length === 0) {
        this.patternHistory.delete(userId);
        this.intentCache.delete(userId);
        this.cursorDwellStart.delete(userId);
      } else {
        this.patternHistory.set(userId, filtered);
      }
    }

    // Clean old heatmap entries
    for (const [userId, userMap] of this.heatmapData) {
      for (const [key, entry] of userMap) {
        if (now - entry.lastVisit > maxAge) {
          userMap.delete(key);
        }
      }
      if (userMap.size === 0) {
        this.heatmapData.delete(userId);
      }
    }
  }
}

export const intentDetector = new IntentDetector();

// Periodic cleanup every 10 minutes
setInterval(() => {
  intentDetector.cleanup();
}, 10 * 60 * 1000);
