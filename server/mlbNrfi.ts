import { calibrateRecommendedProbability } from "./mlbCalibration.js";
import { predictNrfiV4, type V4Prediction } from "./mlbNrfiV4.js";
import { recordNrfiShadowPrediction } from "./mlbNrfiShadowStore.js";
import { fetchFirstInningMarkets } from "./mlbFirstInningMarkets.js";

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
  probables?: {
    name?: string;
    athlete?: { id?: string; fullName?: string; displayName?: string; headshot?: string };
    statistics?: { name?: string; displayValue?: string }[];
  }[];
};

type TeamForm = {
  games: number;
  scorelessPct: number;
  runsPerFirstInning: number;
  allowedPerFirstInning: number;
  allowedScorelessPct: number;
};

export type NrfiPitcher = {
  name: string | null;
  era: number | null;
  whip: number | null;
  headshot: string | null;
  source?: "ESPN" | "MLB" | "pending";
};

export type NrfiMarketQuote = {
  bookmaker: string;
  bookmakerKey: string;
  americanOdds: number;
  updatedAt: string | null;
};

export type NrfiMarketValue = {
  available: boolean;
  book: string | null;
  selection: "NRFI" | "YRFI" | null;
  price: number | null;
  impliedProbability: number | null;
  noVigProbability: number | null;
  edge: number | null;
  ev: number | null;
  updatedAt: string | null;
  quotes?: NrfiMarketQuote[];
};

export type NrfiGame = {
  id: string;
  date: string;
  gameStartAt: string;
  shortName: string;
  away: { abbreviation: string; name: string; logo: string | null; pitcher: NrfiPitcher };
  home: { abbreviation: string; name: string; logo: string | null; pitcher: NrfiPitcher };
  venue: string | null;
  status: string;
  nrfiProbability: number;
  recommendation: "NRFI" | "YRFI";
  playStatus: "BEST_PLAY" | "PLAY" | "LEAN" | "NO_PLAY";
  modelEdge: number;
  confidence: "High" | "Medium" | "Low";
  sampleSize: number;
  factors: string[];
  outcome: "won" | "lost" | "pending";
  firstInningScore: string | null;
  v4Shadow?: V4Prediction;
  marketValue?: NrfiMarketValue | null;
};

export type NrfiResponse = {
  date: string;
  games: NrfiGame[];
  averageNrfiProbability: number | null;
  topPick: NrfiGame | null;
  updatedAt: string;
  source: string;
  methodology: string;
  marketStatus?: "live" | "unavailable";
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
const MLB_BASE = "https://statsapi.mlb.com/api/v1";
const CACHE_TTL = 5 * 60 * 1000;
const STALE_TTL = 2 * 60 * 60 * 1000;
const WINDOW_CACHE_TTL = 5 * 60 * 1000;
const HISTORY_CACHE_TTL = 30 * 60 * 1000;
const PITCHER_CACHE_TTL = 6 * 60 * 60 * 1000;
const HISTORY_DAYS = 30;
const HISTORY_GAMES = 15;
const PRIOR_WEIGHT = 7;
const RECENCY_DECAY = 0.92;
const BEST_PLAY_EDGE = 0.10;
const PLAY_EDGE = 0.06;
const LEAN_EDGE = 0.03;
const MIN_LEAN_SAMPLE = 3;
const MIN_PLAY_SAMPLE = 4;

let cachedResponse: NrfiResponse | null = null;
let cachedDate: string | null = null;
let cachedAt = 0;
const refreshInFlight = new Map<string, Promise<NrfiResponse>>();
const dailyScoreboardCache = new Map<string, { events: EspnEvent[]; expiresAt: number }>();
const historyInFlight = new Map<string, Promise<EspnEvent[]>>();
const teamFormCache = new Map<string, { value: TeamForm; expiresAt: number }>();
const pitcherCache = new Map<string, { value: { era: number | null; whip: number | null }; expiresAt: number }>();
let cachedWindow: NrfiWindowResponse | null = null;
let cachedWindowStart: string | null = null;
let cachedWindowDays = 0;
let cachedWindowAt = 0;
let windowRefreshInFlight: Promise<NrfiWindowResponse> | null = null;

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "First-Basket-Pro/1.0" } });
    if (!response.ok) throw new Error(`Remote API returned ${response.status}`);
    return (await response.json()) as T;
  } finally { clearTimeout(timer); }
}

function getTodayET(): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}-${parts.find(p => p.type === "day")?.value}`;
}
function addDays(dateISO: string, days: number): string { const d = new Date(`${dateISO}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
function getFirstInningRuns(competitor: EspnCompetitor): number | null { const first = competitor.linescores?.find(line => line.period === 1); return typeof first?.value === "number" ? first.value : null; }
function parsePitcherStat(probable: NonNullable<EspnCompetitor["probables"]>[number] | undefined, name: string): number | null { const text = probable?.statistics?.find(stat => stat.name?.toUpperCase() === name)?.displayValue; if (!text) return null; const value = Number.parseFloat(text); return Number.isFinite(value) ? value : null; }

async function fetchMlbPitcherStats(name: string): Promise<{ era: number | null; whip: number | null }> {
  const key = name.trim().toLowerCase(); if (!key) return { era: null, whip: null };
  const cached = pitcherCache.get(key); if (cached && cached.expiresAt > Date.now()) return cached.value;
  const empty = { era: null, whip: null };
  try {
    const search = await fetchJson<{ people?: { id?: number; fullName?: string }[] }>(`${MLB_BASE}/people/search?names=${encodeURIComponent(name)}&active=true&sportIds=1`, 5000);
    const candidates = search.people ?? []; const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const match = candidates.find(p => (p.fullName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") === normalized) ?? candidates[0];
    if (!match?.id) { pitcherCache.set(key, { value: empty, expiresAt: Date.now() + PITCHER_CACHE_TTL }); return empty; }
    const season = new Date().getUTCFullYear();
    const stats = await fetchJson<{ stats?: { splits?: { stat?: { era?: string | number; whip?: string | number } }[] }[] }>(`${MLB_BASE}/people/${match.id}/stats?stats=season&group=pitching&season=${season}`, 5000);
    const stat = stats.stats?.[0]?.splits?.[0]?.stat; const era = stat?.era !== undefined ? Number(stat.era) : null; const whip = stat?.whip !== undefined ? Number(stat.whip) : null;
    const value = { era: Number.isFinite(era as number) ? era : null, whip: Number.isFinite(whip as number) ? whip : null };
    pitcherCache.set(key, { value, expiresAt: Date.now() + PITCHER_CACHE_TTL }); return value;
  } catch { pitcherCache.set(key, { value: empty, expiresAt: Date.now() + 15 * 60 * 1000 }); return empty; }
}

async function getPitcher(competitor: EspnCompetitor): Promise<NrfiPitcher> {
  const probable = competitor.probables?.find(item => item.name === "probableStartingPitcher") ?? competitor.probables?.[0];
  const name = probable?.athlete?.displayName ?? probable?.athlete?.fullName ?? null;
  let era = parsePitcherStat(probable, "ERA"); let whip = parsePitcherStat(probable, "WHIP"); let source: NrfiPitcher["source"] = era !== null || whip !== null ? "ESPN" : "pending";
  if (name && (era === null || whip === null)) { const fallback = await fetchMlbPitcherStats(name); if (era === null) era = fallback.era; if (whip === null) whip = fallback.whip; if (era !== null || whip !== null) source = "MLB"; }
  return { name, era, whip, headshot: probable?.athlete?.headshot ?? null, source: era !== null || whip !== null ? source : "pending" };
}

function getOutcome(recommendation: "NRFI" | "YRFI", competition: EspnCompetition): Pick<NrfiGame, "outcome" | "firstInningScore"> {
  const competitors = competition.competitors ?? []; const away = competitors.find(c => c.homeAway === "away"); const home = competitors.find(c => c.homeAway === "home");
  const awayRuns = away ? getFirstInningRuns(away) : null; const homeRuns = home ? getFirstInningRuns(home) : null; const firstInningScore = awayRuns !== null && homeRuns !== null ? `${awayRuns}-${homeRuns}` : null; const state = competition.status?.type?.state;
  if (!(state === "post" || (awayRuns !== null && homeRuns !== null && state !== "pre")) || awayRuns === null || homeRuns === null) return { outcome: "pending", firstInningScore };
  const wasNrfi = awayRuns === 0 && homeRuns === 0; return { outcome: recommendation === (wasNrfi ? "NRFI" : "YRFI") ? "won" : "lost", firstInningScore };
}

async function withConcurrency<T, R>(values: T[], worker: (value: T) => Promise<R>, limit = 6): Promise<R[]> { if (!values.length) return []; const results: R[] = new Array(values.length); let next = 0; async function run() { while (next < values.length) { const index = next++; results[index] = await worker(values[index]); } } await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => run())); return results; }
async function fetchDailyScoreboard(date: string): Promise<EspnEvent[]> { const cached = dailyScoreboardCache.get(date); if (cached && cached.expiresAt > Date.now()) return cached.events; const key = `day:${date}`; const existing = historyInFlight.get(key); if (existing) return existing; const request = (async () => { try { const data = await fetchJson<{ events?: EspnEvent[] }>(`${ESPN_BASE}/scoreboard?dates=${date.replace(/-/g, "")}`); const events = data.events ?? []; dailyScoreboardCache.set(date, { events, expiresAt: Date.now() + HISTORY_CACHE_TTL }); return events; } catch { return []; } finally { historyInFlight.delete(key); } })(); historyInFlight.set(key, request); return request; }
async function fetchRecentHistory(beforeDate: string): Promise<EspnEvent[]> { const key = `history:${beforeDate}`; const existing = historyInFlight.get(key); if (existing) return existing; const request = (async () => { const dates = Array.from({ length: HISTORY_DAYS }, (_, i) => addDays(beforeDate, -(i + 1))); const batches = await withConcurrency(dates, date => fetchDailyScoreboard(date), 8); return batches.flat(); })(); historyInFlight.set(key, request); try { return await request; } finally { historyInFlight.delete(key); } }
function calculateLeagueBaseline(allRecentGames: EspnEvent[]) { let completedGames = 0, nrfiGames = 0, totalWeight = 0, weightedRuns = 0, weightedScoreless = 0; const completed = allRecentGames.map(event => ({ event, competition: event.competitions?.[0] })).filter(item => { const state = item.competition?.status?.type?.state; return state === "post" || item.competition?.status?.type?.completed === true; }).sort((a, b) => (b.event.date ?? "").localeCompare(a.event.date ?? "")); for (const [index, item] of completed.entries()) { const competitors = item.competition?.competitors ?? []; const away = competitors.find(c => c.homeAway === "away"); const home = competitors.find(c => c.homeAway === "home"); const awayRuns = away ? getFirstInningRuns(away) : null; const homeRuns = home ? getFirstInningRuns(home) : null; const weight = Math.pow(RECENCY_DECAY, index); if (awayRuns !== null && homeRuns !== null) { completedGames++; if (awayRuns === 0 && homeRuns === 0) nrfiGames++; weightedRuns += (awayRuns + homeRuns) / 2 * weight; weightedScoreless += ((awayRuns === 0 ? 1 : 0) + (homeRuns === 0 ? 1 : 0)) / 2 * weight; totalWeight += weight; } } if (!totalWeight) return { games: 0, runsPerInning: 0.50, scorelessPct: 0.60, gameNrfiPct: 0.49 }; return { games: completedGames, runsPerInning: clamp(weightedRuns / totalWeight, 0.20, 1.20), scorelessPct: clamp(weightedScoreless / totalWeight, 0.40, 0.80), gameNrfiPct: clamp(completedGames ? nrfiGames / completedGames : 0.49, 0.35, 0.65) }; }
function calculateTeamForm(teamId: string, allRecentGames: EspnEvent[]): TeamForm { const league = calculateLeagueBaseline(allRecentGames); const fallback: TeamForm = { games: 0, scorelessPct: league.scorelessPct, runsPerFirstInning: league.runsPerInning, allowedPerFirstInning: league.runsPerInning, allowedScorelessPct: league.scorelessPct }; const teamGames = allRecentGames.filter(event => { const competition = event.competitions?.[0]; const state = competition?.status?.type?.state; return (state === "post" || competition?.status?.type?.completed === true) && competition?.competitors?.some(c => c.team?.id === teamId); }).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")).slice(0, HISTORY_GAMES); const valid: { teamRuns: number; opponentRuns: number; weight: number }[] = []; for (const [index, event] of teamGames.entries()) { const competition = event.competitions?.[0]; const team = competition?.competitors?.find(c => c.team?.id === teamId); const opp = competition?.competitors?.find(c => c.team?.id !== teamId); if (!team || !opp) continue; const teamRuns = getFirstInningRuns(team), opponentRuns = getFirstInningRuns(opp); if (teamRuns === null || opponentRuns === null) continue; valid.push({ teamRuns, opponentRuns, weight: Math.pow(RECENCY_DECAY, index) }); } if (!valid.length) return fallback; const totalWeight = valid.reduce((s, x) => s + x.weight, 0), prior = PRIOR_WEIGHT; return { games: valid.length, scorelessPct: (valid.reduce((s, x) => s + (x.teamRuns === 0 ? x.weight : 0), 0) + league.scorelessPct * prior) / (totalWeight + prior), runsPerFirstInning: (valid.reduce((s, x) => s + x.teamRuns * x.weight, 0) + league.runsPerInning * prior) / (totalWeight + prior), allowedPerFirstInning: (valid.reduce((s, x) => s + x.opponentRuns * x.weight, 0) + league.runsPerInning * prior) / (totalWeight + prior), allowedScorelessPct: (valid.reduce((s, x) => s + (x.opponentRuns === 0 ? x.weight : 0), 0) + league.scorelessPct * prior) / (totalWeight + prior) }; }
async function fetchTeamForm(teamId: string, date: string, history: EspnEvent[]): Promise<TeamForm> { const key = `${teamId}:${date}`; const cached = teamFormCache.get(key); if (cached && cached.expiresAt > Date.now()) return cached.value; const value = calculateTeamForm(teamId, history); teamFormCache.set(key, { value, expiresAt: Date.now() + HISTORY_CACHE_TTL }); return value; }
function pitcherRunAdjustment(p: NrfiPitcher): number { let adj = 0; if (p.era !== null) adj += (p.era - 4.20) * 0.025; if (p.whip !== null) adj += (p.whip - 1.30) * 0.18; return clamp(adj, -0.18, 0.18); }
async function buildPrediction(awayForm: TeamForm, homeForm: TeamForm, awayPitcher: NrfiPitcher, homePitcher: NrfiPitcher, indoor: boolean, leagueNrfi: number) { const offense = ((awayForm.runsPerFirstInning + homeForm.allowedPerFirstInning) + (homeForm.runsPerFirstInning + awayForm.allowedPerFirstInning)) / 2; const pitcherAdj = (pitcherRunAdjustment(awayPitcher) + pitcherRunAdjustment(homePitcher)) / 2; const lambda = clamp(offense * (1 + pitcherAdj), 0.35, 1.75); let rawNrfi = Math.exp(-lambda); rawNrfi = rawNrfi * 0.70 + leagueNrfi * 0.30; if (indoor) rawNrfi = rawNrfi * 0.98 + 0.02 * 0.50; const calibrated = await calibrateRecommendedProbability(rawNrfi, "NRFI"); const nrfiProbability = Math.round(clamp(calibrated * 100, 25, 75) * 10) / 10; const recommendation: "NRFI" | "YRFI" = nrfiProbability >= 50 ? "NRFI" : "YRFI"; const sideProb = recommendation === "NRFI" ? nrfiProbability / 100 : 1 - nrfiProbability / 100; const modelEdge = Math.round(Math.abs(sideProb - 0.5) * 1000) / 10; const sampleSize = Math.min(awayForm.games, homeForm.games); let playStatus: NrfiGame["playStatus"] = "NO_PLAY"; if (sampleSize >= MIN_PLAY_SAMPLE && sideProb - 0.5 >= BEST_PLAY_EDGE) playStatus = "BEST_PLAY"; else if (sampleSize >= MIN_PLAY_SAMPLE && sideProb - 0.5 >= PLAY_EDGE) playStatus = "PLAY"; else if (sampleSize >= MIN_LEAN_SAMPLE && sideProb - 0.5 >= LEAN_EDGE) playStatus = "LEAN"; const confidence: NrfiGame["confidence"] = playStatus === "BEST_PLAY" ? "High" : playStatus === "PLAY" ? "Medium" : playStatus === "LEAN" ? "Low" : "Low"; const factors: string[] = []; if (awayPitcher.era !== null || homePitcher.era !== null) factors.push(`Probable starter ERAs included (${awayPitcher.era !== null ? awayPitcher.era.toFixed(2) : "pending"} and ${homePitcher.era !== null ? homePitcher.era.toFixed(2) : "pending"})`); if (awayPitcher.whip !== null || homePitcher.whip !== null) factors.push(`WHIP signal included (${awayPitcher.whip !== null ? awayPitcher.whip.toFixed(2) : "pending"} and ${homePitcher.whip !== null ? homePitcher.whip.toFixed(2) : "pending"})`); if (awayPitcher.source === "MLB" || homePitcher.source === "MLB") factors.push("Missing ESPN pitcher metrics filled from MLB Stats API"); factors.push(`Recent sample: ${sampleSize || "limited"} verified games per team with recency weighting and Bayesian shrinkage`); factors.push(`Recent league NRFI baseline: ${Math.round(leagueNrfi * 100)}%`); return { nrfiProbability, recommendation, playStatus, modelEdge, confidence, sampleSize, factors }; }

async function buildNrfiData(date: string): Promise<NrfiResponse> {
  const scoreboard = await fetchJson<{ events?: EspnEvent[] }>(`${ESPN_BASE}/scoreboard?dates=${date.replace(/-/g, "")}`);
  const rawGames = (scoreboard.events ?? []).map(event => ({ event, competition: event.competitions?.[0] })).filter((item): item is { event: EspnEvent; competition: EspnCompetition } => Boolean(item.competition?.competitors?.length === 2));
  const teamIds = Array.from(new Set(rawGames.flatMap(({ competition }) => competition.competitors?.map(c => c.team?.id).filter((id): id is string => Boolean(id)) ?? [])));
  const sharedHistory = await fetchRecentHistory(date); const leagueBaseline = calculateLeagueBaseline(sharedHistory);
  const forms = await withConcurrency(teamIds, async teamId => [teamId, await fetchTeamForm(teamId, date, sharedHistory)] as const, 12); const formMap = new Map(forms);
  const fallback: TeamForm = { games: 0, scorelessPct: leagueBaseline.scorelessPct, runsPerFirstInning: leagueBaseline.runsPerInning, allowedPerFirstInning: leagueBaseline.runsPerInning, allowedScorelessPct: leagueBaseline.scorelessPct };
  const baseGames = await withConcurrency(rawGames, async ({ event, competition }) => {
    const away = competition.competitors!.find(c => c.homeAway === "away")!; const home = competition.competitors!.find(c => c.homeAway === "home")!;
    const [awayPitcher, homePitcher] = await Promise.all([getPitcher(away), getPitcher(home)]);
    const awayForm = formMap.get(away.team?.id ?? "") ?? fallback; const homeForm = formMap.get(home.team?.id ?? "") ?? fallback;
    const prediction = await buildPrediction(awayForm, homeForm, awayPitcher, homePitcher, competition.venue?.indoor === true, leagueBaseline.gameNrfiPct);
    const sampleSize = Math.min(awayForm.games, homeForm.games);
    const teamNrfiProbability = clamp(((awayForm.scorelessPct + homeForm.allowedScorelessPct) / 2) * ((homeForm.scorelessPct + awayForm.allowedScorelessPct) / 2), 0.25, 0.75);
    const averagePitcherRunAdjustment = (pitcherRunAdjustment(awayPitcher) + pitcherRunAdjustment(homePitcher)) / 2;
    const v4Shadow = predictNrfiV4({ leagueNrfiProbability: leagueBaseline.gameNrfiPct, teamNrfiProbability, pitcherAdjustment: 1 - averagePitcherRunAdjustment, dataQuality: { lineupConfirmed: false, pitcherConfirmed: awayPitcher.name !== null && homePitcher.name !== null, pitcherMetricsComplete: awayPitcher.era !== null && awayPitcher.whip !== null && homePitcher.era !== null && homePitcher.whip !== null, sampleSize, weatherAvailable: competition.venue?.indoor === true } });
    const outcome = getOutcome(prediction.recommendation, competition);
    recordNrfiShadowPrediction({ gameId: event.id, createdAt: new Date().toISOString(), v3Probability: prediction.nrfiProbability / 100, v4: v4Shadow, outcome: outcome.outcome === "pending" ? undefined : outcome.firstInningScore === "0-0" ? "NRFI" : "YRFI" });
    const gameStartAt = event.date ?? `${date}T00:00:00Z`;
    return { id: event.id, date: gameStartAt, gameStartAt, shortName: event.shortName ?? `${away.team?.abbreviation ?? "Away"} @ ${home.team?.abbreviation ?? "Home"}`, away: { abbreviation: away.team?.abbreviation ?? "AWAY", name: away.team?.displayName ?? away.team?.shortDisplayName ?? "Away", logo: away.team?.logos?.[0]?.href ?? null, pitcher: awayPitcher }, home: { abbreviation: home.team?.abbreviation ?? "HOME", name: home.team?.displayName ?? home.team?.shortDisplayName ?? "Home", logo: home.team?.logos?.[0]?.href ?? null, pitcher: homePitcher }, venue: competition.venue?.fullName ?? null, status: competition.status?.type?.detail ?? competition.status?.type?.state ?? "scheduled", ...prediction, ...outcome, v4Shadow, marketValue: null } satisfies NrfiGame;
  }, 8);

  const marketFeed = await fetchFirstInningMarkets(baseGames.map(game => ({ id: game.id, gameTime: game.gameStartAt, awayName: game.away.name, homeName: game.home.name, nrfiProbability: game.nrfiProbability })));
  const games = baseGames.map(game => {
    const side = marketFeed.markets.get(game.id)?.[game.recommendation];
    if (!side) return game;
    return {
      ...game,
      marketValue: {
        available: true,
        book: side.book,
        selection: side.selection,
        price: side.price,
        impliedProbability: side.impliedProbability,
        noVigProbability: side.noVigProbability,
        edge: side.edge,
        ev: side.ev,
        updatedAt: side.capturedAt,
        quotes: side.quotes.map(q => ({ bookmaker: q.bookmaker, bookmakerKey: q.bookmakerKey, americanOdds: q.americanOdds, updatedAt: q.updatedAt })),
      },
    } satisfies NrfiGame;
  });

  const promoted = games.filter(game => game.playStatus === "BEST_PLAY" || game.playStatus === "PLAY");
  const ranked = [...promoted].sort((a, b) => {
    const aMarket = a.marketValue?.available ? a.marketValue.edge ?? -Infinity : a.modelEdge;
    const bMarket = b.marketValue?.available ? b.marketValue.edge ?? -Infinity : b.modelEdge;
    return bMarket - aMarket || (b.confidence === "High" ? 1 : 0) - (a.confidence === "High" ? 1 : 0);
  });
  const averageNrfiProbability = games.length ? Math.round(games.reduce((sum, g) => sum + g.nrfiProbability, 0) / games.length * 10) / 10 : null;
  return { date, games, averageNrfiProbability, topPick: ranked[0] ?? null, updatedAt: new Date().toISOString(), source: "ESPN MLB scoreboard + MLB Stats API pitcher fallback + verified recent game summaries + PropLine 1st-inning totals", methodology: "The baseball model remains independent. PropLine first-inning totals (period i1, total 0.5) are attached as a market layer for no-vig consensus, best price, model edge and EV. Sportsbook prices do not change the model probability or promote a model NO PLAY.", marketStatus: marketFeed.status === "live" ? "live" : "unavailable" };
}

export async function fetchNrfiData(date = getTodayET()): Promise<NrfiResponse> { const now = Date.now(); if (cachedResponse && cachedDate === date && now - cachedAt < CACHE_TTL) return cachedResponse; const existing = refreshInFlight.get(date); if (existing) return existing; const refresh = (async () => { try { const data = await buildNrfiData(date); cachedResponse = data; cachedDate = date; cachedAt = Date.now(); return data; } catch (error) { if (cachedResponse && cachedDate === date && now - cachedAt < STALE_TTL) return cachedResponse; throw error; } finally { refreshInFlight.delete(date); } })(); refreshInFlight.set(date, refresh); return refresh; }
export async function fetchUpcomingNrfiData(days = 3, startDate = getTodayET()): Promise<NrfiWindowResponse> { const safeDays = Math.min(Math.max(days, 1), 3); if (cachedWindow && cachedWindowStart === startDate && cachedWindowDays === safeDays && Date.now() - cachedWindowAt < WINDOW_CACHE_TTL) return cachedWindow; if (windowRefreshInFlight) return windowRefreshInFlight; windowRefreshInFlight = (async () => { const dates = Array.from({ length: safeDays }, (_, i) => addDays(startDate, i)); const responses = await withConcurrency(dates, date => fetchNrfiData(date), 3); const games = responses.flatMap(r => r.games); const promoted = games.filter(g => g.playStatus === "BEST_PLAY" || g.playStatus === "PLAY"); const topPick = [...promoted].sort((a, b) => b.modelEdge - a.modelEdge)[0] ?? null; const result: NrfiWindowResponse = { startDate, endDate: dates[dates.length - 1], days: responses, games, averageNrfiProbability: games.length ? Math.round(games.reduce((sum, g) => sum + g.nrfiProbability, 0) / games.length * 10) / 10 : null, topPick, updatedAt: new Date().toISOString() }; cachedWindow = result; cachedWindowStart = startDate; cachedWindowDays = safeDays; cachedWindowAt = Date.now(); return result; })(); try { return await windowRefreshInFlight; } finally { windowRefreshInFlight = null; } }
export async function warmMlbCache(): Promise<NrfiResponse> { return fetchNrfiData(); }
