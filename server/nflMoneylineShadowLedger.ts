import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import type { ModelResult } from './nflModels.js';
import type { NflMoneylineV2Result } from './nflMoneylineV2.js';

neonConfig.webSocketConstructor = ws;
let pool:Pool|null=null;
let ready:Promise<void>|null=null;
function db(){if(!process.env.DATABASE_URL)return null;if(!pool)pool=new Pool({connectionString:process.env.DATABASE_URL});return pool;}

async function ensure(){
  if(ready)return ready;
  const c=db();if(!c)return;
  ready=c.query(`
    CREATE TABLE IF NOT EXISTS nfl_moneyline_shadow (
      game_id text PRIMARY KEY,
      game_start_at timestamptz NOT NULL,
      captured_at timestamptz NOT NULL DEFAULT now(),
      away_team text NOT NULL,
      home_team text NOT NULL,
      away_best_odds integer,
      home_best_odds integer,
      away_market_no_vig real,
      home_market_no_vig real,
      v1_away_probability real,
      v1_home_probability real,
      v1_away_qualifies boolean,
      v1_home_qualifies boolean,
      v2_away_probability real,
      v2_home_probability real,
      v2_away_qualifies boolean,
      v2_home_qualifies boolean,
      v2_away_ev real,
      v2_home_ev real,
      winner_team text,
      home_won boolean,
      graded_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS nfl_moneyline_shadow_start_idx ON nfl_moneyline_shadow(game_start_at DESC);
    CREATE INDEX IF NOT EXISTS nfl_moneyline_shadow_graded_idx ON nfl_moneyline_shadow(graded_at,game_start_at DESC);
  `).then(()=>undefined).catch(e=>{ready=null;throw e;});
  return ready;
}

export async function captureNflMoneylineShadow(data:{
  gameId:string; gameStartAt:string; awayTeam:string; homeTeam:string;
  awayBestOdds:number|null; homeBestOdds:number|null;
  awayConsensus:number|null; homeConsensus:number|null;
  v1Away:ModelResult|null; v1Home:ModelResult|null;
  v2Away:NflMoneylineV2Result|null; v2Home:NflMoneylineV2Result|null;
}){
  const c=db();if(!c)return;
  await ensure();
  const start=new Date(data.gameStartAt);if(!Number.isFinite(start.getTime())||start.getTime()<=Date.now())return;
  await c.query(`
    INSERT INTO nfl_moneyline_shadow (
      game_id,game_start_at,away_team,home_team,away_best_odds,home_best_odds,away_market_no_vig,home_market_no_vig,
      v1_away_probability,v1_home_probability,v1_away_qualifies,v1_home_qualifies,
      v2_away_probability,v2_home_probability,v2_away_qualifies,v2_home_qualifies,v2_away_ev,v2_home_ev
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
    ON CONFLICT(game_id) DO NOTHING
  `,[data.gameId,start,data.awayTeam,data.homeTeam,data.awayBestOdds,data.homeBestOdds,data.awayConsensus,data.homeConsensus,
    data.v1Away?.modelProbability??null,data.v1Home?.modelProbability??null,data.v1Away?.qualifies??null,data.v1Home?.qualifies??null,
    data.v2Away?.modelProbability??null,data.v2Home?.modelProbability??null,data.v2Away?.qualifies??null,data.v2Home?.qualifies??null,
    data.v2Away?.expectedValue??null,data.v2Home?.expectedValue??null]);
}

async function resolveWinner(gameId:string):Promise<string|null>{
  const url=`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(gameId)}`;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);
  try{
    const r=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'PreziTools/1.0'}});if(!r.ok)return null;
    const p:any=await r.json();const competition=p?.header?.competitions?.[0];
    const completed=competition?.status?.type?.completed===true||competition?.status?.type?.state==='post';
    if(!completed)return null;
    const competitors=competition?.competitors??[];const winner=competitors.find((x:any)=>x?.winner===true);
    return winner?.team?.displayName??winner?.team?.abbreviation??null;
  }catch{return null;}finally{clearTimeout(timer);}
}

export async function gradePendingNflMoneylineShadow(limit=12){
  const c=db();if(!c)return 0;await ensure();
  const rows=await c.query(`SELECT game_id,home_team FROM nfl_moneyline_shadow WHERE graded_at IS NULL AND game_start_at < now()-interval '3 hours' ORDER BY game_start_at ASC LIMIT $1`,[Math.max(1,Math.min(limit,50))]);
  let graded=0;
  for(const row of rows.rows){const winner=await resolveWinner(String(row.game_id));if(!winner)continue;const homeWon=winner.toLowerCase()===String(row.home_team).toLowerCase();await c.query(`UPDATE nfl_moneyline_shadow SET winner_team=$2,home_won=$3,graded_at=now() WHERE game_id=$1 AND graded_at IS NULL`,[row.game_id,winner,homeWon]);graded++;}
  return graded;
}

function num(v:any){return v==null?null:Number(v);}
export async function getNflMoneylineShadowSummary(days=30){
  const c=db();if(!c)return{sampleSize:0,pending:0,captured:0,disagreements:0,v1Brier:null,v2Brier:null,marketBrier:null,v1Accuracy:null,v2Accuracy:null,v1QualifiedSides:0,v2QualifiedSides:0,v1QualifiedWins:0,v2QualifiedWins:0};await ensure();
  const d=Math.max(1,Math.min(days,365));
  const r=await c.query(`
    WITH s AS (SELECT * FROM nfl_moneyline_shadow WHERE captured_at >= now()-($1::text||' days')::interval),
    g AS (SELECT * FROM s WHERE graded_at IS NOT NULL)
    SELECT
      (SELECT count(*) FROM s) captured,
      (SELECT count(*) FROM s WHERE graded_at IS NULL) pending,
      count(*) sample_size,
      count(*) FILTER (WHERE (v1_home_probability>=50) IS DISTINCT FROM (v2_home_probability>=50)) disagreements,
      avg(power(v1_home_probability/100.0-(CASE WHEN home_won THEN 1 ELSE 0 END),2)) v1_brier,
      avg(power(v2_home_probability/100.0-(CASE WHEN home_won THEN 1 ELSE 0 END),2)) v2_brier,
      avg(power(home_market_no_vig/100.0-(CASE WHEN home_won THEN 1 ELSE 0 END),2)) market_brier,
      avg(CASE WHEN (v1_home_probability>=50)=home_won THEN 1.0 ELSE 0.0 END) v1_acc,
      avg(CASE WHEN (v2_home_probability>=50)=home_won THEN 1.0 ELSE 0.0 END) v2_acc,
      sum((coalesce(v1_home_qualifies,false)::int)+(coalesce(v1_away_qualifies,false)::int)) v1_qualified_sides,
      sum((coalesce(v2_home_qualifies,false)::int)+(coalesce(v2_away_qualifies,false)::int)) v2_qualified_sides,
      sum((CASE WHEN v1_home_qualifies AND home_won THEN 1 ELSE 0 END)+(CASE WHEN v1_away_qualifies AND NOT home_won THEN 1 ELSE 0 END)) v1_qualified_wins,
      sum((CASE WHEN v2_home_qualifies AND home_won THEN 1 ELSE 0 END)+(CASE WHEN v2_away_qualifies AND NOT home_won THEN 1 ELSE 0 END)) v2_qualified_wins
    FROM g
  `,[d]);
  const x=r.rows[0]??{};
  return{sampleSize:Number(x.sample_size??0),pending:Number(x.pending??0),captured:Number(x.captured??0),disagreements:Number(x.disagreements??0),v1Brier:num(x.v1_brier),v2Brier:num(x.v2_brier),marketBrier:num(x.market_brier),v1Accuracy:num(x.v1_acc),v2Accuracy:num(x.v2_acc),v1QualifiedSides:Number(x.v1_qualified_sides??0),v2QualifiedSides:Number(x.v2_qualified_sides??0),v1QualifiedWins:Number(x.v1_qualified_wins??0),v2QualifiedWins:Number(x.v2_qualified_wins??0)};
}

export async function getNflMoneylineShadowDiagnostics(days=30){
  const c=db();if(!c)return{database:false,windowDays:days,summary:await getNflMoneylineShadowSummary(days),recent:[]};await ensure();
  const d=Math.max(1,Math.min(days,365));
  const [summary,recentResult]=await Promise.all([
    getNflMoneylineShadowSummary(d),
    c.query(`SELECT game_id,game_start_at,captured_at,away_team,home_team,away_best_odds,home_best_odds,away_market_no_vig,home_market_no_vig,v1_away_probability,v1_home_probability,v1_away_qualifies,v1_home_qualifies,v2_away_probability,v2_home_probability,v2_away_qualifies,v2_home_qualifies,v2_away_ev,v2_home_ev,winner_team,home_won,graded_at FROM nfl_moneyline_shadow WHERE captured_at>=now()-($1::text||' days')::interval ORDER BY game_start_at DESC LIMIT 25`,[d])
  ]);
  return{database:true,windowDays:d,generatedAt:new Date().toISOString(),summary,recent:recentResult.rows};
}
