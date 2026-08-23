import type { Express } from 'express';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const LEAGUE_HR_PER_PA = 0.032;
const CACHE_TTL_MS = 5 * 60 * 1000;

export type MlbHomeRunCandidate = {
  gamePk: number;
  gameTime: string;
  playerId: number;
  player: string;
  team: string;
  opponent: string;
  headshot: string;
  battingOrder: number;
  lineupConfirmed: boolean;
  probablePitcher: string | null;
  venue: string | null;
  probability: number;
  confidence: number;
  tier: 'POWER_PLAY' | 'STRONG' | 'WATCH';
  season: {
    plateAppearances: number;
    homeRuns: number;
    homeRunRate: number;
    slugging: number | null;
    ops: number | null;
  };
  recent: {
    plateAppearances: number;
    homeRuns: number;
    homeRunRate: number | null;
  };
  pitcher: {
    battersFaced: number;
    homeRunsAllowed: number;
    homeRunRateAllowed: number | null;
  };
  environment: {
    parkFactor: number;
    temperatureF: number | null;
    windMph: number | null;
    windDirection: string | null;
    weatherFactor: number;
  };
  factors: string[];
  market: null;
  homepageEligible: false;
};

export type MlbHomeRunResponse = {
  date: string;
  modelVersion: 'hr-v1-research';
  updatedAt: string;
  candidates: MlbHomeRunCandidate[];
  strongest: MlbHomeRunCandidate[];
  gamesWithConfirmedLineups: number;
  totalGames: number;
  marketStatus: 'unavailable';
  homepageReady: false;
  methodology: string;
  note: string;
};

type StatSplit = {
  player?: { id?: number; fullName?: string };
  stat?: {
    plateAppearances?: number;
    homeRuns?: number;
    sluggingPercentage?: string | number;
    ops?: string | number;
    battersFaced?: number;
  };
};

type StatsResponse = { stats?: { splits?: StatSplit[] }[] };

type ScheduleGame = {
  gamePk: number;
  gameDate: string;
  status?: { abstractGameState?: string };
  venue?: { name?: string };
  teams?: {
    away?: { team?: { id?: number; name?: string; abbreviation?: string }; probablePitcher?: { id?: number; fullName?: string } };
    home?: { team?: { id?: number; name?: string; abbreviation?: string }; probablePitcher?: { id?: number; fullName?: string } };
  };
};

type ScheduleResponse = { dates?: { games?: ScheduleGame[] }[] };

type FeedTeam = {
  battingOrder?: number[];
  players?: Record<string, { person?: { id?: number; fullName?: string } }>;
};

type FeedResponse = {
  gameData?: {
    weather?: { temp?: number; wind?: string; condition?: string };
    venue?: { name?: string };
  };
  liveData?: { boxscore?: { teams?: { away?: FeedTeam; home?: FeedTeam } } };
};

type StatLine = {
  id: number;
  name: string;
  plateAppearances: number;
  homeRuns: number;
  slugging: number | null;
  ops: number | null;
  battersFaced: number;
};

const cache = new Map<string, { expiresAt: number; value: MlbHomeRunResponse }>();

async function fetchJson<T>(url: string, timeoutMs = 7000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'PreziTools/1.0' },
    });
    if (!response.ok) throw new Error(`MLB API ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

function etDateISO(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function statMap(response: StatsResponse): Map<number, StatLine> {
  const map = new Map<number, StatLine>();
  for (const split of response.stats?.[0]?.splits ?? []) {
    const id = Number(split.player?.id);
    if (!Number.isFinite(id)) continue;
    const pa = Number(split.stat?.plateAppearances ?? 0);
    const hr = Number(split.stat?.homeRuns ?? 0);
    const bf = Number(split.stat?.battersFaced ?? 0);
    map.set(id, {
      id,
      name: split.player?.fullName ?? String(id),
      plateAppearances: Number.isFinite(pa) ? pa : 0,
      homeRuns: Number.isFinite(hr) ? hr : 0,
      slugging: toNumber(split.stat?.sluggingPercentage),
      ops: toNumber(split.stat?.ops),
      battersFaced: Number.isFinite(bf) ? bf : 0,
    });
  }
  return map;
}

async function fetchStats(season: number, group: 'hitting' | 'pitching', statType = 'season', startDate?: string, endDate?: string): Promise<Map<number, StatLine>> {
  const params = new URLSearchParams({
    stats: statType,
    group,
    season: String(season),
    sportIds: '1',
    playerPool: 'ALL',
    limit: '2000',
    hydrate: 'person',
  });
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const response = await fetchJson<StatsResponse>(`${MLB_BASE}/stats?${params.toString()}`, 10000);
  return statMap(response);
}

function parseLineup(team: FeedTeam | undefined): { id: number; name: string; order: number }[] {
  if (!team?.battingOrder?.length || !team.players) return [];
  return team.battingOrder.map((id, index) => {
    const row = team.players?.[`ID${id}`];
    return { id, name: row?.person?.fullName ?? String(id), order: index + 1 };
  }).filter(row => row.name !== String(row.id));
}

function parkFactor(venue: string | null | undefined): number {
  const name = (venue ?? '').toLowerCase();
  if (name.includes('coors')) return 1.12;
  if (name.includes('great american')) return 1.07;
  if (name.includes('yankee')) return 1.05;
  if (name.includes('citizens bank')) return 1.05;
  if (name.includes('fenway')) return 1.03;
  if (name.includes('wrigley')) return 1.02;
  if (name.includes('dodger')) return 1.02;
  if (name.includes('camden')) return 0.99;
  if (name.includes('oracle')) return 0.96;
  if (name.includes('petco')) return 0.96;
  if (name.includes('t-mobile')) return 0.97;
  return 1;
}

function parseWind(wind: string | undefined): { mph: number | null; direction: string | null; multiplier: number } {
  if (!wind) return { mph: null, direction: null, multiplier: 1 };
  const mphMatch = wind.match(/(\d+(?:\.\d+)?)\s*mph/i);
  const mph = mphMatch ? Number(mphMatch[1]) : null;
  const lower = wind.toLowerCase();
  let sign = 0;
  if (lower.includes('out to') || lower.includes('blowing out')) sign = 1;
  else if (lower.includes('in from') || lower.includes('blowing in')) sign = -1;
  const amount = mph === null ? 0 : Math.min(0.08, mph * 0.005);
  return { mph, direction: wind, multiplier: 1 + sign * amount };
}

function weatherFactor(temp: number | undefined, wind: string | undefined): { factor: number; windMph: number | null; direction: string | null } {
  const tempAdjustment = temp === undefined ? 0 : Math.max(-0.06, Math.min(0.06, (temp - 72) * 0.0025));
  const parsed = parseWind(wind);
  return {
    factor: Math.max(0.86, Math.min(1.15, (1 + tempAdjustment) * parsed.multiplier)),
    windMph: parsed.mph,
    direction: parsed.direction,
  };
}

function expectedPlateAppearances(order: number): number {
  const values = [4.65, 4.55, 4.45, 4.35, 4.25, 4.15, 4.05, 3.95, 3.85];
  return values[Math.max(0, Math.min(8, order - 1))] ?? 4.05;
}

function smoothedRate(events: number, opportunities: number, priorRate: number, priorWeight: number): number {
  return (Math.max(0, events) + priorRate * priorWeight) / (Math.max(0, opportunities) + priorWeight);
}

function pct(value: number): string { return `${(value * 100).toFixed(1)}%`; }
function factorText(label: string, factor: number): string {
  const delta = (factor - 1) * 100;
  return `${label} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
}

function buildCandidate(args: {
  game: ScheduleGame;
  player: { id: number; name: string; order: number };
  team: string;
  opponent: string;
  pitcher: { id?: number; fullName?: string } | undefined;
  hitter: StatLine | undefined;
  recent: StatLine | undefined;
  pitcherStat: StatLine | undefined;
  venue: string | null;
  weather?: { temp?: number; wind?: string };
}): MlbHomeRunCandidate | null {
  const { game, player, team, opponent, pitcher, hitter, recent, pitcherStat, venue, weather } = args;
  if (!hitter || hitter.plateAppearances < 35) return null;

  const seasonRate = smoothedRate(hitter.homeRuns, hitter.plateAppearances, LEAGUE_HR_PER_PA, 90);
  const recentRate = recent && recent.plateAppearances >= 12
    ? smoothedRate(recent.homeRuns, recent.plateAppearances, seasonRate, 35)
    : seasonRate;
  const blendedHitterRate = seasonRate * 0.82 + recentRate * 0.18;
  const hitterFactor = Math.max(0.55, Math.min(2.3, blendedHitterRate / LEAGUE_HR_PER_PA));

  const pitcherRate = pitcherStat && pitcherStat.battersFaced >= 40
    ? smoothedRate(pitcherStat.homeRuns, pitcherStat.battersFaced, LEAGUE_HR_PER_PA, 160)
    : LEAGUE_HR_PER_PA;
  const pitcherFactor = Math.max(0.75, Math.min(1.45, pitcherRate / LEAGUE_HR_PER_PA));
  const park = parkFactor(venue);
  const wf = weatherFactor(weather?.temp, weather?.wind);
  const pa = expectedPlateAppearances(player.order);
  const opportunityFactor = pa / 4.2;

  const perPa = Math.max(0.008, Math.min(0.12,
    LEAGUE_HR_PER_PA * hitterFactor * Math.sqrt(pitcherFactor) * park * wf.factor,
  ));
  const probability = Math.max(0.03, Math.min(0.45, 1 - Math.pow(1 - perPa, pa)));

  let confidence = 58;
  confidence += Math.min(14, hitter.plateAppearances / 45);
  if (recent && recent.plateAppearances >= 20) confidence += 5;
  if (pitcherStat && pitcherStat.battersFaced >= 150) confidence += 7;
  if (weather?.temp !== undefined || weather?.wind) confidence += 3;
  confidence = Math.round(Math.max(55, Math.min(92, confidence)));

  const tier: MlbHomeRunCandidate['tier'] = probability >= 0.24 && confidence >= 78
    ? 'POWER_PLAY'
    : probability >= 0.19 && confidence >= 70
      ? 'STRONG'
      : 'WATCH';

  const factors = [
    `Season HR rate ${hitter.homeRuns}/${hitter.plateAppearances} PA (${pct(hitter.homeRuns / Math.max(1, hitter.plateAppearances))})`,
    recent && recent.plateAppearances >= 12 ? `Recent 14-day HR rate ${recent.homeRuns}/${recent.plateAppearances} PA (${pct(recent.homeRuns / Math.max(1, recent.plateAppearances))})` : 'Recent sample too small; season baseline carries more weight',
    pitcherStat && pitcherStat.battersFaced >= 40 ? `Probable pitcher HR allowed ${pitcherStat.homeRuns}/${pitcherStat.battersFaced} BF (${pct(pitcherStat.homeRuns / Math.max(1, pitcherStat.battersFaced))})` : 'Probable pitcher HR sample unavailable; league-average pitcher prior used',
    `Batting ${player.order}${player.order === 1 ? 'st' : player.order === 2 ? 'nd' : player.order === 3 ? 'rd' : 'th'} · projected ${pa.toFixed(2)} PA`,
    factorText('Park carry', park),
    factorText('Weather carry', wf.factor),
  ];

  return {
    gamePk: game.gamePk,
    gameTime: game.gameDate,
    playerId: player.id,
    player: player.name,
    team,
    opponent,
    headshot: `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_100/v1/people/${player.id}/headshot/67/current`,
    battingOrder: player.order,
    lineupConfirmed: true,
    probablePitcher: pitcher?.fullName ?? null,
    venue,
    probability: Math.round(probability * 1000) / 10,
    confidence,
    tier,
    season: {
      plateAppearances: hitter.plateAppearances,
      homeRuns: hitter.homeRuns,
      homeRunRate: Math.round((hitter.homeRuns / Math.max(1, hitter.plateAppearances)) * 1000) / 10,
      slugging: hitter.slugging,
      ops: hitter.ops,
    },
    recent: {
      plateAppearances: recent?.plateAppearances ?? 0,
      homeRuns: recent?.homeRuns ?? 0,
      homeRunRate: recent && recent.plateAppearances > 0 ? Math.round((recent.homeRuns / recent.plateAppearances) * 1000) / 10 : null,
    },
    pitcher: {
      battersFaced: pitcherStat?.battersFaced ?? 0,
      homeRunsAllowed: pitcherStat?.homeRuns ?? 0,
      homeRunRateAllowed: pitcherStat && pitcherStat.battersFaced > 0 ? Math.round((pitcherStat.homeRuns / pitcherStat.battersFaced) * 1000) / 10 : null,
    },
    environment: {
      parkFactor: Math.round(park * 1000) / 1000,
      temperatureF: weather?.temp ?? null,
      windMph: wf.windMph,
      windDirection: wf.direction,
      weatherFactor: Math.round(wf.factor * 1000) / 1000,
    },
    factors,
    market: null,
    homepageEligible: false,
  };
}

async function fetchHomeRunData(date: string): Promise<MlbHomeRunResponse> {
  const cached = cache.get(date);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const season = Number(date.slice(0, 4));
  const startRecent = new Date(`${date}T12:00:00Z`);
  startRecent.setUTCDate(startRecent.getUTCDate() - 14);
  const recentStart = startRecent.toISOString().slice(0, 10);

  const schedule = await fetchJson<ScheduleResponse>(`${MLB_BASE}/schedule?sportId=1&date=${date}&hydrate=team,venue,probablePitcher`);
  const games = schedule.dates?.flatMap(day => day.games ?? []) ?? [];

  const feeds = await Promise.all(games.map(async game => {
    try {
      const feed = await fetchJson<FeedResponse>(`${MLB_BASE}/game/${game.gamePk}/feed/live`, 6500);
      return { game, feed };
    } catch {
      return { game, feed: null as FeedResponse | null };
    }
  }));

  const [hitting, pitching, recentHitting] = await Promise.all([
    fetchStats(season, 'hitting'),
    fetchStats(season, 'pitching'),
    fetchStats(season, 'hitting', 'byDateRange', recentStart, date).catch(() => new Map<number, StatLine>()),
  ]);

  const candidates: MlbHomeRunCandidate[] = [];
  let gamesWithConfirmedLineups = 0;

  for (const { game, feed } of feeds) {
    if (!feed) continue;
    const awayLineup = parseLineup(feed.liveData?.boxscore?.teams?.away);
    const homeLineup = parseLineup(feed.liveData?.boxscore?.teams?.home);
    const confirmed = awayLineup.length >= 9 && homeLineup.length >= 9;
    if (!confirmed) continue;
    gamesWithConfirmedLineups += 1;

    const venue = feed.gameData?.venue?.name ?? game.venue?.name ?? null;
    const weather = feed.gameData?.weather;
    const away = game.teams?.away;
    const home = game.teams?.home;
    const awayAbbr = away?.team?.abbreviation ?? away?.team?.name ?? 'AWAY';
    const homeAbbr = home?.team?.abbreviation ?? home?.team?.name ?? 'HOME';

    for (const player of awayLineup) {
      const candidate = buildCandidate({
        game,
        player,
        team: awayAbbr,
        opponent: homeAbbr,
        pitcher: home?.probablePitcher,
        hitter: hitting.get(player.id),
        recent: recentHitting.get(player.id),
        pitcherStat: home?.probablePitcher?.id ? pitching.get(home.probablePitcher.id) : undefined,
        venue,
        weather,
      });
      if (candidate) candidates.push(candidate);
    }

    for (const player of homeLineup) {
      const candidate = buildCandidate({
        game,
        player,
        team: homeAbbr,
        opponent: awayAbbr,
        pitcher: away?.probablePitcher,
        hitter: hitting.get(player.id),
        recent: recentHitting.get(player.id),
        pitcherStat: away?.probablePitcher?.id ? pitching.get(away.probablePitcher.id) : undefined,
        venue,
        weather,
      });
      if (candidate) candidates.push(candidate);
    }
  }

  candidates.sort((a, b) => b.probability - a.probability || b.confidence - a.confidence);
  const strongest = candidates.filter(c => c.tier !== 'WATCH').slice(0, 10);

  const value: MlbHomeRunResponse = {
    date,
    modelVersion: 'hr-v1-research',
    updatedAt: new Date().toISOString(),
    candidates,
    strongest,
    gamesWithConfirmedLineups,
    totalGames: games.length,
    marketStatus: 'unavailable',
    homepageReady: false,
    methodology: 'Official MLB season and recent hitting rates are regressed toward league average, then adjusted for probable-pitcher HR allowance, confirmed batting-order opportunity, conservative park carry, and game weather. Probabilities are model estimates, not sportsbook value calls.',
    note: strongest.length
      ? 'Research model is live inside MLB only. Home-page promotion stays disabled until the model has enough graded history and a verified home-run price feed for true EV testing.'
      : games.length && gamesWithConfirmedLineups === 0
        ? 'No confirmed full batting orders yet. The model intentionally waits rather than ranking projected hitters.'
        : 'No hitters clear the current strong-play threshold.',
  };

  cache.set(date, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  return value;
}

export function registerMlbHomeRunRoutes(app: Express): void {
  app.get('/api/mlb/home-runs', async (req, res) => {
    try {
      const requested = typeof req.query.date === 'string' ? req.query.date.trim() : '';
      if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
        return res.status(400).json({ error: 'date must use YYYY-MM-DD format' });
      }
      const data = await fetchHomeRunData(requested || etDateISO());
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
      return res.json(data);
    } catch (error) {
      console.error('[MLB Home Runs] Error:', error);
      return res.status(502).json({ error: 'Unable to load MLB home-run model data' });
    }
  });
}
