// ESPN Lineup Sync - Fetches real current NBA rosters and picks starters
// Uses season PPG/minutes to determine the most likely 5 starters for each team

interface HealthyPlayer {
  id: string;
  name: string;
  pos: string;
  headshot?: string;
}

interface PlayerStats {
  gamesPlayed: number;
  avgPoints: number;
  avgMinutes: number;
  avgFGA: number;
}

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

async function getHealthyPlayers(teamAbbr: string): Promise<HealthyPlayer[]> {
  const data = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamAbbr}/roster`
  );
  if (!data?.athletes) return [];
  
  return data.athletes
    .filter((a: any) => {
      const injuries = a.injuries || [];
      const isOut = injuries.some((i: any) => i.status === 'Out');
      const isSuspended = a.status?.name === 'Suspension' ||
        injuries.some((i: any) => i.status === 'Suspension');
      return !isOut && !isSuspended;
    })
    .map((a: any) => ({
      id: a.id,
      name: a.displayName,
      pos: a.position?.abbreviation || 'G',
      headshot: a.headshot?.href,
    }));
}

async function getPlayerSeasonStats(espnId: string): Promise<PlayerStats | null> {
  const data = await fetchJson(
    `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/types/2/athletes/${espnId}/statistics/0`
  );
  if (!data?.splits?.categories) return null;
  
  const cats = data.splits.categories;
  const getStat = (catName: string, statName: string): number => {
    const cat = cats.find((c: any) => c.name === catName);
    const stat = cat?.stats?.find((s: any) => s.name === statName);
    return parseFloat(stat?.value ?? stat?.displayValue?.replace(/[^0-9.]/g, '') ?? '0') || 0;
  };

  return {
    gamesPlayed: getStat('general', 'gamesPlayed'),
    avgPoints: getStat('offensive', 'avgPoints'),
    avgMinutes: getStat('general', 'avgMinutes'),
    avgFGA: getStat('offensive', 'avgFieldGoalsAttempted'),
  };
}

function pickStartingFive(playersWithStats: { player: HealthyPlayer; stats: PlayerStats | null }[]): string[] {
  // Sort by: gamesPlayed > 5, then by composite score (PPG + minutes)
  const scored = playersWithStats.map(({ player, stats }) => ({
    name: player.name,
    pos: player.pos,
    score: stats && stats.gamesPlayed >= 5
      ? stats.avgPoints * 1.5 + stats.avgMinutes * 0.5
      : 0,
    gp: stats?.gamesPlayed || 0,
  }));
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // Pick top 5 (or fewer if not enough players)
  return scored.slice(0, 5).map(p => p.name);
}

export interface TeamLineup {
  team: string;
  starters: string[];
}

export async function syncEspnLineups(
  teams: string[]
): Promise<TeamLineup[]> {
  console.log('[ESPN Lineups] Starting lineup sync for', teams.length, 'teams...');
  
  const results: TeamLineup[] = [];
  
  // Process teams in batches of 4 to avoid rate limiting
  for (let i = 0; i < teams.length; i += 4) {
    const batch = teams.slice(i, i + 4);
    
    await Promise.all(batch.map(async (team) => {
      try {
        const healthyPlayers = await getHealthyPlayers(team);
        console.log(`[ESPN Lineups] ${team}: ${healthyPlayers.length} healthy players`);
        
        if (healthyPlayers.length === 0) {
          console.warn(`[ESPN Lineups] ${team}: No healthy players found`);
          return;
        }
        
        // Get stats for all healthy players (up to 18 per team)
        const candidates = healthyPlayers;
        
        const playersWithStats = await Promise.all(
          candidates.map(async (player) => {
            const stats = await getPlayerSeasonStats(player.id);
            return { player, stats };
          })
        );
        
        const starters = pickStartingFive(playersWithStats);
        console.log(`[ESPN Lineups] ${team} starters: ${starters.join(', ')}`);
        
        results.push({ team, starters });
      } catch (err) {
        console.error(`[ESPN Lineups] Error syncing ${team}:`, err);
      }
    }));
    
    // Small delay between batches
    if (i + 4 < teams.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  return results;
}
