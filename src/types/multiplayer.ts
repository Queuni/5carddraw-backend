// Multiplayer game types

export interface PlayerInfo {
  userId: string;
  username: string;
  avatarIndex: number;
  socketId: string;
  seatIndex: number;
  tokenAmount: number;
  isReady: boolean;
  isConnected: boolean;
}

export interface Card {
  suit: number; // 0: Spades, 1: Clubs, 2: Diamonds, 3: Hearts
  rank: number; // 3-14 (3=Ace, 4=Two, ..., 14=King)
}

export interface PlayerHand {
  playerId: string;
  cards: Card[];
  selectedCards: number[]; // Indices of selected cards for exchange
  hasExchanged: boolean;
  hasFolded: boolean;
  hasActedThisRound: boolean;
  currentBet: number;
}

export enum GamePhase {
  None = 'None',
  Waiting = 'Waiting', // Waiting for players to join
  Ante = 'Ante',
  DealCards = 'DealCards',
  Exchange = 'Exchange',
  Betting = 'Betting',
  Showdown = 'Showdown',
  GameOver = 'GameOver'
}

export type RoomVisibility = 'public' | 'friends';

export interface GameRoom {
  roomId: string;
  roomName: string;
  hostId: string;
  hostUsername: string;
  visibility: RoomVisibility;
  invitedFriendIds: string[]; // For friends-only rooms
  players: PlayerInfo[];
  maxPlayers: number;
  currentPhase: GamePhase;
  pot: number;
  currentBet: number;
  anteAmount: number;
  dealerIndex: number;
  currentPlayerIndex: number;
  lastRaisePlayerIndex: number;
  deck: Card[];
  playerHands: Map<string, PlayerHand>;
  createdAt: Date;
  startedAt?: Date;
  isActive: boolean;
  lastWinnerId?: string;
  lastWinnerHandValue?: number;
  lastPotAmount?: number;
  lastShowdownHands?: Array<{
    userId: string;
    handRank: string;
    handValue: number;
  }>;
  continueReadyIds?: string[];
}

export interface GameAction {
  type: 'bet' | 'call' | 'raise' | 'fold' | 'exchange' | 'skip_exchange';
  amount?: number;
  cardIndices?: number[];
}

export interface GameEvent {
  type: 'player_joined' | 'player_left' | 'game_started' | 'phase_changed' |
  'player_action' | 'cards_dealt' | 'cards_exchanged' | 'round_complete' |
  'game_over' | 'error';
  data: any;
  timestamp: Date;
}
