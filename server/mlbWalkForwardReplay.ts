import { snapshotPrediction } from "./mlbPredictionSnapshots.js";

/**
 * Leakage-safe historical replay for MLB NRFI/YRFI.
 *
 * This intentionally does NOT reuse today's production state. For each target
 * date it only reads ESPN games from dates strictly before the target date,
 * builds expanding-window team/league first-inning rates, and then snapshots
 * the replay prediction. Replay rows have no real historical lock timestamp,
 * so the calibration layer must not count them as verified live performance.
 */

type EspnEvent = {
  id?: string;
  date?: string;
  shortName?: string;
  competitions?: Array<{
    status?: { type?: { state?: string; completed?: boolean } };
    competitors?: Array<{
      homeAway?: "home" | "away";
      team?: { id?: string; displayName?: string; abbreviation?: string };
      linescores?: Array<{ period?: number; value?: number }>;
    }>;
  }>;
};

export type WalkForwardReplay = {
  date: string;
  gameId: string;
  matchup: string;
  recommendation: "NRFI" | "YRFI";
  probability: number;
  actualOutcome: "NRFI" | "YRFI" | null;
  firstInningScore: string | null;
  trainingGames: number;
};

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb";
const MODEL_VERSION = "v4-walkforward-replay";
const HISTORY_DAYS = 30;
const TEAM_GAMES = 15;
const DECAY = 0.92;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "First-Basket-Pro/1.0" } });
    if (!response.ok) throw new Error(`ESPN ${response.status}`);
    return await response.json() as T;
  } finally { clearTimeout(timer); }
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function firstRuns(team: NonNullable<NonNullable<EspnEvent["competitions"]>[number]["competitors"]>[number]): number | null {
  const line = team.linescores?.find(x => x.period === 1);
  return typeof line?.value === "number" ? line.value : null;
}

function completed(event: EspnEvent): boolean {
  const state = event.competitions?.[0]?.status?.type;
  return state?.state === "post" || state?.completed === true;
}

function outcome(event: EspnEvent): { result: "NRFI" | "YRFI" | null; score: string | null } {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  const away = competitors.find(x => x.homeAway === "away");
  const home = competitors.find(x => x.homeAway === "home");
  const a = away ? firstRuns(away) : null;
  const h = home ? firstRuns(home) : null;
  if (a === null || h === null) return { result: null, score: null };
  return { result: a === 0 && h === 0 ? "NRFI" : "YRFI", score: `${a}-${h}` };
}

async function fetchDay(date: string): Promise<EspnEvent[]> {
  const data = await fetchJson<{ events?: EspnEvent[] }>(`${ESPN_BASE}/scoreboard?dates=${date.replace(/-/g, "")}`);
  return data.events ?? [];
}

async function fetchPriorGames(targetDate: string): Promise<EspnEvent[]> {
  const dates = Array.from({ length: HISTORY_DAYS }, (_, i) => addDays(targetDate, -(i + 1)));
  const results: EspnEvent[][] = [];
  for (let i = 0; i < dates.length; i += 5) {
    const batch = await Promise.all(dates.slice(i, i + 5).map(date => fetchDay(date).catch(() => [])));
    results.push(...batch);
  }
  return results.flat();
}

type TeamForm = { scored: number; allowed: number; scoreless: number; games: number };

function buildForms(games: EspnEvent[]): { leagueNrfi: number; teams: Map<string, TeamForm>; games: number } {
  const completedGames = games.filter(completed).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  let weightTotal = 0;
  let nrfiWeight = 0;
  const teams = new Map<string, { rows: Array<{ scored: number; allowed: number; scoreless: number }> }>();

  completedGames.forEach((game, index) => {
    const competitors = game.competitions?.[0]?.competitors ?? [];
    const away = competitors.find(x => x.homeAway === "away");
    const home = competitors.find(x => x.homeAway === "home");
    if (!away?.team?.id || !home?.team?.id) return;
    const a = firstRuns(away);
    const h = firstRuns(home);
    if (a === null || h === null) return;
    const weight = Math.pow(DECAY, index);
    weightTotal += weight;
    if (a === 0 && h === 0) nrfiWeight += weight;
    for (const [team, scored, allowed] of [[away.team.id, a, h], [home.team.id, h, a]] as [string, number, number][]) {
      const row = teams.get(team) ?? { rows: [] };
      row.rows.push({ scored, allowed, scoreless: scored === 0 ? 1 : 0 });
      teams.set(team, row);
    }
  });

  const teamForms = new Map<string, TeamForm>();
  for (const [team, data] of teams) {
    const rows = data.rows.slice(0, TEAM_GAMES);
    const total = rows.reduce((sum, _, i) => sum + Math.pow(DECAY, i), 0) || 1;
    teamForms.set(team, {
      scored: rows.reduce((sum, r, i) => sum + r.scored * Math.pow(DECAY, i), 0) / total,
      allowed: rows.reduce((sum, r, i) => sum + r.allowed * Math.pow(DECAY, i), 0) / total,
      scoreless: rows.reduce((sum, r, i) => sum + r.scoreless * Math.pow(DECAY, i), 0) / total,
      games: rows.length,
    });
  }

  return { leagueNrfi: weightTotal ? nrfiWeight / weightTotal : 0.49, teams: teamForms, games: completedGames.length };
}

export async function replayHistoricalDate(date: string): Promise<WalkForwardReplay[]> {
  const prior = await fetchPriorGames(date);
  const form = buildForms(prior);
  const slate = (await fetchDay(date)).filter(game => !completed(game));
  const replay: WalkForwardReplay[] = [];

  for (const game of slate) {
    const competitors = game.competitions?.[0]?.competitors ?? [];
    const away = competitors.find(x => x.homeAway === "away");
    const home = competitors.find(x => x.homeAway === "home");
    if (!away?.team?.id || !home?.team?.id || !game.id) continue;

    const a = form.teams.get(away.team.id);
    const h = form.teams.get(home.team.id);
    const teamNrfi = clamp(((a?.scoreless ?? form.leagueNrfi) + (h?.scoreless ?? form.leagueNrfi)) / 2, 0.35, 0.70);
    const runPressure = clamp(((a?.allowed ?? 0.5) + (h?.allowed ?? 0.5)) / 2, 0.2, 1.2);
    const probability = clamp(form.leagueNrfi * 0.25 + teamNrfi * 0.55 + 0.50 * 0.20 - (runPressure - 0.50) * 0.025, 0.25, 0.75);
    const recommendation = probability >= 0.50 ? "NRFI" : "YRFI";
    const actual = outcome(game);
    const awayName = away.team.displayName ?? away.team.abbreviation ?? "Away";
    const homeName = home.team.displayName ?? home.team.abbreviation ?? "Home";

    replay.push({
      date,
      gameId: String(game.id),
      matchup: `${awayName} @ ${homeName}`,
      recommendation,
      probability: recommendation === "NRFI" ? probability : 1 - probability,
      actualOutcome: actual.result,
      firstInningScore: actual.score,
      trainingGames: form.games,
    });

    await snapshotPrediction({
      date,
      gameId: String(game.id),
      matchup: `${awayName} @ ${homeName}`,
      recommendation,
      probability: recommendation === "NRFI" ? probability : 1 - probability,
      modelVersion: MODEL_VERSION,
      lockedAt: null,
      outcome: actual.result,
      firstInningScore: actual.score,
      marketValue: null,
    });
  }

  return replay;
}

export async function runWalkForwardReplay(days = 30): Promise<{ datesProcessed: number; predictions: number; graded: number; modelVersion: string }> {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 30);
  let predictions = 0;
  let graded = 0;
  let datesProcessed = 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

  for (let i = safeDays; i >= 1; i--) {
    const date = addDays(today, -i);
    try {
      const rows = await replayHistoricalDate(date);
      predictions += rows.length;
      graded += rows.filter(row => row.actualOutcome !== null).length;
      datesProcessed++;
    } catch (error) {
      console.warn(`[MLB Replay] ${date} failed:`, error);
    }
  }

  return { datesProcessed, predictions, graded, modelVersion: MODEL_VERSION };
}
