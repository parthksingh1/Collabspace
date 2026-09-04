/**
 * Thin wrapper over `docker compose` for the chaos tests.
 *
 * Chaos tests are the ones most likely to leave wreckage behind — that is
 * literally their job — so everything here is written to be safe to call twice
 * and to fail loudly rather than hang. Every command has a timeout.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { checkHttp, delay, REQUIRE_INFRA } from './infra.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CHAOS_PROJECT = 'collabspace-chaos';
export const CHAOS_COMPOSE_FILE = resolve(__dirname, '..', 'chaos', 'docker-compose.chaos.yml');

export const CHAOS_WS1_PORT = parseInt(process.env.CHAOS_WS1_PORT ?? '4101', 10);
export const CHAOS_WS2_PORT = parseInt(process.env.CHAOS_WS2_PORT ?? '4102', 10);
export const CHAOS_REDIS_PORT = parseInt(process.env.CHAOS_REDIS_PORT ?? '6399', 10);

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function run(cmd: string, args: string[], timeoutMs = 120_000): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, { shell: false });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolvePromise({ code: -1, stdout, stderr: stderr + String(err), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code: code ?? -1, stdout, stderr, timedOut });
    });
  });
}

export function compose(args: string[], timeoutMs = 300_000): Promise<RunResult> {
  return run(
    'docker',
    ['compose', '-p', CHAOS_PROJECT, '-f', CHAOS_COMPOSE_FILE, ...args],
    timeoutMs,
  );
}

/** Is a Docker daemon reachable? Chaos tests are worthless without one. */
export async function dockerAvailable(): Promise<{ available: boolean; reason: string }> {
  const res = await run('docker', ['info', '--format', '{{.ServerVersion}}'], 15_000);
  if (res.code === 0) return { available: true, reason: res.stdout.trim() };
  const detail = (res.stderr || res.stdout).split('\n')[0] ?? 'unknown error';
  return { available: false, reason: `docker daemon unreachable: ${detail}` };
}

/**
 * Resolves to a node:test `skip` option when Docker is missing. Throws when
 * REQUIRE_INFRA=1, so CI cannot silently skip the entire chaos suite.
 */
export async function requireDockerOrSkip(): Promise<{ skip: false } | { skip: string }> {
  const { available, reason } = await dockerAvailable();
  if (available) return { skip: false };
  const message = `chaos tests need Docker (${reason})`;
  if (REQUIRE_INFRA) throw new Error(`REQUIRE_INFRA=1 but ${message}`);
  return { skip: message };
}

// -- Topology lifecycle ------------------------------------------------------

export const GATEWAY_URLS = [
  `ws://localhost:${CHAOS_WS1_PORT}`,
  `ws://localhost:${CHAOS_WS2_PORT}`,
];

export const GATEWAY_HEALTH_URLS = [
  `http://localhost:${CHAOS_WS1_PORT}/health`,
  `http://localhost:${CHAOS_WS2_PORT}/health`,
];

export async function waitForGateway(healthUrl: string, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { available } = await checkHttp(healthUrl, 2000);
    if (available) return true;
    if (Date.now() > deadline) return false;
    await delay(500);
  }
}

export async function waitForGatewayDown(healthUrl: string, timeoutMs = 30_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { available } = await checkHttp(healthUrl, 1000);
    if (!available) return true;
    if (Date.now() > deadline) return false;
    await delay(200);
  }
}

/** Brings the chaos topology up and waits for both gateways to answer /health. */
export async function startTopology(): Promise<void> {
  // `down -v` first: a previous run that crashed leaves containers behind, and
  // a half-up topology produces the most confusing possible test failures.
  await compose(['down', '-v', '--remove-orphans'], 120_000);

  const up = await compose(['up', '-d', '--build'], 600_000);
  if (up.code !== 0) {
    throw new Error(
      `docker compose up failed (exit ${up.code})\n--- stderr ---\n${up.stderr}\n--- stdout ---\n${up.stdout}`,
    );
  }

  for (const url of GATEWAY_HEALTH_URLS) {
    const ok = await waitForGateway(url);
    if (!ok) {
      const logs = await compose(['logs', '--tail', '50'], 30_000);
      throw new Error(`gateway at ${url} never became healthy.\n${logs.stdout}\n${logs.stderr}`);
    }
  }
}

export async function stopTopology(): Promise<void> {
  await compose(['down', '-v', '--remove-orphans'], 180_000);
}

/** Hard-kills a container, the way a node dying looks. Not a graceful stop. */
export async function killContainer(service: string): Promise<void> {
  const res = await compose(['kill', '-s', 'SIGKILL', service], 60_000);
  if (res.code !== 0) {
    throw new Error(`failed to kill ${service}: ${res.stderr || res.stdout}`);
  }
}

export async function restartContainer(service: string): Promise<void> {
  const res = await compose(['restart', service], 120_000);
  if (res.code !== 0) {
    throw new Error(`failed to restart ${service}: ${res.stderr || res.stdout}`);
  }
}

export async function startContainer(service: string): Promise<void> {
  const res = await compose(['start', service], 120_000);
  if (res.code !== 0) {
    throw new Error(`failed to start ${service}: ${res.stderr || res.stdout}`);
  }
}

export interface GatewayHealth {
  connections: number;
  rooms: number;
  shard: string;
  fanoutSubscriptions?: number;
}

/**
 * Reads a gateway's /health payload — connection counts, room counts, shard id.
 *
 * Retries, because a node that is busy accepting a hundred WebSocket handshakes
 * can take longer than a second to get around to an HTTP request. A single
 * tight-timeout probe there produces a "node is down" failure for a node that is
 * merely busy, which is the most misleading result a chaos test can give.
 */
export async function gatewayHealth(
  port: number,
  attempts = 5,
  perAttemptTimeoutMs = 5000,
): Promise<GatewayHealth | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://localhost:${port}/health`, {
        signal: AbortSignal.timeout(perAttemptTimeoutMs),
      });
      if (res.ok) return (await res.json()) as GatewayHealth;
    } catch {
      // fall through to the retry
    }
    if (i < attempts - 1) await delay(500);
  }
  return null;
}
