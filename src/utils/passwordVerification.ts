import axios from 'axios';
import { AppError, ERROR_CODES } from './errors';

/**
 * Verify password using Firebase REST API
 * This is necessary because Firebase Admin SDK cannot verify passwords directly
 */
export async function verifyPassword(
  email: string,
  password: string,
  apiKey: string
): Promise<{ idToken: string; localId: string }> {
  try {
    const response = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        email,
        password,
        returnSecureToken: true,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return {
      idToken: response.data.idToken,
      localId: response.data.localId,
    };
  } catch (error: any) {
    if (error.response) {
      const errorCode = error.response.data?.error?.message;
      if (errorCode === 'EMAIL_NOT_FOUND' || errorCode === 'INVALID_PASSWORD') {
        throw new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');
      }
      if (errorCode === 'USER_DISABLED') {
        throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User account is disabled');
      }
      if (errorCode === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Too many attempts. Please try again later', 429);
      }
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Password verification failed', 500);
  }
}

/**
 * Send password reset email via Firebase REST API.
 * Firebase sends the email to the user's mailbox automatically (no SMTP needed).
 */
export async function sendPasswordResetEmailViaFirebase(apiKey: string, email: string): Promise<void> {
  if (!apiKey) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Firebase Web API key not configured', 500);
  }
  try {
    await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
      {
        requestType: 'PASSWORD_RESET',
        email,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error: any) {
    const message = error.response?.data?.error?.message;
    if (message === 'EMAIL_NOT_FOUND') {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }
    if (message === 'INVALID_EMAIL') {
      throw new AppError(ERROR_CODES.INVALID_INPUT, 'Invalid email format');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to send password reset email', 500);
  }
}

