import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  awayTeam: text("away_team").notNull(),
  awayPlayer: text("away_player").notNull(),
  awayTipCount: integer("away_tip_count").notNull(),
  awayTipPercent: integer("away_tip_percent").notNull(),
  awayScorePercent: integer("away_score_percent").notNull(),
  awayStarters: text("away_starters").array(), // full starting lineup (5 players)
  homeTeam: text("home_team").notNull(),
  homePlayer: text("home_player").notNull(),
  homeTipCount: integer("home_tip_count").notNull(),
  homeTipPercent: integer("home_tip_percent").notNull(),
  homeScorePercent: integer("home_score_percent").notNull(),
  homeStarters: text("home_starters").array(), // full starting lineup (5 players)
  h2h: text("h2h").notNull(),
  gameDate: text("game_date").notNull(),
  gameTime: text("game_time"), // ISO timestamp for sorting games chronologically
  status: text("status").notNull().default('scheduled'), // scheduled, in_progress, completed
  awayScore: integer("away_score"), // actual final score
  homeScore: integer("home_score"), // actual final score
  espnGameId: text("espn_game_id"), // ESPN's game ID for tracking
  lastSynced: text("last_synced"), // timestamp of last daily sync update
});

export const playerStats = pgTable("player_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  player: text("player").notNull(),
  team: text("team").notNull(),
  position: text("position").notNull(),
  gamesPlayed: integer("games_played").notNull(),
  firstBaskets: integer("first_baskets").notNull(),
  percentage: real("percentage").notNull(),
  avgTipWin: integer("avg_tip_win").notNull(),
  q1FgaRate: real("q1_fga_rate"),
  last10GamesPercent: real("last_10_games_percent"),
  injuryStatus: text("injury_status"),
  injuryNote: text("injury_note"),
  lastUpdated: text("last_updated"),
  odds: text("odds"),
  sportsbook: text("sportsbook"),
  season: text("season").notNull().default('2024/2025'),
});

export const teamStats = pgTable("team_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  team: text("team").notNull(),
  gamesPlayed: integer("games_played").notNull(),
  firstToScore: integer("first_to_score").notNull(),
  percentage: real("percentage").notNull(),
  avgPoints: real("avg_points").notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default('user'),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertGameSchema = createInsertSchema(games).omit({ id: true });
export const insertPlayerStatSchema = createInsertSchema(playerStats).omit({ id: true });
export const insertTeamStatSchema = createInsertSchema(teamStats).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });

export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof games.$inferSelect;

export type InsertPlayerStat = z.infer<typeof insertPlayerStatSchema>;
export type PlayerStat = typeof playerStats.$inferSelect;

export type InsertTeamStat = z.infer<typeof insertTeamStatSchema>;
export type TeamStat = typeof teamStats.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;
