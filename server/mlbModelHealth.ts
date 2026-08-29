export type MlbModelHealthInput = {
  predictionCount: number;
  gradedCount: number;
  brierScore: number | null;
  logLoss: number | null;
  ece: number | null;
  marketQuoteCount: number;
  staleMarketQuoteCount: number;
  lineupConfirmedCount: number;
  pitcherConfirmedCount: number;
  missingPitcherMetricCount: number;
};

export type MlbModelHealth = {
  status: "HEALTHY" | "WATCH" | "DEGRADED";
  score: number;
  reasons: string[];
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Operational trust monitor. This does not alter predictions; it tells the UI
 * and operators whether the data supporting them is healthy enough to trust.
 */
export function evaluateMlbModelHealth(input: MlbModelHealthInput): MlbModelHealth {
  const reasons: string[] = [];
  let score = 100;

  if (input.predictionCount === 0) {
    score -= 35;
    reasons.push("No predictions have been recorded yet.");
  }
  if (input.predictionCount > 0 && input.gradedCount / input.predictionCount < 0.50) {
    score -= 10;
    reasons.push("Most recent predictions have not been graded yet.");
  }
  if (input.ece !== null && input.ece > 0.08) {
    score -= 20;
    reasons.push("Probability calibration is outside the preferred range.");
  }
  if (input.brierScore !== null && input.brierScore > 0.25) {
    score -= 15;
    reasons.push("Brier score is elevated.");
  }
  if (input.logLoss !== null && input.logLoss > 0.69) {
    score -= 15;
    reasons.push("Log loss is elevated.");
  }

  // Older callers did not yet attach lineup/pitcher coverage telemetry and
  // passed all three counters as zero. Treat that exact combination as unknown
  // rather than incorrectly grading the model as if every lineup/starter failed.
  const qualityCoverageUnknown = input.predictionCount > 0 &&
    input.lineupConfirmedCount === 0 &&
    input.pitcherConfirmedCount === 0 &&
    input.missingPitcherMetricCount === 0;

  if (qualityCoverageUnknown) {
    score -= 5;
    reasons.push("Lineup and pitcher coverage telemetry is not attached to this health sample yet.");
  } else {
    if (input.predictionCount > 0 && input.lineupConfirmedCount / input.predictionCount < 0.50) {
      score -= 10;
      reasons.push("Lineup confirmation coverage is low.");
    }
    if (input.predictionCount > 0 && input.pitcherConfirmedCount / input.predictionCount < 0.90) {
      score -= 10;
      reasons.push("Starting-pitcher confirmation coverage is below target.");
    }
    if (input.predictionCount > 0 && input.missingPitcherMetricCount / input.predictionCount > 0.50) {
      score -= 10;
      reasons.push("Pitcher metric coverage is incomplete.");
    }
  }

  if (input.marketQuoteCount > 0 && input.staleMarketQuoteCount / input.marketQuoteCount > 0.25) {
    score -= 10;
    reasons.push("Too many collected market quotes are stale.");
  }

  score = Math.round(clamp(score, 0, 100));
  const status: MlbModelHealth["status"] = score >= 80 ? "HEALTHY" : score >= 60 ? "WATCH" : "DEGRADED";
  if (!reasons.length) reasons.push("Prediction, calibration, lineup, pitcher and market data are within operating targets.");
  return { status, score, reasons };
}
