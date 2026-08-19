import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { ensureWnbaSchema } from './wnbaFirstBasket';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

export async function getWnbaHistory(): Promise<{ currentSeason:number; previousSeason:number; current:any[]; previous:any[] }> {
  const currentSeason = new Date().getUTCFullYear();
  const previousSeason = currentSeason - 1;
  if (!pool) return { currentSeason, previousSeason, current: [], previous: [] };
  await ensureWnbaSchema();
  const result = await pool.query(`SELECT player_name, team, season, fb_scored, games_tracked, last_updated
    FROM wnba_fb_tracking WHERE season IN ($1,$2) AND trim(team)<>''
    ORDER BY season DESC, fb_scored DESC, games_tracked DESC, player_name`, [currentSeason, previousSeason]);
  const map = (season:number) => result.rows.filter(r=>Number(r.season)===season).map(r=>({
    playerName:r.player_name, team:r.team, season:Number(r.season), fbScored:Number(r.fb_scored), gamesTracked:Number(r.games_tracked),
    rate:Number(r.games_tracked)>0?Math.round((Number(r.fb_scored)/Number(r.games_tracked))*1000)/10:null, lastUpdated:r.last_updated,
  }));
  return { currentSeason, previousSeason, current: map(currentSeason), previous: map(previousSeason) };
}
