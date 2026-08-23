import {
  expectedValuePerDollar,
  formatAmericanOdds,
  modelEdgePoints,
  parseAmericanOdds,
  qualifiesAsMarketValue,
} from './normalized';

const PARLAY_URL = 'https://parlay-api.com/v1/sports/basketball_wnba/props';
const CACHE_TTL_MS = 90_000;

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

let cache: { at: number; rows: ParlayPropRow[] } | null = null;

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

function rowBookKey(row: ParlayPropRow): string {
  return String(row.bookmaker ?? row.source ?? row.bookmaker_key ?? '').toLowerCase().trim();
}

function rowBookTitle(row: ParlayPropRow): string {
  const key = rowBookKey(row);
  const title = String(row.bookmaker_title ?? row.source_title ?? row.bookmaker_name ?? '').trim();
  if (title) return title;
  if (key === 'fanduel') return 'FanDuel';
  if (key === 'draftkings') return 'DraftKings';
  return key || 'Sportsbook';
}

function rowOdds(row: ParlayPropRow): number | null {
  // ParlayAPI's REST props shape is normally over_price/under_price. One-way
  // scorer markets can also surface a direct price depending on the source.
  // Accept all documented/stream-compatible aliases and never infer a price.
  const values = [row.price_american, row.price, row.over_price, row.odds];
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

async function fetchRows(): Promise<ParlayPropRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const apiKey = process.env.PARLAY_API_KEY;
  if (!apiKey) return [];

  const url = new URL(PARLAY_URL);
  url.searchParams.set('markets', 'player_first_basket');
  url.searchParams.set('bookmakers', 'fanduel,draftkings');
  url.searchParams.set('include', 'slim');
  url.searchParams.set('limit', '1000');
  // First-basket boards can be quiet before tip. Keep only reasonably recent
  // prices while avoiding false staleness on a market that has not moved.
  url.searchParams.set('maxAgeSec', '1800');

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
      return cache?.rows ?? [];
    }
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.results) ? payload.results : [];
    const firstBasketRows = rows.filter((row: ParlayPropRow) => {
      const market = String(row.market_key ?? row.market ?? '').toLowerCase();
      return market === 'player_first_basket' || market.includes('first_basket');
    });
    cache = { at: Date.now(), rows: firstBasketRows };
    console.log(`[ParlayAPI] Loaded ${firstBasketRows.length} WNBA first-basket prices`);
    return firstBasketRows;
  } catch (error) {
    console.warn('[ParlayAPI] WNBA first-basket request error:', error);
    return cache?.rows ?? [];
  }
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
