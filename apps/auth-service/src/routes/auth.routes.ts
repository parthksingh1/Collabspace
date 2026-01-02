import { Router, Request, Response, NextFunction } from 'express';
import {
  validateRequest,
  RegisterSchema,
  LoginSchema,
  RefreshTokenSchema,
  LogoutSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  VerifyEmailSchema,
} from '../utils/validation.js';
import {
  createUser,
  findByEmail,
  findPublicById,
  verifyPassword,
  updatePassword,
  updateUser,
  createAuditLog,
} from '../services/user.service.js';
import {
  generateTokenPair,
  verifyRefreshToken,
  revokeRefreshToken,
  blacklistAccessToken,
  generateEmailVerificationToken,
  verifyEmailVerificationToken,
  generatePasswordResetToken,
  verifyPasswordResetToken,
} from '../services/token.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { authRateLimiter } from '../middleware/rate-limiter.js';
import { UnauthorizedError, BadRequestError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const authRouter = Router();

// ---------------------------------------------------------------------------
// POST /auth/register
// ---------------------------------------------------------------------------

authRouter.post(
  '/register',
  authRateLimiter,
  validateRequest(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, name } = req.body;

      // Create the user (password is hashed inside the service)
      const user = await createUser({ email, password, name });

      // Generate email verification token
      const verificationToken = await generateEmailVerificationToken(user.id);

      // Generate auth token pair
      const tokens = await generateTokenPair({
        id: user.id,
        email: user.email,
        role: user.role,
        orgId: user.org_id ?? undefined,
      });

      // Audit log
      await createAuditLog({
        actorId: user.id,
        action: 'user.registered',
        resourceType: 'user',
        resourceId: user.id,
        ip: req.ip,
      });

      logger.info('User registered', { userId: user.id, email: user.email });

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            email_verified: user.email_verified,
            created_at: user.created_at,
          },
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
          },
          verificationToken,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------------------

authRouter.post(
  '/login',
  authRateLimiter,
  validateRequest(LoginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;

      const user = await findByEmail(email);
      if (!user) {
        throw new UnauthorizedError('Invalid email or password');
      }

      const passwordValid = await verifyPassword(password, user.password_hash);
      if (!passwordValid) {
        await createAuditLog({
          actorId: user.id,
          action: 'user.login_failed',
          resourceType: 'user',
          resourceId: user.id,
          metadata: { reason: 'invalid_password' },
          ip: req.ip,
        });

        throw new UnauthorizedError('Invalid email or password');
      }

      const tokens = await generateTokenPair({
        id: user.id,
        email: user.email,
        role: user.role,
        orgId: user.org_id ?? undefined,
      });

      await createAuditLog({
        actorId: user.id,
        action: 'user.logged_in',
        resourceType: 'user',
        resourceId: user.id,
        metadata: { userAgent: req.get('user-agent') },
        ip: req.ip,
      });

      logger.info('User logged in', { userId: user.id });

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            avatar_url: user.avatar_url,
            email_verified: user.email_verified,
            org_id: user.org_id,
          },
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/refresh
// ---------------------------------------------------------------------------

authRouter.post(
  '/refresh',
  authRateLimiter,
  validateRequest(RefreshTokenSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      // Verify the refresh token and get payload
      const payload = await verifyRefreshToken(refreshToken);

      // Revoke the old refresh token (rotation)
      await revokeRefreshToken(refreshToken);

      // Look up the user to get current role/org info
      const user = await findPublicById(payload.userId);
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      // Issue a new token pair
      const tokens = await generateTokenPair({
        id: user.id,
        email: user.email,
        role: user.role,
        orgId: user.org_id ?? undefined,
      });

      logger.debug('Tokens refreshed', { userId: user.id });

      res.json({
        success: true,
        data: {
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: tokens.expiresIn,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/logout
// ---------------------------------------------------------------------------

authRouter.post(
  '/logout',
  authenticate,
  validateRequest(LogoutSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { refreshToken } = req.body;

      // Revoke the refresh token
      await revokeRefreshToken(refreshToken);

      // Blacklist the current access token until it expires
      if (req.user && req.token) {
        const exp = req.user.exp ?? Math.floor(Date.now() / 1000) + 900;
        await blacklistAccessToken(req.token, exp);
      }

      await createAuditLog({
        actorId: req.user!.userId,
        action: 'user.logged_out',
        resourceType: 'user',
        resourceId: req.user!.userId,
        ip: req.ip,
      });

      logger.info('User logged out', { userId: req.user!.userId });

      res.json({
        success: true,
        data: { message: 'Successfully logged out' },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/forgot-password
// ---------------------------------------------------------------------------

authRouter.post(
  '/forgot-password',
  authRateLimiter,
  validateRequest(ForgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body;

      // Always return success to prevent email enumeration
      const user = await findByEmail(email);

      if (user) {
        const resetToken = await generatePasswordResetToken(user.id);

        await createAuditLog({
          actorId: user.id,
          action: 'user.password_reset_requested',
          resourceType: 'user',
          resourceId: user.id,
          ip: req.ip,
        });

        // In production, send email with resetToken. For now, log it.
        logger.info('Password reset token generated', {
          userId: user.id,
          resetToken: process.env.NODE_ENV === 'development' ? resetToken : '[redacted]',
        });
      }

      res.json({
        success: true,
        data: {
          message: 'If the email exists, a password reset link has been sent',
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/reset-password
// ---------------------------------------------------------------------------

authRouter.post(
  '/reset-password',
  authRateLimiter,
  validateRequest(ResetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, password } = req.body;

      // Verify and consume the reset token
      const userId = await verifyPasswordResetToken(token);

      // Update the password
      await updatePassword(userId, password);

      await createAuditLog({
        actorId: userId,
        action: 'user.password_reset',
        resourceType: 'user',
        resourceId: userId,
        ip: req.ip,
      });

      logger.info('Password reset completed', { userId });

      res.json({
        success: true,
        data: { message: 'Password has been reset successfully' },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /auth/me
// ---------------------------------------------------------------------------

authRouter.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await findPublicById(req.user!.userId);
      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      res.json({
        success: true,
        data: { user },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /auth/verify-email
// ---------------------------------------------------------------------------

authRouter.post(
  '/verify-email',
  validateRequest(VerifyEmailSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.body;

      // Verify and consume the email verification token
      const userId = await verifyEmailVerificationToken(token);

      // Mark user as email verified
      await updateUser(userId, { email_verified: true });

      await createAuditLog({
        actorId: userId,
        action: 'user.email_verified',
        resourceType: 'user',
        resourceId: userId,
        ip: req.ip,
      });

      logger.info('Email verified', { userId });

      res.json({
        success: true,
        data: { message: 'Email verified successfully' },
      });
    } catch (err) {
      next(err);
    }
  },
);
