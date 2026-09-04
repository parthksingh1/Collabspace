/**
 * HS256 token signing for tests.
 *
 * Tests mint their own tokens rather than going through auth-service. That is
 * deliberate: a CRDT convergence test should fail when convergence breaks, not
 * when the login endpoint is down. Every service verifies with
 * `jwt.verify(token, JWT_SECRET)`, so a matching secret is all that is needed.
 */

import { createHmac } from 'node:crypto';

export const JWT_SECRET =
  process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-production';

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function signToken(
  userId: string,
  opts: { role?: string; ttlSec?: number; secret?: string } = {},
): string {
  const { role = 'member', ttlSec = 3600, secret = JWT_SECRET } = opts;
  const now = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub: userId,
      email: `${userId}@collabspace.test`,
      role,
      iat: now,
      exp: now + ttlSec,
    }),
  );
  const signature = b64url(
    createHmac('sha256', secret).update(`${header}.${payload}`).digest(),
  );

  return `${header}.${payload}.${signature}`;
}
