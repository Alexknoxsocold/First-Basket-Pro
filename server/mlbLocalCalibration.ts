import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;
let cache = new Map<string, { expiresAt: number; value: number }>();

const MIN_SIDE_SAMPLE = 30;
const MIN_LOCAL_ROWS = 20;
const LOCAL_RADIUS = 0.04;
const PRIOR_STRENGTH = 30;
const CACHE_MS = 15 * 60 * 1000;

function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeProbability(value: number): number {
  return clamp(value, 0.001, 0.999);
}

function correctionCap(effectiveSample: number): number {
  if (effectiveSample >= 80) return 0.03;
  if (effectiveSample >= 40) return 0.02;
  return 0.01;
}

/**
 * Calibrates the recommendation-side probability from verified V4-live locks.
 *
 * Instead of a coarse 5-point bucket, this uses nearby historical predictions
 * within four probability points and gives closer observations more weight.
 * A Bayesian prior centered on the model's own probability prevents small
 * samples from swinging the live number. The correction cap grows only as the
 * effective verified sample grows.
 *
 * Until enough clean locked V4 evidence exists, this function is intentionally
 * a no-op so deployment cannot manufacture an immediate probability change.
 */
export async function calibrateLocalV4Probability(rawNrfiProbability: number): Promise<number> {
  if (!Number.isFinite(rawNrfiProbability)) return rawNrfiProbability;
  const connection = db();
  if (!connection) return rawNrfiProbability;

  const rawNrfi = safeProbability(rawNrfiProbability);
  const side: "NRFI" | "YRFI" = rawNrfi >= 0.5 ? "NRFI" : "YRFI";
  const sideProbability = side === "NRFI" ? rawNrfi : 1 - rawNrfi;
  if (sideProbability > 0.95) return rawNrfi;

  const cacheKey = `${side}:${Math.round(sideProbability * 1000)}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const total = await connection.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM mlb_prediction_snapshots
        WHERE model_version = 'v4-live'
          AND locked_at IS NOT NULL
          AND recommendation = $1
          AND outcome IN ('NRFI','YRFI')`,
      [side],
    );
    if (Number(total.rows[0]?.count ?? 0) < MIN_SIDE_SAMPLE) {
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, value: rawNrfi });
      return rawNrfi;
    }

    const lower = Math.max(0.5, sideProbability - LOCAL_RADIUS);
    const upper = Math.min(0.95, sideProbability + LOCAL_RADIUS);
    const rows = await connection.query<{ probability: number; won: boolean }>(
      `SELECT probability,
              (outcome = recommendation) AS won
         FROM mlb_prediction_snapshots
        WHERE model_version = 'v4-live'
          AND locked_at IS NOT NULL
          AND recommendation = $3
          AND outcome IN ('NRFI','YRFI')
          AND probability >= $1
          AND probability <= $2
        ORDER BY prediction_date DESC`,
      [lower, upper, side],
    );

    if (rows.rows.length < MIN_LOCAL_ROWS) {
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, value: rawNrfi });
      return rawNrfi;
    }

    let weightedWins = 0;
    let weightTotal = 0;
    for (const row of rows.rows) {
      const historical = Number(row.probability);
      if (!Number.isFinite(historical)) continue;
      const distance = Math.abs(historical - sideProbability);
      const weight = Math.max(0.10, 1 - distance / LOCAL_RADIUS);
      weightTotal += weight;
      if (row.won) weightedWins += weight;
    }

    if (weightTotal < 12) {
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, value: rawNrfi });
      return rawNrfi;
    }

    const posterior = (weightedWins + sideProbability * PRIOR_STRENGTH) / (weightTotal + PRIOR_STRENGTH);
    const cap = correctionCap(weightTotal);
    const correction = clamp(posterior - sideProbability, -cap, cap);
    const calibratedSide = clamp(sideProbability + correction, 0.5, 0.95);
    const calibratedNrfi = side === "NRFI" ? calibratedSide : 1 - calibratedSide;
    const value = Math.round(calibratedNrfi * 1000) / 1000;
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_MS, value });
    return value;
  } catch (error) {
    console.warn("[MLB Local Calibration] Verified calibration unavailable; using raw V4 probability:", error);
    return rawNrfi;
  }
}
