const PROPLINE_BASE = 'https://api.prop-line.com/v1';
const CACHE_MS = 10 * 60 * 1000;
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
  source: 'PropLine';
  marketStatus: 'available' | 'unavailable' | 'disabled';
  updatedAt: string;
  games: NflMarketGame[];
};

type PropOutcome = { name?: string; description?: string; price?: number; book_updated_at?: string; last_change_at?: string };
type PropMarket = { key?: string; outcomes?: PropOutcome[] };
type PropBook = { key?: string; title?: string; last_update?: string; markets?: PropMarket[] };
type PropOdds = {
  id?: string | number;
  event_id?: string | number;
  home_team?: string;
  away_team?: string;
  commence_time?: string;
  bookmakers?: PropBook[];
};

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

function oddsRows(payload: unknown): PropOdds[] {
  if (Array.isArray(payload)) return payload as PropOdds[];
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    if (Array.isArray(row.events)) return row.events as PropOdds[];
    if (Array.isArray(row.data)) return row.data as PropOdds[];
    if (row.data && typeof row.data === 'object') {
      const nested = row.data as Record<string, unknown>;
      if (Array.isArray(nested.events)) return nested.events as PropOdds[];
      if (Array.isArray(nested.data)) return nested.data as PropOdds[];
    }
    if ('bookmakers' in row || 'home_team' in row || 'away_team' in row) return [payload as PropOdds];
  }
  return [];
}

async function propFetch<T>(path: string, apiKey: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const separator = path.includes('?') ? '&' : '?';
    const response = await fetch(`${PROPLINE_BASE}${path}${separator}apiKey=${encodeURIComponent(apiKey)}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PreziTools/1.0' },
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
  const meta = NFL_TEAM_META[name.trim().toLowerCase()];
  if (!meta) {
    const abbreviation = name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 3).toUpperCase() || 'NFL';
    return { abbreviation, logo: null };
  }
  return { abbreviation: meta.abbreviation, logo: `https://a.espncdn.com/i/teamlogos/nfl/500/${meta.espnKey}.png` };
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

function buildMoneyline(row: PropOdds, awayName: string, homeName: string): NflMarketGame['moneyline'] {
  const awayQuotes: NflBookQuote[] = [];
  const homeQuotes: NflBookQuote[] = [];
  const paired: { away: number; home: number }[] = [];
  const awayNorm = normalize(awayName);
  const homeNorm = normalize(homeName);

  for (const book of row.bookmakers ?? []) for (const market of book.markets ?? []) {
    if (market.key !== 'h2h') continue;
    let awayPrice: number | null = null;
    let homePrice: number | null = null;
    for (const outcome of market.outcomes ?? []) {
      const outcomeTeam = normalize(String(outcome.name ?? outcome.description ?? ''));
      const q = quote(book, outcome);
      if (!q) continue;
      const isAway = outcomeTeam === awayNorm || outcomeTeam.includes(awayNorm) || awayNorm.includes(outcomeTeam);
      const isHome = outcomeTeam === homeNorm || outcomeTeam.includes(homeNorm) || homeNorm.includes(outcomeTeam);
      if (isAway) { awayQuotes.push(q); awayPrice = q.americanOdds; }
      if (isHome) { homeQuotes.push(q); homePrice = q.americanOdds; }
    }
    if (awayPrice !== null && homePrice !== null) {
      const awayProb = americanImplied(awayPrice);
      const homeProb = americanImplied(homePrice);
      if (awayProb !== null && homeProb !== null && awayProb + homeProb > 0) paired.push({ away: awayProb / (awayProb + homeProb), home: homeProb / (awayProb + homeProb) });
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
  return { away: side(awayName, awayQuotes, avgAway), home: side(homeName, homeQuotes, avgHome) };
}

function gameFromBulkRow(row: PropOdds): NflMarketGame | null {
  const id = String(row.id ?? row.event_id ?? '').trim();
  const date = String(row.commence_time ?? '').trim();
  const awayName = String(row.away_team ?? '').trim();
  const homeName = String(row.home_team ?? '').trim();
  if (!id || !date || !awayName || !homeName) return null;
  const awayMeta = teamMeta(awayName);
  const homeMeta = teamMeta(homeName);
  const moneyline = buildMoneyline(row, awayName, homeName);
  return {
    id,
    date,
    status: 'Scheduled',
    away: { abbreviation: awayMeta.abbreviation, name: awayName, logo: awayMeta.logo, record: null },
    home: { abbreviation: homeMeta.abbreviation, name: homeName, logo: homeMeta.logo, record: null },
    marketStatus: moneyline ? 'available' : 'unavailable',
    moneyline,
    anytimeTd: [],
    firstTd: [],
  };
}

export async function fetchNflMarkets(): Promise<NflMarketFeed> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const apiKey = process.env.PROPLINE_API_KEY?.trim();
  if (!apiKey) return { source: 'PropLine', marketStatus: 'disabled', updatedAt: new Date().toISOString(), games: [] };

  try {
    // PropLine documents NFL game lines as live year-round. Use the bulk h2h payload
    // itself as the upcoming slate so Week 1 moneylines can populate even before props.
    const bulkPayload = await propFetch<unknown>('/sports/football_nfl/odds?markets=h2h', apiKey);
    const games = oddsRows(bulkPayload)
      .map(gameFromBulkRow)
      .filter((game): game is NflMarketGame => Boolean(game))
      .filter(game => new Date(game.date).getTime() > Date.now() - 60 * 60 * 1000)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Current PropLine docs say NFL player props activate with the regular season.
    // Only ask for them near kickoff so we preserve API credits while still filling
    // Anytime TD and First TD automatically as soon as books post those markets.
    await Promise.all(games.map(async game => {
      const startsIn = new Date(game.date).getTime() - Date.now();
      if (!Number.isFinite(startsIn) || startsIn < 0 || startsIn > PLAYER_PROP_LOOKAHEAD_MS) return;
      try {
        const payload = await propFetch<unknown>(`/sports/football_nfl/events/${encodeURIComponent(game.id)}/odds?markets=player_anytime_td,player_1st_td`, apiKey);
        game.anytimeTd = buildPlayerMarkets(payload, 'player_anytime_td');
        game.firstTd = buildPlayerMarkets(payload, 'player_1st_td');
        if (game.anytimeTd.length || game.firstTd.length) game.marketStatus = 'available';
      } catch (error) {
        console.warn(`[NFL Markets] TD props unavailable for ${game.id}:`, error);
      }
    }));

    const value: NflMarketFeed = {
      source: 'PropLine',
      marketStatus: games.some(game => game.marketStatus === 'available') ? 'available' : 'unavailable',
      updatedAt: new Date().toISOString(),
      games,
    };
    cache = { expiresAt: Date.now() + CACHE_MS, value };
    return value;
  } catch (error) {
    console.warn('[NFL Markets] PropLine feed unavailable:', error);
    const value: NflMarketFeed = { source: 'PropLine', marketStatus: 'unavailable', updatedAt: new Date().toISOString(), games: [] };
    cache = { expiresAt: Date.now() + 2 * 60 * 1000, value };
    return value;
  }
}
