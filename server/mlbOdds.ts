import { fetchLiveMlbMarketQuotes } from "./mlbMarketService.js";
import type { NormalizedMlbMarketQuote } from "./mlbMarketCollector.js";
import { americanToImpliedProbability, calculateNoVigProbability, calculateExpectedValue } from "./mlbMarketValue.js";

export type MlbRfiMarket = {
  available: boolean;
  book: string | null;
  selection: "NRFI" | "YRFI" | null;
  price: number | null;
  impliedProbability: number | null;
  noVigProbability: number | null;
  edge: number | null;
  ev: number | null;
  updatedAt: string | null;
};

const TTL = 60_000;
let cache: { value: Map<string, MlbRfiMarket>; expiresAt: number } | null = null;
let inflight: Promise<Map<string, MlbRfiMarket>> | null = null;

const norm = (value: string | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const keyFor = (away: string | undefined, home: string | undefined) => `${norm(away)}@${norm(home)}`;

function quoteKey(quote: NormalizedMlbMarketQuote): string | null {
  if (!quote.awayTeam || !quote.homeTeam) return null;
  return `${keyFor(quote.awayTeam, quote.homeTeam)}:${quote.side}:${quote.sportsbook}`;
}

function buildMarketMap(quotes: NormalizedMlbMarketQuote[]): Map<string, MlbRfiMarket> {
  const out = new Map<string, MlbRfiMarket>();
  for (const quote of quotes) {
    const key = quoteKey(quote);
    if (!key) continue;
    const implied = americanToImpliedProbability(quote.americanOdds);
    if (implied === null) continue;

    const opposite = quotes.find(other =>
      other.gameId === quote.gameId &&
      other.sportsbook.toLowerCase() === quote.sportsbook.toLowerCase() &&
      other.market.toLowerCase() === quote.market.toLowerCase() &&
      other.side !== quote.side
    );
    const noVig = calculateNoVigProbability(quote, opposite ?? null);
    out.set(key, {
      available: true,
      book: quote.sportsbook,
      selection: quote.side,
      price: quote.americanOdds,
      impliedProbability: implied,
      noVigProbability: noVig,
      edge: null,
      ev: null,
      updatedAt: quote.capturedAt,
    });
  }
  return out;
}

export function getCachedMlbRfiMarkets(): Map<string, MlbRfiMarket> {
  if (!cache || cache.expiresAt <= Date.now()) return new Map();
  return cache.value;
}

export async function fetchMlbRfiMarkets(): Promise<Map<string, MlbRfiMarket>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const quotes = await fetchLiveMlbMarketQuotes();
      const out = buildMarketMap(quotes);
      cache = { value: out, expiresAt: Date.now() + TTL };
      console.log(`[MLB Odds] Verified RFI market refresh: ${out.size} side quotes mapped.`);
      return out;
    } catch (error) {
      console.warn("[MLB Odds] Verified market refresh failed:", error);
      return cache?.value ?? new Map();
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function valueFromMarketForTeams(
  market: Map<string, MlbRfiMarket>,
  away: string,
  home: string,
  side: "NRFI" | "YRFI",
  modelProbability: number,
): MlbRfiMarket | null {
  const prefix = `${keyFor(away, home)}:${side}:`;
  let best: MlbRfiMarket | null = null;

  for (const [key, item] of market) {
    if (!key.startsWith(prefix) || item.price === null) continue;
    const edge = modelProbability - (item.noVigProbability ?? item.impliedProbability ?? 0);
    const ev = calculateExpectedValue(modelProbability, item.price);
    const scored = { ...item, edge, ev };
    if (!best || (scored.ev ?? -Infinity) > (best.ev ?? -Infinity)) best = scored;
  }

  return best;
}
