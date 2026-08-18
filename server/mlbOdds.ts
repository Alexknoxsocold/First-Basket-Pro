import { fetchLiveMlbMarketQuotes } from "./mlbMarketService.js";
import { evaluateMlbMarketValue, type MlbMarketQuote } from "./mlbMarketValue.js";
import type { NormalizedMlbMarketQuote } from "./mlbMarketCollector.js";

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
  ageSeconds?: number | null;
};

const TTL = 60_000;
let cache: { value: NormalizedMlbMarketQuote[]; expiresAt: number } | null = null;
let inflight: Promise<NormalizedMlbMarketQuote[]> | null = null;

const norm = (value: string | undefined) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const keyFor = (away: string | undefined, home: string | undefined) => `${norm(away)}@${norm(home)}`;

export function getCachedMlbRfiMarkets(): Map<string, MlbRfiMarket> {
  if (!cache || cache.expiresAt <= Date.now()) return new Map();
  const out = new Map<string, MlbRfiMarket>();
  for (const quote of cache.value) {
    const key = `${keyFor(quote.awayTeam ?? undefined, quote.homeTeam ?? undefined)}:${quote.side}:${quote.sportsbook}`;
    out.set(key, {
      available: true,
      book: quote.sportsbook,
      selection: quote.side,
      price: quote.americanOdds,
      impliedProbability: null,
      noVigProbability: null,
      edge: null,
      ev: null,
      updatedAt: quote.capturedAt,
    });
  }
  return out;
}

export async function fetchMlbRfiMarkets(): Promise<Map<string, MlbRfiMarket>> {
  if (cache && cache.expiresAt > Date.now()) return getCachedMlbRfiMarkets();
  if (inflight) {
    await inflight;
    return getCachedMlbRfiMarkets();
  }

  inflight = (async () => {
    try {
      const quotes = await fetchLiveMlbMarketQuotes();
      cache = { value: quotes, expiresAt: Date.now() + TTL };
      console.log(`[MLB Odds] Verified RFI market refresh: ${quotes.length} side quotes collected.`);
      return quotes;
    } catch (error) {
      console.warn("[MLB Odds] Verified market refresh failed:", error);
      return cache?.value ?? [];
    } finally {
      inflight = null;
    }
  })();

  await inflight;
  return getCachedMlbRfiMarkets();
}

function quoteMatchesGame(quote: NormalizedMlbMarketQuote, away: string, home: string): boolean {
  return keyFor(quote.awayTeam ?? undefined, quote.homeTeam ?? undefined) === keyFor(away, home);
}

export function valueFromMarketForTeams(
  market: Map<string, MlbRfiMarket>,
  away: string,
  home: string,
  side: "NRFI" | "YRFI",
  modelProbability: number,
): MlbRfiMarket | null {
  // This compatibility path is retained for callers already consuming the
  // cached Map shape. It cannot recover the opposite-side quote, so no-vig is
  // intentionally unavailable here. The authoritative route should use the
  // quote-aware evaluator below when live quotes are present.
  const prefix = `${keyFor(away, home)}:${side}:`;
  let best: MlbRfiMarket | null = null;
  for (const [key, item] of market) {
    if (!key.startsWith(prefix) || item.price === null) continue;
    const ageSeconds = item.updatedAt ? Math.max(0, (Date.now() - new Date(item.updatedAt).getTime()) / 1000) : Infinity;
    if (!Number.isFinite(ageSeconds) || ageSeconds > 15 * 60) continue;
    const decimal = item.price > 0 ? 1 + item.price / 100 : 1 + 100 / Math.abs(item.price);
    const ev = modelProbability * decimal - 1;
    const scored = { ...item, ev, edge: item.noVigProbability === null ? null : modelProbability - item.noVigProbability, ageSeconds };
    if (!best || (scored.ev ?? -Infinity) > (best.ev ?? -Infinity)) best = scored;
  }
  return best;
}

/**
 * Authoritative quote-aware valuation used by the NRFI API middleware. It
 * pairs NRFI/YRFI from the same sportsbook/market before computing no-vig,
 * rejects stale prices, and selects the best valid EV across books.
 */
export async function valueLiveMarketForTeams(
  away: string,
  home: string,
  side: "NRFI" | "YRFI",
  modelProbability: number,
  now = new Date(),
): Promise<MlbRfiMarket | null> {
  const quotes = cache && cache.expiresAt > Date.now()
    ? cache.value
    : await fetchLiveMlbMarketQuotes();

  let best: MlbRfiMarket | null = null;
  for (const target of quotes.filter(q => q.side === side && quoteMatchesGame(q, away, home))) {
    const opposite = quotes.find(q =>
      q.gameId === target.gameId &&
      q.side !== side &&
      q.sportsbook.toLowerCase() === target.sportsbook.toLowerCase() &&
      q.market.toLowerCase() === target.market.toLowerCase()
    ) ?? null;

    const value = evaluateMlbMarketValue({
      modelSide: side,
      modelProbability,
      target: target as MlbMarketQuote,
      opposite: opposite as MlbMarketQuote | null,
      now,
    });
    if (!value.available) continue;

    const candidate: MlbRfiMarket = {
      available: true,
      book: value.sportsbook,
      selection: value.side,
      price: value.americanOdds,
      impliedProbability: value.impliedProbability,
      noVigProbability: value.noVigProbability,
      edge: value.edge,
      ev: value.expectedValue,
      updatedAt: value.capturedAt,
      ageSeconds: value.ageSeconds,
    };
    if (!best || (candidate.ev ?? -Infinity) > (best.ev ?? -Infinity)) best = candidate;
  }
  return best;
}
