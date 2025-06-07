import { 
  users, 
  gameMatches, 
  gameMoves, 
  transactions, 
  userStats,
  type User, 
  type InsertUser, 
  type GameMatch, 
  type InsertGameMatch,
  type GameMove,
  type InsertGameMove,
  type Transaction,
  type InsertTransaction,
  type UserStats
} from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull, desc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserBalance(id: string, balance: string): Promise<User | undefined>;
  
  // Game match operations
  createMatch(match: InsertGameMatch): Promise<GameMatch>;
  getMatch(id: string): Promise<GameMatch | undefined>;
  updateMatch(id: string, updates: Partial<GameMatch>): Promise<GameMatch | undefined>;
  getWaitingMatches(gameType: string, stake: string): Promise<GameMatch[]>;
  
  // Game move operations
  createMove(move: InsertGameMove): Promise<GameMove>;
  getMatchMoves(matchId: string): Promise<GameMove[]>;
  
  // Transaction operations
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getUserTransactions(userId: string): Promise<Transaction[]>;
  
  // User stats operations
  getUserStats(userId: string): Promise<UserStats | undefined>;
  updateUserStats(userId: string, updates: Partial<UserStats>): Promise<UserStats>;
  
  // Mock guest user
  getOrCreateGuestUser(): Promise<User>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Generate ID manually for MySQL compatibility
    const userId = crypto.randomUUID();
    const userWithId = { ...insertUser, id: userId };
    
    await db.insert(users).values(userWithId);
    
    // Get the created user
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    
    // Create initial stats
    await db.insert(userStats).values({
      userId: user.id,
      totalGames: 0,
      totalWins: 0,
      totalLosses: 0,
      totalEarned: "0",
      gamesPlayed: "{}",
    });
    
    return user;
  }

  async updateUserBalance(id: string, balance: string): Promise<User | undefined> {
    await db
      .update(users)
      .set({ balance })
      .where(eq(users.id, id));
    
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async createMatch(match: InsertGameMatch): Promise<GameMatch> {
    const matchId = crypto.randomUUID();
    const matchWithId = { ...match, id: matchId };
    
    await db.insert(gameMatches).values(matchWithId);
    
    const [gameMatch] = await db.select().from(gameMatches).where(eq(gameMatches.id, matchId));
    return gameMatch;
  }

  async getMatch(id: string): Promise<GameMatch | undefined> {
    const [match] = await db.select().from(gameMatches).where(eq(gameMatches.id, id));
    return match || undefined;
  }

  async updateMatch(id: string, updates: Partial<GameMatch>): Promise<GameMatch | undefined> {
    await db
      .update(gameMatches)
      .set(updates)
      .where(eq(gameMatches.id, id));
    
    const [match] = await db.select().from(gameMatches).where(eq(gameMatches.id, id));
    return match || undefined;
  }

  async getWaitingMatches(gameType: string, stake: string): Promise<GameMatch[]> {
    return await db
      .select()
      .from(gameMatches)
      .where(
        and(
          eq(gameMatches.gameType, gameType),
          eq(gameMatches.stake, stake),
          eq(gameMatches.state, "waiting"),
          isNull(gameMatches.player2Id)
        )
      );
  }

  async createMove(move: InsertGameMove): Promise<GameMove> {
    const moveId = crypto.randomUUID();
    const moveWithId = { ...move, id: moveId };
    
    await db.insert(gameMoves).values(moveWithId);
    
    const [gameMove] = await db.select().from(gameMoves).where(eq(gameMoves.id, moveId));
    return gameMove;
  }

  async getMatchMoves(matchId: string): Promise<GameMove[]> {
    return await db
      .select()
      .from(gameMoves)
      .where(eq(gameMoves.matchId, matchId))
      .orderBy(gameMoves.moveNumber);
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const txId = crypto.randomUUID();
    const txWithId = { ...transaction, id: txId };
    
    await db.insert(transactions).values(txWithId);
    
    const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
    return tx;
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));
  }

  async getUserStats(userId: string): Promise<UserStats | undefined> {
    const [stats] = await db.select().from(userStats).where(eq(userStats.userId, userId));
    return stats || undefined;
  }

  async updateUserStats(userId: string, updates: Partial<UserStats>): Promise<UserStats> {
    await db
      .update(userStats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(userStats.userId, userId));
    
    const [stats] = await db.select().from(userStats).where(eq(userStats.userId, userId));
    return stats;
  }

  async getOrCreateGuestUser(): Promise<User> {
    const existingGuest = await this.getUserByUsername("guest");
    
    if (existingGuest) {
      return existingGuest;
    }
    
    return this.createUser({
      username: "guest",
      nickname: "Retro-Player",
      email: "guest@retrogame.com",
      authProvider: "guest"
    });
  }
}

export const storage = new DatabaseStorage();
