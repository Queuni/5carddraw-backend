import { Request, Response, NextFunction } from 'express';
import { auth, db } from '../config/firebase';
import { AppError, ERROR_CODES } from '../utils/errors';
import { verifySessionToken } from '../utils/sessionToken';

export interface AuthenticatedRequest extends Request {
  uid?: string;
  user?: {
    uid: string;
    email?: string;
    emailVerified: boolean;
  };
}

/**
 * Verify session token (JWT) - secure method for WebGL
 */
async function verifySessionTokenSecure(token: string): Promise<{ uid: string; email?: string; isAnonymous: boolean } | null> {
  try {
    const payload = verifySessionToken(token);
    return {
      uid: payload.uid,
      email: payload.email,
      isAnonymous: payload.isAnonymous,
    };
  } catch {
    return null;
  }
}

/**
 * Middleware to verify Firebase ID token or custom token (for WebGL)
 */
export async function verifyToken(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        'No authorization token provided',
        401
      );
    }

    const token = authHeader.split('Bearer ')[1];

    try {
      // First, try to verify as Firebase ID token (for Windows builds with Firebase SDK)
      const decodedToken = await auth.verifyIdToken(token);
      req.uid = decodedToken.uid;
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified || false,
      };
      next();
    } catch (error: any) {
      // If ID token verification fails, try session token (for WebGL)
      if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
        const sessionTokenResult = await verifySessionTokenSecure(token);
        if (sessionTokenResult) {
          // Get user info from Firestore
          const userDoc = await db.collection('players').doc(sessionTokenResult.uid).get();

          if (userDoc.exists) {
            const userData = userDoc.data();
            req.uid = sessionTokenResult.uid;
            req.user = {
              uid: sessionTokenResult.uid,
              email: sessionTokenResult.email || userData?.email,
              emailVerified: userData?.isEmailVerified || false,
            };
            next();
            return;
          }
        }

        if (error.code === 'auth/id-token-expired') {
          throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 'Token has expired', 401);
        }
      }
      throw new AppError(ERROR_CODES.INVALID_TOKEN, 'Invalid token', 401);
    }
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      next(new AppError(ERROR_CODES.INTERNAL_ERROR, 'Authentication failed', 500));
    }
  }
}

/**
 * Optional middleware - doesn't fail if no token
 */
export async function optionalVerifyToken(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      try {
        const decodedToken = await auth.verifyIdToken(token);
        req.uid = decodedToken.uid;
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified || false,
        };
      } catch (error) {
        // Ignore token errors for optional auth
      }
    }
    next();
  } catch (error) {
    next();
  }
}

