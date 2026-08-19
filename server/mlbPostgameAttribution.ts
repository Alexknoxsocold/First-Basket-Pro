import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;
function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

type Row = {
  recommendation: "NRFI" | "YRFI";
  probability: number;
  confidence: string | null;
  outcome: "NRFI" | "YRFI";
  firstInningScore: string | null;
  marketAvailable: boolean;
  valuePlay: boolean;
  modelVersion: string;
  context: Record<string, any> | null;
};

export type AttributionSlice = {
  label: string;
  sampleSize: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  averageProbability: number | null;
};

export type PenaltySummary = { penalty: string; appearances: number; wins: number; hitRate: number | null };

export type MlbPostgameAttribution = {
  generatedAt: string;
  windowDays: number;
  graded: number;
  contextCoverage: { eligibleV4: number; withContext: number; coverage: number | null };
  overall: AttributionSlice;
  bySide: AttributionSlice[];
  byConfidence: AttributionSlice[];
  byProbabilityBand: AttributionSlice[];
  byPlayStatus: AttributionSlice[];
  byV4DataQuality: AttributionSlice[];
  byMarketContext: AttributionSlice[];
  byModelVersion: AttributionSlice[];
  uncertaintyPenalties: PenaltySummary[];
  firstInningResults: { nrfi: number; yrfi: number; totalRuns: number; averageRuns: number | null };
  notes: string[];
};

function summarize(label: string, rows: Row[]): AttributionSlice {
  const wins = rows.filter(row => row.recommendation === row.outcome).length;
  const probabilities = rows.map(row => Number(row.probability)).filter(Number.isFinite);
  return {
    label,
    sampleSize: rows.length,
    wins,
    losses: rows.length - wins,
    hitRate: rows.length ? wins / rows.length : null,
    averageProbability: probabilities.length ? probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length : null,
  };
}

function firstInningRuns(score: string | null): number | null {
  if (!score) return null;
  const match = score.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  const away = Number(match[1]);
  const home = Number(match[2]);
  return Number.isSafeInteger(away) && Number.isSafeInteger(home) ? away + home : null;
}

function contextString(row: Row, key: string): string | null {
  const value = row.context?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function v4Quality(row: Row): string | null {
  const value = row.context?.v4?.uncertainty?.label;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function v4Penalties(row: Row): string[] {
  const values = row.context?.v4?.uncertainty?.penalties;
  return Array.isArray(values) ? values.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
}

export async function getMlbPostgameAttribution(days = 30): Promise<MlbPostgameAttribution> {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const connection = db();
  const rows: Row[] = connection ? (await connection.query<Row>(`
    SELECT s.recommendation, s.probability, s.confidence, s.outcome,
           s.first_inning_score AS "firstInningScore", s.market_available AS "marketAvailable",
           s.value_play AS "valuePlay", s.model_version AS "modelVersion", c.context
      FROM mlb_prediction_snapshots s
      LEFT JOIN mlb_prediction_context c
        ON c.prediction_date=s.prediction_date AND c.game_id=s.game_id AND c.model_version=s.model_version
     WHERE s.prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
       AND s.locked_at IS NOT NULL
       AND s.recommendation IN ('NRFI','YRFI')
       AND s.outcome IN ('NRFI','YRFI')
     ORDER BY s.prediction_date DESC
  `, [safeDays])).rows : [];

  const bands: Array<[string, number, number]> = [
    ["50-53% borderline", 0.50, 0.53],
    ["53-56% lean", 0.53, 0.56],
    ["56-60% strong", 0.56, 0.60],
    ["60%+ high separation", 0.60, 1.001],
  ];
  const runValues = rows.map(row => firstInningRuns(row.firstInningScore)).filter((value): value is number => value !== null);
  const nrfiResults = rows.filter(row => row.outcome === "NRFI").length;
  const v4Rows = rows.filter(row => row.modelVersion === "v4-live");
  const contextRows = v4Rows.filter(row => row.context !== null);

  const penaltyMap = new Map<string, { appearances: number; wins: number }>();
  for (const row of contextRows) {
    for (const penalty of new Set(v4Penalties(row))) {
      const current = penaltyMap.get(penalty) ?? { appearances: 0, wins: 0 };
      current.appearances++;
      if (row.recommendation === row.outcome) current.wins++;
      penaltyMap.set(penalty, current);
    }
  }
  const uncertaintyPenalties = [...penaltyMap.entries()]
    .map(([penalty, value]) => ({ penalty, appearances: value.appearances, wins: value.wins, hitRate: value.appearances ? value.wins / value.appearances : null }))
    .sort((a, b) => b.appearances - a.appearances || a.penalty.localeCompare(b.penalty));

  return {
    generatedAt: new Date().toISOString(),
    windowDays: safeDays,
    graded: rows.length,
    contextCoverage: { eligibleV4: v4Rows.length, withContext: contextRows.length, coverage: v4Rows.length ? contextRows.length / v4Rows.length : null },
    overall: summarize("All verified predictions", rows),
    bySide: [summarize("NRFI", rows.filter(row => row.recommendation === "NRFI")), summarize("YRFI", rows.filter(row => row.recommendation === "YRFI"))],
    byConfidence: ["High", "Medium", "Low"].map(level => summarize(level, rows.filter(row => row.confidence === level))),
    byProbabilityBand: bands.map(([label, min, max]) => summarize(label, rows.filter(row => Number(row.probability) >= min && Number(row.probability) < max))),
    byPlayStatus: ["BEST_PLAY", "PLAY", "LEAN", "NO_PLAY"].map(status => summarize(status.replace("_", " "), contextRows.filter(row => contextString(row, "playStatus") === status))),
    byV4DataQuality: ["High", "Medium", "Low"].map(level => summarize(`${level} V4 data quality`, contextRows.filter(row => v4Quality(row) === level))),
    byMarketContext: [
      summarize("Verified value plays", rows.filter(row => row.marketAvailable && row.valuePlay)),
      summarize("Market priced, no qualifying value", rows.filter(row => row.marketAvailable && !row.valuePlay)),
      summarize("Model only / no verified price", rows.filter(row => !row.marketAvailable)),
    ],
    byModelVersion: Array.from(new Set(rows.map(row => row.modelVersion))).sort().map(version => summarize(version, rows.filter(row => row.modelVersion === version))),
    uncertaintyPenalties,
    firstInningResults: {
      nrfi: nrfiResults,
      yrfi: rows.length - nrfiResults,
      totalRuns: runValues.reduce((sum, value) => sum + value, 0),
      averageRuns: runValues.length ? runValues.reduce((sum, value) => sum + value, 0) / runValues.length : null,
    },
    notes: [
      "Attribution uses only locked, graded predictions; retrospective rows are excluded.",
      "Play-status and V4-quality slices use the immutable pregame decision context captured for new V4-live predictions.",
      "This report diagnoses where the model is strong or conservative. It does not change thresholds automatically.",
      "Older predictions without an immutable context are kept in overall performance but excluded from context-dependent slices rather than reconstructed with hindsight.",
    ],
  };
}
