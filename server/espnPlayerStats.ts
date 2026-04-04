// ESPN Player Stats Service
// Fetches real season stats + DraftKings first basket odds from ESPN

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
  firstBasketPct: number;
  q1FgaRate: number;
  odds: string;          // Model-derived odds (fallback)
  liveOdds?: string;     // Real DraftKings odds from ESPN propBets
  headshot?: string;
  injuryStatus?: string;
  isStarter?: boolean;
}

interface RosterEntry {
  id: string;
  displayName: string;
  position?: { abbreviation: string };
  headshot?: { href: string };
  injuries?: Array<{ status: string; type: string; shortComment?: string }>;
  status?: { name: string };
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

async function getTeamRoster(teamAbbr: string): Promise<RosterEntry[]> {
  const data = await fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${teamAbbr}/roster`
  );
  return data?.athletes || [];
}

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/[.''\u2019-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchPlayer(starterName: string, roster: RosterEntry[]): RosterEntry | null {
  const normalizedStarter = normalizeName(starterName);
  let match = roster.find(p => normalizeName(p.displayName) === normalizedStarter);
  if (match) return match;
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

  const fgaShare = avgFGA / 90;
  let fbScore = fgaShare * 40;
  fbScore += (avgPoints / 45) * 8;
  fbScore += ((fgPct - 43) / 30) * 4;
  fbScore += (Math.min(avgMinutes, 36) / 36) * 3;

  if (position === 'C') fbScore *= 1.12;
  else if (position === 'PG') fbScore *= 1.05;

  const offset = ((avgFGA * 7 + avgPoints * 3) % 3.0) - 1.5;
  fbScore = Math.max(fbScore + offset, 3);
  const fbPct = Math.min(Math.round(fbScore * 10) / 10, 35);

  const q1FgaRate = Math.round((avgFGA / 4) * 10) / 10;

  const impliedProb = fbPct / 100;
  let odds: string;
  if (impliedProb >= 0.5) {
    odds = `-${Math.round((impliedProb / (1 - impliedProb)) * 100)}`;
  } else {
    odds = `+${Math.round(((1 - impliedProb) / impliedProb) * 100)}`;
  }

  return { fbPct, q1FgaRate, odds };
}

function isPlayerOut(entry: RosterEntry): boolean {
  const inj = entry.injuries?.[0];
  if (!inj) return false;
  const status = inj.status?.toLowerCase() || '';
  return status.includes('out') || status.includes('suspend') || status === 'inactive';
}

function getInjuryStatus(entry: RosterEntry): string | undefined {
  const inj = entry.injuries?.[0];
  if (!inj) return undefined;
  return inj.status || undefined;
}

/**
 * Fetch real DraftKings first basket odds from ESPN propBets API
 * Returns a map of espnAthleteId -> americanOdds string (e.g. "+450")
 */
export async function fetchFirstBasketOdds(eventIds: string[]): Promise<Record<string, string>> {
  const oddsMap: Record<string, string> = {};

  await Promise.all(eventIds.map(async (eventId) => {
    // ESPN provider 100 = DraftKings
    // Page 2 of propBets contains first basket props
    for (let page = 1; page <= 4; page++) {
      const data = await fetchJson(
        `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${eventId}/competitions/${eventId}/odds/100/propBets?lang=en&region=us&limit=100&page=${page}`
      );
      if (!data?.items) break;

      for (const prop of data.items) {
        if (prop.type?.name === 'First Basket') {
          const athleteRef = prop.athlete?.$ref || '';
          const espnId = athleteRef.match(/athletes\/(\d+)/)?.[1];
          const americanOdds = prop.odds?.american?.value;
          if (espnId && americanOdds) {
            // Format as "+450" or "-110"
            const val = parseFloat(americanOdds);
            oddsMap[espnId] = val > 0 ? `+${Math.round(val)}` : `${Math.round(val)}`;
          }
        }
      }

      // Stop if all items found
      if ((data.pageIndex || page) >= (data.pageCount || 1)) break;
    }
  }));

  console.log(`[ESPN Odds] Found first basket odds for ${Object.keys(oddsMap).length} players`);
  return oddsMap;
}

/**
 * Get today's ESPN event IDs for NBA games
 */
export async function getTodayEspnEventIds(): Promise<string[]> {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');

  const data = await fetchJson(
    `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events?dates=${dateStr}&limit=20`
  );
  const items = data?.items || [];
  return items.map((it: any) => {
    const ref = it.$ref || '';
    return ref.match(/events\/(\d+)/)?.[1];
  }).filter(Boolean);
}

/**
 * Fetch stats for ALL active (non-OUT) players on today's game teams
 */
export async function fetchEspnTeamStats(
  teams: string[],
  starterMap: Record<string, string[]> = {},
  firstBasketOddsMap: Record<string, string> = {}
): Promise<EspnPlayerStat[]> {
  const results: EspnPlayerStat[] = [];

  // Fetch all rosters in parallel
  const rosterMap: Record<string, RosterEntry[]> = {};
  await Promise.all(
    teams.map(async (team) => {
      rosterMap[team] = await getTeamRoster(team);
      console.log(`[ESPN] Fetched ${rosterMap[team].length} players for ${team}`);
    })
  );

  // Process each team
  for (const team of teams) {
    const roster = rosterMap[team] || [];
    const starters = starterMap[team] || [];

    // Strictly filter: only include players who are NOT out/suspended
    const activePlayers = roster.filter(p => !isPlayerOut(p));

    // Fetch stats for all active players in parallel (batches of 8)
    const batchSize = 8;
    for (let i = 0; i < activePlayers.length; i += batchSize) {
      const batch = activePlayers.slice(i, i + batchSize);
      await Promise.all(batch.map(async (player) => {
        const statsData = await getPlayerStats(player.id);
        // Only include players with meaningful playing time this season
        if (!statsData || statsData.gamesPlayed < 3 || statsData.avgMinutes < 8) return;

        const position = player.position?.abbreviation || 'G';
        const { fbPct, q1FgaRate, odds } = deriveFirstBasketPct(statsData, position);

        const isStarter = starters.length > 0
          ? starters.some(s => normalizeName(s) === normalizeName(player.displayName))
          : statsData.avgMinutes >= 25;

        // Use real sportsbook odds if available
        const liveOdds = firstBasketOddsMap[player.id];

        results.push({
          player: player.displayName,
          team,
          espnId: player.id,
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
          liveOdds,
          headshot: player.headshot?.href,
          injuryStatus: getInjuryStatus(player),
          isStarter,
        });
      }));
    }

    console.log(`[ESPN] ✓ ${team}: ${results.filter(r => r.team === team).length} active players`);
  }

  return results;
}

/**
 * Legacy: Fetch stats for specific starters only
 */
export async function fetchEspnPlayerStats(
  starters: { team: string; players: string[] }[]
): Promise<EspnPlayerStat[]> {
  const results: EspnPlayerStat[] = [];

  const allTeams = [...new Set(starters.map(s => s.team))];
  const rosterMap: Record<string, RosterEntry[]> = {};
  await Promise.all(
    allTeams.map(async (team) => {
      rosterMap[team] = await getTeamRoster(team);
    })
  );

  const globalRoster: RosterEntry[] = Object.values(rosterMap).flat();

  for (const { team, players } of starters) {
    await Promise.all(players.map(async (playerName) => {
      const teamRoster = rosterMap[team] || [];
      let matched = matchPlayer(playerName, teamRoster);
      if (!matched) matched = matchPlayer(playerName, globalRoster);
      if (!matched || isPlayerOut(matched)) return;

      const statsData = await getPlayerStats(matched.id);
      if (!statsData || statsData.gamesPlayed === 0) return;

      const position = matched.position?.abbreviation || 'G';
      const { fbPct, q1FgaRate, odds } = deriveFirstBasketPct(statsData, position);

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
        injuryStatus: getInjuryStatus(matched),
        isStarter: true,
      });
    }));
  }

  return results;
}
