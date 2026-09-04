// Minimal HS256 JWT signer for k6 scripts.
//
// The ws-gateway and every downstream service verify tokens with
// `jwt.verify(token, JWT_SECRET)` (see apps/ws-gateway/src/middleware/auth.middleware.ts).
// Load generators therefore need to mint their own tokens rather than hitting
// auth-service 5000 times — otherwise the benchmark measures bcrypt, not the
// WebSocket path we actually care about.
//
// Only HS256 is implemented. This is a benchmark helper, not production code.

import crypto from 'k6/crypto';
import encoding from 'k6/encoding';

function base64url(input) {
  return encoding.b64encode(input, 'rawurl');
}

/**
 * @param {object} payload  Claims. `sub`, `email`, `role`, `iat`, `exp` are filled in if absent.
 * @param {string} secret   Shared HMAC secret (must equal the services' JWT_SECRET).
 * @param {number} ttlSec   Token lifetime; default 1 hour, long enough for any bench run.
 */
export function signJwt(payload, secret, ttlSec = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims = Object.assign(
    { iat: now, exp: now + ttlSec, role: 'member' },
    payload,
  );

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // k6's hmac() can emit binary; 'base64rawurl' is exactly the JWT signature encoding.
  const signature = crypto.hmac('sha256', secret, signingInput, 'base64rawurl');

  return `${signingInput}.${signature}`;
}

/** Token for a synthetic load-test user. */
export function benchToken(vuId, secret) {
  return signJwt(
    {
      sub: `bench-user-${vuId}`,
      email: `bench-${vuId}@collabspace.local`,
      role: 'member',
    },
    secret,
  );
}
