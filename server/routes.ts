import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  // Games endpoints
  app.get("/api/games", async (_req, res) => {
    try {
      const games = await storage.getGames();
      res.json(games);
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

  const httpServer = createServer(app);
  return httpServer;
}
