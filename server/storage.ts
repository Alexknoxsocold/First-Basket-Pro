import { type Game, type InsertGame, type PlayerStat, type InsertPlayerStat, type TeamStat, type InsertTeamStat } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Games
  getGames(): Promise<Game[]>;
  getGamesByDate(date: string): Promise<Game[]>;
  createGame(game: InsertGame): Promise<Game>;

  // Player Stats
  getPlayerStats(): Promise<PlayerStat[]>;
  getPlayerStatsByTeam(team: string): Promise<PlayerStat[]>;
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

    // Seed comprehensive player stats for 2024/2025 season - Full rosters
    const players: InsertPlayerStat[] = [
      // Cleveland Cavaliers - Updated with accurate 2024-25 roster
      { player: "Jarrett Allen", team: "CLE", position: "C", gamesPlayed: 11, firstBaskets: 2, percentage: 18.2, avgTipWin: 64, odds: "+750", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Donovan Mitchell", team: "CLE", position: "SG", gamesPlayed: 11, firstBaskets: 0, percentage: 0.0, avgTipWin: 12, odds: "+700", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Darius Garland", team: "CLE", position: "PG", gamesPlayed: 11, firstBaskets: 2, percentage: 18.2, avgTipWin: 8, odds: "+800", sportsbook: "bet365", season: "2024/2025" },
      { player: "Evan Mobley", team: "CLE", position: "PF", gamesPlayed: 12, firstBaskets: 3, percentage: 25.0, avgTipWin: 18, odds: "+575", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Sam Merrill", team: "CLE", position: "SG", gamesPlayed: 6, firstBaskets: 0, percentage: 0.0, avgTipWin: 5, odds: "+1000", sportsbook: "espnbet", season: "2024/2025" },
      { player: "De'Andre Hunter", team: "CLE", position: "SF", gamesPlayed: 10, firstBaskets: 3, percentage: 30.0, avgTipWin: 15, odds: "+775", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Caris LeVert", team: "CLE", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 7, odds: "+900", sportsbook: "fanduel", season: "2024/2025" },
      
      // Denver Nuggets - Updated with accurate 2024-25 roster
      { player: "Nikola Jokic", team: "DEN", position: "C", gamesPlayed: 14, firstBaskets: 6, percentage: 42.9, avgTipWin: 36, odds: "+550", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Jamal Murray", team: "DEN", position: "PG", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 15, odds: "+800", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Michael Porter Jr.", team: "DEN", position: "SF", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 11, odds: "+950", sportsbook: "bet365", season: "2024/2025" },
      { player: "Aaron Gordon", team: "DEN", position: "PF", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 9, odds: "+1000", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Christian Braun", team: "DEN", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 6, odds: "+1400", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Russell Westbrook", team: "DEN", position: "PG", gamesPlayed: 11, firstBaskets: 0, percentage: 0.0, avgTipWin: 7, odds: "+1500", sportsbook: "fanduel", season: "2024/2025" },

      // Memphis Grizzlies - Updated with accurate 2024-25 roster
      { player: "Jaren Jackson Jr.", team: "MEM", position: "PF", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 46, odds: "+700", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Ja Morant", team: "MEM", position: "PG", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 22, odds: "+725", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Desmond Bane", team: "MEM", position: "SG", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 13, odds: "+850", sportsbook: "bet365", season: "2024/2025" },
      { player: "Zach Edey", team: "MEM", position: "C", gamesPlayed: 10, firstBaskets: 1, percentage: 10.0, avgTipWin: 52, odds: "+1100", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Marcus Smart", team: "MEM", position: "PG", gamesPlayed: 12, firstBaskets: 0, percentage: 0.0, avgTipWin: 8, odds: "+1200", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Jaylen Wells", team: "MEM", position: "SF", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 12, odds: "+1300", sportsbook: "fanduel", season: "2024/2025" },

      // Minnesota Timberwolves - Updated (KAT traded to Knicks)
      { player: "Rudy Gobert", team: "MIN", position: "C", gamesPlayed: 15, firstBaskets: 7, percentage: 46.7, avgTipWin: 58, odds: "+650", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Anthony Edwards", team: "MIN", position: "SG", gamesPlayed: 15, firstBaskets: 4, percentage: 26.7, avgTipWin: 18, odds: "+750", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Julius Randle", team: "MIN", position: "PF", gamesPlayed: 14, firstBaskets: 3, percentage: 21.4, avgTipWin: 24, odds: "+850", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Mike Conley", team: "MIN", position: "PG", gamesPlayed: 13, firstBaskets: 0, percentage: 0.0, avgTipWin: 5, odds: "+1400", sportsbook: "bet365", season: "2024/2025" },
      { player: "Jaden McDaniels", team: "MIN", position: "SF", gamesPlayed: 14, firstBaskets: 1, percentage: 7.1, avgTipWin: 9, odds: "+1200", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Donte DiVincenzo", team: "MIN", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 11, odds: "+1100", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Naz Reid", team: "MIN", position: "C", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 28, odds: "+1000", sportsbook: "betmgm", season: "2024/2025" },

      // Milwaukee Bucks - Updated with accurate 2024-25 roster
      { player: "Giannis Antetokounmpo", team: "MIL", position: "PF", gamesPlayed: 14, firstBaskets: 5, percentage: 35.7, avgTipWin: 28, odds: "+600", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Damian Lillard", team: "MIL", position: "PG", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 12, odds: "+800", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Brook Lopez", team: "MIL", position: "C", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 25, odds: "+1100", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Khris Middleton", team: "MIL", position: "SF", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 8, odds: "+1200", sportsbook: "bet365", season: "2024/2025" },
      { player: "Bobby Portis", team: "MIL", position: "PF", gamesPlayed: 12, firstBaskets: 2, percentage: 16.7, avgTipWin: 22, odds: "+950", sportsbook: "espnbet", season: "2024/2025" },

      // Los Angeles Lakers - Updated with accurate 2024-25 roster
      { player: "Anthony Davis", team: "LAL", position: "C", gamesPlayed: 12, firstBaskets: 4, percentage: 33.3, avgTipWin: 48, odds: "+650", sportsbook: "betmgm", season: "2024/2025" },
      { player: "LeBron James", team: "LAL", position: "SF", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 16, odds: "+800", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Austin Reaves", team: "LAL", position: "SG", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 9, odds: "+1000", sportsbook: "draftkings", season: "2024/2025" },
      { player: "D'Angelo Russell", team: "LAL", position: "PG", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 11, odds: "+950", sportsbook: "bet365", season: "2024/2025" },
      { player: "Rui Hachimura", team: "LAL", position: "PF", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 14, odds: "+1100", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Jaxson Hayes", team: "LAL", position: "C", gamesPlayed: 10, firstBaskets: 1, percentage: 10.0, avgTipWin: 35, odds: "+1300", sportsbook: "betmgm", season: "2024/2025" },

      // Oklahoma City Thunder - Updated (Giddey traded to Bulls)
      { player: "Chet Holmgren", team: "OKC", position: "C", gamesPlayed: 14, firstBaskets: 8, percentage: 57.1, avgTipWin: 67, odds: "+500", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Shai Gilgeous-Alexander", team: "OKC", position: "PG", gamesPlayed: 15, firstBaskets: 4, percentage: 26.7, avgTipWin: 19, odds: "+750", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Jalen Williams", team: "OKC", position: "SF", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 12, odds: "+900", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Luguentz Dort", team: "OKC", position: "SG", gamesPlayed: 12, firstBaskets: 0, percentage: 0.0, avgTipWin: 4, odds: "+1500", sportsbook: "bet365", season: "2024/2025" },
      { player: "Alex Caruso", team: "OKC", position: "SG", gamesPlayed: 13, firstBaskets: 0, percentage: 0.0, avgTipWin: 6, odds: "+1600", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Isaiah Hartenstein", team: "OKC", position: "C", gamesPlayed: 11, firstBaskets: 2, percentage: 18.2, avgTipWin: 42, odds: "+1000", sportsbook: "fanduel", season: "2024/2025" },

      // Charlotte Hornets - Updated with accurate 2024-25 roster
      { player: "Mark Williams", team: "CHA", position: "C", gamesPlayed: 12, firstBaskets: 3, percentage: 25.0, avgTipWin: 45, odds: "+900", sportsbook: "fanduel", season: "2024/2025" },
      { player: "LaMelo Ball", team: "CHA", position: "PG", gamesPlayed: 10, firstBaskets: 3, percentage: 30.0, avgTipWin: 21, odds: "+800", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Miles Bridges", team: "CHA", position: "PF", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 11, odds: "+1100", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Brandon Miller", team: "CHA", position: "SF", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 8, odds: "+1200", sportsbook: "bet365", season: "2024/2025" },
      { player: "Nick Richards", team: "CHA", position: "C", gamesPlayed: 10, firstBaskets: 2, percentage: 20.0, avgTipWin: 38, odds: "+1000", sportsbook: "espnbet", season: "2024/2025" },

      // Toronto Raptors - Updated (Siakam & OG traded)
      { player: "Jakob Poeltl", team: "TOR", position: "C", gamesPlayed: 14, firstBaskets: 7, percentage: 50.0, avgTipWin: 63, odds: "+700", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Scottie Barnes", team: "TOR", position: "PF", gamesPlayed: 15, firstBaskets: 4, percentage: 26.7, avgTipWin: 22, odds: "+850", sportsbook: "fanduel", season: "2024/2025" },
      { player: "RJ Barrett", team: "TOR", position: "SF", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 18, odds: "+950", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Immanuel Quickley", team: "TOR", position: "PG", gamesPlayed: 14, firstBaskets: 1, percentage: 7.1, avgTipWin: 9, odds: "+1100", sportsbook: "bet365", season: "2024/2025" },
      { player: "Gradey Dick", team: "TOR", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 11, odds: "+1300", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Ochai Agbaji", team: "TOR", position: "SG", gamesPlayed: 11, firstBaskets: 0, percentage: 0.0, avgTipWin: 7, odds: "+1400", sportsbook: "fanduel", season: "2024/2025" },

      // Indiana Pacers - Updated (added Siakam)
      { player: "Myles Turner", team: "IND", position: "C", gamesPlayed: 12, firstBaskets: 3, percentage: 25.0, avgTipWin: 28, odds: "+800", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Tyrese Haliburton", team: "IND", position: "PG", gamesPlayed: 13, firstBaskets: 4, percentage: 30.8, avgTipWin: 17, odds: "+750", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Pascal Siakam", team: "IND", position: "PF", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 22, odds: "+850", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Bennedict Mathurin", team: "IND", position: "SG", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 10, odds: "+1100", sportsbook: "bet365", season: "2024/2025" },
      { player: "Andrew Nembhard", team: "IND", position: "PG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 8, odds: "+1200", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Aaron Nesmith", team: "IND", position: "SF", gamesPlayed: 11, firstBaskets: 0, percentage: 0.0, avgTipWin: 9, odds: "+1300", sportsbook: "fanduel", season: "2024/2025" },
    ];

    players.forEach(stat => {
      const id = randomUUID();
      this.playerStats.set(id, { ...stat, id, odds: stat.odds || null, sportsbook: stat.sportsbook || null, season: stat.season || "2024/2025" });
    });

    // Seed team stats
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

  async getPlayerStatsByTeam(team: string): Promise<PlayerStat[]> {
    return Array.from(this.playerStats.values())
      .filter(stat => stat.team === team)
      .sort((a, b) => b.firstBaskets - a.firstBaskets);
  }

  async getPlayerStatById(id: string): Promise<PlayerStat | undefined> {
    return this.playerStats.get(id);
  }

  async createPlayerStat(insertStat: InsertPlayerStat): Promise<PlayerStat> {
    const id = randomUUID();
    const stat: PlayerStat = { ...insertStat, id, odds: insertStat.odds || null, sportsbook: insertStat.sportsbook || null, season: insertStat.season || "2024/2025" };
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
