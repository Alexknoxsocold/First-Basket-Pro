/**
 * Seeds first basket history from BestOdds verified data.
 * Real "First Baskets Made / Games Started" counts for the 2025-26 season.
 * These values are authoritative and override the formula-derived estimates.
 */

import { storage } from './storage';

const BESTODDS_DATA: { playerName: string; team: string; fbScored: number; gamesTracked: number }[] = [
  // DEN vs POR
  { playerName: "Nikola Jokic", team: "DEN", fbScored: 9, gamesTracked: 62 },
  { playerName: "Jamal Murray", team: "DEN", fbScored: 15, gamesTracked: 73 },
  { playerName: "Cameron Johnson", team: "DEN", fbScored: 6, gamesTracked: 52 },
  { playerName: "Aaron Gordon", team: "DEN", fbScored: 3, gamesTracked: 31 },
  { playerName: "Christian Braun", team: "DEN", fbScored: 0, gamesTracked: 42 },
  { playerName: "Deni Avdija", team: "POR", fbScored: 6, gamesTracked: 62 },
  { playerName: "Toumani Camara", team: "POR", fbScored: 3, gamesTracked: 78 },
  { playerName: "Donovan Clingan", team: "POR", fbScored: 6, gamesTracked: 73 },
  { playerName: "Scoot Henderson", team: "POR", fbScored: 3, gamesTracked: 6 },
  { playerName: "Jrue Holiday", team: "POR", fbScored: 5, gamesTracked: 47 },

  // ORL vs DET
  { playerName: "Paolo Banchero", team: "ORL", fbScored: 7, gamesTracked: 68 },
  { playerName: "Desmond Bane", team: "ORL", fbScored: 9, gamesTracked: 78 },
  { playerName: "Wendell Carter Jr.", team: "ORL", fbScored: 12, gamesTracked: 74 },
  { playerName: "Jalen Suggs", team: "ORL", fbScored: 8, gamesTracked: 52 },
  { playerName: "Franz Wagner", team: "ORL", fbScored: 4, gamesTracked: 29 },
  { playerName: "Jalen Duren", team: "DET", fbScored: 10, gamesTracked: 67 },
  { playerName: "Tobias Harris", team: "DET", fbScored: 8, gamesTracked: 60 },
  { playerName: "Daniss Jenkins", team: "DET", fbScored: 1, gamesTracked: 18 },
  { playerName: "Duncan Robinson", team: "DET", fbScored: 6, gamesTracked: 74 },
  { playerName: "Ausar Thompson", team: "DET", fbScored: 5, gamesTracked: 68 },

  // ATL vs NYK
  { playerName: "OG Anunoby", team: "NYK", fbScored: 7, gamesTracked: 63 },
  { playerName: "Mikal Bridges", team: "NYK", fbScored: 5, gamesTracked: 77 },
  { playerName: "Jalen Brunson", team: "NYK", fbScored: 14, gamesTracked: 70 },
  { playerName: "Josh Hart", team: "NYK", fbScored: 3, gamesTracked: 48 },
  { playerName: "Karl-Anthony Towns", team: "NYK", fbScored: 8, gamesTracked: 71 },
  { playerName: "Nickeil Alexander-Walker", team: "ATL", fbScored: 7, gamesTracked: 68 },
  { playerName: "Dyson Daniels", team: "ATL", fbScored: 5, gamesTracked: 73 },
  { playerName: "Jalen Johnson", team: "ATL", fbScored: 3, gamesTracked: 69 },
  { playerName: "CJ McCollum", team: "ATL", fbScored: 6, gamesTracked: 57 },
  { playerName: "Onyeka Okongwu", team: "ATL", fbScored: 8, gamesTracked: 60 },
];

let seeded = false;

export async function seedFbHistoryFromBestOdds(): Promise<void> {
  if (seeded) return;
  seeded = true;
  console.log('[FBSeed] Seeding first basket history from BestOdds verified data...');
  let count = 0;
  for (const entry of BESTODDS_DATA) {
    try {
      await storage.upsertFbTracking(entry.playerName, entry.team, entry.fbScored, "2025/26", entry.gamesTracked);
      count++;
    } catch (err) {
      console.warn(`[FBSeed] Failed for ${entry.playerName}:`, err);
    }
  }
  console.log(`[FBSeed] Done — seeded ${count}/${BESTODDS_DATA.length} players.`);
}
