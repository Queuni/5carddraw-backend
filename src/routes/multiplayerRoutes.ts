import { Router } from 'express';
import { createRoom, getRoom, getAvailableRooms, deleteRoom, getLeaderboard } from '../controllers/multiplayerController';
import { verifyToken } from '../middleware/auth';

const router = Router();

// Create room (requires authentication)
router.post('/rooms', verifyToken, createRoom);

// Get room info (public, but sensitive data filtered)
router.get('/rooms/:roomId', getRoom);

// Get available rooms (public)
router.get('/rooms', getAvailableRooms);

// Get multiplayer leaderboard (public)
router.get('/leaderboard', getLeaderboard);

// Delete room (host only)
router.delete('/rooms/:roomId', verifyToken, deleteRoom);

export default router;
