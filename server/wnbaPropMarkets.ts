import { propLineGet } from './propLineClient';
import type { WnbaGame } from './wnbaFirstBasket';

export type WnbaPropMarketKey = 'points' | 'rebounds' | 'assists' | 'threes' | 'rebounds_assists' | 'points_rebounds_assists';
export type WnbaVerifiedMarketLine = {
  player: string;
  market: WnbaPropMarketKey;
  line: number;
  book: string | null;
  odds: number | null;
};
export type WnbaPlayerPropSignal = {
  player: string;
  marketCount: number;
  bookCount: number;
  markets: WnbaPropMarketKey[];
};

type PropEvent = {
  id?: string | number;
  event_id?: string | number;
  home_team?: string;
  away_team?: string;
  commence_time?: string;
};
type PropOutcome = {
  name?: string;
  description?: string;
  point?: number | null;
  price?: number | null;
};
type PropMarket = { key?: string; outcomes?: PropOutcome[] };
type PropBook = { key?: string; title?: string; markets?: PropMarket[] };
type PropOdds = { bookmakers?: PropBook[] };

type Quote = {
  player: string;
  market: WnbaPropMarketKey;
  line: number;
  book: string;
  odds: number | null;
  side: 'OVER' | 'UNDER';
};

const PROP_MARKETS = [
  'player_points',
  'player_rebounds',
  'player_assists',
  'player_threes',
  'player_rebounds_assists',
  'player_points_rebounds_assists',
].join(',');
const SIGNAL_CACHE_MS = 10 * 60 * 1000;
let signalCache: { at: number; value: Map<string, WnbaPlayerPropSignal> } | null = null;
let signalInFlight: Promise<Map<string, WnbaPlayerPropSignal>> | null = null;

function norm(v: unknown) {
  return String(v ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function marketFrom(key: string | undefined): WnbaPropMarketKey | null {
  switch (key) {
    case 'player_points': return 'points';
    case 'player_rebounds': return 'rebounds';
    case 'player_assists': return 'assists';
    case 'player_threes': return 'threes';
    case 'player_rebounds_assists': return 'rebounds_assists';
    case 'player_points_rebounds_assists': return 'points_rebounds_assists';
    default: return null;
  }
}

function eventsFrom(payload: unknown): PropEvent[] {
  if (Array.isArray(payload)) return payload as PropEvent[];
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    if (Array.isArray(row.events)) return row.events as PropEvent[];
    if (Array.isArray(row.data)) return row.data as PropEvent[];
  }
  return [];
}

function oddsFrom(payload: unknown): PropOdds[] {
  if (Array.isArray(payload)) return payload as PropOdds[];
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    if (Array.isArray(row.events)) return row.events as PropOdds[];
    if (Array.isArray(row.data)) return row.data as PropOdds[];
    return [payload as PropOdds];
  }
  return [];
}

function teamMatch(a: string, b: string) {
  const x = norm(a), y = norm(b);
  return Boolean(x && y && (x === y || x.includes(y) || y.includes(x)));
}

function eventMatches(game: WnbaGame, event: PropEvent) {
  if (!teamMatch(game.homeName, event.home_team ?? '') || !teamMatch(game.awayName, event.away_team ?? '')) return false;
  if (!event.commence_time) return true;
  const a = new Date(game.date).getTime();
  const b = new Date(event.commence_time).getTime();
  return !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) <= 3 * 60 * 60 * 1000;
}

function median(values: number[]) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function parseQuotes(payload: unknown): Quote[] {
  const out: Quote[] = [];
  for (const event of oddsFrom(payload)) {
    for (const book of event.bookmakers ?? []) {
      for (const market of book.markets ?? []) {
        const mapped = marketFrom(market.key);
        if (!mapped) continue;
        for (const outcome of market.outcomes ?? []) {
          const sideRaw = String(outcome.name ?? '').toUpperCase();
          const side = sideRaw === 'OVER' ? 'OVER' : sideRaw === 'UNDER' ? 'UNDER' : null;
          const player = String(outcome.description ?? '').replace(/\s*\([A-Z]{2,4}\)\s*$/i, '').trim();
          const line = Number(outcome.point);
          const price = Number(outcome.price);
          if (!side || !player || !Number.isFinite(line) || line < 0 || line >= 100) continue;
          out.push({
            player,
            market: mapped,
            line,
            book: String(book.title ?? book.key ?? 'Sportsbook'),
            odds: Number.isFinite(price) && price !== 0 ? price : null,
            side,
          });
        }
      }
    }
  }
  return out;
}

function collapseQuotes(quotes: Quote[]): WnbaVerifiedMarketLine[] {
  const groups = new Map<string, Quote[]>();
  for (const q of quotes) {
    const key = `${norm(q.player)}|${q.market}`;
    const arr = groups.get(key) ?? [];
    arr.push(q);
    groups.set(key, arr);
  }

  const out: WnbaVerifiedMarketLine[] = [];
  for (const group of groups.values()) {
    const lines = group.map(q => q.line).filter(Number.isFinite);
    const consensus = median(lines);
    if (!Number.isFinite(consensus)) continue;

    // PropLine carries alternate ladders. Use the line nearest the cross-book median
    // so an extreme alternate does not become the model comparison line.
    const nearest = [...group].sort((a, b) => {
      const da = Math.abs(a.line - consensus), db = Math.abs(b.line - consensus);
      if (da !== db) return da - db;
      const aPriced = a.odds === null ? 0 : 1, bPriced = b.odds === null ? 0 : 1;
      if (aPriced !== bPriced) return bPriced - aPriced;
      return (b.odds ?? -9999) - (a.odds ?? -9999);
    })[0];

    out.push({
      player: nearest.player,
      market: nearest.market,
      line: nearest.line,
      book: nearest.book || null,
      odds: nearest.odds,
    });
  }
  return out;
}

function buildPlayerSignals(quotes: Quote[]): Map<string, WnbaPlayerPropSignal> {
  const grouped = new Map<string, { player: string; markets: Set<WnbaPropMarketKey>; books: Set<string> }>();
  for (const quote of quotes) {
    const key = norm(quote.player);
    if (!key) continue;
    const row = grouped.get(key) ?? { player: quote.player, markets: new Set<WnbaPropMarketKey>(), books: new Set<string>() };
    row.markets.add(quote.market);
    if (quote.book) row.books.add(norm(quote.book));
    grouped.set(key, row);
  }
  return new Map([...grouped.entries()].map(([key, row]) => [key, {
    player: row.player,
    marketCount: row.markets.size,
    bookCount: row.books.size,
    markets: [...row.markets],
  }]));
}

async function fetchAllCurrentWnbaQuotes(): Promise<Quote[]> {
  const eventPayload = await propLineGet<unknown>('/sports/basketball_wnba/events', { cacheMs: 15 * 60 * 1000 });
  const events = eventsFrom(eventPayload);
  const allQuotes: Quote[] = [];
  await Promise.all(events.map(async event => {
    const id = event.id ?? event.event_id;
    if (id === undefined || id === null) return;
    try {
      const payload = await propLineGet<unknown>(
        `/sports/basketball_wnba/events/${encodeURIComponent(String(id))}/odds?markets=${PROP_MARKETS}`,
        { cacheMs: 15 * 60 * 1000 },
      );
      allQuotes.push(...parseQuotes(payload));
    } catch (error) {
      console.warn(`[WNBA Props] PropLine availability signal unavailable for event ${String(id)}:`, error);
    }
  }));
  return allQuotes;
}

/**
 * Supporting availability signal for projected lineups only. Active player props
 * can increase confidence that a player is expected to participate, but they do
 * not confirm a starter and they never change First Basket probability directly.
 */
export async function fetchWnbaPlayerPropSignals(force = false): Promise<Map<string, WnbaPlayerPropSignal>> {
  if (!process.env.PROPLINE_API_KEY?.trim()) return new Map();
  if (!force && signalCache && Date.now() - signalCache.at < SIGNAL_CACHE_MS) return signalCache.value;
  if (signalInFlight) return signalInFlight;
  signalInFlight = (async () => {
    try {
      const value = buildPlayerSignals(await fetchAllCurrentWnbaQuotes());
      signalCache = { at: Date.now(), value };
      return value;
    } catch (error) {
      console.warn('[WNBA Props] PropLine player availability signals unavailable:', error);
      return signalCache?.value ?? new Map<string, WnbaPlayerPropSignal>();
    } finally {
      signalInFlight = null;
    }
  })();
  return signalInFlight;
}

export async function fetchWnbaPropMarketLines(games: WnbaGame[]): Promise<WnbaVerifiedMarketLine[]> {
  if (!process.env.PROPLINE_API_KEY?.trim() || !games.length) return [];

  try {
    const eventPayload = await propLineGet<unknown>('/sports/basketball_wnba/events', { cacheMs: 15 * 60 * 1000 });
    const events = eventsFrom(eventPayload);
    const matched = games
      .map(game => ({ game, event: events.find(event => eventMatches(game, event)) }))
      .filter((x): x is { game: WnbaGame; event: PropEvent } => Boolean(x.event));

    const allQuotes: Quote[] = [];
    await Promise.all(matched.map(async ({ event }) => {
      const id = event.id ?? event.event_id;
      if (id === undefined || id === null) return;
      try {
        const payload = await propLineGet<unknown>(
          `/sports/basketball_wnba/events/${encodeURIComponent(String(id))}/odds?markets=${PROP_MARKETS}`,
          { cacheMs: 15 * 60 * 1000 },
        );
        allQuotes.push(...parseQuotes(payload));
      } catch (error) {
        console.warn(`[WNBA Props] PropLine odds unavailable for event ${String(id)}:`, error);
      }
    }));

    return collapseQuotes(allQuotes);
  } catch (error) {
    console.warn('[WNBA Props] PropLine events unavailable:', error);
    return [];
  }
}
