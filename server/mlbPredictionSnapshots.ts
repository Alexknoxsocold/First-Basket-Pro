import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import type { MlbMarketValue } from "./mlbMarketValue.js";

neonConfig.webSocketConstructor = ws;

export type MlbPredictionSnapshot = {
  date: string;
  gameId: string;
  matchup: string;
  recommendation: "NRFI" | "YRFI" | "NO_PLAY";
  probability: number;
  confidence?: string | null;
  modelVersion: string;
  /** Authoritative scheduled/actual first-pitch timestamp from the source feed. */
  gameStartAt?: Date | string | null;
  lockedAt?: Date | null;
  outcome?: "NRFI" | "YRFI" | null;
  firstInningScore?: string | null;
  marketValue?: MlbMarketValue | null;
};

let pool: Pool | null = null;
let ready: Promise<void> | null = null;
function db(): Pool | null { if (!process.env.DATABASE_URL) return null; if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL }); return pool; }

async function ensure(): Promise<void> {
  if (ready) return ready;
  const connection = db(); if (!connection) return;
  ready = connection.query(`
    CREATE TABLE IF NOT EXISTS mlb_prediction_snapshots (
      id varchar(160) PRIMARY KEY, prediction_date text NOT NULL, game_id text NOT NULL, matchup text NOT NULL,
      recommendation text NOT NULL, probability real NOT NULL, confidence text, model_version text NOT NULL,
      game_start_at timestamp, locked_at timestamp, outcome text, first_inning_score text, market_available boolean NOT NULL DEFAULT false,
      market_side text, sportsbook text, market_name text, market_odds integer, market_captured_at timestamp,
      market_implied_probability real, market_no_vig_probability real, market_edge real, market_expected_value real,
      value_play boolean NOT NULL DEFAULT false, created_at timestamp NOT NULL DEFAULT now(), graded_at timestamp,
      UNIQUE(prediction_date,game_id,model_version),
      CHECK (probability >= 0 AND probability <= 1),
      CHECK (recommendation IN ('NRFI','YRFI','NO_PLAY')),
      CHECK (outcome IS NULL OR outcome IN ('NRFI','YRFI'))
    );
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS game_start_at timestamp;
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

    CREATE OR REPLACE FUNCTION protect_mlb_prediction_snapshot_lock()
    RETURNS trigger AS $$
    BEGIN
      IF OLD.locked_at IS NOT NULL THEN
        IF NEW.prediction_date IS DISTINCT FROM OLD.prediction_date
          OR NEW.game_id IS DISTINCT FROM OLD.game_id
          OR NEW.matchup IS DISTINCT FROM OLD.matchup
          OR NEW.recommendation IS DISTINCT FROM OLD.recommendation
          OR NEW.probability IS DISTINCT FROM OLD.probability
          OR NEW.confidence IS DISTINCT FROM OLD.confidence
          OR NEW.model_version IS DISTINCT FROM OLD.model_version
          OR NEW.game_start_at IS DISTINCT FROM OLD.game_start_at
          OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
          OR NEW.market_available IS DISTINCT FROM OLD.market_available
          OR NEW.market_side IS DISTINCT FROM OLD.market_side
          OR NEW.sportsbook IS DISTINCT FROM OLD.sportsbook
          OR NEW.market_name IS DISTINCT FROM OLD.market_name
          OR NEW.market_odds IS DISTINCT FROM OLD.market_odds
          OR NEW.market_captured_at IS DISTINCT FROM OLD.market_captured_at
          OR NEW.market_implied_probability IS DISTINCT FROM OLD.market_implied_probability
          OR NEW.market_no_vig_probability IS DISTINCT FROM OLD.market_no_vig_probability
          OR NEW.market_edge IS DISTINCT FROM OLD.market_edge
          OR NEW.market_expected_value IS DISTINCT FROM OLD.market_expected_value
          OR NEW.value_play IS DISTINCT FROM OLD.value_play
          OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
          RAISE EXCEPTION 'MLB prediction snapshot is locked and immutable';
        END IF;
      ELSE
        IF NEW.locked_at IS NOT NULL AND NEW.locked_at > now() + interval '2 minutes' THEN
          RAISE EXCEPTION 'MLB prediction lock timestamp is too far in the future';
        END IF;
        IF NEW.game_start_at IS NOT NULL AND NEW.locked_at IS NOT NULL AND NEW.locked_at > NEW.game_start_at THEN
          RAISE EXCEPTION 'MLB prediction lock cannot occur after game start';
        END IF;
        IF NEW.locked_at IS NOT NULL
          AND NEW.market_captured_at IS NOT NULL
          AND NEW.market_captured_at > NEW.locked_at + interval '2 minutes'
        THEN
          RAISE EXCEPTION 'Market quote was captured after prediction lock';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS mlb_prediction_snapshot_lock_guard ON mlb_prediction_snapshots;
    CREATE TRIGGER mlb_prediction_snapshot_lock_guard
      BEFORE UPDATE ON mlb_prediction_snapshots
      FOR EACH ROW EXECUTE FUNCTION protect_mlb_prediction_snapshot_lock();

    CREATE INDEX IF NOT EXISTS mlb_prediction_snapshots_date_idx ON mlb_prediction_snapshots(prediction_date DESC);
    CREATE INDEX IF NOT EXISTS mlb_prediction_snapshots_value_idx ON mlb_prediction_snapshots(value_play, prediction_date DESC);
    CREATE INDEX IF NOT EXISTS mlb_prediction_snapshots_locked_idx ON mlb_prediction_snapshots(locked_at DESC);
    CREATE INDEX IF NOT EXISTS mlb_prediction_snapshots_start_idx ON mlb_prediction_snapshots(game_start_at DESC);
  `).then(() => undefined).catch(error => { ready = null; throw error; });
  return ready;
}

export async function snapshotPrediction(data: MlbPredictionSnapshot): Promise<void> {
  const connection = db(); if (!connection) return; await ensure();
  const id = `${data.date}:${data.gameId}:${data.modelVersion}`;
  const market = data.marketValue;
  const lockedAt = data.lockedAt ?? null;
  const gameStartAt = data.gameStartAt ? new Date(data.gameStartAt) : null;

  if (gameStartAt && !Number.isFinite(gameStartAt.getTime())) throw new Error("Invalid MLB game start timestamp");
  if (lockedAt && lockedAt.getTime() > Date.now() + 2 * 60 * 1000) throw new Error("Prediction lock timestamp cannot be materially in the future");
  if (gameStartAt && lockedAt && lockedAt.getTime() > gameStartAt.getTime()) throw new Error("Prediction lock cannot occur after game start");
  if (lockedAt && market?.capturedAt) {
    const capturedAt = new Date(market.capturedAt);
    if (Number.isFinite(capturedAt.getTime()) && capturedAt.getTime() > lockedAt.getTime() + 2 * 60 * 1000) throw new Error("Market quote was captured after prediction lock");
  }

  await connection.query(`
    INSERT INTO mlb_prediction_snapshots
      (id,prediction_date,game_id,matchup,recommendation,probability,confidence,model_version,game_start_at,locked_at,outcome,first_inning_score,
       market_available,market_side,sportsbook,market_name,market_odds,market_captured_at,market_implied_probability,market_no_vig_probability,
       market_edge,market_expected_value,value_play,created_at,graded_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now(),CASE WHEN $11 IS NULL THEN NULL ELSE now() END)
    ON CONFLICT(prediction_date,game_id,model_version) DO UPDATE SET
      outcome=COALESCE(EXCLUDED.outcome, mlb_prediction_snapshots.outcome),
      first_inning_score=COALESCE(EXCLUDED.first_inning_score, mlb_prediction_snapshots.first_inning_score),
      graded_at=COALESCE(EXCLUDED.graded_at, mlb_prediction_snapshots.graded_at)
  `, [id,data.date,data.gameId,data.matchup,data.recommendation,data.probability,data.confidence ?? null,data.modelVersion,gameStartAt,lockedAt,data.outcome ?? null,data.firstInningScore ?? null,
      market?.available ?? false,market?.side ?? null,market?.sportsbook ?? null,market?.market ?? null,market?.americanOdds ?? null,
      market?.capturedAt ? new Date(market.capturedAt) : null,market?.impliedProbability ?? null,market?.noVigProbability ?? null,market?.edge ?? null,market?.expectedValue ?? null,market?.valuePlay ?? false]);
}

export async function getPredictionHistory(days = 30): Promise<MlbPredictionSnapshot[]> {
  const connection = db(); if (!connection) return []; await ensure();
  const result = await connection.query(`
    SELECT prediction_date,game_id,matchup,recommendation,probability,confidence,model_version,game_start_at,locked_at,outcome,first_inning_score,
           market_available,market_side,sportsbook,market_name,market_odds,market_captured_at,market_implied_probability,market_no_vig_probability,
           market_edge,market_expected_value,value_play
    FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date - ($1::int - 1),'YYYY-MM-DD')
    ORDER BY prediction_date DESC, locked_at DESC NULLS LAST, created_at DESC
  `, [Math.min(Math.max(Math.round(days),1),365)]);
  return result.rows.map(row => ({
    date: row.prediction_date, gameId: row.game_id, matchup: row.matchup, recommendation: row.recommendation,
    probability: Number(row.probability), confidence: row.confidence, modelVersion: row.model_version,
    gameStartAt: row.game_start_at, lockedAt: row.locked_at, outcome: row.outcome, firstInningScore: row.first_inning_score,
    marketValue: row.market_available ? {
      available: true, side: row.market_side, sportsbook: row.sportsbook, market: row.market_name, americanOdds: row.market_odds,
      capturedAt: row.market_captured_at, ageSeconds: null, impliedProbability: row.market_implied_probability,
      noVigProbability: row.market_no_vig_probability, modelProbability: Number(row.probability), edge: row.market_edge,
      expectedValue: row.market_expected_value, valuePlay: row.value_play,
      reason: row.value_play ? "Verified market value" : "Verified market price, but no qualifying edge",
    } : null,
  }));
}
