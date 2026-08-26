const PROPLINE_BASE = 'https://api.prop-line.com/v1';
const PROPLINE_NFL_KEY = 'football_nfl';
const ESPN_NFL_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100';
const CACHE_MS = 30 * 60 * 1000;
const PLAYER_PROP_LOOKAHEAD_MS = 5 * 24 * 60 * 60 * 1000;

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
type EspnEvent = { id?: string; date?: string; status?: { type?: { description?: string; state?: string } }; competitions?: { competitors?: EspnCompetitor[] }[] };
type PropEvent = { id?: string | number; event_id?: string | number; home_team?: string; away_team?: string; commence_time?: string };
type PropOutcome = { name?: string; description?: string; price?: number; book_updated_at?: string; last_change_at?: string };
type PropMarket = { key?: string; outcomes?: PropOutcome[] };
type PropBook = { key?: string; title?: string; last_update?: string; markets?: PropMarket[] };
type PropOdds = { id?: string | number; event_id?: string | number; home_team?: string; away_team?: string; bookmakers?: PropBook[] };

let cache: { expiresAt: number; value: NflMarketFeed } | null = null;

const NFL_TEAM_META: Record<string, { abbreviation: string; espnKey: string }> = {
  'arizona cardinals': { abbreviation: 'ARI', espnKey: 'ari' },
  'atlanta falcons': { abbreviation: 'ATL', espnKey: 'atl' },
  'baltimore ravens': { abbreviation: 'BAL', espnKey: 'bal' },
  'buffalo bills': { abbreviation: 'BUF', espnKey: 'buf' },
  'carolina panthers': { abbreviation: 'CAR', espnKey: 'car' },
  'chicago bears': { abbreviation: 'CHI', espnKey: 'chi' },
  'cincinnati bengals': { abbreviation: 'CIN', espnKey: 'cin' },
  'cleveland browns': { abbreviation: 'CLE', espnKey: 'cle' },
  'dallas cowboys': { abbreviation: 'DAL', espnKey: 'dal' },
  'denver broncos': { abbreviation: 'DEN', espnKey: 'den' },
  'detroit lions': { abbreviation: 'DET', espnKey: 'det' },
  'green bay packers': { abbreviation: 'GB', espnKey: 'gb' },
  'houston texans': { abbreviation: 'HOU', espnKey: 'hou' },
  'indianapolis colts': { abbreviation: 'IND', espnKey: 'ind' },
  'jacksonville jaguars': { abbreviation: 'JAX', espnKey: 'jax' },
  'kansas city chiefs': { abbreviation: 'KC', espnKey: 'kc' },
  'las vegas raiders': { abbreviation: 'LV', espnKey: 'lv' },
  'los angeles chargers': { abbreviation: 'LAC', espnKey: 'lac' },
  'los angeles rams': { abbreviation: 'LAR', espnKey: 'lar' },
  'miami dolphins': { abbreviation: 'MIA', espnKey: 'mia' },
  'minnesota vikings': { abbreviation: 'MIN', espnKey: 'min' },
  'new england patriots': { abbreviation: 'NE', espnKey: 'ne' },
  'new orleans saints': { abbreviation: 'NO', espnKey: 'no' },
  'new york giants': { abbreviation: 'NYG', espnKey: 'nyg' },
  'new york jets': { abbreviation: 'NYJ', espnKey: 'nyj' },
  'philadelphia eagles': { abbreviation: 'PHI', espnKey: 'phi' },
  'pittsburgh steelers': { abbreviation: 'PIT', espnKey: 'pit' },
  'san francisco 49ers': { abbreviation: 'SF', espnKey: 'sf' },
  'seattle seahawks': { abbreviation: 'SEA', espnKey: 'sea' },
  'tampa bay buccaneers': { abbreviation: 'TB', espnKey: 'tb' },
  'tennessee titans': { abbreviation: 'TEN', espnKey: 'ten' },
  'washington commanders': { abbreviation: 'WSH', espnKey: 'wsh' },
};

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

function oddsRows(payload: unknown): PropOdds[] {
  if (Array.isArray(payload)) return payload as PropOdds[];
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    if (Array.isArray(row.events)) return row.events as PropOdds[];
    if (Array.isArray(row.data)) return row.data as PropOdds[];
    return [payload as PropOdds];
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
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`PropLine ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function teamMeta(name: string): { abbreviation: string; logo: string | null } {
  const key = name.trim().toLowerCase();
  const meta = NFL_TEAM_META[key];
  if (!meta) {
    const parts = name.trim().split(/\s+/);
    const abbreviation = parts.map(part => part[0]).join('').slice(0, 3).toUpperCase() || 'NFL';
    return { abbreviation, logo: null };
  }
  return {
    abbreviation: meta.abbreviation,
    logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${meta.espnKey}.png`,
  };
}

function eventMatchesNames(homeName: string, awayName: string, event: PropEvent): boolean {
  const home = normalize(event.home_team ?? '');
  const away = normalize(event.away_team ?? '');
  const expectedHome = normalize(homeName);
  const expectedAway = normalize(awayName);
  return Boolean(home && away &&
    (home === expectedHome || home.includes(expectedHome) || expectedHome.includes(home)) &&
    (away === expectedAway || away.includes(expectedAway) || expectedAway.includes(away)));
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
  for (const row of oddsRows(payload)) for (const book of row.bookmakers ?? []) for (const market of book.markets ?? []) {
    if (market.key !== marketKey) continue;
    for (const outcome of market.outcomes ?? []) {
      const name = String(outcome.name ?? '').trim();
      const description = String(outcome.description ?? '').trim();
      const player = description && !/^(yes|no)$/i.test(description) ? description : name;
      if (!player || /^(yes|no)$/i.test(player) || /^no$/i.test(name)) continue;
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
  }).sort((a, b) => b.impliedProbability - a.impliedProbability || b.quoteCount - a.quoteCount).slice(0, 20);
}

function buildMoneyline(payload: unknown, game: NflMarketGame): NflMarketGame['moneyline'] {
  const awayQuotes: NflBookQuote[] = [];
  const homeQuotes: NflBookQuote[] = [];
  const paired: { away: number; home: number }[] = [];
  for (const row of oddsRows(payload)) for (const book of row.bookmakers ?? []) for (const market of book.markets ?? []) {
    if (market.key !== 'h2h') continue;
    let awayPrice: number | null = null;
    let homePrice: number | null = null;
    for (const outcome of market.outcomes ?? []) {
      const outcomeTeam = normalize(String(outcome.name ?? outcome.description ?? ''));
      const q = quote(book, outcome);
      if (!q) continue;
      const awayName = normalize(game.away.name);
      const homeName = normalize(game.home.name);
      const isAway = outcomeTeam === awayName || outcomeTeam === normalize(game.away.abbreviation) || outcomeTeam.includes(awayName) || awayName.includes(outcomeTeam);
      const isHome = outcomeTeam === homeName || outcomeTeam === normalize(game.home.abbreviation) || outcomeTeam.includes(homeName) || homeName.includes(outcomeTeam);
      if (isAway) { awayQuotes.push(q); awayPrice = q.americanOdds; }
      if (isHome) { homeQuotes.push(q); homePrice = q.americanOdds; }
    }
    if (awayPrice !== null && homePrice !== null) {
      const awayProb = americanImplied(awayPrice);
      const homeProb = americanImplied(homePrice);
      if (awayProb !== null && homeProb !== null && awayProb + homeProb > 0) {
        paired.push({ away: awayProb / (awayProb + homeProb), home: homeProb / (awayProb + homeProb) });
      }
    }
  }
  if (!awayQuotes.length || !homeQuotes.length) return null;
  awayQuotes.sort((a, b) => b.americanOdds - a.americanOdds);
  homeQuotes.sort((a, b) => b.americanOdds - a.americanOdds);
  const avgAway = paired.length ? paired.reduce((sum, row) => sum + row.away, 0) / paired.length : null;
  const avgHome = paired.length ? paired.reduce((sum, row) => sum + row.home, 0) / paired.length : null;
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
  const now = Date.now();
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
  }).filter(game => game.id && game.date && new Date(game.date).getTime() > now - 60 * 60 * 1000);
}

function gameFromPropEvent(event: PropEvent, espnGames: NflMarketGame[]): NflMarketGame | null {
  const eventId = event.id ?? event.event_id;
  const date = String(event.commence_time ?? '');
  const homeName = String(event.home_team ?? '').trim();
  const awayName = String(event.away_team ?? '').trim();
  if (eventId === undefined || eventId === null || !date || !homeName || !awayName) return null;
  if (new Date(date).getTime() <= Date.now() - 60 * 60 * 1000) return null;

  const espn = espnGames.find(game => eventMatchesNames(game.home.name, game.away.name, event));
  const awayMeta = teamMeta(awayName);
  const homeMeta = teamMeta(homeName);
  return {
    id: String(eventId),
    date,
    status: espn?.status ?? 'Scheduled',
    away: {
      abbreviation: espn?.away.abbreviation ?? awayMeta.abbreviation,
      name: awayName,
      logo: espn?.away.logo ?? awayMeta.logo,
      record: espn?.away.record ?? null,
    },
    home: {
      abbreviation: espn?.home.abbreviation ?? homeMeta.abbreviation,
      name: homeName,
      logo: espn?.home.logo ?? homeMeta.logo,
      record: espn?.home.record ?? null,
    },
    marketStatus: 'unavailable',
    moneyline: null,
    anytimeTd: [],
    firstTd: [],
  };
}

export async function fetchNflMarkets(): Promise<NflMarketFeed> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  let espnGames: NflMarketGame[] = [];
  try {
    espnGames = await fetchEspnGames();
  } catch (error) {
    console.warn('[NFL Markets] ESPN enrichment unavailable:', error);
  }

  const apiKey = process.env.PROPLINE_API_KEY?.trim();
  if (!apiKey) {
    return { source: 'ESPN + PropLine', marketStatus: 'disabled', updatedAt: new Date().toISOString(), games: espnGames };
  }

  try {
    const eventsPayload = await propFetch<unknown>(`/sports/${PROPLINE_NFL_KEY}/events`, apiKey);
    const propEvents = arr<PropEvent>(eventsPayload);
    const games = propEvents
      .map(event => gameFromPropEvent(event, espnGames))
      .filter((game): game is NflMarketGame => Boolean(game))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Use PropLine's bulk endpoint for game markets. This is both more reliable
    // and much cheaper on API credits than one h2h request per matchup.
    let bulkMoneyline: unknown = [];
    try {
      bulkMoneyline = await propFetch<unknown>(`/sports/${PROPLINE_NFL_KEY}/odds?markets=h2h`, apiKey);
    } catch (error) {
      console.warn('[NFL Markets] Bulk moneyline unavailable:', error);
    }

    for (const game of games) {
      const bulkRow = oddsRows(bulkMoneyline).find(row => {
        const rowEvent: PropEvent = {
          id: row.id,
          event_id: row.event_id,
          home_team: row.home_team,
          away_team: row.away_team,
        };
        return eventMatchesNames(game.home.name, game.away.name, rowEvent);
      });
      if (bulkRow) game.moneyline = buildMoneyline(bulkRow, game);
    }

    // Player touchdown markets tend to appear closer to kickoff. Avoid burning
    // requests on distant games where books have not posted props yet.
    const now = Date.now();
    const propEligible = games.filter(game => {
      const kickoff = new Date(game.date).getTime();
      return Number.isFinite(kickoff) && kickoff >= now && kickoff - now <= PLAYER_PROP_LOOKAHEAD_MS;
    });

    await Promise.all(propEligible.map(async game => {
      try {
        const payload = await propFetch<unknown>(
          `/sports/${PROPLINE_NFL_KEY}/events/${encodeURIComponent(game.id)}/odds?markets=player_anytime_td,player_1st_td`,
          apiKey,
        );
        game.anytimeTd = buildPlayerMarkets(payload, 'player_anytime_td');
        game.firstTd = buildPlayerMarkets(payload, 'player_1st_td');
      } catch (error) {
        console.warn(`[NFL Markets] TD props unavailable for ${game.id}:`, error);
      }
    }));

    for (const game of games) {
      game.marketStatus = game.moneyline || game.anytimeTd.length || game.firstTd.length ? 'available' : 'unavailable';
    }

    const value: NflMarketFeed = {
      source: 'ESPN + PropLine',
      marketStatus: games.some(game => game.marketStatus === 'available') ? 'available' : 'unavailable',
      updatedAt: new Date().toISOString(),
      games,
    };
    cache = { expiresAt: Date.now() + CACHE_MS, value };
    return value;
  } catch (error) {
    console.warn('[NFL Markets] PropLine feed unavailable:', error);
    const value: NflMarketFeed = {
      source: 'ESPN + PropLine',
      marketStatus: 'unavailable',
      updatedAt: new Date().toISOString(),
      games: espnGames,
    };
    cache = { expiresAt: Date.now() + 2 * 60 * 1000, value };
    return value;
  }
}
