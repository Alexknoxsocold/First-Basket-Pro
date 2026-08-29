import type { WnbaCandidate, WnbaGame, WnbaSlate } from "./wnbaFirstBasket.js";

export type WnbaSequenceCandidate = WnbaCandidate & {
  baseProbability: number;
  sequenceProbability: number;
  sequenceAdjustment: number;
  projectedFirstPossessionPct: number | null;
  sequenceWeight: number;
  sequenceRank: number;
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

function applyToGame(game: WnbaGame): WnbaGame {
  if (!game.candidates.length) return game;
  const weight = confidenceWeight(game.tipSignal.confidence);
  const hasPossessionSignal = weight > 0 && game.tipSignal.awayTipPct !== null && game.tipSignal.homeTipPct !== null;

  const shadow = game.candidates.map(candidate => {
    const possessionPct = hasPossessionSignal
      ? (candidate.team === game.awayTeam ? game.tipSignal.awayTipPct! : game.tipSignal.homeTipPct!)
      : null;
    const target = possessionPct === null ? candidate.probability : sequenceTarget(candidate, possessionPct);
    const sequenceProbability = Math.round(clamp(candidate.probability * (1 - weight) + target * weight, 1, 35) * 10) / 10;
    return {
      ...candidate,
      baseProbability: candidate.probability,
      sequenceProbability,
      sequenceAdjustment: Math.round((sequenceProbability - candidate.probability) * 10) / 10,
      projectedFirstPossessionPct: possessionPct === null ? null : Math.round(possessionPct * 10) / 10,
      sequenceWeight: weight,
      sequenceRank: candidate.rank,
    } satisfies WnbaSequenceCandidate;
  });

  const sequenceRanks = [...shadow]
    .sort((a, b) => b.sequenceProbability - a.sequenceProbability || b.avgFga - a.avgFga || b.avgMinutes - a.avgMinutes)
    .map((candidate, index) => ({ key: `${candidate.team}|${candidate.name}`.toLowerCase(), rank: index + 1 }));
  const rankByPlayer = new Map(sequenceRanks.map(item => [item.key, item.rank]));

  // Keep public probability, public rank, topPick and market EV tied to the
  // proven/locked model until this challenger is graded out-of-sample. The
  // sequence fields are research telemetry only, so users never see one number
  // while the prediction ledger records another.
  const candidates = shadow.map(candidate => ({
    ...candidate,
    sequenceRank: rankByPlayer.get(`${candidate.team}|${candidate.name}`.toLowerCase()) ?? candidate.rank,
  }));
  return { ...game, candidates };
}

/**
 * Possession-first challenger: tip win -> opening-shot opportunity -> finishing.
 * It is intentionally shadow-only until enough graded games prove that it
 * improves calibration. Live probabilities/ranks and locked predictions remain
 * unchanged.
 */
export function applyWnbaSequenceModel(slate: WnbaSlate): WnbaSlate {
  const games = slate.games.map(applyToGame);
  return {
    ...slate,
    games,
    modelVersion: `${slate.modelVersion}+SEQ-SHADOW-V1`,
    source: `${slate.source} + possession-first sequence challenger (shadow-only; tip win -> opening shot opportunity -> finishing)`,
  };
}
