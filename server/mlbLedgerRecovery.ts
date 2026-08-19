import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;
function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export type MlbLedgerRecoveryResult = {
  checkedDays: number;
  recovered: number;
};

/**
 * Promotes an existing V4-live draft to a verified lock only when the database
 * itself proves the prediction row existed before first pitch. The prediction
 * payload is never changed: locked_at becomes the immutable row's original
 * created_at timestamp. Rows first observed after game start remain unverified.
 */
export async function recoverVerifiablePregameDraftLocks(days = 30): Promise<MlbLedgerRecoveryResult> {
  const connection = db();
  const safeDays = Math.min(Math.max(Math.round(days), 1), 90);
  if (!connection) return { checkedDays: safeDays, recovered: 0 };

  const result = await connection.query(`
    UPDATE mlb_prediction_snapshots
       SET locked_at = created_at
     WHERE locked_at IS NULL
       AND model_version = 'v4-live'
       AND prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
       AND game_start_at IS NOT NULL
       AND created_at IS NOT NULL
       AND created_at <= game_start_at
       AND created_at <= now()
       AND (market_captured_at IS NULL OR market_captured_at <= created_at)
  `, [safeDays]);

  return { checkedDays: safeDays, recovered: result.rowCount ?? 0 };
}
