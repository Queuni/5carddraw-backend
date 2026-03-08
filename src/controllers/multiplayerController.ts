import { Request, Response } from 'express';
import { GameRoomService } from '../services/gameRoomService';
import { LeaderboardService } from '../services/leaderboardService';
import { GamePhase, RoomVisibility } from '../types/multiplayer';
import { getProfile } from '../services/profileService';
import { AuthenticatedRequest } from '../middleware/auth';
import { ApiResponse } from '../types';

/**
 * Create a new game room
 */
export const createRoom = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.uid;
    if (!uid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      } as ApiResponse);
    }

    const rawRoomName = typeof req.body?.roomName === 'string' ? req.body.roomName : '';
    const roomName = sanitizeRoomName(rawRoomName);
    if (!roomName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Room name is required',
        },
      } as ApiResponse);
    }

    const visibility = parseVisibility(req.body?.visibility);
    if (!visibility) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid room visibility',
        },
      } as ApiResponse);
    }

    // Fetch user profile to get username
    const profile = await getProfile(uid);

    // Socket ID will be set when player connects via WebSocket
    const room = await GameRoomService.createRoom(
      uid,
      profile.userName,
      profile.avatarIndex ?? 0,
      '',
      roomName,
      visibility
    );

    return res.json({
      success: true,
      data: {
        roomId: room.roomId,
        hostId: room.hostId,
        maxPlayers: room.maxPlayers,
      },
    } as ApiResponse);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to create room',
      },
    } as ApiResponse);
  }
};

/**
 * Get room information
 */
export const getRoom = async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Room ID is required',
        },
      } as ApiResponse);
    }

    const room = await GameRoomService.getRoom(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROOM_NOT_FOUND',
          message: 'Room not found',
        },
      } as ApiResponse);
    }

    // Return sanitized room data (without sensitive info)
    return res.json({
      success: true,
      data: {
        roomId: room.roomId,
        hostId: room.hostId,
        players: room.players.map(p => ({
          userId: p.userId,
          username: p.username,
          avatarIndex: p.avatarIndex ?? 0,
          seatIndex: p.seatIndex,
          tokenAmount: p.tokenAmount,
          isReady: p.isReady,
        })),
        maxPlayers: room.maxPlayers,
        currentPhase: room.currentPhase,
        pot: room.pot,
        currentBet: room.currentBet,
        anteAmount: room.anteAmount,
        currentPlayerIndex: room.currentPlayerIndex,
        isActive: room.isActive,
        lastWinnerId: room.lastWinnerId,
        lastWinnerHandValue: room.lastWinnerHandValue,
      },
    } as ApiResponse);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to get room',
      },
    } as ApiResponse);
  }
};

/**
 * Get list of available rooms
 */
export const getAvailableRooms = async (_req: Request, res: Response) => {
  try {
    const rooms = await GameRoomService.getPublicRooms();
    // Return sanitized room list
    const roomList = rooms.map(room => {
      const connectedUsers = new Set(
        room.players
          .filter(player => player.isConnected)
          .map(player => player.userId)
      );

      const connectedCount = connectedUsers.size;
      const joinedCount = Math.max(0, connectedCount - 1);

      return {
        roomId: room.roomId,
        roomName: room.roomName,
        hostUsername: room.hostUsername,
        playerCount: connectedCount,
        joinedCount,
        maxPlayers: room.maxPlayers,
        currentPhase: room.currentPhase,
        isActive: room.isActive,
        createdAt: room.createdAt,
      };
    });

    res.json({
      success: true,
      data: {
        rooms: roomList.filter(room => room.playerCount < room.maxPlayers && room.currentPhase === GamePhase.Waiting),
      },
    } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to get rooms',
      },
    } as ApiResponse);
  }
};

/**
 * Delete a room (host only)
 */
export const deleteRoom = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.uid;
    if (!uid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      } as ApiResponse);
    }

    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Room ID is required',
        },
      } as ApiResponse);
    }

    const room = await GameRoomService.getRoom(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ROOM_NOT_FOUND',
          message: 'Room not found',
        },
      } as ApiResponse);
    }

    if (room.hostId !== uid) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only the host can delete the room',
        },
      } as ApiResponse);
    }

    await GameRoomService.deleteRoom(roomId);
    return res.json({
      success: true,
      data: {
        roomId,
      },
    } as ApiResponse);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to delete room',
      },
    } as ApiResponse);
  }
};

/**
 * Get multiplayer leaderboard
 */
export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const limitParam = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
    const limit = Number.isFinite(limitParam) ? limitParam! : 30;
    const entries = await LeaderboardService.getMultiplayerLeaderboard(limit);

    return res.json({
      success: true,
      data: {
        entries: entries.map((entry, index) => ({
          rank: index + 1,
          player: entry.userName,
          winChips: entry.totalChips,
          wins: entry.winCount,
        })),
      },
    } as ApiResponse);
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message || 'Failed to get leaderboard',
      },
    } as ApiResponse);
  }
};

const MAX_ROOM_NAME_LENGTH = 24;

const sanitizeRoomName = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/\s+/g, ' ');
  if (normalized.length > MAX_ROOM_NAME_LENGTH) {
    return normalized.substring(0, MAX_ROOM_NAME_LENGTH);
  }

  return normalized;
};

const parseVisibility = (value: any): RoomVisibility | null => {
  if (value === 'public' || value === 'friends') {
    return value;
  }
  if (value === undefined || value === null || value === '') {
    return 'public';
  }
  return null;
};
