import { pgTable, text, serial, integer, boolean, timestamp, numeric, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  nickname: text("nickname").notNull().unique(),
  email: text("email"),
  authProvider: text("auth_provider").default("guest"),
  balance: numeric("balance", { precision: 18, scale: 8 }).default("1337.50"),
  createdAt: timestamp("created_at").defaultNow(),
});
 
export const gameMatches = pgTable("game_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameType: text("game_type").notNull(), // rps, tictactoe, sticks, hangman
  stake: numeric("stake", { precision: 18, scale: 8 }).notNull(),
  player1Id: uuid("player1_id").references(() => users.id),
  player2Id: uuid("player2_id").references(() => users.id),
  winnerId: uuid("winner_id").references(() => users.id),
  state: text("state").default("waiting"), // waiting, in_progress, finished
  gameData: text("game_data"), // JSON string for game-specific data
  createdAt: timestamp("created_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const gameMoves = pgTable("game_moves", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").references(() => gameMatches.id),
  playerId: uuid("player_id").references(() => users.id),
  moveData: text("move_data").notNull(), // JSON string for move-specific data
  moveNumber: integer("move_number").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  type: text("type").notNull(), // deposit, withdraw, stake, win, lose
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  status: text("status").default("completed"), // pending, completed, failed
  description: text("description"),
  externalId: text("external_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userStats = pgTable("user_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).unique(),
  totalGames: integer("total_games").default(0),
  totalWins: integer("total_wins").default(0),
  totalLosses: integer("total_losses").default(0),
  totalEarned: numeric("total_earned", { precision: 18, scale: 8 }).default("0"),
  gamesPlayed: text("games_played").default("{}"), // JSON object with game type counts
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  nickname: true,
  email: true,
  authProvider: true,
});

export const insertGameMatchSchema = createInsertSchema(gameMatches).pick({
  gameType: true,
  stake: true,
  player1Id: true,
  player2Id: true,
});

export const insertGameMoveSchema = createInsertSchema(gameMoves).pick({
  matchId: true,
  playerId: true,
  moveData: true,
  moveNumber: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).pick({
  userId: true,
  type: true,
  amount: true,
  description: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type GameMatch = typeof gameMatches.$inferSelect;
export type InsertGameMatch = z.infer<typeof insertGameMatchSchema>;
export type GameMove = typeof gameMoves.$inferSelect;
export type InsertGameMove = z.infer<typeof insertGameMoveSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type UserStats = typeof userStats.$inferSelect;
