// MLB NRFI/YRFI V4 scoring primitives.
// V4 keeps the league prior as an anchor, then layers first-inning team context,
// pitcher quality, and data-quality-aware shrinkage around it.

export type V4DataQuality = {
  lineupConfirmed: boolean;
  pitcherConfirmed: boolean;
  pitcherMetricsComplete: boolean;
  sampleSize: number;
  weatherAvailable: boolean;
};

export type V4Uncertainty = {
  score: number;
  label: "High" | "Medium" | "Low";
  penalties: string[];
};

export type V4PitcherMetrics = {
  era: number | null;
  whip: number | null;
  strikeoutPct: number | null;
  walkPct: number | null;
  firstInningRunsAllowedRate: number | null;
};

export type V4PredictionInput = {
  leagueNrfiProbability: number;
  teamNrfiProbability: number;
  pitcherAdjustment: number;
  pitcherMetrics?: V4PitcherMetrics[];
  lineupAdjustment?: number;
  parkAdjustment?: number;
  weatherAdjustment?: number;
  dataQuality: V4DataQuality;
};

export type V4Prediction = {
  rawNrfiProbability: number;
  uncertaintyAdjustedNrfiProbability: number;
  uncertainty: V4Uncertainty;
  version: "v4-shadow";
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function calculateV4Uncertainty(data: V4DataQuality): V4Uncertainty {
  let score = 1;
  const penalties: string[] = [];
  if (!data.lineupConfirmed) { score -= 0.14; penalties.push("lineup unconfirmed"); }
  if (!data.pitcherConfirmed) { score -= 0.24; penalties.push("starter unconfirmed"); }
  if (!data.pitcherMetricsComplete) { score -= 0.10; penalties.push("pitcher metrics incomplete"); }
  if (data.sampleSize < 3) { score -= 0.22; penalties.push("extremely small sample"); }
  else if (data.sampleSize < 5) { score -= 0.14; penalties.push("small sample"); }
  else if (data.sampleSize < 10) { score -= 0.07; penalties.push("limited sample"); }
  if (!data.weatherAvailable) { score -= 0.03; penalties.push("environment data unavailable"); }
  score = clamp(score, 0.25, 1);
  return { score, label: score >= 0.82 ? "High" : score >= 0.62 ? "Medium" : "Low", penalties };
}

export function calculatePitcherQualityAdjustment(metrics: V4PitcherMetrics[]): number {
  const usable = metrics.filter(metric =>
    metric.era !== null || metric.whip !== null || metric.strikeoutPct !== null ||
    metric.walkPct !== null || metric.firstInningRunsAllowedRate !== null,
  );
  if (!usable.length) return 0;

  const averageK = average(usable.flatMap(metric => metric.strikeoutPct === null ? [] : [metric.strikeoutPct]));
  const averageBB = average(usable.flatMap(metric => metric.walkPct === null ? [] : [metric.walkPct]));
  const averageEra = average(usable.flatMap(metric => metric.era === null ? [] : [metric.era]));
  const averageWhip = average(usable.flatMap(metric => metric.whip === null ? [] : [metric.whip]));
  const averageFirstInningRuns = average(usable.flatMap(metric => metric.firstInningRunsAllowedRate === null ? [] : [metric.firstInningRunsAllowedRate]));

  // First-inning performance gets the strongest pitcher weight because it is
  // directly aligned with the market. Season ERA is useful, but deliberately
  // cannot dominate the estimate by itself.
  let adjustment = 0;
  if (averageFirstInningRuns !== null) adjustment += clamp((0.50 - averageFirstInningRuns) * 0.055, -0.018, 0.018);
  if (averageWhip !== null) adjustment += clamp((1.28 - averageWhip) * 0.030, -0.012, 0.012);
  if (averageK !== null) adjustment += clamp((averageK - 0.22) * 0.090, -0.010, 0.010);
  if (averageBB !== null) adjustment += clamp((0.08 - averageBB) * 0.110, -0.012, 0.012);
  if (averageEra !== null) adjustment += clamp((4.15 - averageEra) * 0.0020, -0.007, 0.007);

  return clamp(adjustment, -0.035, 0.035);
}

export function predictNrfiV4(input: V4PredictionInput): V4Prediction {
  const league = clamp(input.leagueNrfiProbability, 0.30, 0.70);
  const team = clamp(input.teamNrfiProbability, 0.30, 0.70);
  const sampleStrength = clamp(input.dataQuality.sampleSize / (input.dataQuality.sampleSize + 8), 0.15, 0.70);
  const teamWeight = 0.28 + sampleStrength * 0.30;
  const leagueWeight = 1 - teamWeight;
  const base = league * leagueWeight + team * teamWeight;
  const pitcherQualityAdjustment = calculatePitcherQualityAdjustment(input.pitcherMetrics ?? []);

  const raw = clamp(
    base +
    clamp(input.pitcherAdjustment, -0.04, 0.04) +
    pitcherQualityAdjustment +
    clamp(input.lineupAdjustment ?? 0, -0.025, 0.025) +
    clamp(input.parkAdjustment ?? 0, -0.015, 0.015) +
    clamp(input.weatherAdjustment ?? 0, -0.015, 0.015),
    0.30,
    0.70,
  );

  const uncertainty = calculateV4Uncertainty(input.dataQuality);
  // Missing/weak information shrinks confidence toward the neutral 50% prior
  // instead of manufacturing a stronger signal from incomplete data.
  const adjusted = clamp(0.5 + (raw - 0.5) * uncertainty.score, 0.35, 0.65);
  return { rawNrfiProbability: raw, uncertaintyAdjustedNrfiProbability: adjusted, uncertainty, version: "v4-shadow" };
}
