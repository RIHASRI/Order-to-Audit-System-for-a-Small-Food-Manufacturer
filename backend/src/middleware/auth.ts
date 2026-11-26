import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User, UserRole } from '../models/User';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    const token =
      header && header.startsWith('Bearer ') ? header.slice(7).trim() : null;

    if (!token) {
      throw new UnauthorizedError('Missing or invalid authorization token');
    }

    const decoded = jwt.verify(token, env.jwtSecret) as {
      sub: string;
      email: string;
      role: UserRole;
      name: string;
    };

    const user = await User.findById(decoded.sub).select('name email role isActive').lean();
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User account is inactive or not found');
    }

    req.user = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
    };
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      next(err);
    } else {
      next(new UnauthorizedError('Invalid or expired session token'));
    }
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      next(
        new ForbiddenError(
          `Role ${req.user.role} is not authorized to perform this action`
        )
      );
      return;
    }
    next();
  };
}
