import Docker from 'dockerode';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'java' | 'cpp' | 'go' | 'rust';

interface LanguageConfig {
  image: string;
  command: (code: string, stdin: string) => string[];
  fileExtension: string;
  compileCommand?: string[];
}

interface PooledContainer {
  container: Docker.Container;
  language: SupportedLanguage;
  inUse: boolean;
  createdAt: number;
}

// ── Language configurations ───────────────────────────────────────────────────

const LANGUAGE_CONFIGS: Record<SupportedLanguage, LanguageConfig> = {
  javascript: {
    image: 'node:20-alpine',
    command: (_code: string, _stdin: string) => ['sh', '-c', 'node /tmp/code.js'],
    fileExtension: '.js',
  },
  typescript: {
    image: 'node:20-alpine',
    command: (_code: string, _stdin: string) => ['sh', '-c', 'npx tsx /tmp/code.ts'],
    fileExtension: '.ts',
  },
  python: {
    image: 'python:3.12-alpine',
    command: (_code: string, _stdin: string) => ['sh', '-c', 'python3 /tmp/code.py'],
    fileExtension: '.py',
  },
  java: {
    image: 'eclipse-temurin:21-jdk-alpine',
    command: (_code: string, _stdin: string) => [
      'sh',
      '-c',
      'cd /tmp && javac Main.java && java Main',
    ],
    fileExtension: '.java',
  },
  cpp: {
    image: 'gcc:13-bookworm',
    command: (_code: string, _stdin: string) => [
      'sh',
      '-c',
      'cd /tmp && g++ -O2 -o code code.cpp && ./code',
    ],
    fileExtension: '.cpp',
  },
  go: {
    image: 'golang:1.22-alpine',
    command: (_code: string, _stdin: string) => ['sh', '-c', 'cd /tmp && go run code.go'],
    fileExtension: '.go',
  },
  rust: {
    image: 'rust:1.77-alpine',
    command: (_code: string, _stdin: string) => [
      'sh',
      '-c',
      'cd /tmp && rustc -o code code.rs && ./code',
    ],
    fileExtension: '.rs',
  },
};

// ── Sandbox Manager ───────────────────────────────────────────────────────────

export class SandboxManager {
  private docker: Docker;
  private containerPool: PooledContainer[] = [];
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.docker = new Docker({ socketPath: config.dockerSocketPath });
  }

  // ── Initialization ────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    try {
      const info = await this.docker.info();
      logger.info('Docker connected', {
        version: info.ServerVersion,
        containers: info.Containers,
      });

      // Pull images in background
      this.pullImages().catch((err) => {
        logger.warn('Failed to pull some images', { error: (err as Error).message });
      });

      // Start cleanup interval (remove stale containers every 5 minutes)
      this.cleanupInterval = setInterval(() => {
        this.cleanupStaleContainers().catch((err) => {
          logger.error('Cleanup error', { error: (err as Error).message });
        });
      }, 5 * 60 * 1000);

      logger.info('Sandbox manager initialized');
    } catch (err) {
      logger.error('Failed to connect to Docker', { error: (err as Error).message });
      throw err;
    }
  }

  // ── Image management ──────────────────────────────────────────────────────

  private async pullImages(): Promise<void> {
    const images = new Set(Object.values(LANGUAGE_CONFIGS).map((c) => c.image));

    for (const image of images) {
      try {
        logger.info('Pulling Docker image', { image });
        await new Promise<void>((resolve, reject) => {
          this.docker.pull(image, (err: Error | null, stream: NodeJS.ReadableStream) => {
            if (err) {
              reject(err);
              return;
            }
            this.docker.modem.followProgress(stream, (progressErr: Error | null) => {
              if (progressErr) reject(progressErr);
              else resolve();
            });
          });
        });
        logger.info('Image pulled successfully', { image });
      } catch (err) {
        logger.warn('Failed to pull image', { image, error: (err as Error).message });
      }
    }
  }

  // ── Container creation ────────────────────────────────────────────────────

  async createContainer(
    language: SupportedLanguage,
    code: string,
    stdin: string,
  ): Promise<{ container: Docker.Container; filename: string }> {
    const langConfig = LANGUAGE_CONFIGS[language];
    if (!langConfig) {
      throw new Error(`Unsupported language: ${language}`);
    }

    // Determine filename
    let filename: string;
    if (language === 'java') {
      // Extract class name from Java code
      const classMatch = code.match(/public\s+class\s+(\w+)/);
      filename = classMatch ? `${classMatch[1]}.java` : 'Main.java';
    } else {
      filename = `code${langConfig.fileExtension}`;
    }

    const memoryLimit = config.executionMemoryLimitMb * 1024 * 1024;

    const container = await this.docker.createContainer({
      Image: langConfig.image,
      Cmd: langConfig.command(code, stdin),
      Tty: false,
      OpenStdin: !!stdin,
      HostConfig: {
        Memory: memoryLimit,
        MemorySwap: memoryLimit, // Prevent swap
        CpuPeriod: 100_000,
        CpuQuota: 100_000, // 1 CPU
        PidsLimit: 64,
        NetworkMode: 'none', // No network access
        ReadonlyRootfs: false, // Need writable /tmp
        SecurityOpt: ['no-new-privileges'],
        Tmpfs: {
          '/tmp': 'rw,noexec,size=64m',
        },
        AutoRemove: false, // We'll remove manually after getting output
      },
      WorkingDir: '/tmp',
      Env: ['HOME=/tmp'],
      NetworkDisabled: true,
      StopTimeout: Math.ceil(config.executionTimeoutMs / 1000),
    });

    // Write code file into the container
    const tarStream = await this.createTarBuffer(filename, code, stdin);
    await container.putArchive(tarStream, { path: '/tmp' });

    return { container, filename };
  }

  // ── Container pool ────────────────────────────────────────────────────────

  async getPooledContainer(language: SupportedLanguage): Promise<Docker.Container | null> {
    const available = this.containerPool.find(
      (c) => c.language === language && !c.inUse,
    );

    if (available) {
      available.inUse = true;
      return available.container;
    }

    return null;
  }

  async returnToPool(container: Docker.Container, language: SupportedLanguage): Promise<void> {
    const pooled = this.containerPool.find(
      (c) => c.container.id === container.id,
    );

    if (pooled) {
      pooled.inUse = false;
    }
  }

  // ── Container execution ───────────────────────────────────────────────────

  async executeInContainer(
    container: Docker.Container,
    timeoutMs: number = config.executionTimeoutMs,
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    executionTimeMs: number;
    memoryUsedBytes: number;
    timedOut: boolean;
  }> {
    const startTime = Date.now();

    await container.start();

    // Set timeout
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), timeoutMs);
    });

    const waitPromise = container.wait();

    const result = await Promise.race([waitPromise, timeoutPromise]);

    const executionTimeMs = Date.now() - startTime;
    let timedOut = false;

    if (result === 'timeout') {
      timedOut = true;
      try {
        await container.kill();
      } catch {
        // Container may have already stopped
      }
    }

    // Get logs
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      follow: false,
    });

    const { stdout, stderr } = this.demuxLogs(logs);

    // Get stats for memory usage
    let memoryUsedBytes = 0;
    try {
      const inspectData = await container.inspect();
      if (inspectData.State && typeof inspectData.State === 'object') {
        memoryUsedBytes = (inspectData as unknown as { HostConfig?: { Memory?: number } }).HostConfig?.Memory ?? 0;
      }
    } catch {
      // Stats may not be available after container stops
    }

    const exitCode = timedOut
      ? 124 // Standard timeout exit code
      : typeof result === 'object' && 'StatusCode' in result
        ? result.StatusCode
        : 1;

    return {
      stdout: stdout.substring(0, 100_000), // Limit output size
      stderr: stderr.substring(0, 100_000),
      exitCode,
      executionTimeMs,
      memoryUsedBytes,
      timedOut,
    };
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  async removeContainer(container: Docker.Container): Promise<void> {
    try {
      await container.remove({ force: true });
    } catch (err) {
      logger.warn('Failed to remove container', {
        containerId: container.id,
        error: (err as Error).message,
      });
    }
  }

  private async cleanupStaleContainers(): Promise<void> {
    const maxAge = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();

    const stale = this.containerPool.filter(
      (c) => !c.inUse && now - c.createdAt > maxAge,
    );

    for (const pooled of stale) {
      await this.removeContainer(pooled.container);
      const idx = this.containerPool.indexOf(pooled);
      if (idx >= 0) this.containerPool.splice(idx, 1);
    }

    if (stale.length > 0) {
      logger.debug('Cleaned up stale containers', { count: stale.length });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async createTarBuffer(
    filename: string,
    code: string,
    stdin: string,
  ): Promise<Buffer> {
    // Create a minimal tar archive containing the code file and optional stdin
    const files: Array<{ name: string; content: string }> = [
      { name: filename, content: code },
    ];

    if (stdin) {
      files.push({ name: 'stdin.txt', content: stdin });
    }

    return this.buildTar(files);
  }

  private buildTar(files: Array<{ name: string; content: string }>): Buffer {
    const blocks: Buffer[] = [];

    for (const file of files) {
      const content = Buffer.from(file.content, 'utf-8');
      const header = Buffer.alloc(512, 0);

      // File name (100 bytes)
      header.write(file.name, 0, Math.min(file.name.length, 100), 'utf-8');

      // File mode (8 bytes) -- 0644
      header.write('0000644\0', 100, 8, 'utf-8');

      // Owner/Group ID (8+8 bytes)
      header.write('0001000\0', 108, 8, 'utf-8'); // uid
      header.write('0001000\0', 116, 8, 'utf-8'); // gid

      // File size (12 bytes) -- octal
      header.write(content.length.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf-8');

      // Modification time (12 bytes) -- octal
      const mtime = Math.floor(Date.now() / 1000);
      header.write(mtime.toString(8).padStart(11, '0') + '\0', 136, 12, 'utf-8');

      // Type flag -- '0' = regular file
      header.write('0', 156, 1, 'utf-8');

      // Initialize checksum field with spaces for calculation
      header.write('        ', 148, 8, 'utf-8');

      // Calculate checksum
      let checksum = 0;
      for (let i = 0; i < 512; i++) {
        checksum += header[i]!;
      }
      header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf-8');

      blocks.push(header);
      blocks.push(content);

      // Pad to 512 byte boundary
      const remainder = content.length % 512;
      if (remainder > 0) {
        blocks.push(Buffer.alloc(512 - remainder, 0));
      }
    }

    // End-of-archive marker (two 512-byte blocks of zeros)
    blocks.push(Buffer.alloc(1024, 0));

    return Buffer.concat(blocks);
  }

  private demuxLogs(logs: Buffer | NodeJS.ReadableStream): { stdout: string; stderr: string } {
    const buffer = Buffer.isBuffer(logs) ? logs : Buffer.alloc(0);
    let stdout = '';
    let stderr = '';
    let offset = 0;

    while (offset < buffer.length) {
      if (offset + 8 > buffer.length) break;

      const streamType = buffer[offset]!;
      const size = buffer.readUInt32BE(offset + 4);
      offset += 8;

      if (offset + size > buffer.length) break;

      const chunk = buffer.subarray(offset, offset + size).toString('utf-8');
      offset += size;

      if (streamType === 1) {
        stdout += chunk;
      } else if (streamType === 2) {
        stderr += chunk;
      }
    }

    // Fallback if demux didn't work (TTY mode)
    if (!stdout && !stderr && buffer.length > 0) {
      stdout = buffer.toString('utf-8');
    }

    return { stdout, stderr };
  }

  // ── Supported languages ───────────────────────────────────────────────────

  getSupportedLanguages(): SupportedLanguage[] {
    return Object.keys(LANGUAGE_CONFIGS) as SupportedLanguage[];
  }

  isSupported(language: string): language is SupportedLanguage {
    return language in LANGUAGE_CONFIGS;
  }

  // ── Shutdown ──────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Remove all pooled containers
    for (const pooled of this.containerPool) {
      await this.removeContainer(pooled.container);
    }
    this.containerPool = [];

    logger.info('Sandbox manager shut down');
  }
}
