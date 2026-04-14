import jwt, { JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';
import { getRedis } from '../utils/redis.js';
import { logger } from '../utils/logger.js';
import { UnauthorizedError } from '../utils/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenUser {
  id: string;
  email: string;
  role: string;
  orgId?: string;
}

export interface AccessTokenPayload extends JwtPayload {
  userId: string;
  email: string;
  role: string;
  orgId?: string;
  type: 'access';
}

export interface RefreshTokenPayload extends JwtPayload {
  userId: string;
  tokenId: string;
  type: 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Key prefixes
// ---------------------------------------------------------------------------

const REFRESH_TOKEN_PREFIX = 'refresh_token:';
const BLACKLIST_PREFIX = 'token_blacklist:';
const EMAIL_VERIFY_PREFIX = 'email_verify:';
const PASSWORD_RESET_PREFIX = 'password_reset:';

// ---------------------------------------------------------------------------
// Access Tokens
// ---------------------------------------------------------------------------

export function generateAccessToken(user: TokenUser): string {
  const payload: Omit<AccessTokenPayload, 'iat' | 'exp'> = {
    userId: user.id,
    email: user.email,
    role: user.role,
    orgId: user.orgId,
    type: 'access',
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtAccessExpiry,
    issuer: 'collabspace-auth',
    audience: 'collabspace',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      issuer: 'collabspace-auth',
      audience: 'collabspace',
    }) as AccessTokenPayload;

    if (payload.type !== 'access') {
      throw new UnauthorizedError('Invalid token type');
    }

    return payload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new UnauthorizedError('Invalid token');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Refresh Tokens
// ---------------------------------------------------------------------------

export async function generateRefreshToken(user: TokenUser): Promise<string> {
  const tokenId = crypto.randomUUID();

  const payload: Omit<RefreshTokenPayload, 'iat' | 'exp'> = {
    userId: user.id,
    tokenId,
    type: 'refresh',
  };

  const token = jwt.sign(payload, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpiry,
    issuer: 'collabspace-auth',
    audience: 'collabspace',
  } as jwt.SignOptions);

  // Store refresh token hash in Redis so we can revoke individual tokens
  const tokenHash = hashToken(token);
  const ttlSeconds = parseExpiryToSeconds(config.jwtRefreshExpiry);

  const redis = getRedis();
  await redis.setex(
    `${REFRESH_TOKEN_PREFIX}${tokenId}`,
    ttlSeconds,
    JSON.stringify({
      userId: user.id,
      tokenHash,
      createdAt: new Date().toISOString(),
    }),
  );

  logger.debug('Refresh token created', { userId: user.id, tokenId });

  return token;
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  let payload: RefreshTokenPayload;

  try {
    payload = jwt.verify(token, config.jwtRefreshSecret, {
      issuer: 'collabspace-auth',
      audience: 'collabspace',
    }) as RefreshTokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Refresh token expired');
    }
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (payload.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }

  // Check that the token still exists in Redis (not revoked)
  const redis = getRedis();
  const stored = await redis.get(`${REFRESH_TOKEN_PREFIX}${payload.tokenId}`);
  if (!stored) {
    throw new UnauthorizedError('Refresh token has been revoked');
  }

  // Verify the token hash matches
  const storedData = JSON.parse(stored) as { tokenHash: string };
  const tokenHash = hashToken(token);
  if (storedData.tokenHash !== tokenHash) {
    throw new UnauthorizedError('Refresh token mismatch');
  }

  return payload;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  try {
    const payload = jwt.decode(token) as RefreshTokenPayload | null;
    if (!payload?.tokenId) {
      return;
    }

    const redis = getRedis();

    // Remove from active refresh tokens
    await redis.del(`${REFRESH_TOKEN_PREFIX}${payload.tokenId}`);

    // Add the token to blacklist until its original expiry
    const tokenHash = hashToken(token);
    const ttlSeconds = payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : 0;
    if (ttlSeconds > 0) {
      await redis.setex(`${BLACKLIST_PREFIX}${tokenHash}`, ttlSeconds, '1');
    }

    logger.debug('Refresh token revoked', { tokenId: payload.tokenId });
  } catch (err) {
    logger.error('Error revoking refresh token', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Access token blacklist (for logout)
// ---------------------------------------------------------------------------

export async function blacklistAccessToken(token: string, expiresAt: number): Promise<void> {
  const redis = getRedis();
  const tokenHash = hashToken(token);
  const ttl = expiresAt - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await redis.setex(`${BLACKLIST_PREFIX}${tokenHash}`, ttl, '1');
  }
}

export async function isAccessTokenBlacklisted(token: string): Promise<boolean> {
  const redis = getRedis();
  const tokenHash = hashToken(token);
  const result = await redis.get(`${BLACKLIST_PREFIX}${tokenHash}`);
  return result !== null;
}

// ---------------------------------------------------------------------------
// Token pairs
// ---------------------------------------------------------------------------

export async function generateTokenPair(user: TokenUser): Promise<TokenPair> {
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user);
  const expiresIn = parseExpiryToSeconds(config.jwtAccessExpiry);

  return { accessToken, refreshToken, expiresIn };
}

// ---------------------------------------------------------------------------
// Email verification tokens
// ---------------------------------------------------------------------------

export async function generateEmailVerificationToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const redis = getRedis();
  await redis.setex(
    `${EMAIL_VERIFY_PREFIX}${token}`,
    config.emailVerificationTtl,
    userId,
  );

  logger.debug('Email verification token created', { userId });
  return token;
}

export async function verifyEmailVerificationToken(token: string): Promise<string> {
  const redis = getRedis();
  const userId = await redis.get(`${EMAIL_VERIFY_PREFIX}${token}`);
  if (!userId) {
    throw new UnauthorizedError('Invalid or expired verification token');
  }

  // Consume the token
  await redis.del(`${EMAIL_VERIFY_PREFIX}${token}`);

  return userId;
}

// ---------------------------------------------------------------------------
// Password reset tokens
// ---------------------------------------------------------------------------

export async function generatePasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const redis = getRedis();

  // Invalidate any existing reset token for this user
  const existingKey = await redis.get(`password_reset_user:${userId}`);
  if (existingKey) {
    await redis.del(`${PASSWORD_RESET_PREFIX}${existingKey}`);
  }

  await redis.setex(
    `${PASSWORD_RESET_PREFIX}${token}`,
    config.passwordResetTtl,
    userId,
  );
  await redis.setex(
    `password_reset_user:${userId}`,
    config.passwordResetTtl,
    token,
  );

  logger.debug('Password reset token created', { userId });
  return token;
}

export async function verifyPasswordResetToken(token: string): Promise<string> {
  const redis = getRedis();
  const userId = await redis.get(`${PASSWORD_RESET_PREFIX}${token}`);
  if (!userId) {
    throw new UnauthorizedError('Invalid or expired reset token');
  }

  // Consume the token
  await redis.del(`${PASSWORD_RESET_PREFIX}${token}`);
  await redis.del(`password_reset_user:${userId}`);

  return userId;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseExpiryToSeconds(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) {
    return 900; // 15m fallback
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 900;
  }
}
