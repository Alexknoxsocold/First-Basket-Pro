import { fetchNrfiData } from "./mlbNrfi.js";
import { persistAndGradeNrfiGames } from "./mlbPredictionGrader.js";
import { fetchMlbRfiMarkets } from "./mlbOdds.js";

/**
 * Production-safe orchestration hook for the locked prediction/results loop.
 * Fetches the authoritative scoreboard/model response and persists only the
 * current immutable prediction plus any result that is already final.
 */
export async function refreshAndGradeMlbPredictions(date?: string): Promise<void> {
  const response = await fetchNrfiData(date);
  // Warm the verified market cache before the snapshot is written. If the
  // market source is unavailable, grading still proceeds without inventing a
  // price; the prediction remains valid as a model-only snapshot.
  try {
    await fetchMlbRfiMarkets();
  } catch (error) {
    console.warn("[MLB AutoGrade] Verified market warm failed; continuing model-only:", error);
  }
  await persistAndGradeNrfiGames(response.games, "v3");
}

/**
 * Convenience wrapper for scheduled jobs. Errors are re-thrown so the caller
 * can mark the job failed instead of silently reporting a successful grade.
 */
export async function runMlbAutoGrade(date?: string): Promise<{ date: string; games: number }> {
  await refreshAndGradeMlbPredictions(date);
  const response = await fetchNrfiData(date);
  return { date: response.date, games: response.games.length };
}
