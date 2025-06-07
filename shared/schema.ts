
import { mysqlTable, text, int, boolean, timestamp, decimal, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: varchar("username", { length: 50 }).notNull().unique(),
  nickname: varchar("nickname", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 100 }),
  authProvider: varchar("auth_provider", { length: 20 }).default("guest"),
  balance: decimal("balance", { precision: 18, scale: 8 }).default("1337.50"),
  createdAt: timestamp("created_at").defaultNow(),
});
 
export const gameMatches = mysqlTable("game_matches", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  gameType: varchar("game_type", { length: 20 }).notNull(),
  stake: decimal("stake", { precision: 18, scale: 8 }).notNull(),
  player1Id: varchar("player1_id", { length: 36 }).references(() => users.id),
  player2Id: varchar("player2_id", { length: 36 }).references(() => users.id),
  winnerId: varchar("winner_id", { length: 36 }).references(() => users.id),
  state: varchar("state", { length: 20 }).default("waiting"),
  gameData: text("game_data"),
  createdAt: timestamp("created_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const gameMoves = mysqlTable("game_moves", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  matchId: varchar("match_id", { length: 36 }).references(() => gameMatches.id),
  playerId: varchar("player_id", { length: 36 }).references(() => users.id),
  moveData: text("move_data").notNull(),
  moveNumber: int("move_number").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = mysqlTable("transactions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  type: varchar("type", { length: 20 }).notNull(),
  amount: decimal("amount", { precision: 18, scale: 8 }).notNull(),
  status: varchar("status", { length: 20 }).default("completed"),
  description: text("description"),
  externalId: varchar("external_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userStats = mysqlTable("user_stats", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: varchar("user_id", { length: 36 }).references(() => users.id).unique(),
  totalGames: int("total_games").default(0),
  totalWins: int("total_wins").default(0),
  totalLosses: int("total_losses").default(0),
  totalEarned: decimal("total_earned", { precision: 18, scale: 8 }).default("0"),
  gamesPlayed: text("games_played").default("{}"),
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
