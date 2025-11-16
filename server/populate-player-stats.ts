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
  // LAC @ BOS (Game 1)
  // LAC Starters
  { player: "James Harden", team: "LAC", position: "PG", gamesPlayed: 14, firstBaskets: 4, percentage: 28.6, avgTipWin: 18, q1FgaRate: 20.5, last10GamesPercent: 30, odds: "+750", sportsbook: "fanduel" },
  { player: "Norman Powell", team: "LAC", position: "SG", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 11, q1FgaRate: 16.2, last10GamesPercent: 20, odds: "+950", sportsbook: "betmgm" },
  { player: "Derrick Jones Jr.", team: "LAC", position: "SF", gamesPlayed: 14, firstBaskets: 1, percentage: 7.1, avgTipWin: 8, q1FgaRate: 10.5, last10GamesPercent: 10, odds: "+1200", sportsbook: "draftkings" },
  { player: "PJ Tucker", team: "LAC", position: "PF", gamesPlayed: 12, firstBaskets: 0, percentage: 0, avgTipWin: 5, q1FgaRate: 6.2, last10GamesPercent: 0, odds: "+1500", sportsbook: "bet365" },
  { player: "Ivica Zubac", team: "LAC", position: "C", gamesPlayed: 14, firstBaskets: 5, percentage: 35.7, avgTipWin: 52, q1FgaRate: 22.8, last10GamesPercent: 40, odds: "+700", sportsbook: "fanduel" },
  // BOS Starters
  { player: "Jrue Holiday", team: "BOS", position: "PG", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 12, q1FgaRate: 14.3, last10GamesPercent: 20, odds: "+900", sportsbook: "draftkings" },
  { player: "Derrick White", team: "BOS", position: "SG", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 10, q1FgaRate: 15.7, last10GamesPercent: 20, odds: "+950", sportsbook: "betmgm" },
  { player: "Jaylen Brown", team: "BOS", position: "SF", gamesPlayed: 14, firstBaskets: 6, percentage: 42.9, avgTipWin: 24, q1FgaRate: 23.1, last10GamesPercent: 50, odds: "+600", sportsbook: "draftkings" },
  { player: "Jayson Tatum", team: "BOS", position: "PF", gamesPlayed: 14, firstBaskets: 5, percentage: 35.7, avgTipWin: 22, q1FgaRate: 21.8, last10GamesPercent: 40, odds: "+650", sportsbook: "fanduel" },
  { player: "Kristaps Porzingis", team: "BOS", position: "C", gamesPlayed: 12, firstBaskets: 3, percentage: 25, avgTipWin: 45, q1FgaRate: 19.3, last10GamesPercent: 30, odds: "+800", sportsbook: "betmgm" },

  // SAC @ SA (Game 2)
  // SAC Starters
  { player: "Russell Westbrook", team: "SAC", position: "PG", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 15, q1FgaRate: 18.4, last10GamesPercent: 30, odds: "+800", sportsbook: "fanduel" },
  { player: "Dennis Schröder", team: "SAC", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 8, q1FgaRate: 12.6, last10GamesPercent: 10, odds: "+1100", sportsbook: "bet365" },
  { player: "DeMar DeRozan", team: "SAC", position: "SF", gamesPlayed: 14, firstBaskets: 4, percentage: 28.6, avgTipWin: 19, q1FgaRate: 20.2, last10GamesPercent: 30, odds: "+750", sportsbook: "draftkings" },
  { player: "Zach LaVine", team: "SAC", position: "SG", gamesPlayed: 12, firstBaskets: 3, percentage: 25, avgTipWin: 17, q1FgaRate: 19.1, last10GamesPercent: 30, odds: "+800", sportsbook: "betmgm" },
  { player: "Domantas Sabonis", team: "SAC", position: "C", gamesPlayed: 14, firstBaskets: 4, percentage: 28.6, avgTipWin: 48, q1FgaRate: 21.5, last10GamesPercent: 30, odds: "+750", sportsbook: "fanduel" },
  // SA Starters
  { player: "Chris Paul", team: "SA", position: "PG", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 7, q1FgaRate: 11.2, last10GamesPercent: 10, odds: "+1200", sportsbook: "espnbet" },
  { player: "Devin Vassell", team: "SA", position: "SG", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 11, q1FgaRate: 16.8, last10GamesPercent: 20, odds: "+950", sportsbook: "bet365" },
  { player: "Harrison Barnes", team: "SA", position: "SF", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 10, q1FgaRate: 14.5, last10GamesPercent: 20, odds: "+1000", sportsbook: "fanduel" },
  { player: "Keldon Johnson", team: "SA", position: "PF", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 13, q1FgaRate: 15.9, last10GamesPercent: 20, odds: "+950", sportsbook: "draftkings" },
  { player: "Victor Wembanyama", team: "SA", position: "C", gamesPlayed: 14, firstBaskets: 8, percentage: 57.1, avgTipWin: 68, q1FgaRate: 26.4, last10GamesPercent: 60, odds: "+500", sportsbook: "draftkings" },

  // BKN @ WSH (Game 3)
  // BKN Starters
  { player: "Dennis Schröder", team: "BKN", position: "PG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 8, q1FgaRate: 12.6, last10GamesPercent: 10, odds: "+1100", sportsbook: "bet365" },
  { player: "Cam Thomas", team: "BKN", position: "SG", gamesPlayed: 13, firstBaskets: 4, percentage: 30.8, avgTipWin: 16, q1FgaRate: 21.3, last10GamesPercent: 40, odds: "+750", sportsbook: "fanduel" },
  { player: "Mikal Bridges", team: "BKN", position: "SF", gamesPlayed: 14, firstBaskets: 3, percentage: 21.4, avgTipWin: 14, q1FgaRate: 17.8, last10GamesPercent: 30, odds: "+850", sportsbook: "betmgm" },
  { player: "Cameron Johnson", team: "BKN", position: "PF", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 11, q1FgaRate: 13.2, last10GamesPercent: 20, odds: "+900", sportsbook: "bet365" },
  { player: "Nic Claxton", team: "BKN", position: "C", gamesPlayed: 13, firstBaskets: 4, percentage: 30.8, avgTipWin: 51, q1FgaRate: 20.5, last10GamesPercent: 40, odds: "+750", sportsbook: "draftkings" },
  // WSH Starters
  { player: "Jordan Poole", team: "WSH", position: "PG", gamesPlayed: 14, firstBaskets: 3, percentage: 21.4, avgTipWin: 13, q1FgaRate: 18.6, last10GamesPercent: 30, odds: "+850", sportsbook: "fanduel" },
  { player: "Corey Kispert", team: "WSH", position: "SG", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 8, q1FgaRate: 11.9, last10GamesPercent: 10, odds: "+1200", sportsbook: "bet365" },
  { player: "Kyle Kuzma", team: "WSH", position: "SF", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 12, q1FgaRate: 16.2, last10GamesPercent: 20, odds: "+950", sportsbook: "betmgm" },
  { player: "Alexandre Sarr", team: "WSH", position: "PF", gamesPlayed: 12, firstBaskets: 2, percentage: 16.7, avgTipWin: 14, q1FgaRate: 15.3, last10GamesPercent: 20, odds: "+950", sportsbook: "draftkings" },
  { player: "Jonas Valanciunas", team: "WSH", position: "C", gamesPlayed: 14, firstBaskets: 5, percentage: 35.7, avgTipWin: 54, q1FgaRate: 22.1, last10GamesPercent: 40, odds: "+700", sportsbook: "fanduel" },

  // ORL @ HOU (Game 4)
  // ORL Starters
  { player: "Cole Anthony", team: "ORL", position: "PG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 9, q1FgaRate: 12.4, last10GamesPercent: 10, odds: "+1100", sportsbook: "espnbet" },
  { player: "Kentavious Caldwell-Pope", team: "ORL", position: "SG", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 7, q1FgaRate: 10.8, last10GamesPercent: 10, odds: "+1200", sportsbook: "bet365" },
  { player: "Franz Wagner", team: "ORL", position: "SF", gamesPlayed: 14, firstBaskets: 3, percentage: 21.4, avgTipWin: 15, q1FgaRate: 18.3, last10GamesPercent: 30, odds: "+850", sportsbook: "draftkings" },
  { player: "Paolo Banchero", team: "ORL", position: "PF", gamesPlayed: 14, firstBaskets: 5, percentage: 35.7, avgTipWin: 21, q1FgaRate: 22.4, last10GamesPercent: 40, odds: "+700", sportsbook: "fanduel" },
  { player: "Wendell Carter Jr.", team: "ORL", position: "C", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 46, q1FgaRate: 19.7, last10GamesPercent: 30, odds: "+800", sportsbook: "betmgm" },
  // HOU Starters
  { player: "Fred VanVleet", team: "HOU", position: "PG", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 10, q1FgaRate: 15.2, last10GamesPercent: 20, odds: "+950", sportsbook: "fanduel" },
  { player: "Jalen Green", team: "HOU", position: "SG", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 14, q1FgaRate: 19.1, last10GamesPercent: 30, odds: "+800", sportsbook: "draftkings" },
  { player: "Dillon Brooks", team: "HOU", position: "SF", gamesPlayed: 14, firstBaskets: 1, percentage: 7.1, avgTipWin: 8, q1FgaRate: 11.3, last10GamesPercent: 10, odds: "+1200", sportsbook: "bet365" },
  { player: "Jabari Smith Jr.", team: "HOU", position: "PF", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 11, q1FgaRate: 16.5, last10GamesPercent: 20, odds: "+950", sportsbook: "betmgm" },
  { player: "Alperen Sengun", team: "HOU", position: "C", gamesPlayed: 14, firstBaskets: 6, percentage: 42.9, avgTipWin: 56, q1FgaRate: 24.2, last10GamesPercent: 50, odds: "+600", sportsbook: "fanduel" },

  // GS @ NO (Game 5)
  // GS Starters
  { player: "Stephen Curry", team: "GS", position: "PG", gamesPlayed: 13, firstBaskets: 6, percentage: 46.2, avgTipWin: 19, q1FgaRate: 24.8, last10GamesPercent: 50, odds: "+550", sportsbook: "draftkings" },
  { player: "Klay Thompson", team: "GS", position: "SG", gamesPlayed: 12, firstBaskets: 2, percentage: 16.7, avgTipWin: 11, q1FgaRate: 16.4, last10GamesPercent: 20, odds: "+950", sportsbook: "fanduel" },
  { player: "Andrew Wiggins", team: "GS", position: "SF", gamesPlayed: 14, firstBaskets: 2, percentage: 14.3, avgTipWin: 10, q1FgaRate: 14.8, last10GamesPercent: 20, odds: "+1000", sportsbook: "betmgm" },
  { player: "Draymond Green", team: "GS", position: "PF", gamesPlayed: 13, firstBaskets: 0, percentage: 0, avgTipWin: 5, q1FgaRate: 7.2, last10GamesPercent: 0, odds: "+1600", sportsbook: "bet365" },
  { player: "Trayce Jackson-Davis", team: "GS", position: "C", gamesPlayed: 12, firstBaskets: 3, percentage: 25, avgTipWin: 48, q1FgaRate: 20.1, last10GamesPercent: 30, odds: "+800", sportsbook: "draftkings" },
  // NO Starters
  { player: "CJ McCollum", team: "NO", position: "PG", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 12, q1FgaRate: 17.9, last10GamesPercent: 30, odds: "+850", sportsbook: "fanduel" },
  { player: "Dejounte Murray", team: "NO", position: "SG", gamesPlayed: 14, firstBaskets: 3, percentage: 21.4, avgTipWin: 13, q1FgaRate: 18.5, last10GamesPercent: 30, odds: "+850", sportsbook: "betmgm" },
  { player: "Brandon Ingram", team: "NO", position: "SF", gamesPlayed: 12, firstBaskets: 3, percentage: 25, avgTipWin: 16, q1FgaRate: 19.3, last10GamesPercent: 30, odds: "+800", sportsbook: "draftkings" },
  { player: "Zion Williamson", team: "NO", position: "PF", gamesPlayed: 11, firstBaskets: 5, percentage: 45.5, avgTipWin: 27, q1FgaRate: 23.6, last10GamesPercent: 50, odds: "+600", sportsbook: "fanduel" },
  { player: "Yves Missi", team: "NO", position: "C", gamesPlayed: 10, firstBaskets: 2, percentage: 20, avgTipWin: 42, q1FgaRate: 18.7, last10GamesPercent: 20, odds: "+900", sportsbook: "bet365" },

  // POR @ DAL (Game 6)
  // POR Starters
  { player: "Anfernee Simons", team: "POR", position: "PG", gamesPlayed: 13, firstBaskets: 4, percentage: 30.8, avgTipWin: 15, q1FgaRate: 20.7, last10GamesPercent: 40, odds: "+750", sportsbook: "fanduel" },
  { player: "Shaedon Sharpe", team: "POR", position: "SG", gamesPlayed: 12, firstBaskets: 2, percentage: 16.7, avgTipWin: 11, q1FgaRate: 15.8, last10GamesPercent: 20, odds: "+950", sportsbook: "draftkings" },
  { player: "Deni Avdija", team: "POR", position: "SF", gamesPlayed: 14, firstBaskets: 1, percentage: 7.1, avgTipWin: 8, q1FgaRate: 12.1, last10GamesPercent: 10, odds: "+1200", sportsbook: "bet365" },
  { player: "Jerami Grant", team: "POR", position: "PF", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 12, q1FgaRate: 16.3, last10GamesPercent: 20, odds: "+950", sportsbook: "betmgm" },
  { player: "Deandre Ayton", team: "POR", position: "C", gamesPlayed: 14, firstBaskets: 4, percentage: 28.6, avgTipWin: 49, q1FgaRate: 21.4, last10GamesPercent: 30, odds: "+750", sportsbook: "fanduel" },
  // DAL Starters
  { player: "Luka Dončić", team: "DAL", position: "PG", gamesPlayed: 14, firstBaskets: 7, percentage: 50, avgTipWin: 25, q1FgaRate: 25.3, last10GamesPercent: 60, odds: "+500", sportsbook: "draftkings" },
  { player: "Kyrie Irving", team: "DAL", position: "SG", gamesPlayed: 13, firstBaskets: 4, percentage: 30.8, avgTipWin: 18, q1FgaRate: 20.9, last10GamesPercent: 40, odds: "+750", sportsbook: "fanduel" },
  { player: "Klay Thompson", team: "DAL", position: "SF", gamesPlayed: 12, firstBaskets: 2, percentage: 16.7, avgTipWin: 11, q1FgaRate: 16.4, last10GamesPercent: 20, odds: "+950", sportsbook: "fanduel" },
  { player: "PJ Washington", team: "DAL", position: "PF", gamesPlayed: 14, firstBaskets: 1, percentage: 7.1, avgTipWin: 9, q1FgaRate: 11.5, last10GamesPercent: 10, odds: "+1200", sportsbook: "betmgm" },
  { player: "Daniel Gafford", team: "DAL", position: "C", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 47, q1FgaRate: 19.8, last10GamesPercent: 30, odds: "+850", sportsbook: "bet365" },

  // ATL @ PHX (Game 7)
  // ATL Starters
  { player: "Trae Young", team: "ATL", position: "PG", gamesPlayed: 14, firstBaskets: 5, percentage: 35.7, avgTipWin: 17, q1FgaRate: 22.1, last10GamesPercent: 40, odds: "+700", sportsbook: "draftkings" },
  { player: "Dyson Daniels", team: "ATL", position: "SG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 7, q1FgaRate: 11.4, last10GamesPercent: 10, odds: "+1200", sportsbook: "bet365" },
  { player: "De'Andre Hunter", team: "ATL", position: "SF", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 9, q1FgaRate: 12.8, last10GamesPercent: 10, odds: "+1100", sportsbook: "fanduel" },
  { player: "Jalen Johnson", team: "ATL", position: "PF", gamesPlayed: 14, firstBaskets: 3, percentage: 21.4, avgTipWin: 16, q1FgaRate: 18.7, last10GamesPercent: 30, odds: "+850", sportsbook: "betmgm" },
  { player: "Clint Capela", team: "ATL", position: "C", gamesPlayed: 13, firstBaskets: 4, percentage: 30.8, avgTipWin: 53, q1FgaRate: 21.9, last10GamesPercent: 40, odds: "+750", sportsbook: "draftkings" },
  // PHX Starters
  { player: "Tyus Jones", team: "PHX", position: "PG", gamesPlayed: 12, firstBaskets: 1, percentage: 8.3, avgTipWin: 7, q1FgaRate: 11.1, last10GamesPercent: 10, odds: "+1200", sportsbook: "espnbet" },
  { player: "Devin Booker", team: "PHX", position: "SG", gamesPlayed: 14, firstBaskets: 6, percentage: 42.9, avgTipWin: 20, q1FgaRate: 23.5, last10GamesPercent: 50, odds: "+600", sportsbook: "draftkings" },
  { player: "Bradley Beal", team: "PHX", position: "SF", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 14, q1FgaRate: 18.9, last10GamesPercent: 30, odds: "+850", sportsbook: "fanduel" },
  { player: "Kevin Durant", team: "PHX", position: "PF", gamesPlayed: 14, firstBaskets: 5, percentage: 35.7, avgTipWin: 19, q1FgaRate: 21.6, last10GamesPercent: 40, odds: "+700", sportsbook: "betmgm" },
  { player: "Jusuf Nurkic", team: "PHX", position: "C", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 50, q1FgaRate: 20.3, last10GamesPercent: 30, odds: "+850", sportsbook: "bet365" },

  // CHI @ UTAH (Game 8)
  // CHI Starters
  { player: "Josh Giddey", team: "CHI", position: "PG", gamesPlayed: 13, firstBaskets: 2, percentage: 15.4, avgTipWin: 11, q1FgaRate: 16.4, last10GamesPercent: 20, odds: "+950", sportsbook: "fanduel" },
  { player: "Coby White", team: "CHI", position: "SG", gamesPlayed: 14, firstBaskets: 3, percentage: 21.4, avgTipWin: 13, q1FgaRate: 18.2, last10GamesPercent: 30, odds: "+850", sportsbook: "betmgm" },
  { player: "Zach LaVine", team: "CHI", position: "SF", gamesPlayed: 12, firstBaskets: 3, percentage: 25, avgTipWin: 17, q1FgaRate: 19.1, last10GamesPercent: 30, odds: "+800", sportsbook: "betmgm" },
  { player: "Patrick Williams", team: "CHI", position: "PF", gamesPlayed: 13, firstBaskets: 1, percentage: 7.7, avgTipWin: 9, q1FgaRate: 12.5, last10GamesPercent: 10, odds: "+1100", sportsbook: "bet365" },
  { player: "Nikola Vucevic", team: "CHI", position: "C", gamesPlayed: 14, firstBaskets: 4, percentage: 28.6, avgTipWin: 51, q1FgaRate: 21.7, last10GamesPercent: 30, odds: "+750", sportsbook: "draftkings" },
  // UTAH Starters
  { player: "Keyonte George", team: "UTAH", position: "PG", gamesPlayed: 12, firstBaskets: 2, percentage: 16.7, avgTipWin: 10, q1FgaRate: 15.6, last10GamesPercent: 20, odds: "+950", sportsbook: "fanduel" },
  { player: "Collin Sexton", team: "UTAH", position: "SG", gamesPlayed: 13, firstBaskets: 3, percentage: 23.1, avgTipWin: 12, q1FgaRate: 17.8, last10GamesPercent: 30, odds: "+850", sportsbook: "betmgm" },
  { player: "Cody Williams", team: "UTAH", position: "SF", gamesPlayed: 11, firstBaskets: 1, percentage: 9.1, avgTipWin: 8, q1FgaRate: 11.9, last10GamesPercent: 10, odds: "+1200", sportsbook: "bet365" },
  { player: "Lauri Markkanen", team: "UTAH", position: "PF", gamesPlayed: 14, firstBaskets: 5, percentage: 35.7, avgTipWin: 18, q1FgaRate: 22.3, last10GamesPercent: 40, odds: "+700", sportsbook: "draftkings" },
  { player: "Walker Kessler", team: "UTAH", position: "C", gamesPlayed: 13, firstBaskets: 4, percentage: 30.8, avgTipWin: 55, q1FgaRate: 22.4, last10GamesPercent: 40, odds: "+750", sportsbook: "fanduel" },
];

export async function populateTodayStarters(storage: IStorage) {
  console.log("[PopulatePlayerStats] Starting to populate player stats for today's starters...");

  try {
    // Get all existing player stats to check which ones we need to add
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
        season: "2024/2025",
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
