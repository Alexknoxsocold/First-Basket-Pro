import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

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

type PredictionSnapshot = {
  id: string;
  predictionDate: string;
  gameId: string;
  awayTeam: string;
  homeTeam: string;
  nrfiProbability: number;
  recommendation: "NRFI" | "YRFI";
  playStatus: "BEST_PLAY" | "PLAY" | "LEAN" | "NO_PLAY";
  modelEdge: number;
  confidence: "High" | "Medium" | "Low";
  sampleSize: number;
  outcome: "won" | "lost" | "pending";
  firstInningScore: string | null;
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
  tableReady = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS mlb_prediction_history (
        id varchar(64) PRIMARY KEY,
        prediction_date text NOT NULL,
        game_id text NOT NULL,
        away_team text NOT NULL,
        home_team text NOT NULL,
        nrfi_probability real NOT NULL,
        recommendation text NOT NULL,
        play_status text NOT NULL,
        model_edge real NOT NULL,
        confidence text NOT NULL,
        sample_size integer NOT NULL DEFAULT 0,
        outcome text,
        first_inning_score text,
        predicted_at timestamp NOT NULL DEFAULT now(),
        graded_at timestamp,
        UNIQUE (prediction_date, game_id)
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS mlb_prediction_history_date_idx ON mlb_prediction_history(prediction_date)`);
    await db.query(`CREATE INDEX IF NOT EXISTS mlb_prediction_history_outcome_idx ON mlb_prediction_history(outcome)`);
  })().catch(error => {
    tableReady = null;
    throw error;
  });
  return tableReady;
}

export async function recordPredictionSnapshot(data: {
  date: string;
  games: Array<{
    id: string;
    away: { abbreviation: string };
    home: { abbreviation: string };
    nrfiProbability: number;
    recommendation: "NRFI" | "YRFI";
    playStatus: "BEST_PLAY" | "PLAY" | "LEAN" | "NO_PLAY";
    modelEdge: number;
    confidence: "High" | "Medium" | "Low";
    sampleSize: number;
    outcome: "won" | "lost" | "pending";
    firstInningScore: string | null;
  }>;
}): Promise<number> {
  const db = getPool();
  if (!db) return 0;
  await ensureTable();
  let written = 0;
  for (const game of data.games) {
    const id = `${data.date}:${game.id}`;
    const outcome = game.outcome === "pending" ? null : game.outcome;
    const gradedAt = outcome ? new Date() : null;
    await db.query(
      `INSERT INTO mlb_prediction_history
       (id, prediction_date, game_id, away_team, home_team, nrfi_probability, recommendation,
        play_status, model_edge, confidence, sample_size, outcome, first_inning_score, predicted_at, graded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),$14)
       ON CONFLICT (prediction_date, game_id) DO UPDATE SET
         outcome = COALESCE(EXCLUDED.outcome, mlb_prediction_history.outcome),
         first_inning_score = COALESCE(EXCLUDED.first_inning_score, mlb_prediction_history.first_inning_score),
         graded_at = COALESCE(EXCLUDED.graded_at, mlb_prediction_history.graded_at)`,
      [id, data.date, game.id, game.away.abbreviation, game.home.abbreviation,
       game.nrfiProbability, game.recommendation, game.playStatus, game.modelEdge,
       game.confidence, game.sampleSize, outcome, game.firstInningScore, gradedAt],
    );
    written++;
  }
  return written;
}

function bucketFor(probability: number): { label: string; min: number; max: number } {
  const p = Math.max(0.5, Math.min(0.8, probability));
  const lower = Math.floor((p * 100) / 5) * 5;
  return { label: `${lower}-${lower + 5}%`, min: lower / 100, max: (lower + 5) / 100 };
}

function calculateSummary(rows: PredictionSnapshot[]): CalibrationSummary {
  const graded = rows.filter(row => row.outcome === "won" || row.outcome === "lost");
  const wins = graded.filter(row => row.outcome === "won").length;
  const averagePredicted = graded.length
    ? graded.reduce((sum, row) => sum + Math.max(row.nrfiProbability, 100 - row.nrfiProbability) / 100, 0) / graded.length
    : null;

  const buckets: CalibrationBucket[] = [];
  for (let lower = 0.50; lower < 0.80; lower += 0.05) {
    const upper = lower + 0.05;
    const inBucket = graded.filter(row => {
      const p = Math.max(row.nrfiProbability, 100 - row.nrfiProbability) / 100;
      return p >= lower && (p < upper || (upper >= 0.80 && p <= upper));
    });
    const bucketWins = inBucket.filter(row => row.outcome === "won").length;
    const avg = inBucket.length ? inBucket.reduce((sum, row) => sum + Math.max(row.nrfiProbability, 100 - row.nrfiProbability) / 100, 0) / inBucket.length : null;
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
        const p = Math.max(row.nrfiProbability, 100 - row.nrfiProbability) / 100;
        return sum + Math.pow(p - (row.outcome === "won" ? 1 : 0), 2);
      }, 0) / graded.length
    : null;
  const logLoss = graded.length
    ? graded.reduce((sum, row) => {
        const p = Math.max(0.001, Math.min(0.999, Math.max(row.nrfiProbability, 100 - row.nrfiProbability) / 100));
        return sum - Math.log(row.outcome === "won" ? p : 1 - p);
      }, 0) / graded.length
    : null;
  const ece = graded.length
    ? buckets.reduce((sum, bucket) => sum + (bucket.hitRate === null || bucket.averagePredicted === null ? 0 : Math.abs(bucket.calibrationGap ?? 0) * bucket.predictions / graded.length), 0)
    : null;

  const qualified = graded.filter(row => row.playStatus === "BEST_PLAY" || row.playStatus === "PLAY");
  const qualifiedWins = qualified.filter(row => row.outcome === "won").length;
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
        ? qualified.reduce((sum, row) => sum + Math.max(row.nrfiProbability, 100 - row.nrfiProbability) / 100, 0) / qualified.length
        : null,
    },
    lastPredictionAt: rows[0] ? new Date().toISOString() : null,
    lastGradedAt: graded.length ? new Date().toISOString() : null,
  };
}

export async function getCalibrationSummary(days = 30): Promise<CalibrationSummary> {
  const db = getPool();
  if (!db) return calculateSummary([]);
  await ensureTable();
  const safeDays = Math.min(Math.max(Math.round(days), 1), 90);
  const result = await db.query<PredictionSnapshot>(
    `SELECT id, prediction_date AS "predictionDate", game_id AS "gameId", away_team AS "awayTeam",
            home_team AS "homeTeam", nrfi_probability AS "nrfiProbability", recommendation,
            play_status AS "playStatus", model_edge AS "modelEdge", confidence, sample_size AS "sampleSize",
            outcome, first_inning_score AS "firstInningScore"
     FROM mlb_prediction_history
     WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
     ORDER BY prediction_date DESC`,
    [safeDays],
  );
  return calculateSummary(result.rows);
}

// Conservative post-hoc calibration. It only activates after enough graded data
// exists and uses shrinkage so a small hot/cold streak cannot swing the live model.
export async function calibrateRecommendedProbability(rawProbability: number): Promise<number> {
  const db = getPool();
  if (!db) return rawProbability;
  await ensureTable();
  const total = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM mlb_prediction_history WHERE outcome IN ('won','lost')`);
  if (Number(total.rows[0]?.count ?? 0) < 50) return rawProbability;

  const p = Math.max(0.50, Math.min(0.80, rawProbability));
  const bucket = bucketFor(p);
  const result = await db.query<{ n: string; wins: string; avg: string | null }>(
    `SELECT COUNT(*)::text AS n,
            COUNT(*) FILTER (WHERE outcome = 'won')::text AS wins,
            AVG(GREATEST(nrfi_probability, 100 - nrfi_probability)) / 100.0 AS avg
       FROM mlb_prediction_history
      WHERE outcome IN ('won','lost')
        AND GREATEST(nrfi_probability, 100 - nrfi_probability) / 100.0 >= $1
        AND GREATEST(nrfi_probability, 100 - nrfi_probability) / 100.0 < $2`,
    [bucket.min, bucket.max],
  );
  const n = Number(result.rows[0]?.n ?? 0);
  if (n < 10) return rawProbability;
  const wins = Number(result.rows[0]?.wins ?? 0);
  const calibrated = (wins + rawProbability * 20) / (n + 20);
  const distance = Math.abs(rawProbability - 0.50);
  const maxDistance = Math.max(0.01, distance);
  return Math.round((0.50 + Math.min(Math.abs(calibrated - 0.50), maxDistance) * Math.sign(calibrated - 0.50)) * 1000) / 1000;
}

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
    predictionsWritten += await recordPredictionSnapshot(response);
    gamesGraded += response.games.filter((game: any) => game.outcome === "won" || game.outcome === "lost").length;
  }
  return { datesProcessed: dates.length, predictionsWritten, gamesGraded };
}
