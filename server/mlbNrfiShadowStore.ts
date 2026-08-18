import type { V4Prediction } from "./mlbNrfiV4.js";

export type NrfiShadowRecord = {
  gameId: string;
  createdAt: string;
  v3Probability: number;
  v4: V4Prediction;
  outcome?: "NRFI" | "YRFI";
};

const records = new Map<string, NrfiShadowRecord>();

export function recordNrfiShadowPrediction(record: NrfiShadowRecord): void {
  const key = `${record.gameId}:${record.createdAt.slice(0, 10)}`;
  records.set(key, record);
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
