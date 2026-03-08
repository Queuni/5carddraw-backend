import { GameAction, GamePhase, GameRoom, PlayerHand } from '../types/multiplayer';
import { GameRoomService } from './gameRoomService';
import { LeaderboardService } from './leaderboardService';

type GameResult = { success: boolean; room?: GameRoom; error?: string };

const CARDS_PER_PLAYER = 5;
const MAX_EXCHANGE = 4;
const STARTING_BET_OPTIONS = new Set([5, 10, 25]);
const MAX_RANK = 15; // 15 represents "2" to match client mapping

type Card = { suit: number; rank: number };

const buildDeck = (): Card[] => {
  const deck: Card[] = [];
  const ranks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  for (let suit = 0; suit < 4; suit += 1) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck;
};

const shuffle = <T>(list: T[]): void => {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
};

const normalizeRank = (rank: number): number => (rank === MAX_RANK ? 2 : rank);

const evaluateHand = (hand: Card[]): { handValue: number; handRank: string } => {
  if (hand.length !== CARDS_PER_PLAYER) {
    return { handValue: 0, handRank: 'HighCard' };
  }

  const sorted = [...hand].sort((a, b) => a.rank - b.rank);
  const suits = new Set(sorted.map(card => card.suit));
  const isFlush = suits.size === 1;

  const normalizedRanks = sorted.map(card => normalizeRank(card.rank)).sort((a, b) => a - b);
  const isStraight = normalizedRanks.every((rank, idx, arr) => idx === 0 || rank === arr[idx - 1] + 1);
  const isWheel = normalizedRanks.join(',') === '2,3,4,5,14';

  const rankCounts = new Map<number, number>();
  for (const card of sorted) {
    rankCounts.set(card.rank, (rankCounts.get(card.rank) ?? 0) + 1);
  }

  const groups = Array.from(rankCounts.entries()).sort((a, b) => b[1] - a[1] || normalizeRank(b[0]) - normalizeRank(a[0]));

  if (isFlush && normalizedRanks[0] === 10 && normalizedRanks[4] === 14) {
    return { handValue: 9000000, handRank: 'RoyalFlush' };
  }

  if (isFlush && (isStraight || isWheel)) {
    const value = isWheel ? 5 : normalizedRanks[4];
    return { handValue: 8000000 + value, handRank: 'StraightFlush' };
  }

  if (groups[0][1] === 4) {
    const fourRank = normalizeRank(groups[0][0]);
    const kicker = normalizeRank(groups[1][0]);
    return { handValue: 7000000 + fourRank * 100 + kicker, handRank: 'FourOfAKind' };
  }

  if (groups[0][1] === 3 && groups[1][1] === 2) {
    const threeRank = normalizeRank(groups[0][0]);
    const pairRank = normalizeRank(groups[1][0]);
    return { handValue: 6000000 + threeRank * 100 + pairRank, handRank: 'FullHouse' };
  }

  if (isFlush) {
    const value = normalizedRanks.slice().sort((a, b) => b - a).reduce((acc, rank) => acc * 15 + rank, 0);
    return { handValue: 5000000 + value, handRank: 'Flush' };
  }

  if (isStraight || isWheel) {
    const value = isWheel ? 5 : normalizedRanks[4];
    return { handValue: 4000000 + value, handRank: 'Straight' };
  }

  if (groups[0][1] === 3) {
    const threeRank = normalizeRank(groups[0][0]);
    const kickers = groups.slice(1).map(group => normalizeRank(group[0])).sort((a, b) => b - a);
    return { handValue: 3000000 + threeRank * 10000 + kickers[0] * 100 + kickers[1], handRank: 'ThreeOfAKind' };
  }

  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const highPair = normalizeRank(groups[0][0]);
    const lowPair = normalizeRank(groups[1][0]);
    const kicker = normalizeRank(groups[2][0]);
    return { handValue: 2000000 + highPair * 10000 + lowPair * 100 + kicker, handRank: 'TwoPair' };
  }

  if (groups[0][1] === 2) {
    const pairRank = normalizeRank(groups[0][0]);
    const kickers = groups.slice(1).map(group => normalizeRank(group[0])).sort((a, b) => b - a);
    return {
      handValue: 1000000 + pairRank * 10000 + kickers[0] * 1000 + kickers[1] * 100 + kickers[2],
      handRank: 'OnePair',
    };
  }

  const highCard = normalizedRanks.slice().sort((a, b) => b - a).reduce((acc, rank) => acc * 15 + rank, 0);
  return { handValue: highCard, handRank: 'HighCard' };
};

const getActivePlayers = (room: GameRoom) =>
  room.players.filter(player => {
    const hand = room.playerHands.get(player.userId);
    return !hand?.hasFolded && player.tokenAmount > 0;
  });

const allExchanged = (room: GameRoom) =>
  getActivePlayers(room).every(player => room.playerHands.get(player.userId)?.hasExchanged);

const bettingRoundComplete = (room: GameRoom) => {
  const activePlayers = getActivePlayers(room);
  if (activePlayers.length <= 1) {
    return true;
  }

  return activePlayers.every(player => {
    const hand = room.playerHands.get(player.userId);
    return hand?.hasActedThisRound && hand.currentBet === room.currentBet;
  });
};

const getNextActiveSeat = (room: GameRoom, startSeat: number): number => {
  const total = room.maxPlayers;
  for (let offset = 1; offset <= total; offset += 1) {
    const seat = (startSeat + offset) % total;
    const player = room.players.find(p => p.seatIndex === seat);
    if (!player) {
      continue;
    }
    const hand = room.playerHands.get(player.userId);
    if (hand && !hand.hasFolded && player.tokenAmount > 0) {
      return seat;
    }
  }
  return startSeat;
};

const resetBettingRound = (room: GameRoom) => {
  room.currentBet = 0;
  room.lastRaisePlayerIndex = -1;
  room.playerHands.forEach(hand => {
    hand.currentBet = 0;
    hand.hasActedThisRound = false;
    hand.hasFolded = false;
  });
};

export class MultiplayerGameService {
  static async startGame(roomId: string): Promise<GameResult> {
    const room = await GameRoomService.getRoom(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    if (!room.isActive) {
      return { success: false, error: 'Game finished' };
    }
    if (room.currentPhase !== GamePhase.Waiting && room.currentPhase !== GamePhase.None && room.currentPhase !== GamePhase.GameOver) {
      return { success: false, error: 'Game already started' };
    }

    room.currentPhase = GamePhase.Ante;
    room.currentPlayerIndex = 0;
    room.pot = 0;
    room.currentBet = 0;
    room.deck = [];
    room.playerHands.clear();
    room.lastWinnerId = undefined;
    room.lastWinnerHandValue = undefined;
    room.lastShowdownHands = [];
    room.continueReadyIds = [];

    resetBettingRound(room);
    await GameRoomService.persistRoom(room);
    return { success: true, room };
  }

  static async collectAnte(roomId: string): Promise<GameResult> {
    const room = await GameRoomService.getRoom(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    room.pot = 0;
    room.players.forEach(player => {
      if (player.tokenAmount <= 0) return; // eliminated — sits out
      const ante = Math.min(player.tokenAmount, room.anteAmount);
      player.tokenAmount -= ante;
      room.pot += ante;
    });

    room.currentPhase = GamePhase.DealCards;
    await GameRoomService.persistRoom(room);
    return { success: true, room };
  }

  static async dealCards(roomId: string): Promise<GameResult> {
    const room = await GameRoomService.getRoom(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    if (room.currentPhase !== GamePhase.DealCards) {
      return { success: false, error: 'Not in deal phase' };
    }

    const deck = buildDeck();
    shuffle(deck);
    room.deck = deck;

    room.playerHands.clear();
    for (const player of room.players) {
      // Skip eliminated players — they have no chips and sit out the round.
      if (player.tokenAmount <= 0) {
        continue;
      }
      const cards = deck.splice(0, CARDS_PER_PLAYER);
      room.playerHands.set(player.userId, {
        playerId: player.userId,
        cards,
        selectedCards: [],
        hasExchanged: false,
        hasFolded: false,
        hasActedThisRound: false,
        currentBet: 0,
      } as PlayerHand);
    }

    // Set currentPlayerIndex to the first active (non-eliminated) seat.
    room.currentPhase = GamePhase.Exchange;
    room.currentPlayerIndex = getNextActiveSeat(room, -1);
    await GameRoomService.persistRoom(room);
    return { success: true, room };
  }

  static async exchangeCards(roomId: string, userId: string, cardIndices: number[]): Promise<GameResult> {
    const room = await GameRoomService.getRoom(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    if (room.currentPhase !== GamePhase.Exchange) {
      return { success: false, error: 'Not in exchange phase' };
    }

    const hand = room.playerHands.get(userId);
    if (!hand) {
      return { success: false, error: 'Hand not found' };
    }
    const player = room.players.find(p => p.userId === userId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }
    if (player.seatIndex !== room.currentPlayerIndex) {
      return { success: false, error: 'Not your turn' };
    }

    const uniqueIndices = Array.from(new Set(cardIndices.filter(index => index >= 0 && index < CARDS_PER_PLAYER)));
    const exchangeCount = Math.min(uniqueIndices.length, MAX_EXCHANGE);

    for (let i = 0; i < exchangeCount; i += 1) {
      const index = uniqueIndices[i];
      if (room.deck.length === 0) {
        break;
      }
      hand.cards[index] = room.deck.shift()!;
    }

    hand.hasExchanged = true;
    room.playerHands.set(userId, hand);

    if (allExchanged(room)) {
      room.currentPhase = GamePhase.Betting;
      room.currentPlayerIndex = 0;
      resetBettingRound(room);
      room.currentPlayerIndex = getNextActiveSeat(room, room.currentPlayerIndex);
    } else {
      room.currentPlayerIndex = getNextActiveSeat(room, room.currentPlayerIndex);
    }

    await GameRoomService.persistRoom(room);
    return { success: true, room };
  }

  static async handleBettingAction(roomId: string, userId: string, action: GameAction): Promise<GameResult> {
    const room = await GameRoomService.getRoom(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }
    if (room.currentPhase !== GamePhase.Betting) {
      return { success: false, error: 'Not in betting phase' };
    }

    const player = room.players.find(p => p.userId === userId);
    const hand = room.playerHands.get(userId);
    if (!player || !hand) {
      return { success: false, error: 'Player not found' };
    }
    if (player.seatIndex !== room.currentPlayerIndex) {
      return { success: false, error: 'Not your turn' };
    }

    if (hand.hasFolded) {
      return { success: false, error: 'Player already folded' };
    }

    switch (action.type) {
      case 'bet': {
        const amount = action.amount ?? 0;
        if (room.currentBet > 0) {
          return { success: false, error: 'Bet not allowed after betting starts' };
        }
        if (!STARTING_BET_OPTIONS.has(amount)) {
          return { success: false, error: 'Invalid bet amount' };
        }
        const cost = amount - hand.currentBet;
        if (player.tokenAmount < cost) {
          return { success: false, error: 'Not enough chips' };
        }
        player.tokenAmount -= cost;
        hand.currentBet = amount;
        room.pot += cost;
        room.currentBet = amount;
        room.lastRaisePlayerIndex = player.seatIndex;
        hand.hasActedThisRound = true;
        break;
      }
      case 'raise': {
        const amount = action.amount ?? 0;
        const expected = room.currentBet * 2;
        if (amount != expected) {
          return { success: false, error: 'Raise must double the current bet' };
        }
        const cost = amount - hand.currentBet;
        if (player.tokenAmount < cost) {
          return { success: false, error: 'Not enough chips' };
        }
        player.tokenAmount -= cost;
        hand.currentBet = amount;
        room.pot += cost;
        room.currentBet = amount;
        room.lastRaisePlayerIndex = player.seatIndex;
        hand.hasActedThisRound = true;
        break;
      }
      case 'call': {
        const cost = room.currentBet - hand.currentBet;
        if (cost < 0) {
          return { success: false, error: 'Invalid call amount' };
        }
        if (player.tokenAmount < cost) {
          return { success: false, error: 'Not enough chips' };
        }
        player.tokenAmount -= cost;
        hand.currentBet = room.currentBet;
        room.pot += cost;
        hand.hasActedThisRound = true;
        break;
      }
      case 'fold': {
        hand.hasFolded = true;
        hand.hasActedThisRound = true;
        break;
      }
      default:
        return { success: false, error: 'Unsupported action' };
    }

    if (bettingRoundComplete(room)) {
      room.currentPhase = GamePhase.Showdown;
      const activePlayers = getActivePlayers(room);

      // When all players fold there are no active players. Award the pot to the last
      // non-folded player (the sole survivor), or if truly nobody is left, return the
      // pot to all players equally to avoid chips disappearing.
      let fallbackWinner = room.players.find(p => {
        const h = room.playerHands.get(p.userId);
        return h && !h.hasFolded;
      });
      if (!fallbackWinner) {
        // Edge case: everyone folded simultaneously — split pot evenly.
        const share = Math.floor(room.pot / room.players.length);
        const remainder = room.pot - share * room.players.length;
        room.players.forEach((p, idx) => { p.tokenAmount += share + (idx === 0 ? remainder : 0); });
        room.lastWinnerId = room.players[0]?.userId;
        room.lastWinnerHandValue = 0;
        room.lastShowdownHands = [];
        room.lastPotAmount = room.pot;
        room.pot = 0;
        room.currentBet = 0;
        room.currentPlayerIndex = room.players[0]?.seatIndex ?? 0;
        const playersWithChips0 = room.players.filter(p => p.tokenAmount > 0);
        if (playersWithChips0.length <= 1) room.isActive = false;
        room.continueReadyIds = room.continueReadyIds ?? [];
        for (const p of room.players) {
          if (p.tokenAmount <= 0 && !room.continueReadyIds.includes(p.userId)) {
            room.continueReadyIds.push(p.userId);
          }
        }
        room.currentPhase = GamePhase.GameOver;
        room.playerHands.set(userId, hand);
        await GameRoomService.persistRoom(room);
        return { success: true, room };
      }

      let winner = activePlayers.length > 0 ? activePlayers[0] : fallbackWinner;
      let bestValue = -1;
      let bestHandRank = 'HighCard';
      room.lastShowdownHands = [];
      for (const active of activePlayers) {
        const activeHand = room.playerHands.get(active.userId);
        if (!activeHand) {
          continue;
        }
        const result = evaluateHand(activeHand.cards);
        room.lastShowdownHands.push({
          userId: active.userId,
          handRank: result.handRank,
          handValue: result.handValue,
        });
        if (result.handValue > bestValue) {
          bestValue = result.handValue;
          winner = active;
          bestHandRank = result.handRank;
        }
      }

      // Single survivor (everyone else folded) — use fallback winner, no hands to evaluate.
      if (activePlayers.length === 1 && room.lastShowdownHands.length === 1) {
        bestHandRank = room.lastShowdownHands[0].handRank;
      }

      if (winner) {
        winner.tokenAmount += room.pot;
        room.lastWinnerId = winner.userId;
        room.lastWinnerHandValue = bestValue;
        try {
          await LeaderboardService.recordMultiplayerWin(winner.userId, winner.username, room.pot, bestHandRank);
        } catch (error) {
          // Do not block gameplay if leaderboard update fails
          console.warn('[Leaderboard] Failed to record multiplayer win:', error);
        }
      } else {
        room.lastWinnerId = undefined;
        room.lastWinnerHandValue = undefined;
      }

      // Game ends only when at most one player still has chips (one clear winner).
      const playersWithChips = room.players.filter(player => player.tokenAmount > 0);
      if (playersWithChips.length <= 1) {
        room.isActive = false;
      }

      // Auto-add eliminated players (tokenAmount === 0) to continueReadyIds so they
      // never block the continue gate that remaining players vote on.
      room.continueReadyIds = room.continueReadyIds ?? [];
      for (const p of room.players) {
        if (p.tokenAmount <= 0 && !room.continueReadyIds.includes(p.userId)) {
          room.continueReadyIds.push(p.userId);
        }
      }

      room.lastPotAmount = room.pot;
      room.pot = 0;
      room.currentBet = 0;
      room.currentPlayerIndex = winner ? winner.seatIndex : 0;
      room.currentPhase = GamePhase.GameOver;
    } else {
      room.currentPlayerIndex = getNextActiveSeat(room, player.seatIndex);
    }

    room.playerHands.set(userId, hand);
    await GameRoomService.persistRoom(room);
    return { success: true, room };
  }

  static async advancePhase(roomId: string, phase: GamePhase): Promise<GameResult> {
    const room = await GameRoomService.getRoom(roomId);
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    room.currentPhase = phase;
    await GameRoomService.persistRoom(room);
    return { success: true, room };
  }
}
