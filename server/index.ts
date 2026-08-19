import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { randomBytes } from "crypto";
import ws from "ws";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { authMiddleware } from "./auth";
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

const app = express();
app.set('trust proxy', 1);
neonConfig.webSocketConstructor = ws;

const production = process.env.NODE_ENV === 'production';
const configuredSessionSecret = process.env.SESSION_SECRET?.trim();
const sessionSecret = configuredSessionSecret || (production ? randomBytes(32).toString('hex') : 'development-only-session-secret');
if (production && !configuredSessionSecret) console.error('[Startup] SESSION_SECRET is missing. Using an ephemeral secret; sessions will reset on restart and multi-instance auth is not safe.');
if (production && !process.env.DATABASE_URL) console.error('[Startup] DATABASE_URL is missing. Persistent sessions and MLB verification ledgers are unavailable.');

const sessionStore = process.env.DATABASE_URL ? (() => {
  const PgSession = connectPgSimple(session);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return new PgSession({ pool, tableName: 'session', createTableIfMissing: true });
})() : undefined;

const sessionMiddleware = session({
  ...(sessionStore ? { store: sessionStore } : {}),
  secret: sessionSecret,
  resave: false, saveUninitialized: false,
  cookie: { secure: production, httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax' }
});

declare module 'http' { interface IncomingMessage { rawBody: unknown } }
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);
app.use(authMiddleware);

app.use((req, res, next) => {
  const start = Date.now(); const path = req.path; let capturedJsonResponse: Record<string, any> | undefined;
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) { capturedJsonResponse = bodyJson; return originalResJson.apply(res, [bodyJson, ...args]); };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      if (logLine.length > 80) logLine = logLine.slice(0, 79) + "…";
      log(logLine);
    }
  });
  next();
});

app.get('/api/health', (_req, res) => {
  const config = {
    database: Boolean(process.env.DATABASE_URL),
    sessionSecret: Boolean(configuredSessionSecret),
    inviteCode: Boolean(process.env.INVITE_CODE?.trim()),
    adminPassword: Boolean(process.env.ADMIN_PASSWORD?.trim()),
    oddsApiKey: Boolean(process.env.THE_ODDS_API_KEY?.trim()),
  };
  const criticalReady = config.database && (!production || config.sessionSecret);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(criticalReady ? 200 : 503).json({ status: criticalReady ? 'ok' : 'degraded', environment: production ? 'production' : 'development', config, generatedAt: new Date().toISOString() });
});

app.get('/api/admin/mlb/diagnostics', async (_req, res) => {
  try {
    const quotes = getCachedMlbRfiQuotes();
    const quoteTimes = quotes
      .map((quote: any) => quote.updatedAt ? new Date(quote.updatedAt).getTime() : Number.NaN)
      .filter((value: number) => Number.isFinite(value));
    const newestQuoteAt = quoteTimes.length ? new Date(Math.max(...quoteTimes)).toISOString() : null;
    const [history, performance, closingLine, integrity] = await Promise.all([
      getPredictionHistory(30),
      getCalibrationSummary(30),
      getMlbClosingLineSummary(30),
      getMlbIntegritySummary(30),
    ]);
    const locked = history.filter(row => row.lockedAt).length;
    const graded = history.filter(row => row.lockedAt && row.outcome).length;
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      generatedAt: new Date().toISOString(),
      modelVersion: 'v4-live',
      environment: production ? 'production' : 'development',
      configuration: {
        database: Boolean(process.env.DATABASE_URL),
        sessionSecret: Boolean(configuredSessionSecret),
        adminPassword: Boolean(process.env.ADMIN_PASSWORD?.trim()),
        oddsApiKey: Boolean(process.env.THE_ODDS_API_KEY?.trim()),
      },
      autoGrade: getMlbAutoGradeStatus(),
      market: {
        quoteCount: quotes.length,
        newestQuoteAt,
        status: quotes.length ? 'live' : 'unavailable',
      },
      ledger: {
        windowDays: 30,
        snapshots: history.length,
        locked,
        graded,
      },
      performance: {
        sampleSize: performance.sampleSize,
        gradedPredictions: performance.gradedPredictions,
        brierScore: performance.brierScore,
        logLoss: performance.logLoss,
        expectedCalibrationError: performance.expectedCalibrationError,
      },
      closingLine,
      integrity,
    });
  } catch (error) {
    console.error('[MLB Diagnostics] Error:', error);
    return res.status(500).json({ error: 'Unable to load MLB diagnostics' });
  }
});

app.use("/api/mlb/nrfi", (req, res, next) => {
  if (req.method !== "GET" || req.path !== "/") return next();
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    const quotes = getCachedMlbRfiQuotes();
    if (!quotes.length || !body?.games) {
      void fetchMlbRfiMarkets().catch(error => log('[MLB Odds] Background refresh failed:', error));
      return originalJson({ ...body, marketStatus: "unavailable" });
    }
    const games = body.games.map((game: any) => {
      const side = game.recommendation === "NRFI" ? "NRFI" : "YRFI";
      const modelProbability = side === "NRFI" ? game.nrfiProbability / 100 : (100 - game.nrfiProbability) / 100;
      const market = valueFromCachedQuotesForTeams(game.away?.name ?? "", game.home?.name ?? "", side, modelProbability);
      if (!market) return { ...game, marketValue: null };
      const edge = market.edge ?? 0; const ev = market.ev ?? 0;
      const marketPlayStatus = ev >= 0.08 && edge >= 0.05 ? "BEST_PLAY" : ev >= 0.04 && edge >= 0.03 ? "PLAY" : ev >= 0.02 && edge >= 0.015 ? "LEAN" : "NO_PLAY";
      const probability = side === "NRFI" ? game.nrfiProbability : 100 - game.nrfiProbability;
      const marketFactor = `${side} market: ${probability.toFixed(1)}% model vs ${market.noVigProbability === null ? "—" : (market.noVigProbability * 100).toFixed(1) + "%"} no-vig, ${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)}pp edge, ${ev >= 0 ? "+" : ""}${(ev * 100).toFixed(1)}% EV at ${market.book ?? "market"} ${market.price ?? "—"}`;
      return { ...game, modelPlayStatus: game.playStatus, marketPlayStatus, marketValue: { available: true, book: market.book, selection: market.selection, price: market.price, impliedProbability: market.impliedProbability === null ? null : Math.round(market.impliedProbability * 1000) / 10, noVigProbability: market.noVigProbability === null ? null : Math.round(market.noVigProbability * 1000) / 10, edge: Math.round(edge * 1000) / 10, ev: Math.round(ev * 1000) / 10, updatedAt: market.updatedAt, ageSeconds: market.ageSeconds === null || market.ageSeconds === undefined ? null : Math.round(market.ageSeconds) }, factors: [...(game.factors ?? []), marketFactor] };
    });
    const valueGames = games.filter((g: any) => g.playStatus === "BEST_PLAY" || g.playStatus === "PLAY");
    return originalJson({ ...body, games, topPick: [...valueGames].sort((a: any, b: any) => { const aScore = a.marketValue?.available ? (a.marketValue.ev ?? -Infinity) : a.modelEdge; const bScore = b.marketValue?.available ? (b.marketValue.ev ?? -Infinity) : b.modelEdge; return bScore - aScore; })[0] ?? null, marketStatus: "live" });
  }) as typeof res.json;
  next();
});

app.get("/api/mlb/performance", async (req, res) => {
  try {
    const requestedDays = typeof req.query.days === "string" ? Number(req.query.days) : 30;
    if (!Number.isFinite(requestedDays) || requestedDays < 1 || requestedDays > 90) return res.status(400).json({ error: "days must be a number from 1 to 90" });
    const [summary, closingLine] = await Promise.all([getCalibrationSummary(requestedDays), getMlbClosingLineSummary(requestedDays)]);
    const health = evaluateMlbModelHealth({ predictionCount: summary.sampleSize, gradedCount: summary.gradedPredictions, brierScore: summary.brierScore, logLoss: summary.logLoss, ece: summary.expectedCalibrationError, marketQuoteCount: closingLine.eligible, staleMarketQuoteCount: Math.max(0, closingLine.eligible - closingLine.captured), lineupConfirmedCount: 0, pitcherConfirmedCount: 0, missingPitcherMetricCount: 0 });
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json({ windowDays: Math.round(requestedDays), modelVersion: "v4-live", generatedAt: new Date().toISOString(), performance: summary, closingLine, health, market: { status: getCachedMlbRfiQuotes().length ? "live" : "unavailable", note: "ROI and CLV use only verified sportsbook snapshots. Missing prices are never backfilled or invented." } });
  } catch (error) { console.error("[MLB Performance] Error:", error); return res.status(500).json({ error: "Unable to load MLB performance data" }); }
});

app.get("/api/mlb/integrity", async (req, res) => {
  try {
    const requestedDays = typeof req.query.days === "string" ? Number(req.query.days) : 30;
    if (!Number.isFinite(requestedDays) || requestedDays < 1 || requestedDays > 365) return res.status(400).json({ error: "days must be a number from 1 to 365" });
    const integrity = await getMlbIntegritySummary(requestedDays);
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return res.json(integrity);
  } catch (error) { console.error("[MLB Integrity] Error:", error); return res.status(500).json({ error: "Unable to run MLB integrity audit" }); }
});

registerMlbHistoryRoutes(app);
registerCalibrationSourceRoute(app);

function isNbaSeason(): boolean { const month = new Date().getUTCMonth() + 1; return month >= 10 || month <= 6; }

(async () => {
  const server = await registerRoutes(app);
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 ? "Internal Server Error" : err.message || "Request failed";
    console.error('[Server] Unhandled request error:', err);
    if (!res.headersSent) res.status(status).json({ message });
  });
  if (app.get("env") === "development") await setupVite(app, server); else serveStatic(app);
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({ port, host: "0.0.0.0", ...(process.platform !== 'darwin' && { reusePort: true }) }, async () => {
    log(`serving on port ${port}`);
    try {
      const { fetchNrfiDataV4Live } = await import('./mlbNrfiLiveV4.js');
      void fetchNrfiDataV4Live().then(() => log('[Startup] MLB V4-live NRFI cache warmed for today.')).catch(error => log('[Startup] MLB V4-live cache warm failed:', error));
      log('[Startup] MLB V4-live cache warming started in background.');
    } catch (error) { log('[Startup] MLB cache warm skipped:', error); }
    void fetchMlbRfiMarkets().then(markets => log(`[Startup] MLB RFI odds warm: ${markets.size / 2} games priced.`)).catch(error => log('[Startup] MLB RFI odds warm failed:', error));
    startMlbAutoGradeScheduler();
    const closingRun = () => void captureMlbClosingLines(20).then(result => { if (result.captured > 0) log(`[MLB Closing] Captured ${result.captured}/${result.checked} closing lines.`); }).catch(error => log('[MLB Closing] Capture failed:', error));
    closingRun();
    const closingTimer = setInterval(closingRun, 5 * 60 * 1000);
    if (typeof closingTimer.unref === 'function') closingTimer.unref();
    log('[Startup] MLB closing-line capture scheduled every 5 minutes for games within 20 minutes of first pitch.');
    if (!isNbaSeason()) { log('[Startup] NBA offseason detected — skipping heavy NBA startup sync.'); return; }
    void (async () => {
      try { log('[Startup] Running initial NBA data sync in background...'); const startupSyncService = createDailySyncService(storage); await startupSyncService.runDailySync(); log('[Startup] Initial NBA sync complete'); } catch (error) { log('[Startup] Initial NBA sync failed:', error); }
      try { const { populateTodayStarters } = await import('./populate-player-stats.js'); await populateTodayStarters(storage); log('[Startup] Player stats populated successfully'); } catch (error) { log('[Startup] Failed to populate player stats:', error); }
      try { const { warmFirstBasketCache } = await import('./firstBasketHistory.js'); const games = await storage.getGames(); const today = new Date().toISOString().split('T')[0]; const todayGames = games.filter(g => g.gameDate?.startsWith(today)); const teams = [...new Set(todayGames.flatMap(g => [g.awayTeam, g.homeTeam].filter(Boolean)))]; if (teams.length > 0) { warmFirstBasketCache(teams as string[]); log(`[Startup] Warming FB history cache for: ${teams.join(', ')}`); } } catch (error) { log('[Startup] FB history warm skipped:', error); }
    })();
  });
})();