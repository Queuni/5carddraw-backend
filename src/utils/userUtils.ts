import { db } from '../config/firebase';
import { AppError, ERROR_CODES } from './errors';

/**
 * Check if userName is already taken by another user (case-insensitive)
 * @param userName - The userName to check
 * @param excludeUid - UID to exclude from check (current user)
 * @returns true if userName is available, false if taken
 */
export async function isUserNameAvailable(userName: string, excludeUid?: string): Promise<boolean> {
  const userNameLower = userName.toLowerCase().trim();
  
  // Query using userNameLower field for case-insensitive check
  const existingUserQuery = await db.collection('players')
    .where('userNameLower', '==', userNameLower)
    .limit(1)
    .get();
  
  if (existingUserQuery.empty) {
    return true;
  }
  
  const existingUser = existingUserQuery.docs[0];
  
  // If excludeUid is provided and matches, userName is available for this user
  if (excludeUid && existingUser.id === excludeUid) {
    return true;
  }
  
  return false;
}

/**
 * Check if userName is taken and throw error if it is
 * @param userName - The userName to check
 * @param excludeUid - UID to exclude from check (current user)
 * @throws AppError if userName is already taken
 */
export async function validateUserNameUniqueness(userName: string, excludeUid?: string): Promise<void> {
  const isAvailable = await isUserNameAvailable(userName, excludeUid);
  
  if (!isAvailable) {
    throw new AppError(ERROR_CODES.USERNAME_ALREADY_EXISTS, 'Username already taken');
  }
}

