import type { ModelGameInput, ModelResult } from './nflModels.js';

export type NflMoneylineV2Result = ModelResult & {
  fairAmericanOdds: number;
  consensusProbability: number | null;
  marketDeltaPoints: number | null;
  uncertaintyPoints: number;
  shadow: true;
  version: 'v2-shadow';
};

export type NflMoneylineV2Pair = {
  away: NflMoneylineV2Result | null;
  home: NflMoneylineV2Result | null;
};

type TeamProfile={ppg:number|null;papg:number|null;ypg:number|null};
const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const profileCache=new Map<string,{expires:number;value:TeamProfile}>();

function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
function norm(v:string){return v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');}
function logit(p:number){const x=clamp(p,0.01,0.99);return Math.log(x/(1-x));}
function sigmoid(x:number){return 1/(1+Math.exp(-x));}
function americanProfit(odds:number){return odds>0?odds/100:100/Math.abs(odds);}
function americanImpliedPct(odds:number){return (odds>0?100/(odds+100):Math.abs(odds)/(Math.abs(odds)+100))*100;}
function ev(probabilityPct:number,odds:number){const p=probabilityPct/100;return p*americanProfit(odds)-(1-p);}
function fairAmerican(probabilityPct:number){const p=clamp(probabilityPct/100,0.001,0.999);return Math.round(p>=0.5?-100*p/(1-p):100*(1-p)/p);}
function parseRecord(record:string|null){if(!record)return null;const m=record.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);if(!m)return null;const w=Number(m[1]),l=Number(m[2]),t=Number(m[3]??0);const games=w+l+t;return games?((w+0.5*t)/games):null;}
function collectStats(node:unknown,out:Map<string,number>){if(!node||typeof node!=='object')return;if(Array.isArray(node)){for(const x of node)collectStats(x,out);return;}const o=node as Record<string,unknown>;const name=typeof o.name==='string'?o.name:typeof o.abbreviation==='string'?o.abbreviation:null;const value=typeof o.value==='number'?o.value:typeof o.value==='string'&&Number.isFinite(Number(o.value))?Number(o.value):null;if(name&&value!==null)out.set(norm(name),value);for(const v of Object.values(o))collectStats(v,out);}
function stat(m:Map<string,number>,...names:string[]){for(const n of names){const v=m.get(norm(n));if(v!==undefined&&Number.isFinite(v))return v;}return null;}

async function teamProfile(team:string):Promise<TeamProfile>{
  const key=team.toUpperCase();const hit=profileCache.get(key);if(hit&&hit.expires>Date.now())return hit.value;
  const season=new Date().getUTCFullYear()-1;
  const urls=[`${ESPN}/teams/${encodeURIComponent(team)}/statistics?season=${season}`,`${ESPN}/teams/${encodeURIComponent(team)}/statistics`];
  for(const url of urls){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const r=await fetch(url,{signal:controller.signal,headers:{'User-Agent':'PreziTools/1.0'}});if(!r.ok)continue;
      const payload=await r.json();const m=new Map<string,number>();collectStats(payload,m);
      const value={ppg:stat(m,'pointsPerGame','avgPoints','points'),papg:stat(m,'pointsAllowedPerGame','avgPointsAllowed','pointsAgainst'),ypg:stat(m,'yardsPerGame','totalYardsPerGame')};
      if(value.ppg!==null||value.papg!==null||value.ypg!==null){profileCache.set(key,{expires:Date.now()+6*60*60*1000,value});return value;}
    }catch{}finally{clearTimeout(timer);}
  }
  const value={ppg:null,papg:null,ypg:null};profileCache.set(key,{expires:Date.now()+60*60*1000,value});return value;
}

export async function modelMoneylineV2(
  game:ModelGameInput,
  awayOdds:number|null,
  homeOdds:number|null,
  awayConsensusNoVigPct:number|null,
  homeConsensusNoVigPct:number|null,
):Promise<NflMoneylineV2Pair>{
  const [awayProfile,homeProfile]=await Promise.all([teamProfile(game.away.abbreviation),teamProfile(game.home.abbreviation)]);
  const awayRecord=parseRecord(game.away.record)??0.5;
  const homeRecord=parseRecord(game.home.record)??0.5;

  let footballRating=(homeRecord-awayRecord)*1.7+0.08;
  if(homeProfile.ppg!==null&&awayProfile.ppg!==null)footballRating+=(homeProfile.ppg-awayProfile.ppg)*0.035;
  if(homeProfile.papg!==null&&awayProfile.papg!==null)footballRating+=(awayProfile.papg-homeProfile.papg)*0.032;
  if(homeProfile.ypg!==null&&awayProfile.ypg!==null)footballRating+=(homeProfile.ypg-awayProfile.ypg)*0.0009;
  const footballHome=clamp(sigmoid(footballRating)*100,24,76);
  const footballAway=100-footballHome;
  const hasEfficiency=awayProfile.ppg!==null||homeProfile.ppg!==null||awayProfile.papg!==null||homeProfile.papg!==null||awayProfile.ypg!==null||homeProfile.ypg!==null;

  const build=(footballPct:number,odds:number|null,consensus:number|null):NflMoneylineV2Result|null=>{
    if(odds===null||!Number.isFinite(odds))return null;
    const implied=americanImpliedPct(odds);
    const marketPct=consensus!==null&&Number.isFinite(consensus)?clamp(consensus,1,99):implied;
    const marketWeight=hasEfficiency?0.68:0.76;
    const footballWeight=1-marketWeight;
    const blended=sigmoid(marketWeight*logit(marketPct/100)+footballWeight*logit(footballPct/100))*100;
    const disagreement=Math.abs(footballPct-marketPct);
    const uncertainty=clamp((hasEfficiency?0.9:1.5)+disagreement*0.12,0.9,5.0);
    const adjusted=clamp(blended+(marketPct-blended)*(uncertainty/20),5,95);
    const edge=adjusted-implied;
    const expected=ev(adjusted,odds);
    const marketDelta=adjusted-marketPct;
    const confidence=edge>=6&&expected>=0.08&&uncertainty<=2.5?'elite':edge>=3&&expected>=0.04&&uncertainty<=3.5?'strong':'watch';
    const qualifies=edge>=3&&expected>=0.04&&uncertainty<=3.5;
    const reasons=['sportsbook consensus used as market prior','previous-season win-strength baseline','home-field adjustment','uncertainty penalty for model/market disagreement'];
    if(hasEfficiency)reasons.splice(2,0,'scoring, defensive scoring, and yardage efficiency signal');
    return{
      modelProbability:+adjusted.toFixed(1),edgePoints:+edge.toFixed(1),expectedValue:+expected.toFixed(3),confidence,qualifies,
      reasons,
      fairAmericanOdds:fairAmerican(adjusted),consensusProbability:consensus===null?null:+marketPct.toFixed(1),marketDeltaPoints:consensus===null?null:+marketDelta.toFixed(1),uncertaintyPoints:+uncertainty.toFixed(1),shadow:true,version:'v2-shadow',
    };
  };

  return{away:build(footballAway,awayOdds,awayConsensusNoVigPct),home:build(footballHome,homeOdds,homeConsensusNoVigPct)};
}
