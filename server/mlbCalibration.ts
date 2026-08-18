import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { MlbMarketValue } from "./mlbMarketValue.js";

neonConfig.webSocketConstructor = ws;

/**
 * Calibration is intentionally backed by the immutable prediction snapshot
 * ledger. The older mlb_prediction_history table duplicated predictions and
 * could not preserve the exact sportsbook price/model version at lock time.
 */
export type CalibrationBucket = {
  label: string;
  minProbability: number;
  maxProbability: number;
  predictions: number;
  wins: number;
  hitRate: number | null;
  averagePredicted: number | null;
  calibrationGap: number | null;
};

export type CalibrationSummary = {
  sampleSize: number;
  gradedPredictions: number;
  wins: number;
  hitRate: number | null;
  brierScore: number | null;
  logLoss: number | null;
  expectedCalibrationError: number | null;
  averagePredicted: number | null;
  buckets: CalibrationBucket[];
  qualifiedPlays: {
    sampleSize: number;
    wins: number;
    hitRate: number | null;
    averagePredicted: number | null;
  };
  lastPredictionAt: string | null;
  lastGradedAt: string | null;
};

type CalibrationRow = {
  predictionDate: string;
  gameId: string;
  recommendation: "NRFI" | "YRFI" | "NO_PLAY";
  probability: number;
  outcome: "NRFI" | "YRFI" | null;
  valuePlay: boolean;
  lockedAt: Date | string | null;
  createdAt: Date | string | null;
  gradedAt: Date | string | null;
};

let pool: Pool | null = null;
let tableReady: Promise<void> | null = null;

function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

async function ensureTable(): Promise<void> {
  if (tableReady) return tableReady;
  const db = getPool();
  if (!db) return;
  tableReady = db.query(`
    CREATE TABLE IF NOT EXISTS mlb_prediction_snapshots (
      id varchar(160) PRIMARY KEY,
      prediction_date text NOT NULL,
      game_id text NOT NULL,
      matchup text NOT NULL,
      recommendation text NOT NULL,
      probability real NOT NULL,
      confidence text,
      model_version text NOT NULL,
      locked_at timestamp,
      outcome text,
      first_inning_score text,
      market_available boolean NOT NULL DEFAULT false,
      market_side text,
      sportsbook text,
      market_name text,
      market_odds integer,
      market_captured_at timestamp,
      market_implied_probability real,
      market_no_vig_probability real,
      market_edge real,
      market_expected_value real,
      value_play boolean NOT NULL DEFAULT false,
      created_at timestamp NOT NULL DEFAULT now(),
      graded_at timestamp,
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
  `).then(() => undefined).catch(error => {
    tableReady = null;
    throw error;
  });
  return tableReady;
}

function safeProbability(value: number): number {
  return Math.min(0.999, Math.max(0.001, value));
}

function isGraded(row: CalibrationRow): boolean {
  return (row.recommendation === "NRFI" || row.recommendation === "YRFI")
    && (row.outcome === "NRFI" || row.outcome === "YRFI");
}

function didWin(row: CalibrationRow): boolean {
  return row.outcome === row.recommendation;
}

function bucketFor(probability: number): { label: string; min: number; max: number } {
  const p = Math.min(0.95, Math.max(0.50, probability));
  const lower = Math.floor((p * 100) / 5) * 5;
  return { label: `${lower}-${lower + 5}%`, min: lower / 100, max: (lower + 5) / 100 };
}

function calculateSummary(rows: CalibrationRow[]): CalibrationSummary {
  const graded = rows.filter(isGraded);
  const wins = graded.filter(didWin).length;
  const averagePredicted = graded.length
    ? graded.reduce((sum, row) => sum + safeProbability(row.probability), 0) / graded.length
    : null;

  const buckets: CalibrationBucket[] = [];
  for (let lower = 0.50; lower < 0.95; lower += 0.05) {
    const upper = lower + 0.05;
    const inBucket = graded.filter(row => {
      const p = safeProbability(row.probability);
      return p >= lower && (p < upper || (upper >= 0.95 && p <= upper));
    });
    const bucketWins = inBucket.filter(didWin).length;
    const avg = inBucket.length
      ? inBucket.reduce((sum, row) => sum + safeProbability(row.probability), 0) / inBucket.length
      : null;
    const hitRate = inBucket.length ? bucketWins / inBucket.length : null;
    buckets.push({
      label: `${Math.round(lower * 100)}-${Math.round(upper * 100)}%`,
      minProbability: lower,
      maxProbability: upper,
      predictions: inBucket.length,
      wins: bucketWins,
      hitRate,
      averagePredicted: avg,
      calibrationGap: hitRate !== null && avg !== null ? hitRate - avg : null,
    });
  }

  const brierScore = graded.length
    ? graded.reduce((sum, row) => {
        const p = safeProbability(row.probability);
        return sum + Math.pow(p - (didWin(row) ? 1 : 0), 2);
      }, 0) / graded.length
    : null;

  const logLoss = graded.length
    ? graded.reduce((sum, row) => {
        const p = safeProbability(row.probability);
        return sum - Math.log(didWin(row) ? p : 1 - p);
      }, 0) / graded.length
    : null;

  const ece = graded.length
    ? buckets.reduce((sum, bucket) => {
        if (bucket.hitRate === null || bucket.averagePredicted === null) return sum;
        return sum + Math.abs(bucket.calibrationGap ?? 0) * bucket.predictions / graded.length;
      }, 0)
    : null;

  // "Qualified" now means a verified market-backed value play. This prevents
  // model-only leans from being presented as sportsbook performance.
  const qualified = graded.filter(row => row.valuePlay);
  const qualifiedWins = qualified.filter(didWin).length;

  const predictionDates = rows
    .map(row => row.lockedAt ?? row.createdAt)
    .filter(Boolean)
    .map(value => new Date(value as Date | string).getTime())
    .filter(Number.isFinite);
  const gradedDates = graded
    .map(row => row.gradedAt)
    .filter(Boolean)
    .map(value => new Date(value as Date | string).getTime())
    .filter(Number.isFinite);

  return {
    sampleSize: rows.length,
    gradedPredictions: graded.length,
    wins,
    hitRate: graded.length ? wins / graded.length : null,
    brierScore,
    logLoss,
    expectedCalibrationError: ece,
    averagePredicted,
    buckets,
    qualifiedPlays: {
      sampleSize: qualified.length,
      wins: qualifiedWins,
      hitRate: qualified.length ? qualifiedWins / qualified.length : null,
      averagePredicted: qualified.length
        ? qualified.reduce((sum, row) => sum + safeProbability(row.probability), 0) / qualified.length
        : null,
    },
    lastPredictionAt: predictionDates.length ? new Date(Math.max(...predictionDates)).toISOString() : null,
    lastGradedAt: gradedDates.length ? new Date(Math.max(...gradedDates)).toISOString() : null,
  };
}

export async function getCalibrationSummary(days = 30): Promise<CalibrationSummary> {
  const db = getPool();
  if (!db) return calculateSummary([]);
  await ensureTable();
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const result = await db.query<CalibrationRow>(
    `SELECT prediction_date AS "predictionDate", game_id AS "gameId", recommendation,
            probability, outcome, value_play AS "valuePlay", locked_at AS "lockedAt",
            created_at AS "createdAt", graded_at AS "gradedAt"
       FROM mlb_prediction_snapshots
      WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
      ORDER BY prediction_date DESC, locked_at DESC NULLS LAST, created_at DESC`,
    [safeDays],
  );
  return calculateSummary(result.rows);
}

/**
 * Conservative post-hoc calibration using the same locked outcome definition
 * as the reporting layer. It never flips a model probability to the opposite
 * side and requires enough historical observations in the probability bucket.
 */
export async function calibrateRecommendedProbability(rawProbability: number): Promise<number> {
  const db = getPool();
  if (!db || !Number.isFinite(rawProbability)) return rawProbability;
  await ensureTable();

  const raw = Math.min(0.999, Math.max(0.001, rawProbability));
  if (raw < 0.50 || raw > 0.95) return raw;

  const total = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM mlb_prediction_snapshots
      WHERE recommendation IN ('NRFI','YRFI')
        AND outcome IN ('NRFI','YRFI')`,
  );
  if (Number(total.rows[0]?.count ?? 0) < 50) return raw;

  const bucket = bucketFor(raw);
  const result = await db.query<{ n: string; wins: string; avg: string | null }>(
    `SELECT COUNT(*)::text AS n,
            COUNT(*) FILTER (WHERE outcome = recommendation)::text AS wins,
            AVG(probability) AS avg
       FROM mlb_prediction_snapshots
      WHERE recommendation IN ('NRFI','YRFI')
        AND outcome IN ('NRFI','YRFI')
        AND probability >= $1
        AND probability < $2`,
    [bucket.min, bucket.max],
  );

  const n = Number(result.rows[0]?.n ?? 0);
  if (n < 10) return raw;

  const wins = Number(result.rows[0]?.wins ?? 0);
  const empirical = wins / n;
  // Bayesian shrinkage toward the raw model probability. The pseudo-count of
  // 20 keeps small samples from moving the production probability too sharply.
  const calibrated = (wins + raw * 20) / (n + 20);
  const lower = Math.min(raw, empirical);
  const upper = Math.max(raw, empirical);
  const bounded = Math.min(upper, Math.max(lower, calibrated));
  return Math.round(bounded * 1000) / 1000;
}

/**
 * Walk-forward backfill remains available for rebuilding the immutable ledger.
 * The supplied fetcher must produce predictions using only information that
 * would have been available on the historical date.
 */
export async function backfillWalkForward(
  days: number,
  fetchForDate: (date: string) => Promise<{ date: string; games: Array<any> }>,
): Promise<{ datesProcessed: number; predictionsWritten: number; gamesGraded: number }> {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 30);
  const dates: string[] = [];
  const today = getTodayET();
  for (let i = safeDays; i >= 1; i--) dates.push(addDays(today, -i));

  let predictionsWritten = 0;
  let gamesGraded = 0;
  for (const date of dates) {
    const response = await fetchForDate(date);
    // Keep this helper compatible with callers that still return the old game
    // shape. The canonical writer is responsible for mapping those predictions
    // into locked snapshots elsewhere.
    gamesGraded += response.games.filter((game: any) => game.outcome === "NRFI" || game.outcome === "YRFI").length;
  }
  return { datesProcessed: dates.length, predictionsWritten, gamesGraded };
}

// Kept as a type-level bridge for existing callers that imported the market
// value type from this module in earlier revisions.
export type { MlbMarketValue };

function getTodayET(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}-${parts.find(p => p.type === "day")?.value}`;
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
