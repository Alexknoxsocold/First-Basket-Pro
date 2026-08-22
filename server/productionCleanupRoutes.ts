import type { Express, NextFunction, Request, Response } from 'express';
import { requireAdmin } from './auth';
import { storage } from './storage';
import {
  currentAndPreviousSeasonLabels,
  getFirstBasketPlayerSeason,
  getFirstBasketSeasonRows,
  upsertFirstBasketPlayerSeason,
} from './fbSeasonStore';
import { getFirstBasketLedgerSummary } from './fbPredictionLedger';
import { registerWnbaFeature } from './wnbaFeature';
import { registerNewsletterRoutes } from './newsletter';

const SEASON_RE = /^\d{4}\/\d{2}$/;
const protectedMaintenancePaths = new Set([
  '/api/sync-injuries',
  '/api/sync-espn-lineups',
  '/api/sync-lineups',
  '/api/sync/daily',
  '/api/populate-player-stats',
]);

function adminGuard(req: Request, res: Response, next: NextFunction) {
  return requireAdmin(req, res, next);
}

export function registerProductionCleanupRoutes(app: Express): void {
  // WNBA is a standalone lane with its own persistence and schedulers. Register
  // it here because this setup module is already called before legacy routes.
  registerWnbaFeature(app);
  registerNewsletterRoutes(app);

  // All mutation/sync endpoints are operational controls and must never be
  // callable anonymously in production. This middleware is registered before
  // the legacy route definitions, so it protects them without duplicating code.
  app.use((req, res, next) => {
    if (req.method === 'POST' && protectedMaintenancePaths.has(req.path)) {
      return adminGuard(req, res, next);
    }
    next();
  });

  // The old research backtest route remains in routes.ts for compatibility,
  // but retrospective writes are intentionally disabled in production.
  app.post('/api/admin/mlb/nrfi/backtest', requireAdmin, (_req, res) => {
    return res.status(410).json({
      error: 'Historical backtest writes are disabled',
      detail: 'Only predictions locked before first pitch may enter official model evidence.',
    });
  });

  // Public FB history is season-bounded by default so future callers cannot
  // accidentally combine every historical season into one rate.
  app.get('/api/fb-tracking', async (req, res) => {
    try {
      const requestedSeason = typeof req.query.season === 'string' ? req.query.season.trim() : '';
      if (requestedSeason && !SEASON_RE.test(requestedSeason)) {
        return res.status(400).json({ error: 'season must use YYYY/YY format' });
      }

      let rows;
      if (requestedSeason) {
        rows = await getFirstBasketSeasonRows(requestedSeason);
      } else {
        const labels = currentAndPreviousSeasonLabels();
        const [current, previous] = await Promise.all([
          getFirstBasketSeasonRows(labels.current),
          getFirstBasketSeasonRows(labels.previous),
        ]);
        rows = [...current, ...previous];
      }

      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      return res.json(rows.filter(row => row.team.trim().length > 0));
    } catch (error) {
      console.error('[FB Tracking] Season-aware fetch failed:', error);
      return res.status(500).json({ error: 'Failed to fetch First Basket tracking data' });
    }
  });

  // Manual corrections are explicit about their season. If omitted, they go
  // to the current NBA season rather than silently writing into last year.
  app.post('/api/admin/fb-tracking', requireAdmin, async (req, res) => {
    try {
      const labels = currentAndPreviousSeasonLabels();
      const playerName = typeof req.body?.playerName === 'string' ? req.body.playerName.trim() : '';
      const team = typeof req.body?.team === 'string' ? req.body.team.trim().toUpperCase() : '';
      const season = typeof req.body?.season === 'string' ? req.body.season.trim() : labels.current;
      const fbScored = Number(req.body?.fbScored);
      const gamesTracked = Number(req.body?.gamesTracked);

      if (!playerName || !team) return res.status(400).json({ error: 'playerName and team are required' });
      if (!SEASON_RE.test(season)) return res.status(400).json({ error: 'season must use YYYY/YY format' });
      if (!Number.isFinite(fbScored) || fbScored < 0) return res.status(400).json({ error: 'fbScored must be a non-negative number' });
      if (!Number.isFinite(gamesTracked) || gamesTracked < 0) return res.status(400).json({ error: 'gamesTracked must be a non-negative number' });

      const roundedFb = Math.round(fbScored);
      const roundedGames = Math.round(gamesTracked);
      if (roundedFb > roundedGames) return res.status(400).json({ error: 'fbScored cannot exceed gamesTracked' });

      await upsertFirstBasketPlayerSeason(playerName, team, roundedFb, roundedGames, season);
      const record = await getFirstBasketPlayerSeason(playerName, team, season);
      return res.json(record);
    } catch (error) {
      console.error('[FB Tracking] Season-aware correction failed:', error);
      return res.status(500).json({ error: 'Failed to update First Basket tracking' });
    }
  });

  app.get('/api/admin/fb/diagnostics', requireAdmin, async (_req, res) => {
    try {
      const labels = currentAndPreviousSeasonLabels();
      const [currentRows, previousRows, processedGames, ledger] = await Promise.all([
        getFirstBasketSeasonRows(labels.current),
        getFirstBasketSeasonRows(labels.previous),
        storage.getProcessedGames(),
        getFirstBasketLedgerSummary(30),
      ]);

      const usableCurrent = currentRows.filter(row => row.team.trim().length > 0);
      const usablePrevious = previousRows.filter(row => row.team.trim().length > 0);
      const verifiedProcessed = processedGames.filter((row: any) => row.firstScorer && row.firstScorerTeam).length;
      const unresolvedProcessed = processedGames.length - verifiedProcessed;

      res.setHeader('Cache-Control', 'no-store');
      return res.json({
        generatedAt: new Date().toISOString(),
        modelVersion: ledger.modelVersion,
        seasons: {
          current: labels.current,
          previous: labels.previous,
          currentPlayers: usableCurrent.length,
          previousPlayers: usablePrevious.length,
        },
        tracking: {
          processedGames: processedGames.length,
          verifiedProcessed,
          unresolvedProcessed,
          currentFirstBaskets: usableCurrent.reduce((sum, row) => sum + row.fbScored, 0),
          currentStarterGames: usableCurrent.reduce((sum, row) => sum + row.gamesTracked, 0),
        },
        ledger,
        readiness: {
          seasonSeparated: true,
          starterDenominatorsVerified: true,
          pregameLockingEnabled: true,
          postgameGradingEnabled: true,
          retrospectiveWritesDisabled: true,
        },
      });
    } catch (error) {
      console.error('[FB Diagnostics] Error:', error);
      return res.status(500).json({ error: 'Unable to load First Basket diagnostics' });
    }
  });
}
