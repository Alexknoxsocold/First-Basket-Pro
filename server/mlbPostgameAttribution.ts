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
};

export type AttributionSlice = {
  label: string;
  sampleSize: number;
  wins: number;
  losses: number;
  hitRate: number | null;
  averageProbability: number | null;
};

export type MlbPostgameAttribution = {
  generatedAt: string;
  windowDays: number;
  graded: number;
  overall: AttributionSlice;
  bySide: AttributionSlice[];
  byConfidence: AttributionSlice[];
  byProbabilityBand: AttributionSlice[];
  byMarketContext: AttributionSlice[];
  byModelVersion: AttributionSlice[];
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

export async function getMlbPostgameAttribution(days = 30): Promise<MlbPostgameAttribution> {
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const connection = db();
  const rows: Row[] = connection ? (await connection.query<Row>(`
    SELECT recommendation, probability, confidence, outcome,
           first_inning_score AS "firstInningScore", market_available AS "marketAvailable",
           value_play AS "valuePlay", model_version AS "modelVersion"
      FROM mlb_prediction_snapshots
     WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
       AND locked_at IS NOT NULL
       AND recommendation IN ('NRFI','YRFI')
       AND outcome IN ('NRFI','YRFI')
     ORDER BY prediction_date DESC
  `, [safeDays])).rows : [];

  const bands: Array<[string, number, number]> = [
    ["50-53% borderline", 0.50, 0.53],
    ["53-56% lean", 0.53, 0.56],
    ["56-60% strong", 0.56, 0.60],
    ["60%+ high separation", 0.60, 1.001],
  ];
  const runValues = rows.map(row => firstInningRuns(row.firstInningScore)).filter((value): value is number => value !== null);
  const nrfiResults = rows.filter(row => row.outcome === "NRFI").length;

  return {
    generatedAt: new Date().toISOString(),
    windowDays: safeDays,
    graded: rows.length,
    overall: summarize("All verified predictions", rows),
    bySide: [summarize("NRFI", rows.filter(row => row.recommendation === "NRFI")), summarize("YRFI", rows.filter(row => row.recommendation === "YRFI"))],
    byConfidence: ["High", "Medium", "Low"].map(level => summarize(level, rows.filter(row => row.confidence === level))),
    byProbabilityBand: bands.map(([label, min, max]) => summarize(label, rows.filter(row => Number(row.probability) >= min && Number(row.probability) < max))),
    byMarketContext: [
      summarize("Verified value plays", rows.filter(row => row.marketAvailable && row.valuePlay)),
      summarize("Market priced, no qualifying value", rows.filter(row => row.marketAvailable && !row.valuePlay)),
      summarize("Model only / no verified price", rows.filter(row => !row.marketAvailable)),
    ],
    byModelVersion: Array.from(new Set(rows.map(row => row.modelVersion))).sort().map(version => summarize(version, rows.filter(row => row.modelVersion === version))),
    firstInningResults: {
      nrfi: nrfiResults,
      yrfi: rows.length - nrfiResults,
      totalRuns: runValues.reduce((sum, value) => sum + value, 0),
      averageRuns: runValues.length ? runValues.reduce((sum, value) => sum + value, 0) / runValues.length : null,
    },
    notes: [
      "Attribution uses only locked, graded predictions; retrospective rows are excluded.",
      "This report diagnoses where the model is strong or conservative. It does not change thresholds automatically.",
      "Pitcher, lineup and weather factor-level attribution requires those factor values to be persisted at lock time; current historical rows do not contain that full feature vector.",
    ],
  };
}
