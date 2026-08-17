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
const CACHE_TTL = 10 * 60 * 1000;
let cachedResponse: NrfiResponse | null = null;
let cachedDate: string | null = null;
let cachedAt = 0;
const teamFormCache = new Map<string, { value: TeamForm; expiresAt: number }>();

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`ESPN returned ${response.status} for ${url}`);
  }
  return response.json() as Promise<T>;
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
  const firstInningScore = awayRuns !== null && homeRuns !== null
    ? `${awayRuns}-${homeRuns}`
    : null;
  const state = competition.status?.type?.state;
  const firstInningComplete = state === "post" || (awayRuns !== null && homeRuns !== null && state !== "pre");

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
  const probable = competitor.probables?.find((item) => item.name === "probableStartingPitcher")
    ?? competitor.probables?.[0];
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

  const data = await fetchJson<{ events?: EspnEvent[] }>(
    `${ESPN_BASE}/teams/${encodeURIComponent(teamId)}/schedule?limit=80`,
  );
  const completed = (data.events ?? [])
    .filter((event) => (event.date ?? "").slice(0, 10) < beforeDate)
    .filter((event) => {
      const state = event.competitions?.[0]?.status?.type?.state;
      return state === "post" || event.competitions?.[0]?.status?.type?.completed === true;
    })
    .slice(-8);

  // The compact team schedule omits inning linescores. The event summary
  // includes play-by-play score snapshots, which lets us recover the actual
  // first-inning score for a small recent sample.
  const firstInningResults = await withConcurrency(completed, async (event) => {
    try {
      const summary = await fetchJson<EspnSummary>(
        `${ESPN_BASE}/summary?event=${encodeURIComponent(event.id)}`,
      );
      const competition = summary.header?.competitions?.[0];
      const homeId = competition?.competitors?.find((item) => item.homeAway === "home")?.team?.id;
      const awayId = competition?.competitors?.find((item) => item.homeAway === "away")?.team?.id;
      if (!homeId || !awayId || !summary.plays?.length) return null;
      const inningPlays = summary.plays.filter((play) => play.period?.number === 1);
      if (!inningPlays.length) return null;
      const lastPlay = inningPlays[inningPlays.length - 1];
      if (typeof lastPlay.homeScore !== "number" || typeof lastPlay.awayScore !== "number") return null;
      return {
        scored: teamId === homeId ? lastPlay.homeScore : lastPlay.awayScore,
        allowed: teamId === homeId ? lastPlay.awayScore : lastPlay.homeScore,
      };
    } catch {
      return null;
    }
  }, 8);

  let games = 0;
  let noRunGames = 0;
  let scored = 0;
  let allowed = 0;

  for (const result of firstInningResults) {
    if (!result) continue;
    const teamRuns = result.scored;
    const opponentRuns = result.allowed;
    games++;
    scored += teamRuns;
    allowed += opponentRuns;
    if (teamRuns === 0 && opponentRuns === 0) noRunGames++;
  }

  // A neutral fallback keeps a game usable if ESPN omits linescores.
  const value: TeamForm = games > 0
    ? {
        games,
        noRunPct: noRunGames / games,
        firstInningRuns: scored / games,
        firstInningAllowed: allowed / games,
      }
    : { games: 0, noRunPct: 0.55, firstInningRuns: 0.48, firstInningAllowed: 0.48 };

  teamFormCache.set(teamId, { value, expiresAt: Date.now() + CACHE_TTL });
  return value;
}

function pitcherRunAdjustment(pitcher: NrfiPitcher): number {
  if (pitcher.era === null) return 1;
  // ERA is only a broad adjustment here; it is not a substitute for a full
  // first-inning pitcher split.
  return clamp(pitcher.era / 4.25, 0.72, 1.38);
}

function buildPrediction(
  awayForm: TeamForm,
  homeForm: TeamForm,
  awayPitcher: NrfiPitcher,
  homePitcher: NrfiPitcher,
  homeIndoor: boolean,
): Pick<NrfiGame, "nrfiProbability" | "recommendation" | "confidence" | "sampleSize" | "factors"> {
  // Expected first-inning runs for each offense combines its recent scoring
  // with the opponent's recent first-inning runs allowed.
  const awayExpected = ((awayForm.firstInningRuns + homeForm.firstInningAllowed) / 2)
    * pitcherRunAdjustment(homePitcher);
  const homeExpected = ((homeForm.firstInningRuns + awayForm.firstInningAllowed) / 2)
    * pitcherRunAdjustment(awayPitcher);
  const parkAdjustment = homeIndoor ? 0.98 : 1;
  const expectedRuns = Math.max(0.05, (awayExpected + homeExpected) * parkAdjustment);
  const probability = Math.round(clamp(Math.exp(-expectedRuns) * 100, 20, 85));
  const sampleSize = Math.min(awayForm.games, homeForm.games);
  const pitcherKnown = awayPitcher.era !== null && homePitcher.era !== null;
  const confidence = sampleSize >= 15 && pitcherKnown ? "High"
    : sampleSize >= 8 && (pitcherKnown || awayPitcher.name !== null || homePitcher.name !== null) ? "Medium"
    : "Low";
  const factors: string[] = [];

  if (awayForm.noRunPct >= 0.55 && homeForm.noRunPct >= 0.55) {
    factors.push("Both teams have recently produced a high share of scoreless first innings");
  } else if (awayForm.noRunPct < 0.45 || homeForm.noRunPct < 0.45) {
    factors.push("At least one offense has frequently scored in the first inning recently");
  }
  if (pitcherKnown && awayPitcher.era !== null && homePitcher.era !== null) {
    factors.push(`Probable starters included (ERAs ${awayPitcher.era.toFixed(2)} and ${homePitcher.era.toFixed(2)})`);
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
  limit = 8,
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
  if (cachedResponse && cachedDate === date && Date.now() - cachedAt < CACHE_TTL) {
    return cachedResponse;
  }

  const scoreboard = await fetchJson<{ events?: EspnEvent[] }>(
    `${ESPN_BASE}/scoreboard?dates=${date.replace(/-/g, "")}`,
  );
  const rawGames = (scoreboard.events ?? [])
    .map((event) => ({ event, competition: event.competitions?.[0] }))
    .filter((item): item is { event: EspnEvent; competition: EspnCompetition } =>
      Boolean(item.competition?.competitors?.length === 2),
    );

  const teamIds = Array.from(new Set(
    rawGames.flatMap(({ competition }) =>
      competition.competitors?.map((competitor) => competitor.team?.id)
        .filter((id): id is string => Boolean(id)) ?? [],
    ),
  ));
  const forms = await withConcurrency(teamIds, async (teamId) => [teamId, await fetchTeamForm(teamId, date)] as const);
  const formMap = new Map(forms);

  const games = rawGames.map(({ event, competition }) => {
    const away = competition.competitors!.find((competitor) => competitor.homeAway === "away")!;
    const home = competition.competitors!.find((competitor) => competitor.homeAway === "home")!;
    const awayId = away.team?.id ?? "";
    const homeId = home.team?.id ?? "";
    const awayForm = formMap.get(awayId) ?? { games: 0, noRunPct: 0.55, firstInningRuns: 0.48, firstInningAllowed: 0.48 };
    const homeForm = formMap.get(homeId) ?? { games: 0, noRunPct: 0.55, firstInningRuns: 0.48, firstInningAllowed: 0.48 };
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
      shortName: event.shortName ?? `${away.team?.abbreviation ?? "Away"} @ ${home.team?.abbreviation ?? "Home"}`,
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

  const sortedGames = games.sort((a, b) => b.nrfiProbability - a.nrfiProbability);
  const response: NrfiResponse = {
    date,
    games: sortedGames,
    averageNrfiProbability: sortedGames.length
      ? Math.round(sortedGames.reduce((sum, game) => sum + game.nrfiProbability, 0) / sortedGames.length)
      : null,
    topPick: sortedGames[0] ?? null,
    updatedAt: new Date().toISOString(),
    source: "ESPN MLB schedule and team game logs",
    methodology: "Recent first-inning scoring allowed/scored rates with probable-starter ERA adjustment",
  };

  cachedResponse = response;
  cachedDate = date;
  cachedAt = Date.now();
  return response;
}

export async function fetchUpcomingNrfiData(days = 3): Promise<NrfiWindowResponse> {
  const count = clamp(Math.round(days), 1, 3);
  const startDate = getTodayET();
  const dates = Array.from({ length: count }, (_, index) => {
    const date = new Date(`${startDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  const dayResponses = await withConcurrency(dates, (date) => fetchNrfiData(date), count);
  const games = dayResponses.flatMap((day) => day.games);
  const sortedGames = [...games].sort((a, b) => b.nrfiProbability - a.nrfiProbability);

  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    days: dayResponses,
    games,
    averageNrfiProbability: games.length
      ? Math.round(games.reduce((sum, game) => sum + game.nrfiProbability, 0) / games.length)
      : null,
    topPick: sortedGames[0] ?? null,
    updatedAt: new Date().toISOString(),
  };
}