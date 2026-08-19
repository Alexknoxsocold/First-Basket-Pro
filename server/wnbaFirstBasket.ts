import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

const MODEL_VERSION = 'WNBA-FB-SEASONAL-V1';
const LOCK_WINDOW_MS = 2 * 60 * 60 * 1000;
const CACHE_TTL_MS = 2 * 60 * 1000;
let slateCache: { at: number; value: WnbaSlate } | null = null;

type Starter = { name: string; team: string };
type HistoryRow = { fbScored: number; gamesTracked: number };
export type WnbaCandidate = {
  name: string; team: string; position: string; headshot: string | null;
  avgPoints: number; avgFga: number; fgPct: number; avgMinutes: number;
  currentFirstBaskets: number; currentGamesTracked: number;
  previousFirstBaskets: number; previousGamesTracked: number;
  probability: number; rank: number;
};
export type WnbaGame = {
  id: string; date: string; shortName: string; awayTeam: string; homeTeam: string;
  awayName: string; homeName: string; status: string;
  lineupStatus: 'confirmed' | 'waiting'; starters: Starter[]; candidates: WnbaCandidate[];
  topPick: WnbaCandidate | null;
};
export type WnbaSlate = { season: number; updatedAt: string; teams: { abbreviation: string; name: string }[]; games: WnbaGame[]; source: string; modelVersion: string };

function normalizeName(value: string): string { return value.toLowerCase().replace(/[.'’\-]/g, '').replace(/\s+/g, ' ').trim(); }
function normalizeTeam(value: string): string { return value.toUpperCase().trim(); }
function currentSeason(date = new Date()): number { return date.getUTCFullYear(); }
function etDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find(p=>p.type==='year')?.value}${parts.find(p=>p.type==='month')?.value}${parts.find(p=>p.type==='day')?.value}`;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function ensureWnbaSchema(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wnba_fb_tracking (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), player_name text NOT NULL, team text NOT NULL,
      season integer NOT NULL, fb_scored integer NOT NULL DEFAULT 0, games_tracked integer NOT NULL DEFAULT 0,
      last_updated timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS wnba_fb_tracking_unique ON wnba_fb_tracking (lower(player_name), upper(team), season);
    CREATE INDEX IF NOT EXISTS wnba_fb_tracking_season_idx ON wnba_fb_tracking (season);
    CREATE TABLE IF NOT EXISTS wnba_processed_games (
      espn_game_id text PRIMARY KEY, game_date date, first_scorer text, first_scorer_team text,
      processed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS wnba_prediction_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), espn_game_id text NOT NULL, season integer NOT NULL,
      game_start_at timestamptz NOT NULL, locked_at timestamptz NOT NULL, model_version text NOT NULL,
      player_name text NOT NULL, team text NOT NULL, model_probability numeric(5,2) NOT NULL,
      model_rank integer NOT NULL, is_top_pick boolean NOT NULL DEFAULT false,
      actual_first_scorer text, actual_first_scorer_team text, won boolean, graded_at timestamptz,
      CONSTRAINT wnba_fb_probability_check CHECK (model_probability >= 0 AND model_probability <= 100)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS wnba_prediction_game_player_unique ON wnba_prediction_ledger (espn_game_id, lower(player_name), upper(team));
    CREATE INDEX IF NOT EXISTS wnba_prediction_locked_idx ON wnba_prediction_ledger (locked_at DESC);
  `);
}

async function getHistory(season: number): Promise<Map<string, HistoryRow>> {
  const out = new Map<string, HistoryRow>();
  if (!pool) return out;
  await ensureWnbaSchema();
  const result = await pool.query(`SELECT player_name, team, fb_scored, games_tracked FROM wnba_fb_tracking WHERE season=$1`, [season]);
  for (const row of result.rows) out.set(`${normalizeName(row.player_name)}|${normalizeTeam(row.team)}`, { fbScored: Number(row.fb_scored), gamesTracked: Number(row.games_tracked) });
  return out;
}

async function fetchTeams(): Promise<{ abbreviation: string; name: string }[]> {
  const data = await fetchJson('https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams?limit=50');
  return (data?.sports?.[0]?.leagues?.[0]?.teams || []).map((entry: any) => ({
    abbreviation: String(entry?.team?.abbreviation || '').toUpperCase(), name: String(entry?.team?.displayName || '')
  })).filter((t: any) => t.abbreviation && t.name);
}

async function fetchScoreboard(date = etDate()): Promise<any[]> {
  const data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${date}`);
  return data?.events || [];
}

async function fetchSummary(gameId: string): Promise<any | null> {
  return fetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=${gameId}`);
}

function extractStarters(summary: any): Starter[] {
  const out: Starter[] = [];
  for (const block of summary?.boxscore?.players || []) {
    const team = normalizeTeam(String(block?.team?.abbreviation || ''));
    for (const group of block?.statistics || []) {
      for (const row of group?.athletes || []) {
        if (row?.starter !== true || row?.didNotPlay === true) continue;
        const name = String(row?.athlete?.displayName || '').trim();
        if (name && team) out.push({ name, team });
      }
    }
  }
  return [...new Map(out.map(s => [`${normalizeName(s.name)}|${s.team}`, s])).values()];
}

function firstMadeFieldGoal(summary: any, starters: Starter[]): Starter | null {
  for (const play of summary?.plays || []) {
    const text = String(play?.text || '');
    if (play?.scoringPlay !== true || !text.toLowerCase().includes(' makes ') || text.toLowerCase().includes('free throw')) continue;
    const value = Number(play?.scoreValue ?? 0);
    if (value !== 2 && value !== 3 && !/(layup|dunk|jumper|shot)/i.test(text)) continue;
    const participant = (play?.participants || []).find((p: any) => p?.type !== 'assist' && p?.type !== 'block') || play?.participants?.[0];
    let name = String(participant?.athlete?.displayName || play?.athlete?.displayName || '').trim();
    if (!name) { const idx = text.indexOf(' makes '); if (idx > 0) name = text.slice(0, idx).trim(); }
    let team = normalizeTeam(String(play?.team?.abbreviation || ''));
    if (!team) team = starters.find(s => normalizeName(s.name) === normalizeName(name))?.team || '';
    if (name && team) return { name, team };
  }
  return null;
}

async function fetchRoster(team: string): Promise<any[]> {
  const data = await fetchJson(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${team}/roster`);
  return data?.athletes || [];
}

async function fetchPlayerStats(espnId: string, season: number): Promise<any | null> {
  const data = await fetchJson(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/${season}/types/2/athletes/${espnId}/statistics/0`);
  const categories = data?.splits?.categories;
  if (!categories) return null;
  const stat = (cat: string, name: string) => {
    const c = categories.find((x: any) => x.name === cat);
    const s = c?.stats?.find((x: any) => x.name === name);
    return Number.parseFloat(String(s?.value ?? s?.displayValue ?? '0').replace(/[^0-9.-]/g, '')) || 0;
  };
  return { games: stat('general','gamesPlayed'), points: stat('offensive','avgPoints'), fga: stat('offensive','avgFieldGoalsAttempted'), fg: stat('offensive','fieldGoalPct'), minutes: stat('general','avgMinutes') };
}

function opportunityProbability(stats: any, position: string): number {
  if (!stats) return 4;
  const fgaShare = stats.fga / 75;
  let score = fgaShare * 38 + (stats.points / 35) * 8 + ((stats.fg - 42) / 30) * 4 + (Math.min(stats.minutes, 36) / 36) * 3;
  if (position === 'C') score *= 1.10; else if (position === 'PG') score *= 1.04;
  return Math.max(2, Math.min(32, score));
}

function blend(model: number, previous: HistoryRow | undefined, current: HistoryRow | undefined): number {
  let numerator = model * 10; let denominator = 10;
  if (previous?.gamesTracked) { const n = Math.min(previous.gamesTracked, 16); numerator += (previous.fbScored / previous.gamesTracked * 100) * n; denominator += n; }
  if (current?.gamesTracked) { numerator += (current.fbScored / current.gamesTracked * 100) * current.gamesTracked; denominator += current.gamesTracked; }
  return Math.round(Math.max(1, Math.min(35, numerator / denominator)) * 10) / 10;
}

async function modelStarters(starters: Starter[], season: number): Promise<WnbaCandidate[]> {
  if (starters.length !== 10) return [];
  const [current, previous] = await Promise.all([getHistory(season), getHistory(season - 1)]);
  const teams = [...new Set(starters.map(s => s.team))];
  const rosters = new Map<string, any[]>();
  await Promise.all(teams.map(async t => rosters.set(t, await fetchRoster(t))));
  const result: WnbaCandidate[] = [];
  for (const starter of starters) {
    const roster = rosters.get(starter.team) || [];
    const norm = normalizeName(starter.name);
    let player = roster.find((p: any) => normalizeName(String(p?.displayName || '')) === norm);
    if (!player) {
      const last = norm.split(' ').at(-1);
      player = roster.find((p: any) => normalizeName(String(p?.displayName || '')).split(' ').at(-1) === last);
    }
    if (!player?.id) continue;
    const stats = await fetchPlayerStats(String(player.id), season);
    const position = String(player?.position?.abbreviation || 'G');
    const key = `${norm}|${starter.team}`;
    const cur = current.get(key); const prev = previous.get(key);
    result.push({
      name: starter.name, team: starter.team, position, headshot: player?.headshot?.href || null,
      avgPoints: Math.round((stats?.points || 0) * 10) / 10, avgFga: Math.round((stats?.fga || 0) * 10) / 10,
      fgPct: Math.round((stats?.fg || 0) * 10) / 10, avgMinutes: Math.round((stats?.minutes || 0) * 10) / 10,
      currentFirstBaskets: cur?.fbScored || 0, currentGamesTracked: cur?.gamesTracked || 0,
      previousFirstBaskets: prev?.fbScored || 0, previousGamesTracked: prev?.gamesTracked || 0,
      probability: blend(opportunityProbability(stats, position), prev, cur), rank: 0,
    });
  }
  result.sort((a,b) => b.probability - a.probability).forEach((p,i) => p.rank = i + 1);
  return result;
}

function eventTeams(event: any) {
  const comp = event?.competitions?.[0];
  const away = comp?.competitors?.find((c: any) => c.homeAway === 'away');
  const home = comp?.competitors?.find((c: any) => c.homeAway === 'home');
  return { away, home };
}

export async function getWnbaSlate(force = false): Promise<WnbaSlate> {
  if (!force && slateCache && Date.now() - slateCache.at < CACHE_TTL_MS) return slateCache.value;
  await ensureWnbaSchema();
  const season = currentSeason();
  const [teams, events] = await Promise.all([fetchTeams(), fetchScoreboard()]);
  const games: WnbaGame[] = [];
  for (const event of events) {
    const { away, home } = eventTeams(event); if (!away || !home) continue;
    const summary = await fetchSummary(String(event.id));
    const starters = summary ? extractStarters(summary) : [];
    const candidates = starters.length === 10 ? await modelStarters(starters, season) : [];
    games.push({ id: String(event.id), date: event.date, shortName: event.shortName || `${away.team.abbreviation} @ ${home.team.abbreviation}`,
      awayTeam: normalizeTeam(away.team.abbreviation), homeTeam: normalizeTeam(home.team.abbreviation), awayName: away.team.displayName, homeName: home.team.displayName,
      status: event?.status?.type?.description || event?.status?.type?.state || 'Scheduled', lineupStatus: starters.length === 10 ? 'confirmed' : 'waiting',
      starters, candidates, topPick: candidates[0] || null });
  }
  const value = { season, updatedAt: new Date().toISOString(), teams, games, source: 'ESPN WNBA schedule/roster/boxscore/play-by-play + verified PreziBaskets history', modelVersion: MODEL_VERSION };
  slateCache = { at: Date.now(), value };
  return value;
}

async function recordVerifiedGame(gameId: string, gameDate: string, starters: Starter[], scorer: Starter, season: number): Promise<void> {
  if (!pool || starters.length !== 10) return;
  await ensureWnbaSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT 1 FROM wnba_processed_games WHERE espn_game_id=$1', [gameId]);
    if (exists.rows.length) { await client.query('ROLLBACK'); return; }
    for (const starter of starters) {
      const won = normalizeName(starter.name) === normalizeName(scorer.name) && normalizeTeam(starter.team) === normalizeTeam(scorer.team);
      await client.query(`INSERT INTO wnba_fb_tracking (player_name,team,season,fb_scored,games_tracked,last_updated)
        VALUES ($1,$2,$3,$4,1,now()) ON CONFLICT (lower(player_name),upper(team),season)
        DO UPDATE SET fb_scored=wnba_fb_tracking.fb_scored + EXCLUDED.fb_scored, games_tracked=wnba_fb_tracking.games_tracked+1, last_updated=now()`,
        [starter.name, starter.team, season, won ? 1 : 0]);
    }
    await client.query('INSERT INTO wnba_processed_games (espn_game_id,game_date,first_scorer,first_scorer_team) VALUES ($1,$2,$3,$4)', [gameId, gameDate, scorer.name, scorer.team]);
    await client.query(`UPDATE wnba_prediction_ledger SET actual_first_scorer=$2, actual_first_scorer_team=$3,
      won=(lower(player_name)=lower($2) AND upper(team)=upper($3)), graded_at=now() WHERE espn_game_id=$1 AND graded_at IS NULL`, [gameId, scorer.name, scorer.team]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  slateCache = null;
}

export async function runWnbaTracker(): Promise<{ processed: number; unresolved: number }> {
  await ensureWnbaSchema();
  let processed = 0, unresolved = 0;
  for (const offset of [0,-1]) {
    const events = await fetchScoreboard(etDate(new Date(Date.now() + offset * 86400000)));
    for (const event of events.filter((e:any) => e?.status?.type?.completed === true)) {
      if (pool) { const done = await pool.query('SELECT 1 FROM wnba_processed_games WHERE espn_game_id=$1', [String(event.id)]); if (done.rows.length) continue; }
      const summary = await fetchSummary(String(event.id)); const starters = summary ? extractStarters(summary) : [];
      const scorer = summary ? firstMadeFieldGoal(summary, starters) : null;
      if (starters.length !== 10 || !scorer) { unresolved++; continue; }
      await recordVerifiedGame(String(event.id), String(event.date).slice(0,10), starters, scorer, currentSeason(new Date(event.date))); processed++;
    }
  }
  return { processed, unresolved };
}

export async function lockWnbaPredictions(): Promise<{ eligible: number; locked: number; waiting: number }> {
  if (!pool) return { eligible:0, locked:0, waiting:0 };
  await ensureWnbaSchema();
  const now = Date.now(); const events = await fetchScoreboard();
  let eligible=0, locked=0, waiting=0;
  for (const event of events) {
    const start = new Date(event.date).getTime();
    if (!Number.isFinite(start) || start <= now || start-now > LOCK_WINDOW_MS) continue;
    eligible++;
    const exists = await pool.query('SELECT 1 FROM wnba_prediction_ledger WHERE espn_game_id=$1 LIMIT 1', [String(event.id)]); if (exists.rows.length) continue;
    const summary = await fetchSummary(String(event.id)); const starters = summary ? extractStarters(summary) : [];
    if (starters.length !== 10) { waiting++; continue; }
    const candidates = await modelStarters(starters, currentSeason(new Date(event.date)));
    if (candidates.length !== 10) { waiting++; continue; }
    for (const c of candidates) await pool.query(`INSERT INTO wnba_prediction_ledger (espn_game_id,season,game_start_at,locked_at,model_version,player_name,team,model_probability,model_rank,is_top_pick)
      VALUES ($1,$2,$3,now(),$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`, [String(event.id), currentSeason(new Date(event.date)), event.date, MODEL_VERSION, c.name, c.team, c.probability, c.rank, c.rank===1]);
    locked++;
  }
  return { eligible, locked, waiting };
}

export async function getWnbaDiagnostics(days=30): Promise<any> {
  if (!pool) return { modelVersion: MODEL_VERSION, trackedPlayers:0, processedGames:0, lockedGames:0, gradedGames:0, topPickWins:0, topPickAccuracy:null };
  await ensureWnbaSchema();
  const result = await pool.query(`SELECT
    (SELECT count(*) FROM wnba_fb_tracking WHERE season=$1) tracked_players,
    (SELECT count(*) FROM wnba_processed_games) processed_games,
    (SELECT count(DISTINCT espn_game_id) FROM wnba_prediction_ledger WHERE locked_at >= now()-($2::text||' days')::interval) locked_games,
    (SELECT count(DISTINCT espn_game_id) FROM wnba_prediction_ledger WHERE graded_at IS NOT NULL AND locked_at >= now()-($2::text||' days')::interval) graded_games,
    (SELECT count(*) FROM wnba_prediction_ledger WHERE is_top_pick AND won=true AND locked_at >= now()-($2::text||' days')::interval) top_wins,
    (SELECT count(*) FROM wnba_prediction_ledger WHERE is_top_pick AND graded_at IS NOT NULL AND locked_at >= now()-($2::text||' days')::interval) top_graded`, [currentSeason(), Math.max(1,Math.min(days,365))]);
  const r=result.rows[0]||{}; const graded=Number(r.top_graded||0), wins=Number(r.top_wins||0);
  return { modelVersion: MODEL_VERSION, trackedPlayers:Number(r.tracked_players||0), processedGames:Number(r.processed_games||0), lockedGames:Number(r.locked_games||0), gradedGames:Number(r.graded_games||0), topPickWins:wins, topPickAccuracy:graded?Math.round(wins/graded*1000)/10:null };
}
