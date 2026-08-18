// ESPN Player Stats Service
// Fetches real season stats + DraftKings first basket odds from ESPN

import { fetchMultiTeamFirstBasketHistory } from './firstBasketHistory';
import { storage } from './storage';

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
  firstBasketsScored?: number;
  q1FgaRate: number;
  odds: string;
  liveOdds?: string;
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

/**
 * Opportunity model used when a player does not yet have enough verified
 * first-basket history. This is deliberately a score, not fake sportsbook
 * certainty: volume, scoring, efficiency, minutes and position all matter.
 */
function deriveFirstBasketPct(stats: any, position: string): { fbPct: number; q1FgaRate: number; odds: string } {
  const { avgFGA, avgPoints, fgPct, avgMinutes } = stats;

  const fgaShare = avgFGA / 90;
  let fbScore = fgaShare * 40;
  fbScore += (avgPoints / 45) * 8;
  fbScore += ((fgPct - 43) / 30) * 4;
  fbScore += (Math.min(avgMinutes, 36) / 36) * 3;

  if (position === 'C') fbScore *= 1.12;
  else if (position === 'PG') fbScore *= 1.05;

  fbScore = Math.max(fbScore, 3);
  const fbPct = Math.min(Math.round(fbScore * 10) / 10, 35);

  const q1FgaRate = Math.round((avgFGA / 4) * 10) / 10;

  const impliedProb = Math.max(fbPct / 100, 0.01);
  const odds = impliedProb >= 0.5
    ? `-${Math.round((impliedProb / (1 - impliedProb)) * 100)}`
    : `+${Math.round(((1 - impliedProb) / impliedProb) * 100)}`;

  return { fbPct, q1FgaRate, odds };
}

/**
 * Blend verified first-basket history with the opportunity model.
 * A small Bayesian-style prior prevents tiny samples (or a single zero)
 * from overwhelming the prediction. More tracked games increase the
 * historical weight.
 */
function blendHistoricalFirstBasketPct(
  modelPct: number,
  firstBasketsScored: number,
  gamesTracked: number,
): number {
  if (gamesTracked <= 0) return modelPct;

  // Prior: roughly 1 first basket in 12 tracked starts before player-specific evidence.
  const priorGames = 12;
  const priorRate = 1 / 12;
  const smoothedRate = (firstBasketsScored + priorRate * priorGames) / (gamesTracked + priorGames);
  const historicalPct = smoothedRate * 100;

  // 45% historical weight at tiny samples, rising toward 80% with a useful sample.
  const sampleWeight = Math.min(gamesTracked / 30, 1);
  const historyWeight = 0.45 + (0.35 * sampleWeight);
  const blended = (historicalPct * historyWeight) + (modelPct * (1 - historyWeight));

  return Math.max(1, Math.min(35, Math.round(blended * 10) / 10));
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
 */
export async function fetchFirstBasketOdds(eventIds: string[]): Promise<Record<string, string>> {
  const oddsMap: Record<string, string> = {};

  await Promise.all(eventIds.map(async (eventId) => {
    for (let page = 1; page <= 12; page++) {
      const data = await fetchJson(
        `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/${eventId}/competitions/${eventId}/odds/100/propBets?lang=en&region=us&limit=100&page=${page}`
      );
      if (!data?.items) break;

      let foundOnPage = false;
      for (const prop of data.items) {
        if (prop.type?.name === 'First Basket') {
          foundOnPage = true;
          const athleteRef = prop.athlete?.$ref || '';
          const espnId = athleteRef.match(/athletes\/(\d+)/)?.[1];
          const americanOdds = prop.odds?.american?.value;
          if (espnId && americanOdds) {
            const val = parseFloat(americanOdds);
            oddsMap[espnId] = val > 0 ? `+${Math.round(val)}` : `${Math.round(val)}`;
          }
        }
      }

      const passedFirstBasket = Object.keys(oddsMap).length > 0 && !foundOnPage;
      if (passedFirstBasket && page > 5) break;
      if ((data.pageIndex || page) >= (data.pageCount || 1)) break;
    }
  }));

  console.log(`[ESPN Odds] Found first basket odds for ${Object.keys(oddsMap).length} players`);
  return oddsMap;
}

export async function getTodayEspnEventIds(dateISO?: string): Promise<string[]> {
  let dateStr: string;
  if (dateISO) {
    dateStr = dateISO.replace(/-/g, '');
  } else {
    const today = new Date();
    dateStr = today.getFullYear() +
      String(today.getMonth() + 1).padStart(2, '0') +
      String(today.getDate()).padStart(2, '0');
  }

  const data = await fetchJson(
    `https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events?dates=${dateStr}&limit=20`
  );
  const items = data?.items || [];
  return items.map((it: any) => {
    const ref = it.$ref || '';
    return ref.match(/events\/(\d+)/)?.[1];
  }).filter(Boolean);
}

function normalizeNameLocal(name: string): string {
  return name.toLowerCase()
    .replace(/[.''\u2019-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch stats for ALL active (non-OUT) players on today's game teams.
 * Historical play-by-play is deliberately non-blocking: verified DB history
 * is used immediately, while ESPN history refreshes in the background.
 */
export async function fetchEspnTeamStats(
  teams: string[],
  starterMap: Record<string, string[]> = {},
  firstBasketOddsMap: Record<string, string> = {}
): Promise<EspnPlayerStat[]> {
  const results: EspnPlayerStat[] = [];

  // Start the historical refresh immediately, but never make the page wait
  // for dozens of completed-game play-by-play requests. The DB is the fast,
  // persistent historical source; this refresh fills gaps for future requests.
  const historyPromise = fetchMultiTeamFirstBasketHistory(teams).catch(() => ({} as Record<string, number>));

  const rosterMap: Record<string, RosterEntry[]> = {};
  await Promise.all(
    teams.map(async (team) => {
      rosterMap[team] = await getTeamRoster(team);
      console.log(`[ESPN] Fetched ${rosterMap[team].length} players for ${team}`);
    })
  );

  for (const team of teams) {
    const roster = rosterMap[team] || [];
    const starters = starterMap[team] || [];
    const hasLineupData = starters.length > 0;
    const activePlayers = roster.filter(p => !isPlayerOut(p));
    const teamPlayers: EspnPlayerStat[] = [];

    const batchSize = 8;
    for (let i = 0; i < activePlayers.length; i += batchSize) {
      const batch = activePlayers.slice(i, i + batchSize);
      await Promise.all(batch.map(async (player) => {
        const statsData = await getPlayerStats(player.id);
        if (!statsData || statsData.gamesPlayed < 3 || statsData.avgMinutes < 8) return;

        const position = player.position?.abbreviation || 'G';
        const { fbPct, q1FgaRate, odds } = deriveFirstBasketPct(statsData, position);
        const liveOdds = firstBasketOddsMap[player.id];
        const isStarterByLineup = hasLineupData
          ? starters.some(s => normalizeName(s) === normalizeName(player.displayName))
          : false;

        teamPlayers.push({
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
          isStarter: isStarterByLineup,
        });
      }));
    }

    if (!hasLineupData && teamPlayers.length > 0) {
      const sorted = [...teamPlayers].sort((a, b) => b.avgMinutes - a.avgMinutes);
      const top5Names = new Set(sorted.slice(0, 5).map(p => p.player));
      teamPlayers.forEach(p => { p.isStarter = top5Names.has(p.player); });
    }

    results.push(...teamPlayers);
    console.log(`[ESPN] ✓ ${team}: ${teamPlayers.length} active players (${teamPlayers.filter(p => p.isStarter).length} starters)`);
  }

  const teamsWithDkOdds = new Set(results.filter(r => !!r.liveOdds).map(r => r.team));
  console.log(`[ESPN] Teams with DK first basket coverage: ${[...teamsWithDkOdds].join(', ')}`);

  const filtered = results.filter(r => {
    if (teamsWithDkOdds.has(r.team)) return !!r.liveOdds;
    return true;
  });

  console.log(`[ESPN] After DK confirmation filter: ${filtered.length} confirmed playing players`);

  // Load persistent verified first-basket history before applying predictions.
  // This keeps the prediction endpoint fast and makes the database the source
  // of truth for seeded/previously tracked players.
  const dbTrackingMap: Record<string, number> = {};
  const dbGamesStartedMap: Record<string, number> = {};
  try {
    const dbTracking = await storage.getAllFbTracking();
    for (const rec of dbTracking) {
      const key = normalizeNameLocal(rec.playerName);
      dbTrackingMap[key] = rec.fbScored;
      if (rec.gamesTracked > 0) dbGamesStartedMap[key] = rec.gamesTracked;
    }
    if (dbTracking.length > 0) {
      console.log(`[FBTracker] Loaded ${dbTracking.length} DB-tracked players`);
    }
  } catch (err) {
    console.warn('[FBTracker] Could not load DB tracking:', err);
  }

  // Apply DB history immediately. Players without DB history keep the
  // opportunity model for this request while the ESPN scrape continues.
  let dbCount = 0;
  for (const p of filtered) {
    const key = normalizeNameLocal(p.player);
    const trackedGames = dbGamesStartedMap[key] || 0;

    if (dbTrackingMap[key] !== undefined) {
      p.firstBasketsScored = dbTrackingMap[key];
      dbCount++;
      if (trackedGames > 0) {
        p.firstBasketPct = blendHistoricalFirstBasketPct(
          p.firstBasketPct,
          p.firstBasketsScored,
          trackedGames,
        );
      }
    }
  }

  console.log(`[FBTracker] ${dbCount}/${filtered.length} players have DB-tracked history applied immediately`);

  // Complete the expensive play-by-play refresh in the background. Persist
  // only missing players so the next request can use the real history without
  // scraping again. This is intentionally fire-and-forget for page speed.
  void historyPromise.then(async (history) => {
    let persisted = 0;
    for (const p of filtered) {
      const key = normalizeNameLocal(p.player);
      if (dbTrackingMap[key] !== undefined || history[key] === undefined) continue;
      try {
        await storage.upsertFbTracking(p.player, p.team, history[key], "2025/26", p.gamesPlayed);
        persisted++;
      } catch {
        // A single persistence failure should not stop the remaining players.
      }
    }
    if (persisted > 0) {
      console.log(`[FBTracker] Background history refresh persisted ${persisted} new player records`);
    }
  }).catch(() => {});

  return filtered;
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
