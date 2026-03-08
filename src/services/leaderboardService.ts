import * as admin from 'firebase-admin';
import { db } from '../config/firebase';

export type MultiplayerLeaderboardEntry = {
    userId: string;
    userName: string;
    userNameLower: string;
    totalChips: number;
    winCount: number;
    lastHandRank?: string;
    updatedAt: admin.firestore.Timestamp;
};

const COLLECTION = 'multiplayerLeaderboardStats';

export class LeaderboardService {
    static async recordMultiplayerWin(userId: string, userName: string, winChips: number, handRank: string): Promise<void> {
        if (!userId || !userName) {
            return;
        }

        const userNameLower = userName.toLowerCase().trim();
        const ref = db.collection(COLLECTION).doc(userId);
        const now = admin.firestore.Timestamp.now();

        await db.runTransaction(async transaction => {
            const snapshot = await transaction.get(ref);
            if (!snapshot.exists) {
                const newEntry: MultiplayerLeaderboardEntry = {
                    userId,
                    userName,
                    userNameLower,
                    totalChips: winChips,
                    winCount: 1,
                    lastHandRank: handRank,
                    updatedAt: now,
                };
                transaction.set(ref, newEntry);
                return;
            }

            transaction.update(ref, {
                userName,
                userNameLower,
                totalChips: admin.firestore.FieldValue.increment(winChips),
                winCount: admin.firestore.FieldValue.increment(1),
                lastHandRank: handRank,
                updatedAt: now,
            });
        });
    }

    static async getMultiplayerLeaderboard(limit: number): Promise<MultiplayerLeaderboardEntry[]> {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 30;
        const snapshot = await db
            .collection(COLLECTION)
            .orderBy('totalChips', 'desc')
            .orderBy('winCount', 'desc')
            .orderBy('userNameLower', 'asc')
            .limit(safeLimit)
            .get();

        return snapshot.docs.map(doc => doc.data() as MultiplayerLeaderboardEntry);
    }
}
