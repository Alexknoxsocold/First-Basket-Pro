import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { getWnbaSlate, type WnbaSlate } from './wnbaFirstBasket';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

function etDateISO(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`;
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
    'SELECT payload,updated_at FROM wnba_slate_snapshots WHERE slate_date=$1 LIMIT 1',
    [etDateISO()],
  );
  if (!result.rows.length) return null;
  const payload = result.rows[0].payload as WnbaSlate;
  if (!payload || !Array.isArray(payload.games) || !payload.games.length) return null;
  return {
    ...payload,
    source: `${payload.source} + persistent last-good-slate fallback`,
  };
}

export async function getResilientWnbaSlate(force = false): Promise<WnbaSlate> {
  try {
    const live = await getWnbaSlate(force);
    if (live.games.length) {
      void saveSnapshot(live).catch(error => console.warn('[WNBA Fail-safe] Could not save slate snapshot:', error));
      return live;
    }

    const cached = await loadSnapshot();
    if (cached) {
      console.warn('[WNBA Fail-safe] Live feed returned 0 games; serving persisted same-day slate instead.');
      return cached;
    }
    return live;
  } catch (error) {
    const cached = await loadSnapshot().catch(() => null);
    if (cached) {
      console.warn('[WNBA Fail-safe] Live slate failed; serving persisted same-day slate instead.', error);
      return cached;
    }
    throw error;
  }
}
