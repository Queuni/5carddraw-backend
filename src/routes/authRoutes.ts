import { Router } from 'express';
import {
  signupHandler,
  signinHandler,
  verifyTokenHandler,
  anonymousHandler,
  createAnonymousHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
} from '../controllers/authController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Public routes
router.post('/signup', signupHandler);
router.post('/signin', signinHandler);
router.post('/verify-token', verifyTokenHandler); // Verify ID token from client
router.post('/create-anonymous', createAnonymousHandler); // Create anonymous user server-side (for WebGL)
router.post('/forgot-password', forgotPasswordHandler);

// Protected routes (require authentication)
router.post('/anonymous', verifyToken, anonymousHandler); // Anonymous users need ID token
router.post('/reset-password', verifyToken, resetPasswordHandler);

export default router;

