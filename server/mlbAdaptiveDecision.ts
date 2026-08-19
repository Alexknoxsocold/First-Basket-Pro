import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export type MlbAdaptiveDecisionPolicy = {
  nrfiLeanThreshold: number;
  yrfiLeanThreshold: number;
  defaultLeanThreshold: number;
  sampleRequirement: number;
  generatedAt: string;
  evidence: Array<{
    side: "NRFI" | "YRFI";
    sampleSize: number;
    correct: number;
    hitRate: number | null;
    averagePredicted: number | null;
    calibrationGap: number | null;
    activated: boolean;
  }>;
};

const DEFAULT_LEAN_THRESHOLD = 0.035;
const ADAPTIVE_LEAN_THRESHOLD = 0.030;
const MIN_SAMPLE = 30;
const MIN_HIT_RATE = 0.55;
const MIN_POSITIVE_GAP = 0.02;
const CACHE_MS = 15 * 60 * 1000;

let pool: Pool | null = null;
let cache: { expiresAt: number; value: MlbAdaptiveDecisionPolicy } | null = null;

function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

function emptyPolicy(): MlbAdaptiveDecisionPolicy {
  return {
    nrfiLeanThreshold: DEFAULT_LEAN_THRESHOLD,
    yrfiLeanThreshold: DEFAULT_LEAN_THRESHOLD,
    defaultLeanThreshold: DEFAULT_LEAN_THRESHOLD,
    sampleRequirement: MIN_SAMPLE,
    generatedAt: new Date().toISOString(),
    evidence: ["NRFI", "YRFI"].map(side => ({
      side: side as "NRFI" | "YRFI",
      sampleSize: 0,
      correct: 0,
      hitRate: null,
      averagePredicted: null,
      calibrationGap: null,
      activated: false,
    })),
  };
}

/**
 * Learns only from V4-live calls that were explicitly NO_PLAY at lock time.
 * A side must accumulate a meaningful sample in the 53-56% recommendation
 * band and outperform its own average predicted probability before the model
 * is allowed to lower the LEAN gate by half a percentage point of probability
 * separation. This never lowers the PLAY or BEST_PLAY gates.
 */
export async function getMlbAdaptiveDecisionPolicy(days = 90): Promise<MlbAdaptiveDecisionPolicy> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const connection = db();
  if (!connection) return emptyPolicy();

  const safeDays = Math.min(Math.max(Math.round(days), 30), 180);
  try {
    const result = await connection.query<{
      side: "NRFI" | "YRFI";
      sampleSize: string;
      correct: string;
      averagePredicted: string | null;
    }>(`
      SELECT s.recommendation AS side,
             COUNT(*)::text AS "sampleSize",
             COUNT(*) FILTER (WHERE s.outcome = s.recommendation)::text AS correct,
             AVG(s.probability)::text AS "averagePredicted"
        FROM mlb_prediction_snapshots s
        JOIN mlb_prediction_context c
          ON c.prediction_date = s.prediction_date
         AND c.game_id = s.game_id
         AND c.model_version = s.model_version
       WHERE s.prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
         AND s.model_version = 'v4-live'
         AND s.locked_at IS NOT NULL
         AND s.outcome IN ('NRFI','YRFI')
         AND s.recommendation IN ('NRFI','YRFI')
         AND c.context->>'playStatus' = 'NO_PLAY'
         AND s.probability >= 0.53
         AND s.probability < 0.56
       GROUP BY s.recommendation
    `, [safeDays]);

    const evidence = (["NRFI", "YRFI"] as const).map(side => {
      const row = result.rows.find(item => item.side === side);
      const sampleSize = Number(row?.sampleSize ?? 0);
      const correct = Number(row?.correct ?? 0);
      const averagePredicted = row?.averagePredicted == null ? null : Number(row.averagePredicted);
      const hitRate = sampleSize ? correct / sampleSize : null;
      const calibrationGap = hitRate !== null && averagePredicted !== null ? hitRate - averagePredicted : null;
      const activated = sampleSize >= MIN_SAMPLE && hitRate !== null && hitRate >= MIN_HIT_RATE && calibrationGap !== null && calibrationGap >= MIN_POSITIVE_GAP;
      return { side, sampleSize, correct, hitRate, averagePredicted, calibrationGap, activated };
    });

    const nrfi = evidence.find(item => item.side === "NRFI")!;
    const yrfi = evidence.find(item => item.side === "YRFI")!;
    const value: MlbAdaptiveDecisionPolicy = {
      nrfiLeanThreshold: nrfi.activated ? ADAPTIVE_LEAN_THRESHOLD : DEFAULT_LEAN_THRESHOLD,
      yrfiLeanThreshold: yrfi.activated ? ADAPTIVE_LEAN_THRESHOLD : DEFAULT_LEAN_THRESHOLD,
      defaultLeanThreshold: DEFAULT_LEAN_THRESHOLD,
      sampleRequirement: MIN_SAMPLE,
      generatedAt: new Date().toISOString(),
      evidence,
    };
    cache = { expiresAt: Date.now() + CACHE_MS, value };
    return value;
  } catch (error) {
    console.warn("[MLB Adaptive Decision] Learning evidence unavailable; using conservative default gates:", error);
    const value = emptyPolicy();
    cache = { expiresAt: Date.now() + 60_000, value };
    return value;
  }
}
