import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { snapshotPrediction } from "./mlbPredictionSnapshots.js";
import type { MlbMarketValue } from "./mlbMarketValue.js";

neonConfig.webSocketConstructor = ws;

export type CalibrationBucket = {
  label: string; minProbability: number; maxProbability: number; predictions: number; wins: number;
  hitRate: number | null; averagePredicted: number | null; calibrationGap: number | null;
};
export type PerformanceSummary = {
  bets: number; wins: number; losses: number; pushes: number; winRate: number | null;
  unitsRisked: number; unitsProfit: number; roi: number | null; averageOdds: number | null;
  averageEdge: number | null; averageExpectedValue: number | null;
};
export type CalibrationSummary = {
  sampleSize: number; gradedPredictions: number; wins: number; hitRate: number | null;
  brierScore: number | null; logLoss: number | null; expectedCalibrationError: number | null;
  averagePredicted: number | null; buckets: CalibrationBucket[];
  qualifiedPlays: { sampleSize: number; wins: number; hitRate: number | null; averagePredicted: number | null };
  performance: PerformanceSummary; lastPredictionAt: string | null; lastGradedAt: string | null;
};
type CalibrationRow = {
  predictionDate: string; gameId: string; recommendation: "NRFI" | "YRFI" | "NO_PLAY";
  probability: number; outcome: "NRFI" | "YRFI" | null; valuePlay: boolean; marketAvailable: boolean;
  marketOdds: number | null; marketEdge: number | null; marketExpectedValue: number | null;
  lockedAt: Date | string | null; createdAt: Date | string | null; gradedAt: Date | string | null;
};
let pool: Pool | null = null;
let tableReady: Promise<void> | null = null;
function getPool(): Pool | null { if (!process.env.DATABASE_URL) return null; if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL }); return pool; }
async function ensureTable(): Promise<void> {
  if (tableReady) return tableReady;
  const db = getPool(); if (!db) return;
  tableReady = db.query(`
    CREATE TABLE IF NOT EXISTS mlb_prediction_snapshots (
      id varchar(160) PRIMARY KEY, prediction_date text NOT NULL, game_id text NOT NULL, matchup text NOT NULL,
      recommendation text NOT NULL, probability real NOT NULL, confidence text, model_version text NOT NULL,
      locked_at timestamp, outcome text, first_inning_score text, market_available boolean NOT NULL DEFAULT false,
      market_side text, sportsbook text, market_name text, market_odds integer, market_captured_at timestamp,
      market_implied_probability real, market_no_vig_probability real, market_edge real, market_expected_value real,
      value_play boolean NOT NULL DEFAULT false, created_at timestamp NOT NULL DEFAULT now(), graded_at timestamp,
      UNIQUE(prediction_date, game_id, model_version)
    );
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_available boolean NOT NULL DEFAULT false;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_side text;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS sportsbook text;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_name text;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_odds integer;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_captured_at timestamp;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_implied_probability real;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_no_vig_probability real;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_edge real;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_expected_value real;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS value_play boolean NOT NULL DEFAULT false;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS graded_at timestamp;
    CREATE INDEX IF NOT EXISTS mlb_prediction_snapshots_date_idx ON mlb_prediction_snapshots(prediction_date DESC);
    CREATE INDEX IF NOT EXISTS mlb_prediction_snapshots_value_idx ON mlb_prediction_snapshots(value_play, prediction_date DESC);
  `).then(() => undefined).catch(error => { tableReady = null; throw error; });
  return tableReady;
}
function safeProbability(value: number): number { return Math.min(0.999, Math.max(0.001, value)); }
function isGraded(row: CalibrationRow): boolean { return !!row.lockedAt && (row.recommendation === "NRFI" || row.recommendation === "YRFI") && (row.outcome === "NRFI" || row.outcome === "YRFI"); }
function didWin(row: CalibrationRow): boolean { return row.outcome === row.recommendation; }
function decimalOdds(americanOdds: number): number | null { if (!Number.isFinite(americanOdds) || americanOdds === 0) return null; return americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / Math.abs(americanOdds); }
function unitProfit(row: CalibrationRow): number | null { if (!isGraded(row) || !row.valuePlay || !row.marketAvailable || row.marketOdds === null) return null; const decimal = decimalOdds(row.marketOdds); if (decimal === null) return null; return didWin(row) ? decimal - 1 : -1; }
function bucketFor(probability: number): { label: string; min: number; max: number } { const p = Math.min(0.95, Math.max(0.50, probability)); const lower = Math.floor((p * 100) / 5) * 5; return { label: `${lower}-${lower + 5}%`, min: lower / 100, max: (lower + 5) / 100 }; }
function calculatePerformance(rows: CalibrationRow[]): PerformanceSummary {
  const bets = rows.filter(row => unitProfit(row) !== null); const wins = bets.filter(didWin).length; const losses = bets.length - wins;
  const unitsProfit = bets.reduce((sum, row) => sum + (unitProfit(row) ?? 0), 0);
  const odds = bets.map(row => row.marketOdds).filter((v): v is number => v !== null && Number.isFinite(v));
  const edges = bets.map(row => row.marketEdge).filter((v): v is number => v !== null && Number.isFinite(v));
  const evs = bets.map(row => row.marketExpectedValue).filter((v): v is number => v !== null && Number.isFinite(v));
  return { bets: bets.length, wins, losses, pushes: 0, winRate: bets.length ? wins / bets.length : null, unitsRisked: bets.length, unitsProfit: Math.round(unitsProfit * 10000) / 10000, roi: bets.length ? unitsProfit / bets.length : null, averageOdds: odds.length ? odds.reduce((sum, v) => sum + v, 0) / odds.length : null, averageEdge: edges.length ? edges.reduce((sum, v) => sum + v, 0) / edges.length : null, averageExpectedValue: evs.length ? evs.reduce((sum, v) => sum + v, 0) / evs.length : null };
}
function calculateSummary(rows: CalibrationRow[]): CalibrationSummary {
  const graded = rows.filter(isGraded); const wins = graded.filter(didWin).length; const averagePredicted = graded.length ? graded.reduce((sum, row) => sum + safeProbability(row.probability), 0) / graded.length : null; const buckets: CalibrationBucket[] = [];
  for (let lower = 0.50; lower < 0.95; lower += 0.05) { const upper = lower + 0.05; const inBucket = graded.filter(row => { const p = safeProbability(row.probability); return p >= lower && (p < upper || (upper >= 0.95 && p <= upper)); }); const bucketWins = inBucket.filter(didWin).length; const avg = inBucket.length ? inBucket.reduce((sum, row) => sum + safeProbability(row.probability), 0) / inBucket.length : null; const hitRate = inBucket.length ? bucketWins / inBucket.length : null; buckets.push({ label: `${Math.round(lower * 100)}-${Math.round(upper * 100)}%`, minProbability: lower, maxProbability: upper, predictions: inBucket.length, wins: bucketWins, hitRate, averagePredicted: avg, calibrationGap: hitRate !== null && avg !== null ? hitRate - avg : null }); }
  const brierScore = graded.length ? graded.reduce((sum, row) => { const p = safeProbability(row.probability); return sum + Math.pow(p - (didWin(row) ? 1 : 0), 2); }, 0) / graded.length : null;
  const logLoss = graded.length ? graded.reduce((sum, row) => { const p = safeProbability(row.probability); return sum - Math.log(didWin(row) ? p : 1 - p); }, 0) / graded.length : null;
  const ece = graded.length ? buckets.reduce((sum, bucket) => { if (bucket.hitRate === null || bucket.averagePredicted === null) return sum; return sum + Math.abs(bucket.calibrationGap ?? 0) * bucket.predictions / graded.length; }, 0) : null;
  const qualified = graded.filter(row => row.valuePlay && row.marketAvailable && row.marketOdds !== null); const qualifiedWins = qualified.filter(didWin).length;
  const predictionDates = rows.map(row => row.lockedAt ?? row.createdAt).filter(Boolean).map(value => new Date(value as Date | string).getTime()).filter(Number.isFinite); const gradedDates = graded.map(row => row.gradedAt).filter(Boolean).map(value => new Date(value as Date | string).getTime()).filter(Number.isFinite);
  return { sampleSize: rows.length, gradedPredictions: graded.length, wins, hitRate: graded.length ? wins / graded.length : null, brierScore, logLoss, expectedCalibrationError: ece, averagePredicted, buckets, qualifiedPlays: { sampleSize: qualified.length, wins: qualifiedWins, hitRate: qualified.length ? qualifiedWins / qualified.length : null, averagePredicted: qualified.length ? qualified.reduce((sum, row) => sum + safeProbability(row.probability), 0) / qualified.length : null }, performance: calculatePerformance(rows), lastPredictionAt: predictionDates.length ? new Date(Math.max(...predictionDates)).toISOString() : null, lastGradedAt: gradedDates.length ? new Date(Math.max(...gradedDates)).toISOString() : null };
}
export async function getCalibrationSummary(days = 30): Promise<CalibrationSummary> {
  const db = getPool(); if (!db) return calculateSummary([]); await ensureTable(); const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const result = await db.query<CalibrationRow>(`SELECT prediction_date AS "predictionDate", game_id AS "gameId", recommendation, probability, outcome, value_play AS "valuePlay", market_available AS "marketAvailable", market_odds AS "marketOdds", market_edge AS "marketEdge", market_expected_value AS "marketExpectedValue", locked_at AS "lockedAt", created_at AS "createdAt", graded_at AS "gradedAt" FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') ORDER BY prediction_date DESC, locked_at DESC NULLS LAST, created_at DESC`, [safeDays]);
  return calculateSummary(result.rows);
}

/**
 * Calibrate the side the model is actually recommending. Historical snapshots
 * store recommendation-side probability (NRFI probability for NRFI calls and
 * YRFI probability for YRFI calls), so a raw NRFI value below 50% must be
 * converted to YRFI confidence before looking up calibration performance.
 * Corrections are capped at 3 percentage points to prevent small samples from
 * swinging live probabilities too aggressively.
 */
export async function calibrateRecommendedProbability(rawNrfiProbability: number): Promise<number> {
  const db = getPool();
  if (!db || !Number.isFinite(rawNrfiProbability)) return rawNrfiProbability;
  await ensureTable();

  const rawNrfi = safeProbability(rawNrfiProbability);
  const side: "NRFI" | "YRFI" = rawNrfi >= 0.50 ? "NRFI" : "YRFI";
  const sideProbability = side === "NRFI" ? rawNrfi : 1 - rawNrfi;
  if (sideProbability > 0.95) return rawNrfi;

  const total = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE locked_at IS NOT NULL AND recommendation = $1 AND outcome IN ('NRFI','YRFI')`,
    [side],
  );
  if (Number(total.rows[0]?.count ?? 0) < 30) return rawNrfi;

  const bucket = bucketFor(sideProbability);
  const result = await db.query<{ n: string; wins: string }>(
    `SELECT COUNT(*)::text AS n, COUNT(*) FILTER (WHERE outcome = recommendation)::text AS wins FROM mlb_prediction_snapshots WHERE locked_at IS NOT NULL AND recommendation = $3 AND outcome IN ('NRFI','YRFI') AND probability >= $1 AND probability < $2`,
    [bucket.min, bucket.max, side],
  );
  const n = Number(result.rows[0]?.n ?? 0);
  if (n < 10) return rawNrfi;

  const wins = Number(result.rows[0]?.wins ?? 0);
  const posteriorSide = (wins + sideProbability * 20) / (n + 20);
  const correction = Math.min(0.03, Math.max(-0.03, posteriorSide - sideProbability));
  const calibratedSide = Math.min(0.95, Math.max(0.50, sideProbability + correction));
  const calibratedNrfi = side === "NRFI" ? calibratedSide : 1 - calibratedSide;
  return Math.round(calibratedNrfi * 1000) / 1000;
}

type LedgerGame = {
  id?: string | number; gameId?: string | number; shortName?: string; matchup?: string; date?: string; gameStartAt?: Date | string | null;
  recommendation?: "NRFI" | "YRFI" | "NO_PLAY"; nrfiProbability?: number; probability?: number; confidence?: string | null;
  outcome?: "won" | "lost" | "pending" | "NRFI" | "YRFI" | null; firstInningScore?: string | null; lockedAt?: Date | string | null;
  modelVersion?: string | null; marketValue?: any;
};
type LedgerResponse = { date: string; games: LedgerGame[] };
function normalizeOutcome(game: LedgerGame): "NRFI" | "YRFI" | null { if (game.outcome === "NRFI" || game.outcome === "YRFI") return game.outcome; if (game.outcome !== "won" && game.outcome !== "lost") return null; if (game.recommendation !== "NRFI" && game.recommendation !== "YRFI") return null; return game.outcome === "won" ? game.recommendation : game.recommendation === "NRFI" ? "YRFI" : "NRFI"; }
function validDate(value: Date | string | null | undefined): Date | null { if (!value) return null; const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; }

/** Persist live MLB predictions using ESPN's event date as the authoritative first-pitch timestamp. */
export async function recordPredictionSnapshot(response: LedgerResponse): Promise<void> {
  for (const game of response.games ?? []) {
    const gameId = String(game.gameId ?? game.id ?? "").trim(); const recommendation = game.recommendation;
    if (!gameId || (recommendation !== "NRFI" && recommendation !== "YRFI" && recommendation !== "NO_PLAY")) continue;
    const probability = typeof game.probability === "number" && Number.isFinite(game.probability) ? game.probability : typeof game.nrfiProbability === "number" ? (recommendation === "YRFI" ? 1 - game.nrfiProbability / 100 : game.nrfiProbability / 100) : NaN;
    if (!Number.isFinite(probability)) continue;
    const gameStartAt = validDate(game.gameStartAt ?? game.date ?? null); const suppliedLock = validDate(game.lockedAt ?? null); const now = Date.now();
    const lockedAt = suppliedLock ?? (gameStartAt && gameStartAt.getTime() > now ? new Date(now) : null); const outcome = normalizeOutcome(game);
    await snapshotPrediction({ date: response.date, gameId, matchup: game.matchup || game.shortName || gameId, recommendation, probability: safeProbability(probability), confidence: game.confidence ?? null, modelVersion: game.modelVersion?.trim() || "mlb-nrfi-v3", gameStartAt, lockedAt, outcome, firstInningScore: game.firstInningScore ?? null, marketValue: game.marketValue ?? null });
  }
}

type BackfillGame = LedgerGame;
export async function backfillWalkForward(_days: number, _fetchForDate: (date: string) => Promise<{ date: string; games: Array<BackfillGame> }>): Promise<{ datesProcessed: number; predictionsWritten: number; gamesGraded: number; retrospectiveSnapshots: number; disabledReason?: string }> {
  const disabledReason = "Disabled: retrospective walk-forward predictions are not allowed to write into the verified V4 evidence system until date-cutoff calibration is implemented.";
  console.warn(`[MLB Calibration] ${disabledReason}`);
  return { datesProcessed: 0, predictionsWritten: 0, gamesGraded: 0, retrospectiveSnapshots: 0, disabledReason };
}
export type { MlbMarketValue };
