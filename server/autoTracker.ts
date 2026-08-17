/**
 * autoTracker.ts
 * Automatically detects who scored the first basket in completed NBA games
 * using ESPN's play-by-play API, then increments their DB count.
 *
 * - Runs every 30 minutes during game hours (6 PM – 2 AM ET)
 * - Skips games already processed (idempotent)
 * - Never double-counts the same game
 */

import { storage } from "./storage";

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Get today's date in ET as YYYYMMDD for ESPN scoreboard */
function getTodayESPN(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;
  return `${y}${m}${d}`;
}

/** Get yesterday's date in ET as YYYYMMDD (for late-night games finishing after midnight) */
function getYesterdayESPN(): string {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(yesterday);
  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const d = parts.find(p => p.type === "day")?.value;
  return `${y}${m}${d}`;
}

interface ESPNGame {
  id: string;
  status: {
    type: {
      completed: boolean;
      description: string;
    };
  };
  competitors: Array<{
    team: { abbreviation: string };
  }>;
}

/** Fetch completed game IDs from ESPN scoreboard for a given date */
async function getCompletedGameIds(dateStr: string): Promise<ESPNGame[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  const events: ESPNGame[] = (data.events || []).map((e: any) => ({
    id: e.id,
    status: e.status,
    competitors: e.competitions?.[0]?.competitors || [],
  }));
  return events.filter(e => e.status?.type?.completed === true);
}

/** Find the first basket scorer from ESPN play-by-play */
async function getFirstScorer(gameId: string): Promise<{ playerName: string; team: string } | null> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const plays: any[] = data.plays || [];

    // Find the first play where points are actually scored
    const firstScore = plays.find(p =>
      p.scoringPlay === true ||
      (typeof p.scoreValue === "number" && p.scoreValue > 0)
    );

    if (!firstScore) return null;

    // Get the scorer — main athlete is participants[0] when type is not "assist"
    const scorerParticipant = (firstScore.participants || []).find(
      (pt: any) => pt.type !== "assist" && pt.type !== "block"
    ) || firstScore.participants?.[0];

    const playerName = scorerParticipant?.athlete?.displayName ||
                       firstScore.athlete?.displayName ||
                       firstScore.text?.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/)?.[1];

    if (!playerName) return null;

    // Get team abbreviation from the play's team field
    const teamAbbr: string = (
      firstScore.team?.abbreviation ||
      firstScore.homeAway?.toUpperCase() ||
      ""
    ).toUpperCase();

    // Map ESPN abbrevs to our internal ones
    const abbrevMap: Record<string, string> = {
      GS: "GS", GSW: "GS",
      NO: "NO", NOP: "NO",
      NY: "NY", NYK: "NY",
      SA: "SA", SAS: "SA",
      PHX: "PHX", PHO: "PHX",
      UTA: "UTAH", UTAH: "UTAH",
      OKC: "OKC",
      MEM: "MEM", MIA: "MIA",
      LAL: "LAL", LAC: "LAC",
      ATL: "ATL", BOS: "BOS", BKN: "BKN",
      CHI: "CHI", CLE: "CLE", DAL: "DAL",
      DEN: "DEN", DET: "DET", HOU: "HOU",
      IND: "IND", MIL: "MIL", MIN: "MIN",
      ORL: "ORL", PHI: "PHI", POR: "POR",
      SAC: "SAC", TOR: "TOR", WAS: "WAS",
      CHA: "CHA",
    };

    const team = abbrevMap[teamAbbr] || teamAbbr;

    console.log(`[AutoTracker] Game ${gameId} → First scorer: ${playerName} (${team})`);
    return { playerName, team };
  } catch (err) {
    console.warn(`[AutoTracker] Failed to get play-by-play for game ${gameId}:`, err);
    return null;
  }
}

/** Main tracker: check recent completed games and update counts */
export async function runFirstBasketTracker(): Promise<{ processed: number; skipped: number; errors: string[] }> {
  const result = { processed: 0, skipped: 0, errors: [] as string[] };

  try {
    // Check today AND yesterday (games finishing after midnight)
    const dates = [getTodayESPN(), getYesterdayESPN()];
    const allGames: ESPNGame[] = [];

    for (const d of dates) {
      const games = await getCompletedGameIds(d);
      allGames.push(...games);
    }

    // Deduplicate by game ID
    const uniqueGames = [...new Map(allGames.map(g => [g.id, g])).values()];

    if (uniqueGames.length === 0) {
      console.log("[AutoTracker] No completed games found yet.");
      return result;
    }

    console.log(`[AutoTracker] Found ${uniqueGames.length} completed game(s) to check.`);

    for (const game of uniqueGames) {
      const alreadyDone = await storage.isGameProcessed(game.id);
      if (alreadyDone) {
        result.skipped++;
        continue;
      }

      const scorer = await getFirstScorer(game.id);

      if (!scorer) {
        result.errors.push(`Game ${game.id}: Could not determine first scorer`);
        // Still mark processed so we don't retry infinitely
        await storage.markGameProcessed(game.id, undefined, undefined);
        continue;
      }

      // Increment DB count and bump gamesTracked
      await storage.incrementFbScored(scorer.playerName, scorer.team);
      await storage.markGameProcessed(game.id, scorer.playerName, scorer.team);

      console.log(`[AutoTracker] ✓ Incremented ${scorer.playerName} (${scorer.team}) — game ${game.id}`);
      result.processed++;
    }
  } catch (err: any) {
    console.error("[AutoTracker] Unexpected error:", err?.message);
    result.errors.push(err?.message || String(err));
  }

  return result;
}
