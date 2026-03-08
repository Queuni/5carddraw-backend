import { randomUUID } from 'crypto';
import { GamePhase, GameRoom, PlayerInfo, RoomVisibility } from '../types/multiplayer';

type RoomMutationResult = { success: boolean; room?: GameRoom; error?: string; deleted?: boolean };

const MAX_PLAYERS = 4;
const STARTING_TOKENS = 100;
const ANTE_AMOUNT = 5;

const rooms = new Map<string, GameRoom>();

const generateRoomId = (): string => {
  try {
    return randomUUID();
  } catch {
    return `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
};

const findOpenSeat = (room: GameRoom): number => {
  const taken = new Set(room.players.map(p => p.seatIndex));
  for (let i = 0; i < room.maxPlayers; i += 1) {
    if (!taken.has(i)) {
      return i;
    }
  }
  return room.players.length;
};

export class GameRoomService {
  static async createRoom(
    hostId: string,
    hostUsername: string,
    hostAvatarIndex: number,
    socketId: string,
    roomName: string,
    visibility: RoomVisibility
  ): Promise<GameRoom> {
    const roomId = generateRoomId();
    const now = new Date();

    const hostPlayer: PlayerInfo = {
      userId: hostId,
      username: hostUsername,
      avatarIndex: hostAvatarIndex,
      socketId,
      seatIndex: 0,
      tokenAmount: STARTING_TOKENS,
      isReady: false,
      isConnected: true,
    };

    const room: GameRoom = {
      roomId,
      roomName,
      hostId,
      hostUsername,
      visibility,
      invitedFriendIds: [],
      players: [hostPlayer],
      maxPlayers: MAX_PLAYERS,
      currentPhase: GamePhase.Waiting,
      pot: 0,
      currentBet: 0,
      anteAmount: ANTE_AMOUNT,
      dealerIndex: 0,
      currentPlayerIndex: 0,
      lastRaisePlayerIndex: -1,
      deck: [],
      playerHands: new Map(),
      createdAt: now,
      isActive: true,
      lastWinnerId: undefined,
      lastWinnerHandValue: undefined,
      lastShowdownHands: [],
      continueReadyIds: [],
    };

    rooms.set(roomId, room);
    return room;
  }

  static async getRoom(roomId: string): Promise<GameRoom | null> {
    return rooms.get(roomId) ?? null;
  }

  static async getPublicRooms(): Promise<GameRoom[]> {
    return Array.from(rooms.values()).filter(room => room.visibility === 'public' && room.isActive);
  }

  static async getActiveRooms(): Promise<GameRoom[]> {
    return Array.from(rooms.values()).filter(room => room.isActive);
  }

  static async joinRoom(
    roomId: string,
    userId: string,
    username: string,
    avatarIndex: number,
    socketId: string
  ): Promise<RoomMutationResult> {
    const room = rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const existing = room.players.find(player => player.userId === userId);
    if (existing) {
      existing.socketId = socketId;
      existing.isConnected = true;
      return { success: true, room };
    }

    if (room.players.length >= room.maxPlayers) {
      return { success: false, error: 'Room is full' };
    }

    if (room.currentPhase !== GamePhase.Waiting) {
      return { success: false, error: 'Game already started' };
    }

    const seatIndex = findOpenSeat(room);
    room.players.push({
      userId,
      username,
      avatarIndex,
      socketId,
      seatIndex,
      tokenAmount: STARTING_TOKENS,
      isReady: false,
      isConnected: true,
    });

    rooms.set(roomId, room);
    return { success: true, room };
  }

  static async leaveRoom(roomId: string, userId: string): Promise<RoomMutationResult> {
    const room = rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (room.hostId === userId) {
      rooms.delete(roomId);
      return { success: true, deleted: true };
    }

    const beforeCount = room.players.length;
    room.players = room.players.filter(player => player.userId !== userId);
    room.playerHands.delete(userId);

    if (room.players.length === 0) {
      rooms.delete(roomId);
      return { success: true, deleted: true };
    }

    if (room.players.length !== beforeCount) {
      rooms.set(roomId, room);
    }
    room.continueReadyIds = (room.continueReadyIds || []).filter(id => id !== userId);

    return { success: true, room };
  }

  static async updatePlayerConnection(
    roomId: string,
    userId: string,
    socketId: string,
    isConnected: boolean
  ): Promise<RoomMutationResult> {
    const room = rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const player = room.players.find(p => p.userId === userId);
    if (!player) {
      return { success: false, error: 'Player not found in room' };
    }

    player.socketId = socketId;
    player.isConnected = isConnected;
    rooms.set(roomId, room);
    return { success: true, room };
  }

  static async setPlayerReady(roomId: string, userId: string, isReady: boolean): Promise<RoomMutationResult> {
    const room = rooms.get(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    const player = room.players.find(p => p.userId === userId);
    if (!player) {
      return { success: false, error: 'Player not found in room' };
    }

    player.isReady = isReady;
    rooms.set(roomId, room);
    return { success: true, room };
  }

  static async persistRoom(room: GameRoom): Promise<void> {
    rooms.set(room.roomId, room);
  }

  static async deleteRoom(roomId: string): Promise<void> {
    rooms.delete(roomId);
  }
}
