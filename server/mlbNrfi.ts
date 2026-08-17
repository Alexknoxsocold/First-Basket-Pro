type EspnEvent = {
  id: string;
  date?: string;
  shortName?: string;
  competitions?: EspnCompetition[];
};

type EspnSummary = {
  header?: {
    competitions?: {
      competitors?: { homeAway?: "home" | "away"; team?: { id?: string } }[];
    }[];
  };
  plays?: {
    period?: { number?: number };
    homeScore?: number;
    awayScore?: number;
  }[];
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

type TeamForm = {
  games: number;
  noRunPct: number;
  firstInningRuns: number;
  firstInningAllowed: number;
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
  away: {
    abbreviation: string;
    name: string;
    logo: string | null;
    pitcher: NrfiPitcher;
  };
  home: {
    abbreviation: string;
    name: string;
    logo: string | null;
    pitcher: NrfiPitcher;
  };
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
const CACHE_TTL = 20 * 60 * 1000; // 20 minutes
let cachedResponse: NrfiResponse | null = null;
let cachedDate: string | null = null;
let cachedAt = 0;
const teamFormCache = new Map<string, { value: TeamForm; expiresAt: number }>();

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`ESPN returned ${response.status} for ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function getTodayET(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
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
  const away = competitors.find((competitor) => competitor.homeAway === "away");
  const home = competitors.find((competitor) => competitor.homeAway === "home");
  const awayRuns = away ? getFirstInningRuns(away) : null;
  const homeRuns = home ? getFirstInningRuns(home) : null;
  const firstInningScore =
    awayRuns !== null && homeRuns !== null ? `${awayRuns}-${homeRuns}` : null;
  const state = competition.status?.type?.state;
  const firstInningComplete =
    state === "post" || (awayRuns !== null && homeRuns !== null && state !== "pre");

  if (!firstInningComplete || awayRuns === null || homeRuns === null) {
    return { outcome: "pending", firstInningScore };
  }

  const wasNrfi = awayRuns === 0 && homeRuns === 0;
  return {
    outcome: recommendation === (wasNrfi ? "NRFI" : "YRFI") ? "won" : "lost",
    firstInningScore,
  };
}

function getPitcher(competitor: EspnCompetitor): NrfiPitcher {
  const probable =
    competitor.probables?.find((item) => item.name === "probableStartingPitcher") ??
    competitor.probables?.[0];
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

async function fetchTeamForm(teamId: string, beforeDate: string): Promise<TeamForm> {
  const cached = teamFormCache.get(teamId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const data = await fetchJson<{ events?: EspnEvent[] }>(
      `${ESPN_BASE}/teams/${encodeURIComponent(teamId)}/schedule?limit=40`,
    );

    const completed = (data.events ?? [])
      .filter((event) => (event.date ?? "").slice(0, 10) < beforeDate)
      .filter((event) => {
        const state = event.competitions?.[0]?.status?.type?.state;
        return state === "post" || event.competitions?.[0]?.status?.type?.completed === true;
      })
      .slice(-5); // only last 5 games (was 8)

    // Fetch first-inning data with lower concurrency
    const firstInningResults = await withConcurrency(
      completed,
      async (event) => {
        try {
          const summary = await fetchJson<EspnSummary>(
            `${ESPN_BASE}/summary?event=${encodeURIComponent(event.id)}`,
            6000,
          );
          const competition = summary.header?.competitions?.[0];
          const homeId = competition?.competitors?.find((item) => item.homeAway === "home")?.team?.id;
          const awayId = competition?.competitors?.find((item) => item.homeAway === "away")?.team?.id;
          if (!homeId || !awayId || !summary.plays?.length) return null;

          const inningPlays = summary.plays.filter((play) => play.period?.number === 1);
          if (!inningPlays.length) return null;

          const lastPlay = inningPlays[inningPlays.length - 1];
          if (typeof lastPlay.homeScore !== "number" || typeof lastPlay.awayScore !== "number") {
            return null;
          }

          return {
            scored: teamId === homeId ? lastPlay.homeScore : lastPlay.awayScore,
            allowed: teamId === homeId ? lastPlay.awayScore : lastPlay.homeScore,
          };
        } catch {
          return null;
        }
      },
      4, // lower concurrency
    );

    let games = 0;
    let noRunGames = 0;
    let scored = 0;
    let allowed = 0;

    for (const result of firstInningResults) {
      if (!result) continue;
      games++;
      scored += result.scored;
      allowed += result.allowed;
      if (result.scored === 0 && result.allowed === 0) noRunGames++;
    }

    const value: TeamForm =
      games > 0
        ? {
            games,
            noRunPct: noRunGames / games,
            firstInningRuns: scored / games,
            firstInningAllowed: allowed / games,
          }
        : { games: 0, noRunPct: 0.55, firstInningRuns: 0.48, firstInningAllowed: 0.48 };

    teamFormCache.set(teamId, { value, expiresAt: Date.now() + CACHE_TTL });
    return value;
  } catch {
    // Graceful fallback if ESPN fails for this team
    const fallback: TeamForm = {
      games: 0,
      noRunPct: 0.55,
      firstInningRuns: 0.48,
      firstInningAllowed: 0.48,
    };
    teamFormCache.set(teamId, { value: fallback, expiresAt: Date.now() + 5 * 60 * 1000 });
    return fallback;
  }
}

function pitcherRunAdjustment(pitcher: NrfiPitcher): number {
  if (pitcher.era === null) return 1;
  return clamp(pitcher.era / 4.25, 0.72, 1.38);
}

function buildPrediction(
  awayForm: TeamForm,
  homeForm: TeamForm,
  awayPitcher: NrfiPitcher,
  homePitcher: NrfiPitcher,
  homeIndoor: boolean,
): Pick<NrfiGame, "nrfiProbability" | "recommendation" | "confidence" | "sampleSize" | "factors"> {
  const awayExpected =
    ((awayForm.firstInningRuns + homeForm.firstInningAllowed) / 2) *
    pitcherRunAdjustment(homePitcher);
  const homeExpected =
    ((homeForm.firstInningRuns + awayForm.firstInningAllowed) / 2) *
    pitcherRunAdjustment(awayPitcher);
  const parkAdjustment = homeIndoor ? 0.98 : 1;
  const expectedRuns = Math.max(0.05, (awayExpected + homeExpected) * parkAdjustment);
  const probability = Math.round(clamp(Math.exp(-expectedRuns) * 100, 20, 85));
  const sampleSize = Math.min(awayForm.games, homeForm.games);
  const pitcherKnown = awayPitcher.era !== null && homePitcher.era !== null;
  const confidence =
    sampleSize >= 8 && pitcherKnown
      ? "High"
      : sampleSize >= 4 && (pitcherKnown || awayPitcher.name !== null || homePitcher.name !== null)
        ? "Medium"
        : "Low";

  const factors: string[] = [];
  if (awayForm.noRunPct >= 0.55 && homeForm.noRunPct >= 0.55) {
    factors.push("Both teams have recently produced a high share of scoreless first innings");
  } else if (awayForm.noRunPct < 0.45 || homeForm.noRunPct < 0.45) {
    factors.push("At least one offense has frequently scored in the first inning recently");
  }
  if (pitcherKnown && awayPitcher.era !== null && homePitcher.era !== null) {
    factors.push(
      `Probable starters included (ERAs ${awayPitcher.era.toFixed(2)} and ${homePitcher.era.toFixed(2)})`,
    );
  } else {
    factors.push("One or both probable starters are not confirmed");
  }
  factors.push(`Based on ${sampleSize || "limited"} recent games per team`);

  return {
    nrfiProbability: probability,
    recommendation: probability >= 50 ? "NRFI" : "YRFI",
    confidence,
    sampleSize,
    factors,
  };
}

async function withConcurrency<T, R>(
  values: T[],
  worker: (value: T) => Promise<R>,
  limit = 4,
): Promise<R[]> {
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

export async function fetchNrfiData(date = getTodayET()): Promise<NrfiResponse> {
  // Serve from cache if still fresh
  if (cachedResponse && cachedDate === date && Date.now() - cachedAt < CACHE_TTL) {
    return cachedResponse;
  }

  const scoreboard = await fetchJson<{ events?: EspnEvent[] }>(
    `${ESPN_BASE}/scoreboard?dates=${date.replace(/-/g, "")}`,
  );

  const rawGames = (scoreboard.events ?? [])
    .map((event) => ({ event, competition: event.competitions?.[0] }))
    .filter(
      (item): item is { event: EspnEvent; competition: EspnCompetition } =>
        Boolean(item.competition?.competitors?.length === 2),
    );

  const teamIds = Array.from(
    new Set(
      rawGames.flatMap(
        ({ competition }) =>
          competition.competitors
            ?.map((competitor) => competitor.team?.id)
            .filter((id): id is string => Boolean(id)) ?? [],
      ),
    ),
  );

  const forms = await withConcurrency(
    teamIds,
    async (teamId) => [teamId, await fetchTeamForm(teamId, date)] as const,
    4,
  );
  const formMap = new Map(forms);

  const games = rawGames.map(({ event, competition }) => {
    const away = competition.competitors!.find((c) => c.homeAway === "away")!;
    const home = competition.competitors!.find((c) => c.homeAway === "home")!;
    const awayId = away.team?.id ?? "";
    const homeId = home.team?.id ?? "";
    const awayForm =
      formMap.get(awayId) ?? { games: 0, noRunPct: 0.55, firstInningRuns: 0.48, firstInningAllowed: 0.48 };
    const homeForm =
      formMap.get(homeId) ?? { games: 0, noRunPct: 0.55, firstInningRuns: 0.48, firstInningAllowed: 0.48 };
    const awayPitcher = getPitcher(away);
    const homePitcher = getPitcher(home);
    const status = competition.status?.type?.detail ?? "Scheduled";
    const prediction = buildPrediction(
      awayForm,
      homeForm,
      awayPitcher,
      homePitcher,
      competition.venue?.indoor === true,
    );
    const outcome = getOutcome(prediction.recommendation, competition);

    return {
      id: event.id,
      date: event.date ?? `${date}T00:00:00Z`,
      shortName:
        event.shortName ??
        `${away.team?.abbreviation ?? "Away"} @ ${home.team?.abbreviation ?? "Home"}`,
      away: {
        abbreviation: away.team?.abbreviation ?? "AWAY",
        name: away.team?.displayName ?? away.team?.shortDisplayName ?? "Away",
        logo: away.team?.logos?.[0]?.href ?? null,
        pitcher: awayPitcher,
      },
      home: {
        abbreviation: home.team?.abbreviation ?? "HOME",
        name: home.team?.displayName ?? home.team?.shortDisplayName ?? "Home",
        logo: home.team?.logos?.[0]?.href ?? null,
        pitcher: homePitcher,
      },
      venue: competition.venue?.fullName ?? null,
      status,
      ...prediction,
      ...outcome,
    };
  });

  const averageNrfiProbability =
    games.length > 0
      ? Math.round(games.reduce((sum, g) => sum + g.nrfiProbability, 0) / games.length)
      : null;

  const topPick =
    [...games].sort((a, b) => b.nrfiProbability - a.nrfiProbability)[0] ?? null;

  const response: NrfiResponse = {
    date,
    games,
    averageNrfiProbability,
    topPick,
    updatedAt: new Date().toISOString(),
    source: "ESPN",
    methodology:
      "First-inning run expectancy model using recent team form + probable starter ERA adjustments",
  };

  // Update cache
  cachedResponse = response;
  cachedDate = date;
  cachedAt = Date.now();

  return response;
}

export async function fetchUpcomingNrfiData(days = 3): Promise<NrfiWindowResponse> {
  const start = getTodayET();
  const results: NrfiResponse[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(`${start}T12:00:00`);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    try {
      const dayData = await fetchNrfiData(dateStr);
      results.push(dayData);
    } catch {
      // skip failed days
    }
  }

  const allGames = results.flatMap((r) => r.games);
  const averageNrfiProbability =
    allGames.length > 0
      ? Math.round(allGames.reduce((sum, g) => sum + g.nrfiProbability, 0) / allGames.length)
      : null;
  const topPick =
    [...allGames].sort((a, b) => b.nrfiProbability - a.nrfiProbability)[0] ?? null;

  return {
    startDate: start,
    endDate: results[results.length - 1]?.date ?? start,
    days: results,
    games: allGames,
    averageNrfiProbability,
    topPick,
    updatedAt: new Date().toISOString(),
  };
}