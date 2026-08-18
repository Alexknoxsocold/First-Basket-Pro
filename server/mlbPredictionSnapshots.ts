import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export type MlbPredictionSnapshot = {
  date: string;
  gameId: string;
  matchup: string;
  recommendation: "NRFI" | "YRFI" | "NO_PLAY";
  probability: number;
  confidence?: string | null;
  modelVersion: string;
  lockedAt?: Date | null;
  outcome?: "NRFI" | "YRFI" | null;
  firstInningScore?: string | null;
};

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
      created_at timestamp NOT NULL DEFAULT now(),
      graded_at timestamp,
      UNIQUE(prediction_date, game_id, model_version)
    );
    CREATE INDEX IF NOT EXISTS mlb_prediction_snapshots_date_idx
      ON mlb_prediction_snapshots(prediction_date DESC);
  `).then(() => undefined).catch(error => { ready = null; throw error; });
  return ready;
}

export async function snapshotPrediction(data: MlbPredictionSnapshot): Promise<void> {
  const connection = db();
  if (!connection) return;
  await ensure();
  const id = `${data.date}:${data.gameId}:${data.modelVersion}`;
  await connection.query(`
    INSERT INTO mlb_prediction_snapshots
      (id,prediction_date,game_id,matchup,recommendation,probability,confidence,model_version,locked_at,outcome,first_inning_score,created_at,graded_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),CASE WHEN $10 IS NULL THEN NULL ELSE now() END)
    ON CONFLICT(prediction_date,game_id,model_version) DO UPDATE SET
      locked_at=COALESCE(mlb_prediction_snapshots.locked_at, EXCLUDED.locked_at),
      outcome=COALESCE(EXCLUDED.outcome, mlb_prediction_snapshots.outcome),
      first_inning_score=COALESCE(EXCLUDED.first_inning_score, mlb_prediction_snapshots.first_inning_score),
      graded_at=COALESCE(EXCLUDED.graded_at, mlb_prediction_snapshots.graded_at)
  `, [id,data.date,data.gameId,data.matchup,data.recommendation,data.probability,data.confidence ?? null,data.modelVersion,data.lockedAt ?? null,data.outcome ?? null,data.firstInningScore ?? null]);
}

export async function getPredictionHistory(days = 30): Promise<MlbPredictionSnapshot[]> {
  const connection = db();
  if (!connection) return [];
  await ensure();
  const result = await connection.query(`
    SELECT prediction_date,game_id,matchup,recommendation,probability,confidence,model_version,locked_at,outcome,first_inning_score
    FROM mlb_prediction_snapshots
    WHERE prediction_date >= to_char(current_date - ($1::int - 1),'YYYY-MM-DD')
    ORDER BY prediction_date DESC, locked_at DESC NULLS LAST, created_at DESC
  `, [Math.min(Math.max(Math.round(days),1),365)]);
  return result.rows.map(row => ({
    date: row.prediction_date,
    gameId: row.game_id,
    matchup: row.matchup,
    recommendation: row.recommendation,
    probability: Number(row.probability),
    confidence: row.confidence,
    modelVersion: row.model_version,
    lockedAt: row.locked_at,
    outcome: row.outcome,
    firstInningScore: row.first_inning_score,
  }));
}
