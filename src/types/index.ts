// User and Authentication Types
export interface User {
  uid: string;
  email?: string;
  userName: string;
  userNameLower?: string; // Internal field for case-insensitive queries
  avatarIndex: number;
  isAnonymous: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  lastLoginAt: Date;
}

export interface PublicPlayer {
  uid: string;
  userName: string;
  avatarIndex: number;
  updatedAt: Date;
}

export interface SignupRequest {
  email: string;
  password: string;
  userName: string;
  avatarIndex?: number;
}

export interface SigninRequest {
  identifier: string; // Can be email or userName
  password: string;
}

export interface UpdateProfileRequest {
  userName?: string;
  avatarIndex?: number;
}

export interface AuthResponse {
  uid: string;
  email?: string;
  userName: string;
  avatarIndex: number;
  isAnonymous: boolean;
  isEmailVerified: boolean;
  token: string; // Firebase ID token
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

// Constants
export const AVATAR_CONFIG = {
  MAX_AVATARS: 10,
  DEFAULT_AVATAR_INDEX: 0,
};

