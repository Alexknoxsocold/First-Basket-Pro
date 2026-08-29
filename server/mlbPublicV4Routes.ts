import type { Express } from "express";
import { fetchNrfiDataV4Live, fetchUpcomingNrfiDataV4Live } from "./mlbNrfiLiveV4.js";
import { enrichMlbResponseWithEvidence, getMlbEvidenceShadowSummary } from "./mlbEvidenceShadow.js";

export function registerMlbV4PublicRoutes(app: Express): void {
  app.get("/api/mlb/nrfi", async (req, res) => {
    try {
      const requestedDate = typeof req.query.date === "string" ? req.query.date : undefined;
      if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
        return res.status(400).json({ error: "date must use YYYY-MM-DD format" });
      }
      const raw = await fetchNrfiDataV4Live(requestedDate);
      const data = await enrichMlbResponseWithEvidence(raw);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.setHeader("X-MLB-Model-Version", "v4-live");
      return res.json({ ...data, modelVersion: "v4-live", evidenceModel: "top-order-weather-shadow-v1" });
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
      const raw = await fetchUpcomingNrfiDataV4Live(requestedDays);
      const days = await Promise.all(raw.days.map(day => enrichMlbResponseWithEvidence(day)));
      const games = days.flatMap(day => day.games);
      const topPick = raw.topPick ? games.find(game => game.id === raw.topPick?.id) ?? null : null;
      const data = { ...raw, days, games, topPick };
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.setHeader("X-MLB-Model-Version", "v4-live");
      return res.json({ ...data, modelVersion: "v4-live", evidenceModel: "top-order-weather-shadow-v1" });
    } catch (error) {
      console.error("[MLB V4 Public] Upcoming error:", error);
      return res.status(502).json({ error: "Unable to load upcoming MLB V4 NRFI data" });
    }
  });

  app.get("/api/mlb/evidence-research", async (req, res) => {
    try {
      const requestedDays = typeof req.query.days === "string" ? Number(req.query.days) : 30;
      if (!Number.isFinite(requestedDays) || requestedDays < 7 || requestedDays > 365) {
        return res.status(400).json({ error: "days must be a number from 7 to 365" });
      }
      const summary = await getMlbEvidenceShadowSummary(requestedDays);
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
      return res.json({
        model: "top-order-weather-shadow-v1",
        liveModel: "v4-live",
        windowDays: Math.round(requestedDays),
        ...summary,
        promotionRule: "Research remains shadow-only until at least 100 graded games and Brier score improves by at least 0.005 versus live V4.",
      });
    } catch (error) {
      console.error("[MLB Evidence Research] Error:", error);
      return res.status(500).json({ error: "Unable to load MLB evidence research summary" });
    }
  });
}
