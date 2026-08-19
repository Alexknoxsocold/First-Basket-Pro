import { getCalibrationSummary } from "./mlbCalibration.js";
import { getMlbClosingLineSummary } from "./mlbClosingLine.js";
import { getMlbIntegritySummary } from "./mlbIntegrity.js";
import { getMlbPassedDiagnostics } from "./mlbPassedDiagnostics.js";
import { getV4Evaluation } from "./mlbV4Evaluation.js";
import { getMlbDecisionContextCoverage } from "./mlbDecisionContext.js";

export type LaunchGate = {
  key: string;
  label: string;
  status: "PASS" | "WATCH" | "FAIL";
  detail: string;
};

export type MlbLaunchReadiness = {
  generatedAt: string;
  windowDays: number;
  status: "READY" | "EARLY" | "NOT_READY";
  score: number;
  gates: LaunchGate[];
  blockers: string[];
  notes: string[];
};

export async function getMlbLaunchReadiness(days = 30): Promise<MlbLaunchReadiness> {
  const safeDays = Math.min(Math.max(Math.round(days), 7), 90);
  const [calibration, closing, integrity, passed, v4, contextCoverage] = await Promise.all([
    getCalibrationSummary(safeDays),
    getMlbClosingLineSummary(safeDays),
    getMlbIntegritySummary(safeDays),
    getMlbPassedDiagnostics(safeDays),
    getV4Evaluation(Math.min(180, Math.max(30, safeDays))),
    getMlbDecisionContextCoverage(safeDays),
  ]);

  const gates: LaunchGate[] = [];
  const add = (key: string, label: string, status: LaunchGate["status"], detail: string) => gates.push({ key, label, status, detail });
  const production = process.env.NODE_ENV === "production";
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const sessionConfigured = Boolean(process.env.SESSION_SECRET?.trim());
  const oddsConfigured = Boolean(process.env.THE_ODDS_API_KEY?.trim());

  add("config-db", "Persistent production database",
    databaseConfigured ? "PASS" : production ? "FAIL" : "WATCH",
    databaseConfigured ? "DATABASE_URL is configured for persistent sessions and verification ledgers." : "DATABASE_URL is not configured; verified history cannot be durable.");

  add("config-session", "Stable session signing secret",
    sessionConfigured ? "PASS" : production ? "FAIL" : "WATCH",
    sessionConfigured ? "SESSION_SECRET is configured." : "SESSION_SECRET is missing; production sessions would use an ephemeral secret and reset on restart.");

  add("config-odds", "Sportsbook data provider",
    oddsConfigured ? "PASS" : "WATCH",
    oddsConfigured ? "Odds API credentials are configured; market availability still depends on RFI market access." : "No odds API key is configured. Model-only predictions can run, but verified EV/CLV cannot be produced.");

  add("integrity", "Prediction ledger integrity",
    integrity.status === "PASS" ? "PASS" : integrity.status === "WARN" || integrity.status === "NO_DATA" ? "WATCH" : "FAIL",
    `${integrity.errors} errors, ${integrity.warnings} warnings across ${integrity.snapshots} snapshots.`);

  const graded = calibration.gradedPredictions;
  add("sample", "Verified graded sample",
    graded >= 100 ? "PASS" : "WATCH",
    `${graded} locked predictions have verified outcomes; 100+ is preferred before strong public performance claims.`);

  add("calibration", "Probability calibration",
    calibration.expectedCalibrationError === null ? "WATCH" : calibration.expectedCalibrationError <= 0.08 ? "PASS" : calibration.expectedCalibrationError <= 0.12 ? "WATCH" : "FAIL",
    calibration.expectedCalibrationError === null ? "Not enough graded data for ECE." : `ECE ${(calibration.expectedCalibrationError * 100).toFixed(1)}%.`);

  add("brier", "Probability scoring",
    calibration.brierScore === null ? "WATCH" : calibration.brierScore <= 0.25 ? "PASS" : calibration.brierScore <= 0.28 ? "WATCH" : "FAIL",
    calibration.brierScore === null ? "Brier score unavailable." : `Brier ${calibration.brierScore.toFixed(3)}.`);

  const verifiedBets = calibration.performance.bets;
  add("market", "Verified sportsbook record",
    verifiedBets >= 50 ? "PASS" : "WATCH",
    `${verifiedBets} graded value plays have a verified lock-time sportsbook price.`);

  const closingCoverage = closing.eligible ? closing.captured / closing.eligible : null;
  add("closing", "Closing-line coverage",
    closingCoverage === null ? "WATCH" : closingCoverage >= 0.70 ? "PASS" : closingCoverage >= 0.40 ? "WATCH" : "FAIL",
    closingCoverage === null ? "No eligible lock-time prices yet." : `${closing.captured}/${closing.eligible} eligible predictions have a verified closing quote (${(closingCoverage * 100).toFixed(0)}%).`);

  add("context", "Immutable decision-context coverage",
    contextCoverage.coverage === null ? "WATCH" : contextCoverage.coverage >= 0.80 ? "PASS" : contextCoverage.coverage >= 0.50 ? "WATCH" : "FAIL",
    contextCoverage.coverage === null ? "No context-capable V4 snapshots yet." : `${contextCoverage.contexts}/${contextCoverage.snapshots} V4-live locked snapshots have immutable pregame decision context (${(contextCoverage.coverage * 100).toFixed(0)}%).`);

  add("v4", "V4 validation",
    v4.winner === "v4" ? "PASS" : v4.winner === "insufficient_data" || v4.winner === "tie" ? "WATCH" : "FAIL",
    v4.winner === "insufficient_data" ? `${v4.gradedPredictions} V3/V4 comparison outcomes; 50+ required by the evaluator.` : `${v4.gradedPredictions} comparisons; evaluator winner: ${v4.winner}.`);

  const borderline = passed.borderlinePassed;
  add("passes", "Conservative-pass monitoring", "PASS",
    `${borderline.sampleSize} graded calls in the 50–53% zone; hit rate ${borderline.hitRate === null ? "unavailable" : (borderline.hitRate * 100).toFixed(1) + "%"}. Thresholds remain diagnostic, not hindsight-adjusted.`);

  const failures = gates.filter(gate => gate.status === "FAIL");
  const watches = gates.filter(gate => gate.status === "WATCH");
  const score = Math.max(0, Math.round(100 - failures.length * 20 - watches.length * 7));
  const blockers = failures.map(gate => `${gate.label}: ${gate.detail}`);
  const status: MlbLaunchReadiness["status"] = failures.length ? "NOT_READY" : graded >= 30 && integrity.status !== "FAIL" ? (watches.length <= 4 ? "READY" : "EARLY") : "EARLY";

  return {
    generatedAt: new Date().toISOString(),
    windowDays: safeDays,
    status,
    score,
    gates,
    blockers,
    notes: [
      "READY means technical and evidence gates are acceptable for a public beta; it does not guarantee profitability.",
      "Performance claims should remain explicitly sample-sized and should never include unlocked retrospective rows.",
      "Missing sportsbook prices are excluded from ROI and CLV rather than estimated.",
      "Decision-context coverage starts with new V4-live captures; older snapshots are intentionally not backfilled with reconstructed factors.",
      "The legacy historical replay endpoint is disabled until calibration can enforce an as-of-date cutoff and eliminate future-data leakage.",
    ],
  };
}
