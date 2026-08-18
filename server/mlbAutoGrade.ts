import { fetchNrfiData } from "./mlbNrfi.js";
import { persistAndGradeNrfiGames } from "./mlbPredictionGrader.js";

/**
 * Production-safe orchestration hook for the locked prediction/results loop.
 * Fetches the authoritative scoreboard/model response and persists only the
 * current immutable prediction plus any result that is already final.
 */
export async function refreshAndGradeMlbPredictions(date?: string): Promise<void> {
  const response = await fetchNrfiData(date);
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
