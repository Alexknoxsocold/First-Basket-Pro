import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export type MlbIntegrityIssue = { severity: "ERROR" | "WARNING"; code: string; count: number; description: string };
export type MlbIntegritySummary = {
  generatedAt: string; windowDays: number; snapshots: number; locked: number; graded: number; marketCaptured: number;
  errors: number; warnings: number; status: "PASS" | "WARN" | "FAIL" | "NO_DATA"; issues: MlbIntegrityIssue[];
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
      game_start_at timestamp, locked_at timestamp, outcome text, first_inning_score text, market_available boolean NOT NULL DEFAULT false,
      market_side text, sportsbook text, market_name text, market_odds integer, market_captured_at timestamp,
      market_implied_probability real, market_no_vig_probability real, market_edge real, market_expected_value real,
      value_play boolean NOT NULL DEFAULT false, created_at timestamp NOT NULL DEFAULT now(), graded_at timestamp,
      UNIQUE(prediction_date, game_id, model_version)
    );
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS game_start_at timestamp;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_available boolean NOT NULL DEFAULT false;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS market_captured_at timestamp;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS graded_at timestamp;
    CREATE INDEX IF NOT EXISTS mlb_prediction_snapshots_integrity_idx ON mlb_prediction_snapshots(prediction_date DESC, locked_at DESC);
  `).then(() => undefined).catch(error => { tableReady = null; throw error; });
  return tableReady;
}

export async function getMlbIntegritySummary(days = 30): Promise<MlbIntegritySummary> {
  const db = getPool();
  if (!db) return { generatedAt: new Date().toISOString(), windowDays: days, snapshots: 0, locked: 0, graded: 0, marketCaptured: 0, errors: 0, warnings: 0, status: "NO_DATA", issues: [{ severity: "WARNING", code: "DATABASE_UNAVAILABLE", count: 1, description: "DATABASE_URL is not configured; integrity cannot be verified." }] };
  await ensureTable();
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const base = await db.query<{ snapshots: string; locked: string; graded: string; marketCaptured: string }>(`
    SELECT COUNT(*)::text AS snapshots,
           COUNT(*) FILTER (WHERE locked_at IS NOT NULL)::text AS locked,
           COUNT(*) FILTER (WHERE graded_at IS NOT NULL AND outcome IN ('NRFI','YRFI'))::text AS graded,
           COUNT(*) FILTER (WHERE market_captured_at IS NOT NULL)::text AS "marketCaptured"
      FROM mlb_prediction_snapshots
     WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
  `, [safeDays]);

  const issueQueries: Array<{ severity: "ERROR" | "WARNING"; code: string; description: string; sql: string }> = [
    { severity: "ERROR", code: "FUTURE_LOCK", description: "A prediction lock timestamp is in the future.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND locked_at > now()` },
    { severity: "ERROR", code: "GRADE_BEFORE_LOCK", description: "A graded prediction has a grading timestamp before its lock timestamp.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND locked_at IS NOT NULL AND graded_at IS NOT NULL AND graded_at < locked_at` },
    { severity: "ERROR", code: "LOCK_AFTER_GAME_START", description: "A prediction was locked after the authoritative scheduled/actual game start time.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND game_start_at IS NOT NULL AND locked_at IS NOT NULL AND locked_at > game_start_at` },
    { severity: "ERROR", code: "MARKET_AFTER_LOCK", description: "A captured market timestamp is later than the prediction lock, so it cannot be used as a pre-lock price.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND locked_at IS NOT NULL AND market_captured_at IS NOT NULL AND market_captured_at > locked_at` },
    { severity: "ERROR", code: "INVALID_PROBABILITY", description: "A persisted model probability is outside the valid 0–1 range.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND (probability < 0 OR probability > 1 OR probability IS NULL)` },
    { severity: "ERROR", code: "INVALID_OUTCOME", description: "A prediction contains an outcome value outside NRFI/YRFI/null.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND outcome IS NOT NULL AND outcome NOT IN ('NRFI','YRFI')` },
    { severity: "ERROR", code: "GRADE_WITHOUT_LOCK", description: "A graded prediction has no historical lock timestamp and therefore cannot be part of the verified record.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND graded_at IS NOT NULL AND outcome IN ('NRFI','YRFI') AND locked_at IS NULL` },
    { severity: "WARNING", code: "MISSING_GAME_START", description: "A snapshot has no authoritative game-start timestamp. Its lock cannot be proven to have occurred before first pitch.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND locked_at IS NOT NULL AND game_start_at IS NULL` },
    { severity: "WARNING", code: "GAME_START_AFTER_GRADING", description: "A recorded game-start timestamp is after grading, indicating a bad source timestamp or timezone mapping.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND game_start_at IS NOT NULL AND graded_at IS NOT NULL AND game_start_at > graded_at` },
    { severity: "WARNING", code: "VALUE_PLAY_WITHOUT_MARKET", description: "A row is marked as a value play but has no captured sportsbook market.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND value_play = true AND (market_available = false OR market_odds IS NULL)` },
    { severity: "WARNING", code: "MARKET_WITHOUT_TIMESTAMP", description: "A market is present without a capture timestamp, so its historical timing cannot be independently verified.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND market_available = true AND market_odds IS NOT NULL AND market_captured_at IS NULL` },
    { severity: "WARNING", code: "LOCKED_AFTER_DATE", description: "A lock timestamp falls on a calendar date after the prediction date; review timezone/source handling.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND locked_at IS NOT NULL AND locked_at::date > prediction_date::date` },
    { severity: "WARNING", code: "UNLOCKED_ACTIONABLE", description: "An NRFI/YRFI recommendation has no lock timestamp and is therefore retrospective rather than verified.", sql: `SELECT COUNT(*)::text AS count FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD') AND recommendation IN ('NRFI','YRFI') AND locked_at IS NULL` },
  ];

  const issues: MlbIntegrityIssue[] = [];
  for (const q of issueQueries) {
    const result = await db.query<{ count: string }>(q.sql, [safeDays]);
    const count = Number(result.rows[0]?.count ?? 0);
    if (count > 0) issues.push({ severity: q.severity, code: q.code, count, description: q.description });
  }
  const counts = base.rows[0];
  const errors = issues.filter(i => i.severity === "ERROR").reduce((sum, i) => sum + i.count, 0);
  const warnings = issues.filter(i => i.severity === "WARNING").reduce((sum, i) => sum + i.count, 0);
  const status = Number(counts?.snapshots ?? 0) === 0 ? "NO_DATA" : errors > 0 ? "FAIL" : warnings > 0 ? "WARN" : "PASS";
  return { generatedAt: new Date().toISOString(), windowDays: safeDays, snapshots: Number(counts?.snapshots ?? 0), locked: Number(counts?.locked ?? 0), graded: Number(counts?.graded ?? 0), marketCaptured: Number(counts?.marketCaptured ?? 0), errors, warnings, status, issues };
}
