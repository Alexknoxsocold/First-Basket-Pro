import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { ensureWnbaSchema } from './wnbaFirstBasket';
import { ensureWnbaEvidenceSchema, saveOpeningEvidence, verifyOpeningEvidence, type WnbaStarter } from './wnbaEvidence';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const normName=(v:string)=>v.toLowerCase().replace(/[.'’\-]/g,'').replace(/\s+/g,' ').trim();
const normTeam=(v:string)=>v.toUpperCase().trim();
async function json(url:string):Promise<any|null>{try{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(8000)});return r.ok?await r.json():null;}catch{return null;}}
function ymd(d:Date){return d.toISOString().slice(0,10);} function compact(d:Date){return ymd(d).replace(/-/g,'');}

function extractStarters(data:any):WnbaStarter[]{
  const out:WnbaStarter[]=[];
  for(const block of data?.boxscore?.players||[]){const team=normTeam(String(block?.team?.abbreviation||''));for(const group of block?.statistics||[])for(const row of group?.athletes||[]){if(row?.starter!==true||row?.didNotPlay===true)continue;const name=String(row?.athlete?.displayName||'').trim();if(name&&team)out.push({name,team});}}
  return [...new Map(out.map(s=>[`${normName(s.name)}|${s.team}`,s])).values()];
}

async function recordVerified(gameId:string,date:string,starters:WnbaStarter[],first:{name:string;team:string},season:number){
  if(!pool||starters.length!==10)return false;
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const ex=await c.query('SELECT 1 FROM wnba_processed_games WHERE espn_game_id=$1',[gameId]);
    if(ex.rows.length){await c.query('ROLLBACK');return false;}
    for(const s of starters){const won=normName(s.name)===normName(first.name)&&normTeam(s.team)===normTeam(first.team);await c.query(`INSERT INTO wnba_fb_tracking(player_name,team,season,fb_scored,games_tracked,last_updated) VALUES($1,$2,$3,$4,1,now()) ON CONFLICT (lower(player_name),upper(team),season) DO UPDATE SET fb_scored=wnba_fb_tracking.fb_scored+EXCLUDED.fb_scored,games_tracked=wnba_fb_tracking.games_tracked+1,last_updated=now()`,[s.name,s.team,season,won?1:0]);}
    await c.query('INSERT INTO wnba_processed_games(espn_game_id,game_date,first_scorer,first_scorer_team) VALUES($1,$2,$3,$4)',[gameId,date,first.name,first.team]);
    await c.query('COMMIT'); return true;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

export async function backfillWnbaHistory(daysPerRun=3,maxGames=8):Promise<{datesChecked:number;gamesAdded:number;unresolved:number;done:boolean}>{
  if(!pool)return{datesChecked:0,gamesAdded:0,unresolved:0,done:true};
  await ensureWnbaSchema(); await ensureWnbaEvidenceSchema();
  const season=new Date().getUTCFullYear();
  const min=await pool.query('SELECT min(game_date) AS min_date FROM wnba_processed_games WHERE extract(year from game_date)=$1',[season]);
  let cursor=min.rows[0]?.min_date?new Date(min.rows[0].min_date):new Date(); cursor=new Date(cursor.getTime()-86400000);
  const seasonFloor=new Date(Date.UTC(season,4,1)); let datesChecked=0,gamesAdded=0,unresolved=0;
  while(datesChecked<daysPerRun&&gamesAdded<maxGames&&cursor>=seasonFloor){
    const date=ymd(cursor); const board=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${compact(cursor)}`);
    for(const event of (board?.events||[]).filter((e:any)=>e?.status?.type?.completed===true)){
      const id=String(event.id); const ex=await pool.query('SELECT 1 FROM wnba_processed_games WHERE espn_game_id=$1',[id]); if(ex.rows.length)continue;
      const summary=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=${id}`); const starters=extractStarters(summary);
      const evidence=verifyOpeningEvidence(id,date,summary,starters);
      if(!evidence){unresolved++;continue;}
      await saveOpeningEvidence(evidence);
      if(await recordVerified(id,date,starters,{name:evidence.firstMadePlayer,team:evidence.firstMadeTeam},season))gamesAdded++;
      if(gamesAdded>=maxGames)break;
    }
    datesChecked++; cursor=new Date(cursor.getTime()-86400000);
  }
  return{datesChecked,gamesAdded,unresolved,done:cursor<seasonFloor};
}
