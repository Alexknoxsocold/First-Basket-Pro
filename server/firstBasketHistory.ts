/**
 * Verified NBA first-field-goal history from ESPN play-by-play.
 * Free throws are intentionally ignored: the site's First Basket market is
 * defined as the first made field goal, not simply the first points scored.
 */
import { nbaSeasonForDate } from './nbaSeason';

const ESPN_TEAM_IDS: Record<string, string> = {
  PHI: "20", MIA: "14", BOS: "2", ATL: "1", PHX: "21", MEM: "29",
  CHI: "4", SA: "24", MIN: "16", DAL: "6", CLE: "5", UTAH: "26",
  DET: "8", OKC: "25", WSH: "27", LAL: "13", GS: "9", NO: "3",
  LAC: "12", NYK: "18", MIL: "15", BKN: "17", SAC: "23", POR: "22",
  HOU: "10", IND: "11", ORL: "19", TOR: "28", DEN: "7", CHA: "30",
};

type TeamHistory = { counts: Record<string, number>; fetchedAt: number };
const cache = new Map<string, TeamHistory>();
const CACHE_TTL = 2 * 60 * 60 * 1000;

async function fetchJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[.''\u2019-]/g, '').replace(/\s+/g, ' ').trim();
}

async function getCompletedGameIds(teamAbbr: string, espnSeason: number): Promise<string[]> {
  const teamId = ESPN_TEAM_IDS[teamAbbr];
  if (!teamId) return [];
  const data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule?season=${espnSeason}`);
  return (data?.events || [])
    .filter((e: any) => e.competitions?.[0]?.status?.type?.completed === true)
    .map((e: any) => e.id as string).filter(Boolean);
}

function isMadeFieldGoal(play: any): boolean {
  if (!play?.scoringPlay) return false;
  const text = String(play.text || '').toLowerCase();
  if (!text.includes(' makes ')) return false;
  if (text.includes('free throw')) return false;
  const value = Number(play.scoreValue ?? 0);
  return value === 2 || value === 3 || text.includes('layup') || text.includes('dunk') || text.includes('jumper') || text.includes('shot');
}

function scorerFromPlay(play: any): string | null {
  const participant = (play?.participants || []).find((p: any) => p.type !== 'assist' && p.type !== 'block') || play?.participants?.[0];
  const structured = participant?.athlete?.displayName || play?.athlete?.displayName;
  if (structured) return structured;
  const text = String(play?.text || '');
  const idx = text.indexOf(' makes ');
  return idx > 0 ? text.slice(0, idx).trim() : null;
}

async function getFirstScorerForGame(eventId: string): Promise<string | null> {
  const summary = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`);
  const plays: any[] = Array.isArray(summary?.plays) ? summary.plays : [];
  const firstFieldGoal = plays.find(isMadeFieldGoal);
  return firstFieldGoal ? scorerFromPlay(firstFieldGoal) : null;
}

export async function fetchTeamFirstBasketHistory(teamAbbr: string, espnSeason = nbaSeasonForDate().espnSeason): Promise<Record<string, number>> {
  const cacheKey = `${espnSeason}:${teamAbbr}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.counts;

  const gameIds = await getCompletedGameIds(teamAbbr, espnSeason);
  const counts: Record<string, number> = {};
  for (let i = 0; i < gameIds.length; i += 8) {
    const scorers = await Promise.all(gameIds.slice(i, i + 8).map(getFirstScorerForGame));
    for (const scorer of scorers) if (scorer) {
      const key = normalizeName(scorer);
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  cache.set(cacheKey, { counts, fetchedAt: Date.now() });
  return counts;
}

export async function fetchMultiTeamFirstBasketHistory(teams: string[], espnSeason = nbaSeasonForDate().espnSeason): Promise<Record<string, number>> {
  const results = await Promise.all(teams.map(t => fetchTeamFirstBasketHistory(t, espnSeason)));
  const merged: Record<string, number> = {};
  for (const map of results) for (const [name, count] of Object.entries(map)) merged[name] = (merged[name] || 0) + count;
  return merged;
}

export function warmFirstBasketCache(teams: string[]): void {
  setTimeout(async () => { for (const team of teams) await fetchTeamFirstBasketHistory(team); }, 5000);
}
