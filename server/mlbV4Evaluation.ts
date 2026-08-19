import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export type V4EvaluationSummary = {
  gradedPredictions: number;
  v3Brier: number | null;
  v4Brier: number | null;
  v3LogLoss: number | null;
  v4LogLoss: number | null;
  winner: "v3" | "v4" | "tie" | "insufficient_data";
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
    CREATE TABLE IF NOT EXISTS mlb_v4_shadow_history (
      id varchar(128) PRIMARY KEY,
      prediction_date text NOT NULL,
      game_id text NOT NULL,
      v3_probability real NOT NULL,
      v4_probability real NOT NULL,
      uncertainty_score real NOT NULL,
      uncertainty_label text NOT NULL,
      outcome text,
      first_inning_score text,
      predicted_at timestamp NOT NULL DEFAULT now(),
      graded_at timestamp,
      UNIQUE(prediction_date, game_id)
    );
    CREATE INDEX IF NOT EXISTS mlb_v4_shadow_date_idx ON mlb_v4_shadow_history(prediction_date);
    CREATE INDEX IF NOT EXISTS mlb_v4_shadow_game_idx ON mlb_v4_shadow_history(game_id);
  `).then(() => undefined).catch(error => { ready = null; throw error; });
  return ready;
}

export async function recordV4Shadow(data: { date: string; gameId: string; v3Probability: number; v4Probability: number; uncertaintyScore: number; uncertaintyLabel: string; outcome?: "NRFI" | "YRFI"; firstInningScore?: string | null }): Promise<void> {
  const connection = db();
  if (!connection) return;
  await ensure();

  // A settled game is allowed to grade a prediction that already existed
  // pregame, but can never create a retrospective shadow prediction.
  if (data.outcome) {
    await connection.query(`
      UPDATE mlb_v4_shadow_history
         SET outcome=COALESCE(outcome,$2),
             first_inning_score=COALESCE(first_inning_score,$3),
             graded_at=COALESCE(graded_at,now())
       WHERE game_id=$1 AND outcome IS NULL
    `, [data.gameId, data.outcome, data.firstInningScore ?? null]);
    return;
  }

  await connection.query(`
    INSERT INTO mlb_v4_shadow_history
      (id,prediction_date,game_id,v3_probability,v4_probability,uncertainty_score,uncertainty_label,outcome,first_inning_score,predicted_at,graded_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,NULL,NULL,now(),NULL)
    ON CONFLICT(prediction_date,game_id) DO NOTHING
  `, [`${data.date}:${data.gameId}`,data.date,data.gameId,data.v3Probability,data.v4Probability,data.uncertaintyScore,data.uncertaintyLabel]);
}

export async function getV4Evaluation(days = 90): Promise<V4EvaluationSummary> {
  const connection = db(); if (!connection) return { gradedPredictions: 0, v3Brier: null, v4Brier: null, v3LogLoss: null, v4LogLoss: null, winner: "insufficient_data" };
  await ensure();
  const result = await connection.query<{ n:string; v3_brier:string|null; v4_brier:string|null; v3_logloss:string|null; v4_logloss:string|null }>(`SELECT COUNT(*)::text n,
    AVG(POWER(v3_probability - CASE WHEN outcome='NRFI' THEN 1 ELSE 0 END,2))::text v3_brier,
    AVG(POWER(v4_probability - CASE WHEN outcome='NRFI' THEN 1 ELSE 0 END,2))::text v4_brier,
    AVG(-(CASE WHEN outcome='NRFI' THEN LN(GREATEST(0.001,LEAST(0.999,v3_probability))) ELSE LN(GREATEST(0.001,LEAST(0.999,1-v3_probability))) END))::text v3_logloss,
    AVG(-(CASE WHEN outcome='NRFI' THEN LN(GREATEST(0.001,LEAST(0.999,v4_probability))) ELSE LN(GREATEST(0.001,LEAST(0.999,1-v4_probability))) END))::text v4_logloss
    FROM mlb_v4_shadow_history WHERE outcome IN ('NRFI','YRFI') AND prediction_date >= to_char(current_date - ($1::int - 1),'YYYY-MM-DD')`, [Math.min(Math.max(Math.round(days),1),180)]);
  const row = result.rows[0]; const n = Number(row?.n ?? 0); const v3Brier = row?.v3_brier === null ? null : Number(row.v3_brier); const v4Brier = row?.v4_brier === null ? null : Number(row.v4_brier); const v3LogLoss = row?.v3_logloss === null ? null : Number(row.v3_logloss); const v4LogLoss = row?.v4_logloss === null ? null : Number(row.v4_logloss);
  const winner: V4EvaluationSummary["winner"] = n < 50 || v3Brier === null || v4Brier === null || v3LogLoss === null || v4LogLoss === null ? "insufficient_data" : (v4Brier < v3Brier && v4LogLoss < v3LogLoss ? "v4" : v3Brier < v4Brier && v3LogLoss < v4LogLoss ? "v3" : "tie");
  return { gradedPredictions:n,v3Brier,v4Brier,v3LogLoss,v4LogLoss,winner };
}
