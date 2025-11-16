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
