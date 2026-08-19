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
  outcome: "NRFI" | "YRFI";
};

export type PassedBand = {
  label: string;
  minProbability: number;
  maxProbability: number;
  sampleSize: number;
  correct: number;
  incorrect: number;
  hitRate: number | null;
  nrfi: { sampleSize: number; correct: number; hitRate: number | null };
  yrfi: { sampleSize: number; correct: number; hitRate: number | null };
};

export type MlbPassedDiagnostics = {
  generatedAt: string;
  windowDays: number;
  borderlinePassed: PassedBand;
  subPlayLeans: PassedBand;
  note: string;
};

function summarize(rows: Row[], label: string, min: number, max: number): PassedBand {
  const scoped = rows.filter(row => Number(row.probability) >= min && Number(row.probability) < max);
  const correct = scoped.filter(row => row.outcome === row.recommendation).length;
  const side = (name: "NRFI" | "YRFI") => {
    const sideRows = scoped.filter(row => row.recommendation === name);
    const sideCorrect = sideRows.filter(row => row.outcome === name).length;
    return {
      sampleSize: sideRows.length,
      correct: sideCorrect,
      hitRate: sideRows.length ? sideCorrect / sideRows.length : null,
    };
  };
  return {
    label,
    minProbability: min,
    maxProbability: max,
    sampleSize: scoped.length,
    correct,
    incorrect: scoped.length - correct,
    hitRate: scoped.length ? correct / scoped.length : null,
    nrfi: side("NRFI"),
    yrfi: side("YRFI"),
  };
}

/**
 * Measures whether conservative model directions were still correct after being
 * kept below normal promotion thresholds. This is diagnostic only: it never
 * changes thresholds or rewrites historical recommendations.
 */
export async function getMlbPassedDiagnostics(days = 30): Promise<MlbPassedDiagnostics> {
  const connection = db();
  const safeDays = Math.min(Math.max(Math.round(days), 1), 365);
  const emptyRows: Row[] = [];
  if (!connection) {
    return {
      generatedAt: new Date().toISOString(),
      windowDays: safeDays,
      borderlinePassed: summarize(emptyRows, "50-53% correct lean / passed", 0.50, 0.53),
      subPlayLeans: summarize(emptyRows, "53-56% lean zone", 0.53, 0.56),
      note: "No database connection; passed-play diagnostics are unavailable.",
    };
  }

  const result = await connection.query<Row>(`
    SELECT recommendation, probability, outcome
      FROM mlb_prediction_snapshots
     WHERE prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
       AND locked_at IS NOT NULL
       AND recommendation IN ('NRFI','YRFI')
       AND outcome IN ('NRFI','YRFI')
       AND probability >= 0.50
       AND probability < 0.56
  `, [safeDays]);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: safeDays,
    borderlinePassed: summarize(result.rows, "50-53% correct lean / passed", 0.50, 0.53),
    subPlayLeans: summarize(result.rows, "53-56% lean zone", 0.53, 0.56),
    note: "Diagnostic only. A strong hit rate here is evidence to study calibration and feature weighting; it does not automatically lower play thresholds.",
  };
}
