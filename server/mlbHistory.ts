import type { Express } from "express";
import { getPredictionHistory } from "./mlbPredictionSnapshots.js";

export function registerMlbHistoryRoutes(app: Express): void {
  app.get("/api/mlb/history", async (req, res) => {
    try {
      const requestedDays = typeof req.query.days === "string" ? Number(req.query.days) : 30;
      if (!Number.isFinite(requestedDays) || requestedDays < 1 || requestedDays > 365) {
        return res.status(400).json({ error: "days must be a number from 1 to 365" });
      }

      const rows = await getPredictionHistory(requestedDays);
      const verified = rows
        .filter(row => row.lockedAt && (row.outcome === "NRFI" || row.outcome === "YRFI") && (row.recommendation === "NRFI" || row.recommendation === "YRFI"))
        .map(row => ({
          date: row.date,
          gameId: row.gameId,
          matchup: row.matchup,
          recommendation: row.recommendation,
          probability: row.probability,
          confidence: row.confidence ?? null,
          modelVersion: row.modelVersion,
          gameStartAt: row.gameStartAt ?? null,
          lockedAt: row.lockedAt ?? null,
          outcome: row.outcome,
          result: row.outcome === row.recommendation ? "won" : "lost",
          firstInningScore: row.firstInningScore ?? null,
          marketValue: row.marketValue ?? null,
        }));

      const wins = verified.filter(row => row.result === "won").length;
      const losses = verified.filter(row => row.result === "lost").length;
      res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
      return res.json({
        windowDays: Math.round(requestedDays),
        generatedAt: new Date().toISOString(),
        total: verified.length,
        wins,
        losses,
        winRate: verified.length ? wins / verified.length : null,
        predictions: verified,
      });
    } catch (error) {
      console.error("[MLB History] Error:", error);
      return res.status(500).json({ error: "Unable to load verified MLB prediction history" });
    }
  });
}
