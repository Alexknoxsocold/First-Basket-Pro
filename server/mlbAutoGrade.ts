import { fetchNrfiDataV4Live } from "./mlbNrfiLiveV4.js";
import { persistAndGradeNrfiGames } from "./mlbPredictionGrader.js";
import { fetchMlbRfiMarkets } from "./mlbOdds.js";

let inflight: Promise<{ date: string; games: number }> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Fetches the same V4-live response served to users and persists immutable
 * predictions plus authoritative first-inning results. Keeping the public
 * route and grader on the same model version prevents provenance drift.
 */
export async function refreshAndGradeMlbPredictions(date?: string): Promise<void> {
  const response = await fetchNrfiDataV4Live(date);
  try {
    await fetchMlbRfiMarkets();
  } catch (error) {
    console.warn("[MLB AutoGrade] Verified market warm failed; continuing model-only:", error);
  }
  await persistAndGradeNrfiGames(response.games, "v4-live");
}

export function runMlbAutoGrade(date?: string): Promise<{ date: string; games: number }> {
  if (inflight) return inflight;
  inflight = (async () => {
    const response = await fetchNrfiDataV4Live(date);
    try {
      await fetchMlbRfiMarkets();
    } catch (error) {
      console.warn("[MLB AutoGrade] Verified market warm failed; continuing model-only:", error);
    }
    await persistAndGradeNrfiGames(response.games, "v4-live");
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
      .then(result => console.log(`[MLB AutoGrade] ${result.games} V4-live games checked for ${result.date}.`))
      .catch(error => console.error("[MLB AutoGrade] Scheduled run failed:", error));
  };

  timer = setInterval(run, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  run();
  console.log(`[MLB AutoGrade] V4-live scheduler started (${Math.round(intervalMs / 1000)}s interval).`);
  return () => stopMlbAutoGradeScheduler();
}

export function stopMlbAutoGradeScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  console.log("[MLB AutoGrade] Scheduler stopped.");
}
