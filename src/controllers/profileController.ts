import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { getProfile, updateProfile } from '../services/profileService';
import { deleteAccount } from '../services/authService';
import { createSuccessResponse } from '../utils/errors';
import { UpdateProfileRequest } from '../types';

/**
 * Get current user profile
 */
export async function getProfileHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const uid = req.uid!;
    const profile = await getProfile(uid);

    res.json(createSuccessResponse(profile));
  } catch (error) {
    next(error);
  }
}

/**
 * Update current user profile
 */
export async function updateProfileHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const uid = req.uid!;
    const updateData: UpdateProfileRequest = req.body;

    const updatedProfile = await updateProfile(uid, updateData);

    res.json(createSuccessResponse(updatedProfile));
  } catch (error) {
    next(error);
  }
}

/**
 * Delete current user account (requires authentication).
 */
export async function deleteAccountHandler(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const uid = req.uid!;
    await deleteAccount(uid);
    res.json(createSuccessResponse({ message: 'Account deleted' }));
  } catch (error) {
    next(error);
  }
}

