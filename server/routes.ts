import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { InjurySync } from "./injurySync";
import { LineupSync } from "./lineupSync";
import { createDailySyncService } from "./dailySync";
import { signup, login, logout, getSession, inviteAccess, requireAuth, requireAdmin } from "./auth";
import cron from "node-cron";

const injurySync = new InjurySync(storage);
const lineupSync = new LineupSync(storage);
const dailySyncService = createDailySyncService(storage);

// Helper: get current date in Eastern Time as YYYY-MM-DD
// After 11 PM ET, returns TOMORROW's date so the app auto-advances to next day's games
function getActiveDateISO(): string {
  const now = new Date();
  const etHour = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false
  }).format(now));
  const targetDate = etHour >= 23 ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : now;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(targetDate);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

// Helper: get the current calendar date in Eastern Time as YYYY-MM-DD (not advance-adjusted)
function getTodayETISO(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

// Helper: check if a game belongs to a given dateISO (YYYY-MM-DD, ET)
// gameDate is the authoritative NBA "game date" and always wins when it's a specific date.
// Only fall back to converting gameTime to ET if gameDate is missing.
function gameIsOnDate(gameTime: string | null | undefined, gameDate: string | null | undefined, dateISO: string): boolean {
  // 1. gameDate is the authoritative field — use it when it's a specific date
  if (gameDate && gameDate !== 'Today') return gameDate === dateISO;
  // 2. Legacy "Today" label: only matches if dateISO is the actual current ET date
  if (gameDate === 'Today') return dateISO === getTodayETISO();
  // 3. No gameDate set — fall back to gameTime converted to ET
  if (gameTime) {
    const etDate = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(gameTime));
    const y = etDate.find(p => p.type === 'year')?.value;
    const m = etDate.find(p => p.type === 'month')?.value;
    const d = etDate.find(p => p.type === 'day')?.value;
    return `${y}-${m}-${d}` === dateISO;
  }
  return false;
}

// Helper: ensure games for a given date exist in storage, loading from ESPN if needed
async function ensureGamesForDate(dateISO: string): Promise<void> {
  const all = await storage.getGames();
  const existing = all.filter(g => gameIsOnDate(g.gameTime, g.gameDate, dateISO));
  if (existing.length > 0) return;

  try {
    const dateStr = dateISO.replace(/-/g, '');
    const resp = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) return;
    const data = await resp.json();
    const events: any[] = data?.events || [];
    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp?.competitors) continue;
      const home = comp.competitors.find((c: any) => c.homeAway === 'home');
      const away = comp.competitors.find((c: any) => c.homeAway === 'away');
      if (!home || !away) continue;
      // Skip if already exists by ESPN ID or by team matchup + date
      const alreadyExists = all.find(g =>
        (g.espnGameId && g.espnGameId === event.id) ||
        (g.homeTeam === home.team.abbreviation && g.awayTeam === away.team.abbreviation &&
          gameIsOnDate(g.gameTime, g.gameDate, dateISO))
      );
      if (alreadyExists) continue;
      await storage.createGame({
        awayTeam: away.team.abbreviation, awayPlayer: 'TBD',
        awayTipCount: 0, awayTipPercent: 50, awayScorePercent: 50, awayStarters: [],
        homeTeam: home.team.abbreviation, homePlayer: 'TBD',
        homeTipCount: 0, homeTipPercent: 50, homeScorePercent: 50, homeStarters: [],
        h2h: 'N/A', gameDate: dateISO, gameTime: event.date,
        status: 'scheduled', espnGameId: event.id, lastSynced: new Date().toISOString()
      });
      console.log(`[AutoSync] Created game: ${away.team.abbreviation} @ ${home.team.abbreviation} for ${dateISO}`);
    }
  } catch (err) {
    console.warn('[AutoSync] Could not load games for date:', dateISO, err);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Start automatic injury sync
  injurySync.start();

  // Auth endpoints
  app.post("/api/auth/signup", signup);
  app.post("/api/auth/login", login);
  app.post("/api/auth/logout", logout);
  app.post("/api/auth/invite", inviteAccess);
  app.get("/api/auth/session", getSession);

  // Simple in-memory rate limiter for admin verify (max 10 attempts per 15 min per IP)
  const adminVerifyAttempts = new Map<string, { count: number; resetAt: number }>();
  const ADMIN_RATE_LIMIT = 10;
  const ADMIN_RATE_WINDOW = 15 * 60 * 1000;

  // Admin password verify endpoint — sets server-side session flag on success
  app.post("/api/admin/verify", async (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    // Check rate limit
    const entry = adminVerifyAttempts.get(ip);
    if (entry && now < entry.resetAt) {
      if (entry.count >= ADMIN_RATE_LIMIT) {
        return res.status(429).json({ error: "Too many attempts. Please try again later." });
      }
      entry.count++;
    } else {
      adminVerifyAttempts.set(ip, { count: 1, resetAt: now + ADMIN_RATE_WINDOW });
    }

    try {
      const { password } = req.body;
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        return res.status(500).json({ error: "Admin password not configured" });
      }
      if (password !== adminPassword) {
        return res.status(401).json({ error: "Incorrect password" });
      }
      req.session.isAdminVerified = true;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => { if (err) reject(err); else resolve(); });
      });
      // Clear rate limit on success
      adminVerifyAttempts.delete(ip);
      return res.json({ success: true });
    } catch (err) {
      console.error('[Admin] Verify error:', err);
      return res.status(500).json({ error: "Failed to verify admin password" });
    }
  });

  // Admin session check — frontend calls this to verify server-side admin status
  app.get("/api/admin/session", (req, res) => {
    res.json({ isAdmin: !!req.session?.isAdminVerified });
  });

  // Games endpoints
  app.get("/api/games", async (_req, res) => {
    try {
      const games = await storage.getGames();
      // Sort games by gameTime (earliest first), then by gameDate
      const sortedGames = games.sort((a, b) => {
        if (a.gameTime && b.gameTime) {
          return new Date(a.gameTime).getTime() - new Date(b.gameTime).getTime();
        }
        return 0;
      });
      res.json(sortedGames);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch games" });
    }
  });

  app.get("/api/games/:date", async (req, res) => {
    try {
      const games = await storage.getGamesByDate(req.params.date);
      res.json(games);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch games" });
    }
  });

  // Update game lineups (protected - requires admin password verification)
  app.put("/api/games/:id/lineups", requireAdmin, async (req, res) => {
    try {
      const { awayStarters, homeStarters } = req.body;
      
      if (!awayStarters || !homeStarters) {
        return res.status(400).json({ error: "Both awayStarters and homeStarters are required" });
      }

      if (!Array.isArray(awayStarters) || !Array.isArray(homeStarters)) {
        return res.status(400).json({ error: "Both awayStarters and homeStarters must be arrays" });
      }

      if (awayStarters.length !== 5 || homeStarters.length !== 5) {
        return res.status(400).json({ error: "Each team must have exactly 5 starters" });
      }

      // Validate all entries are strings before trimming
      const allUntrimmed = [...awayStarters, ...homeStarters];
      if (allUntrimmed.some(name => typeof name !== 'string')) {
        return res.status(400).json({ error: "All starter slots must contain string values" });
      }

      // Trim and validate all starter slots
      const trimmedAway = awayStarters.map((name: string) => name.trim());
      const trimmedHome = homeStarters.map((name: string) => name.trim());
      const allStarters = [...trimmedAway, ...trimmedHome];
      
      if (allStarters.some(name => !name || name === '')) {
        return res.status(400).json({ error: "All starter slots must have valid player names" });
      }

      // Check for duplicate names within each team
      const awayDuplicates = trimmedAway.length !== new Set(trimmedAway).size;
      const homeDuplicates = trimmedHome.length !== new Set(trimmedHome).size;
      
      if (awayDuplicates || homeDuplicates) {
        return res.status(400).json({ error: "Each player can only start once per team" });
      }

      const updatedGame = await storage.updateGame(req.params.id, {
        awayStarters: trimmedAway,
        homeStarters: trimmedHome
      });

      if (!updatedGame) {
        return res.status(404).json({ error: "Game not found" });
      }

      console.log(`[API] Updated lineups for game ${req.params.id}`);
      console.log(`[API] Away starters: ${trimmedAway.join(', ')}`);
      console.log(`[API] Home starters: ${trimmedHome.join(', ')}`);
      
      res.json({ 
        message: "Lineups updated successfully",
        game: updatedGame
      });
    } catch (error) {
      console.error('[API] Failed to update lineups:', error);
      res.status(500).json({ error: "Failed to update lineups" });
    }
  });

  // Player stats endpoints
  app.get("/api/player-stats", async (req, res) => {
    try {
      const team = req.query.team as string | undefined;
      if (team) {
        const stats = await storage.getPlayerStatsByTeam(team);
        res.json(stats);
      } else {
        const stats = await storage.getPlayerStats();
        res.json(stats);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch player stats" });
    }
  });

  app.get("/api/player-stats/:id", async (req, res) => {
    try {
      const stat = await storage.getPlayerStatById(req.params.id);
      if (!stat) {
        return res.status(404).json({ error: "Player stat not found" });
      }
      res.json(stat);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch player stat" });
    }
  });

  // Today's starters endpoint
  app.get("/api/today-starters", async (_req, res) => {
    try {
      const starters = await storage.getTodayStarters();
      res.json(starters);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch today's starters" });
    }
  });

  // In-memory cache for ESPN player stats (refreshed every 5 minutes or on lineup sync)
  let espnStatsCache: { data: any[]; timestamp: number; teams: string } | null = null;
  const ESPN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // ESPN real player stats for today's games — fetches all active players on today's teams
  app.get("/api/espn-player-stats", async (_req, res) => {
    try {
      const activeDateISO = getActiveDateISO();
      await ensureGamesForDate(activeDateISO);
      const games = await storage.getGames();
      const todayGames = games.filter(g => gameIsOnDate(g.gameTime, g.gameDate, activeDateISO));

      if (todayGames.length === 0) {
        return res.json([]);
      }

      // Collect all unique teams playing today
      const allTeams = [...new Set(todayGames.flatMap(g => [g.awayTeam, g.homeTeam]))].sort();
      const teamsKey = allTeams.join(',');

      // Return cached data if fresh and for same teams
      if (espnStatsCache &&
          espnStatsCache.teams === teamsKey &&
          (Date.now() - espnStatsCache.timestamp) < ESPN_CACHE_TTL) {
        console.log(`[ESPN Stats] Serving from cache (${espnStatsCache.data.length} players)`);
        return res.json(espnStatsCache.data);
      }

      // Build starter map from game records (may be empty if lineups not yet set)
      const starterMap: Record<string, string[]> = {};
      for (const game of todayGames) {
        if (game.awayStarters?.length) starterMap[game.awayTeam] = game.awayStarters;
        if (game.homeStarters?.length) starterMap[game.homeTeam] = game.homeStarters;
      }

      console.log(`[ESPN Stats] Fetching stats for ${allTeams.length} teams: ${allTeams.join(', ')}`);
      const { fetchEspnTeamStats, fetchFirstBasketOdds, getTodayEspnEventIds } = await import('./espnPlayerStats.js');

      // Fetch real DraftKings first basket odds from ESPN propBets in parallel
      let firstBasketOddsMap: Record<string, string> = {};
      try {
        const eventIds = await getTodayEspnEventIds(activeDateISO);
        console.log(`[ESPN Stats] Got ${eventIds.length} event IDs, fetching first basket odds...`);
        firstBasketOddsMap = await fetchFirstBasketOdds(eventIds);
      } catch (err) {
        console.warn('[ESPN Stats] Could not fetch live odds:', err);
      }

      const espnStats = await fetchEspnTeamStats(allTeams, starterMap, firstBasketOddsMap);
      console.log(`[ESPN Stats] Total players fetched: ${espnStats.length}`);

      // Cache the result
      espnStatsCache = { data: espnStats, timestamp: Date.now(), teams: teamsKey };

      res.json(espnStats);
    } catch (error) {
      console.error('[ESPN Stats] Error:', error);
      res.status(500).json({ error: "Failed to fetch ESPN player stats" });
    }
  });

  // FB Tracking endpoints
  app.get("/api/fb-tracking", async (_req, res) => {
    try {
      const tracking = await storage.getAllFbTracking();
      res.json(tracking);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch FB tracking data" });
    }
  });

  // Admin: upsert a player's FB scored count (seed/manual edit)
  app.post("/api/admin/fb-tracking", requireAdmin, async (req, res) => {
    try {
      const { playerName, team, fbScored } = req.body;
      if (!playerName || !team || typeof fbScored !== 'number') {
        return res.status(400).json({ error: "playerName, team, and fbScored (number) are required" });
      }
      const record = await storage.upsertFbTracking(playerName.trim(), team.trim().toUpperCase(), Math.max(0, Math.round(fbScored)));
      // Invalidate ESPN stats cache
      espnStatsCache = null;
      console.log(`[FBTracker] Admin set ${playerName} (${team}) to ${fbScored} FB scored`);
      res.json(record);
    } catch (error) {
      console.error('[FBTracker] Upsert error:', error);
      res.status(500).json({ error: "Failed to update FB tracking" });
    }
  });

  // Admin: get log of auto-processed games
  app.get("/api/admin/fb-tracking/processed-games", requireAdmin, async (_req, res) => {
    try {
      const processed = await storage.getProcessedGames();
      res.json(processed);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch processed games" });
    }
  });

  // Team stats endpoints
  app.get("/api/team-stats", async (_req, res) => {
    try {
      const stats = await storage.getTeamStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch team stats" });
    }
  });

  app.get("/api/team-stats/:team", async (req, res) => {
    try {
      const stat = await storage.getTeamStatByTeam(req.params.team);
      if (!stat) {
        return res.status(404).json({ error: "Team stat not found" });
      }
      res.json(stat);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch team stat" });
    }
  });

  // Injury sync endpoint (manual trigger)
  app.post("/api/sync-injuries", async (_req, res) => {
    try {
      await injurySync.syncInjuries();
      res.json({ message: "Injury sync completed successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync injuries" });
    }
  });

  // ESPN-based lineup sync - fetches real current rosters and picks starters
  app.post("/api/sync-espn-lineups", async (_req, res) => {
    try {
      console.log('[API] ESPN lineup sync triggered');
      const games = await storage.getGames();
      const todayGames = games.filter(g => g.gameDate === 'Today');

      if (todayGames.length === 0) {
        return res.json({ message: "No games today", updated: 0 });
      }

      const { syncEspnLineups } = await import('./syncEspnLineups.js');

      // Collect all teams
      const allTeams = new Set<string>();
      todayGames.forEach(g => { allTeams.add(g.awayTeam); allTeams.add(g.homeTeam); });

      const lineups = await syncEspnLineups([...allTeams]);
      const lineupMap: Record<string, string[]> = {};
      lineups.forEach(l => { lineupMap[l.team] = l.starters; });

      let updated = 0;
      for (const game of todayGames) {
        const awayStarters = lineupMap[game.awayTeam] || game.awayStarters;
        const homeStarters = lineupMap[game.homeTeam] || game.homeStarters;
        await storage.updateGame(game.id, { awayStarters, homeStarters });
        updated++;
        console.log(`[ESPN Lineups] Updated ${game.awayTeam}@${game.homeTeam}`);
      }

      // Re-populate player stats with updated starters
      const { populateTodayStarters } = await import('./populate-player-stats.js');
      await populateTodayStarters(storage);

      // Invalidate ESPN stats cache so next request gets fresh data with updated starters
      espnStatsCache = null;

      res.json({ message: `Updated lineups for ${updated} games`, updated, lineupMap });
    } catch (error) {
      console.error('[API] ESPN lineup sync failed:', error);
      res.status(500).json({ error: "Failed to sync ESPN lineups" });
    }
  });

  // Lineup sync endpoint (manual trigger)
  app.post("/api/sync-lineups", async (_req, res) => {
    try {
      console.log('[API] Manual lineup sync triggered');
      await lineupSync.syncStartingLineups();
      res.json({ message: "Lineup sync completed successfully" });
    } catch (error) {
      console.error('[API] Lineup sync failed:', error);
      res.status(500).json({ error: "Failed to sync lineups" });
    }
  });

  // Daily sync endpoint (manual trigger)
  app.post("/api/sync/daily", async (_req, res) => {
    try {
      console.log('[API] Manual daily sync triggered');
      await dailySyncService.runDailySync();
      res.json({ message: "Daily sync completed successfully" });
    } catch (error) {
      console.error('[API] Daily sync failed:', error);
      res.status(500).json({ error: "Failed to run daily sync" });
    }
  });

  // Populate player stats endpoint (manual trigger)
  app.post("/api/populate-player-stats", async (_req, res) => {
    try {
      console.log('[API] Manual player stats population triggered');
      const { populateTodayStarters } = await import('./populate-player-stats.js');
      await populateTodayStarters(storage);
      res.json({ message: "Player stats populated successfully" });
    } catch (error) {
      console.error('[API] Player stats population failed:', error);
      res.status(500).json({ error: "Failed to populate player stats" });
    }
  });

  // Configure daily sync cron job
  // Runs at 12:30 AM ET every day (30 0 * * *)
  // Using America/New_York timezone handles DST automatically
  cron.schedule('30 0 * * *', async () => {
    console.log('[Cron] Running scheduled daily sync at 12:30 AM ET...');
    try {
      await dailySyncService.runDailySync();
      console.log('[Cron] ✓ Daily sync completed successfully');
    } catch (error) {
      console.error('[Cron] Daily sync failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  // Configure lineup sync to run every 30 minutes during game hours (9 AM - 11 PM ET)
  // This ensures lineups are updated throughout the day as they become available
  cron.schedule('*/30 9-23 * * *', async () => {
    console.log('[Cron] Running scheduled lineup sync...');
    try {
      await lineupSync.syncStartingLineups();
      console.log('[Cron] ✓ Lineup sync completed successfully');
    } catch (error) {
      console.error('[Cron] Lineup sync failed:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  console.log('[Cron] Daily sync scheduled for 12:30 AM ET every day');
  console.log('[Cron] Lineup sync scheduled every 30 minutes (9 AM - 11 PM ET)');

  const httpServer = createServer(app);
  return httpServer;
}
