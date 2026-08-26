const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const ESPN_WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl';
const MODEL_CACHE_MS = 6 * 60 * 60 * 1000;

export type ModelConfidence = 'watch' | 'strong' | 'elite';
export type ModelResult = {
  modelProbability: number;
  edgePoints: number;
  expectedValue: number;
  confidence: ModelConfidence;
  qualifies: boolean;
  reasons: string[];
};

export type ModelPlayerMarket = {
  player: string;
  bestOdds: number;
  bestBook: string;
  impliedProbability: number;
  quoteCount: number;
};

export type ModelTeamSide = {
  abbreviation: string;
  name: string;
  record: string | null;
};

export type ModelGameInput = {
  away: ModelTeamSide;
  home: ModelTeamSide;
};

const jsonCache = new Map<string,{expires:number;value:unknown}>();
const rosterCache = new Map<string,{expires:number;players:{id:string;name:string;position:string}[]}>();

function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
function norm(v:string){return v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function sigmoid(x:number){return 1/(1+Math.exp(-x));}
function americanProfit(odds:number){return odds>0?odds/100:100/Math.abs(odds);}
function americanImpliedPct(odds:number){return (odds>0?100/(odds+100):Math.abs(odds)/(Math.abs(odds)+100))*100;}
function ev(probabilityPct:number,odds:number){const p=probabilityPct/100;return p*americanProfit(odds)-(1-p);}
function parseRecord(record:string|null){if(!record)return null;const m=record.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);if(!m)return null;const w=Number(m[1]),l=Number(m[2]),t=Number(m[3]??0);const games=w+l+t;return games?((w+0.5*t)/games):null;}

async function getJson<T>(url:string,ttl=MODEL_CACHE_MS):Promise<T>{
  const hit=jsonCache.get(url);if(hit&&hit.expires>Date.now())return hit.value as T;
  const c=new AbortController();const timer=setTimeout(()=>c.abort(),9000);
  try{const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'PreziTools/1.0'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const value=await r.json() as T;jsonCache.set(url,{expires:Date.now()+ttl,value});return value;}finally{clearTimeout(timer);}
}

function collectStats(node:unknown,out:Map<string,number>){
  if(!node||typeof node!=='object')return;
  if(Array.isArray(node)){for(const x of node)collectStats(x,out);return;}
  const o=node as Record<string,unknown>;
  const name=typeof o.name==='string'?o.name:typeof o.abbreviation==='string'?o.abbreviation:null;
  const value=typeof o.value==='number'?o.value:typeof o.value==='string'&&Number.isFinite(Number(o.value))?Number(o.value):null;
  if(name&&value!==null)out.set(norm(name),value);
  for(const v of Object.values(o))collectStats(v,out);
}
function stat(map:Map<string,number>,...names:string[]){for(const n of names){const v=map.get(norm(n));if(v!==undefined&&Number.isFinite(v))return v;}return null;}

async function teamProfile(team:string){
  const season=new Date().getUTCFullYear()-1;
  const urls=[`${ESPN_SITE}/teams/${encodeURIComponent(team)}/statistics?season=${season}`,`${ESPN_SITE}/teams/${encodeURIComponent(team)}/statistics`];
  for(const url of urls){try{const payload=await getJson<unknown>(url);const m=new Map<string,number>();collectStats(payload,m);const ppg=stat(m,'pointsPerGame','avgPoints','points');const papg=stat(m,'pointsAllowedPerGame','avgPointsAllowed','pointsAgainst');const ypg=stat(m,'yardsPerGame','totalYardsPerGame');if(ppg!==null||ypg!==null)return{ppg,papg,ypg};}catch{} }
  return{ppg:null,papg:null,ypg:null};
}

export async function modelMoneyline(game:ModelGameInput,awayOdds:number|null,homeOdds:number|null){
  const [away,home]=await Promise.all([teamProfile(game.away.abbreviation),teamProfile(game.home.abbreviation)]);
  const awayRecord=parseRecord(game.away.record)??0.5;const homeRecord=parseRecord(game.home.record)??0.5;
  let rating=(homeRecord-awayRecord)*2.4+0.12;
  if(home.ppg!==null&&away.ppg!==null)rating+=(home.ppg-away.ppg)*0.055;
  if(home.papg!==null&&away.papg!==null)rating+=(away.papg-home.papg)*0.045;
  if(home.ypg!==null&&away.ypg!==null)rating+=(home.ypg-away.ypg)*0.0015;
  const homeProb=clamp(sigmoid(rating)*100,20,80);const awayProb=100-homeProb;
  const build=(prob:number,odds:number|null):ModelResult|null=>{
    if(odds===null||!Number.isFinite(odds))return null;
    const implied=americanImpliedPct(odds);const edge=prob-implied;const expected=ev(prob,odds);
    const confidence:ModelConfidence=edge>=6&&expected>=0.08?'elite':edge>=3&&expected>=0.04?'strong':'watch';
    return{modelProbability:+prob.toFixed(1),edgePoints:+edge.toFixed(1),expectedValue:+expected.toFixed(3),confidence,qualifies:edge>=3&&expected>=0.04,reasons:['independent team-strength rating','previous-season scoring/defense baseline','home-field adjustment']};
  };
  return{away:build(awayProb,awayOdds),home:build(homeProb,homeOdds)};
}

async function roster(team:string){
  const key=team.toUpperCase();const hit=rosterCache.get(key);if(hit&&hit.expires>Date.now())return hit.players;
  try{const payload=await getJson<any>(`${ESPN_SITE}/teams/${encodeURIComponent(team)}/roster`);const players:{id:string;name:string;position:string}[]=[];const walk=(node:any)=>{if(!node)return;if(Array.isArray(node)){node.forEach(walk);return;}if(typeof node!=='object')return;const id=node.id??node.athlete?.id;const name=node.fullName??node.displayName??node.athlete?.fullName??node.athlete?.displayName;const position=node.position?.abbreviation??node.athlete?.position?.abbreviation;if(id&&name)players.push({id:String(id),name:String(name),position:String(position??'')});Object.values(node).forEach(walk);};walk(payload);const unique=[...new Map(players.map(p=>[p.id,p])).values()];rosterCache.set(key,{expires:Date.now()+MODEL_CACHE_MS,players:unique});return unique;}catch{return[];}
}

async function playerBaseline(playerName:string,teams:string[]){
  for(const team of teams){const players=await roster(team);const target=norm(playerName);const found=players.find(p=>norm(p.name)===target)||players.find(p=>norm(p.name).endsWith(target)||target.endsWith(norm(p.name)));if(!found)continue;const season=new Date().getUTCFullYear()-1;try{const payload=await getJson<unknown>(`${ESPN_WEB}/athletes/${encodeURIComponent(found.id)}/stats?season=${season}&seasontype=2`);const m=new Map<string,number>();collectStats(payload,m);const rush=stat(m,'rushingTouchdowns','rushTouchdowns')??0;const rec=stat(m,'receivingTouchdowns','recTouchdowns')??0;const games=stat(m,'gamesPlayed','games')??17;const touches=(stat(m,'rushingAttempts','carries')??0)+(stat(m,'receptions')??0);return{position:found.position,td:rush+rec,games:Math.max(1,games),touches};}catch{return{position:found.position,td:0,games:17,touches:0};}}
  return null;
}

export async function qualifyTdMarkets(game:ModelGameInput,rows:ModelPlayerMarket[],kind:'anytime'|'first'){
  const output:Array<ModelPlayerMarket&ModelResult>=[];const teams=[game.away.abbreviation,game.home.abbreviation];
  for(const row of rows){const base=await playerBaseline(row.player,teams);if(!base)continue;const tdPerGame=base.td/base.games;const usageBoost=clamp(base.touches/base.games/20,0,0.18);let probability=kind==='anytime'?(1-Math.exp(-(tdPerGame+usageBoost)))*100:(1-Math.exp(-(tdPerGame+usageBoost)))*22;if(['RB','WR','TE'].includes(base.position))probability*=1.05;probability=clamp(probability,kind==='anytime'?2:0.8,kind==='anytime'?72:24);const edge=probability-row.impliedProbability;const expected=ev(probability,row.bestOdds);const minBooks=kind==='first'?2:1;const minEdge=kind==='first'?3.5:2.5;const minEv=kind==='first'?0.08:0.05;const confidence:ModelConfidence=edge>=7&&expected>=0.12?'elite':edge>=minEdge&&expected>=minEv?'strong':'watch';const qualifies=row.quoteCount>=minBooks&&edge>=minEdge&&expected>=minEv&&(kind==='first'?probability>=5:probability>=18);if(qualifies)output.push({...row,modelProbability:+probability.toFixed(1),edgePoints:+edge.toFixed(1),expectedValue:+expected.toFixed(3),confidence,qualifies:true,reasons:[`${base.td} TD in ${base.games} games last season`,`${base.position||'skill'} role`,`${base.touches} season touches`,`${row.quoteCount} sportsbook quote${row.quoteCount===1?'':'s'}`]});}
  return output.sort((a,b)=>b.expectedValue-a.expectedValue||b.modelProbability-a.modelProbability).slice(0,kind==='first'?5:8);
}
