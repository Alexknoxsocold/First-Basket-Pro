export type GradedMlbPrediction = {
  probability: number;
  outcome: "NRFI" | "YRFI";
  recommendation: "NRFI" | "YRFI" | "NO_PLAY";
  playStatus?: "BEST_PLAY" | "PLAY" | "LEAN" | "NO_PLAY";
  modelVersion: string;
  marketEdge?: number | null;
  ev?: number | null;
};

export type MlbPerformanceReport = {
  predictions: number;
  graded: number;
  wins: number;
  losses: number;
  winRate: number | null;
  brierScore: number | null;
  logLoss: number | null;
  calibration: Array<{ bucket: string; count: number; predicted: number; actual: number }>;
  qualified: {
    predictions: number;
    wins: number;
    winRate: number | null;
    roi: number | null;
  };
};

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }

/**
 * Calculates historical model performance from immutable graded predictions.
 * Probability is expected on a 0..1 scale and represents the probability of
 * the recommendation's side winning.
 */
export function buildMlbPerformanceReport(predictions: GradedMlbPrediction[]): MlbPerformanceReport {
  const graded = predictions.filter(p => p.outcome === "NRFI" || p.outcome === "YRFI");
  const wins = graded.filter(p => p.recommendation === p.outcome).length;
  const losses = graded.length - wins;
  const brierValues: number[] = [];
  const logLossValues: number[] = [];
  const buckets = new Map<number, { count: number; predicted: number; actual: number }>();

  for (const prediction of graded) {
    const p = clamp(prediction.probability, 0.001, 0.999);
    const actual = prediction.recommendation === prediction.outcome ? 1 : 0;
    brierValues.push((p - actual) ** 2);
    logLossValues.push(-(actual * Math.log(p) + (1 - actual) * Math.log(1 - p)));
    const bucket = Math.min(9, Math.max(0, Math.floor(p * 10)));
    const current = buckets.get(bucket) ?? { count: 0, predicted: 0, actual: 0 };
    current.count += 1;
    current.predicted += p;
    current.actual += actual;
    buckets.set(bucket, current);
  }

  const qualified = graded.filter(p => p.playStatus === "BEST_PLAY" || p.playStatus === "PLAY");
  const qualifiedWins = qualified.filter(p => p.recommendation === p.outcome).length;
  const betsWithEv = qualified.filter(p => typeof p.ev === "number");
  const roi = betsWithEv.length
    ? betsWithEv.reduce((sum, p) => sum + (p.recommendation === p.outcome ? Number(p.ev) : -1), 0) / betsWithEv.length
    : null;

  return {
    predictions: predictions.length,
    graded: graded.length,
    wins,
    losses,
    winRate: graded.length ? wins / graded.length : null,
    brierScore: brierValues.length ? brierValues.reduce((a, b) => a + b, 0) / brierValues.length : null,
    logLoss: logLossValues.length ? logLossValues.reduce((a, b) => a + b, 0) / logLossValues.length : null,
    calibration: Array.from(buckets.entries()).sort(([a], [b]) => a - b).map(([bucket, value]) => ({
      bucket: `${bucket * 10}-${bucket * 10 + 10}%`,
      count: value.count,
      predicted: value.predicted / value.count,
      actual: value.actual / value.count,
    })),
    qualified: {
      predictions: qualified.length,
      wins: qualifiedWins,
      winRate: qualified.length ? qualifiedWins / qualified.length : null,
      roi,
    },
  };
}
