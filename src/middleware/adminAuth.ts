import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
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
// Login endpoint to get a JWT token
// Development: Email-only login
// Production: Email + password authentication
// ─────────────────────────────────────────────

import { Router } from 'express';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const user = await prisma.adminUser.findUnique({ where: { email } });

  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  // Development mode: email-only login
  if (config.isDev) {
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

    logger.info('Admin login (development)', { email: user.email, role: user.role });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
    return;
  }

  // Production mode: require password
  if (!password) {
    res.status(400).json({ error: 'Password is required.' });
    return;
  }

  if (!user.passwordHash) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  // Verify password
  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    res.status(401).json({ error: 'Invalid email or password.' });
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

  logger.info('Admin login (production)', { email: user.email, role: user.role });

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
