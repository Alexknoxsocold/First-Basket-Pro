import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { getWnbaSlate, type WnbaCandidate, type WnbaGame, type WnbaSlate } from './wnbaFirstBasket';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

function etDateISO(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
}

function currentSeason(date = new Date()): number {
  return Number(etDateISO(date).slice(0, 4));
}

async function ensureSnapshotSchema(): Promise<void> {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wnba_slate_snapshots (
      slate_date date PRIMARY KEY,
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function saveSnapshot(slate: WnbaSlate): Promise<void> {
  if (!pool || !slate.games.length) return;
  await ensureSnapshotSchema();
  await pool.query(
    `INSERT INTO wnba_slate_snapshots(slate_date,payload,updated_at)
     VALUES($1,$2::jsonb,now())
     ON CONFLICT(slate_date) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()`,
    [etDateISO(), JSON.stringify(slate)],
  );
}

async function loadSnapshot(): Promise<WnbaSlate | null> {
  if (!pool) return null;
  await ensureSnapshotSchema();
  const result = await pool.query(
    'SELECT payload FROM wnba_slate_snapshots WHERE slate_date=$1 LIMIT 1',
    [etDateISO()],
  );
  if (!result.rows.length) return null;
  const payload = result.rows[0].payload as WnbaSlate;
  if (!payload || !Array.isArray(payload.games) || !payload.games.length) return null;
  return { ...payload, source: `${payload.source} + persistent last-good-slate fallback` };
}

function emptyTipSignal() {
  return {
    awayJumper: null, homeJumper: null,
    awayTipWins: 0, awayTipEvents: 0, awayTipPct: null,
    homeTipWins: 0, homeTipEvents: 0, homeTipPct: null,
    projectedFirstPossessionTeam: null, confidence: 'insufficient' as const,
  };
}

function ledgerCandidate(row: any, rank: number): WnbaCandidate {
  return {
    name: String(row.player_name || 'Player'),
    team: String(row.team || '').toUpperCase(),
    position: '', headshot: null,
    seasonStarts: 0, avgPoints: 0, avgFga: 0, fgPct: 0, avgMinutes: 0,
    currentFirstBaskets: 0, currentGamesTracked: 0,
    previousFirstBaskets: 0, previousGamesTracked: 0,
    openingFirstShots: 0, openingFirstShotRate: null, openingShotFgPct: null,
    probability: Number(row.model_probability || 0), rank,
    marketOdds: null,
  };
}

async function loadLedgerFallback(): Promise<WnbaSlate | null> {
  if (!pool) return null;
  const date = etDateISO();
  const result = await pool.query(`
    SELECT espn_game_id, game_start_at, player_name, team, model_probability, model_rank, model_version
    FROM wnba_prediction_ledger
    WHERE (game_start_at AT TIME ZONE 'America/New_York')::date = $1::date
    ORDER BY game_start_at ASC, espn_game_id, model_rank ASC
  `, [date]);
  if (!result.rows.length) return null;

  const grouped = new Map<string, any[]>();
  for (const row of result.rows) {
    const key = String(row.espn_game_id);
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }

  const games: WnbaGame[] = [];
  for (const [id, rows] of grouped) {
    const teams = [...new Set(rows.map(r => String(r.team || '').toUpperCase()).filter(Boolean))];
    if (teams.length < 2) continue;
    const candidates = rows
      .map((r, i) => ledgerCandidate(r, Number(r.model_rank || i + 1)))
      .sort((a, b) => a.rank - b.rank || b.probability - a.probability);
    const start = new Date(rows[0].game_start_at).toISOString();
    games.push({
      id,
      date: start,
      shortName: `${teams[0]} @ ${teams[1]}`,
      awayTeam: teams[0],
      homeTeam: teams[1],
      awayName: teams[0],
      homeName: teams[1],
      status: 'Scheduled / live feed unavailable',
      lineupStatus: String(rows[0].model_version || '').endsWith('-PROJECTED') ? 'projected' : 'confirmed',
      starters: candidates.map(p => ({ name: p.name, team: p.team })),
      candidates,
      topPick: candidates[0] || null,
      tipSignal: emptyTipSignal(),
    });
  }

  if (!games.length) return null;
  const teams = [...new Set(games.flatMap(g => [g.awayTeam, g.homeTeam]))].map(abbreviation => ({ abbreviation, name: abbreviation }));
  const slate: WnbaSlate = {
    season: currentSeason(),
    updatedAt: new Date().toISOString(),
    teams,
    games,
    source: 'Persistent locked WNBA prediction ledger fallback',
    modelVersion: String(result.rows[0]?.model_version || 'WNBA-FB-SEASONAL-V1'),
  };
  void saveSnapshot(slate).catch(() => undefined);
  return slate;
}

async function bestFallback(): Promise<WnbaSlate | null> {
  return (await loadSnapshot().catch(() => null)) || (await loadLedgerFallback().catch(error => {
    console.warn('[WNBA Fail-safe] Ledger fallback failed:', error);
    return null;
  }));
}

export async function getResilientWnbaSlate(force = false): Promise<WnbaSlate> {
  try {
    const live = await getWnbaSlate(force);
    if (live.games.length) {
      void saveSnapshot(live).catch(error => console.warn('[WNBA Fail-safe] Could not save slate snapshot:', error));
      return live;
    }

    const cached = await bestFallback();
    if (cached) {
      console.warn(`[WNBA Fail-safe] Live feed returned 0 games; serving ${cached.games.length} persisted game(s) instead.`);
      return cached;
    }
    return live;
  } catch (error) {
    const cached = await bestFallback();
    if (cached) {
      console.warn(`[WNBA Fail-safe] Live slate failed; serving ${cached.games.length} persisted game(s) instead.`, error);
      return cached;
    }
    throw error;
  }
}
