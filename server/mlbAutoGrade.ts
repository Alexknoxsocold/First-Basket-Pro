import { fetchNrfiData } from "./mlbNrfi.js";
import { persistAndGradeNrfiGames } from "./mlbPredictionGrader.js";
import { fetchMlbRfiMarkets } from "./mlbOdds.js";

let inflight: Promise<{ date: string; games: number }> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Fetches the authoritative scoreboard/model response and persists immutable
 * predictions plus results that are already final. Concurrent callers share
 * one in-flight run so startup, timers, and manual triggers cannot race.
 */
export async function refreshAndGradeMlbPredictions(date?: string): Promise<void> {
  const response = await fetchNrfiData(date);
  try {
    await fetchMlbRfiMarkets();
  } catch (error) {
    console.warn("[MLB AutoGrade] Verified market warm failed; continuing model-only:", error);
  }
  await persistAndGradeNrfiGames(response.games, "v3");
}

export function runMlbAutoGrade(date?: string): Promise<{ date: string; games: number }> {
  if (inflight) return inflight;
  inflight = (async () => {
    const response = await fetchNrfiData(date);
    try {
      await fetchMlbRfiMarkets();
    } catch (error) {
      console.warn("[MLB AutoGrade] Verified market warm failed; continuing model-only:", error);
    }
    await persistAndGradeNrfiGames(response.games, "v3");
    return { date: response.date, games: response.games.length };
  })();

  return inflight.finally(() => {
    inflight = null;
  });
}

/**
 * Production scheduler. Uses a conservative interval and single-flight guard
 * instead of overlapping cron jobs. The interval is intentionally unref'd so
 * it never prevents graceful process shutdown in serverless/dev environments.
 */
export function startMlbAutoGradeScheduler(intervalMs = 5 * 60 * 1000): () => void {
  if (timer) return () => stopMlbAutoGradeScheduler();

  const run = () => {
    void runMlbAutoGrade()
      .then(result => console.log(`[MLB AutoGrade] ${result.games} games checked for ${result.date}.`))
      .catch(error => console.error("[MLB AutoGrade] Scheduled run failed:", error));
  };

  timer = setInterval(run, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  run();
  console.log(`[MLB AutoGrade] Scheduler started (${Math.round(intervalMs / 1000)}s interval).`);
  return () => stopMlbAutoGradeScheduler();
}

export function stopMlbAutoGradeScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  console.log("[MLB AutoGrade] Scheduler stopped.");
}
