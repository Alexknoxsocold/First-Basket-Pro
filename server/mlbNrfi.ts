type EspnEvent = {
  id: string;
  date?: string;
  shortName?: string;
  competitions?: EspnCompetition[];
};

type EspnCompetition = {
  venue?: { fullName?: string; indoor?: boolean };
  status?: { type?: { state?: string; completed?: boolean; detail?: string } };
  competitors?: EspnCompetitor[];
};

type EspnCompetitor = {
  homeAway?: "home" | "away";
  team?: {
    id?: string;
    abbreviation?: string;
    displayName?: string;
    shortDisplayName?: string;
    logos?: { href?: string }[];
  };
  score?: string | number;
  linescores?: { period?: number; value?: number }[];
  probables?: {
    name?: string;
    athlete?: { id?: string; fullName?: string; displayName?: string; headshot?: string };
    statistics?: { name?: string; displayValue?: string }[];
  }[];
};

type EspnSummary = {
  plays?: {
    period?: { number?: number };
    inning?: number;
    homeScore?: number;
    awayScore?: number;
  }[];
};

type TeamForm = {
  games: number;
  noRunPct: number;
  firstInningRuns: number;
  firstInningAllowed: number;
};

type CachedSchedule = {
  events: EspnEvent[];
  expiresAt: number;
};

export type NrfiPitcher = {
  name: string | null;
  era: number | null;
  headshot: string | null;
};

export type NrfiGame = {
  id: string;
  date: string;
  shortName: string;
  away: { abbreviation: string; name: string; logo: string | null; pitcher: NrfiPitcher };
  home: { abbreviation: string; name: string; logo: string | null; pitcher: NrfiPitcher };
  venue: string | null;
  status: string;
  nrfiProbability: number;
  recommendation: "NRFI" | "YRFI";
  confidence: "High" | "Medium" | "Low";
  sampleSize: number;
  factors: string[];
  outcome: "won" | "lost" | "pending";
  firstInningScore: string | null;
};

export type NrfiResponse = {
  date: string;
  games: NrfiGame[];
  averageNrfiProbability: number | null;
  topPick: NrfiGame | null;
  updatedAt: string;
  source: string;
  methodology: string;
};

export type NrfiWindowResponse = {
  startDate: string;
  endDate: string;
  days: NrfiResponse[];
  games: NrfiGame[];
  averageNrfiProbability: number | null;
  topPick: NrfiGame | null;
  updatedAt: string;
};

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb";
const CACHE_TTL = 20 * 60 * 1000;
const STALE_TTL = 2 * 60 * 60 * 1000;
const WINDOW_CACHE_TTL = 10 * 60 * 1000;
const SCHEDULE_CACHE_TTL = 30 * 60 * 1000;
const HISTORY_CACHE_TTL = 30 * 60 * 1000;
const HISTORY_GAMES = 10;
let cachedResponse: NrfiResponse | null = null;
let cachedDate: string | null = null;
let cachedAt = 0;
const refreshInFlight = new Map<string, Promise<NrfiResponse>>();
const teamFormCache = new Map<string, { value: TeamForm; expiresAt: number }>();
const teamScheduleCache = new Map<string, CachedSchedule>();
const gameFirstInningCache = new Map<string, { away: number; home: number } | null>();
let cachedWindow: NrfiWindowResponse | null = null;
let cachedWindowStart: string | null = null;
let cachedWindowDays = 0;
let cachedWindowAt = 0;
let windowRefreshInFlight: Promise<NrfiWindowResponse> | null = null;

async function fetchJson<T>(url: string, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "First-Basket-Pro/1.0" },
    });
    if (!response.ok) throw new Error(`ESPN returned ${response.status} for ${url}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function getTodayET(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
}

function getFirstInningRuns(competitor: EspnCompetitor): number | null {
  const first = competitor.linescores?.find((line) => line.period === 1);
  return typeof first?.value === "number" ? first.value : null;
}

function getOutcome(
  recommendation: "NRFI" | "YRFI",
  competition: EspnCompetition,
): Pick<NrfiGame, "outcome" | "firstInningScore"> {
  const competitors = competition.competitors ?? [];
  const away = competitors.find((c) => c.homeAway === "away");
  const home = competitors.find((c) => c.homeAway === "home");
  const awayRuns = away ? getFirstInningRuns(away) : null;
  const homeRuns = home ? getFirstInningRuns(home) : null;
  const firstInningScore = awayRuns !== null && homeRuns !== null ? `${awayRuns}-${homeRuns}` : null;
  const state = competition.status?.type?.state;
  const firstInningComplete = state === "post" || (awayRuns !== null && homeRuns !== null && state !== "pre");
  if (!firstInningComplete || awayRuns === null || homeRuns === null) return { outcome: "pending", firstInningScore };
  const wasNrfi = awayRuns === 0 && homeRuns === 0;
  return { outcome: recommendation === (wasNrfi ? "NRFI" : "YRFI") ? "won" : "lost", firstInningScore };
}

function getPitcher(competitor: EspnCompetitor): NrfiPitcher {
  const probable = competitor.probables?.find((item) => item.name === "probableStartingPitcher") ?? competitor.probables?.[0];
  const eraText = probable?.statistics?.find((stat) => stat.name === "ERA")?.displayValue;
  const era = eraText ? Number.parseFloat(eraText) : null;
  return {
    name: probable?.athlete?.displayName ?? probable?.athlete?.fullName ?? null,
    era: Number.isFinite(era) ? era : null,
    headshot: probable?.athlete?.headshot ?? null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function fetchTeamSchedule(teamId: string): Promise<EspnEvent[]> {
  const cached = teamScheduleCache.get(teamId);
  if (cached && cached.expiresAt > Date.now()) return cached.events;
  const data = await fetchJson<{ events?: EspnEvent[] }>(`${ESPN_BASE}/teams/${encodeURIComponent(teamId)}/schedule?limit=50`);
  const events = data.events ?? [];
  teamScheduleCache.set(teamId, { events, expiresAt: Date.now() + SCHEDULE_CACHE_TTL });
  return events;
}

/**
 * ESPN team schedules do not reliably include inning-by-inning scoring.
 * Pull the game's summary when necessary and derive the final first-inning
 * score from cumulative scores on plays in inning/period one. This is slower
 * than the old shortcut, but it prevents missing history from becoming fake
 * 55% league data.
 */
async function fetchFirstInningFromSummary(eventId: string): Promise<{ away: number; home: number } | null> {
  const cached = gameFirstInningCache.get(eventId);
  if (cached !== undefined) return cached;
  try {
    const summary = await fetchJson<EspnSummary>(`${ESPN_BASE}/summary?event=${encodeURIComponent(eventId)}`);
    const plays = Array.isArray(summary.plays) ? summary.plays : [];
    const inningOne = plays.filter((play) => {
      const n = play.inning ?? play.period?.number;
      return n === 1;
    });
    if (inningOne.length === 0) {
      gameFirstInningCache.set(eventId, null);
      return null;
    }
    let away = 0;
    let home = 0;
    for (const play of inningOne) {
      if (typeof play.awayScore === "number") away = Math.max(away, play.awayScore);
      if (typeof play.homeScore === "number") home = Math.max(home, play.homeScore);
    }
    const result = { away, home };
    gameFirstInningCache.set(eventId, result);
    return result;
  } catch {
    return null;
  }
}

async function fetchTeamForm(teamId: string, beforeDate: string): Promise<TeamForm> {
  const cacheKey = `${teamId}:${beforeDate}`;
  const cached = teamFormCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const fallback: TeamForm = { games: 0, noRunPct: 0.50, firstInningRuns: 0.50, firstInningAllowed: 0.50 };
  try {
    const events = await fetchTeamSchedule(teamId);
    const completed = events
      .filter((event) => (event.date ?? "").slice(0, 10) < beforeDate)
      .filter((event) => {
        const state = event.competitions?.[0]?.status?.type?.state;
        return state === "post" || event.competitions?.[0]?.status?.type?.completed === true;
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, HISTORY_GAMES);

    const history = await withConcurrency(completed, async (event) => {
      const competition = event.competitions?.[0];
      const away = competition?.competitors?.find((c) => c.homeAway === "away");
      const home = competition?.competitors?.find((c) => c.homeAway === "home");
      if (!away?.team?.id || !home?.team?.id) return null;
      const score = await fetchFirstInningFromSummary(event.id);
      if (!score) return null;
      const teamIsAway = away.team.id === teamId;
      return {
        teamRuns: teamIsAway ? score.away : score.home,
        opponentRuns: teamIsAway ? score.home : score.away,
      };
    }, 6);

    const valid = history.filter((x): x is { teamRuns: number; opponentRuns: number } => x !== null);
    if (valid.length === 0) {
      teamFormCache.set(cacheKey, { value: fallback, expiresAt: Date.now() + 5 * 60 * 1000 });
      return fallback;
    }

    // Bayesian shrinkage keeps 1-2 noisy games from dominating the prediction.
    const leagueNoRunPrior = 0.50;
    const leagueRunPrior = 0.50;
    const priorWeight = 3;
    const noRunGames = valid.filter((x) => x.teamRuns === 0 && x.opponentRuns === 0).length;
    const scored = valid.reduce((sum, x) => sum + x.teamRuns, 0);
    const allowed = valid.reduce((sum, x) => sum + x.opponentRuns, 0);
    const n = valid.length;
    const value: TeamForm = {
      games: n,
      noRunPct: (noRunGames + leagueNoRunPrior * priorWeight) / (n + priorWeight),
      firstInningRuns: (scored + leagueRunPrior * priorWeight) / (n + priorWeight),
      firstInningAllowed: (allowed + leagueRunPrior * priorWeight) / (n + priorWeight),
    };
    teamFormCache.set(cacheKey, { value, expiresAt: Date.now() + HISTORY_CACHE_TTL });
    return value;
  } catch {
    teamFormCache.set(cacheKey, { value: fallback, expiresAt: Date.now() + 5 * 60 * 1000 });
    return fallback;
  }
}

function pitcherRunAdjustment(pitcher: NrfiPitcher): number {
  if (pitcher.era === null) return 1;
  // ERA is a broad measure, so use it as a moderate adjustment rather than
  // allowing one starter to completely override team first-inning history.
  return clamp(pitcher.era / 4.25, 0.80, 1.25);
}

function buildPrediction(
  awayForm: TeamForm,
  homeForm: TeamForm,
  awayPitcher: NrfiPitcher,
  homePitcher: NrfiPitcher,
  homeIndoor: boolean,
): Pick<NrfiGame, "nrfiProbability" | "recommendation" | "confidence" | "sampleSize" | "factors"> {
  // Blend each offense with the opposing defense. The Poisson no-run
  // probability exp(-lambda) is mathematically appropriate for an inning.
  const awayExpected = ((awayForm.firstInningRuns + homeForm.firstInningAllowed) / 2) * pitcherRunAdjustment(homePitcher);
  const homeExpected = ((homeForm.firstInningRuns + awayForm.firstInningAllowed) / 2) * pitcherRunAdjustment(awayPitcher);
  const expectedRuns = Math.max(0.05, (awayExpected + homeExpected) * (homeIndoor ? 0.98 : 1));
  const probability = Math.round(clamp(Math.exp(-expectedRuns) * 100, 15, 85));
  const sampleSize = Math.min(awayForm.games, homeForm.games);
  const pitcherKnown = awayPitcher.era !== null && homePitcher.era !== null;
  const confidence = sampleSize >= 8 && pitcherKnown ? "High" : sampleSize >= 5 && (pitcherKnown || awayPitcher.name !== null || homePitcher.name !== null) ? "Medium" : "Low";
  const factors: string[] = [];
  if (awayForm.noRunPct >= 0.55 && homeForm.noRunPct >= 0.55) factors.push("Both teams have recently produced a high share of scoreless first innings");
  else if (awayForm.noRunPct < 0.45 || homeForm.noRunPct < 0.45) factors.push("At least one offense has frequently scored in the first inning recently");
  else factors.push("Recent first-inning results are near the league baseline");
  if (pitcherKnown) factors.push(`Probable starters included (ERAs ${awayPitcher.era!.toFixed(2)} and ${homePitcher.era!.toFixed(2)})`);
  else factors.push("One or both probable starters are not confirmed");
  factors.push(`Based on ${sampleSize || "limited"} verified recent games per team`);
  return { nrfiProbability: probability, recommendation: probability >= 50 ? "NRFI" : "YRFI", confidence, sampleSize, factors };
}

async function withConcurrency<T, R>(values: T[], worker: (value: T) => Promise<R>, limit = 6): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function run(): Promise<void> {
    while (next < values.length) {
      const index = next++;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => run()));
  return results;
}

async function buildNrfiData(date: string): Promise<NrfiResponse> {
  const scoreboard = await fetchJson<{ events?: EspnEvent[] }>(`${ESPN_BASE}/scoreboard?dates=${date.replace(/-/g, "")}`);
  const rawGames = (scoreboard.events ?? [])
    .map((event) => ({ event, competition: event.competitions?.[0] }))
    .filter((item): item is { event: EspnEvent; competition: EspnCompetition } => Boolean(item.competition?.competitors?.length === 2));
  const teamIds = Array.from(new Set(rawGames.flatMap(({ competition }) => competition.competitors?.map((c) => c.team?.id).filter((id): id is string => Boolean(id)) ?? [])));
  const forms = await withConcurrency(teamIds, async (teamId) => [teamId, await fetchTeamForm(teamId, date)] as const, 8);
  const formMap = new Map(forms);
  const games = rawGames.map(({ event, competition }) => {
    const away = competition.competitors!.find((c) => c.homeAway === "away")!;
    const home = competition.competitors!.find((c) => c.homeAway === "home")!;
    const fallbackForm: TeamForm = { games: 0, noRunPct: 0.50, firstInningRuns: 0.50, firstInningAllowed: 0.50 };
    const prediction = buildPrediction(
      formMap.get(away.team?.id ?? "") ?? fallbackForm,
      formMap.get(home.team?.id ?? "") ?? fallbackForm,
      getPitcher(away), getPitcher(home), competition.venue?.indoor === true,
    );
    const outcome = getOutcome(prediction.recommendation, competition);
    return {
      id: event.id,
      date: event.date ?? `${date}T00:00:00Z`,
      shortName: event.shortName ?? `${away.team?.abbreviation ?? "Away"} @ ${home.team?.abbreviation ?? "Home"}`,
      away: { abbreviation: away.team?.abbreviation ?? "AWAY", name: away.team?.displayName ?? away.team?.shortDisplayName ?? "Away", logo: away.team?.logos?.[0]?.href ?? null, pitcher: getPitcher(away) },
      home: { abbreviation: home.team?.abbreviation ?? "HOME", name: home.team?.displayName ?? home.team?.shortDisplayName ?? "Home", logo: home.team?.logos?.[0]?.href ?? null, pitcher: getPitcher(home) },
      venue: competition.venue?.fullName ?? null,
      status: competition.status?.type?.detail ?? competition.status?.type?.state ?? "scheduled",
      ...prediction,
      ...outcome,
    };
  });
  const averageNrfiProbability = games.length ? Math.round(games.reduce((sum, game) => sum + game.nrfiProbability, 0) / games.length) : null;
  const topPick = games.length ? [...games].sort((a, b) => b.nrfiProbability - a.nrfiProbability)[0] : null;
  return {
    date, games, averageNrfiProbability, topPick, updatedAt: new Date().toISOString(),
    source: "ESPN MLB scoreboard + verified recent game summaries",
    methodology: "Recent first-inning scoring/allowed rates with Bayesian league shrinkage, probable-starter ERA adjustment, and Poisson no-run probability.",
  };
}

export async function getNrfiData(date = getTodayET()): Promise<NrfiResponse> {
  const now = Date.now();
  if (cachedResponse && cachedDate === date && now - cachedAt < CACHE_TTL) return cachedResponse;
  const inFlight = refreshInFlight.get(date);
  if (inFlight) return inFlight;
  const refresh = (async () => {
    try {
      const data = await buildNrfiData(date);
      cachedResponse = data; cachedDate = date; cachedAt = Date.now();
      return data;
    } catch (error) {
      if (cachedResponse && cachedDate === date && now - cachedAt < STALE_TTL) return cachedResponse;
      throw error;
    } finally {
      refreshInFlight.delete(date);
    }
  })();
  refreshInFlight.set(date, refresh);
  return refresh;
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getNrfiWindow(startDate = getTodayET(), days = 3): Promise<NrfiWindowResponse> {
  const safeDays = Math.min(Math.max(days, 1), 7);
  if (cachedWindow && cachedWindowStart === startDate && cachedWindowDays === safeDays && Date.now() - cachedWindowAt < WINDOW_CACHE_TTL) return cachedWindow;
  if (windowRefreshInFlight) return windowRefreshInFlight;
  windowRefreshInFlight = (async () => {
    const dates = Array.from({ length: safeDays }, (_, i) => addDays(startDate, i));
    const responses = await withConcurrency(dates, (date) => getNrfiData(date), 3);
    const games = responses.flatMap((r) => r.games);
    const averageNrfiProbability = games.length ? Math.round(games.reduce((sum, game) => sum + game.nrfiProbability, 0) / games.length) : null;
    const topPick = games.length ? [...games].sort((a, b) => b.nrfiProbability - a.nrfiProbability)[0] : null;
    const result = { startDate, endDate: dates[dates.length - 1], days: responses, games, averageNrfiProbability, topPick, updatedAt: new Date().toISOString() };
    cachedWindow = result; cachedWindowStart = startDate; cachedWindowDays = safeDays; cachedWindowAt = Date.now();
    return result;
  })();
  try { return await windowRefreshInFlight; } finally { windowRefreshInFlight = null; }
}
