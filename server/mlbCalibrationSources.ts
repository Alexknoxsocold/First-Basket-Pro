import { Pool } from "@neondatabase/serverless";
import type { Express } from "express";
import { getMlbPassedDiagnostics } from "./mlbPassedDiagnostics";
import { fetchNrfiDataV4Live, fetchUpcomingNrfiDataV4Live } from "./mlbNrfiLiveV4.js";
import { recordPredictionSnapshot } from "./mlbCalibration.js";
import { getMlbPostgameAttribution } from "./mlbPostgameAttribution.js";
import { getMlbLaunchReadiness } from "./mlbLaunchReadiness.js";

let pool: Pool | null = null;
function getPool(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

type SourceKey = "verified_live" | "walk_forward_replay" | "retrospective";
type SourceRow = {
  source: SourceKey;
  snapshots: number;
  graded: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  bets: number;
  betWins: number;
  unitsProfit: number;
  roi: number | null;
  avgEdge: number | null;
  avgEv: number | null;
};

function empty(source: SourceKey): SourceRow {
  return { source, snapshots: 0, graded: 0, wins: 0, losses: 0, hitRate: null, bets: 0, betWins: 0, unitsProfit: 0, roi: null, avgEdge: null, avgEv: null };
}

function classify(modelVersion: string | null, lockedAt: Date | string | null): SourceKey {
  if ((modelVersion ?? "").toLowerCase().includes("walk-forward")) return "walk_forward_replay";
  if (lockedAt) return "verified_live";
  return "retrospective";
}

function decimalOdds(odds: number): number | null {
  if (!Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export async function getCalibrationSources(days = 30): Promise<{ days: number; sources: SourceRow[] }> {
  const db = getPool();
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const sources = [empty("verified_live"), empty("walk_forward_replay"), empty("retrospective")];
  if (!db) return { days: safeDays, sources };

  const result = await db.query<{
    modelVersion: string | null;
    lockedAt: Date | null;
    recommendation: string;
    probability: number;
    outcome: string | null;
    valuePlay: boolean;
    marketAvailable: boolean;
    marketOdds: number | null;
    marketEdge: number | null;
    marketExpectedValue: number | null;
  }>(`
    SELECT model_version AS "modelVersion", locked_at AS "lockedAt", recommendation, probability, outcome,
           value_play AS "valuePlay", market_available AS "marketAvailable", market_odds AS "marketOdds",
           market_edge AS "marketEdge", market_expected_value AS "marketExpectedValue"
      FROM mlb_prediction_snapshots
     WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
  `, [safeDays]);

  const bySource = new Map<SourceKey, SourceRow>(sources.map(row => [row.source, row]));
  for (const row of result.rows) {
    const source = bySource.get(classify(row.modelVersion, row.lockedAt))!;
    source.snapshots++;
    const graded = (row.recommendation === "NRFI" || row.recommendation === "YRFI") && (row.outcome === "NRFI" || row.outcome === "YRFI");
    const win = graded && row.outcome === row.recommendation;
    if (graded) {
      source.graded++;
      if (win) source.wins++; else source.losses++;
    }

    if (graded && row.valuePlay && row.marketAvailable && row.marketOdds !== null) {
      const decimal = decimalOdds(row.marketOdds);
      if (decimal !== null) {
        source.bets++;
        if (win) source.betWins++;
        source.unitsProfit += win ? decimal - 1 : -1;
      }
    }

    if (row.marketEdge !== null && Number.isFinite(row.marketEdge)) {
      source.avgEdge = source.avgEdge === null ? row.marketEdge : source.avgEdge + row.marketEdge;
    }
    if (row.marketExpectedValue !== null && Number.isFinite(row.marketExpectedValue)) {
      source.avgEv = source.avgEv === null ? row.marketExpectedValue : source.avgEv + row.marketExpectedValue;
    }
  }

  for (const source of sources) {
    if (source.graded) source.hitRate = source.wins / source.graded;
    if (source.bets) source.roi = source.unitsProfit / source.bets;
    const marketRows = result.rows.filter(row => classify(row.modelVersion, row.lockedAt) === source.source);
    const edgeCount = marketRows.filter(row => row.marketEdge !== null && Number.isFinite(row.marketEdge)).length;
    const evCount = marketRows.filter(row => row.marketExpectedValue !== null && Number.isFinite(row.marketExpectedValue)).length;
    if (edgeCount && source.avgEdge !== null) source.avgEdge /= edgeCount;
    if (evCount && source.avgEv !== null) source.avgEv /= evCount;
    source.unitsProfit = Math.round(source.unitsProfit * 10000) / 10000;
  }

  return { days: safeDays, sources };
}

function v4LedgerDay<T extends { games: any[] }>(day: T): T {
  return { ...day, games: day.games.map(game => ({ ...game, modelVersion: "v4-live" })) };
}

function validDays(value: unknown, fallback: number, max = 365): number | null {
  const days = typeof value === "string" ? Number(value) : fallback;
  return Number.isFinite(days) && days >= 1 && days <= max ? days : null;
}

export function registerCalibrationSourceRoute(app: Express): void {
  // These handlers are registered before the legacy routes module. That makes
  // V4-live the single public prediction path while keeping the older route as
  // an unreachable fallback during the migration.
  app.get("/api/mlb/nrfi", async (req, res) => {
    try {
      const requestedDate = typeof req.query.date === "string" ? req.query.date : undefined;
      if (requestedDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return res.status(400).json({ error: "date must use YYYY-MM-DD format" });
      const data = await fetchNrfiDataV4Live(requestedDate);
      void recordPredictionSnapshot(v4LedgerDay(data)).catch(error => console.warn("[MLB V4] Ledger write failed:", error));
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return res.json(data);
    } catch (error) {
      console.error("[MLB V4] Live prediction error:", error);
      return res.status(502).json({ error: "Unable to load MLB NRFI data" });
    }
  });

  app.get("/api/mlb/nrfi/upcoming", async (req, res) => {
    try {
      const requestedDays = validDays(req.query.days, 3, 3);
      if (requestedDays === null) return res.status(400).json({ error: "days must be a number from 1 to 3" });
      const data = await fetchUpcomingNrfiDataV4Live(requestedDays);
      void Promise.all(data.days.map(day => recordPredictionSnapshot(v4LedgerDay(day))))
        .catch(error => console.warn("[MLB V4] Upcoming ledger write failed:", error));
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      return res.json(data);
    } catch (error) {
      console.error("[MLB V4] Upcoming prediction error:", error);
      return res.status(502).json({ error: "Unable to load upcoming MLB NRFI data" });
    }
  });

  app.get("/api/mlb/nrfi/calibration/sources", async (req, res) => {
    try {
      const days = validDays(req.query.days, 30);
      if (days === null) return res.status(400).json({ error: "days must be between 1 and 365" });
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
      res.json(await getCalibrationSources(days));
    } catch (error) {
      console.error("[MLB Calibration] Source breakdown error:", error);
      res.status(500).json({ error: "Unable to load calibration source breakdown" });
    }
  });

  app.get("/api/mlb/nrfi/passed-diagnostics", async (req, res) => {
    try {
      const days = validDays(req.query.days, 30);
      if (days === null) return res.status(400).json({ error: "days must be between 1 and 365" });
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
      res.json(await getMlbPassedDiagnostics(days));
    } catch (error) {
      console.error("[MLB Diagnostics] Passed-play analysis error:", error);
      res.status(500).json({ error: "Unable to load passed-play diagnostics" });
    }
  });

  app.get("/api/mlb/nrfi/postgame-attribution", async (req, res) => {
    try {
      const days = validDays(req.query.days, 30);
      if (days === null) return res.status(400).json({ error: "days must be between 1 and 365" });
      res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
      return res.json(await getMlbPostgameAttribution(days));
    } catch (error) {
      console.error("[MLB Diagnostics] Postgame attribution error:", error);
      return res.status(500).json({ error: "Unable to load postgame attribution" });
    }
  });

  app.get("/api/mlb/nrfi/launch-readiness", async (req, res) => {
    try {
      const days = validDays(req.query.days, 30, 90);
      if (days === null) return res.status(400).json({ error: "days must be between 1 and 90" });
      res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=600");
      return res.json(await getMlbLaunchReadiness(days));
    } catch (error) {
      console.error("[MLB Launch] Readiness check failed:", error);
      return res.status(500).json({ error: "Unable to evaluate MLB launch readiness" });
    }
  });
}
