import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { fetchNrfiDataV4Live } from "./mlbNrfiLiveV4.js";
import { getPredictionHistory } from "./mlbPredictionSnapshots.js";

neonConfig.webSocketConstructor = ws;

const LOCK_WINDOW_MS = 2 * 60 * 60 * 1000;
const STALE_GRADE_MS = 2 * 60 * 60 * 1000;

export type MlbLockFunnel = {
  generatedAt: string;
  slateDate: string;
  lockWindowMinutes: number;
  counts: {
    slate: number;
    upcoming: number;
    eligibleToLock: number;
    locked: number;
    graded: number;
    learningEligible: number;
    contextCaptured: number;
  };
  health: "healthy" | "watch" | "blocked";
  alerts: Array<{
    severity: "info" | "warning" | "error";
    code: string;
    message: string;
    gameIds?: string[];
  }>;
};

let pool: Pool | null = null;
function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

function startTime(game: { gameStartAt?: string | null; date?: string | null }): number | null {
  const raw = game.gameStartAt ?? game.date ?? null;
  if (!raw) return null;
  const value = new Date(raw).getTime();
  return Number.isFinite(value) ? value : null;
}

export async function getMlbLockFunnel(): Promise<MlbLockFunnel> {
  const generatedAt = new Date().toISOString();
  const now = Date.now();
  const slate = await fetchNrfiDataV4Live();
  const gameIds = new Set(slate.games.map(game => String(game.id)));
  const starts = new Map(slate.games.map(game => [String(game.id), startTime(game)] as const));
  const history = (await getPredictionHistory(30)).filter(row => row.date === slate.date && gameIds.has(String(row.gameId)) && row.modelVersion === "v4-live");
  const lockedRows = history.filter(row => row.lockedAt);
  const gradedRows = lockedRows.filter(row => row.outcome === "NRFI" || row.outcome === "YRFI");
  const lockedIds = new Set(lockedRows.map(row => String(row.gameId)));
  const gradedIds = new Set(gradedRows.map(row => String(row.gameId)));

  const upcomingGames = slate.games.filter(game => {
    const start = starts.get(String(game.id));
    return start !== null && start !== undefined && start > now;
  });
  const eligibleGames = upcomingGames.filter(game => {
    const start = starts.get(String(game.id));
    return start !== null && start !== undefined && start - now <= LOCK_WINDOW_MS;
  });

  const missingLockIds = eligibleGames.map(game => String(game.id)).filter(id => !lockedIds.has(id));
  const staleUngradedIds = lockedRows
    .filter(row => {
      if (gradedIds.has(String(row.gameId))) return false;
      const start = starts.get(String(row.gameId));
      return start !== null && start !== undefined && now - start >= STALE_GRADE_MS;
    })
    .map(row => String(row.gameId));

  let contextIds = new Set<string>();
  const connection = db();
  if (connection && gameIds.size) {
    try {
      const result = await connection.query<{ game_id: string }>(
        `SELECT game_id FROM mlb_prediction_context WHERE prediction_date = $1 AND model_version = 'v4-live'`,
        [slate.date],
      );
      contextIds = new Set(result.rows.map(row => String(row.game_id)).filter(id => gameIds.has(id)));
    } catch (error) {
      console.warn("[MLB Lock Funnel] Context query unavailable:", error);
    }
  }

  const learningEligible = gradedRows.filter(row => contextIds.has(String(row.gameId))).length;
  const alerts: MlbLockFunnel["alerts"] = [];

  if (missingLockIds.length) {
    alerts.push({
      severity: "error",
      code: "LOCK_WINDOW_MISS",
      message: `${missingLockIds.length} game(s) are inside the two-hour lock window without an official V4 lock.`,
      gameIds: missingLockIds,
    });
  }
  if (staleUngradedIds.length) {
    alerts.push({
      severity: "warning",
      code: "GRADE_LAG",
      message: `${staleUngradedIds.length} locked game(s) are more than two hours past first pitch and remain ungraded.`,
      gameIds: staleUngradedIds,
    });
  }
  if (gradedRows.length && learningEligible < gradedRows.length) {
    alerts.push({
      severity: "warning",
      code: "MISSING_CONTEXT",
      message: `${gradedRows.length - learningEligible} graded lock(s) are missing immutable decision context and are excluded from adaptive NO PLAY learning.`,
    });
  }
  if (!eligibleGames.length && upcomingGames.length) {
    alerts.push({
      severity: "info",
      code: "WAITING_FOR_LOCK_WINDOW",
      message: `${upcomingGames.length} upcoming game(s) are scheduled, but none are inside the two-hour official lock window yet.`,
    });
  }
  if (!slate.games.length) {
    alerts.push({ severity: "info", code: "NO_SLATE", message: "No MLB games are currently available for the active slate." });
  }

  const health: MlbLockFunnel["health"] = alerts.some(alert => alert.severity === "error")
    ? "blocked"
    : alerts.some(alert => alert.severity === "warning")
      ? "watch"
      : "healthy";

  return {
    generatedAt,
    slateDate: slate.date,
    lockWindowMinutes: LOCK_WINDOW_MS / 60_000,
    counts: {
      slate: slate.games.length,
      upcoming: upcomingGames.length,
      eligibleToLock: eligibleGames.length,
      locked: lockedRows.length,
      graded: gradedRows.length,
      learningEligible,
      contextCaptured: contextIds.size,
    },
    health,
    alerts,
  };
}
