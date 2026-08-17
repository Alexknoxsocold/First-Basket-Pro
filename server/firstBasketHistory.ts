/**
 * First Basket History — scrapes ESPN play-by-play data for completed games
 * to count how many times each player actually scored the first basket this season.
 *
 * How BestOdds gets their data: they process the first scoring event from
 * every completed game's play-by-play feed for the entire season.
 * We do the same thing here using ESPN's public summary API.
 *
 * After scraping, results are persisted to DB (via espnPlayerStats) so they
 * survive restarts and are used as the authoritative source.
 */

const ESPN_TEAM_IDS: Record<string, string> = {
  PHI: "20", MIA: "14", BOS: "2", ATL: "1", PHX: "21", MEM: "29",
  CHI: "4", SA: "24", MIN: "16", DAL: "6", CLE: "5", UTAH: "26",
  DET: "8", OKC: "25", WSH: "27", LAL: "13",
  GS: "9", NO: "3", LAC: "12", NYK: "18", MIL: "15", BKN: "17",
  SAC: "23", POR: "22", HOU: "10", IND: "11", ORL: "19", TOR: "28",
  DEN: "7", CHA: "30",
};

interface TeamHistory {
  counts: Record<string, number>;
  fetchedAt: number;
}

const cache = new Map<string, TeamHistory>();
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours — refreshes faster after games complete

async function fetchJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/[.''\u2019-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get completed ESPN event IDs for a team this season.
 */
async function getCompletedGameIds(teamAbbr: string): Promise<string[]> {
  const teamId = ESPN_TEAM_IDS[teamAbbr];
  if (!teamId) return [];

  const data = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamId}/schedule?season=2026`
  );

  if (!data?.events) return [];

  return data.events
    .filter((e: any) => e.competitions?.[0]?.status?.type?.completed === true)
    .map((e: any) => e.id as string)
    .filter(Boolean);
}

/**
 * Extract scorer name from an ESPN play text field.
 * ESPN play text follows the pattern: "Player Name makes [shot description]"
 * or "Player Name makes [N] free throw [N of N]"
 */
function extractScorerFromText(text: string): string | null {
  if (!text) return null;
  // Split on " makes " and take everything before it
  const makeIdx = text.indexOf(' makes ');
  if (makeIdx > 0) return text.slice(0, makeIdx).trim();
  return null;
}

/**
 * Get the name of the first basket scorer from a completed game.
 * ESPN summary endpoint returns `plays` as an array with `scoringPlay: true`
 * on each scoring play. The `text` field contains "PlayerName makes ...".
 */
async function getFirstScorerForGame(eventId: string): Promise<string | null> {
  const summary = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`
  );
  if (!summary) return null;

  // `plays` is an array of play objects; find the first scoring play
  const plays: any[] = Array.isArray(summary.plays) ? summary.plays : [];
  const firstScore = plays.find((p: any) => p.scoringPlay === true);
  if (firstScore) {
    return extractScorerFromText(firstScore.text);
  }

  return null;
}

/**
 * Fetch first basket counts for all players on a given team.
 * Returns map of normalized player name -> count.
 * Results are cached for 12 hours.
 */
export async function fetchTeamFirstBasketHistory(
  teamAbbr: string
): Promise<Record<string, number>> {
  const cached = cache.get(teamAbbr);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.counts;
  }

  console.log(`[FBHistory] Fetching first basket history for ${teamAbbr}...`);
  const gameIds = await getCompletedGameIds(teamAbbr);
  console.log(`[FBHistory] ${teamAbbr}: ${gameIds.length} completed games to process`);

  const counts: Record<string, number> = {};

  const BATCH = 8;
  for (let i = 0; i < gameIds.length; i += BATCH) {
    const batch = gameIds.slice(i, i + BATCH);
    const scorers = await Promise.all(batch.map(id => getFirstScorerForGame(id)));
    for (const scorer of scorers) {
      if (scorer) {
        const key = normalizeName(scorer);
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }

  cache.set(teamAbbr, { counts, fetchedAt: Date.now() });
  console.log(`[FBHistory] ${teamAbbr}: done. ${Object.keys(counts).length} unique first-scorers found.`);
  return counts;
}

/**
 * Fetch first basket histories for multiple teams in parallel.
 * Returns unified map: normalized player name -> count.
 */
export async function fetchMultiTeamFirstBasketHistory(
  teams: string[]
): Promise<Record<string, number>> {
  const results = await Promise.all(teams.map(t => fetchTeamFirstBasketHistory(t)));
  const merged: Record<string, number> = {};
  for (const map of results) {
    for (const [name, count] of Object.entries(map)) {
      merged[name] = (merged[name] || 0) + count;
    }
  }
  return merged;
}

/**
 * Warm the cache for a list of teams in the background (fire and forget).
 */
export function warmFirstBasketCache(teams: string[]): void {
  setTimeout(async () => {
    for (const team of teams) {
      await fetchTeamFirstBasketHistory(team);
    }
    console.log(`[FBHistory] Cache warmed for: ${teams.join(', ')}`);
  }, 5000);
}
