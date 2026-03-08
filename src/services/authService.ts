import { auth, db } from '../config/firebase';
import { User, SignupRequest, SigninRequest, AuthResponse, AVATAR_CONFIG } from '../types';
import { AppError, ERROR_CODES } from '../utils/errors';
import { validateAvatarIndex, isValidEmail, isValidPassword, isValidUserName } from '../utils/validation';
import { validateUserNameUniqueness } from '../utils/userUtils';
import { verifyPassword, sendPasswordResetEmailViaFirebase } from '../utils/passwordVerification';
import { createSessionToken } from '../utils/sessionToken';
import * as admin from 'firebase-admin';

/**
 * Helper function to update last login and get user profile
 */
async function updateLastLoginAndGetProfile(uid: string): Promise<Omit<User, 'uid'>> {
  // Update last login
  await db.collection('players').doc(uid).update({
    lastLoginAt: admin.firestore.Timestamp.now(),
  });

  // Get user profile
  const playerDoc = await db.collection('players').doc(uid).get();
  if (!playerDoc.exists) {
    throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User profile not found');
  }

  return playerDoc.data() as Omit<User, 'uid'>;
}

/**
 * Create a new user account with email/password
 */
export async function signup(data: SignupRequest): Promise<AuthResponse> {
  // Validate input
  if (!isValidEmail(data.email)) {
    throw new AppError(ERROR_CODES.INVALID_INPUT, 'Invalid email format');
  }

  if (!isValidPassword(data.password)) {
    throw new AppError(ERROR_CODES.INVALID_INPUT, 'Password must be at least 6 characters');
  }

  if (!isValidUserName(data.userName)) {
    throw new AppError(ERROR_CODES.INVALID_INPUT, 'Username must be 1-20 characters (alphanumeric and spaces only)');
  }

  const avatarIndex = validateAvatarIndex(data.avatarIndex);
  const userNameLower = data.userName.toLowerCase().trim();

  try {
    let userRecord;

    // Check if user already exists in Firebase Auth
    try {
      userRecord = await auth.getUserByEmail(data.email);
      // User exists, we'll update/create the profile
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[signup] User already exists in Firebase Auth: ${userRecord.uid}`);
      }

      // Check if userName is taken by another user (case-insensitive)
      await validateUserNameUniqueness(data.userName, userRecord.uid);
    } catch (getUserError: any) {
      // User doesn't exist, create new one
      if (getUserError.code === 'auth/user-not-found') {
        // Check if userName is already taken before creating user (case-insensitive)
        await validateUserNameUniqueness(data.userName);

        userRecord = await auth.createUser({
          email: data.email,
          password: data.password,
          displayName: data.userName, // Firebase Auth uses displayName, but we store as userName in Firestore
          emailVerified: false,
        });
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[signup] Created new Firebase Auth user: ${userRecord.uid}`);
        }
      } else {
        throw getUserError;
      }
    }

    // Check if profile already exists in Firestore
    const playerDoc = await db.collection('players').doc(userRecord.uid).get();
    const now = admin.firestore.Timestamp.now();

    if (playerDoc.exists) {
      // Profile exists, update it
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[signup] Profile exists, updating: ${userRecord.uid}`);
      }
      await db.collection('players').doc(userRecord.uid).update({
        email: data.email,
        userName: data.userName,
        userNameLower, // Store lowercase for case-insensitive queries
        avatarIndex,
        isAnonymous: false,
        lastLoginAt: now.toDate(),
      });

      // Update public player document
      await db.collection('publicPlayers').doc(userRecord.uid).update({
        userName: data.userName,
        avatarIndex,
        updatedAt: now,
      });
    } else {
      // Profile doesn't exist, create it
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[signup] Creating new profile: ${userRecord.uid}`);
      }
      const userData: Omit<User, 'uid'> = {
        email: data.email,
        userName: data.userName,
        userNameLower, // Store lowercase for case-insensitive queries
        avatarIndex,
        isAnonymous: false,
        isEmailVerified: userRecord.emailVerified || false,
        createdAt: now.toDate(),
        lastLoginAt: now.toDate(),
      };

      // Create player document
      await db.collection('players').doc(userRecord.uid).set(userData);

      // Create public player document
      await db.collection('publicPlayers').doc(userRecord.uid).set({
        userName: data.userName,
        avatarIndex,
        updatedAt: now,
      });
    }

    // Generate secure session token for client
    const sessionToken = createSessionToken({
      uid: userRecord.uid,
      email: data.email,
      isAnonymous: false,
    });

    return {
      uid: userRecord.uid,
      email: data.email,
      userName: data.userName,
      avatarIndex,
      isAnonymous: false,
      isEmailVerified: userRecord.emailVerified || false,
      token: sessionToken,
    };
  } catch (error: any) {
    if (error.code === 'auth/email-already-exists') {
      throw new AppError(ERROR_CODES.EMAIL_ALREADY_EXISTS, 'Email already registered');
    }
    if (error.code === 'auth/invalid-email') {
      throw new AppError(ERROR_CODES.INVALID_INPUT, 'Invalid email format');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to create account', 500);
  }
}

/**
 * Sign in with email/password
 * SECURITY: Verifies password using Firebase REST API before creating session token
 */
export async function signin(data: SigninRequest): Promise<AuthResponse> {
  let userEmail: string;
  let userRecord;
  let uid: string;

  // Check if identifier is an email or userName
  if (isValidEmail(data.identifier)) {
    // It's an email, use it directly
    userEmail = data.identifier;
    try {
      userRecord = await auth.getUserByEmail(userEmail);
      uid = userRecord.uid;
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found');
      }
      throw error;
    }
  } else {
    // It's a userName, look up the user in Firestore first (case-insensitive)
    const userNameLower = data.identifier.toLowerCase().trim();
    const userNameQuery = await db.collection('players')
      .where('userNameLower', '==', userNameLower)
      .limit(1)
      .get();

    if (userNameQuery.empty) {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }

    const playerData = userNameQuery.docs[0].data() as Omit<User, 'uid'>;
    uid = userNameQuery.docs[0].id;

    if (!playerData.email) {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User email not found');
    }

    userEmail = playerData.email;
    try {
      userRecord = await auth.getUser(uid);
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found');
      }
      throw error;
    }
  }

  // SECURITY: Verify password using Firebase REST API
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Firebase API key not configured', 500);
  }

  try {
    // Verify password - this will throw if password is incorrect
    await verifyPassword(userEmail, data.password, apiKey);
  } catch (error: any) {
    // Re-throw password verification errors
    throw error;
  }

  try {
    // Password verified - create secure session token
    const sessionToken = createSessionToken({
      uid,
      email: userEmail,
      isAnonymous: false,
    });

    // Update last login and get user profile
    const playerData = await updateLastLoginAndGetProfile(uid);

    return {
      uid,
      email: playerData.email,
      userName: playerData.userName,
      avatarIndex: playerData.avatarIndex,
      isAnonymous: false,
      isEmailVerified: userRecord.emailVerified,
      token: sessionToken, // Return secure session token instead of custom token
    };
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    if (error.code === 'auth/user-not-found') {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }
    if (error.code === 'auth/invalid-email') {
      throw new AppError(ERROR_CODES.INVALID_INPUT, 'Invalid email format');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Sign in failed', 500);
  }
}

/**
 * Verify ID token and return user info
 * This is the recommended way for client authentication
 */
export async function verifyIdToken(idToken: string): Promise<AuthResponse> {
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Update last login and get user profile
    const playerData = await updateLastLoginAndGetProfile(uid);

    return {
      uid,
      email: playerData.email,
      userName: playerData.userName,
      avatarIndex: playerData.avatarIndex,
      isAnonymous: decodedToken.firebase.sign_in_provider === 'anonymous',
      isEmailVerified: decodedToken.email_verified || false,
      token: idToken, // Return the same token
    };
  } catch (error: any) {
    if (error.code === 'auth/id-token-expired') {
      throw new AppError(ERROR_CODES.TOKEN_EXPIRED, 'Token has expired', 401);
    }
    if (error.code === 'auth/id-token-revoked') {
      throw new AppError(ERROR_CODES.INVALID_TOKEN, 'Token has been revoked', 401);
    }
    throw new AppError(ERROR_CODES.INVALID_TOKEN, 'Invalid token', 401);
  }
}

/**
 * Create anonymous account server-side (for WebGL compatibility)
 * Creates only the player profile in Firestore (no Firebase Auth user needed)
 * Uses custom JWT session tokens for authentication
 */
export async function createAnonymousAccountServerSide(): Promise<AuthResponse> {
  try {
    // Generate a unique UID for anonymous user
    const uid = `anon_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    // Check if profile already exists (shouldn't, but just in case)
    const existingProfile = await db.collection('players').doc(uid).get();

    if (existingProfile.exists) {
      // Profile exists, return it
      const playerData = existingProfile.data() as Omit<User, 'uid'>;
      const sessionToken = createSessionToken({
        uid,
        isAnonymous: true,
      });
      return {
        uid,
        userName: playerData.userName,
        avatarIndex: playerData.avatarIndex,
        isAnonymous: true,
        isEmailVerified: false,
        token: sessionToken,
      };
    }

    const now = admin.firestore.Timestamp.now();
    const userName = `Anonymous Player ${uid.substring(0, 6)}`;

    // Create player document
    const userData: Omit<User, 'uid'> = {
      userName,
      avatarIndex: AVATAR_CONFIG.DEFAULT_AVATAR_INDEX,
      isAnonymous: true,
      isEmailVerified: false,
      createdAt: now.toDate(),
      lastLoginAt: now.toDate(),
    };

    await db.collection('players').doc(uid).set(userData);

    // Create public player document
    await db.collection('publicPlayers').doc(uid).set({
      userName,
      avatarIndex: AVATAR_CONFIG.DEFAULT_AVATAR_INDEX,
      updatedAt: now,
    });

    // Generate secure session token for client
    const sessionToken = createSessionToken({
      uid,
      isAnonymous: true,
    });

    return {
      uid,
      userName,
      avatarIndex: AVATAR_CONFIG.DEFAULT_AVATAR_INDEX,
      isAnonymous: true,
      isEmailVerified: false,
      token: sessionToken,
    };
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to create anonymous account', 500);
  }
}

/**
 * Create anonymous account
 * Note: Firebase Admin SDK cannot create anonymous users directly.
 * Anonymous users must be created client-side using Firebase Auth SDK.
 * 
 * This function is used when an anonymous user (created client-side) first
 * interacts with the backend. It creates the player profile in Firestore.
 */
export async function createAnonymousAccount(uid: string): Promise<AuthResponse> {
  try {
    // Verify the user exists and is anonymous
    await auth.getUser(uid);

    // Note: We don't check email here since server-created anonymous users may have different structure

    // Check if profile already exists
    const existingProfile = await db.collection('players').doc(uid).get();
    if (existingProfile.exists) {
      // Profile exists, return it
      const playerData = existingProfile.data() as Omit<User, 'uid'>;
      return {
        uid,
        userName: playerData.userName,
        avatarIndex: playerData.avatarIndex,
        isAnonymous: true,
        isEmailVerified: false,
        token: '', // Client should use their own ID token
      };
    }

    const now = admin.firestore.Timestamp.now();
    const userName = `Anonymous Player ${uid.substring(0, 6)}`;

    // Create player document
    const userData: Omit<User, 'uid'> = {
      userName,
      avatarIndex: AVATAR_CONFIG.DEFAULT_AVATAR_INDEX,
      isAnonymous: true,
      isEmailVerified: false,
      createdAt: now.toDate(),
      lastLoginAt: now.toDate(),
    };

    await db.collection('players').doc(uid).set(userData);

    // Create public player document
    await db.collection('publicPlayers').doc(uid).set({
      userName,
      avatarIndex: AVATAR_CONFIG.DEFAULT_AVATAR_INDEX,
      updatedAt: now,
    });

    return {
      uid,
      userName,
      avatarIndex: AVATAR_CONFIG.DEFAULT_AVATAR_INDEX,
      isAnonymous: true,
      isEmailVerified: false,
      token: '', // Client should use their own ID token
    };
  } catch (error: any) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to create anonymous account', 500);
  }
}

/**
 * Generate password reset link (Admin SDK).
 * Use requestPasswordResetEmail() instead if you want Firebase to send the email automatically.
 */
export async function generatePasswordResetLink(email: string): Promise<string> {
  try {
    return await auth.generatePasswordResetLink(email);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to generate password reset link', 500);
  }
}

/**
 * Request password reset: Firebase sends the reset email to the user's mailbox automatically.
 * Uses Firebase REST API (sendOobCode). Requires FIREBASE_WEB_API_KEY.
 */
export async function requestPasswordResetEmail(email: string): Promise<void> {
  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  await sendPasswordResetEmailViaFirebase(apiKey!, email);
}

/**
 * Reset password with token
 */
export async function resetPassword(uid: string, newPassword: string): Promise<void> {
  if (!isValidPassword(newPassword)) {
    throw new AppError(ERROR_CODES.INVALID_INPUT, 'Password must be at least 6 characters');
  }

  try {
    await auth.updateUser(uid, {
      password: newPassword,
    });
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      throw new AppError(ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to reset password', 500);
  }
}

/**
 * Delete user account: remove Firestore data and Firebase Auth user.
 */
export async function deleteAccount(uid: string): Promise<void> {
  if (!uid) {
    throw new AppError(ERROR_CODES.MISSING_REQUIRED_FIELD, 'User ID is required');
  }

  const batch = db.batch();
  batch.delete(db.collection('players').doc(uid));
  batch.delete(db.collection('publicPlayers').doc(uid));
  batch.delete(db.collection('multiplayerLeaderboardStats').doc(uid));
  await batch.commit();

  try {
    await auth.deleteUser(uid);
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      return;
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to delete account', 500);
  }
}

