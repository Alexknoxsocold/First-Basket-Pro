import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { storage } from './storage';
import { nbaSeasonForDate } from './nbaSeason';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

const MODEL_VERSION = 'FB-SEASONAL-V1';
const LOCK_WINDOW_MS = 2 * 60 * 60 * 1000;

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[.'’\-]/g, '').replace(/\s+/g, ' ').trim();
}

async function ledgerExists(): Promise<boolean> {
  if (!pool) return false;
  const result = await pool.query(`SELECT to_regclass('public.fb_prediction_ledger') AS name`);
  return Boolean(result.rows[0]?.name);
}

export async function lockUpcomingFirstBasketPredictions(): Promise<{ eligible: number; locked: number; skipped: number }> {
  const result = { eligible: 0, locked: 0, skipped: 0 };
  if (!pool || !(await ledgerExists())) return result;

  const now = Date.now();
  const games = await storage.getGames();
  const eligibleGames = games.filter(game => {
    if (!game.espnGameId || !game.gameTime) return false;
    const startsAt = new Date(game.gameTime).getTime();
    return Number.isFinite(startsAt) && startsAt > now && startsAt - now <= LOCK_WINDOW_MS;
  });
  result.eligible = eligibleGames.length;

  for (const game of eligibleGames) {
    const gameTime = game.gameTime;
    const espnGameId = game.espnGameId;
    if (!gameTime || !espnGameId) {
      result.skipped++;
      continue;
    }

    const existing = await pool.query(
      `SELECT 1 FROM fb_prediction_ledger WHERE espn_game_id = $1 LIMIT 1`,
      [espnGameId],
    );
    if (existing.rows.length) {
      result.skipped++;
      continue;
    }

    const awayStarters = game.awayStarters ?? [];
    const homeStarters = game.homeStarters ?? [];
    if (awayStarters.length !== 5 || homeStarters.length !== 5) {
      result.skipped++;
      continue;
    }

    try {
      const { fetchEspnTeamStats } = await import('./espnPlayerStats.js');
      const starterMap: Record<string, string[]> = {
        [game.awayTeam]: awayStarters,
        [game.homeTeam]: homeStarters,
      };
      // Do not pass sportsbook odds here: this ledger freezes the model itself,
      // and partial sportsbook coverage must not filter out starters.
      const stats = await fetchEspnTeamStats([game.awayTeam, game.homeTeam], starterMap, {});
      const expected = new Set(
        [...awayStarters.map(name => `${normalizeName(name)}|${game.awayTeam}`), ...homeStarters.map(name => `${normalizeName(name)}|${game.homeTeam}`)],
      );
      const candidates = stats
        .filter(player => expected.has(`${normalizeName(player.player)}|${player.team}`))
        .sort((a, b) => b.firstBasketPct - a.firstBasketPct);

      if (candidates.length !== 10) {
        console.warn(`[FB Ledger] ${game.awayTeam} @ ${game.homeTeam}: expected 10 starters, modeled ${candidates.length}; not locking.`);
        result.skipped++;
        continue;
      }

      const lockedAt = new Date().toISOString();
      const season = nbaSeasonForDate(new Date(gameTime)).label;
      for (let index = 0; index < candidates.length; index++) {
        const player = candidates[index];
        await pool.query(
          `INSERT INTO fb_prediction_ledger (
             espn_game_id, season, game_start_at, locked_at, model_version,
             player_name, team, model_probability, model_rank, is_top_pick,
             current_season_fb, current_season_games, previous_season_fb, previous_season_games
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (espn_game_id, player_name, team) DO NOTHING`,
          [
            espnGameId,
            season,
            gameTime,
            lockedAt,
            MODEL_VERSION,
            player.player,
            player.team,
            player.firstBasketPct,
            index + 1,
            index === 0,
            player.currentSeasonFirstBaskets ?? 0,
            player.currentSeasonGamesTracked ?? 0,
            player.previousSeasonFirstBaskets ?? 0,
            player.previousSeasonGamesTracked ?? 0,
          ],
        );
      }
      result.locked++;
      console.log(`[FB Ledger] Locked ${game.awayTeam} @ ${game.homeTeam} with 10 candidates (${MODEL_VERSION}).`);
    } catch (error) {
      console.warn(`[FB Ledger] Could not lock ${game.awayTeam} @ ${game.homeTeam}:`, error);
      result.skipped++;
    }
  }

  return result;
}

export async function gradeFirstBasketPredictionGame(
  espnGameId: string,
  scorerName: string,
  scorerTeam: string,
): Promise<number> {
  if (!pool || !(await ledgerExists())) return 0;
  const now = new Date().toISOString();
  const result = await pool.query(
    `UPDATE fb_prediction_ledger
        SET actual_first_scorer = $2,
            actual_first_scorer_team = $3,
            won = (lower(player_name) = lower($2) AND upper(team) = upper($3)),
            graded_at = $4
      WHERE espn_game_id = $1
        AND graded_at IS NULL
      RETURNING id`,
    [espnGameId, scorerName, scorerTeam, now],
  );
  if (result.rows.length) console.log(`[FB Ledger] Graded ${result.rows.length} rows for game ${espnGameId}: ${scorerName} (${scorerTeam}).`);
  return result.rows.length;
}

export async function getFirstBasketLedgerSummary(days = 30): Promise<{
  modelVersion: string;
  lockedGames: number;
  gradedGames: number;
  topPickWins: number;
  topPickAccuracy: number | null;
  candidateBrier: number | null;
}> {
  if (!pool || !(await ledgerExists())) {
    return { modelVersion: MODEL_VERSION, lockedGames: 0, gradedGames: 0, topPickWins: 0, topPickAccuracy: null, candidateBrier: null };
  }
  const result = await pool.query(
    `WITH recent AS (
       SELECT * FROM fb_prediction_ledger
        WHERE locked_at::timestamptz >= now() - ($1::text || ' days')::interval
     ), game_counts AS (
       SELECT count(DISTINCT espn_game_id) AS locked_games,
              count(DISTINCT espn_game_id) FILTER (WHERE graded_at IS NOT NULL) AS graded_games
         FROM recent
     ), top_picks AS (
       SELECT count(*) FILTER (WHERE won = true) AS wins,
              count(*) FILTER (WHERE graded_at IS NOT NULL) AS graded
         FROM recent WHERE is_top_pick = true
     ), candidate_score AS (
       SELECT avg(power(model_probability / 100.0 - CASE WHEN won THEN 1 ELSE 0 END, 2)) AS brier
         FROM recent WHERE graded_at IS NOT NULL
     )
     SELECT game_counts.locked_games, game_counts.graded_games,
            top_picks.wins, top_picks.graded, candidate_score.brier
       FROM game_counts, top_picks, candidate_score`,
    [Math.max(1, Math.min(days, 365))],
  );
  const row = result.rows[0] ?? {};
  const gradedTop = Number(row.graded ?? 0);
  const wins = Number(row.wins ?? 0);
  return {
    modelVersion: MODEL_VERSION,
    lockedGames: Number(row.locked_games ?? 0),
    gradedGames: Number(row.graded_games ?? 0),
    topPickWins: wins,
    topPickAccuracy: gradedTop > 0 ? Math.round((wins / gradedTop) * 1000) / 10 : null,
    candidateBrier: row.brier == null ? null : Math.round(Number(row.brier) * 10000) / 10000,
  };
}
