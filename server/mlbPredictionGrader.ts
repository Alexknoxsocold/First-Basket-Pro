import { snapshotPrediction } from "./mlbPredictionSnapshots.js";
import { getCachedMlbRfiQuotes, valueFromCachedQuotesForTeams } from "./mlbOdds.js";

export type GraderGame = {
  id: string;
  date: string;
  gameStartAt?: string | null;
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

function parseFirstInningScore(value: string | null): { away: number; home: number; normalized: string } | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  const away = Number(match[1]);
  const home = Number(match[2]);
  if (!Number.isSafeInteger(away) || !Number.isSafeInteger(home) || away < 0 || home < 0) return null;
  return { away, home, normalized: `${away}-${home}` };
}

/** A valid first-inning score is the grading authority. */
export async function persistAndGradeNrfiGames(games: GraderGame[], modelVersion = "v3"): Promise<void> {
  const quotes = getCachedMlbRfiQuotes();
  for (const game of games) {
    const parsedScore = parseFirstInningScore(game.firstInningScore);
    const completed = parsedScore !== null;
    const actualOutcome = parsedScore ? (parsedScore.away === 0 && parsedScore.home === 0 ? "NRFI" : "YRFI") : null;
    const rawProbability = game.recommendation === "NRFI" ? game.nrfiProbability : 100 - game.nrfiProbability;
    const modelProbability = Number.isFinite(rawProbability) ? Math.min(1, Math.max(0, rawProbability / 100)) : 0.5;
    const away = game.away?.name ?? game.away?.abbreviation ?? "";
    const home = game.home?.name ?? game.home?.abbreviation ?? "";
    const marketValue = !completed && quotes.length ? valueFromCachedQuotesForTeams(away, home, game.recommendation, modelProbability) : null;

    await snapshotPrediction({
      date: game.date.slice(0, 10), gameId: game.id, matchup: game.shortName,
      recommendation: game.recommendation, probability: modelProbability, confidence: game.confidence, modelVersion,
      // Persist the authoritative first-pitch timestamp so lock integrity can be verified later.
      gameStartAt: game.gameStartAt ?? game.date,
      lockedAt: completed ? null : new Date(), outcome: actualOutcome, firstInningScore: parsedScore?.normalized ?? null,
      marketValue: marketValue ? {
        available: marketValue.available, side: marketValue.selection, sportsbook: marketValue.book, market: "NRFI/YRFI",
        americanOdds: marketValue.price, capturedAt: marketValue.updatedAt, ageSeconds: marketValue.ageSeconds ?? null,
        impliedProbability: marketValue.impliedProbability, noVigProbability: marketValue.noVigProbability, modelProbability,
        edge: marketValue.edge, expectedValue: marketValue.ev,
        valuePlay: (marketValue.edge ?? -1) >= 0.02 && (marketValue.ev ?? -1) > 0,
        reason: "Verified market snapshot at prediction lock",
      } : null,
    });
  }
}
