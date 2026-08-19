import type { V4Prediction } from "./mlbNrfiV4.js";
import { recordV4Shadow } from "./mlbV4Evaluation.js";

export type NrfiShadowRecord = {
  gameId: string;
  createdAt: string;
  v3Probability: number;
  v4: V4Prediction;
  outcome?: "NRFI" | "YRFI";
};

const records = new Map<string, NrfiShadowRecord>();

export function recordNrfiShadowPrediction(record: NrfiShadowRecord): void {
  const predictionDate = record.createdAt.slice(0, 10);
  const key = `${record.gameId}:${predictionDate}`;
  records.set(key, record);

  // Keep the fast in-memory diagnostic, but also persist the first V3/V4
  // probabilities so evaluation survives deploys and process restarts. The
  // database writer is idempotent and only adds the outcome on later refreshes.
  void recordV4Shadow({
    date: predictionDate,
    gameId: record.gameId,
    v3Probability: record.v3Probability,
    v4Probability: record.v4.uncertaintyAdjustedNrfiProbability,
    uncertaintyScore: record.v4.uncertainty.score,
    uncertaintyLabel: record.v4.uncertainty.label,
    outcome: record.outcome,
  }).catch(error => console.warn("[MLB V4] Persistent shadow record failed:", error));
}

export function getNrfiShadowRecords(): NrfiShadowRecord[] {
  return [...records.values()];
}

export function scoreBrier(records: NrfiShadowRecord[], version: "v3" | "v4"): number | null {
  const settled = records.filter(r => r.outcome);
  if (!settled.length) return null;
  const total = settled.reduce((sum, record) => {
    const actual = record.outcome === "NRFI" ? 1 : 0;
    const probability = version === "v3" ? record.v3Probability : record.v4.uncertaintyAdjustedNrfiProbability;
    return sum + Math.pow(probability - actual, 2);
  }, 0);
  return total / settled.length;
}
