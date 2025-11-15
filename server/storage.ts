import { type Game, type InsertGame, type PlayerStat, type InsertPlayerStat, type TeamStat, type InsertTeamStat } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Games
  getGames(): Promise<Game[]>;
  getGamesByDate(date: string): Promise<Game[]>;
  createGame(game: InsertGame): Promise<Game>;

  // Player Stats
  getPlayerStats(): Promise<PlayerStat[]>;
  getPlayerStatById(id: string): Promise<PlayerStat | undefined>;
  createPlayerStat(stat: InsertPlayerStat): Promise<PlayerStat>;

  // Team Stats
  getTeamStats(): Promise<TeamStat[]>;
  getTeamStatByTeam(team: string): Promise<TeamStat | undefined>;
  createTeamStat(stat: InsertTeamStat): Promise<TeamStat>;
}

export class MemStorage implements IStorage {
  private games: Map<string, Game>;
  private playerStats: Map<string, PlayerStat>;
  private teamStats: Map<string, TeamStat>;

  constructor() {
    this.games = new Map();
    this.playerStats = new Map();
    this.teamStats = new Map();
    this.seedData();
  }

  private seedData() {
    // Seed games
    const todayGames: InsertGame[] = [
      {
        awayTeam: "MEM", awayPlayer: "J. Jackson Jr.", awayTipCount: 13, awayTipPercent: 46, awayScorePercent: 31,
        homeTeam: "CLE", homePlayer: "J. Allen", homeTipCount: 11, homeTipPercent: 64, homeScorePercent: 77,
        h2h: "N/A", gameDate: "Today"
      },
      {
        awayTeam: "LAL", awayPlayer: "D. Ayton", awayTipCount: 12, awayTipPercent: 58, awayScorePercent: 62,
        homeTeam: "MIL", homePlayer: "M. Turner", homeTipCount: 13, homeTipPercent: 31, homeScorePercent: 54,
        h2h: "N/A", gameDate: "Today"
      },
      {
        awayTeam: "DEN", awayPlayer: "N. Jokic", awayTipCount: 11, awayTipPercent: 36, awayScorePercent: 45,
        homeTeam: "MIN", homePlayer: "R. Gobert", homeTipCount: 12, homeTipPercent: 58, homeScorePercent: 58,
        h2h: "0 - 1", gameDate: "Today"
      },
      {
        awayTeam: "OKC", awayPlayer: "C. Holmgren", awayTipCount: 9, awayTipPercent: 67, awayScorePercent: 62,
        homeTeam: "CHA", homePlayer: "R. Kalkbrenner", homeTipCount: 11, homeTipPercent: 45, homeScorePercent: 25,
        h2h: "N/A", gameDate: "Today"
      },
      {
        awayTeam: "TOR", awayPlayer: "J. Poeltl", awayTipCount: 8, awayTipPercent: 63, awayScorePercent: 75,
        homeTeam: "IND", homePlayer: "I. Jackson", homeTipCount: 8, homeTipPercent: 25, homeScorePercent: 50,
        h2h: "N/A", gameDate: "Today"
      }
    ];

    todayGames.forEach(game => {
      const id = randomUUID();
      this.games.set(id, { ...game, id });
    });

    // Seed player stats
    const players: InsertPlayerStat[] = [
      { player: "J. Allen", team: "CLE", gamesPlayed: 42, firstBaskets: 18, percentage: 42.9, avgTipWin: 64 },
      { player: "N. Jokic", team: "DEN", gamesPlayed: 45, firstBaskets: 16, percentage: 35.6, avgTipWin: 36 },
      { player: "J. Jackson Jr.", team: "MEM", gamesPlayed: 40, firstBaskets: 15, percentage: 37.5, avgTipWin: 46 },
      { player: "R. Gobert", team: "MIN", gamesPlayed: 44, firstBaskets: 14, percentage: 31.8, avgTipWin: 58 },
      { player: "C. Holmgren", team: "OKC", gamesPlayed: 38, firstBaskets: 13, percentage: 34.2, avgTipWin: 67 },
      { player: "D. Ayton", team: "LAL", gamesPlayed: 41, firstBaskets: 12, percentage: 29.3, avgTipWin: 58 },
      { player: "M. Turner", team: "MIL", gamesPlayed: 39, firstBaskets: 11, percentage: 28.2, avgTipWin: 31 },
      { player: "J. Poeltl", team: "TOR", gamesPlayed: 43, firstBaskets: 10, percentage: 23.3, avgTipWin: 63 },
      { player: "I. Jackson", team: "IND", gamesPlayed: 37, firstBaskets: 9, percentage: 24.3, avgTipWin: 25 },
      { player: "R. Kalkbrenner", team: "CHA", gamesPlayed: 35, firstBaskets: 8, percentage: 22.9, avgTipWin: 45 },
    ];

    players.forEach(stat => {
      const id = randomUUID();
      this.playerStats.set(id, { ...stat, id });
    });

    // Seed team stats
    const teams: InsertTeamStat[] = [
      { team: "CLE", gamesPlayed: 48, firstToScore: 37, percentage: 77.1, avgPoints: 2.3 },
      { team: "LAL", gamesPlayed: 45, firstToScore: 28, percentage: 62.2, avgPoints: 2.2 },
      { team: "OKC", gamesPlayed: 44, firstToScore: 27, percentage: 61.4, avgPoints: 2.4 },
      { team: "MIN", gamesPlayed: 47, firstToScore: 27, percentage: 57.4, avgPoints: 2.2 },
      { team: "MIL", gamesPlayed: 46, firstToScore: 25, percentage: 54.3, avgPoints: 2.1 },
      { team: "DEN", gamesPlayed: 46, firstToScore: 21, percentage: 45.7, avgPoints: 2.1 },
      { team: "MEM", gamesPlayed: 45, firstToScore: 14, percentage: 31.1, avgPoints: 1.9 },
      { team: "CHA", gamesPlayed: 43, firstToScore: 11, percentage: 25.6, avgPoints: 1.8 },
      { team: "IND", gamesPlayed: 42, firstToScore: 21, percentage: 50.0, avgPoints: 2.0 },
      { team: "TOR", gamesPlayed: 44, firstToScore: 33, percentage: 75.0, avgPoints: 2.3 },
    ];

    teams.forEach(stat => {
      const id = randomUUID();
      this.teamStats.set(id, { ...stat, id });
    });
  }

  // Games
  async getGames(): Promise<Game[]> {
    return Array.from(this.games.values());
  }

  async getGamesByDate(date: string): Promise<Game[]> {
    return Array.from(this.games.values()).filter(game => game.gameDate === date);
  }

  async createGame(insertGame: InsertGame): Promise<Game> {
    const id = randomUUID();
    const game: Game = { ...insertGame, id };
    this.games.set(id, game);
    return game;
  }

  // Player Stats
  async getPlayerStats(): Promise<PlayerStat[]> {
    return Array.from(this.playerStats.values()).sort((a, b) => b.firstBaskets - a.firstBaskets);
  }

  async getPlayerStatById(id: string): Promise<PlayerStat | undefined> {
    return this.playerStats.get(id);
  }

  async createPlayerStat(insertStat: InsertPlayerStat): Promise<PlayerStat> {
    const id = randomUUID();
    const stat: PlayerStat = { ...insertStat, id };
    this.playerStats.set(id, stat);
    return stat;
  }

  // Team Stats
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
}

export const storage = new MemStorage();
