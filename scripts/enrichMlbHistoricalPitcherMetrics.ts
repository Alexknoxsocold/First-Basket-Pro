import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.MLB_RESEARCH_DATABASE_URL;
if (!connectionString) throw new Error("Missing MLB_RESEARCH_DATABASE_URL");
if (process.env.DATABASE_URL && process.env.DATABASE_URL === connectionString) {
  throw new Error("Research database must be separate from production DATABASE_URL");
}

const pool = new Pool({ connectionString });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const n = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function inningsToOuts(value: unknown): number {
  const text = String(value ?? "0");
  const [whole, partial = "0"] = text.split(".");
  const innings = Number(whole) || 0;
  const outs = Number(partial) || 0;
  return innings * 3 + Math.min(Math.max(outs, 0), 2);
}

type TargetGame = {
  gameId: string;
  gameDate: string;
  pitcherId: string;
  side: "away" | "home";
};

type PitchingLog = {
  date: string;
  outs: number;
  hits: number;
  walks: number;
  strikeouts: number;
  earnedRuns: number;
  battersFaced: number;
};

async function fetchJson(url: string, attempt = 1): Promise<any> {
  const response = await fetch(url, { headers: { "user-agent": "First-Basket-Pro-Research/1.0" } });
  if (response.ok) return response.json();
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    await sleep(500 * attempt * attempt);
    return fetchJson(url, attempt + 1);
  }
  throw new Error(`MLB Stats API ${response.status}: ${url}`);
}

async function fetchPitcherSeasonLogs(pitcherId: string, season: number): Promise<PitchingLog[]> {
  const url = `https://statsapi.mlb.com/api/v1/people/${encodeURIComponent(pitcherId)}/stats?stats=gameLog&group=pitching&season=${season}`;
  const json = await fetchJson(url);
  const splits = Array.isArray(json?.stats?.[0]?.splits) ? json.stats[0].splits : [];
  return splits.map((split: any) => ({
    date: String(split?.date ?? ""),
    outs: inningsToOuts(split?.stat?.inningsPitched),
    hits: n(split?.stat?.hits),
    walks: n(split?.stat?.baseOnBalls),
    strikeouts: n(split?.stat?.strikeOuts),
    earnedRuns: n(split?.stat?.earnedRuns),
    battersFaced: n(split?.stat?.battersFaced),
  })).filter((row: PitchingLog) => /^\d{4}-\d{2}-\d{2}$/.test(row.date));
}

function priorMetrics(logs: PitchingLog[], beforeDate: string) {
  let outs = 0;
  let hits = 0;
  let walks = 0;
  let strikeouts = 0;
  let earnedRuns = 0;
  let battersFaced = 0;
  let appearances = 0;

  for (const row of logs) {
    if (row.date >= beforeDate) continue;
    outs += row.outs;
    hits += row.hits;
    walks += row.walks;
    strikeouts += row.strikeouts;
    earnedRuns += row.earnedRuns;
    battersFaced += row.battersFaced;
    appearances += 1;
  }

  const innings = outs / 3;
  return {
    appearances,
    innings,
    era: innings > 0 ? earnedRuns * 9 / innings : null,
    whip: innings > 0 ? (walks + hits) / innings : null,
    strikeoutPct: battersFaced > 0 ? strikeouts / battersFaced : null,
    walkPct: battersFaced > 0 ? walks / battersFaced : null,
  };
}

async function main() {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS mlb_research;
    CREATE TABLE IF NOT EXISTS mlb_research.historical_pitcher_metrics (
      game_id text NOT NULL,
      game_date date NOT NULL,
      side text NOT NULL CHECK (side IN ('away','home')),
      pitcher_id text NOT NULL,
      prior_appearances integer NOT NULL,
      prior_innings numeric,
      era numeric,
      whip numeric,
      strikeout_pct numeric,
      walk_pct numeric,
      first_inning_runs_allowed_rate numeric,
      source text NOT NULL,
      imported_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (game_id, side)
    );
    CREATE INDEX IF NOT EXISTS historical_pitcher_metrics_pitcher_idx
      ON mlb_research.historical_pitcher_metrics(pitcher_id, game_date);
  `);

  const result = await pool.query<{
    game_id: string;
    game_date: string;
    away_pitcher_id: string | null;
    home_pitcher_id: string | null;
  }>(`
    SELECT game_id, game_date::text, away_pitcher_id, home_pitcher_id
      FROM mlb_research.historical_pitchers
     ORDER BY game_date, game_id
  `);

  const targets: TargetGame[] = [];
  for (const row of result.rows) {
    if (row.away_pitcher_id) targets.push({ gameId: row.game_id, gameDate: row.game_date, pitcherId: row.away_pitcher_id, side: "away" });
    if (row.home_pitcher_id) targets.push({ gameId: row.game_id, gameDate: row.game_date, pitcherId: row.home_pitcher_id, side: "home" });
  }

  const byPitcherSeason = new Map<string, TargetGame[]>();
  for (const target of targets) {
    const season = Number(target.gameDate.slice(0, 4));
    const key = `${target.pitcherId}:${season}`;
    const bucket = byPitcherSeason.get(key) ?? [];
    bucket.push(target);
    byPitcherSeason.set(key, bucket);
  }

  const entries = [...byPitcherSeason.entries()];
  let cursor = 0;
  let written = 0;
  let failed = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= entries.length) return;
      const [key, games] = entries[index];
      const [pitcherId, seasonText] = key.split(":");
      const season = Number(seasonText);
      try {
        const logs = await fetchPitcherSeasonLogs(pitcherId, season);
        for (const game of games) {
          const metrics = priorMetrics(logs, game.gameDate);
          const fi = await pool.query<{ rate: string | null }>(`
            WITH starts AS (
              SELECT g.game_date,
                     CASE
                       WHEN p.away_pitcher_id = $1 THEN g.home_first_runs
                       WHEN p.home_pitcher_id = $1 THEN g.away_first_runs
                     END AS first_inning_runs_allowed
                FROM mlb_research.historical_games g
                JOIN mlb_research.historical_pitchers p USING(game_id)
               WHERE g.game_date < $2::date
                 AND (p.away_pitcher_id = $1 OR p.home_pitcher_id = $1)
            )
            SELECT AVG((first_inning_runs_allowed > 0)::int)::text AS rate FROM starts
          `, [game.pitcherId, game.gameDate]);
          const firstInningRate = fi.rows[0]?.rate == null ? null : Number(fi.rows[0].rate);

          await pool.query(`
            INSERT INTO mlb_research.historical_pitcher_metrics(
              game_id,game_date,side,pitcher_id,prior_appearances,prior_innings,
              era,whip,strikeout_pct,walk_pct,first_inning_runs_allowed_rate,source
            ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT(game_id,side) DO UPDATE SET
              pitcher_id=EXCLUDED.pitcher_id,
              prior_appearances=EXCLUDED.prior_appearances,
              prior_innings=EXCLUDED.prior_innings,
              era=EXCLUDED.era,
              whip=EXCLUDED.whip,
              strikeout_pct=EXCLUDED.strikeout_pct,
              walk_pct=EXCLUDED.walk_pct,
              first_inning_runs_allowed_rate=EXCLUDED.first_inning_runs_allowed_rate,
              source=EXCLUDED.source,
              imported_at=now()
          `, [
            game.gameId, game.gameDate, game.side, game.pitcherId,
            metrics.appearances, metrics.innings, metrics.era, metrics.whip,
            metrics.strikeoutPct, metrics.walkPct, firstInningRate,
            "MLB Stats API gameLog, prior-to-game only",
          ]);
          written += 1;
        }
      } catch (error) {
        failed += games.length;
        console.warn(`[Pitcher metrics] ${pitcherId} ${season} failed:`, error);
      }
      if ((index + 1) % 50 === 0) console.log(`[Pitcher metrics] processed ${index + 1}/${entries.length} pitcher-seasons; rows=${written}; failed=${failed}`);
      await sleep(80);
    }
  }

  await Promise.all(Array.from({ length: 6 }, () => worker()));
  console.log(`[Pitcher metrics] complete. pitcher-seasons=${entries.length}, rows=${written}, failed=${failed}`);
  await pool.end();
}

main().catch(async error => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
