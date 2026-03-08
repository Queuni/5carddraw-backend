import jwt from 'jsonwebtoken';
import { AppError, ERROR_CODES } from './errors';

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
const JWT_EXPIRY = '7d'; // Session tokens expire in 7 days

export interface SessionTokenPayload {
  uid: string;
  email?: string;
  isAnonymous: boolean;
  iat?: number;
  exp?: number;
}

/**
 * Create a secure session token (JWT) for authenticated users
 * This is more secure than using custom tokens as session tokens
 */
export function createSessionToken(payload: Omit<SessionTokenPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
}

/**
 * Verify and decode a session token
 */
export function verifySessionToken(token: string): SessionTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SessionTokenPayload;
    return decoded;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 'Session token has expired', 401);
    }
    if (error.name === 'JsonWebTokenError') {
      throw new AppError(ERROR_CODES.INVALID_TOKEN, 'Invalid session token', 401);
    }
    throw new AppError(ERROR_CODES.INVALID_TOKEN, 'Token verification failed', 401);
  }
}

