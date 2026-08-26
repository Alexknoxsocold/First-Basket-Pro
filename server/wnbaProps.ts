import { getWnbaSlate } from './wnbaFirstBasket';
import { fetchWnbaPropMarketLines, type WnbaPropMarketKey } from './wnbaPropMarkets';

const MODEL_VERSION = 'WNBA-PROPS-V1';
const CACHE_TTL_MS = 10 * 60 * 1000;

export type WnbaPropKey = WnbaPropMarketKey;
export type WnbaPropPlay = {
  player: string;
  team: string;
  opponent: string;
  gameId: string;
  gameTime: string;
  headshot: string | null;
  position: string;
  market: WnbaPropKey;
  marketLabel: string;
  seasonAverage: number;
  recentAverage: number | null;
  recentGames: number;
  projection: number;
  line: number | null;
  side: 'OVER' | 'UNDER' | null;
  edge: number | null;
  confidence: number;
  confidenceLabel: 'STRONG' | 'GOOD' | 'WATCH';
  isBettable: boolean;
  book: string | null;
  odds: number | null;
  reasons: string[];
};
export type WnbaPropsPayload = {
  updatedAt: string;
  modelVersion: string;
  source: string;
  marketSource: string;
  plays: WnbaPropPlay[];
  games: number;
  playersEvaluated: number;
  verifiedLines: number;
  note: string;
};

type SeasonStats = { games:number; minutes:number; points:number; rebounds:number; assists:number; threes:number };
type RecentLine = { points:number; rebounds:number; assists:number; threes:number };

let cache: { at:number; value:WnbaPropsPayload } | null = null;
let inFlight: Promise<WnbaPropsPayload> | null = null;

function norm(v:unknown){return String(v??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[.'’\-]/g,'').replace(/\s+/g,' ').trim()}
function compactDate(d:Date){return d.toISOString().slice(0,10).replace(/-/g,'')}
async function json(url:string, headers?:Record<string,string>):Promise<any|null>{try{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0',...(headers||{})},signal:AbortSignal.timeout(9000)});return r.ok?await r.json():null}catch{return null}}
function num(v:unknown):number|null{const n=Number.parseFloat(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null}
function round(v:number,d=1){const p=10**d;return Math.round(v*p)/p}

async function roster(team:string){const d=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/teams/${team}/roster`);return d?.athletes||[]}
async function seasonStats(id:string,season:number):Promise<SeasonStats|null>{
  const d=await json(`https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/seasons/${season}/types/2/athletes/${id}/statistics/0`);
  const all=(d?.splits?.categories||[]).flatMap((c:any)=>c?.stats||[]);
  if(!all.length)return null;
  const get=(names:string[])=>{for(const name of names){const x=all.find((s:any)=>String(s?.name||'').toLowerCase()===name.toLowerCase());if(x){const v=num(x?.value??x?.displayValue);if(v!==null)return v}}return 0};
  return {
    games:get(['gamesPlayed','games']),
    minutes:get(['avgMinutes','minutesPerGame']),
    points:get(['avgPoints','pointsPerGame']),
    rebounds:get(['avgRebounds','reboundsPerGame','rebounds']),
    assists:get(['avgAssists','assistsPerGame','assists']),
    threes:get(['avgThreePointFieldGoalsMade','threePointFieldGoalsMadePerGame','threePointFieldGoalsMade']),
  };
}

function parseRecent(summary:any, relevantTeams:Set<string>, out:Map<string,RecentLine[]>){
  for(const block of summary?.boxscore?.players||[]){
    const team=String(block?.team?.abbreviation||'').toUpperCase();
    if(!relevantTeams.has(team))continue;
    for(const group of block?.statistics||[]){
      const labels=(group?.labels||group?.names||[]).map((x:any)=>String(x).toUpperCase());
      const idx=(...names:string[])=>labels.findIndex((x:string)=>names.includes(x));
      const pIdx=idx('PTS','POINTS'),rIdx=idx('REB','TRB','REBOUNDS'),aIdx=idx('AST','ASSISTS'),tIdx=idx('3PT','3PM-A','3PM');
      for(const row of group?.athletes||[]){
        if(row?.didNotPlay===true)continue;
        const name=String(row?.athlete?.displayName||'').trim(); if(!name)continue;
        const stats:Array<any>=row?.stats||[];
        const value=(i:number)=>i>=0?(num(stats[i])??0):0;
        let threes=0;
        if(tIdx>=0){const raw=String(stats[tIdx]??'');threes=raw.includes('-')?(num(raw.split('-')[0])??0):(num(raw)??0)}
        const line={points:value(pIdx),rebounds:value(rIdx),assists:value(aIdx),threes};
        const key=`${norm(name)}|${team}`;
        const arr=out.get(key)||[]; if(arr.length<8){arr.push(line);out.set(key,arr)}
      }
    }
  }
}

async function recentStats(teams:string[]):Promise<Map<string,RecentLine[]>>{
  const relevant=new Set(teams.map(x=>x.toUpperCase()));
  const out=new Map<string,RecentLine[]>();
  const seen=new Set<string>();
  for(let day=1;day<=16;day++){
    const date=new Date(Date.now()-day*86400000);
    const board=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${compactDate(date)}`);
    for(const event of board?.events||[]){
      if(event?.status?.type?.completed!==true)continue;
      const comps=event?.competitions?.[0]?.competitors||[];
      if(!comps.some((c:any)=>relevant.has(String(c?.team?.abbreviation||'').toUpperCase())))continue;
      const id=String(event?.id||''); if(!id||seen.has(id))continue; seen.add(id);
      const summary=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=${id}`);
      if(summary)parseRecent(summary,relevant,out);
    }
    if([...out.values()].filter(v=>v.length>=5).length>=Math.max(5,teams.length*3))break;
  }
  return out;
}

const labels:Record<WnbaPropKey,string>={points:'Points',rebounds:'Rebounds',assists:'Assists',threes:'3PT Made',rebounds_assists:'Reb + Ast',points_rebounds_assists:'Pts + Reb + Ast'};
const edgeFloor:Record<WnbaPropKey,number>={points:2.0,rebounds:1.2,assists:1.0,threes:0.55,rebounds_assists:1.7,points_rebounds_assists:2.8};
function avg(lines:RecentLine[],key:WnbaPropKey){if(!lines.length)return null;const value=(x:RecentLine)=>key==='points'?x.points:key==='rebounds'?x.rebounds:key==='assists'?x.assists:key==='threes'?x.threes:key==='rebounds_assists'?x.rebounds+x.assists:x.points+x.rebounds+x.assists;return lines.reduce((s,x)=>s+value(x),0)/lines.length}
function seasonValue(s:SeasonStats,key:WnbaPropKey){return key==='points'?s.points:key==='rebounds'?s.rebounds:key==='assists'?s.assists:key==='threes'?s.threes:key==='rebounds_assists'?s.rebounds+s.assists:s.points+s.rebounds+s.assists}
function projection(season:number,recent:number|null,recentGames:number){if(recent===null||recentGames<2)return season;const w=Math.min(.4,.18+recentGames*.035);return season*(1-w)+recent*w}
function confidence(s:SeasonStats,recentGames:number,projection:number,line:number|null,key:WnbaPropKey){let score=50+Math.min(18,s.games*.55)+Math.min(12,recentGames*2)+Math.min(8,s.minutes/5);if(line!==null)score+=Math.min(12,Math.abs(projection-line)/edgeFloor[key]*6);return Math.max(45,Math.min(94,Math.round(score)))}
function reasonList(s:SeasonStats,seasonAvg:number,recentAvg:number|null,recentGames:number,line:number|null,proj:number){const r=[`Season baseline ${seasonAvg.toFixed(1)} across ${Math.round(s.games)} games`,`Role baseline ${s.minutes.toFixed(1)} minutes per game`];if(recentAvg!==null)r.push(`Recent ${recentGames}-game average ${recentAvg.toFixed(1)}`);if(line!==null)r.push(`Model ${proj>=line?'above':'below'} verified market line by ${Math.abs(proj-line).toFixed(1)}`);return r}

async function build():Promise<WnbaPropsPayload>{
  const slate=await getWnbaSlate();
  const teams=[...new Set(slate.games.flatMap(g=>[g.awayTeam,g.homeTeam]))];
  const [recent,lines]=await Promise.all([recentStats(teams),fetchWnbaPropMarketLines(slate.games)]);
  const rosters=new Map<string,any[]>(); await Promise.all(teams.map(async t=>rosters.set(t,await roster(t))));
  const plays:WnbaPropPlay[]=[]; let evaluated=0;
  const keys:WnbaPropKey[]=['points','rebounds','assists','threes','rebounds_assists','points_rebounds_assists'];
  for(const game of slate.games){
    for(const c of game.candidates){
      const rr=rosters.get(c.team)||[],target=norm(c.name);let athlete=rr.find((x:any)=>norm(x?.displayName)===target);if(!athlete){const last=target.split(' ').at(-1);athlete=rr.find((x:any)=>norm(x?.displayName).split(' ').at(-1)===last)}
      if(!athlete?.id)continue; const s=await seasonStats(String(athlete.id),slate.season); if(!s||s.games<3)continue; evaluated++;
      const recentLines=recent.get(`${target}|${c.team.toUpperCase()}`)||[];
      const opponent=c.team===game.awayTeam?game.homeTeam:game.awayTeam;
      for(const key of keys){
        const seasonAvg=seasonValue(s,key),recentAvg=avg(recentLines,key),proj=projection(seasonAvg,recentAvg,recentLines.length);
        const ml=lines.find(x=>norm(x.player)===target&&x.market===key)??null;
        const edge=ml?proj-ml.line:null,side=edge===null?null:edge>=0?'OVER':'UNDER';
        const isBettable=edge!==null&&Math.abs(edge)>=edgeFloor[key];
        const conf=confidence(s,recentLines.length,proj,ml?.line??null,key);
        plays.push({player:c.name,team:c.team,opponent,gameId:game.id,gameTime:game.date,headshot:c.headshot,position:c.position,market:key,marketLabel:labels[key],seasonAverage:round(seasonAvg),recentAverage:recentAvg===null?null:round(recentAvg),recentGames:recentLines.length,projection:round(proj),line:ml?.line??null,side:isBettable?side:null,edge:isBettable&&edge!==null?round(Math.abs(edge)):null,confidence:conf,confidenceLabel:conf>=82?'STRONG':conf>=70?'GOOD':'WATCH',isBettable,book:ml?.book??null,odds:ml?.odds??null,reasons:reasonList(s,seasonAvg,recentAvg,recentLines.length,ml?.line??null,proj)});
      }
    }
  }
  plays.sort((a,b)=>Number(b.isBettable)-Number(a.isBettable)||b.confidence-a.confidence||(b.edge??0)-(a.edge??0));
  return {updatedAt:new Date().toISOString(),modelVersion:MODEL_VERSION,source:'ESPN season + recent WNBA box scores',marketSource:lines.length?'PropLine Pro verified sportsbook lines':'No verified sportsbook lines currently available',plays,games:slate.games.length,playersEvaluated:evaluated,verifiedLines:plays.filter(x=>x.line!==null).length,note:'Prop projections are separate from the First Basket model. PropLine only supplies sportsbook market context. A betting side is shown only when a verified market line exists and the independent PreziTools projection clears the market-specific edge threshold.'};
}

export async function getWnbaPropProjections(force=false):Promise<WnbaPropsPayload>{if(!force&&cache&&Date.now()-cache.at<CACHE_TTL_MS)return cache.value;if(inFlight)return inFlight;inFlight=build();try{const value=await inFlight;cache={at:Date.now(),value};return value}finally{inFlight=null}}
