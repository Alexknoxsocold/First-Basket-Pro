import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { InjurySync } from "./injurySync";
import { createDailySyncService } from "./dailySync";
import cron from "node-cron";

const injurySync = new InjurySync(storage);
const dailySyncService = createDailySyncService(storage);

export async function registerRoutes(app: Express): Promise<Server> {
  // Start automatic injury sync
  injurySync.start();
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

  console.log('[Cron] Daily sync scheduled for 12:30 AM ET every day');

  const httpServer = createServer(app);
  return httpServer;
}
