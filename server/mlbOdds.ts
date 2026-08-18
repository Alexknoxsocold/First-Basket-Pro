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

type Outcome = { name?: string; price?: number };
type Market = { key?: string; title?: string; last_update?: string; outcomes?: Outcome[] };
type Book = { key?: string; title?: string; last_update?: string; updated_at?: string; markets?: Market[] };
type Event = { id?: string; home_team?: string; away_team?: string; bookmakers?: Book[]; books?: Book[] };

const BASE = "https://api.the-odds-api.com/v4";
const TTL = 60_000;
const EVENT_FALLBACK_TTL = 5 * 60_000;
let cache: { value: Map<string, MlbRfiMarket>; expiresAt: number } | null = null;
let inflight: Promise<Map<string, MlbRfiMarket>> | null = null;

const norm = (v: string | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const keyFor = (away: string | undefined, home: string | undefined) => `${norm(away)}@${norm(home)}`;
const decimal = (p: number) => p > 0 ? 1 + p / 100 : 1 + 100 / Math.abs(p);
const implied = (p: number) => 1 / decimal(p);

function selection(name: string | undefined): "NRFI" | "YRFI" | null {
  const n = (name ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  if (n.includes("NRFI") || n.includes("NORUN")) return "NRFI";
  if (n.includes("YRFI") || n.includes("YESRUN")) return "YRFI";
  return null;
}

function extractMarkets(events: Event[]): Map<string, MlbRfiMarket> {
  const out = new Map<string, MlbRfiMarket>();
  for (const event of events) {
    const gameKey = keyFor(event.away_team, event.home_team);
    if (gameKey === "@") continue;
    for (const book of event.bookmakers ?? event.books ?? []) {
      // Never fall back to an unrelated market. If the bookmaker does not
      // expose NRFI/YRFI, it must not be interpreted as first-inning pricing.
      const market = (book.markets ?? []).find(m => m.key === "nrfi" || m.key === "yrfi" || m.title?.toLowerCase().includes("first inning"));
      if (!market) continue;
      const prices = new Map<"NRFI" | "YRFI", number>();
      for (const outcome of market.outcomes ?? []) {
        const side = selection(outcome.name);
        const price = Number(outcome.price);
        if (side && Number.isFinite(price)) prices.set(side, price);
      }
      if (!prices.has("NRFI") || !prices.has("YRFI")) continue;
      const nrfiPrice = prices.get("NRFI")!;
      const yrfiPrice = prices.get("YRFI")!;
      const nrfiImplied = implied(nrfiPrice);
      const yrfiImplied = implied(yrfiPrice);
      const total = nrfiImplied + yrfiImplied;
      const bookName = book.title ?? book.key ?? "Sportsbook";
      const updatedAt = market.last_update ?? book.last_update ?? book.updated_at ?? null;
      out.set(`${gameKey}:NRFI:${bookName}`, {
        available: true,
        book: bookName,
        selection: "NRFI",
        price: nrfiPrice,
        impliedProbability: nrfiImplied,
        noVigProbability: nrfiImplied / total,
        edge: null,
        ev: null,
        updatedAt,
      });
      out.set(`${gameKey}:YRFI:${bookName}`, {
        available: true,
        book: bookName,
        selection: "YRFI",
        price: yrfiPrice,
        impliedProbability: yrfiImplied,
        noVigProbability: yrfiImplied / total,
        edge: null,
        ev: null,
        updatedAt,
      });
    }
  }
  return out;
}

async function fetchEventsForRfi(apiKey: string): Promise<Event[]> {
  const url = new URL(`${BASE}/sports/baseball_mlb/events`);
  url.searchParams.set("apiKey", apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Odds API events ${response.status}`);
  return await response.json() as Event[];
}

async function fetchEventRfi(event: Event, apiKey: string): Promise<Event | null> {
  if (!event.id) return null;
  const url = new URL(`${BASE}/sports/baseball_mlb/events/${event.id}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", process.env.THE_ODDS_API_REGION ?? "us");
  url.searchParams.set("markets", "nrfi");
  url.searchParams.set("oddsFormat", "american");
  const response = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!response.ok) return null;
  return await response.json() as Event;
}

async function fetchEventFallback(apiKey: string): Promise<Map<string, MlbRfiMarket>> {
  const events = await fetchEventsForRfi(apiKey);
  const results: Event[] = [];
  let next = 0;
  const limit = 4;
  async function worker() {
    while (next < events.length) {
      const index = next++;
      const event = await fetchEventRfi(events[index], apiKey);
      if (event) results.push(event);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, events.length) }, () => worker()));
  return extractMarkets(results);
}

async function fetchPrimaryRfi(apiKey: string): Promise<Map<string, MlbRfiMarket>> {
  const url = new URL(`${BASE}/sports/baseball_mlb/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("regions", process.env.THE_ODDS_API_REGION ?? "us");
  url.searchParams.set("markets", "nrfi");
  url.searchParams.set("oddsFormat", "american");
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Odds API ${response.status}`);
  const events = await response.json() as Event[];
  return extractMarkets(events);
}

export async function fetchMlbRfiMarkets(): Promise<Map<string, MlbRfiMarket>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (inflight) return inflight;
  const apiKey = process.env.THE_ODDS_API_KEY?.trim();
  if (!apiKey) return new Map();

  inflight = (async () => {
    try {
      let out = await fetchPrimaryRfi(apiKey);
      if (out.size === 0 && process.env.THE_ODDS_API_EVENT_FALLBACK !== "false") {
        console.log("[MLB Odds] No RFI prices from bulk endpoint; checking event markets.");
        try {
          out = await fetchEventFallback(apiKey);
        } catch (fallbackError) {
          console.warn("[MLB Odds] Event-market fallback failed:", fallbackError);
        }
      }
      console.log(`[MLB Odds] RFI market refresh: ${out.size / 2} games priced.`);
      cache = { value: out, expiresAt: Date.now() + (out.size ? TTL : EVENT_FALLBACK_TTL) };
      return out;
    } catch (error) {
      console.warn("[MLB Odds] Refresh failed:", error);
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
    if (!key.startsWith(prefix) || item.price === null || item.noVigProbability === null) continue;
    const ev = modelProbability * decimal(item.price) - 1;
    const scored = { ...item, edge: modelProbability - item.noVigProbability, ev };
    if (!best || (scored.ev ?? -Infinity) > (best.ev ?? -Infinity)) best = scored;
  }
  return best;
}
