import {
  expectedValuePerDollar,
  formatAmericanOdds,
  modelEdgePoints,
  parseAmericanOdds,
  qualifiesAsMarketValue,
} from './normalized';

const SGO_URL = 'https://api.sportsgameodds.com/v2/events';
const CACHE_TTL_MS = 10 * 60 * 1000;

type SgoEvent = Record<string, any>;

type SgoRow = {
  playerName: string;
  sportsbook: string;
  odds: number;
  lastUpdate: string | null;
};

export type SportsGameOddsWnbaMarket = {
  source: 'SportsGameOdds';
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

export type SportsGameOddsDiagnostics = {
  keyConfigured: boolean;
  lastHttpStatus: number | null;
  eventCount: number;
  firstBasketMarketCount: number;
  draftkingsRows: number;
  fanduelRows: number;
  sample: Array<{ player: string; book: string; odds: number }>;
  lastFetchAt: string | null;
};

let cache: { at: number; rows: SgoRow[] } | null = null;
let inFlight: Promise<SgoRow[]> | null = null;
let diagnostics: SportsGameOddsDiagnostics = {
  keyConfigured: Boolean(process.env.SPORTSGAMEODDS_API_KEY),
  lastHttpStatus: null,
  eventCount: 0,
  firstBasketMarketCount: 0,
  draftkingsRows: 0,
  fanduelRows: 0,
  sample: [],
  lastFetchAt: null,
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

function playerNameFromId(playerId: string): string {
  const parts = playerId.split('_');
  if (parts.length >= 3 && /^\d+$/.test(parts[parts.length - 2])) parts.splice(parts.length - 2, 2);
  return parts.map(part => part ? part[0] + part.slice(1).toLowerCase() : '').join(' ').trim();
}

function eventPlayerName(event: SgoEvent, playerId: string): string {
  const players = event?.players;
  if (players && typeof players === 'object') {
    const player = Array.isArray(players)
      ? players.find((p: any) => p?.playerID === playerId || p?.id === playerId)
      : players[playerId] ?? Object.values(players).find((p: any) => p?.playerID === playerId || p?.id === playerId);
    if (player) {
      const names = player.names ?? player.name;
      const display = typeof names === 'string' ? names : names?.display ?? names?.full ?? names?.long ?? names?.short;
      if (display) return String(display);
    }
  }
  return playerNameFromId(playerId);
}

function firstBasketOdds(event: SgoEvent): SgoRow[] {
  const rows: SgoRow[] = [];
  const odds = event?.odds && typeof event.odds === 'object' ? Object.values(event.odds) : [];
  for (const odd of odds as any[]) {
    if (String(odd?.statID ?? '').toLowerCase() !== 'firstbasket') continue;
    const side = String(odd?.sideID ?? '').toLowerCase();
    if (side && side !== 'yes' && side !== 'player' && side !== 'side1') continue;
    const playerId = String(odd?.playerID ?? odd?.statEntityID ?? '').trim();
    if (!playerId || ['home','away','all'].includes(playerId.toLowerCase())) continue;
    const playerName = eventPlayerName(event, playerId);
    const byBook = odd?.byBookmaker && typeof odd.byBookmaker === 'object' ? odd.byBookmaker : {};
    for (const book of ['draftkings', 'fanduel']) {
      const quote = byBook[book];
      if (!quote || quote.available === false) continue;
      const parsed = parseAmericanOdds(quote.odds ?? quote.price ?? null);
      if (parsed === null) continue;
      rows.push({
        playerName,
        sportsbook: book === 'draftkings' ? 'DraftKings' : 'FanDuel',
        odds: parsed,
        lastUpdate: quote.lastUpdatedAt ?? quote.updatedAt ?? null,
      });
    }
  }
  return rows;
}

async function requestRows(): Promise<SgoRow[]> {
  const apiKey = process.env.SPORTSGAMEODDS_API_KEY;
  if (!apiKey) return [];

  const url = new URL(SGO_URL);
  url.searchParams.set('leagueID', 'WNBA');
  url.searchParams.set('oddsAvailable', 'true');
  url.searchParams.set('bookmakerID', 'draftkings,fanduel');
  url.searchParams.set('limit', '25');

  try {
    const response = await fetch(url, {
      headers: { 'x-api-key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    diagnostics = { ...diagnostics, keyConfigured: true, lastHttpStatus: response.status, lastFetchAt: new Date().toISOString() };
    if (!response.ok) {
      console.warn(`[SportsGameOdds] WNBA request failed: ${response.status}`);
      return cache?.rows ?? [];
    }
    const payload = await response.json();
    const events: SgoEvent[] = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    const rows = events.flatMap(firstBasketOdds);
    diagnostics = {
      keyConfigured: true,
      lastHttpStatus: response.status,
      eventCount: events.length,
      firstBasketMarketCount: rows.length,
      draftkingsRows: rows.filter(row => row.sportsbook === 'DraftKings').length,
      fanduelRows: rows.filter(row => row.sportsbook === 'FanDuel').length,
      sample: rows.slice(0, 8).map(row => ({ player: row.playerName, book: row.sportsbook, odds: row.odds })),
      lastFetchAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), rows };
    console.log('[SportsGameOdds][WNBA diagnostics]', JSON.stringify(diagnostics));
    return rows;
  } catch (error) {
    console.warn('[SportsGameOdds] WNBA request error:', error);
    return cache?.rows ?? [];
  }
}

async function fetchRows(): Promise<SgoRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  if (inFlight) return inFlight;
  inFlight = requestRows();
  try { return await inFlight; }
  finally { inFlight = null; }
}

export function getSportsGameOddsWnbaDiagnostics(): SportsGameOddsDiagnostics {
  return { ...diagnostics, sample: diagnostics.sample.map(row => ({ ...row })) };
}

export async function getSportsGameOddsWnbaMarket(playerName: string, modelProbabilityPct: number, rank: number): Promise<SportsGameOddsWnbaMarket | null> {
  const rows = await fetchRows();
  const target = normalizeName(playerName);
  const matches = rows.filter(row => normalizeName(row.playerName) === target).sort((a, b) => b.odds - a.odds);
  if (!matches.length) return null;
  const best = matches[0];
  const fanduel = matches.filter(row => row.sportsbook === 'FanDuel').sort((a, b) => b.odds - a.odds)[0]?.odds ?? null;
  const draftkings = matches.filter(row => row.sportsbook === 'DraftKings').sort((a, b) => b.odds - a.odds)[0]?.odds ?? null;
  const edgePoints = modelEdgePoints(modelProbabilityPct, best.odds);
  const expectedValue = expectedValuePerDollar(modelProbabilityPct, best.odds);
  return {
    source: 'SportsGameOdds',
    market: 'player_first_basket',
    bestOdds: best.odds,
    bestOddsDisplay: formatAmericanOdds(best.odds),
    bestBook: best.sportsbook,
    fanduelOdds: fanduel,
    draftkingsOdds: draftkings,
    impliedProbability: Math.max(0, modelProbabilityPct - edgePoints),
    edgePoints,
    expectedValue,
    qualifiesValue: rank === 3 && qualifiesAsMarketValue(modelProbabilityPct, best.odds),
    lastUpdate: best.lastUpdate,
  };
}
