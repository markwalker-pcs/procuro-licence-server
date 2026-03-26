import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { AppError } from './errorHandler';

/**
 * Admin authentication middleware.
 * Reference: Architecture Doc, Section 5.1
 *
 * Development: JWT-based authentication
 * Production: Azure AD SSO (to be implemented)
 *
 * The authenticated admin user is attached to req.adminUser.
 */

export interface AdminAuthRequest extends Request {
  adminUser?: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

/**
 * Verify JWT token and attach admin user to request.
 */
export async function requireAdminAuth(
  req: AdminAuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'Authentication required. Provide a Bearer token.');
    }

    const token = authHeader.substring(7);

    // Verify JWT
    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
    };

    // Look up admin user
    const user = await prisma.adminUser.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new AppError(401, 'Admin user not found.');
    }

    // Attach to request
    req.adminUser = {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError(401, 'Invalid or expired token.'));
      return;
    }
    next(error);
  }
}

/**
 * Require a specific admin role (or higher).
 * Role hierarchy: ADMIN > ENGINEER > READ_ONLY
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: AdminAuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.adminUser) {
      next(new AppError(401, 'Authentication required.'));
      return;
    }

    if (!allowedRoles.includes(req.adminUser.role)) {
      next(new AppError(403, `This action requires one of: ${allowedRoles.join(', ')}`));
      return;
    }

    next();
  };
}

// ─────────────────────────────────────────────
// Dev-only: Login endpoint to get a JWT token
// In production this is replaced by Azure AD SSO
// ─────────────────────────────────────────────

import { Router } from 'express';

export const authRouter = Router();

const loginSchema = {
  email: 'string',
};

authRouter.post('/login', async (req: Request, res: Response) => {
  if (!config.isDev) {
    res.status(404).json({ error: 'Dev login is not available in production.' });
    return;
  }

  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const user = await prisma.adminUser.findUnique({ where: { email } });

  if (!user) {
    res.status(404).json({ error: `No admin user found with email: ${email}` });
    return;
  }

  // Update last login
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { lastLogin: new Date() },
  });

  // Generate JWT
  const token = jwt.sign(
    { userId: user.id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiry } as jwt.SignOptions
  );

  logger.info('Admin login', { email: user.email, role: user.role });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
    },
  });
});
