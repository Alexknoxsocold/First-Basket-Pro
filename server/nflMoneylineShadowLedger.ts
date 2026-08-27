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
    const p:any=await r.json();const competitors=p?.header?.competitions?.[0]?.competitors??[];
    const winner=competitors.find((x:any)=>x?.winner===true);
    return winner?.team?.displayName??winner?.team?.abbreviation??null;
  }catch{return null;}finally{clearTimeout(timer);}
}

export async function gradePendingNflMoneylineShadow(limit=12){
  const c=db();if(!c)return 0;await ensure();
  const rows=await c.query(`SELECT game_id,home_team FROM nfl_moneyline_shadow WHERE graded_at IS NULL AND game_start_at < now()-interval '4 hours' ORDER BY game_start_at ASC LIMIT $1`,[Math.max(1,Math.min(limit,50))]);
  let graded=0;
  for(const row of rows.rows){const winner=await resolveWinner(String(row.game_id));if(!winner)continue;const homeWon=winner.toLowerCase()===String(row.home_team).toLowerCase();await c.query(`UPDATE nfl_moneyline_shadow SET winner_team=$2,home_won=$3,graded_at=now() WHERE game_id=$1 AND graded_at IS NULL`,[row.game_id,winner,homeWon]);graded++;}
  return graded;
}

export async function getNflMoneylineShadowSummary(days=30){
  const c=db();if(!c)return{sampleSize:0,v1Brier:null,v2Brier:null,marketBrier:null,v1Accuracy:null,v2Accuracy:null};await ensure();
  const r=await c.query(`
    WITH s AS (
      SELECT * FROM nfl_moneyline_shadow WHERE graded_at IS NOT NULL AND captured_at >= now()-($1::text||' days')::interval
    )
    SELECT count(*) sample_size,
      avg(power(v1_home_probability/100.0-(CASE WHEN home_won THEN 1 ELSE 0 END),2)) v1_brier,
      avg(power(v2_home_probability/100.0-(CASE WHEN home_won THEN 1 ELSE 0 END),2)) v2_brier,
      avg(power(home_market_no_vig/100.0-(CASE WHEN home_won THEN 1 ELSE 0 END),2)) market_brier,
      avg(CASE WHEN (v1_home_probability>=50)=home_won THEN 1.0 ELSE 0.0 END) v1_acc,
      avg(CASE WHEN (v2_home_probability>=50)=home_won THEN 1.0 ELSE 0.0 END) v2_acc
    FROM s
  `,[Math.max(1,Math.min(days,365))]);
  const x=r.rows[0]??{};const n=Number(x.sample_size??0);
  return{sampleSize:n,v1Brier:x.v1_brier==null?null:Number(x.v1_brier),v2Brier:x.v2_brier==null?null:Number(x.v2_brier),marketBrier:x.market_brier==null?null:Number(x.market_brier),v1Accuracy:x.v1_acc==null?null:Number(x.v1_acc),v2Accuracy:x.v2_acc==null?null:Number(x.v2_acc)};
}
