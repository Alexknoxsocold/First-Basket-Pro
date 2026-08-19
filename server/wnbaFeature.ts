import type { Express } from 'express';
import cron from 'node-cron';
import { requireAdmin } from './auth';
import { ensureWnbaSchema, getWnbaDiagnostics, getWnbaSlate, lockWnbaPredictions } from './wnbaFirstBasket';
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
      res.setHeader('Cache-Control', 'no-store');
      res.json(await getWnbaHistory());
    } catch (error) {
      console.error('[WNBA] History error:', error);
      res.status(500).json({ error: 'Unable to load WNBA First Basket history' });
    }
  });

  app.post('/api/admin/wnba/run', requireAdmin, async (_req, res) => {
    try {
      const locks = await lockWnbaPredictions();
      res.json({ locks, tracking: { paused: true, reason: 'WNBA result grading is quarantined pending chronology verification.' } });
    } catch (error) {
      console.error('[WNBA] Manual lock run failed:', error);
      res.status(500).json({ error: 'WNBA lock pass failed' });
    }
  });

  app.post('/api/admin/wnba/backfill', requireAdmin, (_req, res) => {
    return res.status(423).json({
      error: 'WNBA history backfill is temporarily paused',
      detail: 'Historical rows are quarantined while first-made-field-goal chronology is revalidated.',
    });
  });

  app.get('/api/admin/wnba/diagnostics', requireAdmin, async (req, res) => {
    try {
      const days = typeof req.query.days === 'string' ? Number(req.query.days) : 30;
      const diagnostics = await getWnbaDiagnostics(Number.isFinite(days) ? days : 30);
      res.json({ ...diagnostics, historyStatus: 'quarantined', trackerStatus: 'paused' });
    } catch (error) {
      console.error('[WNBA] Diagnostics failed:', error);
      res.status(500).json({ error: 'Unable to load WNBA diagnostics' });
    }
  });

  if (started) return;
  started = true;

  // Keep pregame lock checks running. Historical/result grading stays paused
  // until the first-field-goal verifier has been independently validated.
  cron.schedule('*/15 10-23 * * *', async () => {
    try {
      const result = await lockWnbaPredictions();
      if (result.eligible || result.locked) console.log(`[WNBA] Lock pass: ${result.locked} locked, ${result.waiting} waiting.`);
    } catch (error) { console.warn('[WNBA] Lock pass failed:', error); }
  }, { timezone: 'America/New_York' });

  void getWnbaSlate(true)
    .then(slate => console.log(`[WNBA] Warmed ${slate.games.length} games across ${slate.teams.length} teams.`))
    .catch(error => console.warn('[WNBA] Warm failed:', error));

  console.log('[WNBA] First Basket feature initialized with result/history grading quarantined pending verifier audit.');
}
