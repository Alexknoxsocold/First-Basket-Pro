import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { nbaSeasonForDate, previousNbaSeason } from './nbaSeason';

neonConfig.webSocketConstructor = ws;

export type FirstBasketSeasonRow = {
  id: string;
  playerName: string;
  team: string;
  fbScored: number;
  gamesTracked: number;
  season: string;
  lastUpdated: string | null;
};

export type FirstBasketStarter = { playerName: string; team: string };

const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

function mapRow(row: any): FirstBasketSeasonRow {
  return {
    id: String(row.id),
    playerName: String(row.player_name),
    team: String(row.team),
    fbScored: Number(row.fb_scored ?? 0),
    gamesTracked: Number(row.games_tracked ?? 0),
    season: String(row.season),
    lastUpdated: row.last_updated ?? null,
  };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[.'’\-]/g, '').replace(/\s+/g, ' ').trim();
}

export async function getFirstBasketSeasonRows(season: string): Promise<FirstBasketSeasonRow[]> {
  if (!pool) return [];
  const result = await pool.query(
    `SELECT id, player_name, team, fb_scored, games_tracked, season, last_updated
       FROM fb_tracking
      WHERE season = $1
        AND trim(team) <> ''
      ORDER BY player_name, team`,
    [season],
  );
  return result.rows.map(mapRow);
}

export async function getFirstBasketPlayerSeason(
  playerName: string,
  team: string,
  season: string,
): Promise<FirstBasketSeasonRow | null> {
  if (!pool) return null;
  const result = await pool.query(
    `SELECT id, player_name, team, fb_scored, games_tracked, season, last_updated
       FROM fb_tracking
      WHERE lower(player_name) = lower($1)
        AND upper(team) = upper($2)
        AND season = $3
      ORDER BY games_tracked DESC, fb_scored DESC, id
      LIMIT 1`,
    [playerName, team, season],
  );
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

export async function upsertFirstBasketPlayerSeason(
  playerName: string,
  team: string,
  fbScored: number,
  gamesTracked: number,
  season: string,
): Promise<void> {
  if (!pool || !team.trim()) return;
  const now = new Date().toISOString();
  const existing = await getFirstBasketPlayerSeason(playerName, team, season);
  if (existing) {
    await pool.query(
      `UPDATE fb_tracking
          SET fb_scored = $1,
              games_tracked = $2,
              last_updated = $3
        WHERE id = $4`,
      [fbScored, gamesTracked, now, existing.id],
    );
    return;
  }
  await pool.query(
    `INSERT INTO fb_tracking (player_name, team, fb_scored, games_tracked, season, last_updated)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [playerName.trim(), team.trim().toUpperCase(), fbScored, gamesTracked, season, now],
  );
}

/**
 * Records one completed game atomically enough for a single production worker:
 * every verified starter gets one denominator game, while only the first-field-
 * goal scorer gets the numerator. This fixes the old inflated-rate bug where
 * gamesTracked only moved for the scorer.
 */
export async function recordCurrentSeasonFirstBasketGame(
  starters: FirstBasketStarter[],
  scorer: FirstBasketStarter,
  date = new Date(),
): Promise<void> {
  if (!pool) return;
  const season = nbaSeasonForDate(date).label;
  const uniqueStarters = [...new Map(
    starters
      .filter(s => s.playerName.trim() && s.team.trim())
      .map(s => [`${normalizeName(s.playerName)}|${s.team.toUpperCase()}`, { playerName: s.playerName.trim(), team: s.team.trim().toUpperCase() }]),
  ).values()];

  if (uniqueStarters.length < 10) {
    throw new Error(`Expected 10 verified NBA starters, received ${uniqueStarters.length}`);
  }

  const now = new Date().toISOString();
  for (const starter of uniqueStarters) {
    const existing = await getFirstBasketPlayerSeason(starter.playerName, starter.team, season);
    const scored = normalizeName(starter.playerName) === normalizeName(scorer.playerName)
      && starter.team.toUpperCase() === scorer.team.toUpperCase();
    if (existing) {
      await pool.query(
        `UPDATE fb_tracking
            SET fb_scored = fb_scored + $1,
                games_tracked = games_tracked + 1,
                last_updated = $2
          WHERE id = $3`,
        [scored ? 1 : 0, now, existing.id],
      );
    } else {
      await pool.query(
        `INSERT INTO fb_tracking (player_name, team, fb_scored, games_tracked, season, last_updated)
         VALUES ($1, $2, $3, 1, $4, $5)`,
        [starter.playerName, starter.team, scored ? 1 : 0, season, now],
      );
    }
  }
}

export async function isVerifiedFirstBasketGameProcessed(espnGameId: string): Promise<boolean> {
  if (!pool) return false;
  const result = await pool.query(
    `SELECT 1
       FROM fb_processed_games
      WHERE espn_game_id = $1
        AND first_scorer IS NOT NULL
        AND trim(first_scorer) <> ''
        AND first_scorer_team IS NOT NULL
        AND trim(first_scorer_team) <> ''
      LIMIT 1`,
    [espnGameId],
  );
  return result.rows.length > 0;
}

export async function markVerifiedFirstBasketGame(
  espnGameId: string,
  playerName: string,
  team: string,
): Promise<void> {
  if (!pool) return;
  await pool.query(
    `INSERT INTO fb_processed_games (espn_game_id, first_scorer, first_scorer_team, processed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (espn_game_id)
     DO UPDATE SET first_scorer = EXCLUDED.first_scorer,
                   first_scorer_team = EXCLUDED.first_scorer_team,
                   processed_at = EXCLUDED.processed_at`,
    [espnGameId, playerName.trim(), team.trim().toUpperCase(), new Date().toISOString()],
  );
}

export function currentAndPreviousSeasonLabels(date = new Date()): { current: string; previous: string } {
  return {
    current: nbaSeasonForDate(date).label,
    previous: previousNbaSeason(date).label,
  };
}
