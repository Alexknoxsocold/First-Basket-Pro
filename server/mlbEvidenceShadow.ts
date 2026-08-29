import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { fetchMlbLineups, type MlbLineupPlayer } from "./mlbLineupEnrichment.js";
import type { NrfiGame, NrfiResponse } from "./mlbNrfi.js";

neonConfig.webSocketConstructor = ws;

export type MlbEvidenceShadow = {
  lineupConfirmed: boolean;
  topOrderCount: number;
  topOrderObp: number | null;
  topOrderStrikeoutPct: number | null;
  topOrderWalkPct: number | null;
  weatherAvailable: boolean;
  temperatureF: number | null;
  wind: string | null;
  nrfiAdjustment: number;
  shadowNrfiProbability: number;
  capturedAt: string;
};

export type MlbEvidenceGame = NrfiGame & { evidenceShadow: MlbEvidenceShadow };
export type MlbEvidenceResponse = Omit<NrfiResponse, "games" | "topPick"> & {
  games: MlbEvidenceGame[];
  topPick: MlbEvidenceGame | null;
};

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;
function db(): Pool | null {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  const connection = db();
  if (!connection) return;
  schemaReady = connection.query(`
    CREATE TABLE IF NOT EXISTS mlb_evidence_shadow (
      id varchar(180) PRIMARY KEY,
      prediction_date text NOT NULL,
      game_id text NOT NULL,
      game_start_at timestamp NOT NULL,
      live_nrfi_probability real NOT NULL,
      shadow_nrfi_probability real NOT NULL,
      lineup_confirmed boolean NOT NULL DEFAULT false,
      top_order_count integer NOT NULL DEFAULT 0,
      top_order_obp real,
      top_order_strikeout_pct real,
      top_order_walk_pct real,
      weather_available boolean NOT NULL DEFAULT false,
      temperature_f real,
      wind text,
      captured_at timestamp NOT NULL DEFAULT now(),
      UNIQUE(prediction_date, game_id)
    );
    CREATE INDEX IF NOT EXISTS mlb_evidence_shadow_date_idx ON mlb_evidence_shadow(prediction_date DESC);
  `).then(() => undefined).catch(error => { schemaReady = null; throw error; });
  return schemaReady;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function topOrder(players: MlbLineupPlayer[]): MlbLineupPlayer[] {
  return [...players].sort((a, b) => a.battingOrder - b.battingOrder).slice(0, 3);
}

function evidenceAdjustment(players: MlbLineupPlayer[]): { adjustment: number; obp: number | null; strikeoutPct: number | null; walkPct: number | null; count: number } {
  const top = players.filter(player => player.battingOrder <= 3);
  const obp = average(top.flatMap(player => player.obp === null ? [] : [player.obp]));
  const strikeoutPct = average(top.flatMap(player => player.strikeoutPct === null ? [] : [player.strikeoutPct]));
  const walkPct = average(top.flatMap(player => player.walkPct === null ? [] : [player.walkPct]));
  let scoringPressure = 0;
  if (obp !== null) scoringPressure += (obp - 0.320) * 0.10;
  if (strikeoutPct !== null) scoringPressure += (0.220 - strikeoutPct) * 0.04;
  if (walkPct !== null) scoringPressure += (walkPct - 0.080) * 0.05;
  return { adjustment: -clamp(scoringPressure, -0.008, 0.008), obp, strikeoutPct, walkPct, count: top.length };
}

function weatherNrfiAdjustment(temperatureF: number | null, wind: string | null): number {
  let adjustment = 0;
  if (temperatureF !== null) {
    if (temperatureF >= 85) adjustment -= 0.0025;
    else if (temperatureF <= 55) adjustment += 0.0025;
  }
  const normalizedWind = (wind ?? "").toLowerCase();
  if (/\bout\b|out to/.test(normalizedWind)) adjustment -= 0.0015;
  if (/\bin\b|in from/.test(normalizedWind)) adjustment += 0.0015;
  return clamp(adjustment, -0.0035, 0.0035);
}

function americanFromDecimal(decimal: number): number | null {
  if (!Number.isFinite(decimal) || decimal <= 1) return null;
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

function playToPrice(modelProbability: number, targetEv = 0.02): number | null {
  const p = clamp(modelProbability, 0.01, 0.99);
  return americanFromDecimal((1 + targetEv) / p);
}

function formatAmerican(value: number | null): string {
  if (value === null) return "—";
  return value > 0 ? `+${value}` : `${value}`;
}

async function persistShadow(date: string, game: NrfiGame, shadow: MlbEvidenceShadow): Promise<void> {
  const connection = db();
  if (!connection) return;
  const start = new Date(game.gameStartAt || game.date);
  if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) return;
  await ensureSchema();
  const id = `${date}:${game.id}:evidence-shadow-v1`;
  await connection.query(`
    INSERT INTO mlb_evidence_shadow
      (id,prediction_date,game_id,game_start_at,live_nrfi_probability,shadow_nrfi_probability,
       lineup_confirmed,top_order_count,top_order_obp,top_order_strikeout_pct,top_order_walk_pct,
       weather_available,temperature_f,wind,captured_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
    ON CONFLICT(prediction_date,game_id) DO NOTHING
  `, [id, date, game.id, start, game.nrfiProbability / 100, shadow.shadowNrfiProbability / 100,
      shadow.lineupConfirmed, shadow.topOrderCount, shadow.topOrderObp, shadow.topOrderStrikeoutPct,
      shadow.topOrderWalkPct, shadow.weatherAvailable, shadow.temperatureF, shadow.wind]);
}

async function enrichGame(date: string, game: NrfiGame): Promise<MlbEvidenceGame> {
  const lineup = await fetchMlbLineups(date, game.away.abbreviation, game.home.abbreviation);
  const topPlayers = [...topOrder(lineup.away), ...topOrder(lineup.home)];
  const top = evidenceAdjustment(topPlayers);
  const weatherAdjustment = lineup.weather.available ? weatherNrfiAdjustment(lineup.weather.temperatureF, lineup.weather.wind) : 0;
  const adjustment = lineup.confirmed ? clamp(top.adjustment + weatherAdjustment, -0.010, 0.010) : 0;
  const shadowNrfiProbability = Math.round(clamp(game.nrfiProbability / 100 + adjustment, 0.35, 0.65) * 1000) / 10;
  const shadow: MlbEvidenceShadow = {
    lineupConfirmed: lineup.confirmed,
    topOrderCount: top.count,
    topOrderObp: top.obp,
    topOrderStrikeoutPct: top.strikeoutPct,
    topOrderWalkPct: top.walkPct,
    weatherAvailable: lineup.weather.available,
    temperatureF: lineup.weather.temperatureF,
    wind: lineup.weather.wind,
    nrfiAdjustment: Math.round(adjustment * 10000) / 100,
    shadowNrfiProbability,
    capturedAt: new Date().toISOString(),
  };

  const factors = [...(game.factors ?? [])];
  const gate = factors.find(factor => factor.startsWith("Decision gate:"));
  if (gate && !factors.some(factor => factor.startsWith("Why this call:"))) {
    factors.push(`Why this call: ${gate.replace(/^Decision gate:\s*/, "")}`);
  }
  if (lineup.confirmed) {
    const delta = shadowNrfiProbability - game.nrfiProbability;
    factors.push(`Confirmed top order: ${top.count}/6 hitters captured; research shadow moves NRFI ${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts. Live picks stay unchanged until this feature wins walk-forward validation.`);
  } else {
    factors.push("Top-order research: confirmed batting orders are not available yet, so the live model receives no lineup-derived boost.");
  }
  if (lineup.weather.available) {
    const temp = lineup.weather.temperatureF === null ? "temperature pending" : `${Math.round(lineup.weather.temperatureF)}°F`;
    factors.push(`Environment check: ${temp}${lineup.weather.wind ? ` · ${lineup.weather.wind}` : ""}. Weather is recorded for shadow evaluation before any future live promotion.`);
  }

  const sideProbability = game.recommendation === "NRFI" ? game.nrfiProbability / 100 : 1 - game.nrfiProbability / 100;
  const playTo = playToPrice(sideProbability, 0.02);
  if (playTo !== null) factors.push(`Price discipline: ${game.recommendation} is playable to ${formatAmerican(playTo)} for at least +2% model EV.`);

  void persistShadow(date, game, shadow).catch(error => console.warn("[MLB Evidence Shadow] Snapshot write failed:", error));
  return { ...game, factors, evidenceShadow: shadow };
}

export async function enrichMlbResponseWithEvidence(response: NrfiResponse): Promise<MlbEvidenceResponse> {
  const games = await Promise.all(response.games.map(game => enrichGame(response.date, game)));
  const topPick = response.topPick ? games.find(game => game.id === response.topPick?.id) ?? null : null;
  return { ...response, games, topPick };
}

export async function getMlbEvidenceShadowSummary(days = 30): Promise<{
  sampleSize: number;
  liveBrier: number | null;
  shadowBrier: number | null;
  brierDelta: number | null;
  lineupConfirmedRate: number | null;
  weatherCoverageRate: number | null;
  recommendation: "KEEP_SHADOW" | "PROMOTION_CANDIDATE";
}> {
  const connection = db();
  if (!connection) return { sampleSize: 0, liveBrier: null, shadowBrier: null, brierDelta: null, lineupConfirmedRate: null, weatherCoverageRate: null, recommendation: "KEEP_SHADOW" };
  await ensureSchema();
  const safeDays = Math.min(Math.max(Math.round(days), 7), 365);
  const result = await connection.query<{
    live: number;
    shadow: number;
    outcome: string;
    lineupConfirmed: boolean;
    weatherAvailable: boolean;
  }>(`
    SELECT e.live_nrfi_probability AS live,
           e.shadow_nrfi_probability AS shadow,
           s.outcome,
           e.lineup_confirmed AS "lineupConfirmed",
           e.weather_available AS "weatherAvailable"
      FROM mlb_evidence_shadow e
      JOIN mlb_prediction_snapshots s
        ON s.prediction_date=e.prediction_date AND s.game_id=e.game_id
     WHERE e.prediction_date >= to_char(current_date - ($1::int - 1), 'YYYY-MM-DD')
       AND s.model_version='v4-live'
       AND s.outcome IN ('NRFI','YRFI')
       AND s.locked_at IS NOT NULL
  `, [safeDays]);
  const rows = result.rows.map(row => ({ ...row, live: Number(row.live), shadow: Number(row.shadow) })).filter(row => Number.isFinite(row.live) && Number.isFinite(row.shadow));
  if (!rows.length) return { sampleSize: 0, liveBrier: null, shadowBrier: null, brierDelta: null, lineupConfirmedRate: null, weatherCoverageRate: null, recommendation: "KEEP_SHADOW" };
  const liveBrier = rows.reduce((sum, row) => sum + Math.pow(row.live - (row.outcome === "NRFI" ? 1 : 0), 2), 0) / rows.length;
  const shadowBrier = rows.reduce((sum, row) => sum + Math.pow(row.shadow - (row.outcome === "NRFI" ? 1 : 0), 2), 0) / rows.length;
  const lineupConfirmedRate = rows.filter(row => row.lineupConfirmed).length / rows.length;
  const weatherCoverageRate = rows.filter(row => row.weatherAvailable).length / rows.length;
  const brierDelta = shadowBrier - liveBrier;
  const recommendation = rows.length >= 100 && brierDelta <= -0.005 ? "PROMOTION_CANDIDATE" : "KEEP_SHADOW";
  return {
    sampleSize: rows.length,
    liveBrier: Math.round(liveBrier * 10000) / 10000,
    shadowBrier: Math.round(shadowBrier * 10000) / 10000,
    brierDelta: Math.round(brierDelta * 10000) / 10000,
    lineupConfirmedRate: Math.round(lineupConfirmedRate * 1000) / 1000,
    weatherCoverageRate: Math.round(weatherCoverageRate * 1000) / 1000,
    recommendation,
  };
}
