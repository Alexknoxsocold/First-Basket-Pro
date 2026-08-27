import type { ModelGameInput, ModelResult } from './nflModels.js';

export type NflMoneylineV2Result = ModelResult & {
  fairAmericanOdds: number;
  consensusProbability: number | null;
  marketDeltaPoints: number | null;
  uncertaintyPoints: number;
  shadow: true;
  version: 'v2-shadow';
};

export type NflMoneylineV2Pair = { away:NflMoneylineV2Result|null; home:NflMoneylineV2Result|null };
type TeamProfile={ppg:number|null;papg:number|null;ypg:number|null};
type Availability={qbPenalty:number;injuryPenalty:number;qbNote:string|null;injuryCount:number};
const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CACHE_MS=6*60*60*1000;
const profileCache=new Map<string,{expires:number;value:TeamProfile}>();
const availabilityCache=new Map<string,{expires:number;value:Availability}>();
function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
function norm(v:string){return v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function logit(p:number){const x=clamp(p,0.01,0.99);return Math.log(x/(1-x));}
function sigmoid(x:number){return 1/(1+Math.exp(-x));}
function americanProfit(o:number){return o>0?o/100:100/Math.abs(o);}
function americanImpliedPct(o:number){return (o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100))*100;}
function ev(pct:number,o:number){const p=pct/100;return p*americanProfit(o)-(1-p);}
function fairAmerican(pct:number){const p=clamp(pct/100,.001,.999);return Math.round(p>=.5?-100*p/(1-p):100*(1-p)/p);}
function parseRecord(r:string|null){if(!r)return null;const m=r.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);if(!m)return null;const w=+m[1],l=+m[2],t=+(m[3]??0),g=w+l+t;return g?(w+.5*t)/g:null;}
function collectStats(node:unknown,out:Map<string,number>){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(x=>collectStats(x,out));return;}const o=node as Record<string,unknown>,name=typeof o.name==='string'?o.name:typeof o.abbreviation==='string'?o.abbreviation:null,value=typeof o.value==='number'?o.value:typeof o.value==='string'&&Number.isFinite(Number(o.value))?Number(o.value):null;if(name&&value!==null)out.set(norm(name),value);Object.values(o).forEach(v=>collectStats(v,out));}
function stat(m:Map<string,number>,...names:string[]){for(const n of names){const v=m.get(norm(n));if(v!==undefined&&Number.isFinite(v))return v;}return null;}
async function json(url:string,timeout=5000){const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{signal:c.signal,headers:{'User-Agent':'PreziTools/1.0'}});if(!r.ok)throw new Error(String(r.status));return await r.json();}finally{clearTimeout(timer);}}
async function teamProfile(team:string):Promise<TeamProfile>{const key=team.toUpperCase(),hit=profileCache.get(key);if(hit&&hit.expires>Date.now())return hit.value;const season=new Date().getUTCFullYear()-1;for(const url of [`${ESPN}/teams/${encodeURIComponent(team)}/statistics?season=${season}`,`${ESPN}/teams/${encodeURIComponent(team)}/statistics`]){try{const payload=await json(url),m=new Map<string,number>();collectStats(payload,m);const value={ppg:stat(m,'pointsPerGame','avgPoints','points'),papg:stat(m,'pointsAllowedPerGame','avgPointsAllowed','pointsAgainst'),ypg:stat(m,'yardsPerGame','totalYardsPerGame')};if(Object.values(value).some(v=>v!==null)){profileCache.set(key,{expires:Date.now()+CACHE_MS,value});return value;}}catch{}}const value={ppg:null,papg:null,ypg:null};profileCache.set(key,{expires:Date.now()+60*60*1000,value});return value;}
function walk(node:any,fn:(o:any)=>void){if(!node)return;if(Array.isArray(node)){node.forEach(x=>walk(x,fn));return;}if(typeof node!=='object')return;fn(node);Object.values(node).forEach(x=>walk(x,fn));}
async function availability(team:string):Promise<Availability>{const key=team.toUpperCase(),hit=availabilityCache.get(key);if(hit&&hit.expires>Date.now())return hit.value;let value:Availability={qbPenalty:0,injuryPenalty:0,qbNote:null,injuryCount:0};try{const payload=await json(`${ESPN}/teams/${encodeURIComponent(team)}/injuries`,4500);let skill=0,critical=0;walk(payload,(o:any)=>{const athlete=o.athlete??o;const pos=String(athlete?.position?.abbreviation??o.position?.abbreviation??'').toUpperCase();const name=String(athlete?.displayName??athlete?.fullName??o.displayName??'');const status=String(o.status??o.type?.description??o.type?.name??'').toLowerCase();if(!name||!status)return;const out=/out|injured reserve|ir\b/.test(status),doubt=/doubtful/.test(status),question=/questionable/.test(status);if(!(out||doubt||question))return;value.injuryCount++;const severity=out?1:doubt?.7:.25;if(pos==='QB'){value.qbPenalty=Math.max(value.qbPenalty,severity*(out?0.75:0.45));value.qbNote=`${name} ${status}`;}else if(['WR','RB','TE','OT','T','G','C','DE','DT','LB','CB','S'].includes(pos)){skill+=severity;if(out||doubt)critical++;}});value.injuryPenalty=clamp(skill*.018+critical*.012,0,.16);}catch{}availabilityCache.set(key,{expires:Date.now()+30*60*1000,value});return value;}

export async function modelMoneylineV2(game:ModelGameInput,awayOdds:number|null,homeOdds:number|null,awayConsensusNoVigPct:number|null,homeConsensusNoVigPct:number|null):Promise<NflMoneylineV2Pair>{
 const [ap,hp,aa,ha]=await Promise.all([teamProfile(game.away.abbreviation),teamProfile(game.home.abbreviation),availability(game.away.abbreviation),availability(game.home.abbreviation)]);
 const ar=parseRecord(game.away.record)??.5,hr=parseRecord(game.home.record)??.5;
 let rating=(hr-ar)*1.7+.08;if(hp.ppg!==null&&ap.ppg!==null)rating+=(hp.ppg-ap.ppg)*.035;if(hp.papg!==null&&ap.papg!==null)rating+=(ap.papg-hp.papg)*.032;if(hp.ypg!==null&&ap.ypg!==null)rating+=(hp.ypg-ap.ypg)*.0009;
 rating+=(aa.qbPenalty-ha.qbPenalty)+(aa.injuryPenalty-ha.injuryPenalty);
 const fh=clamp(sigmoid(rating)*100,24,76),fa=100-fh,hasEff=Object.values(ap).some(v=>v!==null)||Object.values(hp).some(v=>v!==null),hasAvailability=aa.injuryCount>0||ha.injuryCount>0;
 const build=(footballPct:number,odds:number|null,consensus:number|null,own:Availability,opp:Availability):NflMoneylineV2Result|null=>{if(odds===null||!Number.isFinite(odds))return null;const implied=americanImpliedPct(odds),marketPct=consensus!==null&&Number.isFinite(consensus)?clamp(consensus,1,99):implied,marketWeight=hasEff?.68:.76,blended=sigmoid(marketWeight*logit(marketPct/100)+(1-marketWeight)*logit(footballPct/100))*100,disagreement=Math.abs(footballPct-marketPct),availabilityUncertainty=(own.qbPenalty>0||opp.qbPenalty>0)?.35:0,uncertainty=clamp((hasEff?.9:1.5)+disagreement*.12+availabilityUncertainty,.9,5),adjusted=clamp(blended+(marketPct-blended)*(uncertainty/20),5,95),edge=adjusted-implied,expected=ev(adjusted,odds),delta=adjusted-marketPct,confidence=edge>=6&&expected>=.08&&uncertainty<=2.5?'elite':edge>=3&&expected>=.04&&uncertainty<=3.5?'strong':'watch',qualifies=edge>=3&&expected>=.04&&uncertainty<=3.5,reasons=['sportsbook consensus used as market prior','previous-season win-strength baseline','home-field adjustment','uncertainty penalty for model/market disagreement'];if(hasEff)reasons.splice(2,0,'scoring, defensive scoring, and yardage efficiency signal');if(hasAvailability)reasons.splice(reasons.length-1,0,'QB availability and injury-impact adjustment');if(own.qbNote)reasons.push(`own QB flag: ${own.qbNote}`);if(opp.qbNote)reasons.push(`opponent QB flag: ${opp.qbNote}`);return{modelProbability:+adjusted.toFixed(1),edgePoints:+edge.toFixed(1),expectedValue:+expected.toFixed(3),confidence,qualifies,reasons,fairAmericanOdds:fairAmerican(adjusted),consensusProbability:consensus===null?null:+marketPct.toFixed(1),marketDeltaPoints:consensus===null?null:+delta.toFixed(1),uncertaintyPoints:+uncertainty.toFixed(1),shadow:true,version:'v2-shadow'};};
 return{away:build(fa,awayOdds,awayConsensusNoVigPct,aa,ha),home:build(fh,homeOdds,homeConsensusNoVigPct,ha,aa)};
}
