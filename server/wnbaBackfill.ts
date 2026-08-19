import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { ensureWnbaSchema } from './wnbaFirstBasket';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;

type Starter = { name: string; team: string };
const normName = (v:string) => v.toLowerCase().replace(/[.'’\-]/g,'').replace(/\s+/g,' ').trim();
const normTeam = (v:string) => v.toUpperCase().trim();

async function json(url:string): Promise<any|null> {
  try { const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(8000)}); return r.ok?await r.json():null; }
  catch { return null; }
}
function ymd(d:Date){ return d.toISOString().slice(0,10); }
function compact(d:Date){ return ymd(d).replace(/-/g,''); }
function extractStarters(data:any): Starter[] {
  const out:Starter[]=[];
  for(const block of data?.boxscore?.players||[]){
    const team=normTeam(String(block?.team?.abbreviation||''));
    for(const group of block?.statistics||[]) for(const row of group?.athletes||[]){
      if(row?.starter!==true||row?.didNotPlay===true) continue;
      const name=String(row?.athlete?.displayName||'').trim(); if(name&&team) out.push({name,team});
    }
  }
  return [...new Map(out.map(s=>[`${normName(s.name)}|${s.team}`,s])).values()];
}
function scorer(data:any,starters:Starter[]):Starter|null{
  for(const play of data?.plays||[]){
    const text=String(play?.text||'');
    if(play?.scoringPlay!==true||!text.toLowerCase().includes(' makes ')||text.toLowerCase().includes('free throw')) continue;
    const val=Number(play?.scoreValue??0); if(val!==2&&val!==3&&!/(layup|dunk|jumper|shot)/i.test(text)) continue;
    const part=(play?.participants||[]).find((p:any)=>p?.type!=='assist'&&p?.type!=='block')||play?.participants?.[0];
    let name=String(part?.athlete?.displayName||play?.athlete?.displayName||'').trim();
    if(!name){const i=text.indexOf(' makes '); if(i>0) name=text.slice(0,i).trim();}
    let team=normTeam(String(play?.team?.abbreviation||'')); if(!team) team=starters.find(s=>normName(s.name)===normName(name))?.team||'';
    if(name&&team) return {name,team};
  }
  return null;
}
async function record(gameId:string,date:string,starters:Starter[],first:Starter,season:number){
  if(!pool||starters.length!==10)return false;
  const c=await pool.connect();
  try{
    await c.query('BEGIN');
    const ex=await c.query('SELECT 1 FROM wnba_processed_games WHERE espn_game_id=$1',[gameId]);
    if(ex.rows.length){await c.query('ROLLBACK');return false;}
    for(const s of starters){
      const won=normName(s.name)===normName(first.name)&&normTeam(s.team)===normTeam(first.team);
      await c.query(`INSERT INTO wnba_fb_tracking(player_name,team,season,fb_scored,games_tracked,last_updated) VALUES($1,$2,$3,$4,1,now())
        ON CONFLICT (lower(player_name),upper(team),season) DO UPDATE SET fb_scored=wnba_fb_tracking.fb_scored+EXCLUDED.fb_scored,games_tracked=wnba_fb_tracking.games_tracked+1,last_updated=now()`,[s.name,s.team,season,won?1:0]);
    }
    await c.query('INSERT INTO wnba_processed_games(espn_game_id,game_date,first_scorer,first_scorer_team) VALUES($1,$2,$3,$4)',[gameId,date,first.name,first.team]);
    await c.query('COMMIT'); return true;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

/** Walk backward in small chunks. Historical results seed player priors only;
 * they never create retrospective prediction-ledger rows. */
export async function backfillWnbaHistory(daysPerRun=7,maxGames=24):Promise<{datesChecked:number;gamesAdded:number;unresolved:number;done:boolean}>{
  if(!pool)return{datesChecked:0,gamesAdded:0,unresolved:0,done:true};
  await ensureWnbaSchema();
  const season=new Date().getUTCFullYear();
  const min=await pool.query('SELECT min(game_date) AS min_date FROM wnba_processed_games WHERE extract(year from game_date)=$1',[season]);
  let cursor=min.rows[0]?.min_date?new Date(min.rows[0].min_date):new Date();
  cursor=new Date(cursor.getTime()-86400000);
  const seasonFloor=new Date(Date.UTC(season,4,1));
  let datesChecked=0,gamesAdded=0,unresolved=0;
  while(datesChecked<daysPerRun&&gamesAdded<maxGames&&cursor>=seasonFloor){
    const date=ymd(cursor); const board=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${compact(cursor)}`);
    for(const event of (board?.events||[]).filter((e:any)=>e?.status?.type?.completed===true)){
      const id=String(event.id); const ex=await pool.query('SELECT 1 FROM wnba_processed_games WHERE espn_game_id=$1',[id]); if(ex.rows.length)continue;
      const summary=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=${id}`); const starters=extractStarters(summary); const first=scorer(summary,starters);
      if(starters.length!==10||!first){unresolved++;continue;}
      if(await record(id,date,starters,first,season))gamesAdded++;
      if(gamesAdded>=maxGames)break;
    }
    datesChecked++; cursor=new Date(cursor.getTime()-86400000);
  }
  return{datesChecked,gamesAdded,unresolved,done:cursor<seasonFloor};
}
