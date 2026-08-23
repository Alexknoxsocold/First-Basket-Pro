import {
  expectedValuePerDollar,
  formatAmericanOdds,
  modelEdgePoints,
  parseAmericanOdds,
  qualifiesAsMarketValue,
} from './normalized';

const PARLAY_URL = 'https://parlay-api.com/v1/sports/basketball_wnba/props';
// The free plan has 1,000 credits/month and a props snapshot costs credits.
// Keep one shared market snapshot for 20 minutes so normal page refreshes do
// not burn through the allowance. The WNBA slate can still refresh its model
// data more frequently without re-requesting sportsbook prices each time.
const CACHE_TTL_MS = 20 * 60 * 1000;

type ParlayPropRow = Record<string, unknown>;

export type WnbaFirstBasketMarket = {
  source: 'ParlayAPI';
  market: 'player_first_basket';
  bestOdds: number;
  bestOddsDisplay: string;
  bestBook: string;
  fanduelOdds: number | null;
  draftkingsOdds: number | null;
  impliedProbability: number;
  edgePoints: number;
  expectedValue: number;
  qualifiesValue: boolean;
  lastUpdate: string | null;
};

export type ParlayWnbaDiagnostics = {
  keyConfigured: boolean;
  endpoint: string;
  cacheAgeSeconds: number | null;
  rawRowCount: number;
  firstBasketRowCount: number;
  marketKeys: string[];
  books: string[];
  draftkingsRows: number;
  fanduelRows: number;
  sample: Array<{
    player: string;
    market: string;
    book: string;
    odds: number | null;
  }>;
  lastFetchAt: string | null;
  lastHttpStatus: number | null;
  payloadShape: string;
};

let cache: { at: number; rows: ParlayPropRow[] } | null = null;
let inFlight: Promise<ParlayPropRow[]> | null = null;
let diagnostics: ParlayWnbaDiagnostics = {
  keyConfigured: Boolean(process.env.PARLAY_API_KEY),
  endpoint: PARLAY_URL,
  cacheAgeSeconds: null,
  rawRowCount: 0,
  firstBasketRowCount: 0,
  marketKeys: [],
  books: [],
  draftkingsRows: 0,
  fanduelRows: 0,
  sample: [],
  lastFetchAt: null,
  lastHttpStatus: null,
  payloadShape: 'not-fetched',
};

function normalizeName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.'’\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowPlayer(row: ParlayPropRow): string {
  return String(row.player ?? row.player_name ?? row.athlete ?? row.selection ?? '').trim();
}

function rowMarket(row: ParlayPropRow): string {
  return String(row.market_key ?? row.market ?? row.marketKey ?? row.market_name ?? '').trim();
}

function rowBookKey(row: ParlayPropRow): string {
  return String(row.bookmaker ?? row.source ?? row.bookmaker_key ?? row.book ?? '').toLowerCase().trim();
}

function rowBookTitle(row: ParlayPropRow): string {
  const key = rowBookKey(row);
  const title = String(row.bookmaker_title ?? row.source_title ?? row.bookmaker_name ?? row.book_name ?? '').trim();
  if (title) return title;
  if (key === 'fanduel') return 'FanDuel';
  if (key === 'draftkings') return 'DraftKings';
  return key || 'Sportsbook';
}

function rowOdds(row: ParlayPropRow): number | null {
  // ParlayAPI's REST props shape is normally over_price/under_price. One-way
  // scorer markets can also surface a direct price depending on the source.
  // Accept all documented/stream-compatible aliases and never infer a price.
  const values = [row.price_american, row.price, row.over_price, row.odds, row.american_odds];
  for (const value of values) {
    const parsed = parseAmericanOdds(value as string | number | null | undefined);
    if (parsed !== null) return parsed;
  }
  return null;
}

function rowLastUpdate(row: ParlayPropRow): string | null {
  const raw = row.last_update ?? row.snapshot_time ?? row.updated_at;
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    const d = new Date(raw > 10_000_000_000 ? raw : raw * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function payloadShape(payload: any): string {
  if (Array.isArray(payload)) return 'array';
  if (!payload || typeof payload !== 'object') return typeof payload;
  const keys = Object.keys(payload).slice(0, 12);
  const arrays = keys.filter(key => Array.isArray(payload[key]));
  return `object keys=[${keys.join(',')}] arrays=[${arrays.join(',')}]`;
}

function extractRows(payload: any): ParlayPropRow[] {
  if (Array.isArray(payload)) return payload;
  const direct = [payload?.data, payload?.results, payload?.props, payload?.markets, payload?.items];
  for (const candidate of direct) if (Array.isArray(candidate)) return candidate;
  // Some APIs wrap data one level deeper. Inspect common containers without
  // recursively walking arbitrary payloads or logging private response data.
  for (const container of direct) {
    if (!container || typeof container !== 'object' || Array.isArray(container)) continue;
    for (const value of Object.values(container)) if (Array.isArray(value)) return value as ParlayPropRow[];
  }
  return [];
}

function updateDiagnostics(rawRows: ParlayPropRow[], firstBasketRows: ParlayPropRow[], status: number | null, shape: string) {
  const marketKeys = [...new Set(rawRows.map(rowMarket).filter(Boolean))].sort();
  const books = [...new Set(rawRows.map(rowBookKey).filter(Boolean))].sort();
  diagnostics = {
    keyConfigured: Boolean(process.env.PARLAY_API_KEY),
    endpoint: PARLAY_URL,
    cacheAgeSeconds: 0,
    rawRowCount: rawRows.length,
    firstBasketRowCount: firstBasketRows.length,
    marketKeys: marketKeys.slice(0, 30),
    books: books.slice(0, 20),
    draftkingsRows: rawRows.filter(row => rowBookKey(row) === 'draftkings').length,
    fanduelRows: rawRows.filter(row => rowBookKey(row) === 'fanduel').length,
    sample: rawRows.slice(0, 8).map(row => ({
      player: rowPlayer(row),
      market: rowMarket(row),
      book: rowBookTitle(row),
      odds: rowOdds(row),
    })),
    lastFetchAt: new Date().toISOString(),
    lastHttpStatus: status,
    payloadShape: shape,
  };
}

async function requestRows(): Promise<ParlayPropRow[]> {
  const apiKey = process.env.PARLAY_API_KEY;
  if (!apiKey) {
    console.warn('[ParlayAPI] PARLAY_API_KEY is not configured');
    diagnostics = { ...diagnostics, keyConfigured: false, lastFetchAt: new Date().toISOString() };
    return [];
  }

  const url = new URL(PARLAY_URL);
  url.searchParams.set('markets', 'player_first_basket');
  url.searchParams.set('bookmakers', 'fanduel,draftkings');
  url.searchParams.set('include', 'slim');
  url.searchParams.set('limit', '1000');
  // Do not use maxAgeSec here. First-basket boards can be posted hours before
  // tip without changing; filtering by quote age can incorrectly hide a still-
  // valid market. We surface lastUpdate separately instead.

  try {
    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.warn(`[ParlayAPI] WNBA first-basket request failed: ${response.status}`);
      diagnostics = { ...diagnostics, keyConfigured: true, lastFetchAt: new Date().toISOString(), lastHttpStatus: response.status };
      return cache?.rows ?? [];
    }
    const payload = await response.json();
    const shape = payloadShape(payload);
    const rows = extractRows(payload);
    const firstBasketRows = rows.filter((row: ParlayPropRow) => {
      const market = rowMarket(row).toLowerCase();
      return market === 'player_first_basket' || market.includes('first_basket') || market.includes('first point scorer');
    });
    cache = { at: Date.now(), rows: firstBasketRows };
    updateDiagnostics(rows, firstBasketRows, response.status, shape);

    // Safe operational diagnostics: no API key and no raw provider payload.
    console.log('[ParlayAPI][WNBA diagnostics]', JSON.stringify({
      httpStatus: diagnostics.lastHttpStatus,
      payloadShape: diagnostics.payloadShape,
      rawRows: diagnostics.rawRowCount,
      firstBasketRows: diagnostics.firstBasketRowCount,
      markets: diagnostics.marketKeys,
      books: diagnostics.books,
      draftkingsRows: diagnostics.draftkingsRows,
      fanduelRows: diagnostics.fanduelRows,
      sample: diagnostics.sample,
    }));
    return firstBasketRows;
  } catch (error) {
    console.warn('[ParlayAPI] WNBA first-basket request error:', error);
    diagnostics = { ...diagnostics, keyConfigured: true, lastFetchAt: new Date().toISOString(), lastHttpStatus: null };
    return cache?.rows ?? [];
  }
}

async function fetchRows(): Promise<ParlayPropRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  // Candidate enrichment runs in parallel for up to 10 players. Share one
  // provider request across all of them instead of spending credits per player.
  if (inFlight) return inFlight;
  inFlight = requestRows();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function getParlayWnbaDiagnostics(): ParlayWnbaDiagnostics {
  return {
    ...diagnostics,
    cacheAgeSeconds: cache ? Math.round((Date.now() - cache.at) / 1000) : null,
    sample: diagnostics.sample.map(row => ({ ...row })),
    marketKeys: [...diagnostics.marketKeys],
    books: [...diagnostics.books],
  };
}

export async function getWnbaFirstBasketMarket(
  playerName: string,
  modelProbabilityPct: number,
  rank: number,
): Promise<WnbaFirstBasketMarket | null> {
  const rows = await fetchRows();
  const target = normalizeName(playerName);
  const matches = rows
    .filter(row => normalizeName(rowPlayer(row)) === target)
    .map(row => ({ row, odds: rowOdds(row) }))
    .filter((entry): entry is { row: ParlayPropRow; odds: number } => entry.odds !== null);

  if (!matches.length) return null;

  // For American odds, the numerically larger quote is always the better
  // payout for the bettor (+800 > +700 and -105 > -115).
  matches.sort((a, b) => b.odds - a.odds);
  const best = matches[0];
  const fanduel = matches.filter(x => rowBookKey(x.row) === 'fanduel').sort((a, b) => b.odds - a.odds)[0]?.odds ?? null;
  const draftkings = matches.filter(x => rowBookKey(x.row) === 'draftkings').sort((a, b) => b.odds - a.odds)[0]?.odds ?? null;
  const edgePoints = modelEdgePoints(modelProbabilityPct, best.odds);
  const expectedValue = expectedValuePerDollar(modelProbabilityPct, best.odds);

  return {
    source: 'ParlayAPI',
    market: 'player_first_basket',
    bestOdds: best.odds,
    bestOddsDisplay: formatAmericanOdds(best.odds),
    bestBook: rowBookTitle(best.row),
    fanduelOdds: fanduel,
    draftkingsOdds: draftkings,
    impliedProbability: Math.max(0, modelProbabilityPct - edgePoints),
    edgePoints,
    expectedValue,
    qualifiesValue: rank === 3 && qualifiesAsMarketValue(modelProbabilityPct, best.odds),
    lastUpdate: rowLastUpdate(best.row),
  };
}

export async function attachWnbaFirstBasketMarkets<T extends { name: string; probability: number; rank: number }>(
  candidates: T[],
): Promise<Array<T & { marketOdds: WnbaFirstBasketMarket | null }>> {
  return Promise.all(candidates.map(async candidate => ({
    ...candidate,
    marketOdds: await getWnbaFirstBasketMarket(candidate.name, candidate.probability, candidate.rank),
  })));
}
