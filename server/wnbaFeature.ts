import type { Express } from 'express';
import cron from 'node-cron';
import { requireAdmin } from './auth';
import { ensureWnbaSchema, getWnbaDiagnostics, getWnbaSlate, lockWnbaPredictions, runWnbaTracker } from './wnbaFirstBasket';
import { backfillWnbaHistory } from './wnbaBackfill';
import { getWnbaHistory } from './wnbaHistory';

let started = false;

export function registerWnbaFeature(app: Express): void {
  void ensureWnbaSchema().catch(error => console.error('[WNBA] Schema initialization failed:', error));

  app.get('/api/wnba/first-basket', async (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=180');
      res.json(await getWnbaSlate());
    } catch (error) {
      console.error('[WNBA] Slate error:', error);
      res.status(502).json({ error: 'Unable to load WNBA First Basket data' });
    }
  });

  app.get('/api/wnba/history', async (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
      res.json(await getWnbaHistory());
    } catch (error) {
      console.error('[WNBA] History error:', error);
      res.status(500).json({ error: 'Unable to load WNBA First Basket history' });
    }
  });

  app.post('/api/admin/wnba/run', requireAdmin, async (_req, res) => {
    try {
      const [locks, tracking] = await Promise.all([lockWnbaPredictions(), runWnbaTracker()]);
      res.json({ locks, tracking });
    } catch (error) {
      console.error('[WNBA] Manual run failed:', error);
      res.status(500).json({ error: 'WNBA tracker failed' });
    }
  });

  app.post('/api/admin/wnba/backfill', requireAdmin, async (req, res) => {
    try {
      const days = Math.max(1, Math.min(14, Number(req.body?.days ?? 7)));
      const maxGames = Math.max(1, Math.min(40, Number(req.body?.maxGames ?? 24)));
      res.json(await backfillWnbaHistory(days, maxGames));
    } catch (error) {
      console.error('[WNBA] Backfill failed:', error);
      res.status(500).json({ error: 'WNBA history backfill failed' });
    }
  });

  app.get('/api/admin/wnba/diagnostics', requireAdmin, async (req, res) => {
    try {
      const days = typeof req.query.days === 'string' ? Number(req.query.days) : 30;
      res.json(await getWnbaDiagnostics(Number.isFinite(days) ? days : 30));
    } catch (error) {
      console.error('[WNBA] Diagnostics failed:', error);
      res.status(500).json({ error: 'Unable to load WNBA diagnostics' });
    }
  });

  if (started) return;
  started = true;

  cron.schedule('*/15 10-23 * * *', async () => {
    try {
      const result = await lockWnbaPredictions();
      if (result.eligible || result.locked) console.log(`[WNBA] Lock pass: ${result.locked} locked, ${result.waiting} waiting.`);
    } catch (error) { console.warn('[WNBA] Lock pass failed:', error); }
  }, { timezone: 'America/New_York' });

  cron.schedule('*/30 12-23 * * *', async () => {
    try {
      const result = await runWnbaTracker();
      if (result.processed || result.unresolved) console.log(`[WNBA] Tracker: ${result.processed} processed, ${result.unresolved} unresolved.`);
    } catch (error) { console.warn('[WNBA] Tracker failed:', error); }
  }, { timezone: 'America/New_York' });
  cron.schedule('*/30 0-3 * * *', async () => {
    try {
      const result = await runWnbaTracker();
      if (result.processed || result.unresolved) console.log(`[WNBA] Late tracker: ${result.processed} processed, ${result.unresolved} unresolved.`);
    } catch (error) { console.warn('[WNBA] Late tracker failed:', error); }
  }, { timezone: 'America/New_York' });

  cron.schedule('17 */6 * * *', async () => {
    try {
      const result = await backfillWnbaHistory(7, 24);
      console.log(`[WNBA] History backfill: ${result.gamesAdded} games added across ${result.datesChecked} dates${result.done ? ' (season complete)' : ''}.`);
    } catch (error) { console.warn('[WNBA] History backfill failed:', error); }
  }, { timezone: 'America/New_York' });

  void getWnbaSlate(true).then(slate => console.log(`[WNBA] Warmed ${slate.games.length} games across ${slate.teams.length} teams.`)).catch(error => console.warn('[WNBA] Warm failed:', error));
  void runWnbaTracker().catch(error => console.warn('[WNBA] Startup tracker failed:', error));
  void backfillWnbaHistory(5, 18).then(result => console.log(`[WNBA] Startup history backfill added ${result.gamesAdded} games.`)).catch(error => console.warn('[WNBA] Startup backfill failed:', error));

  console.log('[WNBA] First Basket feature initialized (15-minute lock checks; 30-minute grading; 6-hour history backfill).');
}
