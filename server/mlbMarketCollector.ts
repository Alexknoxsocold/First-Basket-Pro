import type { MlbMarketQuote, MlbMarketSide } from "./mlbMarketValue.js";

/**
 * Normalized NRFI/YRFI market collector.
 *
 * This module intentionally does NOT scrape sportsbook HTML and does NOT invent
 * prices. It accepts quotes from an authorized/public upstream adapter and
 * validates them before they reach the value engine.
 */

export type RawMlbMarketQuote = {
  gameId: string;
  awayTeam?: string;
  homeTeam?: string;
  side: "NRFI" | "YRFI" | string;
  americanOdds: number;
  sportsbook: string;
  market: string;
  capturedAt?: string;
  sourceUrl?: string | null;
};

export type NormalizedMlbMarketQuote = MlbMarketQuote & {
  gameId: string;
  awayTeam: string | null;
  homeTeam: string | null;
};

const VALID_SIDES: MlbMarketSide[] = ["NRFI", "YRFI"];

function normalizeSide(side: string): MlbMarketSide | null {
  const normalized = side.trim().toUpperCase().replace(/[^A-Z]/g, "");
  return VALID_SIDES.includes(normalized as MlbMarketSide) ? normalized as MlbMarketSide : null;
}

export function normalizeMlbMarketQuote(raw: RawMlbMarketQuote): NormalizedMlbMarketQuote | null {
  if (!raw.gameId || !raw.sportsbook || !raw.market) return null;
  const side = normalizeSide(raw.side);
  const odds = Number(raw.americanOdds);
  if (!side || !Number.isFinite(odds) || odds === 0 || Math.abs(odds) > 10000) return null;

  const capturedAt = raw.capturedAt ?? new Date().toISOString();
  const timestamp = new Date(capturedAt).getTime();
  if (!Number.isFinite(timestamp)) return null;

  return {
    gameId: raw.gameId,
    awayTeam: raw.awayTeam?.trim() || null,
    homeTeam: raw.homeTeam?.trim() || null,
    side,
    americanOdds: odds,
    sportsbook: raw.sportsbook.trim(),
    market: raw.market.trim(),
    capturedAt: new Date(timestamp).toISOString(),
    sourceUrl: raw.sourceUrl ?? null,
  };
}

export function normalizeMlbMarketQuotes(rawQuotes: RawMlbMarketQuote[]): NormalizedMlbMarketQuote[] {
  const seen = new Set<string>();
  const result: NormalizedMlbMarketQuote[] = [];
  for (const raw of rawQuotes) {
    const quote = normalizeMlbMarketQuote(raw);
    if (!quote) continue;
    const key = `${quote.gameId}:${quote.sportsbook.toLowerCase()}:${quote.market.toLowerCase()}:${quote.side}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(quote);
  }
  return result;
}

export function groupMlbMarketQuotes(quotes: NormalizedMlbMarketQuote[]): Map<string, NormalizedMlbMarketQuote[]> {
  const grouped = new Map<string, NormalizedMlbMarketQuote[]>();
  for (const quote of quotes) {
    const current = grouped.get(quote.gameId) ?? [];
    current.push(quote);
    grouped.set(quote.gameId, current);
  }
  return grouped;
}

/**
 * Optional HTTP adapter for an authorized upstream JSON endpoint.
 * The endpoint must return either an array or { quotes: [...] } using the
 * RawMlbMarketQuote shape. No sportsbook pages are fetched here.
 */
export async function fetchMlbMarketQuotesFromEndpoint(url: string, timeoutMs = 8000): Promise<NormalizedMlbMarketQuote[]> {
  if (!/^https:\/\//i.test(url)) throw new Error("Market source must use HTTPS");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "First-Basket-Pro/1.0" },
    });
    if (!response.ok) throw new Error(`Market source returned ${response.status}`);
    const payload = await response.json() as RawMlbMarketQuote[] | { quotes?: RawMlbMarketQuote[] };
    const rawQuotes = Array.isArray(payload) ? payload : payload.quotes ?? [];
    return normalizeMlbMarketQuotes(rawQuotes);
  } finally {
    clearTimeout(timer);
  }
}
