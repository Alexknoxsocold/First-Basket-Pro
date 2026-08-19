import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { ensureWnbaSchema } from './wnbaFirstBasket';
import { enrichTipFromOfficialWnba, ensureWnbaEvidenceSchema, saveOpeningEvidence, verifyOpeningEvidence, type WnbaStarter } from './wnbaEvidence';

neonConfig.webSocketConstructor = ws;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const normName=(v:string)=>v.toLowerCase().replace(/[.'’\-]/g,'').replace(/\s+/g,' ').trim();
const normTeam=(v:string)=>v.toUpperCase().trim();
async function json(url:string):Promise<any|null>{try{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(8000)});return r.ok?await r.json():null}catch{return null}}
function ymd(d:Date){return d.toISOString().slice(0,10)} function compact(d:Date){return ymd(d).replace(/-/g,'')}
function extractStarters(data:any):WnbaStarter[]{const out:WnbaStarter[]=[];for(const block of data?.boxscore?.players||[]){const team=normTeam(String(block?.team?.abbreviation||''));for(const group of block?.statistics||[])for(const row of group?.athletes||[]){if(row?.starter!==true||row?.didNotPlay===true)continue;const name=String(row?.athlete?.displayName||'').trim();if(name&&team)out.push({name,team})}}return[...new Map(out.map(s=>[`${normName(s.name)}|${s.team}`,s])).values()]}

async function ensureRebuildState(){if(!pool)return;await pool.query(`CREATE TABLE IF NOT EXISTS wnba_history_rebuild_state(season integer PRIMARY KEY,next_date date,done boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now());`)}
async function recordVerified(gameId:string,date:string,starters:WnbaStarter[],first:{name:string;team:string},season:number){if(!pool||starters.length!==10)return false;const c=await pool.connect();try{await c.query('BEGIN');const ex=await c.query('SELECT 1 FROM wnba_processed_games WHERE espn_game_id=$1',[gameId]);if(ex.rows.length){await c.query('ROLLBACK');return false}for(const s of starters){const won=normName(s.name)===normName(first.name)&&normTeam(s.team)===normTeam(first.team);await c.query(`INSERT INTO wnba_fb_tracking(player_name,team,season,fb_scored,games_tracked,last_updated) VALUES($1,$2,$3,$4,1,now()) ON CONFLICT(lower(player_name),upper(team),season) DO UPDATE SET fb_scored=wnba_fb_tracking.fb_scored+EXCLUDED.fb_scored,games_tracked=wnba_fb_tracking.games_tracked+1,last_updated=now()`,[s.name,s.team,season,won?1:0])}await c.query('INSERT INTO wnba_processed_games(espn_game_id,game_date,first_scorer,first_scorer_team) VALUES($1,$2,$3,$4)',[gameId,date,first.name,first.team]);await c.query('COMMIT');return true}catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}}
async function strictEvidence(gameId:string,date:string,summary:any,starters:WnbaStarter[]){const base=verifyOpeningEvidence(gameId,date,summary,starters);if(!base)return null;return enrichTipFromOfficialWnba(base,starters)}

export async function refreshRecentWnbaEvidence(days=10):Promise<{checked:number;updated:number;rejected:number}>{
  if(!pool)return{checked:0,updated:0,rejected:0};await ensureWnbaEvidenceSchema();
  const rows=await pool.query(`SELECT espn_game_id,game_date FROM wnba_processed_games WHERE game_date>=current_date-$1::int ORDER BY game_date DESC`,[Math.max(1,Math.min(days,30))]);
  let checked=0,updated=0,rejected=0;
  for(const r of rows.rows){checked++;const summary=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=${r.espn_game_id}`),starters=extractStarters(summary),e=await strictEvidence(String(r.espn_game_id),String(r.game_date).slice(0,10),summary,starters);if(!e){rejected++;continue}await saveOpeningEvidence(e);updated++}
  return{checked,updated,rejected};
}

export async function backfillWnbaHistory(daysPerRun=5,maxGames=16):Promise<{datesChecked:number;gamesAdded:number;unresolved:number;done:boolean}>{
  if(!pool)return{datesChecked:0,gamesAdded:0,unresolved:0,done:true};
  await ensureWnbaSchema();await ensureWnbaEvidenceSchema();await ensureRebuildState();
  const season=new Date().getUTCFullYear(),seasonFloor=new Date(Date.UTC(season,4,1));
  const state=await pool.query('SELECT next_date,done FROM wnba_history_rebuild_state WHERE season=$1',[season]);
  if(state.rows[0]?.done===true)return{datesChecked:0,gamesAdded:0,unresolved:0,done:true};
  let cursor:Date;
  if(state.rows[0]?.next_date){cursor=new Date(state.rows[0].next_date)}else{
    const min=await pool.query('SELECT min(game_date) AS min_date FROM wnba_processed_games WHERE extract(year from game_date)=$1',[season]);
    cursor=min.rows[0]?.min_date?new Date(min.rows[0].min_date):new Date();cursor=new Date(cursor.getTime()-86400000);
    await pool.query(`INSERT INTO wnba_history_rebuild_state(season,next_date,done,updated_at) VALUES($1,$2,false,now()) ON CONFLICT(season) DO UPDATE SET next_date=EXCLUDED.next_date,done=false,updated_at=now()`,[season,ymd(cursor)]);
  }
  let datesChecked=0,gamesAdded=0,unresolved=0;
  while(datesChecked<daysPerRun&&gamesAdded<maxGames&&cursor>=seasonFloor){
    const date=ymd(cursor),board=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${compact(cursor)}`);
    for(const event of(board?.events||[]).filter((e:any)=>e?.status?.type?.completed===true)){
      const id=String(event.id),ex=await pool.query('SELECT 1 FROM wnba_processed_games WHERE espn_game_id=$1',[id]);if(ex.rows.length)continue;
      const summary=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=${id}`),starters=extractStarters(summary),e=await strictEvidence(id,date,summary,starters);
      if(!e){unresolved++;continue}
      await saveOpeningEvidence(e);if(await recordVerified(id,date,starters,{name:e.firstMadePlayer,team:e.firstMadeTeam},season))gamesAdded++;
      if(gamesAdded>=maxGames)break;
    }
    datesChecked++;cursor=new Date(cursor.getTime()-86400000);
  }
  const done=cursor<seasonFloor;
  await pool.query(`INSERT INTO wnba_history_rebuild_state(season,next_date,done,updated_at) VALUES($1,$2,$3,now()) ON CONFLICT(season) DO UPDATE SET next_date=EXCLUDED.next_date,done=EXCLUDED.done,updated_at=now()`,[season,ymd(cursor),done]);
  return{datesChecked,gamesAdded,unresolved,done};
}
