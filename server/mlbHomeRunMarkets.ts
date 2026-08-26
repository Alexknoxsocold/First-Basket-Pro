const PROPLINE_BASE = 'https://api.prop-line.com/v1';
const MARKET_CACHE_MS = 15 * 60 * 1000;

export type HomeRunBookQuote = {
  bookmaker: string;
  bookmakerKey: string;
  americanOdds: number;
  updatedAt: string | null;
};

export type HomeRunMarket = {
  player: string;
  bestOdds: number;
  bestBook: string;
  impliedProbability: number;
  consensusImpliedProbability: number;
  quoteCount: number;
  trustedQuoteCount: number;
  outlierQuoteCount: number;
  priceVerified: boolean;
  quotes: HomeRunBookQuote[];
  capturedAt: string;
};

export type HomeRunMarketFeed = {
  status: 'available' | 'unavailable' | 'disabled';
  source: 'PropLine';
  gamesMatched: number;
  playersPriced: number;
  markets: Map<number, Map<string, HomeRunMarket>>;
};

type GameInput = { gamePk: number; gameTime: string; awayName: string; homeName: string };
type PropLineEvent = { id?: string | number; event_id?: string | number; home_team?: string; away_team?: string; commence_time?: string };
type PropLineOutcome = { name?: string; description?: string; price?: number; point?: number | null; book_updated_at?: string; last_change_at?: string };
type PropLineMarket = { key?: string; outcomes?: PropLineOutcome[] };
type PropLineBookmaker = { key?: string; title?: string; last_update?: string; markets?: PropLineMarket[] };
type PropLineOdds = { id?: string | number; event_id?: string | number; home_team?: string; away_team?: string; bookmakers?: PropLineBookmaker[] };

let cache: { expiresAt: number; key: string; value: HomeRunMarketFeed } | null = null;

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

export function normalizeHomeRunPlayer(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[.'’\-]/g, '').replace(/\s+/g, ' ').trim();
}

function americanImplied(odds: number): number {
  if (!Number.isFinite(odds) || odds === 0) return NaN;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function median(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a,b)=>a-b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function propLineFetch<T>(path: string, apiKey: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${PROPLINE_BASE}${path}`, {
      signal: controller.signal,
      headers: { 'X-API-Key': apiKey, 'User-Agent': 'PreziTools/1.0' },
    });
    if (!response.ok) throw new Error(`PropLine ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function asEvents(payload: unknown): PropLineEvent[] {
  if (Array.isArray(payload)) return payload as PropLineEvent[];
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    if (Array.isArray(row.events)) return row.events as PropLineEvent[];
    if (Array.isArray(row.data)) return row.data as PropLineEvent[];
  }
  return [];
}

function asOdds(payload: unknown): PropLineOdds[] {
  if (Array.isArray(payload)) return payload as PropLineOdds[];
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    if (Array.isArray(row.events)) return row.events as PropLineOdds[];
    if (Array.isArray(row.data)) return row.data as PropLineOdds[];
    return [payload as PropLineOdds];
  }
  return [];
}

function eventMatches(game: GameInput, event: PropLineEvent): boolean {
  const home = normalize(event.home_team ?? '');
  const away = normalize(event.away_team ?? '');
  if (!home || !away) return false;
  const gameHome = normalize(game.homeName);
  const gameAway = normalize(game.awayName);
  const teamsMatch = (home === gameHome || home.includes(gameHome) || gameHome.includes(home)) && (away === gameAway || away.includes(gameAway) || gameAway.includes(away));
  if (!teamsMatch) return false;
  if (!event.commence_time) return true;
  const eventTime = new Date(event.commence_time).getTime();
  const gameTime = new Date(game.gameTime).getTime();
  return !Number.isFinite(eventTime) || !Number.isFinite(gameTime) || Math.abs(eventTime - gameTime) <= 3 * 60 * 60 * 1000;
}

function buildPlayerMarkets(payload: unknown): Map<string, HomeRunMarket> {
  const quotesByPlayer = new Map<string, { player: string; quotes: HomeRunBookQuote[] }>();
  for (const event of asOdds(payload)) {
    for (const book of event.bookmakers ?? []) {
      for (const market of book.markets ?? []) {
        if (market.key !== 'batter_home_runs') continue;
        for (const outcome of market.outcomes ?? []) {
          if ((outcome.name ?? '').toLowerCase() !== 'yes') continue;
          // PropLine may also carry alternate/milestone home-run rungs under this market.
          // The main anytime-HR YES outcome has no point (or occasionally 0.5).
          if (outcome.point !== undefined && outcome.point !== null && outcome.point !== 0.5) continue;
          const player = String(outcome.description ?? '').trim();
          const americanOdds = Number(outcome.price);
          if (!player || !Number.isFinite(americanOdds) || americanOdds === 0) continue;
          const key = normalizeHomeRunPlayer(player);
          const entry = quotesByPlayer.get(key) ?? { player, quotes: [] };
          const quote: HomeRunBookQuote = {
            bookmaker: String(book.title ?? book.key ?? 'Sportsbook'),
            bookmakerKey: String(book.key ?? '').trim(),
            americanOdds,
            updatedAt: outcome.book_updated_at ?? outcome.last_change_at ?? book.last_update ?? null,
          };
          // Keep one anytime-HR quote per book. If duplicates arrive, keep the more conservative price.
          const existingIndex = entry.quotes.findIndex(q => q.bookmakerKey && q.bookmakerKey === quote.bookmakerKey);
          if (existingIndex >= 0) {
            if (americanImplied(quote.americanOdds) > americanImplied(entry.quotes[existingIndex].americanOdds)) entry.quotes[existingIndex] = quote;
          } else entry.quotes.push(quote);
          quotesByPlayer.set(key, entry);
        }
      }
    }
  }

  const capturedAt = new Date().toISOString();
  const out = new Map<string, HomeRunMarket>();
  for (const [key, entry] of quotesByPlayer) {
    entry.quotes.sort((a, b) => b.americanOdds - a.americanOdds);
    const probabilities = entry.quotes.map(q => americanImplied(q.americanOdds)).filter(Number.isFinite);
    const consensus = median(probabilities);
    if (!Number.isFinite(consensus)) continue;

    // Reject isolated prices that are wildly different from the rest of the market.
    // This prevents one stale/alternate quote from creating fake +200% EV plays.
    let trustedQuotes = entry.quotes.filter(q => {
      const p = americanImplied(q.americanOdds);
      if (!Number.isFinite(p)) return false;
      if (entry.quotes.length < 3) return true;
      return Math.abs(p - consensus) / Math.max(consensus, 0.01) <= 0.45;
    });
    let priceVerified = trustedQuotes.length >= 2;

    if (entry.quotes.length === 2) {
      const p0 = americanImplied(entry.quotes[0].americanOdds), p1 = americanImplied(entry.quotes[1].americanOdds);
      const relGap = Math.abs(p0 - p1) / Math.max((p0 + p1) / 2, 0.01);
      priceVerified = relGap <= 0.45;
      if (!priceVerified) trustedQuotes = [...entry.quotes].sort((a,b)=>americanImplied(b.americanOdds)-americanImplied(a.americanOdds)).slice(0,1);
    }
    if (!trustedQuotes.length) trustedQuotes = [...entry.quotes].sort((a,b)=>americanImplied(b.americanOdds)-americanImplied(a.americanOdds)).slice(0,1);

    trustedQuotes.sort((a,b)=>b.americanOdds-a.americanOdds);
    const best = trustedQuotes[0];
    const impliedProbability = americanImplied(best.americanOdds);
    if (!Number.isFinite(impliedProbability)) continue;

    out.set(key, {
      player: entry.player,
      bestOdds: best.americanOdds,
      bestBook: best.bookmaker,
      impliedProbability,
      consensusImpliedProbability: consensus,
      quoteCount: entry.quotes.length,
      trustedQuoteCount: trustedQuotes.length,
      outlierQuoteCount: Math.max(0, entry.quotes.length - trustedQuotes.length),
      priceVerified,
      quotes: entry.quotes,
      capturedAt,
    });
  }
  return out;
}

export async function fetchHomeRunMarkets(games: GameInput[]): Promise<HomeRunMarketFeed> {
  const apiKey = process.env.PROPLINE_API_KEY?.trim();
  if (!apiKey) return { status: 'disabled', source: 'PropLine', gamesMatched: 0, playersPriced: 0, markets: new Map() };
  if (!games.length) return { status: 'available', source: 'PropLine', gamesMatched: 0, playersPriced: 0, markets: new Map() };

  const cacheKey = games.map(g => `${g.gamePk}:${g.gameTime}`).sort().join('|');
  if (cache && cache.key === cacheKey && cache.expiresAt > Date.now()) return cache.value;

  try {
    const eventsPayload = await propLineFetch<unknown>('/sports/baseball_mlb/events', apiKey);
    const events = asEvents(eventsPayload);
    const pairs = games.map(game => ({ game, event: events.find(event => eventMatches(game, event)) })).filter((x): x is { game: GameInput; event: PropLineEvent } => Boolean(x.event));

    const markets = new Map<number, Map<string, HomeRunMarket>>();
    await Promise.all(pairs.map(async ({ game, event }) => {
      const eventId = event.id ?? event.event_id;
      if (eventId === undefined || eventId === null) return;
      try {
        const payload = await propLineFetch<unknown>(`/sports/baseball_mlb/events/${encodeURIComponent(String(eventId))}/odds?markets=batter_home_runs`, apiKey);
        const playerMarkets = buildPlayerMarkets(payload);
        if (playerMarkets.size) markets.set(game.gamePk, playerMarkets);
      } catch (error) {
        console.warn(`[MLB Home Runs] PropLine odds unavailable for game ${game.gamePk}:`, error);
      }
    }));

    const playersPriced = [...markets.values()].reduce((sum, m) => sum + m.size, 0);
    const value: HomeRunMarketFeed = {
      status: markets.size ? 'available' : 'unavailable',
      source: 'PropLine',
      gamesMatched: pairs.length,
      playersPriced,
      markets,
    };
    cache = { key: cacheKey, expiresAt: Date.now() + MARKET_CACHE_MS, value };
    return value;
  } catch (error) {
    console.warn('[MLB Home Runs] PropLine market feed unavailable:', error);
    const value: HomeRunMarketFeed = { status: 'unavailable', source: 'PropLine', gamesMatched: 0, playersPriced: 0, markets: new Map() };
    cache = { key: cacheKey, expiresAt: Date.now() + 60_000, value };
    return value;
  }
}
