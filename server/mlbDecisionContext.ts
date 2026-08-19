import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;
let ready: Promise<void> | null = null;
function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

async function ensure(): Promise<void> {
  if (ready) return ready;
  const connection = db();
  if (!connection) return;
  ready = connection.query(`
    CREATE TABLE IF NOT EXISTS mlb_prediction_context (
      id varchar(180) PRIMARY KEY,
      prediction_date text NOT NULL,
      game_id text NOT NULL,
      model_version text NOT NULL,
      game_start_at timestamp NOT NULL,
      captured_at timestamp NOT NULL DEFAULT now(),
      context jsonb NOT NULL,
      UNIQUE(prediction_date, game_id, model_version)
    );
    CREATE INDEX IF NOT EXISTS mlb_prediction_context_date_idx ON mlb_prediction_context(prediction_date DESC);

    CREATE OR REPLACE FUNCTION protect_mlb_prediction_context() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'MLB prediction decision context is immutable';
    END; $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS mlb_prediction_context_update_guard ON mlb_prediction_context;
    CREATE TRIGGER mlb_prediction_context_update_guard BEFORE UPDATE OR DELETE ON mlb_prediction_context
      FOR EACH ROW EXECUTE FUNCTION protect_mlb_prediction_context();
  `).then(() => undefined).catch(error => { ready = null; throw error; });
  return ready;
}

export type MlbDecisionContextInput = {
  date: string;
  gameId: string;
  modelVersion: string;
  gameStartAt: string;
  recommendation: "NRFI" | "YRFI";
  nrfiProbability: number;
  playStatus: string;
  confidence: string;
  sampleSize: number;
  factors?: string[];
  awayPitcher?: unknown;
  homePitcher?: unknown;
  v4?: unknown;
};

/**
 * Records the first pregame decision context only. ON CONFLICT DO NOTHING is
 * intentional: later refreshes cannot rewrite what the model knew when the
 * prediction was first captured.
 */
export async function recordMlbDecisionContext(input: MlbDecisionContextInput): Promise<void> {
  const connection = db();
  if (!connection) return;
  const start = new Date(input.gameStartAt);
  if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) return;
  await ensure();
  const id = `${input.date}:${input.gameId}:${input.modelVersion}:context`;
  const context = {
    recommendation: input.recommendation,
    nrfiProbability: input.nrfiProbability,
    playStatus: input.playStatus,
    confidence: input.confidence,
    sampleSize: input.sampleSize,
    factors: input.factors ?? [],
    awayPitcher: input.awayPitcher ?? null,
    homePitcher: input.homePitcher ?? null,
    v4: input.v4 ?? null,
  };
  await connection.query(`
    INSERT INTO mlb_prediction_context
      (id,prediction_date,game_id,model_version,game_start_at,captured_at,context)
    VALUES($1,$2,$3,$4,$5,now(),$6::jsonb)
    ON CONFLICT(prediction_date,game_id,model_version) DO NOTHING
  `, [id, input.date, input.gameId, input.modelVersion, start, JSON.stringify(context)]);
}

export async function getMlbDecisionContextCoverage(days = 30): Promise<{ snapshots: number; contexts: number; coverage: number | null }> {
  const connection = db();
  if (!connection) return { snapshots: 0, contexts: 0, coverage: null };
  await ensure();
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const result = await connection.query<{ snapshots: string; contexts: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE s.locked_at IS NOT NULL)::text AS snapshots,
      COUNT(c.id)::text AS contexts
    FROM mlb_prediction_snapshots s
    LEFT JOIN mlb_prediction_context c
      ON c.prediction_date=s.prediction_date AND c.game_id=s.game_id AND c.model_version=s.model_version
    WHERE s.prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
  `, [safeDays]);
  const snapshots = Number(result.rows[0]?.snapshots ?? 0);
  const contexts = Number(result.rows[0]?.contexts ?? 0);
  return { snapshots, contexts, coverage: snapshots ? contexts / snapshots : null };
}
