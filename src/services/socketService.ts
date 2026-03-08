import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { GameRoomService } from './gameRoomService';
import { MultiplayerGameService } from './multiplayerGameService';
import { GamePhase, GameAction } from '../types/multiplayer';

// Store socket ID to user ID mapping
const socketToUser = new Map<string, { userId: string; username: string }>();
const userToSocket = new Map<string, string>();
const startingRooms = new Set<string>();

export class SocketService {
  private io: SocketIOServer;

  constructor(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NODE_ENV === 'production'
          ? [
            'https://5carddraw.app',
            'https://5carddraw.net',
            'https://www.5carddraw.net',
          ]
          : ['http://localhost:3000', 'http://localhost:8080', 'http://127.0.0.1:3000', 'http://127.0.0.1:8080'],
        credentials: true,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'], // Support both for cross-platform compatibility
    });

    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[Socket] Client connected: ${socket.id}`);

      // Join room
      socket.on('join_room', async (data: { roomId: string; userId: string; username: string; avatarIndex?: number }) => {
        try {
          const avatarIndex = typeof data.avatarIndex === 'number' ? data.avatarIndex : 0;
          const result = await GameRoomService.joinRoom(data.roomId, data.userId, data.username, avatarIndex, socket.id);

          if (result.success && result.room) {
            socket.join(data.roomId);
            socketToUser.set(socket.id, { userId: data.userId, username: data.username });
            userToSocket.set(data.userId, socket.id);

            // Update connection status
            await GameRoomService.updatePlayerConnection(data.roomId, data.userId, socket.id, true);

            // Notify room
            this.io.to(data.roomId).emit('player_joined', {
              room: this.sanitizeRoom(result.room),
              player: {
                userId: data.userId,
                username: data.username,
                avatarIndex,
                seatIndex: result.room.players.find(p => p.userId === data.userId)?.seatIndex,
              },
            });

            socket.emit('join_room_success', {
              room: this.sanitizeRoom(result.room),
            });
            this.maybeStartCountdown(result.room.roomId);
          } else {
            if (result.error === 'Player already in room') {
              const room = await GameRoomService.getRoom(data.roomId);
              if (room) {
                socket.join(data.roomId);
                socketToUser.set(socket.id, { userId: data.userId, username: data.username });
                userToSocket.set(data.userId, socket.id);
                await GameRoomService.updatePlayerConnection(data.roomId, data.userId, socket.id, true);
                socket.emit('join_room_success', {
                  room: this.sanitizeRoom(room),
                });
                this.maybeStartCountdown(room.roomId);
                return;
              }
            }

            socket.emit('join_room_error', { error: result.error || 'Failed to join room' });
          }
        } catch (error: any) {
          console.error('[Socket] Join room error:', error);
          socket.emit('join_room_error', { error: error.message || 'Failed to join room' });
        }
      });

      // Leave room
      socket.on('leave_room', async (data: { roomId: string; userId: string }) => {
        try {
          const room = await GameRoomService.getRoom(data.roomId);
          if (!room) {
            return;
          }
          const userInfo = socketToUser.get(socket.id);
          const roomPlayer = room.players.find(player => player.socketId === socket.id);
          const effectiveUserId = userInfo?.userId || roomPlayer?.userId || data.userId;
          console.log('Leaving room:', room.hostId, effectiveUserId, data.userId);
          const result = await GameRoomService.leaveRoom(data.roomId, effectiveUserId);
          if (result.deleted) {
            this.io.to(data.roomId).emit('room_deleted', {
              roomId: data.roomId,
              reason: 'host_left',
            });
            startingRooms.delete(data.roomId);
            return;
          }
          if (result.success && result.room) {
            this.io.to(data.roomId).emit('player_left', {
              room: this.sanitizeRoom(result.room),
              playerId: effectiveUserId,
            });
          }
        } catch (error: any) {
          console.error('[Socket] Leave room error:', error);
        }
      });

      // Set player ready
      socket.on('set_ready', async (data: { roomId: string; userId: string; isReady: boolean }) => {
        try {
          const result = await GameRoomService.setPlayerReady(data.roomId, data.userId, data.isReady);

          if (result.success && result.room) {
            this.io.to(data.roomId).emit('player_ready_changed', {
              room: this.sanitizeRoom(result.room),
              playerId: data.userId,
              isReady: data.isReady,
            });
            this.maybeStartCountdown(result.room.roomId);
          }
        } catch (error: any) {
          console.error('[Socket] Set ready error:', error);
        }
      });

      // Start game
      socket.on('start_game', async (data: { roomId: string; userId: string }) => {
        try {
          const room = await GameRoomService.getRoom(data.roomId);
          if (!room || room.hostId !== data.userId) {
            socket.emit('start_game_error', { error: 'Only host can start the game' });
            return;
          }
          // Guard: if the auto-countdown already queued startRound, don't call it again.
          if (startingRooms.has(data.roomId)) {
            return;
          }
          await this.startRound(data.roomId, socket);
        } catch (error: any) {
          console.error('[Socket] Start game error:', error);
          socket.emit('start_game_error', { error: error.message || 'Failed to start game' });
        }
      });

      // Deal cards
      socket.on('deal_cards', async (data: { roomId: string; userId: string }) => {
        try {
          const room = await GameRoomService.getRoom(data.roomId);
          if (!room || room.hostId !== data.userId) {
            socket.emit('deal_cards_error', { error: 'Only host can deal cards' });
            return;
          }

          const result = await MultiplayerGameService.dealCards(data.roomId);

          if (result.success && result.room) {
            this.emitCardsDealt(result.room);
          } else {
            socket.emit('deal_cards_error', { error: result.error || 'Failed to deal cards' });
          }
        } catch (error: any) {
          console.error('[Socket] Deal cards error:', error);
          socket.emit('deal_cards_error', { error: error.message || 'Failed to deal cards' });
        }
      });

      // Exchange cards
      socket.on('exchange_cards', async (data: { roomId: string; userId: string; cardIndices: number[] }) => {
        try {
          const result = await MultiplayerGameService.exchangeCards(data.roomId, data.userId, data.cardIndices);

          if (result.success && result.room) {
            const hand = result.room.playerHands.get(data.userId);
            const playerSocket = this.io.sockets.sockets.get(userToSocket.get(data.userId) || '');

            if (playerSocket && hand) {
              playerSocket.emit('cards_exchanged', {
                cards: hand.cards,
                room: this.sanitizeRoom(result.room),
              });
            }

            // Notify all players
            this.io.to(data.roomId).emit('player_exchanged', {
              room: this.sanitizeRoom(result.room),
              playerId: data.userId,
            });
          } else {
            socket.emit('exchange_cards_error', { error: result.error || 'Failed to exchange cards' });
          }
        } catch (error: any) {
          console.error('[Socket] Exchange cards error:', error);
          socket.emit('exchange_cards_error', { error: error.message || 'Failed to exchange cards' });
        }
      });

      // Skip exchange
      socket.on('skip_exchange', async (data: { roomId: string; userId: string }) => {
        try {
          const result = await MultiplayerGameService.exchangeCards(data.roomId, data.userId, []);

          if (result.success && result.room) {
            this.io.to(data.roomId).emit('player_skipped_exchange', {
              room: this.sanitizeRoom(result.room),
              playerId: data.userId,
            });
          } else {
            socket.emit('skip_exchange_error', { error: result.error || 'Failed to skip exchange' });
          }
        } catch (error: any) {
          console.error('[Socket] Skip exchange error:', error);
          socket.emit('skip_exchange_error', { error: error.message || 'Failed to skip exchange' });
        }
      });

      // Betting action
      socket.on('betting_action', async (data: { roomId: string; userId: string; action: GameAction }) => {
        try {
          const result = await MultiplayerGameService.handleBettingAction(data.roomId, data.userId, data.action);

          if (result.success && result.room) {
            const room = result.room;
            this.io.to(data.roomId).emit('player_action', {
              room: this.sanitizeRoom(room),
              playerId: data.userId,
              action: data.action,
            });

            if (room.currentPhase === GamePhase.GameOver && room.lastShowdownHands) {
              this.io.to(data.roomId).emit('showdown_reveal', {
                room: this.sanitizeRoom(room),
                players: room.players
                  .filter(player => {
                    const hand = room.playerHands.get(player.userId);
                    return hand && !hand.hasFolded;
                  })
                  .map(player => ({
                    userId: player.userId,
                    cards: room.playerHands.get(player.userId)?.cards ?? [],
                  })),
              });

              this.io.to(data.roomId).emit('showdown_hands', {
                roomId: data.roomId,
                players: room.lastShowdownHands,
              });

              this.io.to(data.roomId).emit('showdown_result', {
                roomId: data.roomId,
                winnerId: room.lastWinnerId,
                handRank: room.lastShowdownHands.find(hand => hand.userId === room.lastWinnerId)?.handRank,
                potAmount: room.lastPotAmount ?? 0,
              });
            }
          } else {
            socket.emit('betting_action_error', { error: result.error || 'Failed to process action' });
          }
        } catch (error: any) {
          console.error('[Socket] Betting action error:', error);
          socket.emit('betting_action_error', { error: error.message || 'Failed to process action' });
        }
      });

      // Phase change
      socket.on('advance_phase', async (data: { roomId: string; userId: string; phase: GamePhase }) => {
        try {
          const room = await GameRoomService.getRoom(data.roomId);
          if (!room || room.hostId !== data.userId) {
            socket.emit('advance_phase_error', { error: 'Only host can advance phase' });
            return;
          }

          const result = await MultiplayerGameService.advancePhase(data.roomId, data.phase);

          if (result.success && result.room) {
            this.io.to(data.roomId).emit('phase_changed', {
              room: this.sanitizeRoom(result.room),
              phase: data.phase,
            });
          } else {
            socket.emit('advance_phase_error', { error: result.error || 'Failed to advance phase' });
          }
        } catch (error: any) {
          console.error('[Socket] Advance phase error:', error);
          socket.emit('advance_phase_error', { error: error.message || 'Failed to advance phase' });
        }
      });

      // Continue to next round
      socket.on('round_continue', async (data: { roomId: string; userId: string }) => {
        try {
          const room = await GameRoomService.getRoom(data.roomId);
          if (!room) {
            socket.emit('round_continue_error', { error: 'Room not found' });
            return;
          }

          if (!room.isActive) {
            socket.emit('round_continue_error', { error: 'Game finished' });
            return;
          }

          if (room.currentPhase !== GamePhase.GameOver) {
            socket.emit('round_continue_error', { error: 'Round not finished' });
            return;
          }

          room.continueReadyIds = room.continueReadyIds || [];
          if (!room.continueReadyIds.includes(data.userId)) {
            room.continueReadyIds.push(data.userId);
          }

          await GameRoomService.persistRoom(room);
          this.emitContinueState(data.roomId, room.continueReadyIds);

          // Re-fetch the room after persist to get the freshest player list (handles
          // disconnect-between-fetch-and-persist race condition).
          const freshRoom = await GameRoomService.getRoom(data.roomId);
          if (!freshRoom) return;
          // Only count connected players who still have chips — eliminated players
          // should not block the continue gate.
          const eligiblePlayers = freshRoom.players.filter(p => p.isConnected && p.tokenAmount > 0);
          const activeCount = eligiblePlayers.length || freshRoom.players.filter(p => p.isConnected).length || freshRoom.players.length;
          if ((freshRoom.continueReadyIds?.length ?? 0) >= activeCount) {
            freshRoom.continueReadyIds = [];
            await GameRoomService.persistRoom(freshRoom);
            await this.startRound(data.roomId);
            console.log('Round started:', data.roomId);
          }
        } catch (error: any) {
          console.error('[Socket] Round continue error:', error.message);
          socket.emit('round_continue_error', { error: error.message || 'Failed to continue round' });
        }
      });

      // Disconnect handler
      socket.on('disconnect', async () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);

        const userInfo = socketToUser.get(socket.id);
        if (userInfo) {
          // Find all rooms this user is in and update connection status
          const rooms = await GameRoomService.getActiveRooms();
          await Promise.all(rooms.map(async room => {
            const player = room.players.find(p => p.userId === userInfo.userId);
            if (!player) {
              return;
            }

            const result = await GameRoomService.leaveRoom(room.roomId, userInfo.userId);
            if (result.deleted) {
              this.io.to(room.roomId).emit('room_deleted', {
                roomId: room.roomId,
                reason: 'host_disconnected',
              });
              startingRooms.delete(room.roomId);
              return;
            }
            if (result.success && result.room) {
              // Remove disconnecting player from continueReadyIds and persist so the
              // round_continue threshold is immediately correct for remaining players.
              result.room.continueReadyIds = (result.room.continueReadyIds || []).filter(id => id !== userInfo.userId);
              await GameRoomService.persistRoom(result.room);
              this.io.to(room.roomId).emit('player_left', {
                room: this.sanitizeRoom(result.room),
                playerId: userInfo.userId,
              });
              // Re-evaluate threshold in case this disconnect unblocks the continue gate.
              const updatedRoom = await GameRoomService.getRoom(room.roomId);
              if (updatedRoom && updatedRoom.currentPhase === GamePhase.GameOver && updatedRoom.isActive) {
                const activeCount = updatedRoom.players.filter(p => p.isConnected && p.tokenAmount > 0).length
                  || updatedRoom.players.filter(p => p.isConnected).length
                  || updatedRoom.players.length;
                if ((updatedRoom.continueReadyIds?.length ?? 0) >= activeCount) {
                  updatedRoom.continueReadyIds = [];
                  await GameRoomService.persistRoom(updatedRoom);
                  await this.startRound(room.roomId);
                }
              }
            }
          }));

          socketToUser.delete(socket.id);
          userToSocket.delete(userInfo.userId);
        }
      });
    });
  }

  private sanitizeRoom(room: any): any {
    // Remove sensitive data and return sanitized room
    return {
      roomId: room.roomId,
      hostId: room.hostId,
      players: room.players.map((p: any) => ({
        userId: p.userId,
        username: p.username,
        avatarIndex: p.avatarIndex ?? 0,
        seatIndex: p.seatIndex,
        tokenAmount: p.tokenAmount,
        isReady: p.isReady,
        isConnected: p.isConnected,
      })),
      maxPlayers: room.maxPlayers,
      currentPhase: room.currentPhase,
      pot: room.pot,
      currentBet: room.currentBet,
      anteAmount: room.anteAmount,
      dealerIndex: room.dealerIndex,
      currentPlayerIndex: room.currentPlayerIndex,
      isActive: room.isActive,
      lastWinnerId: room.lastWinnerId,
      lastWinnerHandValue: room.lastWinnerHandValue,
    };
  }

  private isRoomReady(room: any): boolean {
    return room.players.length === room.maxPlayers &&
      room.players.every((player: any) => player.isReady && player.isConnected);
  }

  private maybeStartCountdown(roomId: string): void {
    if (startingRooms.has(roomId)) {
      return;
    }

    GameRoomService.getRoom(roomId).then(room => {
      if (!room) {
        return;
      }
      if (room.currentPhase !== GamePhase.Waiting) {
        return;
      }
      if (!this.isRoomReady(room)) {
        return;
      }

      startingRooms.add(roomId);
      this.io.to(roomId).emit('game_starting', {
        seconds: 3,
        message: 'Players are all ready.',
      });

      setTimeout(async () => {
        const latest = await GameRoomService.getRoom(roomId);
        if (!latest || latest.currentPhase !== GamePhase.Waiting || !this.isRoomReady(latest)) {
          startingRooms.delete(roomId);
          return;
        }
        await this.startRound(roomId);
        startingRooms.delete(roomId);
      }, 3000);
    });
  }

  private async startRound(roomId: string, socket?: Socket): Promise<void> {
    const room = await GameRoomService.getRoom(roomId);
    if (!room) {
      if (socket) {
        socket.emit('start_game_error', { error: 'Room not found' });
      }
      return;
    }
    if (!room.isActive) {
      if (socket) {
        socket.emit('start_game_error', { error: 'Game finished' });
      }
      return;
    }

    const startResult = await MultiplayerGameService.startGame(roomId);
    // startGame returns an error if the phase is not Waiting/None/GameOver,
    // which means startRound was already called for this round — abort silently.
    if (!startResult.success || !startResult.room) {
      return;
    }

    const anteResult = await MultiplayerGameService.collectAnte(roomId);
    if (!anteResult.success || !anteResult.room) {
      if (socket) {
        socket.emit('start_game_error', { error: anteResult.error || 'Failed to collect ante' });
      }
      return;
    }

    this.io.to(roomId).emit('game_started', {
      room: this.sanitizeRoom(anteResult.room),
    });

    const dealResult = await MultiplayerGameService.dealCards(roomId);
    if (!dealResult.success || !dealResult.room) {
      if (socket) {
        socket.emit('deal_cards_error', { error: dealResult.error || 'Failed to deal cards' });
      }
      return;
    }

    this.emitCardsDealt(dealResult.room);
  }

  private emitCardsDealt(room: any): void {
    room.players.forEach((player: any) => {
      const hand = room.playerHands.get(player.userId);
      const playerSocket = this.io.sockets.sockets.get(userToSocket.get(player.userId) || '');

      if (playerSocket && hand) {
        playerSocket.emit('cards_dealt', {
          cards: hand.cards,
          room: this.sanitizeRoom(room),
        });
      }
    });

    this.io.to(room.roomId).emit('cards_dealt_public', {
      room: this.sanitizeRoom(room),
    });
  }

  private emitContinueState(roomId: string, readyUserIds: string[]): void {
    this.io.to(roomId).emit('round_continue_state', {
      roomId,
      readyUserIds,
    });
  }

  public getIO(): SocketIOServer {
    return this.io;
  }
}
