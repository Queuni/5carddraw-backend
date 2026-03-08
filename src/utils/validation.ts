import { AVATAR_CONFIG } from '../types';

/**
 * Validate and normalize avatar index
 */
export function validateAvatarIndex(index: number | undefined): number {
  if (index === undefined || index === null) {
    return AVATAR_CONFIG.DEFAULT_AVATAR_INDEX;
  }
  
  if (typeof index !== 'number' || isNaN(index)) {
    return AVATAR_CONFIG.DEFAULT_AVATAR_INDEX;
  }
  
  if (index < 0 || index >= AVATAR_CONFIG.MAX_AVATARS) {
    return AVATAR_CONFIG.DEFAULT_AVATAR_INDEX;
  }
  
  return Math.floor(index);
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function isValidPassword(password: string): boolean {
  // At least 6 characters
  return password.length >= 6;
}

/**
 * Validate username
 */
export function isValidUserName(name: string): boolean {
  // 1-20 characters, alphanumeric and spaces
  const nameRegex = /^[a-zA-Z0-9\s]{1,20}$/;
  return nameRegex.test(name);
}

