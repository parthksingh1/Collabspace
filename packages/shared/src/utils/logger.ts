export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  traceId: string | null;
  message: string;
  metadata: Record<string, unknown>;
}

export interface LoggerOptions {
  minLevel?: LogLevel;
  traceId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  child(options: { traceId?: string; metadata?: Record<string, unknown> }): Logger;
}

function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

function formatEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

class StructuredLogger implements Logger {
  private readonly service: string;
  private readonly minLevel: LogLevel;
  private readonly traceId: string | null;
  private readonly defaultMetadata: Record<string, unknown>;

  constructor(service: string, options: LoggerOptions = {}) {
    this.service = service;
    this.minLevel = options.minLevel ?? ((process.env['LOG_LEVEL'] as LogLevel) || 'info');
    this.traceId = options.traceId ?? null;
    this.defaultMetadata = options.metadata ?? {};
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (!shouldLog(level, this.minLevel)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      traceId: this.traceId,
      message,
      metadata: { ...this.defaultMetadata, ...metadata },
    };

    const output = formatEntry(entry);

    switch (level) {
      case 'debug':
        process.stdout.write(output + '\n');
        break;
      case 'info':
        process.stdout.write(output + '\n');
        break;
      case 'warn':
        process.stderr.write(output + '\n');
        break;
      case 'error':
        process.stderr.write(output + '\n');
        break;
    }
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('error', message, metadata);
  }

  /**
   * Create a child logger with additional context (traceId, metadata).
   * Inherits the parent's service name and min level.
   */
  child(options: { traceId?: string; metadata?: Record<string, unknown> }): Logger {
    return new StructuredLogger(this.service, {
      minLevel: this.minLevel,
      traceId: options.traceId ?? this.traceId,
      metadata: { ...this.defaultMetadata, ...options.metadata },
    });
  }
}

/**
 * Factory function to create a structured logger for a service.
 */
export function createLogger(serviceName: string, options?: LoggerOptions): Logger {
  return new StructuredLogger(serviceName, options);
}
