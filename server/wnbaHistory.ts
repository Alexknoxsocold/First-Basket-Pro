import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { ensureWnbaSchema } from './wnbaFirstBasket';
import { ensureWnbaEvidenceSchema } from './wnbaEvidence';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

export async function getWnbaHistory():Promise<any>{
  const currentSeason=new Date().getUTCFullYear(),previousSeason=currentSeason-1;
  if(!pool)return{currentSeason,previousSeason,current:[],previous:[],status:'rebuilding',verifiedGames:0,coverageStart:null,coverageEnd:null,note:'WNBA First Basket history is rebuilding from strictly verified play-by-play.'};
  await Promise.all([ensureWnbaSchema(),ensureWnbaEvidenceSchema()]);
  const [result,coverage]=await Promise.all([
    pool.query(`SELECT player_name,team,season,fb_scored,games_tracked,last_updated FROM wnba_fb_tracking WHERE season IN($1,$2) AND trim(team)<>'' ORDER BY season DESC,fb_scored DESC,games_tracked DESC,player_name`,[currentSeason,previousSeason]),
    pool.query(`SELECT count(*) verified_games,min(game_date) coverage_start,max(game_date) coverage_end FROM wnba_processed_games WHERE extract(year from game_date)=$1`,[currentSeason])
  ]);
  const map=(season:number)=>result.rows.filter(r=>Number(r.season)===season).map(r=>({playerName:r.player_name,team:r.team,season:Number(r.season),fbScored:Number(r.fb_scored),verifiedStarterGames:Number(r.games_tracked),rate:Number(r.games_tracked)>0?Math.round(Number(r.fb_scored)/Number(r.games_tracked)*1000)/10:null,lastUpdated:r.last_updated}));
  const c=coverage.rows[0]||{};
  return{currentSeason,previousSeason,current:map(currentSeason),previous:map(previousSeason),status:'rebuilding',verifiedGames:Number(c.verified_games||0),coverageStart:c.coverage_start||null,coverageEnd:c.coverage_end||null,note:'Totals shown here are only from games that passed the strict chronology verifier. Real season starts are shown separately on game cards from player statistics. Coverage expands backward until the full season is verified.'};
}
