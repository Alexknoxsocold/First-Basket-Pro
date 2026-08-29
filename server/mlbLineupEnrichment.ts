// MLB lineup enrichment for the NRFI/YRFI shadow model.
// Uses MLB's public Stats API and deliberately distinguishes confirmed batting
// orders from projected/unavailable data.

const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const TTL = 10 * 60 * 1000;

type Cached<T> = { value: T; expiresAt: number };
const cache = new Map<string, Cached<MlbLineupSnapshot>>();

export type MlbLineupPlayer = {
  id: number;
  name: string;
  battingOrder: number;
  position: string | null;
  obp: number | null;
  strikeoutPct: number | null;
  walkPct: number | null;
};

export type MlbWeatherSnapshot = {
  available: boolean;
  temperatureF: number | null;
  condition: string | null;
  wind: string | null;
};

export type MlbLineupSnapshot = {
  gamePk: number | null;
  confirmed: boolean;
  source: "MLB" | "unavailable";
  away: MlbLineupPlayer[];
  home: MlbLineupPlayer[];
  topOrderCount: number;
  weather: MlbWeatherSnapshot;
};

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "First-Basket-Pro/1.0" } });
    if (!response.ok) throw new Error(`MLB Stats API ${response.status}`);
    return await response.json() as T;
  } finally {
    clearTimeout(timeout);
  }
}

type ScheduleGame = {
  gamePk: number;
  teams?: { away?: { team?: { abbreviation?: string } }; home?: { team?: { abbreviation?: string } } };
};

type ScheduleResponse = { dates?: { games?: ScheduleGame[] }[] };

type BattingStats = {
  obp?: string | number;
  onBasePercentage?: string | number;
  plateAppearances?: string | number;
  strikeOuts?: string | number;
  baseOnBalls?: string | number;
};
type BoxscorePlayer = {
  person?: { id?: number; fullName?: string };
  position?: { abbreviation?: string };
  seasonStats?: { batting?: BattingStats };
};
type BoxscoreTeam = { battingOrder?: number[]; players?: Record<string, BoxscorePlayer> };
type FeedResponse = {
  gameData?: {
    status?: { abstractGameState?: string };
    weather?: { temp?: number | string; condition?: string; wind?: string };
  };
  liveData?: { boxscore?: { teams?: { away?: BoxscoreTeam; home?: BoxscoreTeam } } };
};

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rate(numerator: unknown, denominator: unknown): number | null {
  const n = numeric(numerator);
  const d = numeric(denominator);
  if (n === null || d === null || d <= 0) return null;
  return Math.min(1, Math.max(0, n / d));
}

function parseBattingOrder(order: number[] | undefined, players: Record<string, BoxscorePlayer> | undefined): MlbLineupPlayer[] {
  if (!order?.length || !players) return [];
  return order.map((id, index) => {
    const player = players[`ID${id}`];
    const batting = player?.seasonStats?.batting;
    const obp = numeric(batting?.obp ?? batting?.onBasePercentage);
    return {
      id,
      name: player?.person?.fullName ?? String(id),
      battingOrder: index + 1,
      position: player?.position?.abbreviation ?? null,
      obp: obp === null ? null : Math.min(1, Math.max(0, obp)),
      strikeoutPct: rate(batting?.strikeOuts, batting?.plateAppearances),
      walkPct: rate(batting?.baseOnBalls, batting?.plateAppearances),
    };
  }).filter(player => player.name !== String(player.id));
}

function parseWeather(feed: FeedResponse): MlbWeatherSnapshot {
  const weather = feed.gameData?.weather;
  const temperatureF = numeric(weather?.temp);
  const condition = weather?.condition?.trim() || null;
  const wind = weather?.wind?.trim() || null;
  const available = temperatureF !== null || Boolean(condition) || Boolean(wind);
  return { available, temperatureF, condition, wind };
}

export async function fetchMlbLineups(date: string, awayAbbreviation: string, homeAbbreviation: string): Promise<MlbLineupSnapshot> {
  const key = `${date}:${awayAbbreviation}:${homeAbbreviation}`.toUpperCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const unavailable: MlbLineupSnapshot = {
    gamePk: null,
    confirmed: false,
    source: "unavailable",
    away: [],
    home: [],
    topOrderCount: 0,
    weather: { available: false, temperatureF: null, condition: null, wind: null },
  };
  try {
    const schedule = await fetchJson<ScheduleResponse>(`${MLB_BASE}/schedule?sportId=1&date=${date}&hydrate=team`);
    const game = schedule.dates?.flatMap(day => day.games ?? []).find(item =>
      item.teams?.away?.team?.abbreviation?.toUpperCase() === awayAbbreviation.toUpperCase() &&
      item.teams?.home?.team?.abbreviation?.toUpperCase() === homeAbbreviation.toUpperCase(),
    );
    if (!game) { cache.set(key, { value: unavailable, expiresAt: Date.now() + TTL }); return unavailable; }

    const feed = await fetchJson<FeedResponse>(`${MLB_BASE}/game/${game.gamePk}/feed/live`);
    const teams = feed.liveData?.boxscore?.teams;
    const away = parseBattingOrder(teams?.away?.battingOrder, teams?.away?.players);
    const home = parseBattingOrder(teams?.home?.battingOrder, teams?.home?.players);
    const confirmed = away.length >= 3 && home.length >= 3;
    const value: MlbLineupSnapshot = {
      gamePk: game.gamePk,
      confirmed,
      source: confirmed ? "MLB" : "unavailable",
      away,
      home,
      topOrderCount: Math.min(away.length, 3) + Math.min(home.length, 3),
      weather: parseWeather(feed),
    };
    cache.set(key, { value, expiresAt: Date.now() + TTL });
    return value;
  } catch {
    cache.set(key, { value: unavailable, expiresAt: Date.now() + 2 * 60 * 1000 });
    return unavailable;
  }
}
