// ESPN Player Stats Service
// Fetches real season stats from ESPN for today's starters

const ESPN_TEAM_IDS: Record<string, string> = {
  PHI: "20", MIA: "14", BOS: "2", ATL: "1", PHX: "21", MEM: "29",
  CHI: "4", SA: "24", MIN: "16", DAL: "6", CLE: "5", UTAH: "26",
  DET: "8", OKC: "25", WSH: "27", LAL: "13",
  GS: "9", NO: "3", LAC: "12", NYK: "18", MIL: "15", BKN: "17",
  SAC: "23", POR: "22", HOU: "10", IND: "11", ORL: "19", TOR: "28",
  DEN: "7", CHA: "30",
};

export interface EspnPlayerStat {
  player: string;
  team: string;
  espnId: string;
  position: string;
  gamesPlayed: number;
  avgPoints: number;
  avgFGA: number;
  fgPct: number;
  avgMinutes: number;
  avgAssists: number;
  avgRebounds: number;
  firstBasketPct: number;  // Derived from FGA rate
  q1FgaRate: number;       // Estimated Q1 FGA rate
  odds: string;
  headshot?: string;
  injuryStatus?: string;
  injuryDetail?: string;
}

interface RosterEntry {
  id: string;
  displayName: string;
  position?: { abbreviation: string };
  headshot?: { href: string };
  injuries?: Array<{ status: string; type: string }>;
}

async function fetchJson(url: string): Promise<any> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function getTeamRoster(teamAbbr: string): Promise<RosterEntry[]> {
  const espnId = ESPN_TEAM_IDS[teamAbbr];
  if (!espnId) return [];
  const data = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamAbbr}/roster`
  );
  return data?.athletes || [];
}

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/[.''-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchPlayer(starterName: string, roster: RosterEntry[]): RosterEntry | null {
  const normalizedStarter = normalizeName(starterName);
  
  // Try exact match first
  let match = roster.find(p => normalizeName(p.displayName) === normalizedStarter);
  if (match) return match;
  
  // Try last name match
  const starterLastName = normalizedStarter.split(' ').slice(-1)[0];
  match = roster.find(p => {
    const rosterLastName = normalizeName(p.displayName).split(' ').slice(-1)[0];
    return rosterLastName === starterLastName;
  });
  return match || null;
}

async function getPlayerStats(espnId: string): Promise<any> {
  const data = await fetchJson(
    `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2026/types/2/athletes/${espnId}/statistics/0`
  );
  if (!data?.splits?.categories) return null;
  
  const cats = data.splits.categories;
  const getStat = (catName: string, statName: string): number => {
    const cat = cats.find((c: any) => c.name === catName);
    const stat = cat?.stats?.find((s: any) => s.name === statName);
    return parseFloat(stat?.value || stat?.displayValue?.replace(/[^0-9.]/g, '') || '0') || 0;
  };

  return {
    gamesPlayed: getStat('general', 'gamesPlayed'),
    avgPoints: getStat('offensive', 'avgPoints'),
    avgFGA: getStat('offensive', 'avgFieldGoalsAttempted'),
    fgPct: getStat('offensive', 'fieldGoalPct'),
    avgMinutes: getStat('general', 'avgMinutes'),
    avgAssists: getStat('offensive', 'avgAssists'),
    avgRebounds: getStat('general', 'avgRebounds'),
    avgFTA: getStat('offensive', 'avgFreeThrowsAttempted'),
  };
}

function deriveFirstBasketPct(stats: any, position: string): { fbPct: number; q1FgaRate: number; odds: string } {
  const { avgFGA, avgPoints, fgPct, avgMinutes } = stats;
  
  // First basket probability model:
  // Base: ~10% per starter (10 players on floor, one scores first)
  // Adjusted by: scoring volume, efficiency, role, position
  // Realistic range: 8-28% for most starters, 28-38% for elite high-usage stars

  // Primary: FGA share (player FGA vs typical 85-95 team FGA/game)
  // More FGA = more shots = higher chance to score the game's first basket
  const fgaShare = avgFGA / 90; // fraction of team's shots
  let fbScore = fgaShare * 40; // scale to 0-~18 for typical starters
  
  // Secondary: scoring volume adds to early-game impact
  fbScore += (avgPoints / 45) * 8;
  
  // FG% boosts probability (efficient scorers make their shots)
  fbScore += ((fgPct - 43) / 30) * 4;
  
  // Starter role (more minutes = more integral to early possession)
  fbScore += (Math.min(avgMinutes, 36) / 36) * 3;
  
  // Position modifier: Centers often get early post touches; PGs push pace
  if (position === 'C') fbScore *= 1.12;
  else if (position === 'PG') fbScore *= 1.05;
  
  // Add a floor and apply small random-like offset (seeded by player stats to be consistent)
  const offset = ((avgFGA * 7 + avgPoints * 3) % 3.0) - 1.5; // ±1.5 consistent per player
  fbScore = Math.max(fbScore + offset, 3);
  
  // Cap at realistic max (elite stars top out around 35%)
  const fbPct = Math.min(Math.round(fbScore * 10) / 10, 35);
  
  // Q1 FGA rate: roughly FGA/4 per quarter (first quarter)
  const q1FgaRate = Math.round((avgFGA / 4) * 10) / 10;
  
  // Convert to American odds
  const impliedProb = fbPct / 100;
  let odds: string;
  if (impliedProb >= 0.5) {
    odds = `-${Math.round((impliedProb / (1 - impliedProb)) * 100)}`;
  } else {
    odds = `+${Math.round(((1 - impliedProb) / impliedProb) * 100)}`;
  }
  
  return { fbPct, q1FgaRate, odds };
}

export async function fetchEspnPlayerStats(
  starters: { team: string; players: string[] }[]
): Promise<EspnPlayerStat[]> {
  const results: EspnPlayerStat[] = [];
  
  // Fetch ALL team rosters for today's games in parallel (to handle trades)
  const allTeams = [...new Set(starters.map(s => s.team))];
  const rosterMap: Record<string, RosterEntry[]> = {};
  await Promise.all(
    allTeams.map(async (team) => {
      const roster = await getTeamRoster(team);
      rosterMap[team] = roster;
    })
  );
  
  // Build a global name → player lookup from all rosters (handles traded players)
  const globalRoster: RosterEntry[] = Object.values(rosterMap).flat();
  
  // Process each starter
  for (const { team, players } of starters) {
    await Promise.all(players.map(async (playerName) => {
      // First try the specific team, then fall back to global search (for traded players)
      const teamRoster = rosterMap[team] || [];
      let matched = matchPlayer(playerName, teamRoster);
      if (!matched) {
        matched = matchPlayer(playerName, globalRoster);
        if (matched) {
          console.log(`[ESPN] Found ${playerName} via global search (listed team: ${team})`);
        }
      }
      
      if (!matched) {
        console.log(`[ESPN] No match for ${playerName} (${team})`);
        return;
      }
      
      const statsData = await getPlayerStats(matched.id);
      if (!statsData || statsData.gamesPlayed === 0) {
        console.log(`[ESPN] No stats for ${playerName} (ID: ${matched.id})`);
        return;
      }
      
      const position = matched.position?.abbreviation || 'G';
      const { fbPct, q1FgaRate, odds } = deriveFirstBasketPct(statsData, position);
      
      // Get injury info from matched player's ESPN data
      const injury = matched.injuries?.[0];
      const injuryStatus = injury ? injury.status : undefined;
      
      results.push({
        player: playerName,
        team,
        espnId: matched.id,
        position,
        gamesPlayed: statsData.gamesPlayed,
        avgPoints: Math.round(statsData.avgPoints * 10) / 10,
        avgFGA: Math.round(statsData.avgFGA * 10) / 10,
        fgPct: Math.round(statsData.fgPct * 10) / 10,
        avgMinutes: Math.round(statsData.avgMinutes * 10) / 10,
        avgAssists: Math.round(statsData.avgAssists * 10) / 10,
        avgRebounds: Math.round(statsData.avgRebounds * 10) / 10,
        firstBasketPct: fbPct,
        q1FgaRate,
        odds,
        headshot: matched.headshot?.href,
        injuryStatus,
      });
      
      console.log(`[ESPN] ✓ ${playerName} (${team}): ${statsData.avgPoints}ppg, ${statsData.avgFGA}fga, FB%: ${fbPct}%`);
    }));
  }
  
  return results;
}
