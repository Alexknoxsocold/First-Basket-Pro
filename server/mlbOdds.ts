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
type Book = { key?: string; title?: string; last_update?: string; updated_at?: string; markets?: { key?: string; outcomes?: Outcome[] }[] };
type Event = { home_team?: string; away_team?: string; books?: Book[]; bookmakers?: Book[] };
const BASE = "https://api.theoddsapi.com";
const TTL = 60_000;
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

export async function fetchMlbRfiMarkets(): Promise<Map<string, MlbRfiMarket>> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  if (inflight) return inflight;
  const apiKey = process.env.THE_ODDS_API_KEY?.trim();
  if (!apiKey) return new Map();
  inflight = (async () => {
    try {
      const url = new URL(`${BASE}/v4/sports/baseball_mlb/odds/`);
      url.searchParams.set("regions", process.env.THE_ODDS_API_REGION ?? "us");
      url.searchParams.set("markets", "nrfi");
      url.searchParams.set("oddsFormat", "american");
      const r = await fetch(url, { headers: { "x-api-key": apiKey }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`Odds API ${r.status}`);
      const body = await r.json() as { data?: Event[] } | Event[];
      const events = Array.isArray(body) ? body : body.data ?? [];
      const out = new Map<string, MlbRfiMarket>();
      for (const event of events) {
        const gameKey = keyFor(event.away_team, event.home_team);
        if (gameKey === "@") continue;
        for (const book of event.books ?? event.bookmakers ?? []) {
          const market = (book.markets ?? []).find(m => m.key === "nrfi") ?? (book.markets ?? [])[0];
          const prices = new Map<"NRFI" | "YRFI", number>();
          for (const o of market?.outcomes ?? []) {
            const s = selection(o.name); const p = Number(o.price);
            if (s && Number.isFinite(p)) prices.set(s, p);
          }
          if (!prices.has("NRFI") || !prices.has("YRFI")) continue;
          const np = prices.get("NRFI")!; const yp = prices.get("YRFI")!;
          const ni = implied(np); const yi = implied(yp); const total = ni + yi;
          const bookName = book.title ?? book.key ?? "Sportsbook";
          const updatedAt = book.last_update ?? book.updated_at ?? null;
          out.set(`${gameKey}:NRFI:${bookName}`, { available: true, book: bookName, selection: "NRFI", price: np, impliedProbability: ni, noVigProbability: ni / total, edge: null, ev: null, updatedAt });
          out.set(`${gameKey}:YRFI:${bookName}`, { available: true, book: bookName, selection: "YRFI", price: yp, impliedProbability: yi, noVigProbability: yi / total, edge: null, ev: null, updatedAt });
        }
      }
      cache = { value: out, expiresAt: Date.now() + TTL }; return out;
    } catch (e) {
      console.warn("[MLB Odds] RFI refresh failed:", e); return cache?.value ?? new Map();
    } finally { inflight = null; }
  })();
  return inflight;
}

export function valueFromMarketForTeams(market: Map<string, MlbRfiMarket>, away: string, home: string, side: "NRFI" | "YRFI", modelProbability: number): MlbRfiMarket | null {
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
