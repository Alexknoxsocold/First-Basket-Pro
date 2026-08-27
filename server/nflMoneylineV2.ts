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

function clamp(v:number,min:number,max:number){return Math.max(min,Math.min(max,v));}
function logit(p:number){const x=clamp(p,0.01,0.99);return Math.log(x/(1-x));}
function sigmoid(x:number){return 1/(1+Math.exp(-x));}
function americanProfit(odds:number){return odds>0?odds/100:100/Math.abs(odds);}
function americanImpliedPct(odds:number){return (odds>0?100/(odds+100):Math.abs(odds)/(Math.abs(odds)+100))*100;}
function ev(probabilityPct:number,odds:number){const p=probabilityPct/100;return p*americanProfit(odds)-(1-p);}
function fairAmerican(probabilityPct:number){const p=clamp(probabilityPct/100,0.001,0.999);return Math.round(p>=0.5?-100*p/(1-p):100*(1-p)/p);}
function parseRecord(record:string|null){if(!record)return null;const m=record.match(/(\d+)\s*-\s*(\d+)(?:\s*-\s*(\d+))?/);if(!m)return null;const w=Number(m[1]),l=Number(m[2]),t=Number(m[3]??0);const games=w+l+t;return games?((w+0.5*t)/games):null;}

/**
 * NFL Moneyline V2 shadow model.
 *
 * This intentionally starts as a conservative challenger rather than replacing V1.
 * The sportsbook consensus is treated as the strongest prior while team record and
 * home field provide an independent football signal. Future feature modules (EPA,
 * QB/injury, rest/travel and weather) can feed the footballSignal logit without
 * changing the evaluation contract.
 */
export async function modelMoneylineV2(
  game:ModelGameInput,
  awayOdds:number|null,
  homeOdds:number|null,
  awayConsensusNoVigPct:number|null,
  homeConsensusNoVigPct:number|null,
):Promise<NflMoneylineV2Pair>{
  const awayRecord=parseRecord(game.away.record)??0.5;
  const homeRecord=parseRecord(game.home.record)??0.5;

  // Independent football baseline. Home field is deliberately modest because the
  // market prior already contains venue information.
  const footballHome=clamp(sigmoid((homeRecord-awayRecord)*2.0+0.10)*100,25,75);
  const footballAway=100-footballHome;

  const build=(footballPct:number,odds:number|null,consensus:number|null):NflMoneylineV2Result|null=>{
    if(odds===null||!Number.isFinite(odds))return null;
    const implied=americanImpliedPct(odds);
    const marketPct=consensus!==null&&Number.isFinite(consensus)?clamp(consensus,1,99):implied;

    // 72% market prior / 28% independent football signal in log-odds space.
    // This is intentionally conservative for the shadow period and prevents V1-style
    // false edges caused by comparing a basic rating directly with one book's price.
    const blended=sigmoid(0.72*logit(marketPct/100)+0.28*logit(footballPct/100))*100;
    const disagreement=Math.abs(footballPct-marketPct);
    const uncertainty=clamp(1.0+disagreement*0.12,1.0,5.0);

    // Pull high-disagreement forecasts back toward the consensus before betting.
    const adjusted=clamp(blended+(marketPct-blended)*(uncertainty/20),5,95);
    const edge=adjusted-implied;
    const expected=ev(adjusted,odds);
    const marketDelta=adjusted-marketPct;
    const confidence=edge>=6&&expected>=0.08&&uncertainty<=2.5?'elite':edge>=3&&expected>=0.04&&uncertainty<=3.5?'strong':'watch';
    const qualifies=edge>=3&&expected>=0.04&&uncertainty<=3.5;

    return{
      modelProbability:+adjusted.toFixed(1),
      edgePoints:+edge.toFixed(1),
      expectedValue:+expected.toFixed(3),
      confidence,
      qualifies,
      reasons:[
        'sportsbook consensus used as market prior',
        'independent team-strength challenger signal',
        'home-field adjustment',
        'uncertainty penalty for model/market disagreement',
      ],
      fairAmericanOdds:fairAmerican(adjusted),
      consensusProbability:consensus===null?null:+marketPct.toFixed(1),
      marketDeltaPoints:consensus===null?null:+marketDelta.toFixed(1),
      uncertaintyPoints:+uncertainty.toFixed(1),
      shadow:true,
      version:'v2-shadow',
    };
  };

  return{
    away:build(footballAway,awayOdds,awayConsensusNoVigPct),
    home:build(footballHome,homeOdds,homeConsensusNoVigPct),
  };
}
