import { snapshotPrediction } from "./mlbPredictionSnapshots.js";

export type GraderGame = {
  id: string;
  date: string;
  shortName: string;
  recommendation: "NRFI" | "YRFI";
  nrfiProbability: number;
  confidence: "High" | "Medium" | "Low";
  playStatus: "BEST_PLAY" | "PLAY" | "LEAN" | "NO_PLAY";
  outcome: "won" | "lost" | "pending";
  firstInningScore: string | null;
};

/**
 * Persists predictions and grades completed games without changing the
 * original recommendation or probability. Repeated calls are idempotent.
 */
export async function persistAndGradeNrfiGames(games: GraderGame[], modelVersion = "v3"): Promise<void> {
  for (const game of games) {
    const completed = game.outcome !== "pending" && game.firstInningScore !== null;
    const actualOutcome = completed
      ? game.firstInningScore === "0-0" ? "NRFI" : "YRFI"
      : null;

    await snapshotPrediction({
      date: game.date.slice(0, 10),
      gameId: game.id,
      matchup: game.shortName,
      recommendation: game.recommendation,
      probability: (game.recommendation === "NRFI" ? game.nrfiProbability : 100 - game.nrfiProbability) / 100,
      confidence: game.confidence,
      modelVersion,
      // The first call locks the prediction; later completed calls only fill
      // the result because snapshotPrediction preserves an existing lock.
      lockedAt: new Date(game.date),
      outcome: actualOutcome,
      firstInningScore: game.firstInningScore,
    });
  }
}
