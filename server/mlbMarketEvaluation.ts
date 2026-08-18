import { evaluateMlbMarketValue, type MlbMarketQuote, type MlbMarketValue } from "./mlbMarketValue.js";
import type { NormalizedMlbMarketQuote } from "./mlbMarketCollector.js";

export type GameMarketEvaluation = {
  gameId: string;
  marketValue: MlbMarketValue;
};

/**
 * Connects normalized collector output to the verified value engine.
 * A game only receives a value result when a quote for the model side exists.
 */
export function evaluateGameMarket(input: {
  gameId: string;
  modelSide: "NRFI" | "YRFI";
  modelProbability: number;
  quotes: NormalizedMlbMarketQuote[];
  now?: Date;
}): GameMarketEvaluation {
  const gameQuotes = input.quotes.filter(q => q.gameId === input.gameId);
  const target = gameQuotes.find(q => q.side === input.modelSide) ?? null;
  const opposite = gameQuotes.find(q => q.side !== input.modelSide) ?? null;

  const marketValue = evaluateMlbMarketValue({
    modelSide: input.modelSide,
    modelProbability: input.modelProbability,
    target: target as MlbMarketQuote | null,
    opposite: opposite as MlbMarketQuote | null,
    now: input.now,
  });

  return { gameId: input.gameId, marketValue };
}

export function evaluateGameMarkets(inputs: Array<{
  gameId: string;
  modelSide: "NRFI" | "YRFI";
  modelProbability: number;
  quotes: NormalizedMlbMarketQuote[];
}>, now = new Date()): GameMarketEvaluation[] {
  return inputs.map(input => evaluateGameMarket({ ...input, now }));
}
