import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { authMiddleware } from "./auth";
import { createDailySyncService } from "./dailySync";
import { storage } from "./storage";

const app = express();
app.set('trust proxy', 1);
neonConfig.webSocketConstructor = ws;

const sessionStore = process.env.DATABASE_URL
  ? (() => {
      const PgSession = connectPgSimple(session);
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      return new PgSession({ pool, tableName: 'session', createTableIfMissing: true });
    })()
  : undefined;

const sessionMiddleware = session({
  ...(sessionStore ? { store: sessionStore } : {}),
  secret: process.env.SESSION_SECRET || 'firstbasket-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  }
});

declare module 'http' {
  interface IncomingMessage { rawBody: unknown }
}

app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);
app.use(authMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
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

function isNbaSeason(): boolean {
  const month = new Date().getUTCMonth() + 1;
  return month >= 10 || month <= 6;
}

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    ...(process.platform !== 'darwin' && { reusePort: true }),
  }, async () => {
    log(`serving on port ${port}`);

    // MLB cache warming happens after the HTTP server is listening and only
    // warms today's slate. It does not block startup or the first request.
    try {
      const { warmMlbCache } = await import('./mlbNrfi.js');
      warmMlbCache();
      log('[Startup] MLB NRFI cache warming started in background.');
    } catch (error) {
      log('[Startup] MLB cache warm skipped:', error);
    }

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
      } catch (error) {
        log('[Startup] Initial NBA sync failed:', error);
      }

      try {
        const { populateTodayStarters } = await import('./populate-player-stats.js');
        await populateTodayStarters(storage);
        log('[Startup] Player stats populated successfully');
      } catch (error) {
        log('[Startup] Failed to populate player stats:', error);
      }

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
      } catch (error) {
        log('[Startup] FB history warm skipped:', error);
      }
    })();
  });
})();
