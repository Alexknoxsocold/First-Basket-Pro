// Verified NRFI/YRFI market-value layer.
// This module NEVER invents a sportsbook price. A Value Play is only returned
// when a real, timestamped market price is supplied by an external collector.

export type MlbMarketSide = "NRFI" | "YRFI";

export type MlbMarketQuote = {
  side: MlbMarketSide;
  americanOdds: number;
  sportsbook: string;
  market: string;
  capturedAt: string;
  sourceUrl?: string | null;
};

export type MlbMarketValue = {
  available: boolean;
  side: MlbMarketSide | null;
  sportsbook: string | null;
  market: string | null;
  americanOdds: number | null;
  capturedAt: string | null;
  ageSeconds: number | null;
  impliedProbability: number | null;
  noVigProbability: number | null;
  modelProbability: number | null;
  edge: number | null;
  expectedValue: number | null;
  valuePlay: boolean;
  reason: string;
};

const MAX_QUOTE_AGE_SECONDS = 15 * 60;
const MIN_VALUE_EDGE = 0.02;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function americanToImpliedProbability(americanOdds: number): number | null {
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return null;
  return americanOdds > 0
    ? 100 / (americanOdds + 100)
    : Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
}

export function calculateNoVigProbability(
  target: MlbMarketQuote,
  opposite: MlbMarketQuote | null | undefined,
): number | null {
  const targetImplied = americanToImpliedProbability(target.americanOdds);
  if (targetImplied === null) return null;
  const oppositeImplied = opposite ? americanToImpliedProbability(opposite.americanOdds) : null;
  if (oppositeImplied === null) return null;
  const total = targetImplied + oppositeImplied;
  return total > 0 ? targetImplied / total : null;
}

export function calculateExpectedValue(modelProbability: number, americanOdds: number): number | null {
  const p = clamp(modelProbability, 0, 1);
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return null;
  const netProfit = americanOdds > 0 ? americanOdds / 100 : 100 / Math.abs(americanOdds);
  return p * netProfit - (1 - p);
}

function empty(reason: string, modelProbability: number | null = null): MlbMarketValue {
  return {
    available: false,
    side: null,
    sportsbook: null,
    market: null,
    americanOdds: null,
    capturedAt: null,
    ageSeconds: null,
    impliedProbability: null,
    noVigProbability: null,
    modelProbability,
    edge: null,
    expectedValue: null,
    valuePlay: false,
    reason,
  };
}

export function evaluateMlbMarketValue(input: {
  modelSide: MlbMarketSide;
  modelProbability: number;
  target: MlbMarketQuote | null | undefined;
  opposite?: MlbMarketQuote | null;
  now?: Date;
}): MlbMarketValue {
  if (!input.target) return empty("No market price available", input.modelProbability);
  if (!Number.isFinite(input.modelProbability) || input.modelProbability < 0 || input.modelProbability > 1) {
    return empty("Invalid model probability", null);
  }
  if (input.target.side !== input.modelSide) return empty("Market side does not match model side", input.modelProbability);
  if (!input.target.sportsbook || !input.target.market) return empty("Incomplete market quote", input.modelProbability);

  const captured = new Date(input.target.capturedAt).getTime();
  const now = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(captured)) return empty("Invalid market timestamp", input.modelProbability);
  const ageSeconds = Math.max(0, (now - captured) / 1000);
  if (ageSeconds > MAX_QUOTE_AGE_SECONDS) {
    return { ...empty("Market price is stale", input.modelProbability), capturedAt: input.target.capturedAt, ageSeconds };
  }

  const implied = americanToImpliedProbability(input.target.americanOdds);
  if (implied === null) return empty("Invalid market price", input.modelProbability);
  const noVig = calculateNoVigProbability(input.target, input.opposite);
  const edge = input.modelProbability - (noVig ?? implied);
  const expectedValue = calculateExpectedValue(input.modelProbability, input.target.americanOdds);

  return {
    available: true,
    side: input.modelSide,
    sportsbook: input.target.sportsbook,
    market: input.target.market,
    americanOdds: input.target.americanOdds,
    capturedAt: input.target.capturedAt,
    ageSeconds,
    impliedProbability: implied,
    noVigProbability: noVig,
    modelProbability: input.modelProbability,
    edge,
    expectedValue,
    valuePlay: edge >= MIN_VALUE_EDGE && (expectedValue ?? -1) > 0,
    reason: noVig === null ? "Verified market price; no-vig comparison unavailable" : edge >= MIN_VALUE_EDGE && (expectedValue ?? -1) > 0 ? "Verified market value" : "Verified market price, but no qualifying edge",
  };
}
