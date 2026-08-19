import {
  type Game,
  type InsertGame,
  type PlayerStat,
  type InsertPlayerStat,
  type TeamStat,
  type InsertTeamStat,
  type User,
  type InsertUser,
  type Session,
  type InsertSession,
  type FbTracking,
  type FbProcessedGame,
  games as gamesTable,
  users as usersTable,
  fbTracking as fbTrackingTable,
  fbProcessedGames as fbProcessedGamesTable,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { eq, and } from "drizzle-orm";

export interface IStorage {
  getGames(): Promise<Game[]>;
  getGamesByDate(date: string): Promise<Game[]>;
  createGame(game: InsertGame): Promise<Game>;
  updateGame(gameId: string, updates: Partial<Omit<Game, "id">>): Promise<Game | undefined>;
  deleteGame(gameId: string): Promise<void>;

  getPlayerStats(): Promise<PlayerStat[]>;
  getPlayerStatsByTeam(team: string): Promise<PlayerStat[]>;
  getPlayerStatById(id: string): Promise<PlayerStat | undefined>;
  getTodayStarters(): Promise<PlayerStat[]>;
  createPlayerStat(stat: InsertPlayerStat): Promise<PlayerStat>;
  updatePlayerInjuryStatus(playerId: string, injuryStatus: string | null, injuryNote: string | null): Promise<PlayerStat | undefined>;

  getTeamStats(): Promise<TeamStat[]>;
  getTeamStatByTeam(team: string): Promise<TeamStat | undefined>;
  createTeamStat(stat: InsertTeamStat): Promise<TeamStat>;

  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  createSession(session: InsertSession): Promise<Session>;
  getSessionByToken(token: string): Promise<Session | undefined>;
  deleteSession(sessionId: string): Promise<void>;
  deleteExpiredSessions(): Promise<void>;

  getAllFbTracking(): Promise<FbTracking[]>;
  getFbTrackingByPlayer(playerName: string, team: string): Promise<FbTracking | undefined>;
  upsertFbTracking(playerName: string, team: string, fbScored: number, season?: string, gamesTracked?: number): Promise<FbTracking>;
  incrementFbScored(playerName: string, team: string): Promise<void>;
  isGameProcessed(espnGameId: string): Promise<boolean>;
  markGameProcessed(espnGameId: string, firstScorer?: string, firstScorerTeam?: string): Promise<void>;
  getProcessedGames(): Promise<FbProcessedGame[]>;
}

neonConfig.webSocketConstructor = ws;
const hasDatabase = Boolean(process.env.DATABASE_URL);
const pool = hasDatabase ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const db = pool ? drizzle(pool) : null;

export class MemStorage implements IStorage {
  private playerStats = new Map<string, PlayerStat>();
  private teamStats = new Map<string, TeamStat>();
  private users = new Map<string, User>();
  private sessions = new Map<string, Session>();
  private gamesMap = new Map<string, Game>();
  private fbTrackingMap = new Map<string, FbTracking>();
  private fbProcessedMap = new Map<string, FbProcessedGame>();
  private db = db;

  constructor() {
    this.seedTeamStats();
  }

  private seedTeamStats() {
    const teams: InsertTeamStat[] = [
      { team: "CLE", gamesPlayed: 15, firstToScore: 12, percentage: 80.0, avgPoints: 2.4 },
      { team: "OKC", gamesPlayed: 15, firstToScore: 11, percentage: 73.3, avgPoints: 2.5 },
      { team: "LAL", gamesPlayed: 14, firstToScore: 9, percentage: 64.3, avgPoints: 2.2 },
      { team: "TOR", gamesPlayed: 15, firstToScore: 9, percentage: 60.0, avgPoints: 2.3 },
      { team: "MIN", gamesPlayed: 15, firstToScore: 8, percentage: 53.3, avgPoints: 2.2 },
      { team: "DEN", gamesPlayed: 14, firstToScore: 7, percentage: 50.0, avgPoints: 2.1 },
      { team: "MEM", gamesPlayed: 13, firstToScore: 5, percentage: 38.5, avgPoints: 1.9 },
      { team: "MIL", gamesPlayed: 14, firstToScore: 5, percentage: 35.7, avgPoints: 2.0 },
      { team: "IND", gamesPlayed: 13, firstToScore: 4, percentage: 30.8, avgPoints: 1.8 },
      { team: "CHA", gamesPlayed: 12, firstToScore: 3, percentage: 25.0, avgPoints: 1.7 },
    ];
    for (const stat of teams) {
      const id = randomUUID();
      this.teamStats.set(id, { ...stat, id });
    }
  }

  async getGames(): Promise<Game[]> {
    if (this.db) return this.db.select().from(gamesTable);
    return Array.from(this.gamesMap.values()).sort((a, b) => {
      if (a.gameTime && b.gameTime) return new Date(a.gameTime).getTime() - new Date(b.gameTime).getTime();
      return 0;
    });
  }

  async getGamesByDate(date: string): Promise<Game[]> {
    if (this.db) return this.db.select().from(gamesTable).where(eq(gamesTable.gameDate, date));
    return Array.from(this.gamesMap.values()).filter(game => game.gameDate === date);
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    if (this.db) {
      const [game] = await this.db.insert(gamesTable).values(insertGame).returning();
      return game;
    }
    const id = randomUUID();
    const game: Game = {
      ...insertGame,
      id,
      status: insertGame.status ?? "scheduled",
      awayStarters: insertGame.awayStarters ?? null,
      homeStarters: insertGame.homeStarters ?? null,
      awayScore: insertGame.awayScore ?? null,
      homeScore: insertGame.homeScore ?? null,
      gameTime: insertGame.gameTime ?? null,
      espnGameId: insertGame.espnGameId ?? null,
      lastSynced: insertGame.lastSynced ?? null,
    };
    this.gamesMap.set(id, game);
    return game;
  }

  async updateGame(gameId: string, updates: Partial<Omit<Game, "id">>): Promise<Game | undefined> {
    const filteredUpdates = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined));
    if (this.db) {
      const [updated] = await this.db.update(gamesTable).set(filteredUpdates).where(eq(gamesTable.id, gameId)).returning();
      return updated;
    }
    const existing = this.gamesMap.get(gameId);
    if (!existing) return undefined;
    const updated = { ...existing, ...filteredUpdates } as Game;
    this.gamesMap.set(gameId, updated);
    return updated;
  }

  async deleteGame(gameId: string): Promise<void> {
    if (this.db) {
      await this.db.delete(gamesTable).where(eq(gamesTable.id, gameId));
      return;
    }
    this.gamesMap.delete(gameId);
  }

  async getPlayerStats(): Promise<PlayerStat[]> {
    return Array.from(this.playerStats.values()).sort((a, b) => b.firstBaskets - a.firstBaskets);
  }

  async getPlayerStatsByTeam(team: string): Promise<PlayerStat[]> {
    return Array.from(this.playerStats.values()).filter(stat => stat.team === team).sort((a, b) => b.firstBaskets - a.firstBaskets);
  }

  async getPlayerStatById(id: string): Promise<PlayerStat | undefined> {
    return this.playerStats.get(id);
  }

  async getTodayStarters(): Promise<PlayerStat[]> {
    const todayGames = await this.getGamesByDate("Today");
    const starterNames = new Set<string>();
    for (const game of todayGames) {
      for (const name of game.awayStarters ?? []) starterNames.add(name);
      for (const name of game.homeStarters ?? []) starterNames.add(name);
    }
    return Array.from(this.playerStats.values()).filter(stat => starterNames.has(stat.player)).sort((a, b) => b.percentage - a.percentage);
  }

  async createPlayerStat(insertStat: InsertPlayerStat): Promise<PlayerStat> {
    const id = randomUUID();
    const stat: PlayerStat = {
      ...insertStat,
      id,
      odds: insertStat.odds || null,
      sportsbook: insertStat.sportsbook || null,
      season: insertStat.season || "2024/2025",
      q1FgaRate: insertStat.q1FgaRate ?? null,
      last10GamesPercent: insertStat.last10GamesPercent ?? null,
      injuryStatus: insertStat.injuryStatus ?? null,
      injuryNote: insertStat.injuryNote ?? null,
      lastUpdated: insertStat.lastUpdated ?? null,
    };
    this.playerStats.set(id, stat);
    return stat;
  }

  async updatePlayerInjuryStatus(playerId: string, injuryStatus: string | null, injuryNote: string | null): Promise<PlayerStat | undefined> {
    const player = this.playerStats.get(playerId);
    if (!player) return undefined;
    const updated: PlayerStat = { ...player, injuryStatus, injuryNote, lastUpdated: new Date().toISOString() };
    this.playerStats.set(playerId, updated);
    return updated;
  }

  async getTeamStats(): Promise<TeamStat[]> {
    return Array.from(this.teamStats.values()).sort((a, b) => b.percentage - a.percentage);
  }

  async getTeamStatByTeam(team: string): Promise<TeamStat | undefined> {
    return Array.from(this.teamStats.values()).find(stat => stat.team === team);
  }

  async createTeamStat(insertStat: InsertTeamStat): Promise<TeamStat> {
    const id = randomUUID();
    const stat: TeamStat = { ...insertStat, id };
    this.teamStats.set(id, stat);
    return stat;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.trim().toLowerCase();
    if (this.db) {
      const [user] = await this.db.select().from(usersTable).where(eq(usersTable.email, normalized)).limit(1);
      return user;
    }
    return Array.from(this.users.values()).find(user => user.email === normalized);
  }

  async getUserById(id: string): Promise<User | undefined> {
    if (this.db) {
      const [user] = await this.db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
      return user;
    }
    return this.users.get(id);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const normalizedUser = { ...insertUser, email: insertUser.email.trim().toLowerCase() };
    if (this.db) {
      const [user] = await this.db.insert(usersTable).values(normalizedUser).returning();
      return user;
    }
    const id = randomUUID();
    const user: User = { ...normalizedUser, id, role: normalizedUser.role || "user", createdAt: new Date() };
    this.users.set(id, user);
    return user;
  }

  async createSession(insertSession: InsertSession): Promise<Session> {
    const id = randomUUID();
    const session: Session = { ...insertSession, id };
    this.sessions.set(id, session);
    return session;
  }

  async getSessionByToken(token: string): Promise<Session | undefined> {
    return Array.from(this.sessions.values()).find(session => session.sessionToken === token);
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async deleteExpiredSessions(): Promise<void> {
    const now = new Date();
    for (const [id, session] of this.sessions.entries()) {
      if (new Date(session.expiresAt) < now) this.sessions.delete(id);
    }
  }

  async getAllFbTracking(): Promise<FbTracking[]> {
    if (this.db) return this.db.select().from(fbTrackingTable).orderBy(fbTrackingTable.playerName);
    return Array.from(this.fbTrackingMap.values()).sort((a, b) => a.playerName.localeCompare(b.playerName));
  }

  async getFbTrackingByPlayer(playerName: string, team: string): Promise<FbTracking | undefined> {
    if (this.db) {
      const rows = await this.db.select().from(fbTrackingTable).where(and(eq(fbTrackingTable.playerName, playerName), eq(fbTrackingTable.team, team)));
      return rows[0];
    }
    return Array.from(this.fbTrackingMap.values()).find(row => row.playerName === playerName && row.team === team);
  }

  async upsertFbTracking(playerName: string, team: string, fbScored: number, season = "2025/26", gamesTracked?: number): Promise<FbTracking> {
    const now = new Date().toISOString();
    if (this.db) {
      const existing = await this.getFbTrackingByPlayer(playerName, team);
      if (existing) {
        const setFields: Partial<FbTracking> = { fbScored, lastUpdated: now };
        if (gamesTracked !== undefined) setFields.gamesTracked = gamesTracked;
        const [updated] = await this.db.update(fbTrackingTable).set(setFields).where(eq(fbTrackingTable.id, existing.id)).returning();
        return updated;
      }
      const [created] = await this.db.insert(fbTrackingTable).values({ playerName, team, fbScored, gamesTracked: gamesTracked ?? 0, season, lastUpdated: now }).returning();
      return created;
    }
    const existing = await this.getFbTrackingByPlayer(playerName, team);
    if (existing) {
      const updated: FbTracking = { ...existing, fbScored, lastUpdated: now, ...(gamesTracked !== undefined ? { gamesTracked } : {}) };
      this.fbTrackingMap.set(existing.id, updated);
      return updated;
    }
    const id = randomUUID();
    const record: FbTracking = { id, playerName, team, fbScored, gamesTracked: gamesTracked ?? 0, season, lastUpdated: now };
    this.fbTrackingMap.set(id, record);
    return record;
  }

  async incrementFbScored(playerName: string, team: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.db) {
      const existing = await this.getFbTrackingByPlayer(playerName, team);
      if (existing) {
        await this.db.update(fbTrackingTable).set({ fbScored: existing.fbScored + 1, gamesTracked: existing.gamesTracked + 1, lastUpdated: now }).where(eq(fbTrackingTable.id, existing.id));
      } else {
        await this.db.insert(fbTrackingTable).values({ playerName, team, fbScored: 1, gamesTracked: 1, season: "2025/26", lastUpdated: now });
      }
      return;
    }
    const existing = await this.getFbTrackingByPlayer(playerName, team);
    if (existing) {
      const updated: FbTracking = { ...existing, fbScored: existing.fbScored + 1, gamesTracked: existing.gamesTracked + 1, lastUpdated: now };
      this.fbTrackingMap.set(existing.id, updated);
    } else {
      const id = randomUUID();
      this.fbTrackingMap.set(id, { id, playerName, team, fbScored: 1, gamesTracked: 1, season: "2025/26", lastUpdated: now });
    }
  }

  async isGameProcessed(espnGameId: string): Promise<boolean> {
    if (this.db) {
      const rows = await this.db.select().from(fbProcessedGamesTable).where(eq(fbProcessedGamesTable.espnGameId, espnGameId));
      return rows.length > 0;
    }
    return Array.from(this.fbProcessedMap.values()).some(row => row.espnGameId === espnGameId);
  }

  async markGameProcessed(espnGameId: string, firstScorer?: string, firstScorerTeam?: string): Promise<void> {
    const now = new Date().toISOString();
    if (this.db) {
      await this.db.insert(fbProcessedGamesTable).values({ espnGameId, firstScorer: firstScorer ?? null, firstScorerTeam: firstScorerTeam ?? null, processedAt: now }).onConflictDoNothing();
      return;
    }
    const id = randomUUID();
    this.fbProcessedMap.set(id, { id, espnGameId, firstScorer: firstScorer ?? null, firstScorerTeam: firstScorerTeam ?? null, processedAt: now });
  }

  async getProcessedGames(): Promise<FbProcessedGame[]> {
    if (this.db) return this.db.select().from(fbProcessedGamesTable).orderBy(fbProcessedGamesTable.processedAt);
    return Array.from(this.fbProcessedMap.values()).sort((a, b) => b.processedAt.localeCompare(a.processedAt));
  }
}

export const storage = new MemStorage();
