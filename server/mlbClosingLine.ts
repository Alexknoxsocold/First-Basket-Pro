import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { fetchMlbRfiMarkets, valueFromMarketForTeams } from "./mlbOdds.js";

neonConfig.webSocketConstructor = ws;

let pool: Pool | null = null;
let ready: Promise<void> | null = null;
function db(): Pool | null { if (!process.env.DATABASE_URL) return null; if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL }); return pool; }
async function ensure(): Promise<void> {
  if (ready) return ready; const c = db(); if (!c) return;
  ready = c.query(`
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS closing_sportsbook text;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS closing_odds integer;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS closing_captured_at timestamp;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS closing_no_vig_probability real;
    ALTER TABLE mlb_prediction_snapshots ADD COLUMN IF NOT EXISTS closing_edge real;
    CREATE INDEX IF NOT EXISTS mlb_prediction_snapshots_closing_idx ON mlb_prediction_snapshots(game_start_at DESC, closing_captured_at DESC);
  `).then(() => undefined).catch(e => { ready = null; throw e; }); return ready;
}
function parseMatchup(v: string): { away: string; home: string } | null { const p = v.split(/\s+@\s+/); return p.length === 2 && p[0].trim() && p[1].trim() ? { away: p[0].trim(), home: p[1].trim() } : null; }
function decimal(odds: number): number { return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds); }
function implied(odds: number): number { return 1 / decimal(odds); }

/** Capture the latest verified NRFI/YRFI quote for games approaching first pitch. */
export async function captureMlbClosingLines(windowMinutes = 20): Promise<{ checked: number; captured: number }> {
  const c = db(); if (!c) return { checked: 0, captured: 0 }; await ensure();
  const window = Math.min(Math.max(Math.round(windowMinutes), 1), 120);
  const rows = await c.query<{ id: string; matchup: string; recommendation: "NRFI" | "YRFI"; probability: number; game_start_at: Date }>(
    `SELECT id,matchup,recommendation,probability,game_start_at FROM mlb_prediction_snapshots WHERE locked_at IS NOT NULL AND recommendation IN ('NRFI','YRFI') AND closing_captured_at IS NULL AND game_start_at BETWEEN now() AND now() + ($1::int * interval '1 minute')`, [window]);
  if (!rows.rows.length) return { checked: 0, captured: 0 };
  const markets = await fetchMlbRfiMarkets(); let captured = 0;
  for (const row of rows.rows) {
    const teams = parseMatchup(row.matchup); if (!teams) continue;
    const market = valueFromMarketForTeams(markets, teams.away, teams.home, row.recommendation, Number(row.probability));
    if (!market || market.price === null || !market.updatedAt) continue;
    const at = new Date(market.updatedAt); if (!Number.isFinite(at.getTime()) || at.getTime() > row.game_start_at.getTime()) continue;
    await c.query(`UPDATE mlb_prediction_snapshots SET closing_sportsbook=$2,closing_odds=$3,closing_captured_at=$4,closing_no_vig_probability=$5,closing_edge=$6 WHERE id=$1 AND closing_captured_at IS NULL`, [row.id,market.book,market.price,at,market.noVigProbability,Number(row.probability) - (market.noVigProbability ?? implied(market.price))]);
    captured++;
  }
  return { checked: rows.rows.length, captured };
}

export type MlbClosingLineSummary = { eligible: number; captured: number; averageClvProbability: number | null; beatClosingLineRate: number | null; averageOpeningToClosingOdds: number | null };
/** CLV is measured in implied-probability movement: positive means the locked price was better than the captured close. */
export async function getMlbClosingLineSummary(days = 30): Promise<MlbClosingLineSummary> {
  const c = db(); if (!c) return { eligible: 0, captured: 0, averageClvProbability: null, beatClosingLineRate: null, averageOpeningToClosingOdds: null }; await ensure();
  const d = Math.min(Math.max(Math.round(days), 1), 365);
  const r = await c.query<{ eligible: string; captured: string; avg_clv: number | null; beat_rate: number | null; avg_odds_move: number | null }>(`SELECT COUNT(*) FILTER (WHERE market_odds IS NOT NULL)::text eligible, COUNT(*) FILTER (WHERE market_odds IS NOT NULL AND closing_odds IS NOT NULL)::text captured, AVG((1/(CASE WHEN closing_odds > 0 THEN 1+closing_odds/100.0 ELSE 1+100.0/ABS(closing_odds) END))-(1/(CASE WHEN market_odds > 0 THEN 1+market_odds/100.0 ELSE 1+100.0/ABS(market_odds) END))) avg_clv, AVG(CASE WHEN (1/(CASE WHEN closing_odds > 0 THEN 1+closing_odds/100.0 ELSE 1+100.0/ABS(closing_odds) END))>(1/(CASE WHEN market_odds > 0 THEN 1+market_odds/100.0 ELSE 1+100.0/ABS(market_odds) END)) THEN 1.0 ELSE 0.0 END) beat_rate, AVG(closing_odds-market_odds) avg_odds_move FROM mlb_prediction_snapshots WHERE prediction_date >= to_char(current_date-($1::int-1),'YYYY-MM-DD')`, [d]);
  const x = r.rows[0]; return { eligible: Number(x?.eligible ?? 0), captured: Number(x?.captured ?? 0), averageClvProbability: x?.avg_clv ?? null, beatClosingLineRate: x?.beat_rate ?? null, averageOpeningToClosingOdds: x?.avg_odds_move ?? null };
}
