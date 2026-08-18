import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const games = pgTable("games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  awayTeam: text("away_team").notNull(),
  awayPlayer: text("away_player").notNull(),
  awayTipCount: integer("away_tip_count").notNull(),
  awayTipPercent: integer("away_tip_percent").notNull(),
  awayScorePercent: integer("away_score_percent").notNull(),
  awayStarters: text("away_starters").array(),
  homeTeam: text("home_team").notNull(),
  homePlayer: text("home_player").notNull(),
  homeTipCount: integer("home_tip_count").notNull(),
  homeTipPercent: integer("home_tip_percent").notNull(),
  homeScorePercent: integer("home_score_percent").notNull(),
  homeStarters: text("home_starters").array(),
  h2h: text("h2h").notNull(),
  gameDate: text("game_date").notNull(),
  gameTime: text("game_time"),
  status: text("status").notNull().default('scheduled'),
  awayScore: integer("away_score"),
  homeScore: integer("home_score"),
  espnGameId: text("espn_game_id"),
  lastSynced: text("last_synced"),
}, (table) => ({
  gameDateIdx: index("games_game_date_idx").on(table.gameDate),
  gameTimeIdx: index("games_game_time_idx").on(table.gameTime),
  statusIdx: index("games_status_idx").on(table.status),
  espnGameIdIdx: uniqueIndex("games_espn_game_id_idx").on(table.espnGameId),
}));

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
}, (table) => ({
  playerTeamIdx: index("player_stats_team_idx").on(table.team),
  playerNameIdx: index("player_stats_player_idx").on(table.player),
  seasonIdx: index("player_stats_season_idx").on(table.season),
}));

export const teamStats = pgTable("team_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  team: text("team").notNull(),
  gamesPlayed: integer("games_played").notNull(),
  firstToScore: integer("first_to_score").notNull(),
  percentage: real("percentage").notNull(),
  avgPoints: real("avg_points").notNull(),
}, (table) => ({
  teamIdx: uniqueIndex("team_stats_team_idx").on(table.team),
}));

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
}, (table) => ({
  userIdIdx: index("sessions_user_id_idx").on(table.userId),
  expiresAtIdx: index("sessions_expires_at_idx").on(table.expiresAt),
}));

export const fbTracking = pgTable("fb_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  playerName: text("player_name").notNull(),
  team: text("team").notNull(),
  fbScored: integer("fb_scored").notNull().default(0),
  gamesTracked: integer("games_tracked").notNull().default(0),
  season: text("season").notNull().default("2025/26"),
  lastUpdated: text("last_updated"),
}, (table) => ({
  playerTeamIdx: index("fb_tracking_player_team_idx").on(table.playerName, table.team),
  seasonIdx: index("fb_tracking_season_idx").on(table.season),
}));

export const fbProcessedGames = pgTable("fb_processed_games", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  espnGameId: text("espn_game_id").notNull().unique(),
  firstScorer: text("first_scorer"),
  firstScorerTeam: text("first_scorer_team"),
  processedAt: text("processed_at").notNull(),
}, (table) => ({
  processedAtIdx: index("fb_processed_games_processed_at_idx").on(table.processedAt),
}));

export const mlbPredictionHistory = pgTable("mlb_prediction_history", {
  id: varchar("id", { length: 64 }).primaryKey(),
  predictionDate: text("prediction_date").notNull(),
  gameId: text("game_id").notNull(),
  awayTeam: text("away_team").notNull(),
  homeTeam: text("home_team").notNull(),
  nrfiProbability: real("nrfi_probability").notNull(),
  recommendation: text("recommendation").notNull(),
  playStatus: text("play_status").notNull(),
  modelEdge: real("model_edge").notNull(),
  confidence: text("confidence").notNull(),
  sampleSize: integer("sample_size").notNull().default(0),
  outcome: text("outcome"),
  firstInningScore: text("first_inning_score"),
  predictedAt: timestamp("predicted_at").notNull().default(sql`now()`),
  gradedAt: timestamp("graded_at"),
}, (table) => ({
  predictionDateIdx: index("mlb_prediction_history_date_idx").on(table.predictionDate),
  outcomeIdx: index("mlb_prediction_history_outcome_idx").on(table.outcome),
  gameIdx: uniqueIndex("mlb_prediction_history_game_idx").on(table.predictionDate, table.gameId),
}));

export const insertGameSchema = createInsertSchema(games).omit({ id: true });
export const insertPlayerStatSchema = createInsertSchema(playerStats).omit({ id: true });
export const insertTeamStatSchema = createInsertSchema(teamStats).omit({ id: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true });
export const insertFbTrackingSchema = createInsertSchema(fbTracking).omit({ id: true });
export const insertFbProcessedGameSchema = createInsertSchema(fbProcessedGames).omit({ id: true });
export const insertMlbPredictionHistorySchema = createInsertSchema(mlbPredictionHistory);

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
export type InsertFbTracking = z.infer<typeof insertFbTrackingSchema>;
export type FbTracking = typeof fbTracking.$inferSelect;
export type InsertFbProcessedGame = z.infer<typeof insertFbProcessedGameSchema>;
export type FbProcessedGame = typeof fbProcessedGames.$inferSelect;
export type InsertMlbPredictionHistory = z.infer<typeof insertMlbPredictionHistorySchema>;
export type MlbPredictionHistory = typeof mlbPredictionHistory.$inferSelect;
