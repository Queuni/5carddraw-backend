import { db } from '../config/firebase';
import { User, UpdateProfileRequest } from '../types';
import { AppError, ERROR_CODES } from '../utils/errors';
import { validateAvatarIndex, isValidUserName } from '../utils/validation';
import { validateUserNameUniqueness } from '../utils/userUtils';
import * as admin from 'firebase-admin';

/**
 * Get user profile by UID
 */
export async function getProfile(uid: string): Promise<User> {
  try {
    const playerDoc = await db.collection('players').doc(uid).get();

    if (!playerDoc.exists) {
      throw new AppError(ERROR_CODES.PROFILE_NOT_FOUND, 'Profile not found', 404);
    }

    const data = playerDoc.data()!;
    return {
      uid,
      ...data,
      createdAt: (data.createdAt as admin.firestore.Timestamp).toDate(),
      lastLoginAt: (data.lastLoginAt as admin.firestore.Timestamp).toDate(),
    } as User;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to get profile', 500);
  }
}

/**
 * Update user profile
 */
export async function updateProfile(uid: string, data: UpdateProfileRequest): Promise<User> {
  try {
    const updateData: any = {};
    const publicUpdateData: any = {};

    // Validate and update username
    if (data.userName !== undefined) {
      if (!isValidUserName(data.userName)) {
        throw new AppError(
          ERROR_CODES.INVALID_INPUT,
          'Username must be 1-20 characters (alphanumeric and spaces only)'
        );
      }
      
      // Check if userName is already taken by another user (case-insensitive)
      await validateUserNameUniqueness(data.userName, uid);
      
      const userNameLower = data.userName.toLowerCase().trim();
      updateData.userName = data.userName;
      updateData.userNameLower = userNameLower; // Store lowercase for case-insensitive queries
      publicUpdateData.userName = data.userName;
    }

    // Validate and update avatar index
    if (data.avatarIndex !== undefined) {
      const validatedIndex = validateAvatarIndex(data.avatarIndex);
      updateData.avatarIndex = validatedIndex;
      publicUpdateData.avatarIndex = validatedIndex;
    }

    if (Object.keys(updateData).length === 0) {
      // No updates, just return current profile
      return await getProfile(uid);
    }

    // Update public player document
    publicUpdateData.updatedAt = admin.firestore.Timestamp.now();

    // Update both collections in batch
    const batch = db.batch();

    batch.update(db.collection('players').doc(uid), updateData);
    batch.update(db.collection('publicPlayers').doc(uid), publicUpdateData);

    await batch.commit();

    // Return updated profile
    return await getProfile(uid);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to update profile', 500);
  }
}

