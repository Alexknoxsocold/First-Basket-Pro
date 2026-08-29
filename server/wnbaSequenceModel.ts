import {
  americanOddsToImpliedProbability,
  expectedValuePerDollar,
  modelEdgePoints,
  qualifiesAsMarketValue,
} from "./odds/normalized.js";
import type { WnbaCandidate, WnbaGame, WnbaSlate } from "./wnbaFirstBasket.js";

export type WnbaSequenceCandidate = WnbaCandidate & {
  baseProbability: number;
  sequenceProbability: number;
  sequenceAdjustment: number;
  projectedFirstPossessionPct: number | null;
  sequenceWeight: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function confidenceWeight(confidence: WnbaGame["tipSignal"]["confidence"]): number {
  if (confidence === "usable") return 0.25;
  if (confidence === "emerging") return 0.12;
  return 0;
}

function sequenceTarget(candidate: WnbaCandidate, possessionPct: number): number {
  const base = candidate.probability;
  const possessionMultiplier = 1 + clamp((possessionPct - 50) / 50, -0.7, 0.7) * 0.10;

  const openingRate = candidate.openingFirstShotRate;
  const openingMultiplier = openingRate === null
    ? 1
    : 1 + clamp((openingRate - 10) / 20, -0.5, 1) * 0.08;

  const finishingPct = candidate.openingShotFgPct ?? candidate.fgPct;
  const finishingMultiplier = Number.isFinite(finishingPct)
    ? 1 + clamp((finishingPct - 45) / 25, -0.5, 0.8) * 0.04
    : 1;

  return clamp(base * possessionMultiplier * openingMultiplier * finishingMultiplier, 1, 35);
}

function refreshMarket(candidate: WnbaSequenceCandidate): WnbaSequenceCandidate {
  const market = candidate.marketOdds;
  if (!market || !Number.isFinite(market.bestOdds)) return candidate;
  const bestOdds = market.bestOdds;
  const impliedProbability = americanOddsToImpliedProbability(bestOdds) * 100;
  const edgePoints = modelEdgePoints(candidate.probability, bestOdds);
  const expectedValue = expectedValuePerDollar(candidate.probability, bestOdds);
  return {
    ...candidate,
    marketOdds: {
      ...market,
      impliedProbability,
      edgePoints,
      expectedValue,
      qualifiesValue: candidate.rank <= 3 && qualifiesAsMarketValue(candidate.probability, bestOdds),
    },
  };
}

function applyToGame(game: WnbaGame): WnbaGame {
  if (!game.candidates.length) return game;
  const weight = confidenceWeight(game.tipSignal.confidence);
  if (weight <= 0 || game.tipSignal.awayTipPct === null || game.tipSignal.homeTipPct === null) return game;

  const candidates = game.candidates.map(candidate => {
    const possessionPct = candidate.team === game.awayTeam ? game.tipSignal.awayTipPct! : game.tipSignal.homeTipPct!;
    const target = sequenceTarget(candidate, possessionPct);
    const probability = Math.round(clamp(candidate.probability * (1 - weight) + target * weight, 1, 35) * 10) / 10;
    return {
      ...candidate,
      probability,
      baseProbability: candidate.probability,
      sequenceProbability: probability,
      sequenceAdjustment: Math.round((probability - candidate.probability) * 10) / 10,
      projectedFirstPossessionPct: Math.round(possessionPct * 10) / 10,
      sequenceWeight: weight,
    } satisfies WnbaSequenceCandidate;
  });

  candidates.sort((a, b) => b.probability - a.probability || b.avgFga - a.avgFga || b.avgMinutes - a.avgMinutes);
  const ranked = candidates.map((candidate, index) => refreshMarket({ ...candidate, rank: index + 1 }));
  return { ...game, candidates: ranked, topPick: ranked[0] ?? null };
}

/**
 * Adds a conservative possession-first layer only when verified tip evidence is
 * emerging or usable. The legacy player model remains the majority weight, so
 * a small WNBA sample cannot suddenly rewrite the board.
 */
export function applyWnbaSequenceModel(slate: WnbaSlate): WnbaSlate {
  const games = slate.games.map(applyToGame);
  return {
    ...slate,
    games,
    modelVersion: `${slate.modelVersion}+SEQ-V1`,
    source: `${slate.source} + conservative possession-first sequence weighting (tip win -> opening shot opportunity -> finishing)`,
  };
}
