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
};

export type MlbLineupSnapshot = {
  gamePk: number | null;
  confirmed: boolean;
  source: "MLB" | "unavailable";
  away: MlbLineupPlayer[];
  home: MlbLineupPlayer[];
  topOrderCount: number;
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

type BoxscorePlayer = { person?: { id?: number; fullName?: string }; position?: { abbreviation?: string } };
type BoxscoreTeam = { battingOrder?: number[]; players?: Record<string, BoxscorePlayer> };
type FeedResponse = { gameData?: { status?: { abstractGameState?: string } }; liveData?: { boxscore?: { teams?: { away?: BoxscoreTeam; home?: BoxscoreTeam } } } };

function parseBattingOrder(order: number[] | undefined, players: Record<string, BoxscorePlayer> | undefined): MlbLineupPlayer[] {
  if (!order?.length || !players) return [];
  return order.map((id, index) => {
    const player = players[`ID${id}`];
    return { id, name: player?.person?.fullName ?? String(id), battingOrder: index + 1, position: player?.position?.abbreviation ?? null };
  }).filter(player => player.name !== String(player.id));
}

export async function fetchMlbLineups(date: string, awayAbbreviation: string, homeAbbreviation: string): Promise<MlbLineupSnapshot> {
  const key = `${date}:${awayAbbreviation}:${homeAbbreviation}`.toUpperCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const unavailable: MlbLineupSnapshot = { gamePk: null, confirmed: false, source: "unavailable", away: [], home: [], topOrderCount: 0 };
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
    const value: MlbLineupSnapshot = { gamePk: game.gamePk, confirmed, source: confirmed ? "MLB" : "unavailable", away, home, topOrderCount: Math.min(away.length, 4) + Math.min(home.length, 4) };
    cache.set(key, { value, expiresAt: Date.now() + TTL });
    return value;
  } catch {
    cache.set(key, { value: unavailable, expiresAt: Date.now() + 2 * 60 * 1000 });
    return unavailable;
  }
}
