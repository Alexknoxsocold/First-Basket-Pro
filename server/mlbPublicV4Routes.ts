import type { Express } from "express";
import { fetchNrfiDataV4Live, fetchUpcomingNrfiDataV4Live } from "./mlbNrfiLiveV4.js";

export function registerMlbV4PublicRoutes(app: Express): void {
  app.get("/api/mlb/nrfi", async (req, res) => {
    try {
      const requestedDate = typeof req.query.date === "string" ? req.query.date : undefined;
      if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
        return res.status(400).json({ error: "date must use YYYY-MM-DD format" });
      }
      const data = await fetchNrfiDataV4Live(requestedDate);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.setHeader("X-MLB-Model-Version", "v4-live");
      return res.json({ ...data, modelVersion: "v4-live" });
    } catch (error) {
      console.error("[MLB V4 Public] Error:", error);
      return res.status(502).json({ error: "Unable to load MLB V4 NRFI data" });
    }
  });

  app.get("/api/mlb/nrfi/upcoming", async (req, res) => {
    try {
      const requestedDays = typeof req.query.days === "string" ? Number(req.query.days) : 3;
      if (!Number.isFinite(requestedDays) || requestedDays < 1 || requestedDays > 3) {
        return res.status(400).json({ error: "days must be a number from 1 to 3" });
      }
      const data = await fetchUpcomingNrfiDataV4Live(requestedDays);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.setHeader("X-MLB-Model-Version", "v4-live");
      return res.json({ ...data, modelVersion: "v4-live" });
    } catch (error) {
      console.error("[MLB V4 Public] Upcoming error:", error);
      return res.status(502).json({ error: "Unable to load upcoming MLB V4 NRFI data" });
    }
  });
}
