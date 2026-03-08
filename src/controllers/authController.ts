import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import {
  signup,
  signin,
  verifyIdToken,
  createAnonymousAccount,
  createAnonymousAccountServerSide,
  requestPasswordResetEmail,
  resetPassword,
} from '../services/authService';
import { createSuccessResponse, AppError, ERROR_CODES } from '../utils/errors';
import { SignupRequest, SigninRequest } from '../types';
import { isValidEmail } from '../utils/validation';
import { verifySessionToken, createSessionToken } from '../utils/sessionToken';
import { db } from '../config/firebase';
import * as admin from 'firebase-admin';

/**
 * Sign up with email/password
 */
export async function signupHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password, userName, avatarIndex }: SignupRequest = req.body;

    if (!email || !password || !userName) {
      throw new AppError(ERROR_CODES.MISSING_REQUIRED_FIELD, 'Email, password, and username are required');
    }

    const result = await signup({ email, password, userName, avatarIndex });

    res.status(201).json(createSuccessResponse(result));
  } catch (error) {
    next(error);
  }
}

/**
 * Sign in with email/password
 * Note: This endpoint creates a custom token. For production, consider:
 * 1. Client uses Firebase Auth SDK to sign in
 * 2. Client sends ID token to /auth/verify-token endpoint
 */
export async function signinHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { identifier, password }: SigninRequest = req.body;

    if (!identifier || !password) {
      throw new AppError(ERROR_CODES.MISSING_REQUIRED_FIELD, 'Email/username and password are required');
    }

    const result = await signin({ identifier, password });

    res.json(createSuccessResponse(result));
  } catch (error) {
    next(error);
  }
}

/**
 * Verify ID token from client
 * Recommended endpoint for authentication after client signs in
 */
export async function verifyTokenHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      throw new AppError(ERROR_CODES.MISSING_REQUIRED_FIELD, 'ID token is required');
    }

    const result = await verifyIdToken(idToken);

    res.json(createSuccessResponse(result));
  } catch (error) {
    next(error);
  }
}

/**
 * Create anonymous account profile
 * Note: Client must create anonymous user with Firebase Auth SDK first,
 * then send the ID token to this endpoint to create the profile.
 */
export async function anonymousHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const uid = req.uid!;
    const result = await createAnonymousAccount(uid);

    res.status(201).json(createSuccessResponse(result));
  } catch (error) {
    next(error);
  }
}

/**
 * Create anonymous account server-side (for WebGL compatibility)
 * This endpoint creates the anonymous user and profile entirely on the server
 * 
 * IMPORTANT: Checks for existing valid session token first to prevent
 * creating multiple anonymous users for the same client
 */
export async function createAnonymousHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check if client already has a valid session token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];

      try {
        // Try to verify the session token
        const payload = verifySessionToken(token);

        // If token is valid and user is anonymous, return existing user
        if (payload.isAnonymous) {
          const playerDoc = await db.collection('players').doc(payload.uid).get();

          if (playerDoc.exists) {
            const playerData = playerDoc.data() as any;

            // Update last login
            await db.collection('players').doc(payload.uid).update({
              lastLoginAt: admin.firestore.Timestamp.now().toDate(),
            });

            // Return existing user with refreshed token
            const refreshedToken = createSessionToken({
              uid: payload.uid,
              isAnonymous: true,
            });

            res.json(createSuccessResponse({
              uid: payload.uid,
              userName: playerData.userName,
              avatarIndex: playerData.avatarIndex,
              isAnonymous: true,
              isEmailVerified: false,
              token: refreshedToken,
            }));
            return;
          }
        }
      } catch (tokenError) {
        // Token is invalid or expired, proceed to create new anonymous user
        // This is expected behavior - we'll create a new user
      }
    }

    // No valid token found, create new anonymous user
    const result = await createAnonymousAccountServerSide();

    res.status(201).json(createSuccessResponse(result));
  } catch (error) {
    next(error);
  }
}

/**
 * Request password reset (forgot password).
 * Firebase sends the reset email to the user's mailbox automatically (no SMTP needed).
 * Requires FIREBASE_WEB_API_KEY to be set.
 */
export async function forgotPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      throw new AppError(ERROR_CODES.MISSING_REQUIRED_FIELD, 'Email is required');
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      throw new AppError(ERROR_CODES.MISSING_REQUIRED_FIELD, 'Email is required');
    }
    if (!isValidEmail(trimmedEmail)) {
      throw new AppError(ERROR_CODES.INVALID_INPUT, 'Invalid email format');
    }

    await requestPasswordResetEmail(trimmedEmail);

    res.json(
      createSuccessResponse({
        message: 'Password reset email sent. Check your mailbox or spam folder.',
      })
    );
  } catch (error) {
    next(error);
  }
}

/**
 * Reset password with token
 * Note: Firebase handles password reset via link
 * This endpoint can be used if you want to handle reset programmatically
 */
export async function resetPasswordHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const uid = req.uid!;
    const { newPassword } = req.body;

    if (!newPassword) {
      throw new AppError(ERROR_CODES.MISSING_REQUIRED_FIELD, 'New password is required');
    }

    await resetPassword(uid, newPassword);

    res.json(createSuccessResponse({ message: 'Password reset successfully' }));
  } catch (error) {
    next(error);
  }
}

