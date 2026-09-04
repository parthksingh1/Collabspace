/**
 * Infrastructure preconditions for integration and chaos tests.
 *
 * These tests need real services. The question is what to do when they are not
 * running. Two bad options and one good one:
 *
 *   - Fail hard always: `npm test` on a fresh clone is red, which trains people
 *     to ignore red.
 *   - Skip always: CI silently passes without running anything, which is worse
 *     than having no test.
 *   - Skip locally, fail in CI: what this does.
 *
 * Set `REQUIRE_INFRA=1` (CI does) and a missing service is a test failure.
 * Leave it unset and the suite skips with a message saying exactly what to
 * start. `npm run test:integration` in CI sets it; a developer running the file
 * directly does not have to.
 */

import { setTimeout as delay } from 'node:timers/promises';

export const REQUIRE_INFRA = process.env.REQUIRE_INFRA === '1';

export const WS_URL = process.env.WS_URL ?? 'ws://localhost:4001';
export const WS_HTTP_URL = process.env.WS_HTTP_URL ?? 'http://localhost:4001';
export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export interface InfraCheck {
  available: boolean;
  reason: string;
}

/** Probes an HTTP health endpoint with a short timeout. */
export async function checkHttp(url: string, timeoutMs = 2000): Promise<InfraCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res.ok
      ? { available: true, reason: 'ok' }
      : { available: false, reason: `${url} returned ${res.status}` };
  } catch (err) {
    return { available: false, reason: `${url} unreachable: ${(err as Error).message}` };
  } finally {
    clearTimeout(timer);
  }
}

export function checkWsGateway(): Promise<InfraCheck> {
  return checkHttp(`${WS_HTTP_URL}/health`);
}

export function checkApiGateway(): Promise<InfraCheck> {
  return checkHttp(`${API_URL}/health`);
}

/**
 * Resolves to a node:test `skip` option. Throws instead when REQUIRE_INFRA=1,
 * so CI cannot quietly pass a suite that never ran.
 */
export async function requireOrSkip(
  check: () => Promise<InfraCheck>,
  what: string,
  howToStart: string,
): Promise<{ skip: false } | { skip: string }> {
  const result = await check();
  if (result.available) return { skip: false };

  const message = `${what} not available (${result.reason}). Start it with: ${howToStart}`;

  if (REQUIRE_INFRA) {
    throw new Error(`REQUIRE_INFRA=1 but ${message}`);
  }
  return { skip: message };
}

/** Polls `predicate` until true or `timeoutMs` elapses. Returns whether it succeeded. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 20,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await predicate()) return true;
    if (Date.now() > deadline) return false;
    await delay(intervalMs);
  }
}

export { delay };
