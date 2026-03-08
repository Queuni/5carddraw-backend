import { Router } from 'express';
import authRoutes from './authRoutes';
import profileRoutes from './profileRoutes';
import multiplayerRoutes from './multiplayerRoutes';
import { getVersionInfo } from '../utils/version';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  const versionInfo = getVersionInfo();
  res.json({
    status: 'ok',
    ...versionInfo,
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/multiplayer', multiplayerRoutes);

export default router;

