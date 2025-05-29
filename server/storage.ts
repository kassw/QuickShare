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

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private matches: Map<string, GameMatch>;
  private moves: Map<string, GameMove>;
  private transactions: Map<string, Transaction>;
  private stats: Map<string, UserStats>;
  private currentId: number;

  constructor() {
    this.users = new Map();
    this.matches = new Map();
    this.moves = new Map();
    this.transactions = new Map();
    this.stats = new Map();
    this.currentId = 1;
  }

  private generateId(): string {
    return `${this.currentId++}`;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.generateId();
    const user: User = { 
      ...insertUser, 
      id,
      balance: "1337.50",
      createdAt: new Date()
    };
    this.users.set(id, user);
    
    // Create initial stats
    const userStats: UserStats = {
      id: this.generateId(),
      userId: id,
      totalGames: 0,
      totalWins: 0,
      totalLosses: 0,
      totalEarned: "0",
      gamesPlayed: "{}",
      updatedAt: new Date()
    };
    this.stats.set(id, userStats);
    
    return user;
  }

  async updateUserBalance(id: string, balance: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, balance };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async createMatch(match: InsertGameMatch): Promise<GameMatch> {
    const id = this.generateId();
    const gameMatch: GameMatch = {
      ...match,
      id,
      state: "waiting",
      winnerId: null,
      gameData: null,
      createdAt: new Date(),
      finishedAt: null
    };
    this.matches.set(id, gameMatch);
    return gameMatch;
  }

  async getMatch(id: string): Promise<GameMatch | undefined> {
    return this.matches.get(id);
  }

  async updateMatch(id: string, updates: Partial<GameMatch>): Promise<GameMatch | undefined> {
    const match = this.matches.get(id);
    if (!match) return undefined;
    
    const updatedMatch = { ...match, ...updates };
    this.matches.set(id, updatedMatch);
    return updatedMatch;
  }

  async getWaitingMatches(gameType: string, stake: string): Promise<GameMatch[]> {
    return Array.from(this.matches.values()).filter(
      match => match.gameType === gameType && 
               match.stake === stake && 
               match.state === "waiting" &&
               !match.player2Id
    );
  }

  async createMove(move: InsertGameMove): Promise<GameMove> {
    const id = this.generateId();
    const gameMove: GameMove = {
      ...move,
      id,
      createdAt: new Date()
    };
    this.moves.set(id, gameMove);
    return gameMove;
  }

  async getMatchMoves(matchId: string): Promise<GameMove[]> {
    return Array.from(this.moves.values()).filter(
      move => move.matchId === matchId
    ).sort((a, b) => a.moveNumber - b.moveNumber);
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const id = this.generateId();
    const tx: Transaction = {
      ...transaction,
      id,
      status: "completed",
      externalId: null,
      createdAt: new Date()
    };
    this.transactions.set(id, tx);
    return tx;
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    return Array.from(this.transactions.values()).filter(
      tx => tx.userId === userId
    ).sort((a, b) => b.createdAt!.getTime() - a.createdAt!.getTime());
  }

  async getUserStats(userId: string): Promise<UserStats | undefined> {
    return this.stats.get(userId);
  }

  async updateUserStats(userId: string, updates: Partial<UserStats>): Promise<UserStats> {
    const stats = this.stats.get(userId) || {
      id: this.generateId(),
      userId,
      totalGames: 0,
      totalWins: 0,
      totalLosses: 0,
      totalEarned: "0",
      gamesPlayed: "{}",
      updatedAt: new Date()
    };
    
    const updatedStats = { ...stats, ...updates, updatedAt: new Date() };
    this.stats.set(userId, updatedStats);
    return updatedStats;
  }

  async getOrCreateGuestUser(): Promise<User> {
    const existingGuest = Array.from(this.users.values()).find(
      user => user.username === "guest" && user.authProvider === "guest"
    );
    
    if (existingGuest) {
      return existingGuest;
    }
    
    return this.createUser({
      username: "guest",
      nickname: "Player1337",
      email: "guest@retrogame.com",
      authProvider: "guest"
    });
  }
}

export const storage = new MemStorage();
