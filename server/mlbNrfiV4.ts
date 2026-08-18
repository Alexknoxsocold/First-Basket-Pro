// Shadow-model scaffolding for MLB NRFI/YRFI V4.
// This module is intentionally independent from the live V3 recommendation path.

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

export function calculateV4Uncertainty(data: V4DataQuality): V4Uncertainty {
  let score = 1;
  const penalties: string[] = [];

  if (!data.lineupConfirmed) { score -= 0.18; penalties.push("lineup unconfirmed"); }
  if (!data.pitcherConfirmed) { score -= 0.25; penalties.push("starter unconfirmed"); }
  if (!data.pitcherMetricsComplete) { score -= 0.12; penalties.push("pitcher metrics incomplete"); }
  if (data.sampleSize < 5) { score -= 0.18; penalties.push("very small sample"); }
  else if (data.sampleSize < 10) { score -= 0.08; penalties.push("limited sample"); }
  if (!data.weatherAvailable) { score -= 0.04; penalties.push("environment data unavailable"); }

  score = clamp(score, 0.2, 1);
  return { score, label: score >= 0.8 ? "High" : score >= 0.6 ? "Medium" : "Low", penalties };
}

export function predictNrfiV4(input: V4PredictionInput): V4Prediction {
  const raw = clamp(
    input.leagueNrfiProbability * 0.25 +
    input.teamNrfiProbability * 0.55 +
    0.5 * 0.20 +
    input.pitcherAdjustment +
    (input.lineupAdjustment ?? 0) +
    (input.parkAdjustment ?? 0) +
    (input.weatherAdjustment ?? 0),
    0.25,
    0.75,
  );

  const uncertainty = calculateV4Uncertainty(input.dataQuality);
  const adjusted = clamp(0.5 + (raw - 0.5) * uncertainty.score, 0.30, 0.70);

  return {
    rawNrfiProbability: raw,
    uncertaintyAdjustedNrfiProbability: adjusted,
    uncertainty,
    version: "v4-shadow",
  };
}
