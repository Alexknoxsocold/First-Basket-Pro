import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { authMiddleware, requireAdmin } from "./auth";
import { createDailySyncService } from "./dailySync";
import { storage } from "./storage";
import { fetchMlbRfiMarkets, getCachedMlbRfiQuotes, valueFromCachedQuotesForTeams } from "./mlbOdds";
import { getCalibrationSummary } from "./mlbCalibration";
import { evaluateMlbModelHealth } from "./mlbModelHealth";
import { registerCalibrationSourceRoute } from "./mlbCalibrationSources";
import { getMlbIntegritySummary } from "./mlbIntegrity";
import { getMlbAutoGradeStatus, startMlbAutoGradeScheduler } from "./mlbAutoGrade";
import { captureMlbClosingLines, getMlbClosingLineSummary } from "./mlbClosingLine";
import { getPredictionHistory } from "./mlbPredictionSnapshots";
import { registerMlbHistoryRoutes } from "./mlbHistory";
import { getMlbLockFunnel } from "./mlbLockFunnel";
import { registerMlbV4PublicRoutes } from "./mlbPublicV4Routes";
import { registerProductionCleanupRoutes } from "./productionCleanupRoutes";
import { fetchNflMarkets } from "./nflMarkets";
import { registerWhopBillingRoutes } from "./whopBilling";

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
neonConfig.webSocketConstructor = ws;

const production = process.env.NODE_ENV === 'production';
const configuredSessionSecret = process.env.SESSION_SECRET?.trim();
const databaseUrl = process.env.DATABASE_URL?.trim();

if (production && !configuredSessionSecret) throw new Error('SESSION_SECRET is required in production. Refusing to start with an ephemeral secret.');
if (production && !databaseUrl) throw new Error('DATABASE_URL is required in production. Refusing to start without persistent storage.');

const sessionSecret = configuredSessionSecret || 'development-only-session-secret';
const appDbPool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const sessionStore = appDbPool ? (() => {
  const PgSession = connectPgSimple(session);
  return new PgSession({ pool: appDbPool, tableName: 'session', createTableIfMissing: true });
})() : undefined;

const sessionMiddleware = session({
  ...(sessionStore ? { store: sessionStore } : {}),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: production, httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' },
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/admin')) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

declare module 'http' { interface IncomingMessage { rawBody: unknown } }
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(sessionMiddleware);
app.use(authMiddleware);
registerWhopBillingRoutes(app);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  res.on('finish', () => {
    if (!path.startsWith('/api')) return;
    const duration = Date.now() - start;
    const slow = duration >= 2000 ? ' SLOW' : '';
    log(`${req.method} ${path} ${res.statusCode} in ${duration}ms${slow}`);
  });
  next();
});

let lastDbHealth: { checkedAt: number; ok: boolean } | null = null;
async function databaseHealthy(): Promise<boolean> {
  if (!appDbPool) return !production;
  const now = Date.now();
  if (lastDbHealth && now - lastDbHealth.checkedAt < 10_000) return lastDbHealth.ok;
  try {
    await Promise.race([appDbPool.query('SELECT 1'), new Promise((_, reject) => setTimeout(() => reject(new Error('database health timeout')), 2000))]);
    lastDbHealth = { checkedAt: now, ok: true };
  } catch (error) {
    console.error('[Health] Database check failed:', error);
    lastDbHealth = { checkedAt: now, ok: false };
  }
  return lastDbHealth.ok;
}

app.get('/api/health', async (_req, res) => {
  const dbOk = await databaseHealthy();
  const ok = !production || dbOk;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', database: dbOk ? 'ok' : 'unavailable', modelVersion: 'v4-live', generatedAt: new Date().toISOString() });
});

app.get('/api/admin/mlb/diagnostics', requireAdmin, async (_req, res) => {
  try {
    const quotes = getCachedMlbRfiQuotes();
    const quoteTimes = quotes.map((quote: any) => quote.updatedAt ? new Date(quote.updatedAt).getTime() : Number.NaN).filter((value: number) => Number.isFinite(value));
    const newestQuoteAt = quoteTimes.length ? new Date(Math.max(...quoteTimes)).toISOString() : null;
    const [history, performance, closingLine, integrity, lockFunnel] = await Promise.all([getPredictionHistory(30), getCalibrationSummary(30), getMlbClosingLineSummary(30), getMlbIntegritySummary(30), getMlbLockFunnel()]);
    const locked = history.filter(row => row.lockedAt).length;
    const graded = history.filter(row => row.lockedAt && row.outcome).length;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      generatedAt: new Date().toISOString(), modelVersion: 'v4-live', environment: production ? 'production' : 'development',
      configuration: { database: Boolean(databaseUrl), sessionSecret: Boolean(configuredSessionSecret), adminPassword: Boolean(process.env.ADMIN_PASSWORD?.trim()), oddsApiKey: Boolean(process.env.THE_ODDS_API_KEY?.trim()) },
      autoGrade: getMlbAutoGradeStatus(), market: { quoteCount: quotes.length, newestQuoteAt, status: quotes.length ? 'live' : 'unavailable' },
      ledger: { windowDays: 30, snapshots: history.length, locked, graded }, lockFunnel,
      performance: { sampleSize: performance.sampleSize, gradedPredictions: performance.gradedPredictions, brierScore: performance.brierScore, logLoss: performance.logLoss, expectedCalibrationError: performance.expectedCalibrationError },
      closingLine, integrity,
    });
  } catch (error) {
    console.error('[MLB Diagnostics] Error:', error);
    return res.status(500).json({ error: 'Unable to load MLB diagnostics' });
  }
});

app.use('/api/mlb/nrfi', (req, res, next) => {
  if (req.method !== 'GET' || req.path !== '/') return next();
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    const quotes = getCachedMlbRfiQuotes();
    const hasBuiltInMarket = Boolean(body?.games?.some((game: any) => game.marketValue?.available));

    if (!quotes.length || !body?.games) {
      void fetchMlbRfiMarkets().catch(error => log('[MLB Odds] Background refresh failed:', error));
      return originalJson({ ...body, marketStatus: hasBuiltInMarket || body?.marketStatus === 'live' ? 'live' : 'unavailable' });
    }

    const games = body.games.map((game: any) => {
      const side = game.recommendation === 'NRFI' ? 'NRFI' : 'YRFI';
      const modelProbability = side === 'NRFI' ? game.nrfiProbability / 100 : (100 - game.nrfiProbability) / 100;
      const market = valueFromCachedQuotesForTeams(game.away?.name ?? '', game.home?.name ?? '', side, modelProbability);
      if (!market) return game;
      const edge = market.edge ?? 0;
      const ev = market.ev ?? 0;
      const marketPlayStatus = ev >= 0.08 && edge >= 0.05 ? 'BEST_PLAY' : ev >= 0.04 && edge >= 0.03 ? 'PLAY' : ev >= 0.02 && edge >= 0.015 ? 'LEAN' : 'NO_PLAY';
      const probability = side === 'NRFI' ? game.nrfiProbability : 100 - game.nrfiProbability;
      const marketFactor = `${side} market: ${probability.toFixed(1)}% model vs ${market.noVigProbability === null ? '—' : (market.noVigProbability * 100).toFixed(1) + '%'} no-vig, ${edge >= 0 ? '+' : ''}${(edge * 100).toFixed(1)}pp edge, ${ev >= 0 ? '+' : ''}${(ev * 100).toFixed(1)}% EV at ${market.book ?? 'market'} ${market.price ?? '—'}`;
      return {
        ...game,
        modelPlayStatus: game.playStatus,
        marketPlayStatus,
        marketValue: {
          available: true, book: market.book, selection: market.selection, price: market.price,
          impliedProbability: market.impliedProbability === null ? null : Math.round(market.impliedProbability * 1000) / 10,
          noVigProbability: market.noVigProbability === null ? null : Math.round(market.noVigProbability * 1000) / 10,
          edge: Math.round(edge * 1000) / 10, ev: Math.round(ev * 1000) / 10, updatedAt: market.updatedAt,
          ageSeconds: market.ageSeconds === null || market.ageSeconds === undefined ? null : Math.round(market.ageSeconds),
        },
        factors: [...(game.factors ?? []), marketFactor],
      };
    });
    const valueGames = games.filter((g: any) => g.playStatus === 'BEST_PLAY' || g.playStatus === 'PLAY');
    const anyMarket = games.some((g: any) => g.marketValue?.available);
    return originalJson({
      ...body,
      games,
      topPick: [...valueGames].sort((a: any, b: any) => {
        const aScore = a.marketValue?.available ? (a.marketValue.ev ?? -Infinity) : a.modelEdge;
        const bScore = b.marketValue?.available ? (b.marketValue.ev ?? -Infinity) : b.modelEdge;
        return bScore - aScore;
      })[0] ?? null,
      marketStatus: anyMarket ? 'live' : (body?.marketStatus ?? 'unavailable'),
    });
  }) as typeof res.json;
  next();
});

app.get('/api/nfl/markets', async (_req, res) => {
  try {
    const data = await fetchNflMarkets();
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
    return res.json(data);
  } catch (error) {
    console.error('[NFL Markets] Error:', error);
    return res.status(502).json({ error: 'Unable to load NFL market data' });
  }
});

registerProductionCleanupRoutes(app);
registerMlbV4PublicRoutes(app);

app.get('/api/mlb/performance', async (req, res) => {
  try {
    const requestedDays = typeof req.query.days === 'string' ? Number(req.query.days) : 30;
    if (!Number.isFinite(requestedDays) || requestedDays < 1 || requestedDays > 90) return res.status(400).json({ error: 'days must be a number from 1 to 90' });
    const [summary, closingLine] = await Promise.all([getCalibrationSummary(requestedDays), getMlbClosingLineSummary(requestedDays)]);
    const health = evaluateMlbModelHealth({ predictionCount: summary.sampleSize, gradedCount: summary.gradedPredictions, brierScore: summary.brierScore, logLoss: summary.logLoss, ece: summary.expectedCalibrationError, marketQuoteCount: closingLine.eligible, staleMarketQuoteCount: Math.max(0, closingLine.eligible - closingLine.captured), lineupConfirmedCount: 0, pitcherConfirmedCount: 0, missingPitcherMetricCount: 0 });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json({ windowDays: Math.round(requestedDays), modelVersion: 'v4-live', generatedAt: new Date().toISOString(), performance: summary, closingLine, health, market: { status: getCachedMlbRfiQuotes().length ? 'live' : 'unavailable', note: 'ROI and CLV use only verified sportsbook snapshots. Missing prices are never backfilled or invented.' } });
  } catch (error) {
    console.error('[MLB Performance] Error:', error);
    return res.status(500).json({ error: 'Unable to load MLB performance data' });
  }
});

app.get('/api/mlb/integrity', async (req, res) => {
  try {
    const requestedDays = typeof req.query.days === 'string' ? Number(req.query.days) : 30;
    if (!Number.isFinite(requestedDays) || requestedDays < 1 || requestedDays > 365) return res.status(400).json({ error: 'days must be a number from 1 to 365' });
    const integrity = await getMlbIntegritySummary(requestedDays);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return res.json(integrity);
  } catch (error) {
    console.error('[MLB Integrity] Error:', error);
    return res.status(500).json({ error: 'Unable to run MLB integrity audit' });
  }
});

registerMlbHistoryRoutes(app);
registerCalibrationSourceRoute(app);

function isNbaSeason(): boolean {
  const month = new Date().getUTCMonth() + 1;
  return month >= 10 || month <= 6;
}

(async () => {
  const server = await registerRoutes(app);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 ? 'Internal Server Error' : err.message || 'Request failed';
    console.error('[Server] Unhandled request error:', err);
    if (!res.headersSent) res.status(status).json({ message });
  });
  if (app.get('env') === 'development') await setupVite(app, server); else serveStatic(app);
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({ port, host: '0.0.0.0', ...(process.platform !== 'darwin' && { reusePort: true }) }, async () => {
    log(`serving on port ${port}`);
    try {
      const { fetchNrfiDataV4Live } = await import('./mlbNrfiLiveV4.js');
      void fetchNrfiDataV4Live().then(() => log('[Startup] MLB V4-live NRFI cache warmed for today.')).catch(error => log('[Startup] MLB V4-live cache warm failed:', error));
      log('[Startup] MLB V4-live cache warming started in background.');
    } catch (error) {
      log('[Startup] MLB cache warm skipped:', error);
    }
    void fetchMlbRfiMarkets().then(markets => log(`[Startup] MLB RFI odds warm: ${markets.size / 2} games priced.`)).catch(error => log('[Startup] MLB RFI odds warm failed:', error));
    startMlbAutoGradeScheduler();
    const closingRun = () => void captureMlbClosingLines(20).then(result => { if (result.captured > 0) log(`[MLB Closing] Captured ${result.captured}/${result.checked} closing lines.`); }).catch(error => log('[MLB Closing] Capture failed:', error));
    closingRun();
    const closingTimer = setInterval(closingRun, 5 * 60 * 1000);
    if (typeof closingTimer.unref === 'function') closingTimer.unref();
    log('[Startup] MLB closing-line capture scheduled every 5 minutes for games within 20 minutes of first pitch.');
    if (!isNbaSeason()) {
      log('[Startup] NBA offseason detected — skipping heavy NBA startup sync.');
      return;
    }
    void (async () => {
      try {
        log('[Startup] Running initial NBA data sync in background...');
        const startupSyncService = createDailySyncService(storage);
        await startupSyncService.runDailySync();
        log('[Startup] Initial NBA sync complete');
      } catch (error) { log('[Startup] Initial NBA sync failed:', error); }
      try {
        const { populateTodayStarters } = await import('./populate-player-stats.js');
        await populateTodayStarters(storage);
        log('[Startup] Player stats populated successfully');
      } catch (error) { log('[Startup] Failed to populate player stats:', error); }
      try {
        const { warmFirstBasketCache } = await import('./firstBasketHistory.js');
        const games = await storage.getGames();
        const today = new Date().toISOString().split('T')[0];
        const todayGames = games.filter(g => g.gameDate?.startsWith(today));
        const teams = [...new Set(todayGames.flatMap(g => [g.awayTeam, g.homeTeam].filter(Boolean)))];
        if (teams.length > 0) {
          warmFirstBasketCache(teams as string[]);
          log(`[Startup] Warming FB history cache for: ${teams.join(', ')}`);
        }
      } catch (error) { log('[Startup] FB history warm skipped:', error); }
    })();
  });
})();