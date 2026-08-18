import { calibrateRecommendedProbability } from "./mlbCalibration.js";
import { fetchNrfiData, type NrfiGame, type NrfiResponse, type NrfiWindowResponse } from "./mlbNrfi.js";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type PlayStatus = NrfiGame["playStatus"];

function classifyLivePlay(probability: number, confidence: NrfiGame["confidence"], sampleSize: number): PlayStatus {
  const edge = Math.abs(probability - 0.5);
  if (sampleSize < 3 || confidence === "Low") return edge >= 0.055 && sampleSize >= 3 ? "LEAN" : "NO_PLAY";
  if (edge >= 0.10 && confidence === "High" && sampleSize >= 10) return "BEST_PLAY";
  if (edge >= 0.06 && confidence !== "Low" && sampleSize >= 5) return "PLAY";
  if (edge >= 0.03) return "LEAN";
  return "NO_PLAY";
}

function applyLiveV4(game: NrfiGame): NrfiGame {
  const v4 = game.v4Shadow;
  if (!v4) return game;

  // Blend the already-calibrated legacy estimate with V4 instead of replacing
  // the proven path in one jump. The blend increases only when V4 data quality
  // is strong, then calibration remains the final probability guardrail.
  const v3 = game.nrfiProbability / 100;
  const quality = v4.uncertainty.score;
  const v4Weight = clamp(0.20 + quality * 0.35, 0.20, 0.55);
  const blended = v3 * (1 - v4Weight) + v4.uncertaintyAdjustedNrfiProbability * v4Weight;

  // Keep synchronous game transformation deterministic. The response is then
  // calibrated in the async batch below before it reaches the client.
  const provisional = clamp(blended, 0.35, 0.65);
  const nrfiProbability = Math.round(provisional * 1000) / 10;
  const recommendation: NrfiGame["recommendation"] = nrfiProbability >= 50 ? "NRFI" : "YRFI";
  const modelEdge = Math.round(Math.abs(nrfiProbability - 50) * 10) / 10;
  const confidence: NrfiGame["confidence"] = v4.uncertainty.label === "Low" ? "Low" : game.confidence;
  const playStatus = classifyLivePlay(nrfiProbability / 100, confidence, game.sampleSize);

  const factors = [
    ...(game.factors ?? []).filter(f => !f.startsWith("Model v4 live")),
    `Model v4 live: ${(v4Weight * 100).toFixed(0)}% V4 blend, ${(quality * 100).toFixed(0)}% data-quality score${v4.uncertainty.penalties.length ? ` (${v4.uncertainty.penalties.join(", ")})` : ""}`,
  ];

  return { ...game, nrfiProbability, recommendation, modelEdge, confidence, playStatus, factors };
}

async function calibrateGame(game: NrfiGame): Promise<NrfiGame> {
  const transformed = applyLiveV4(game);
  const calibrated = clamp(await calibrateRecommendedProbability(transformed.nrfiProbability / 100), 0.35, 0.65);
  const nrfiProbability = Math.round(calibrated * 1000) / 10;
  const recommendation: NrfiGame["recommendation"] = nrfiProbability >= 50 ? "NRFI" : "YRFI";
  const modelEdge = Math.round(Math.abs(nrfiProbability - 50) * 10) / 10;
  const playStatus = classifyLivePlay(nrfiProbability / 100, transformed.confidence, transformed.sampleSize);
  return { ...transformed, nrfiProbability, recommendation, modelEdge, playStatus };
}

function rankTopPick(games: NrfiGame[]): NrfiGame | null {
  return [...games]
    .filter(game => game.playStatus === "BEST_PLAY" || game.playStatus === "PLAY")
    .sort((a, b) => b.modelEdge - a.modelEdge || (b.confidence === "High" ? 1 : 0) - (a.confidence === "High" ? 1 : 0))[0] ?? null;
}

export async function fetchNrfiDataV4Live(date?: string): Promise<NrfiResponse> {
  const base = await fetchNrfiData(date);
  const games = await Promise.all(base.games.map(calibrateGame));
  return {
    ...base,
    games,
    averageNrfiProbability: games.length ? Math.round(games.reduce((sum, game) => sum + game.nrfiProbability, 0) / games.length * 10) / 10 : null,
    topPick: rankTopPick(games),
    methodology: "V4 live blend: calibrated V3 baseline + uncertainty-adjusted V4 first-inning signal. V4 influence scales with data quality, weak inputs shrink toward neutral, and walk-forward calibration remains the final probability guardrail.",
  };
}

export async function fetchUpcomingNrfiDataV4Live(days = 3): Promise<NrfiWindowResponse> {
  const safeDays = Math.min(Math.max(days, 1), 3);
  const dates = Array.from({ length: safeDays }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const responses = await Promise.all(dates.map(date => fetchNrfiDataV4Live(date)));
  const games = responses.flatMap(response => response.games);
  return {
    startDate: responses[0]?.date ?? dates[0],
    endDate: responses[responses.length - 1]?.date ?? dates[dates.length - 1],
    days: responses,
    games,
    averageNrfiProbability: games.length ? Math.round(games.reduce((sum, game) => sum + game.nrfiProbability, 0) / games.length * 10) / 10 : null,
    topPick: rankTopPick(games),
    updatedAt: new Date().toISOString(),
  };
}
