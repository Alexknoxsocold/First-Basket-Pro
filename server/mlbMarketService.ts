import { fetchMlbMarketQuotesFromEndpoint, type NormalizedMlbMarketQuote } from "./mlbMarketCollector.js";
import { evaluateGameMarket, type GameMarketEvaluation } from "./mlbMarketEvaluation.js";

const TTL = 60_000;
let cache: { quotes: NormalizedMlbMarketQuote[]; expiresAt: number } | null = null;
let inflight: Promise<NormalizedMlbMarketQuote[]> | null = null;

/**
 * Single production boundary between an authorized sportsbook/odds adapter and
 * the NRFI value engine. No HTML scraping and no synthetic prices happen here.
 * Configure MLB_MARKET_SOURCE_URL to an HTTPS JSON endpoint returning
 * RawMlbMarketQuote[] or { quotes: RawMlbMarketQuote[] }.
 */
export async function fetchLiveMlbMarketQuotes(): Promise<NormalizedMlbMarketQuote[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.quotes;
  if (inflight) return inflight;

  const url = process.env.MLB_MARKET_SOURCE_URL?.trim();
  if (!url) return [];

  inflight = (async () => {
    try {
      const quotes = await fetchMlbMarketQuotesFromEndpoint(url);
      cache = { quotes, expiresAt: Date.now() + TTL };
      return quotes;
    } catch (error) {
      console.warn("[MLB Market] Live market refresh failed:", error);
      return cache?.quotes ?? [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function evaluateLiveMlbMarket(input: {
  gameId: string;
  modelSide: "NRFI" | "YRFI";
  modelProbability: number;
  quotes: NormalizedMlbMarketQuote[];
}): GameMarketEvaluation {
  return evaluateGameMarket(input);
}

export function marketSourceConfigured(): boolean {
  return Boolean(process.env.MLB_MARKET_SOURCE_URL?.trim());
}
