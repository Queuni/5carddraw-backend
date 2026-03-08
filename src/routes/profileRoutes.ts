import { Router } from 'express';
import { getProfileHandler, updateProfileHandler, deleteAccountHandler } from '../controllers/profileController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// All profile routes require authentication
router.use(verifyToken);

router.get('/', getProfileHandler);
router.put('/', updateProfileHandler);
router.delete('/', deleteAccountHandler);

export default router;

