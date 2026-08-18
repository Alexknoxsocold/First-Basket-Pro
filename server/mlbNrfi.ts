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
  team?: { id?: string; abbreviation?: string; displayName?: string; shortDisplayName?: string; logos?: { href?: string }[] };
  score?: string | number;
  linescores?: { period?: number; value?: number }[];
  probables?: { name?: string; athlete?: { id?: string; fullName?: string; displayName?: string; headshot?: string }; statistics?: { name?: string; displayValue?: string }[] }[];
};

type TeamForm = {
  games: number;
  scorelessPct: number;
  runsPerFirstInning: number;
  allowedPerFirstInning: number;
  allowedScorelessPct: number;
};

export type NrfiPitcher = { name: string | null; era: number | null; headshot: string | null };
export type NrfiGame = {
  id: string; date: string; shortName: string;
  away: { abbreviation: string; name: string; logo: string | null; pitcher: NrfiPitcher };
  home: { abbreviation: string; name: string; logo: string | null; pitcher: NrfiPitcher };
  venue: string | null; status: string; nrfiProbability: number; recommendation: "NRFI" | "YRFI";
  confidence: "High" | "Medium" | "Low"; sampleSize: number; factors: string[];
  outcome: "won" | "lost" | "pending"; firstInningScore: string | null;
};
export type NrfiResponse = { date: string; games: NrfiGame[]; averageNrfiProbability: number | null; topPick: NrfiGame | null; updatedAt: string; source: string; methodology: string };
export type NrfiWindowResponse = { startDate: string; endDate: string; days: NrfiResponse[]; games: NrfiGame[]; averageNrfiProbability: number | null; topPick: NrfiGame | null; updatedAt: string };

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb";
const CACHE_TTL = 20 * 60 * 1000;
const STALE_TTL = 2 * 60 * 60 * 1000;
const WINDOW_CACHE_TTL = 10 * 60 * 1000;
const HISTORY_CACHE_TTL = 30 * 60 * 1000;
const HISTORY_DAYS = 14;
const HISTORY_GAMES = 10;

let cachedResponse: NrfiResponse | null = null;
let cachedDate: string | null = null;
let cachedAt = 0;
const refreshInFlight = new Map<string, Promise<NrfiResponse>>();
const dailyScoreboardCache = new Map<string, { events: EspnEvent[]; expiresAt: number }>();
const historyInFlight = new Map<string, Promise<EspnEvent[]>>();
const teamFormCache = new Map<string, { value: TeamForm; expiresAt: number }>();

let cachedWindow: NrfiWindowResponse | null = null;
let cachedWindowStart: string | null = null;
let cachedWindowDays = 0;
let cachedWindowAt = 0;
let windowRefreshInFlight: Promise<NrfiWindowResponse> | null = null;

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "First-Basket-Pro/1.0" },
    });
    if (!response.ok) throw new Error(`ESPN returned ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function getTodayET(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}-${parts.find(p => p.type === "day")?.value}`;
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getFirstInningRuns(competitor: EspnCompetitor): number | null {
  const first = competitor.linescores?.find(line => line.period === 1);
  return typeof first?.value === "number" ? first.value : null;
}

function getOutcome(recommendation: "NRFI" | "YRFI", competition: EspnCompetition): Pick<NrfiGame, "outcome" | "firstInningScore"> {
  const competitors = competition.competitors ?? [];
  const away = competitors.find(c => c.homeAway === "away");
  const home = competitors.find(c => c.homeAway === "home");
  const awayRuns = away ? getFirstInningRuns(away) : null;
  const homeRuns = home ? getFirstInningRuns(home) : null;
  const firstInningScore = awayRuns !== null && homeRuns !== null ? `${awayRuns}-${homeRuns}` : null;
  const state = competition.status?.type?.state;
  if (!(state === "post" || (awayRuns !== null && homeRuns !== null && state !== "pre")) || awayRuns === null || homeRuns === null) {
    return { outcome: "pending", firstInningScore };
  }
  const wasNrfi = awayRuns === 0 && homeRuns === 0;
  return { outcome: recommendation === (wasNrfi ? "NRFI" : "YRFI") ? "won" : "lost", firstInningScore };
}

function getPitcher(competitor: EspnCompetitor): NrfiPitcher {
  const probable = competitor.probables?.find(item => item.name === "probableStartingPitcher") ?? competitor.probables?.[0];
  const eraText = probable?.statistics?.find(stat => stat.name === "ERA")?.displayValue;
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

async function withConcurrency<T, R>(values: T[], worker: (value: T) => Promise<R>, limit = 6): Promise<R[]> {
  if (!values.length) return [];
  const results: R[] = new Array(values.length);
  let next = 0;
  async function run() {
    while (next < values.length) {
      const index = next++;
      results[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => run()));
  return results;
}

async function fetchDailyScoreboard(date: string): Promise<EspnEvent[]> {
  const cached = dailyScoreboardCache.get(date);
  if (cached && cached.expiresAt > Date.now()) return cached.events;

  const existing = historyInFlight.get(`day:${date}`);
  if (existing) return existing;

  const request = (async () => {
    try {
      const data = await fetchJson<{ events?: EspnEvent[] }>(`${ESPN_BASE}/scoreboard?dates=${date.replace(/-/g, "")}`);
      const events = data.events ?? [];
      dailyScoreboardCache.set(date, { events, expiresAt: Date.now() + HISTORY_CACHE_TTL });
      return events;
    } catch {
      return [];
    } finally {
      historyInFlight.delete(`day:${date}`);
    }
  })();
  historyInFlight.set(`day:${date}`, request);
  return request;
}

async function fetchRecentHistory(beforeDate: string): Promise<EspnEvent[]> {
  const key = `history:${beforeDate}`;
  const existing = historyInFlight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const dates = Array.from({ length: HISTORY_DAYS }, (_, i) => addDays(beforeDate, -(i + 1)));
    const batches = await withConcurrency(dates, date => fetchDailyScoreboard(date), 6);
    return batches.flat();
  })();
  historyInFlight.set(key, request);
  try {
    return await request;
  } finally {
    historyInFlight.delete(key);
  }
}

function calculateLeagueBaseline(allRecentGames: EspnEvent[]) {
  const observations: { runs: number }[] = [];
  for (const event of allRecentGames) {
    const competition = event.competitions?.[0];
    const state = competition?.status?.type?.state;
    if (!(state === "post" || competition?.status?.type?.completed === true)) continue;
    for (const competitor of competition?.competitors ?? []) {
      const runs = getFirstInningRuns(competitor);
      if (runs !== null) observations.push({ runs });
    }
  }
  if (!observations.length) return { games: 0, runsPerInning: 0.50, scorelessPct: 0.60 };
  const mean = observations.reduce((sum, x) => sum + x.runs, 0) / observations.length;
  const scoreless = observations.filter(x => x.runs === 0).length / observations.length;
  return {
    games: observations.length,
    runsPerInning: clamp(mean, 0.20, 1.20),
    scorelessPct: clamp(scoreless, 0.40, 0.80),
  };
}

function calculateTeamForm(teamId: string, allRecentGames: EspnEvent[]): TeamForm {
  const fallback: TeamForm = {
    games: 0,
    scorelessPct: 0.60,
    runsPerFirstInning: 0.50,
    allowedPerFirstInning: 0.50,
    allowedScorelessPct: 0.60,
  };
  const teamGames = allRecentGames
    .filter(event => {
      const competition = event.competitions?.[0];
      const state = competition?.status?.type?.state;
      return (state === "post" || competition?.status?.type?.completed === true) &&
        competition?.competitors?.some(c => c.team?.id === teamId);
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, HISTORY_GAMES);

  const valid: { teamRuns: number; opponentRuns: number }[] = [];
  for (const event of teamGames) {
    const competition = event.competitions?.[0];
    const away = competition?.competitors?.find(c => c.homeAway === "away");
    const home = competition?.competitors?.find(c => c.homeAway === "home");
    if (!away?.team?.id || !home?.team?.id) continue;
    const awayRuns = getFirstInningRuns(away);
    const homeRuns = getFirstInningRuns(home);
    if (awayRuns === null || homeRuns === null) continue;
    const teamIsAway = away.team.id === teamId;
    valid.push({
      teamRuns: teamIsAway ? awayRuns : homeRuns,
      opponentRuns: teamIsAway ? homeRuns : awayRuns,
    });
  }

  if (!valid.length) return fallback;

  // Shrink small samples toward the league-neutral prior instead of allowing one
  // or two recent games to swing the prediction dramatically.
  const priorWeight = 5;
  const league = calculateLeagueBaseline(allRecentGames);
  const leagueMean = league.runsPerInning;
  const leagueScoreless = league.scorelessPct;
  const n = valid.length;
  const scored = valid.reduce((sum, x) => sum + x.teamRuns, 0);
  const allowed = valid.reduce((sum, x) => sum + x.opponentRuns, 0);
  const scorelessGames = valid.filter(x => x.teamRuns === 0).length;
  const allowedScorelessGames = valid.filter(x => x.opponentRuns === 0).length;

  return {
    games: n,
    scorelessPct: (scorelessGames + leagueScoreless * priorWeight) / (n + priorWeight),
    runsPerFirstInning: (scored + leagueMean * priorWeight) / (n + priorWeight),
    allowedPerFirstInning: (allowed + leagueMean * priorWeight) / (n + priorWeight),
    allowedScorelessPct: (allowedScorelessGames + leagueScoreless * priorWeight) / (n + priorWeight),
  };
}

async function fetchTeamForm(teamId: string, beforeDate: string, sharedHistory?: EspnEvent[]): Promise<TeamForm> {
  const cacheKey = `${teamId}:${beforeDate}`;
  const cached = teamFormCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const allRecentGames = sharedHistory ?? await fetchRecentHistory(beforeDate);
    const value = calculateTeamForm(teamId, allRecentGames);
    teamFormCache.set(cacheKey, { value, expiresAt: HISTORY_CACHE_TTL });
    return value;
  } catch {
    const fallback: TeamForm = {
      games: 0,
      scorelessPct: 0.60,
      runsPerFirstInning: 0.50,
      allowedPerFirstInning: 0.50,
      allowedScorelessPct: 0.60,
    };
    teamFormCache.set(cacheKey, { value: fallback, expiresAt: Date.now() + 5 * 60 * 1000 });
    return fallback;
  }
}

function pitcherRunAdjustment(pitcher: NrfiPitcher): number {
  // ERA is a broad signal, so keep its influence deliberately modest.
  return pitcher.era === null ? 1 : clamp(0.90 + (pitcher.era / 4.25) * 0.10, 0.90, 1.12);
}

function poissonNoRunProbability(expectedRuns: number): number {
  return Math.exp(-Math.max(0.01, expectedRuns));
}

function buildPrediction(
  awayForm: TeamForm,
  homeForm: TeamForm,
  awayPitcher: NrfiPitcher,
  homePitcher: NrfiPitcher,
  homeIndoor: boolean,
): Pick<NrfiGame, "nrfiProbability" | "recommendation" | "confidence" | "sampleSize" | "factors"> {
  // Estimate each side's first-inning run expectation from offense + opposing
  // first-inning prevention. Then blend the result with each team's empirical
  // scoreless rate. This avoids the old failure mode where a small sample could
  // force nearly every game to the same side of 50%.
  const awayLambdaMean = ((awayForm.runsPerFirstInning + homeForm.allowedPerFirstInning) / 2) * pitcherRunAdjustment(homePitcher);
  const homeLambdaMean = ((homeForm.runsPerFirstInning + awayForm.allowedPerFirstInning) / 2) * pitcherRunAdjustment(awayPitcher);

  const awayLambdaBinary = -Math.log(clamp((awayForm.scorelessPct + homeForm.allowedScorelessPct) / 2, 0.25, 0.90));
  const homeLambdaBinary = -Math.log(clamp((homeForm.scorelessPct + awayForm.allowedScorelessPct) / 2, 0.25, 0.90));

  const awayLambda = 0.65 * awayLambdaMean + 0.35 * awayLambdaBinary;
  const homeLambda = 0.65 * homeLambdaMean + 0.35 * homeLambdaBinary;
  const environment = homeIndoor ? 0.98 : 1;
  const expectedRuns = Math.max(0.05, (awayLambda + homeLambda) * environment);

  const poissonNrfi = poissonNoRunProbability(expectedRuns);
  const empiricalNrfi = clamp(awayForm.scorelessPct * homeForm.allowedScorelessPct, 0.20, 0.90);
  const nrfiProbability = Math.round(clamp((0.72 * poissonNrfi + 0.28 * empiricalNrfi) * 100, 25, 75));

  const sampleSize = Math.min(awayForm.games, homeForm.games);
  const pitcherKnown = awayPitcher.era !== null && homePitcher.era !== null;
  const enoughHistory = sampleSize >= 7;
  const confidence = enoughHistory && pitcherKnown
    ? "High"
    : sampleSize >= 4 && (pitcherKnown || awayPitcher.name !== null || homePitcher.name !== null)
      ? "Medium"
      : "Low";

  const factors: string[] = [];
  if (nrfiProbability >= 60) factors.push(`Model favors a scoreless first inning (${nrfiProbability}% NRFI probability)`);
  else if (nrfiProbability <= 40) factors.push(`Model sees meaningful first-inning scoring risk (${100 - nrfiProbability}% YRFI probability)`);
  else factors.push("First-inning scoring signals are close to the league baseline");
  if (pitcherKnown) factors.push(`Probable starters included (ERAs ${awayPitcher.era!.toFixed(2)} and ${homePitcher.era!.toFixed(2)})`);
  else factors.push("One or both probable starters are not confirmed; confidence is reduced");
  factors.push(`Recent sample: ${sampleSize || "limited"} verified games per team with Bayesian shrinkage`);

  return {
    nrfiProbability,
    recommendation: nrfiProbability >= 50 ? "NRFI" : "YRFI",
    confidence,
    sampleSize,
    factors,
  };
}

async function buildNrfiData(date: string): Promise<NrfiResponse> {
  const scoreboard = await fetchJson<{ events?: EspnEvent[] }>(`${ESPN_BASE}/scoreboard?dates=${date.replace(/-/g, "")}`);
  const rawGames = (scoreboard.events ?? [])
    .map(event => ({ event, competition: event.competitions?.[0] }))
    .filter((item): item is { event: EspnEvent; competition: EspnCompetition } => Boolean(item.competition?.competitors?.length === 2));

  const teamIds = Array.from(new Set(rawGames.flatMap(({ competition }) =>
    competition.competitors?.map(c => c.team?.id).filter((id): id is string => Boolean(id)) ?? []
  )));
  const sharedHistory = await fetchRecentHistory(date);
  const forms = await withConcurrency(teamIds, async teamId =>
    [teamId, await fetchTeamForm(teamId, date, sharedHistory)] as const, 12
  );
  const formMap = new Map(forms);

  const games = rawGames.map(({ event, competition }) => {
    const away = competition.competitors!.find(c => c.homeAway === "away")!;
    const home = competition.competitors!.find(c => c.homeAway === "home")!;
    const fallback: TeamForm = {
      games: 0,
      scorelessPct: 0.60,
      runsPerFirstInning: 0.50,
      allowedPerFirstInning: 0.50,
      allowedScorelessPct: 0.60,
    };
    const prediction = buildPrediction(
      formMap.get(away.team?.id ?? "") ?? fallback,
      formMap.get(home.team?.id ?? "") ?? fallback,
      getPitcher(away),
      getPitcher(home),
      competition.venue?.indoor === true,
    );
    return {
      id: event.id,
      date: event.date ?? `${date}T00:00:00Z`,
      shortName: event.shortName ?? `${away.team?.abbreviation ?? "Away"} @ ${home.team?.abbreviation ?? "Home"}`,
      away: {
        abbreviation: away.team?.abbreviation ?? "AWAY",
        name: away.team?.displayName ?? away.team?.shortDisplayName ?? "Away",
        logo: away.team?.logos?.[0]?.href ?? null,
        pitcher: getPitcher(away),
      },
      home: {
        abbreviation: home.team?.abbreviation ?? "HOME",
        name: home.team?.displayName ?? home.team?.shortDisplayName ?? "Home",
        logo: home.team?.logos?.[0]?.href ?? null,
        pitcher: getPitcher(home),
      },
      venue: competition.venue?.fullName ?? null,
      status: competition.status?.type?.detail ?? competition.status?.type?.state ?? "scheduled",
      ...prediction,
      ...getOutcome(prediction.recommendation, competition),
    };
  });

  const averageNrfiProbability = games.length
    ? Math.round(games.reduce((sum, g) => sum + g.nrfiProbability, 0) / games.length)
    : null;
  const topPick = games.length
    ? [...games].sort((a, b) => b.nrfiProbability - a.nrfiProbability)[0]
    : null;

  return {
    date,
    games,
    averageNrfiProbability,
    topPick,
    updatedAt: new Date().toISOString(),
    source: "ESPN MLB scoreboard + verified recent game summaries",
    methodology: "Recent first-inning offensive and defensive rates with Bayesian league shrinkage, empirical scoreless-rate blending, modest probable-starter ERA adjustment, and Poisson no-run probability.",
  };
}

export async function fetchNrfiData(date = getTodayET()): Promise<NrfiResponse> {
  const now = Date.now();
  if (cachedResponse && cachedDate === date && now - cachedAt < CACHE_TTL) return cachedResponse;
  const existing = refreshInFlight.get(date);
  if (existing) return existing;
  const refresh = (async () => {
    try {
      const data = await buildNrfiData(date);
      cachedResponse = data;
      cachedDate = date;
      cachedAt = Date.now();
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

export async function fetchUpcomingNrfiData(days = 3, startDate = getTodayET()): Promise<NrfiWindowResponse> {
  const safeDays = Math.min(Math.max(days, 1), 3);
  if (cachedWindow && cachedWindowStart === startDate && cachedWindowDays === safeDays && Date.now() - cachedWindowAt < WINDOW_CACHE_TTL) return cachedWindow;
  if (windowRefreshInFlight) return windowRefreshInFlight;
  windowRefreshInFlight = (async () => {
    const dates = Array.from({ length: safeDays }, (_, i) => addDays(startDate, i));
    const responses = await withConcurrency(dates, date => fetchNrfiData(date), 3);
    const games = responses.flatMap(r => r.games);
    const averageNrfiProbability = games.length ? Math.round(games.reduce((sum, g) => sum + g.nrfiProbability, 0) / games.length) : null;
    const topPick = games.length ? [...games].sort((a, b) => b.nrfiProbability - a.nrfiProbability)[0] : null;
    const result = {
      startDate,
      endDate: dates[dates.length - 1],
      days: responses,
      games,
      averageNrfiProbability,
      topPick,
      updatedAt: new Date().toISOString(),
    };
    cachedWindow = result;
    cachedWindowStart = startDate;
    cachedWindowDays = safeDays;
    cachedWindowAt = Date.now();
    return result;
  })();
  try {
    return await windowRefreshInFlight;
  } finally {
    windowRefreshInFlight = null;
  }
}