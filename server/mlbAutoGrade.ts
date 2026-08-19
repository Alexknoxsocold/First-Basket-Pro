import { fetchNrfiDataV4Live } from "./mlbNrfiLiveV4.js";
import { persistAndGradeNrfiGames } from "./mlbPredictionGrader.js";
import { fetchMlbRfiMarkets } from "./mlbOdds.js";

const inflight = new Map<string, Promise<{ date: string; games: number }>>();
let timer: ReturnType<typeof setInterval> | null = null;

function requestKey(date?: string): string {
  return date ?? "today";
}

/**
 * Fetches the same V4-live response served to users and persists immutable
 * predictions plus authoritative first-inning results. Keeping the public
 * route and grader on the same model version prevents provenance drift.
 */
export async function refreshAndGradeMlbPredictions(date?: string): Promise<void> {
  await runMlbAutoGrade(date);
}

export function runMlbAutoGrade(date?: string): Promise<{ date: string; games: number }> {
  const key = requestKey(date);
  const existing = inflight.get(key);
  if (existing) return existing;

  const request = (async () => {
    const response = await fetchNrfiDataV4Live(date);
    try {
      await fetchMlbRfiMarkets();
    } catch (error) {
      console.warn("[MLB AutoGrade] Verified market warm failed; continuing model-only:", error);
    }
    await persistAndGradeNrfiGames(response.games, "v4-live");
    return { date: response.date, games: response.games.length };
  })();

  inflight.set(key, request);
  return request.finally(() => {
    if (inflight.get(key) === request) inflight.delete(key);
  });
}

/**
 * Production scheduler. Uses a conservative interval and date-scoped
 * single-flight guard instead of overlapping jobs. A manual historical lookup
 * can no longer accidentally share today's in-flight grading result.
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
