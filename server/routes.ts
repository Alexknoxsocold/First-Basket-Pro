import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { InjurySync } from "./injurySync";
import { LineupSync } from "./lineupSync";
import { createDailySyncService } from "./dailySync";
import { signup, login, logout, getSession, inviteAccess, requireAuth } from "./auth";
import cron from "node-cron";

const injurySync = new InjurySync(storage);
const lineupSync = new LineupSync(storage);
const dailySyncService = createDailySyncService(storage);

export async function registerRoutes(app: Express): Promise<Server> {
  // Start automatic injury sync
  injurySync.start();

  // Auth endpoints
  app.post("/api/auth/signup", signup);
  app.post("/api/auth/login", login);
  app.post("/api/auth/logout", logout);
  app.post("/api/auth/invite", inviteAccess);
  app.get("/api/auth/session", getSession);

  // Admin password verify endpoint
  app.post("/api/admin/verify", (req, res) => {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return res.status(500).json({ error: "Admin password not configured" });
    }
    if (password === adminPassword) {
      return res.json({ success: true });
    }
    return res.status(401).json({ error: "Incorrect password" });
  });

  // Games endpoints
  app.get("/api/games", async (_req, res) => {
    try {
      const games = await storage.getGames();
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

  // Update game lineups (protected - requires authentication)
  app.put("/api/games/:id/lineups", requireAuth, async (req, res) => {
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

      const allUntrimmed = [...awayStarters, ...homeStarters];
      if (allUntrimmed.some(name => typeof name !== 'string')) {
        return res.status(400).json({ error: "All starter slots must contain string values" });
      }

      const trimmedAway = awayStarters.map((name: string) => name.trim());
      const trimmedHome = homeStarters.map((name: string) => name.trim());
      const allStarters = [...trimmedAway, ...trimmedHome];
      
      if (allStarters.some(name => !name || name === '')) {
        return res.status(400).json({ error: "All starter slots must have valid player names" });
      }

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
      res.json({ message: "Lineups updated successfully", game: updatedGame });
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

  // In-memory cache for ESPN player stats
  let espnStatsCache: { data: any[]; timestamp: number; teams: string } | null = null;
  const ESPN_CACHE_TTL = 5 * 60 * 1000;

  app.get("/api/espn-player-stats", async (_req, res) => {
    try {
      const games = await storage.getGames();
      const now = new Date();
      const todayISO = now.toISOString().split('T')[0];
      const todayGames = games.filter(g => {
        if (g.gameDate === 'Today') return true;
        if (g.gameTime) {
          const gt = new Date(g.gameTime);
          return gt.toISOString().split('T')[0] === todayISO;
        }
        return g.gameDate === todayISO;
      });

      if (todayGames.length === 0) return res.json([]);

      const allTeams = [...new Set(todayGames.flatMap(g => [g.awayTeam, g.homeTeam]))].sort();
      const teamsKey = allTeams.join(',');

      if (espnStatsCache && espnStatsCache.teams === teamsKey && (Date.now() - espnStatsCache.timestamp) < ESPN_CACHE_TTL) {
        return res.json(espnStatsCache.data);
      }

      const starterMap: Record<string, string[]> = {};
      for (const game of todayGames) {
        if (game.awayStarters?.length) starterMap[game.awayTeam] = game.awayStarters;
        if (game.homeStarters?.length) starterMap[game.homeTeam] = game.homeStarters;
      }

      const { fetchEspnTeamStats, fetchFirstBasketOdds, getTodayEspnEventIds } = await import('./espnPlayerStats.js');

      let firstBasketOddsMap: Record<string, string> = {};
      try {
        const eventIds = await getTodayEspnEventIds();
        firstBasketOddsMap = await fetchFirstBasketOdds(eventIds);
      } catch (err) {
        console.warn('[ESPN Stats] Could not fetch live odds:', err);
      }

      const espnStats = await fetchEspnTeamStats(allTeams, starterMap, firstBasketOddsMap);
      espnStatsCache = { data: espnStats, timestamp: Date.now(), teams: teamsKey };
      res.json(espnStats);
    } catch (error) {
      console.error('[ESPN Stats] Error:', error);
      res.status(500).json({ error: "Failed to fetch ESPN player stats" });
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
      if (!stat) return res.status(404).json({ error: "Team stat not found" });
      res.json(stat);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch team stat" });
    }
  });

  app.post("/api/sync-injuries", async (_req, res) => {
    try {
      await injurySync.syncInjuries();
      res.json({ message: "Injury sync completed successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync injuries" });
    }
  });

  app.post("/api/sync-espn-lineups", async (_req, res) => {
    try {
      const games = await storage.getGames();
      const todayGames = games.filter(g => g.gameDate === 'Today');
      if (todayGames.length === 0) return res.json({ message: "No games today", updated: 0 });

      const { syncEspnLineups } = await import('./syncEspnLineups.js');
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
      }

      const { populateTodayStarters } = await import('./populate-player-stats.js');
      await populateTodayStarters(storage);
      espnStatsCache = null;

      res.json({ message: `Updated lineups for ${updated} games`, updated, lineupMap });
    } catch (error) {
      console.error('[API] ESPN lineup sync failed:', error);
      res.status(500).json({ error: "Failed to sync ESPN lineups" });
    }
  });

  app.post("/api/sync-lineups", async (_req, res) => {
    try {
      await lineupSync.syncStartingLineups();
      res.json({ message: "Lineup sync completed successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to sync lineups" });
    }
  });

  app.post("/api/sync/daily", async (_req, res) => {
    try {
      await dailySyncService.runDailySync();
      res.json({ message: "Daily sync completed successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to run daily sync" });
    }
  });

  app.post("/api/populate-player-stats", async (_req, res) => {
    try {
      const { populateTodayStarters } = await import('./populate-player-stats.js');
      await populateTodayStarters(storage);
      res.json({ message: "Player stats populated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to populate player stats" });
    }
  });

  cron.schedule('30 0 * * *', async () => {
    try {
      await dailySyncService.runDailySync();
    } catch (error) {
      console.error('[Cron] Daily sync failed:', error);
    }
  }, { timezone: 'America/New_York' });

  cron.schedule('*/30 9-23 * * *', async () => {
    try {
      await lineupSync.syncStartingLineups();
    } catch (error) {
      console.error('[Cron] Lineup sync failed:', error);
    }
  }, { timezone: 'America/New_York' });

  const httpServer = createServer(app);
  return httpServer;
}