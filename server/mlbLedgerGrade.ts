import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;
function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/**
 * Grades only an already-locked prediction. If no verified pregame lock exists,
 * this is intentionally a no-op so a completed game can never create its own
 * historical prediction after the outcome is known.
 */
export async function gradeExistingLockedPrediction(input: {
  date: string;
  gameId: string;
  modelVersion: string;
  outcome: "NRFI" | "YRFI";
  firstInningScore: string;
}): Promise<boolean> {
  const connection = db();
  if (!connection) return false;
  const result = await connection.query(`
    UPDATE mlb_prediction_snapshots
       SET outcome = $1::text,
           first_inning_score = $2::text,
           graded_at = COALESCE(graded_at, now())
     WHERE prediction_date = $3::text
       AND game_id = $4::text
       AND model_version = $5::text
       AND locked_at IS NOT NULL
  `, [input.outcome, input.firstInningScore, input.date, input.gameId, input.modelVersion]);
  return (result.rowCount ?? 0) > 0;
}
