const PROPLINE_BASE = 'https://api.prop-line.com/v1';
const ESPN_NFL_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100';
const CACHE_MS = 10 * 60 * 1000;

export type NflBookQuote = {
  bookmaker: string;
  bookmakerKey: string;
  americanOdds: number;
  updatedAt: string | null;
};

export type NflPlayerMarket = {
  player: string;
  bestOdds: number;
  bestBook: string;
  impliedProbability: number;
  quoteCount: number;
  quotes: NflBookQuote[];
};

export type NflMoneylineSide = {
  team: string;
  bestOdds: number | null;
  bestBook: string | null;
  impliedProbability: number | null;
  consensusNoVigProbability: number | null;
  quotes: NflBookQuote[];
};

export type NflMarketGame = {
  id: string;
  date: string;
  status: string;
  away: { abbreviation: string; name: string; logo: string | null; record: string | null };
  home: { abbreviation: string; name: string; logo: string | null; record: string | null };
  marketStatus: 'available' | 'unavailable';
  moneyline: { away: NflMoneylineSide; home: NflMoneylineSide } | null;
  anytimeTd: NflPlayerMarket[];
  firstTd: NflPlayerMarket[];
};

export type NflMarketFeed = {
  source: 'ESPN + PropLine';
  marketStatus: 'available' | 'unavailable' | 'disabled';
  updatedAt: string;
  games: NflMarketGame[];
};

type EspnCompetitor = { homeAway?: string; team?: { abbreviation?: string; displayName?: string; logo?: string }; records?: { summary?: string }[] };
type EspnEvent = { id?: string; date?: string; status?: { type?: { description?: string } }; competitions?: { competitors?: EspnCompetitor[] }[] };
type PropEvent = { id?: string | number; event_id?: string | number; home_team?: string; away_team?: string; commence_time?: string };
type PropOutcome = { name?: string; description?: string; price?: number; book_updated_at?: string; last_change_at?: string };
type PropMarket = { key?: string; outcomes?: PropOutcome[] };
type PropBook = { key?: string; title?: string; last_update?: string; markets?: PropMarket[] };
type PropOdds = { bookmakers?: PropBook[] };

let cache: { expiresAt: number; value: NflMarketFeed } | null = null;

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function americanImplied(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function arr<T>(payload: unknown, key?: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    if (key && Array.isArray(row[key])) return row[key] as T[];
    if (Array.isArray(row.events)) return row.events as T[];
    if (Array.isArray(row.data)) return row.data as T[];
  }
  return [];
}

async function propFetch<T>(path: string, apiKey: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
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

function eventMatches(game: NflMarketGame, event: PropEvent): boolean {
  const home = normalize(event.home_team ?? '');
  const away = normalize(event.away_team ?? '');
  const gameHome = normalize(game.home.name);
  const gameAway = normalize(game.away.name);
  const teamsMatch = home && away && (home === gameHome || home.includes(gameHome) || gameHome.includes(home)) && (away === gameAway || away.includes(gameAway) || gameAway.includes(away));
  if (!teamsMatch) return false;
  if (!event.commence_time) return true;
  const a = new Date(event.commence_time).getTime();
  const b = new Date(game.date).getTime();
  return !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) <= 4 * 60 * 60 * 1000;
}

function quote(book: PropBook, outcome: PropOutcome): NflBookQuote | null {
  const americanOdds = Number(outcome.price);
  if (!Number.isFinite(americanOdds) || americanOdds === 0) return null;
  return {
    bookmaker: String(book.title ?? book.key ?? 'Sportsbook'),
    bookmakerKey: String(book.key ?? ''),
    americanOdds,
    updatedAt: outcome.book_updated_at ?? outcome.last_change_at ?? book.last_update ?? null,
  };
}

function buildPlayerMarkets(payload: unknown, marketKey: string): NflPlayerMarket[] {
  const byPlayer = new Map<string, { player: string; quotes: NflBookQuote[] }>();
  const oddsRows = Array.isArray(payload) ? payload as PropOdds[] : [payload as PropOdds];
  for (const row of oddsRows) for (const book of row?.bookmakers ?? []) for (const market of book.markets ?? []) {
    if (market.key !== marketKey) continue;
    for (const outcome of market.outcomes ?? []) {
      const name = String(outcome.name ?? '').trim();
      const description = String(outcome.description ?? '').trim();
      const player = (description && !/^(yes|no)$/i.test(description)) ? description : name;
      if (!player || /^(yes|no)$/i.test(player)) continue;
      if (name && /^(no)$/i.test(name)) continue;
      const q = quote(book, outcome);
      if (!q) continue;
      const key = normalize(player);
      const entry = byPlayer.get(key) ?? { player, quotes: [] };
      entry.quotes.push(q);
      byPlayer.set(key, entry);
    }
  }
  return [...byPlayer.values()].map(entry => {
    entry.quotes.sort((a, b) => b.americanOdds - a.americanOdds);
    const best = entry.quotes[0];
    return {
      player: entry.player,
      bestOdds: best.americanOdds,
      bestBook: best.bookmaker,
      impliedProbability: (americanImplied(best.americanOdds) ?? 0) * 100,
      quoteCount: entry.quotes.length,
      quotes: entry.quotes,
    };
  }).sort((a, b) => b.impliedProbability - a.impliedProbability || b.quoteCount - a.quoteCount).slice(0, 16);
}

function buildMoneyline(payload: unknown, game: NflMarketGame): NflMarketGame['moneyline'] {
  const awayQuotes: NflBookQuote[] = [];
  const homeQuotes: NflBookQuote[] = [];
  const paired: { away: number; home: number }[] = [];
  const oddsRows = Array.isArray(payload) ? payload as PropOdds[] : [payload as PropOdds];
  for (const row of oddsRows) for (const book of row?.bookmakers ?? []) for (const market of book.markets ?? []) {
    if (market.key !== 'h2h') continue;
    let awayPrice: number | null = null;
    let homePrice: number | null = null;
    for (const outcome of market.outcomes ?? []) {
      const outcomeTeam = normalize(String(outcome.name ?? outcome.description ?? ''));
      const q = quote(book, outcome);
      if (!q) continue;
      const isAway = outcomeTeam === normalize(game.away.name) || outcomeTeam === normalize(game.away.abbreviation) || outcomeTeam.includes(normalize(game.away.name));
      const isHome = outcomeTeam === normalize(game.home.name) || outcomeTeam === normalize(game.home.abbreviation) || outcomeTeam.includes(normalize(game.home.name));
      if (isAway) { awayQuotes.push(q); awayPrice = q.americanOdds; }
      if (isHome) { homeQuotes.push(q); homePrice = q.americanOdds; }
    }
    if (awayPrice !== null && homePrice !== null) {
      const a = americanImplied(awayPrice); const h = americanImplied(homePrice);
      if (a !== null && h !== null && a + h > 0) paired.push({ away: a / (a + h), home: h / (a + h) });
    }
  }
  if (!awayQuotes.length || !homeQuotes.length) return null;
  awayQuotes.sort((a, b) => b.americanOdds - a.americanOdds);
  homeQuotes.sort((a, b) => b.americanOdds - a.americanOdds);
  const avgAway = paired.length ? paired.reduce((s, x) => s + x.away, 0) / paired.length : null;
  const avgHome = paired.length ? paired.reduce((s, x) => s + x.home, 0) / paired.length : null;
  const side = (team: string, quotes: NflBookQuote[], noVig: number | null): NflMoneylineSide => ({
    team,
    bestOdds: quotes[0]?.americanOdds ?? null,
    bestBook: quotes[0]?.bookmaker ?? null,
    impliedProbability: quotes[0] ? (americanImplied(quotes[0].americanOdds) ?? 0) * 100 : null,
    consensusNoVigProbability: noVig === null ? null : noVig * 100,
    quotes,
  });
  return { away: side(game.away.name, awayQuotes, avgAway), home: side(game.home.name, homeQuotes, avgHome) };
}

async function fetchEspnGames(): Promise<NflMarketGame[]> {
  const response = await fetch(ESPN_NFL_SCOREBOARD, { signal: AbortSignal.timeout(9000) });
  if (!response.ok) throw new Error(`ESPN NFL ${response.status}`);
  const payload = await response.json() as { events?: EspnEvent[] };
  return (payload.events ?? []).map(event => {
    const competitors = event.competitions?.[0]?.competitors ?? [];
    const away = competitors.find(c => c.homeAway === 'away');
    const home = competitors.find(c => c.homeAway === 'home');
    return {
      id: String(event.id ?? ''),
      date: String(event.date ?? ''),
      status: event.status?.type?.description ?? 'Scheduled',
      away: { abbreviation: away?.team?.abbreviation ?? 'AWAY', name: away?.team?.displayName ?? 'Away', logo: away?.team?.logo ?? null, record: away?.records?.[0]?.summary ?? null },
      home: { abbreviation: home?.team?.abbreviation ?? 'HOME', name: home?.team?.displayName ?? 'Home', logo: home?.team?.logo ?? null, record: home?.records?.[0]?.summary ?? null },
      marketStatus: 'unavailable' as const,
      moneyline: null,
      anytimeTd: [],
      firstTd: [],
    };
  }).filter(game => game.id && game.date);
}

export async function fetchNflMarkets(): Promise<NflMarketFeed> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const games = await fetchEspnGames();
  const apiKey = process.env.PROPLINE_API_KEY?.trim();
  if (!apiKey) return { source: 'ESPN + PropLine', marketStatus: 'disabled', updatedAt: new Date().toISOString(), games };
  try {
    const eventsPayload = await propFetch<unknown>('/sports/americanfootball_nfl/events', apiKey);
    const events = arr<PropEvent>(eventsPayload);
    await Promise.all(games.map(async game => {
      const event = events.find(row => eventMatches(game, row));
      const eventId = event?.id ?? event?.event_id;
      if (eventId === undefined || eventId === null) return;
      try {
        const payload = await propFetch<unknown>(`/sports/americanfootball_nfl/events/${encodeURIComponent(String(eventId))}/odds?markets=h2h,player_anytime_td,player_1st_td`, apiKey);
        game.moneyline = buildMoneyline(payload, game);
        game.anytimeTd = buildPlayerMarkets(payload, 'player_anytime_td');
        game.firstTd = buildPlayerMarkets(payload, 'player_1st_td');
        game.marketStatus = game.moneyline || game.anytimeTd.length || game.firstTd.length ? 'available' : 'unavailable';
      } catch (error) {
        console.warn(`[NFL Markets] PropLine odds unavailable for ${game.id}:`, error);
      }
    }));
    const value: NflMarketFeed = {
      source: 'ESPN + PropLine',
      marketStatus: games.some(g => g.marketStatus === 'available') ? 'available' : 'unavailable',
      updatedAt: new Date().toISOString(),
      games,
    };
    cache = { expiresAt: Date.now() + CACHE_MS, value };
    return value;
  } catch (error) {
    console.warn('[NFL Markets] PropLine feed unavailable:', error);
    const value: NflMarketFeed = { source: 'ESPN + PropLine', marketStatus: 'unavailable', updatedAt: new Date().toISOString(), games };
    cache = { expiresAt: Date.now() + 2 * 60 * 1000, value };
    return value;
  }
}
