import { type Game, type InsertGame, type PlayerStat, type InsertPlayerStat, type TeamStat, type InsertTeamStat } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // Games
  getGames(): Promise<Game[]>;
  getGamesByDate(date: string): Promise<Game[]>;
  createGame(game: InsertGame): Promise<Game>;
  updateGame(gameId: string, updates: Partial<Omit<Game, 'id'>>): Promise<Game | undefined>;

  // Player Stats
  getPlayerStats(): Promise<PlayerStat[]>;
  getPlayerStatsByTeam(team: string): Promise<PlayerStat[]>;
  getPlayerStatById(id: string): Promise<PlayerStat | undefined>;
  getTodayStarters(): Promise<PlayerStat[]>; // Get only starting players for today's games
  createPlayerStat(stat: InsertPlayerStat): Promise<PlayerStat>;
  updatePlayerInjuryStatus(playerId: string, injuryStatus: string | null, injuryNote: string | null): Promise<PlayerStat | undefined>;

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
    // Seed games with realistic starting lineups and game times (sorted chronologically)
    const todayGames: InsertGame[] = [
      {
        awayTeam: "MEM", awayPlayer: "Jaren Jackson Jr.", awayTipCount: 13, awayTipPercent: 46, awayScorePercent: 31,
        awayStarters: ["Ja Morant", "Desmond Bane", "Jaylen Wells", "Jaren Jackson Jr.", "Zach Edey"],
        homeTeam: "CLE", homePlayer: "Jarrett Allen", homeTipCount: 11, homeTipPercent: 64, homeScorePercent: 77,
        homeStarters: ["Darius Garland", "Donovan Mitchell", "Lonzo Ball", "Evan Mobley", "Jarrett Allen"],
        h2h: "N/A", gameDate: "Today", gameTime: "2025-11-16T19:00:00Z" // 7:00 PM ET
      },
      {
        awayTeam: "TOR", awayPlayer: "Jakob Poeltl", awayTipCount: 8, awayTipPercent: 63, awayScorePercent: 75,
        awayStarters: ["Immanuel Quickley", "RJ Barrett", "Ochai Agbaji", "Scottie Barnes", "Jakob Poeltl"],
        homeTeam: "IND", homePlayer: "Isaiah Jackson", homeTipCount: 8, homeTipPercent: 25, homeScorePercent: 50,
        homeStarters: ["Tyrese Haliburton", "Andrew Nembhard", "Aaron Nesmith", "Pascal Siakam", "Isaiah Jackson"],
        h2h: "N/A", gameDate: "Today", gameTime: "2025-11-16T19:30:00Z" // 7:30 PM ET
      },
      {
        awayTeam: "LAL", awayPlayer: "Deandre Ayton", awayTipCount: 12, awayTipPercent: 58, awayScorePercent: 62,
        awayStarters: ["Luka Doncic", "Austin Reaves", "LeBron James", "Rui Hachimura", "Deandre Ayton"],
        homeTeam: "MIL", homePlayer: "Myles Turner", homeTipCount: 13, homeTipPercent: 31, homeScorePercent: 54,
        homeStarters: ["Damian Lillard", "Gary Trent Jr.", "Kyle Kuzma", "Giannis Antetokounmpo", "Myles Turner"],
        h2h: "N/A", gameDate: "Today", gameTime: "2025-11-16T20:00:00Z" // 8:00 PM ET
      },
      {
        awayTeam: "OKC", awayPlayer: "Chet Holmgren", awayTipCount: 9, awayTipPercent: 67, awayScorePercent: 62,
        awayStarters: ["Shai Gilgeous-Alexander", "Jalen Williams", "Luguentz Dort", "Jaylin Williams", "Chet Holmgren"],
        homeTeam: "CHA", homePlayer: "Ryan Kalkbrenner", homeTipCount: 11, homeTipPercent: 45, homeScorePercent: 25,
        homeStarters: ["LaMelo Ball", "Josh Green", "Brandon Miller", "Miles Bridges", "Ryan Kalkbrenner"],
        h2h: "N/A", gameDate: "Today", gameTime: "2025-11-16T22:00:00Z" // 10:00 PM ET
      },
      {
        awayTeam: "DEN", awayPlayer: "Nikola Jokic", awayTipCount: 11, awayTipPercent: 36, awayScorePercent: 45,
        awayStarters: ["Jamal Murray", "Christian Braun", "Cameron Johnson", "Aaron Gordon", "Nikola Jokic"],
        homeTeam: "MIN", homePlayer: "Rudy Gobert", homeTipCount: 12, homeTipPercent: 58, homeScorePercent: 58,
        homeStarters: ["Mike Conley", "Anthony Edwards", "Jaden McDaniels", "Julius Randle", "Rudy Gobert"],
        h2h: "0 - 1", gameDate: "Today", gameTime: "2025-11-16T23:00:00Z" // 11:00 PM ET
      }
    ];

    todayGames.forEach(game => {
      const id = randomUUID();
      this.games.set(id, { 
        ...game, 
        id,
        status: 'scheduled',
        awayScore: null,
        homeScore: null,
        espnGameId: null,
        lastSynced: null,
        awayStarters: game.awayStarters || null,
        homeStarters: game.homeStarters || null,
        gameTime: game.gameTime || null
      });
    });

    // Seed comprehensive player stats for 2024/2025 season - Full rosters
    const players: InsertPlayerStat[] = [
      // Cleveland Cavaliers - Updated for 2025-26 season (Lonzo Ball from Bulls)
      { player: "Jarrett Allen", team: "CLE", position: "C", gamesPlayed: 11, firstBaskets: 2, percentage: 18.2, avgTipWin: 64, q1FgaRate: 22.5, last10GamesPercent: 30.0, odds: "+750", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Donovan Mitchell", team: "CLE", position: "SG", gamesPlayed: 11, firstBaskets: 0, percentage: 0.0, avgTipWin: 12, q1FgaRate: 18.3, last10GamesPercent: 10.0, odds: "+700", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Darius Garland", team: "CLE", position: "PG", gamesPlayed: 11, firstBaskets: 2, percentage: 18.2, avgTipWin: 8, q1FgaRate: 15.7, last10GamesPercent: 20.0, odds: "+800", sportsbook: "bet365", season: "2024/2025" },
      { player: "Evan Mobley", team: "CLE", position: "PF", gamesPlayed: 12, firstBaskets: 3, percentage: 25.0, avgTipWin: 18, q1FgaRate: 19.2, last10GamesPercent: 30.0, odds: "+575", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Sam Merrill", team: "CLE", position: "SG", gamesPlayed: 6, firstBaskets: 0, percentage: 0.0, avgTipWin: 5, q1FgaRate: 8.4, last10GamesPercent: 0.0, odds: "+1000", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Lonzo Ball", team: "CLE", position: "PG", gamesPlayed: 10, firstBaskets: 2, percentage: 20.0, avgTipWin: 10, q1FgaRate: 12.1, last10GamesPercent: 20.0, odds: "+950", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Caris LeVert", team: "CLE", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 7, q1FgaRate: 11.5, last10GamesPercent: 10.0, odds: "+900", sportsbook: "fanduel", season: "2024/2025" },
      
      // Denver Nuggets - Updated for 2025-26 season (Cameron Johnson from Brooklyn for MPJ)
      { player: "Nikola Jokic", team: "DEN", position: "C", gamesPlayed: 14, firstBaskets: 6, percentage: 42.9, avgTipWin: 36, q1FgaRate: 24.8, last10GamesPercent: 50.0, odds: "+550", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Jamal Murray", team: "DEN", position: "PG", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 15, q1FgaRate: 16.9, last10GamesPercent: 20.0, odds: "+800", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Cameron Johnson", team: "DEN", position: "SF", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 11, q1FgaRate: 13.2, last10GamesPercent: 20.0, odds: "+900", sportsbook: "bet365", season: "2024/2025" },
      { player: "Aaron Gordon", team: "DEN", position: "PF", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 9, q1FgaRate: 14.7, last10GamesPercent: 10.0, odds: "+1000", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Christian Braun", team: "DEN", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 6, q1FgaRate: 9.8, last10GamesPercent: 10.0, odds: "+1400", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Bruce Brown", team: "DEN", position: "SF", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 8, q1FgaRate: 10.5, last10GamesPercent: 10.0, odds: "+1200", sportsbook: "fanduel", season: "2024/2025" },

      // Memphis Grizzlies - Updated with accurate 2024-25 roster
      { player: "Jaren Jackson Jr.", team: "MEM", position: "PF", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 46, q1FgaRate: 21.3, last10GamesPercent: 10.0, odds: "+700", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Ja Morant", team: "MEM", position: "PG", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 22, q1FgaRate: 19.4, last10GamesPercent: 10.0, odds: "+725", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Desmond Bane", team: "MEM", position: "SG", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 13, q1FgaRate: 17.2, last10GamesPercent: 20.0, odds: "+850", sportsbook: "bet365", season: "2024/2025" },
      { player: "Zach Edey", team: "MEM", position: "C", gamesPlayed: 10, firstBaskets: 1, percentage: 10.0, avgTipWin: 52, q1FgaRate: 18.6, last10GamesPercent: 10.0, odds: "+1100", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Marcus Smart", team: "MEM", position: "PG", gamesPlayed: 12, firstBaskets: 0, percentage: 0.0, avgTipWin: 8, q1FgaRate: 11.2, last10GamesPercent: 0.0, odds: "+1200", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Jaylen Wells", team: "MEM", position: "SF", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 12, q1FgaRate: 12.8, last10GamesPercent: 10.0, odds: "+1300", sportsbook: "fanduel", season: "2024/2025" },

      // Minnesota Timberwolves - Updated (KAT traded to Knicks)
      { player: "Rudy Gobert", team: "MIN", position: "C", gamesPlayed: 15, firstBaskets: 7, percentage: 46.7, avgTipWin: 58, q1FgaRate: 23.7, last10GamesPercent: 50.0, odds: "+650", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Anthony Edwards", team: "MIN", position: "SG", gamesPlayed: 15, firstBaskets: 4, percentage: 26.7, avgTipWin: 18, q1FgaRate: 20.5, last10GamesPercent: 30.0, odds: "+750", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Julius Randle", team: "MIN", position: "PF", gamesPlayed: 14, firstBaskets: 3, percentage: 21.4, avgTipWin: 24, q1FgaRate: 17.8, last10GamesPercent: 20.0, odds: "+850", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Mike Conley", team: "MIN", position: "PG", gamesPlayed: 13, firstBaskets: 0, percentage: 0.0, avgTipWin: 5, q1FgaRate: 9.3, last10GamesPercent: 0.0, odds: "+1400", sportsbook: "bet365", season: "2024/2025" },
      { player: "Jaden McDaniels", team: "MIN", position: "SF", gamesPlayed: 14, firstBaskets: 1, percentage: 7.1, avgTipWin: 9, q1FgaRate: 11.4, last10GamesPercent: 10.0, odds: "+1200", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Donte DiVincenzo", team: "MIN", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 11, q1FgaRate: 14.6, last10GamesPercent: 10.0, odds: "+1100", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Naz Reid", team: "MIN", position: "C", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 28, q1FgaRate: 16.2, last10GamesPercent: 20.0, odds: "+1000", sportsbook: "betmgm", season: "2024/2025" },

      // Milwaukee Bucks - Updated for 2025-26 season (Myles Turner from IND, Kyle Kuzma added)
      { player: "Damian Lillard", team: "MIL", position: "PG", gamesPlayed: 14, firstBaskets: 4, percentage: 28.6, avgTipWin: 14, q1FgaRate: 20.3, last10GamesPercent: 30.0, odds: "+750", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Gary Trent Jr.", team: "MIL", position: "SG", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 9, q1FgaRate: 13.2, last10GamesPercent: 10.0, odds: "+1100", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Kyle Kuzma", team: "MIL", position: "SF", gamesPlayed: 12, firstBaskets: 2, percentage: 16.7, avgTipWin: 14, q1FgaRate: 15.3, last10GamesPercent: 20.0, odds: "+900", sportsbook: "bet365", season: "2024/2025" },
      { player: "Giannis Antetokounmpo", team: "MIL", position: "PF", gamesPlayed: 14, firstBaskets: 5, percentage: 35.7, avgTipWin: 28, q1FgaRate: 22.4, last10GamesPercent: 40.0, odds: "+600", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Myles Turner", team: "MIL", position: "C", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 31, q1FgaRate: 20.1, last10GamesPercent: 30.0, odds: "+750", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Bobby Portis", team: "MIL", position: "PF", gamesPlayed: 12, firstBaskets: 2, percentage: 16.7, avgTipWin: 22, q1FgaRate: 16.8, last10GamesPercent: 20.0, odds: "+950", sportsbook: "espnbet", season: "2024/2025" },
      { player: "AJ Green", team: "MIL", position: "SG", gamesPlayed: 10, firstBaskets: 0, percentage: 0.0, avgTipWin: 5, q1FgaRate: 7.9, last10GamesPercent: 0.0, odds: "+1400", sportsbook: "fanduel", season: "2024/2025" },

      // Los Angeles Lakers - Updated (AD traded to Dallas for Luka in Feb 2025)
      { player: "Luka Doncic", team: "LAL", position: "PG", gamesPlayed: 12, firstBaskets: 5, percentage: 41.7, avgTipWin: 22, q1FgaRate: 21.8, last10GamesPercent: 50.0, odds: "+600", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Austin Reaves", team: "LAL", position: "SG", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 9, q1FgaRate: 12.4, last10GamesPercent: 10.0, odds: "+1000", sportsbook: "betmgm", season: "2024/2025" },
      { player: "LeBron James", team: "LAL", position: "SF", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 16, q1FgaRate: 18.6, last10GamesPercent: 30.0, odds: "+800", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Rui Hachimura", team: "LAL", position: "PF", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 14, q1FgaRate: 13.7, last10GamesPercent: 10.0, odds: "+1100", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Deandre Ayton", team: "LAL", position: "C", gamesPlayed: 11, firstBaskets: 2, percentage: 18.2, avgTipWin: 58, q1FgaRate: 20.4, last10GamesPercent: 20.0, odds: "+900", sportsbook: "bet365", season: "2024/2025" },
      { player: "D'Angelo Russell", team: "LAL", position: "PG", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 11, q1FgaRate: 14.9, last10GamesPercent: 20.0, odds: "+950", sportsbook: "bet365", season: "2024/2025" },
      { player: "Jaxson Hayes", team: "LAL", position: "C", gamesPlayed: 10, firstBaskets: 1, percentage: 10.0, avgTipWin: 35, q1FgaRate: 11.3, last10GamesPercent: 10.0, odds: "+1300", sportsbook: "fanduel", season: "2024/2025" },

      // Oklahoma City Thunder - Updated (Giddey traded to Bulls)
      { player: "Shai Gilgeous-Alexander", team: "OKC", position: "PG", gamesPlayed: 15, firstBaskets: 4, percentage: 26.7, avgTipWin: 19, q1FgaRate: 19.7, last10GamesPercent: 30.0, odds: "+750", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Jalen Williams", team: "OKC", position: "SF", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 12, q1FgaRate: 15.4, last10GamesPercent: 20.0, odds: "+900", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Luguentz Dort", team: "OKC", position: "SG", gamesPlayed: 12, firstBaskets: 0, percentage: 0.0, avgTipWin: 4, q1FgaRate: 8.1, last10GamesPercent: 0.0, odds: "+1500", sportsbook: "bet365", season: "2024/2025" },
      { player: "Jaylin Williams", team: "OKC", position: "PF", gamesPlayed: 10, firstBaskets: 1, percentage: 10.0, avgTipWin: 8, q1FgaRate: 11.9, last10GamesPercent: 10.0, odds: "+1300", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Chet Holmgren", team: "OKC", position: "C", gamesPlayed: 14, firstBaskets: 8, percentage: 57.1, avgTipWin: 67, q1FgaRate: 25.3, last10GamesPercent: 60.0, odds: "+500", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Alex Caruso", team: "OKC", position: "SG", gamesPlayed: 13, firstBaskets: 0, percentage: 0.0, avgTipWin: 6, q1FgaRate: 7.3, last10GamesPercent: 0.0, odds: "+1600", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Isaiah Hartenstein", team: "OKC", position: "C", gamesPlayed: 11, firstBaskets: 2, percentage: 18.2, avgTipWin: 42, q1FgaRate: 17.6, last10GamesPercent: 20.0, odds: "+1000", sportsbook: "fanduel", season: "2024/2025" },

      // Charlotte Hornets - Updated with accurate 2024-25 roster
      { player: "LaMelo Ball", team: "CHA", position: "PG", gamesPlayed: 10, firstBaskets: 3, percentage: 30.0, avgTipWin: 21, q1FgaRate: 20.2, last10GamesPercent: 40.0, odds: "+800", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Josh Green", team: "CHA", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 7, q1FgaRate: 11.5, last10GamesPercent: 10.0, odds: "+1200", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Brandon Miller", team: "CHA", position: "SF", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 8, q1FgaRate: 13.9, last10GamesPercent: 10.0, odds: "+1200", sportsbook: "bet365", season: "2024/2025" },
      { player: "Miles Bridges", team: "CHA", position: "PF", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 11, q1FgaRate: 14.5, last10GamesPercent: 10.0, odds: "+1100", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Ryan Kalkbrenner", team: "CHA", position: "C", gamesPlayed: 11, firstBaskets: 2, percentage: 18.2, avgTipWin: 45, q1FgaRate: 19.1, last10GamesPercent: 20.0, odds: "+1000", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Mark Williams", team: "CHA", position: "C", gamesPlayed: 12, firstBaskets: 3, percentage: 25.0, avgTipWin: 45, q1FgaRate: 19.8, last10GamesPercent: 30.0, odds: "+900", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Nick Richards", team: "CHA", position: "C", gamesPlayed: 10, firstBaskets: 2, percentage: 20.0, avgTipWin: 38, q1FgaRate: 16.7, last10GamesPercent: 20.0, odds: "+1000", sportsbook: "espnbet", season: "2024/2025" },

      // Toronto Raptors - Updated for 2025-26 season (Brandon Ingram added)
      { player: "Immanuel Quickley", team: "TOR", position: "PG", gamesPlayed: 14, firstBaskets: 1, percentage: 7.1, avgTipWin: 9, q1FgaRate: 12.8, last10GamesPercent: 10.0, odds: "+1100", sportsbook: "espnbet", season: "2024/2025" },
      { player: "RJ Barrett", team: "TOR", position: "SF", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 18, q1FgaRate: 16.2, last10GamesPercent: 20.0, odds: "+950", sportsbook: "bet365", season: "2024/2025" },
      { player: "Ochai Agbaji", team: "TOR", position: "SG", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 10, q1FgaRate: 13.1, last10GamesPercent: 10.0, odds: "+1100", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Scottie Barnes", team: "TOR", position: "PF", gamesPlayed: 15, firstBaskets: 4, percentage: 26.7, avgTipWin: 22, q1FgaRate: 18.9, last10GamesPercent: 30.0, odds: "+850", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Jakob Poeltl", team: "TOR", position: "C", gamesPlayed: 14, firstBaskets: 7, percentage: 50.0, avgTipWin: 63, q1FgaRate: 24.1, last10GamesPercent: 60.0, odds: "+700", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Brandon Ingram", team: "TOR", position: "SF", gamesPlayed: 12, firstBaskets: 3, percentage: 25.0, avgTipWin: 20, q1FgaRate: 19.5, last10GamesPercent: 30.0, odds: "+800", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Gradey Dick", team: "TOR", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 11, q1FgaRate: 11.7, last10GamesPercent: 10.0, odds: "+1200", sportsbook: "fanduel", season: "2024/2025" },

      // Indiana Pacers - Updated for 2025-26 season (Turner to MIL, Haliburton out for season)
      { player: "Tyrese Haliburton", team: "IND", position: "PG", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 16, q1FgaRate: 18.7, last10GamesPercent: 30.0, odds: "+800", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Andrew Nembhard", team: "IND", position: "PG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 8, q1FgaRate: 13.5, last10GamesPercent: 10.0, odds: "+1000", sportsbook: "espnbet", season: "2024/2025" },
      { player: "Aaron Nesmith", team: "IND", position: "SF", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 9, q1FgaRate: 12.2, last10GamesPercent: 10.0, odds: "+1100", sportsbook: "draftkings", season: "2024/2025" },
      { player: "Pascal Siakam", team: "IND", position: "PF", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 22, q1FgaRate: 19.6, last10GamesPercent: 30.0, odds: "+750", sportsbook: "fanduel", season: "2024/2025" },
      { player: "Isaiah Jackson", team: "IND", position: "C", gamesPlayed: 10, firstBaskets: 2, percentage: 20.0, avgTipWin: 25, q1FgaRate: 18.3, last10GamesPercent: 20.0, odds: "+900", sportsbook: "betmgm", season: "2024/2025" },
      { player: "Bennedict Mathurin", team: "IND", position: "SG", gamesPlayed: 11, firstBaskets: 2, percentage: 18.2, avgTipWin: 15, q1FgaRate: 17.4, last10GamesPercent: 20.0, odds: "+850", sportsbook: "bet365", season: "2024/2025" },
      { player: "T.J. McConnell", team: "IND", position: "PG", gamesPlayed: 10, firstBaskets: 0, percentage: 0.0, avgTipWin: 6, q1FgaRate: 9.8, last10GamesPercent: 0.0, odds: "+1400", sportsbook: "fanduel", season: "2024/2025" },
    ];

    players.forEach(stat => {
      const id = randomUUID();
      this.playerStats.set(id, { 
        ...stat, 
        id, 
        odds: stat.odds || null, 
        sportsbook: stat.sportsbook || null, 
        season: stat.season || "2024/2025",
        q1FgaRate: stat.q1FgaRate ?? null,
        last10GamesPercent: stat.last10GamesPercent ?? null,
        injuryStatus: stat.injuryStatus ?? null,
        injuryNote: stat.injuryNote ?? null,
        lastUpdated: stat.lastUpdated ?? null
      });
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
    const game: Game = { 
      ...insertGame, 
      id,
      status: insertGame.status || 'scheduled',
      awayScore: insertGame.awayScore ?? null,
      homeScore: insertGame.homeScore ?? null,
      espnGameId: insertGame.espnGameId ?? null,
      lastSynced: insertGame.lastSynced ?? null,
      awayStarters: insertGame.awayStarters ?? null,
      homeStarters: insertGame.homeStarters ?? null,
      gameTime: insertGame.gameTime ?? null
    };
    this.games.set(id, game);
    return game;
  }

  async updateGame(gameId: string, updates: Partial<Omit<Game, 'id'>>): Promise<Game | undefined> {
    const game = this.games.get(gameId);
    if (!game) return undefined;
    
    // Filter out undefined values to prevent overwriting existing fields
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );
    
    const updated: Game = {
      ...game,
      ...filteredUpdates
    };
    this.games.set(gameId, updated);
    return updated;
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

  async getTodayStarters(): Promise<PlayerStat[]> {
    const todayGames = await this.getGamesByDate("Today");
    const starterNames = new Set<string>();
    
    todayGames.forEach(game => {
      if (game.awayStarters) {
        game.awayStarters.forEach(name => starterNames.add(name));
      }
      if (game.homeStarters) {
        game.homeStarters.forEach(name => starterNames.add(name));
      }
    });
    
    return Array.from(this.playerStats.values())
      .filter(stat => starterNames.has(stat.player))
      .sort((a, b) => b.percentage - a.percentage);
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
      lastUpdated: insertStat.lastUpdated ?? null
    };
    this.playerStats.set(id, stat);
    return stat;
  }

  async updatePlayerInjuryStatus(playerId: string, injuryStatus: string | null, injuryNote: string | null): Promise<PlayerStat | undefined> {
    const player = this.playerStats.get(playerId);
    if (!player) return undefined;
    
    const updated: PlayerStat = {
      ...player,
      injuryStatus,
      injuryNote,
      lastUpdated: new Date().toISOString()
    };
    this.playerStats.set(playerId, updated);
    return updated;
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
