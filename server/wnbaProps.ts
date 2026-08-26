import { getWnbaSlate } from './wnbaFirstBasket';
import { fetchWnbaPropMarketLines, type WnbaPropMarketKey } from './wnbaPropMarkets';

const MODEL_VERSION = 'WNBA-PROPS-V2';
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
  recentMinutes: number | null;
  projection: number;
  line: number | null;
  consensusLine: number | null;
  side: 'OVER' | 'UNDER' | null;
  edge: number | null;
  confidence: number;
  confidenceLabel: 'STRONG' | 'GOOD' | 'WATCH';
  isBettable: boolean;
  book: string | null;
  odds: number | null;
  bookCount: number;
  quoteCount: number;
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
type RecentLine = { points:number; rebounds:number; assists:number; threes:number; minutes:number };
type TeamLine = { points:number; rebounds:number; assists:number; threes:number };
type RecentBundle = { players:Map<string,RecentLine[]>; allowed:Map<string,TeamLine[]> };

let cache: { at:number; value:WnbaPropsPayload } | null = null;
let inFlight: Promise<WnbaPropsPayload> | null = null;

function norm(v:unknown){return String(v??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[.'’\-]/g,'').replace(/\s+/g,' ').trim()}
function compactDate(d:Date){return d.toISOString().slice(0,10).replace(/-/g,'')}
async function json(url:string, headers?:Record<string,string>):Promise<any|null>{try{const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0',...(headers||{})},signal:AbortSignal.timeout(9000)});return r.ok?await r.json():null}catch{return null}}
function num(v:unknown):number|null{const n=Number.parseFloat(String(v??'').replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null}
function round(v:number,d=1){const p=10**d;return Math.round(v*p)/p}
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v))}

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

function parseSummary(summary:any,relevantTeams:Set<string>,players:Map<string,RecentLine[]>,allowed:Map<string,TeamLine[]>){
  const totals=new Map<string,TeamLine>();
  const present:string[]=[];
  for(const block of summary?.boxscore?.players||[]){
    const team=String(block?.team?.abbreviation||'').toUpperCase();
    if(!team)continue;
    present.push(team);
    const total:TeamLine={points:0,rebounds:0,assists:0,threes:0};
    for(const group of block?.statistics||[]){
      const labels=(group?.labels||group?.names||[]).map((x:any)=>String(x).toUpperCase());
      const idx=(...names:string[])=>labels.findIndex((x:string)=>names.includes(x));
      const pIdx=idx('PTS','POINTS'),rIdx=idx('REB','TRB','REBOUNDS'),aIdx=idx('AST','ASSISTS'),tIdx=idx('3PT','3PM-A','3PM'),mIdx=idx('MIN','MINUTES');
      for(const row of group?.athletes||[]){
        if(row?.didNotPlay===true)continue;
        const name=String(row?.athlete?.displayName||'').trim(); if(!name)continue;
        const stats:Array<any>=row?.stats||[];
        const value=(i:number)=>i>=0?(num(stats[i])??0):0;
        let threes=0;
        if(tIdx>=0){const raw=String(stats[tIdx]??'');threes=raw.includes('-')?(num(raw.split('-')[0])??0):(num(raw)??0)}
        const line={points:value(pIdx),rebounds:value(rIdx),assists:value(aIdx),threes,minutes:value(mIdx)};
        total.points+=line.points; total.rebounds+=line.rebounds; total.assists+=line.assists; total.threes+=line.threes;
        if(relevantTeams.has(team)){
          const key=`${norm(name)}|${team}`;
          const arr=players.get(key)||[]; if(arr.length<8){arr.push(line);players.set(key,arr)}
        }
      }
    }
    totals.set(team,total);
  }
  const unique=[...new Set(present)];
  if(unique.length<2)return;
  for(const team of unique){
    if(!relevantTeams.has(team))continue;
    const opp=unique.find(x=>x!==team); if(!opp)continue;
    const oppTotal=totals.get(opp); if(!oppTotal)continue;
    const arr=allowed.get(team)||[]; if(arr.length<8){arr.push(oppTotal);allowed.set(team,arr)}
  }
}

async function recentStats(teams:string[]):Promise<RecentBundle>{
  const relevant=new Set(teams.map(x=>x.toUpperCase()));
  const players=new Map<string,RecentLine[]>();
  const allowed=new Map<string,TeamLine[]>();
  const seen=new Set<string>();
  for(let day=1;day<=18;day++){
    const date=new Date(Date.now()-day*86400000);
    const board=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${compactDate(date)}`);
    for(const event of board?.events||[]){
      if(event?.status?.type?.completed!==true)continue;
      const comps=event?.competitions?.[0]?.competitors||[];
      if(!comps.some((c:any)=>relevant.has(String(c?.team?.abbreviation||'').toUpperCase())))continue;
      const id=String(event?.id||''); if(!id||seen.has(id))continue; seen.add(id);
      const summary=await json(`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=${id}`);
      if(summary)parseSummary(summary,relevant,players,allowed);
    }
    if([...players.values()].filter(v=>v.length>=5).length>=Math.max(5,teams.length*3))break;
  }
  return {players,allowed};
}

const labels:Record<WnbaPropKey,string>={points:'Points',rebounds:'Rebounds',assists:'Assists',threes:'3PT Made',rebounds_assists:'Reb + Ast',points_rebounds_assists:'Pts + Reb + Ast'};
const edgeFloor:Record<WnbaPropKey,number>={points:2.0,rebounds:1.2,assists:1.0,threes:0.55,rebounds_assists:1.7,points_rebounds_assists:2.8};
function lineValue(x:{points:number;rebounds:number;assists:number;threes:number},key:WnbaPropKey){return key==='points'?x.points:key==='rebounds'?x.rebounds:key==='assists'?x.assists:key==='threes'?x.threes:key==='rebounds_assists'?x.rebounds+x.assists:x.points+x.rebounds+x.assists}
function avg(lines:RecentLine[],key:WnbaPropKey){if(!lines.length)return null;return lines.reduce((s,x)=>s+lineValue(x,key),0)/lines.length}
function avgMinutes(lines:RecentLine[]){const vals=lines.map(x=>x.minutes).filter(x=>x>0);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}
function seasonValue(s:SeasonStats,key:WnbaPropKey){return lineValue(s,key)}
function teamAllowedAvg(lines:TeamLine[],key:WnbaPropKey){if(!lines.length)return null;return lines.reduce((s,x)=>s+lineValue(x,key),0)/lines.length}
function leagueAllowedBaseline(allowed:Map<string,TeamLine[]>,key:WnbaPropKey){const vals=[...allowed.values()].map(x=>teamAllowedAvg(x,key)).filter((x):x is number=>x!==null&&x>0);return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}
function baseProjection(season:number,recent:number|null,recentGames:number){if(recent===null||recentGames<2)return season;const w=Math.min(.42,.2+recentGames*.035);return season*(1-w)+recent*w}
function adjustedProjection(base:number,s:SeasonStats,recentMinutes:number|null,oppAllowed:number|null,leagueAllowed:number|null){
  const roleRatio=recentMinutes&&s.minutes>0?recentMinutes/s.minutes:1;
  const roleFactor=1+clamp(roleRatio-1,-.18,.18)*.35;
  const defenseRatio=oppAllowed&&leagueAllowed&&leagueAllowed>0?oppAllowed/leagueAllowed:1;
  const defenseFactor=1+clamp(defenseRatio-1,-.14,.14)*.35;
  return base*roleFactor*defenseFactor;
}
function confidence(s:SeasonStats,recentGames:number,projection:number,line:number|null,key:WnbaPropKey,bookCount:number,recentMinutes:number|null){
  let score=47+Math.min(18,s.games*.55)+Math.min(12,recentGames*2)+Math.min(8,s.minutes/5);
  if(recentMinutes!==null)score+=3;
  if(line!==null)score+=Math.min(12,Math.abs(projection-line)/edgeFloor[key]*6);
  if(bookCount>=3)score+=7; else if(bookCount>=2)score+=4; else if(bookCount===1)score-=2;
  return Math.max(45,Math.min(95,Math.round(score)));
}
function reasonList(s:SeasonStats,seasonAvg:number,recentAvg:number|null,recentGames:number,recentMinutes:number|null,opp:string,oppAllowed:number|null,leagueAllowed:number|null,line:number|null,proj:number,bookCount:number){
  const r=[`Season baseline ${seasonAvg.toFixed(1)} across ${Math.round(s.games)} games`,`Role baseline ${s.minutes.toFixed(1)} minutes per game`];
  if(recentAvg!==null)r.push(`Recent ${recentGames}-game average ${recentAvg.toFixed(1)}`);
  if(recentMinutes!==null)r.push(`Recent role ${recentMinutes.toFixed(1)} minutes per game`);
  if(oppAllowed!==null&&leagueAllowed!==null&&leagueAllowed>0){const delta=(oppAllowed/leagueAllowed-1)*100;r.push(`${opp} recent allowance ${delta>=0?'+':''}${delta.toFixed(0)}% vs slate average`)}
  if(line!==null)r.push(`Model ${proj>=line?'above':'below'} verified market line by ${Math.abs(proj-line).toFixed(1)}${bookCount?` · ${bookCount} book${bookCount===1?'':'s'}`:''}`);
  return r;
}

async function build():Promise<WnbaPropsPayload>{
  const slate=await getWnbaSlate();
  const teams=[...new Set(slate.games.flatMap(g=>[g.awayTeam,g.homeTeam]))];
  const [recentBundle,lines]=await Promise.all([recentStats(teams),fetchWnbaPropMarketLines(slate.games)]);
  const rosters=new Map<string,any[]>(); await Promise.all(teams.map(async t=>rosters.set(t,await roster(t))));
  const plays:WnbaPropPlay[]=[]; let evaluated=0;
  const keys:WnbaPropKey[]=['points','rebounds','assists','threes','rebounds_assists','points_rebounds_assists'];
  for(const game of slate.games){
    for(const c of game.candidates){
      const rr=rosters.get(c.team)||[],target=norm(c.name);let athlete=rr.find((x:any)=>norm(x?.displayName)===target);if(!athlete){const last=target.split(' ').at(-1);athlete=rr.find((x:any)=>norm(x?.displayName).split(' ').at(-1)===last)}
      if(!athlete?.id)continue; const s=await seasonStats(String(athlete.id),slate.season); if(!s||s.games<3)continue; evaluated++;
      const recentLines=recentBundle.players.get(`${target}|${c.team.toUpperCase()}`)||[];
      const recentMin=avgMinutes(recentLines);
      const opponent=c.team===game.awayTeam?game.homeTeam:game.awayTeam;
      for(const key of keys){
        const seasonAvg=seasonValue(s,key),recentAvg=avg(recentLines,key),base=baseProjection(seasonAvg,recentAvg,recentLines.length);
        const oppAllowed=teamAllowedAvg(recentBundle.allowed.get(opponent.toUpperCase())||[],key);
        const leagueAllowed=leagueAllowedBaseline(recentBundle.allowed,key);
        const proj=adjustedProjection(base,s,recentMin,oppAllowed,leagueAllowed);
        const ml=lines.find(x=>norm(x.player)===target&&x.market===key)??null;
        const edge=ml?proj-ml.line:null,side=edge===null?null:edge>=0?'OVER':'UNDER';
        const requiredEdge=edgeFloor[key]*(ml?.bookCount&&ml.bookCount>=2?1:1.25);
        const isBettable=edge!==null&&Math.abs(edge)>=requiredEdge;
        const conf=confidence(s,recentLines.length,proj,ml?.line??null,key,ml?.bookCount??0,recentMin);
        plays.push({player:c.name,team:c.team,opponent,gameId:game.id,gameTime:game.date,headshot:c.headshot,position:c.position,market:key,marketLabel:labels[key],seasonAverage:round(seasonAvg),recentAverage:recentAvg===null?null:round(recentAvg),recentGames:recentLines.length,recentMinutes:recentMin===null?null:round(recentMin),projection:round(proj),line:ml?.line??null,consensusLine:ml?.consensusLine??null,side:isBettable?side:null,edge:isBettable&&edge!==null?round(Math.abs(edge)):null,confidence:conf,confidenceLabel:conf>=84?'STRONG':conf>=72?'GOOD':'WATCH',isBettable,book:ml?.book??null,odds:ml?.odds??null,bookCount:ml?.bookCount??0,quoteCount:ml?.quoteCount??0,reasons:reasonList(s,seasonAvg,recentAvg,recentLines.length,recentMin,opponent,oppAllowed,leagueAllowed,ml?.line??null,proj,ml?.bookCount??0)});
      }
    }
  }
  plays.sort((a,b)=>Number(b.isBettable)-Number(a.isBettable)||b.confidence-a.confidence||(b.edge??0)-(a.edge??0));
  return {updatedAt:new Date().toISOString(),modelVersion:MODEL_VERSION,source:'ESPN season + recent WNBA box scores + opponent recent allowance + recent role',marketSource:lines.length?'PropLine Pro cross-book verified sportsbook lines':'No verified sportsbook lines currently available',plays,games:slate.games.length,playersEvaluated:evaluated,verifiedLines:plays.filter(x=>x.line!==null).length,note:'WNBA Props V2 remains independent from the sportsbook feed. The PreziTools projection now blends season production, recent form, recent minutes/role and opponent recent allowance. PropLine supplies market validation only. Cross-book depth increases confidence; a one-book market must clear a stricter edge threshold before a betting side is published.'};
}

export async function getWnbaPropProjections(force=false):Promise<WnbaPropsPayload>{if(!force&&cache&&Date.now()-cache.at<CACHE_TTL_MS)return cache.value;if(inFlight)return inFlight;inFlight=build();try{const value=await inFlight;cache={at:Date.now(),value};return value}finally{inFlight=null}}
