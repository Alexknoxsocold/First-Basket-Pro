import { snapshotPrediction } from "./mlbPredictionSnapshots.js";
import { getCachedMlbRfiQuotes, valueFromCachedQuotesForTeams } from "./mlbOdds.js";

export type GraderGame = {
  id: string;
  date: string;
  shortName: string;
  away: { abbreviation: string; name?: string };
  home: { abbreviation: string; name?: string };
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
 * The first persisted snapshot also captures the verified market quote that
 * was actually available at lock time; later grading calls only fill results.
 */
export async function persistAndGradeNrfiGames(games: GraderGame[], modelVersion = "v3"): Promise<void> {
  const quotes = getCachedMlbRfiQuotes();
  for (const game of games) {
    const completed = game.outcome !== "pending" && game.firstInningScore !== null;
    const actualOutcome = completed
      ? game.firstInningScore === "0-0" ? "NRFI" : "YRFI"
      : null;
    const modelProbability = (game.recommendation === "NRFI" ? game.nrfiProbability : 100 - game.nrfiProbability) / 100;
    const away = game.away?.name ?? game.away?.abbreviation ?? "";
    const home = game.home?.name ?? game.home?.abbreviation ?? "";
    const marketValue = quotes.length
      ? valueFromCachedQuotesForTeams(away, home, game.recommendation, modelProbability)
      : null;

    await snapshotPrediction({
      date: game.date.slice(0, 10),
      gameId: game.id,
      matchup: game.shortName,
      recommendation: game.recommendation,
      probability: modelProbability,
      confidence: game.confidence,
      modelVersion,
      // The first call locks the prediction; later completed calls preserve
      // the existing lock and only fill the final result.
      lockedAt: new Date(),
      outcome: actualOutcome,
      firstInningScore: game.firstInningScore,
      marketValue: marketValue ? {
        available: marketValue.available,
        side: marketValue.selection,
        sportsbook: marketValue.book,
        market: "NRFI/YRFI",
        americanOdds: marketValue.price,
        capturedAt: marketValue.updatedAt,
        ageSeconds: marketValue.ageSeconds ?? null,
        impliedProbability: marketValue.impliedProbability,
        noVigProbability: marketValue.noVigProbability,
        modelProbability,
        edge: marketValue.edge,
        expectedValue: marketValue.ev,
        valuePlay: (marketValue.edge ?? -1) >= 0.02 && (marketValue.ev ?? -1) > 0,
        reason: "Verified market snapshot at prediction lock",
      } : null,
    });
  }
}
