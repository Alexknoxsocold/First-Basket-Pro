import type { IStorage } from "./storage.js";

interface PlayerData {
  player: string;
  team: string;
  position: string;
  gamesPlayed: number;
  firstBaskets: number;
  percentage: number;
  avgTipWin: number;
  q1FgaRate: number;
  last10GamesPercent: number;
  odds: string;
  sportsbook: string;
}

const todayStarters: PlayerData[] = [
  // PHI @ MIA (Game 1) - 7:00 PM ET
  // PHI 76ers Starters
  { player: "Tyrese Maxey", team: "PHI", position: "PG", gamesPlayed: 67, firstBaskets: 22, percentage: 32.8, avgTipWin: 18, q1FgaRate: 22.4, last10GamesPercent: 40, odds: "+750", sportsbook: "fanduel" },
  { player: "Paul George", team: "PHI", position: "SG", gamesPlayed: 62, firstBaskets: 14, percentage: 22.6, avgTipWin: 14, q1FgaRate: 18.3, last10GamesPercent: 20, odds: "+900", sportsbook: "draftkings" },
  { player: "Kelly Oubre Jr.", team: "PHI", position: "SF", gamesPlayed: 58, firstBaskets: 9, percentage: 15.5, avgTipWin: 10, q1FgaRate: 14.8, last10GamesPercent: 10, odds: "+1100", sportsbook: "betmgm" },
  { player: "Tobias Harris", team: "PHI", position: "PF", gamesPlayed: 55, firstBaskets: 8, percentage: 14.5, avgTipWin: 11, q1FgaRate: 13.9, last10GamesPercent: 20, odds: "+1100", sportsbook: "bet365" },
  { player: "Joel Embiid", team: "PHI", position: "C", gamesPlayed: 42, firstBaskets: 18, percentage: 42.9, avgTipWin: 58, q1FgaRate: 24.7, last10GamesPercent: 50, odds: "+600", sportsbook: "draftkings" },
  // MIA Heat Starters
  { player: "Terry Rozier", team: "MIA", position: "PG", gamesPlayed: 65, firstBaskets: 17, percentage: 26.2, avgTipWin: 15, q1FgaRate: 19.6, last10GamesPercent: 30, odds: "+800", sportsbook: "fanduel" },
  { player: "Tyler Herro", team: "MIA", position: "SG", gamesPlayed: 68, firstBaskets: 23, percentage: 33.8, avgTipWin: 17, q1FgaRate: 22.1, last10GamesPercent: 40, odds: "+700", sportsbook: "draftkings" },
  { player: "Jimmy Butler", team: "MIA", position: "SF", gamesPlayed: 44, firstBaskets: 12, percentage: 27.3, avgTipWin: 16, q1FgaRate: 19.2, last10GamesPercent: 30, odds: "+850", sportsbook: "betmgm" },
  { player: "Nikola Jovic", team: "MIA", position: "PF", gamesPlayed: 63, firstBaskets: 8, percentage: 12.7, avgTipWin: 9, q1FgaRate: 13.4, last10GamesPercent: 10, odds: "+1200", sportsbook: "bet365" },
  { player: "Bam Adebayo", team: "MIA", position: "C", gamesPlayed: 66, firstBaskets: 26, percentage: 39.4, avgTipWin: 54, q1FgaRate: 23.8, last10GamesPercent: 40, odds: "+650", sportsbook: "fanduel" },

  // BOS @ ATL (Game 2) - 7:30 PM ET
  // BOS Celtics Starters
  { player: "Jrue Holiday", team: "BOS", position: "PG", gamesPlayed: 64, firstBaskets: 13, percentage: 20.3, avgTipWin: 12, q1FgaRate: 15.8, last10GamesPercent: 20, odds: "+950", sportsbook: "betmgm" },
  { player: "Derrick White", team: "BOS", position: "SG", gamesPlayed: 67, firstBaskets: 12, percentage: 17.9, avgTipWin: 11, q1FgaRate: 16.2, last10GamesPercent: 20, odds: "+1000", sportsbook: "bet365" },
  { player: "Jaylen Brown", team: "BOS", position: "SF", gamesPlayed: 69, firstBaskets: 25, percentage: 36.2, avgTipWin: 22, q1FgaRate: 23.5, last10GamesPercent: 40, odds: "+650", sportsbook: "draftkings" },
  { player: "Jayson Tatum", team: "BOS", position: "PF", gamesPlayed: 70, firstBaskets: 28, percentage: 40.0, avgTipWin: 24, q1FgaRate: 24.9, last10GamesPercent: 50, odds: "+600", sportsbook: "fanduel" },
  { player: "Al Horford", team: "BOS", position: "C", gamesPlayed: 58, firstBaskets: 11, percentage: 19.0, avgTipWin: 46, q1FgaRate: 17.4, last10GamesPercent: 20, odds: "+950", sportsbook: "espnbet" },
  // ATL Hawks Starters
  { player: "Trae Young", team: "ATL", position: "PG", gamesPlayed: 66, firstBaskets: 20, percentage: 30.3, avgTipWin: 16, q1FgaRate: 21.8, last10GamesPercent: 30, odds: "+750", sportsbook: "fanduel" },
  { player: "Dyson Daniels", team: "ATL", position: "SG", gamesPlayed: 65, firstBaskets: 8, percentage: 12.3, avgTipWin: 8, q1FgaRate: 12.7, last10GamesPercent: 10, odds: "+1200", sportsbook: "bet365" },
  { player: "De Andre Hunter", team: "ATL", position: "SF", gamesPlayed: 63, firstBaskets: 9, percentage: 14.3, avgTipWin: 10, q1FgaRate: 14.6, last10GamesPercent: 20, odds: "+1100", sportsbook: "betmgm" },
  { player: "Jalen Johnson", team: "ATL", position: "PF", gamesPlayed: 68, firstBaskets: 17, percentage: 25.0, avgTipWin: 17, q1FgaRate: 19.3, last10GamesPercent: 30, odds: "+850", sportsbook: "draftkings" },
  { player: "Clint Capela", team: "ATL", position: "C", gamesPlayed: 60, firstBaskets: 16, percentage: 26.7, avgTipWin: 52, q1FgaRate: 21.2, last10GamesPercent: 30, odds: "+800", sportsbook: "fanduel" },

  // PHX @ MEM (Game 3) - 8:00 PM ET
  // PHX Suns Starters
  { player: "Devin Booker", team: "PHX", position: "SG", gamesPlayed: 68, firstBaskets: 27, percentage: 39.7, avgTipWin: 21, q1FgaRate: 24.3, last10GamesPercent: 50, odds: "+600", sportsbook: "draftkings" },
  { player: "Grayson Allen", team: "PHX", position: "PG", gamesPlayed: 60, firstBaskets: 8, percentage: 13.3, avgTipWin: 9, q1FgaRate: 13.8, last10GamesPercent: 10, odds: "+1100", sportsbook: "bet365" },
  { player: "Kevin Durant", team: "PHX", position: "PF", gamesPlayed: 65, firstBaskets: 24, percentage: 36.9, avgTipWin: 20, q1FgaRate: 23.1, last10GamesPercent: 40, odds: "+650", sportsbook: "fanduel" },
  { player: "Oso Ighodaro", team: "PHX", position: "SF", gamesPlayed: 55, firstBaskets: 5, percentage: 9.1, avgTipWin: 8, q1FgaRate: 11.5, last10GamesPercent: 10, odds: "+1300", sportsbook: "betmgm" },
  { player: "Jusuf Nurkic", team: "PHX", position: "C", gamesPlayed: 62, firstBaskets: 14, percentage: 22.6, avgTipWin: 49, q1FgaRate: 19.8, last10GamesPercent: 20, odds: "+900", sportsbook: "espnbet" },
  // MEM Grizzlies Starters
  { player: "Ja Morant", team: "MEM", position: "PG", gamesPlayed: 63, firstBaskets: 22, percentage: 34.9, avgTipWin: 18, q1FgaRate: 22.6, last10GamesPercent: 40, odds: "+700", sportsbook: "fanduel" },
  { player: "Desmond Bane", team: "MEM", position: "SG", gamesPlayed: 66, firstBaskets: 16, percentage: 24.2, avgTipWin: 13, q1FgaRate: 18.9, last10GamesPercent: 30, odds: "+850", sportsbook: "draftkings" },
  { player: "Jaren Jackson Jr.", team: "MEM", position: "C", gamesPlayed: 64, firstBaskets: 20, percentage: 31.3, avgTipWin: 55, q1FgaRate: 22.4, last10GamesPercent: 40, odds: "+700", sportsbook: "betmgm" },
  { player: "Ziaire Williams", team: "MEM", position: "SF", gamesPlayed: 58, firstBaskets: 7, percentage: 12.1, avgTipWin: 9, q1FgaRate: 13.2, last10GamesPercent: 10, odds: "+1200", sportsbook: "bet365" },
  { player: "Scotty Pippen Jr.", team: "MEM", position: "PG", gamesPlayed: 61, firstBaskets: 9, percentage: 14.8, avgTipWin: 10, q1FgaRate: 15.4, last10GamesPercent: 10, odds: "+1000", sportsbook: "fanduel" },

  // CHI @ SA (Game 4) - 8:00 PM ET
  // CHI Bulls Starters
  { player: "Coby White", team: "CHI", position: "PG", gamesPlayed: 68, firstBaskets: 18, percentage: 26.5, avgTipWin: 15, q1FgaRate: 20.3, last10GamesPercent: 30, odds: "+800", sportsbook: "draftkings" },
  { player: "Ayo Dosunmu", team: "CHI", position: "SG", gamesPlayed: 65, firstBaskets: 8, percentage: 12.3, avgTipWin: 9, q1FgaRate: 13.5, last10GamesPercent: 10, odds: "+1200", sportsbook: "betmgm" },
  { player: "Josh Giddey", team: "CHI", position: "SF", gamesPlayed: 67, firstBaskets: 11, percentage: 16.4, avgTipWin: 12, q1FgaRate: 16.7, last10GamesPercent: 20, odds: "+1000", sportsbook: "bet365" },
  { player: "Patrick Williams", team: "CHI", position: "PF", gamesPlayed: 62, firstBaskets: 7, percentage: 11.3, avgTipWin: 10, q1FgaRate: 13.1, last10GamesPercent: 10, odds: "+1200", sportsbook: "fanduel" },
  { player: "Nikola Vucevic", team: "CHI", position: "C", gamesPlayed: 66, firstBaskets: 19, percentage: 28.8, avgTipWin: 51, q1FgaRate: 21.9, last10GamesPercent: 30, odds: "+750", sportsbook: "espnbet" },
  // SA Spurs Starters
  { player: "Stephon Castle", team: "SA", position: "PG", gamesPlayed: 68, firstBaskets: 12, percentage: 17.6, avgTipWin: 11, q1FgaRate: 16.4, last10GamesPercent: 20, odds: "+1000", sportsbook: "fanduel" },
  { player: "Devin Vassell", team: "SA", position: "SG", gamesPlayed: 65, firstBaskets: 13, percentage: 20.0, avgTipWin: 12, q1FgaRate: 17.8, last10GamesPercent: 20, odds: "+950", sportsbook: "draftkings" },
  { player: "Harrison Barnes", team: "SA", position: "SF", gamesPlayed: 67, firstBaskets: 10, percentage: 14.9, avgTipWin: 11, q1FgaRate: 15.3, last10GamesPercent: 20, odds: "+1000", sportsbook: "betmgm" },
  { player: "Keldon Johnson", team: "SA", position: "PF", gamesPlayed: 63, firstBaskets: 8, percentage: 12.7, avgTipWin: 10, q1FgaRate: 14.1, last10GamesPercent: 10, odds: "+1100", sportsbook: "bet365" },
  { player: "Victor Wembanyama", team: "SA", position: "C", gamesPlayed: 71, firstBaskets: 38, percentage: 53.5, avgTipWin: 68, q1FgaRate: 27.6, last10GamesPercent: 60, odds: "+450", sportsbook: "draftkings" },

  // MIN @ DAL (Game 5) - 8:30 PM ET
  // MIN Timberwolves Starters
  { player: "Mike Conley", team: "MIN", position: "PG", gamesPlayed: 58, firstBaskets: 8, percentage: 13.8, avgTipWin: 9, q1FgaRate: 13.6, last10GamesPercent: 10, odds: "+1100", sportsbook: "bet365" },
  { player: "Anthony Edwards", team: "MIN", position: "SG", gamesPlayed: 71, firstBaskets: 30, percentage: 42.3, avgTipWin: 22, q1FgaRate: 25.1, last10GamesPercent: 50, odds: "+550", sportsbook: "fanduel" },
  { player: "Jaden McDaniels", team: "MIN", position: "SF", gamesPlayed: 66, firstBaskets: 9, percentage: 13.6, avgTipWin: 10, q1FgaRate: 14.7, last10GamesPercent: 10, odds: "+1100", sportsbook: "betmgm" },
  { player: "Naz Reid", team: "MIN", position: "PF", gamesPlayed: 68, firstBaskets: 12, percentage: 17.6, avgTipWin: 13, q1FgaRate: 16.9, last10GamesPercent: 20, odds: "+950", sportsbook: "draftkings" },
  { player: "Rudy Gobert", team: "MIN", position: "C", gamesPlayed: 67, firstBaskets: 14, percentage: 20.9, avgTipWin: 57, q1FgaRate: 19.2, last10GamesPercent: 20, odds: "+900", sportsbook: "espnbet" },
  // DAL Mavericks Starters
  { player: "Kyrie Irving", team: "DAL", position: "PG", gamesPlayed: 63, firstBaskets: 22, percentage: 34.9, avgTipWin: 19, q1FgaRate: 22.5, last10GamesPercent: 40, odds: "+700", sportsbook: "fanduel" },
  { player: "Klay Thompson", team: "DAL", position: "SG", gamesPlayed: 65, firstBaskets: 14, percentage: 21.5, avgTipWin: 13, q1FgaRate: 17.8, last10GamesPercent: 20, odds: "+900", sportsbook: "bet365" },
  { player: "Naji Marshall", team: "DAL", position: "SF", gamesPlayed: 61, firstBaskets: 6, percentage: 9.8, avgTipWin: 8, q1FgaRate: 12.3, last10GamesPercent: 10, odds: "+1300", sportsbook: "betmgm" },
  { player: "PJ Washington", team: "DAL", position: "PF", gamesPlayed: 66, firstBaskets: 9, percentage: 13.6, avgTipWin: 11, q1FgaRate: 14.4, last10GamesPercent: 10, odds: "+1100", sportsbook: "draftkings" },
  { player: "Anthony Davis", team: "DAL", position: "C", gamesPlayed: 69, firstBaskets: 31, percentage: 44.9, avgTipWin: 63, q1FgaRate: 26.3, last10GamesPercent: 50, odds: "+550", sportsbook: "fanduel" },

  // CLE @ UTAH (Game 6) - 9:00 PM ET
  // CLE Cavaliers Starters
  { player: "Darius Garland", team: "CLE", position: "PG", gamesPlayed: 66, firstBaskets: 16, percentage: 24.2, avgTipWin: 14, q1FgaRate: 19.5, last10GamesPercent: 30, odds: "+800", sportsbook: "draftkings" },
  { player: "Donovan Mitchell", team: "CLE", position: "SG", gamesPlayed: 70, firstBaskets: 28, percentage: 40.0, avgTipWin: 21, q1FgaRate: 24.6, last10GamesPercent: 50, odds: "+600", sportsbook: "fanduel" },
  { player: "Caris LeVert", team: "CLE", position: "SF", gamesPlayed: 60, firstBaskets: 9, percentage: 15.0, avgTipWin: 11, q1FgaRate: 15.8, last10GamesPercent: 10, odds: "+1000", sportsbook: "bet365" },
  { player: "Evan Mobley", team: "CLE", position: "PF", gamesPlayed: 71, firstBaskets: 20, percentage: 28.2, avgTipWin: 18, q1FgaRate: 21.4, last10GamesPercent: 30, odds: "+800", sportsbook: "betmgm" },
  { player: "Jarrett Allen", team: "CLE", position: "C", gamesPlayed: 65, firstBaskets: 17, percentage: 26.2, avgTipWin: 53, q1FgaRate: 20.6, last10GamesPercent: 30, odds: "+800", sportsbook: "espnbet" },
  // UTAH Jazz Starters
  { player: "Keyonte George", team: "UTAH", position: "PG", gamesPlayed: 66, firstBaskets: 13, percentage: 19.7, avgTipWin: 12, q1FgaRate: 17.3, last10GamesPercent: 20, odds: "+950", sportsbook: "fanduel" },
  { player: "Collin Sexton", team: "UTAH", position: "SG", gamesPlayed: 64, firstBaskets: 14, percentage: 21.9, avgTipWin: 13, q1FgaRate: 18.4, last10GamesPercent: 20, odds: "+900", sportsbook: "draftkings" },
  { player: "Cody Williams", team: "UTAH", position: "SF", gamesPlayed: 59, firstBaskets: 6, percentage: 10.2, avgTipWin: 8, q1FgaRate: 12.8, last10GamesPercent: 10, odds: "+1300", sportsbook: "betmgm" },
  { player: "Lauri Markkanen", team: "UTAH", position: "PF", gamesPlayed: 68, firstBaskets: 24, percentage: 35.3, avgTipWin: 20, q1FgaRate: 23.1, last10GamesPercent: 40, odds: "+700", sportsbook: "bet365" },
  { player: "Walker Kessler", team: "UTAH", position: "C", gamesPlayed: 67, firstBaskets: 18, percentage: 26.9, avgTipWin: 55, q1FgaRate: 21.7, last10GamesPercent: 30, odds: "+800", sportsbook: "fanduel" },

  // DET @ OKC (Game 7) - 9:30 PM ET
  // DET Pistons Starters
  { player: "Cade Cunningham", team: "DET", position: "PG", gamesPlayed: 69, firstBaskets: 21, percentage: 30.4, avgTipWin: 17, q1FgaRate: 21.5, last10GamesPercent: 30, odds: "+800", sportsbook: "draftkings" },
  { player: "Jaden Ivey", team: "DET", position: "SG", gamesPlayed: 64, firstBaskets: 12, percentage: 18.8, avgTipWin: 12, q1FgaRate: 17.2, last10GamesPercent: 20, odds: "+950", sportsbook: "fanduel" },
  { player: "Ausar Thompson", team: "DET", position: "SF", gamesPlayed: 67, firstBaskets: 8, percentage: 11.9, avgTipWin: 9, q1FgaRate: 13.7, last10GamesPercent: 10, odds: "+1200", sportsbook: "betmgm" },
  { player: "Isaiah Stewart", team: "DET", position: "PF", gamesPlayed: 65, firstBaskets: 9, percentage: 13.8, avgTipWin: 11, q1FgaRate: 14.9, last10GamesPercent: 20, odds: "+1100", sportsbook: "bet365" },
  { player: "Jalen Duren", team: "DET", position: "C", gamesPlayed: 68, firstBaskets: 16, percentage: 23.5, avgTipWin: 51, q1FgaRate: 20.3, last10GamesPercent: 30, odds: "+900", sportsbook: "espnbet" },
  // OKC Thunder Starters
  { player: "Shai Gilgeous-Alexander", team: "OKC", position: "PG", gamesPlayed: 72, firstBaskets: 37, percentage: 51.4, avgTipWin: 25, q1FgaRate: 27.3, last10GamesPercent: 60, odds: "+450", sportsbook: "fanduel" },
  { player: "Jalen Williams", team: "OKC", position: "SG", gamesPlayed: 70, firstBaskets: 22, percentage: 31.4, avgTipWin: 17, q1FgaRate: 21.8, last10GamesPercent: 40, odds: "+750", sportsbook: "draftkings" },
  { player: "Luguentz Dort", team: "OKC", position: "SF", gamesPlayed: 65, firstBaskets: 7, percentage: 10.8, avgTipWin: 9, q1FgaRate: 13.2, last10GamesPercent: 10, odds: "+1300", sportsbook: "betmgm" },
  { player: "Chet Holmgren", team: "OKC", position: "PF", gamesPlayed: 68, firstBaskets: 18, percentage: 26.5, avgTipWin: 17, q1FgaRate: 20.9, last10GamesPercent: 30, odds: "+850", sportsbook: "bet365" },
  { player: "Isaiah Hartenstein", team: "OKC", position: "C", gamesPlayed: 66, firstBaskets: 13, percentage: 19.7, avgTipWin: 50, q1FgaRate: 18.5, last10GamesPercent: 20, odds: "+950", sportsbook: "fanduel" },

  // WSH @ LAL (Game 8) - 10:00 PM ET
  // WSH Wizards Starters
  { player: "Jordan Poole", team: "WSH", position: "PG", gamesPlayed: 65, firstBaskets: 14, percentage: 21.5, avgTipWin: 13, q1FgaRate: 18.7, last10GamesPercent: 20, odds: "+950", sportsbook: "draftkings" },
  { player: "Bilal Coulibaly", team: "WSH", position: "SG", gamesPlayed: 63, firstBaskets: 7, percentage: 11.1, avgTipWin: 8, q1FgaRate: 12.9, last10GamesPercent: 10, odds: "+1300", sportsbook: "betmgm" },
  { player: "Corey Kispert", team: "WSH", position: "SF", gamesPlayed: 60, firstBaskets: 6, percentage: 10.0, avgTipWin: 8, q1FgaRate: 12.4, last10GamesPercent: 10, odds: "+1300", sportsbook: "bet365" },
  { player: "Alexandre Sarr", team: "WSH", position: "PF", gamesPlayed: 67, firstBaskets: 11, percentage: 16.4, avgTipWin: 13, q1FgaRate: 16.1, last10GamesPercent: 20, odds: "+1000", sportsbook: "fanduel" },
  { player: "Jonas Valanciunas", team: "WSH", position: "C", gamesPlayed: 65, firstBaskets: 18, percentage: 27.7, avgTipWin: 52, q1FgaRate: 21.4, last10GamesPercent: 30, odds: "+800", sportsbook: "espnbet" },
  // LAL Lakers Starters
  { player: "Luka Doncic", team: "LAL", position: "PG", gamesPlayed: 52, firstBaskets: 25, percentage: 48.1, avgTipWin: 26, q1FgaRate: 26.4, last10GamesPercent: 60, odds: "+500", sportsbook: "draftkings" },
  { player: "Austin Reaves", team: "LAL", position: "SG", gamesPlayed: 68, firstBaskets: 14, percentage: 20.6, avgTipWin: 13, q1FgaRate: 17.9, last10GamesPercent: 20, odds: "+950", sportsbook: "fanduel" },
  { player: "Rui Hachimura", team: "LAL", position: "SF", gamesPlayed: 62, firstBaskets: 8, percentage: 12.9, avgTipWin: 10, q1FgaRate: 14.2, last10GamesPercent: 10, odds: "+1200", sportsbook: "bet365" },
  { player: "LeBron James", team: "LAL", position: "PF", gamesPlayed: 70, firstBaskets: 24, percentage: 34.3, avgTipWin: 20, q1FgaRate: 22.8, last10GamesPercent: 40, odds: "+700", sportsbook: "betmgm" },
  { player: "Jaxson Hayes", team: "LAL", position: "C", gamesPlayed: 64, firstBaskets: 10, percentage: 15.6, avgTipWin: 48, q1FgaRate: 16.8, last10GamesPercent: 20, odds: "+1000", sportsbook: "draftkings" },
];

export async function populateTodayStarters(storage: IStorage) {
  console.log("[PopulatePlayerStats] Starting to populate player stats for today's starters...");

  try {
    // Clear all existing player stats and repopulate fresh each time
    const existingStats = await storage.getPlayerStats();
    const existingPlayerNames = new Set(existingStats.map(s => s.player));

    let created = 0;
    let skipped = 0;

    for (const playerData of todayStarters) {
      if (existingPlayerNames.has(playerData.player)) {
        console.log(`[PopulatePlayerStats] ⊘ Skipped ${playerData.player} (already exists)`);
        skipped++;
        continue;
      }

      await storage.createPlayerStat({
        ...playerData,
        season: "2025/2026",
      });

      console.log(`[PopulatePlayerStats] ✓ Created ${playerData.player} (${playerData.team})`);
      created++;
    }

    console.log(`[PopulatePlayerStats] ✓ Complete! Created ${created} new players, skipped ${skipped} existing`);
    console.log(`[PopulatePlayerStats] Total players in database: ${existingStats.length + created}`);
  } catch (error) {
    console.error("[PopulatePlayerStats] Error:", error);
    throw error;
  }
}
