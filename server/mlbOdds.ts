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
type Market = { key?: string; title?: string; last_update?: string; updated_at?: string; outcomes?: Outcome[] };
type Book = { key?: string; title?: string; last_update?: string; updated_at?: string; markets?: Market[] };
type Event = {
  id?: string;
  event_id?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Book[];
  books?: Book[];
};
type OddsResponse = { success?: boolean; data?: Event[] };

// TheOddsAPI was migrated to a new API surface in 2026. Authentication is now
// via the x-api-key header and the base URL is api.theoddsapi.com (no /v4).
const BASE = "https://api.theoddsapi.com";
const TTL = 60_000;
const EMPTY_TTL = 60_000;
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
      // Never interpret an unrelated market as RFI pricing. RFI/NRFI is not
      // part of the Free core /odds feed, so this remains empty until a plan
      // or provider that exposes the first-inning market is connected.
      const market = (book.markets ?? []).find(m =>
        m.key === "nrfi" ||
        m.key === "yrfi" ||
        m.title?.toLowerCase().includes("first inning")
      );
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
      const updatedAt = market.last_update ?? market.updated_at ?? book.last_update ?? book.updated_at ?? null;

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

async function fetchCoreMlbOdds(apiKey: string): Promise<Event[]> {
  const url = new URL(`${BASE}/odds/`);
  url.searchParams.set("sport_key", "baseball_mlb");
  url.searchParams.set("oddsFormat", "american");

  const response = await fetch(url, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Odds API core MLB ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  const payload = await response.json() as OddsResponse | Event[];
  return Array.isArray(payload) ? payload : (payload.data ?? []);
}

async function fetchPeriodMarkets(apiKey: string): Promise<Event[]> {
  // TheOddsAPI's first-5/period market endpoint is plan-gated. We keep this
  // behind an explicit opt-in so a Free key does not generate noisy 403s.
  if (process.env.THE_ODDS_API_USE_PERIOD_MARKETS !== "true") return [];

  const url = new URL(`${BASE}/period-markets/`);
  url.searchParams.set("sport_key", "baseball_mlb");
  const response = await fetch(url, {
    headers: { "x-api-key": apiKey },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Odds API period markets ${response.status}`);
  const payload = await response.json() as OddsResponse | Event[];
  return Array.isArray(payload) ? payload : (payload.data ?? []);
}

export function getCachedMlbRfiMarkets(): Map<string, MlbRfiMarket> {
  if (!cache || cache.expiresAt <= Date.now()) return new Map();
  return cache.value;
}

export async function fetchMlbRfiMarkets(): Promise<Map<string, MlbRfiMarket>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (inflight) return inflight;

  const apiKey = process.env.THE_ODDS_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[MLB Odds] THE_ODDS_API_KEY is not configured.");
    return new Map();
  }

  inflight = (async () => {
    try {
      // First validate the key against the exact Free-tier MLB endpoint from
      // TheOddsAPI's current documentation/email. This prevents the old v4
      // /sports/.../odds request from producing misleading 401 errors.
      let coreEvents: Event[] = [];
      try {
        coreEvents = await fetchCoreMlbOdds(apiKey);
        console.log(`[MLB Odds] TheOddsAPI authenticated successfully; ${coreEvents.length} MLB events returned.`);
      } catch (coreError) {
        console.warn("[MLB Odds] Core MLB odds request failed:", coreError);
      }

      // RFI/NRFI is not part of the Free core /odds market set. If the account
      // explicitly enables period markets, try that endpoint and extract any
      // RFI-like market it exposes. Otherwise leave the market empty rather
      // than pretending moneyline odds are NRFI/YRFI prices.
      let out = new Map<string, MlbRfiMarket>();
      if (process.env.THE_ODDS_API_USE_PERIOD_MARKETS === "true") {
        try {
          const periodEvents = await fetchPeriodMarkets(apiKey);
          out = extractMarkets(periodEvents);
          console.log(`[MLB Odds] Period-market refresh: ${out.size / 2} RFI games priced.`);
        } catch (periodError) {
          console.warn("[MLB Odds] Period-market request failed:", periodError);
        }
      } else {
        console.log("[MLB Odds] Core MLB odds are available; RFI/NRFI pricing is not requested because the current plan does not expose that market.");
      }

      cache = { value: out, expiresAt: Date.now() + (out.size ? TTL : EMPTY_TTL) };
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
