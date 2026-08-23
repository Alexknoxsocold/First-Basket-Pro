import {
  expectedValuePerDollar,
  formatAmericanOdds,
  modelEdgePoints,
  parseAmericanOdds,
  qualifiesAsMarketValue,
} from './normalized';

const SGO_URL = 'https://api.sportsgameodds.com/v2/events';
const CACHE_TTL_MS = 10 * 60 * 1000;

type SgoEvent = Record<string, any>;
type SgoRow = { playerName:string; sportsbook:string; odds:number; lastUpdate:string|null };

export type SportsGameOddsWnbaMarket = {
  source:'SportsGameOdds'; market:'player_first_basket'; bestOdds:number; bestOddsDisplay:string; bestBook:string;
  fanduelOdds:number|null; draftkingsOdds:number|null; impliedProbability:number; edgePoints:number;
  expectedValue:number; qualifiesValue:boolean; lastUpdate:string|null;
};

export type SportsGameOddsDiagnostics = {
  keyConfigured:boolean; lastHttpStatus:number|null; eventCount:number; firstBasketMarketCount:number;
  draftkingsRows:number; fanduelRows:number; sample:Array<{player:string;book:string;odds:number}>;
  lastFetchAt:string|null; error:string|null; requestMode:'full'|'minimal'|null;
};

let cache:{at:number;rows:SgoRow[]}|null=null;
let inFlight:Promise<SgoRow[]>|null=null;
let diagnostics:SportsGameOddsDiagnostics={keyConfigured:Boolean(process.env.SPORTSGAMEODDS_API_KEY),lastHttpStatus:null,eventCount:0,firstBasketMarketCount:0,draftkingsRows:0,fanduelRows:0,sample:[],lastFetchAt:null,error:null,requestMode:null};

function normalizeName(value:unknown){return String(value??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[.'’\-]/g,'').replace(/\s+/g,' ').trim()}
function playerNameFromId(playerId:string){const parts=playerId.split('_');if(parts.length>=3&&/^\d+$/.test(parts[parts.length-2]))parts.splice(parts.length-2,2);return parts.map(part=>part?part[0]+part.slice(1).toLowerCase():'').join(' ').trim()}
function eventPlayerName(event:SgoEvent,playerId:string){const players=event?.players;if(players&&typeof players==='object'){const player=Array.isArray(players)?players.find((p:any)=>p?.playerID===playerId||p?.id===playerId):players[playerId]??Object.values(players).find((p:any)=>p?.playerID===playerId||p?.id===playerId);if(player){const names=(player as any).names??(player as any).name;const display=typeof names==='string'?names:names?.display??names?.full??names?.long??names?.short;if(display)return String(display)}}return playerNameFromId(playerId)}

function firstBasketOdds(event:SgoEvent):SgoRow[]{const rows:SgoRow[]=[];const odds=event?.odds&&typeof event.odds==='object'?Object.values(event.odds):[];for(const odd of odds as any[]){if(String(odd?.statID??'').toLowerCase()!=='firstbasket')continue;const playerId=String(odd?.playerID??odd?.statEntityID??'').trim();if(!playerId||['home','away','all'].includes(playerId.toLowerCase()))continue;const playerName=eventPlayerName(event,playerId),byBook=odd?.byBookmaker&&typeof odd.byBookmaker==='object'?odd.byBookmaker:{};for(const book of ['draftkings','fanduel']){const quote=byBook[book];if(!quote||quote.available===false)continue;const parsed=parseAmericanOdds(quote.odds??quote.price??null);if(parsed===null)continue;rows.push({playerName,sportsbook:book==='draftkings'?'DraftKings':'FanDuel',odds:parsed,lastUpdate:quote.lastUpdatedAt??quote.updatedAt??null})}}return rows}

function safeErrorText(text:string){return text.replace(/apiKey=[^&\s\"]+/gi,'apiKey=[redacted]').replace(/[A-Za-z0-9_-]{24,}/g,'[redacted]').slice(0,300)}
async function makeRequest(apiKey:string,full:boolean){const url=new URL(SGO_URL);url.searchParams.set('leagueID','WNBA');url.searchParams.set('oddsAvailable','true');url.searchParams.set('limit','25');if(full)url.searchParams.set('bookmakerID','draftkings,fanduel');const response=await fetch(url,{headers:{'x-api-key':apiKey,Accept:'application/json'},signal:AbortSignal.timeout(8000)});const text=await response.text();let payload:any=null;try{payload=text?JSON.parse(text):null}catch{}return{response,text,payload}}

async function requestRows():Promise<SgoRow[]>{const apiKey=process.env.SPORTSGAMEODDS_API_KEY;if(!apiKey){diagnostics={...diagnostics,keyConfigured:false,error:'SPORTSGAMEODDS_API_KEY is not configured'};return[]}
  try{
    let result=await makeRequest(apiKey,true),mode:'full'|'minimal'='full';
    if(!result.response.ok){console.warn(`[SportsGameOdds] full WNBA request failed: ${result.response.status} ${safeErrorText(result.text)}`);result=await makeRequest(apiKey,false);mode='minimal'}
    diagnostics={...diagnostics,keyConfigured:true,lastHttpStatus:result.response.status,lastFetchAt:new Date().toISOString(),requestMode:mode,error:result.response.ok?null:safeErrorText(result.text)};
    if(!result.response.ok){console.warn(`[SportsGameOdds] minimal WNBA request failed: ${result.response.status} ${safeErrorText(result.text)}`);return cache?.rows??[]}
    const payload=result.payload,events:SgoEvent[]=Array.isArray(payload?.data)?payload.data:Array.isArray(payload)?payload:[],rows=events.flatMap(firstBasketOdds);
    diagnostics={keyConfigured:true,lastHttpStatus:result.response.status,eventCount:events.length,firstBasketMarketCount:rows.length,draftkingsRows:rows.filter(r=>r.sportsbook==='DraftKings').length,fanduelRows:rows.filter(r=>r.sportsbook==='FanDuel').length,sample:rows.slice(0,8).map(r=>({player:r.playerName,book:r.sportsbook,odds:r.odds})),lastFetchAt:new Date().toISOString(),error:null,requestMode:mode};
    cache={at:Date.now(),rows};console.log('[SportsGameOdds][WNBA diagnostics]',JSON.stringify(diagnostics));return rows;
  }catch(error){const message=error instanceof Error?error.message:String(error);diagnostics={...diagnostics,lastFetchAt:new Date().toISOString(),error:safeErrorText(message)};console.warn('[SportsGameOdds] WNBA request error:',safeErrorText(message));return cache?.rows??[]}}

async function fetchRows(){if(cache&&Date.now()-cache.at<CACHE_TTL_MS)return cache.rows;if(inFlight)return inFlight;inFlight=requestRows();try{return await inFlight}finally{inFlight=null}}
export function getSportsGameOddsWnbaDiagnostics():SportsGameOddsDiagnostics{return{...diagnostics,sample:diagnostics.sample.map(r=>({...r}))}}
export async function getSportsGameOddsWnbaMarket(playerName:string,modelProbabilityPct:number,rank:number):Promise<SportsGameOddsWnbaMarket|null>{const rows=await fetchRows(),target=normalizeName(playerName),matches=rows.filter(r=>normalizeName(r.playerName)===target).sort((a,b)=>b.odds-a.odds);if(!matches.length)return null;const best=matches[0],fanduel=matches.filter(r=>r.sportsbook==='FanDuel').sort((a,b)=>b.odds-a.odds)[0]?.odds??null,draftkings=matches.filter(r=>r.sportsbook==='DraftKings').sort((a,b)=>b.odds-a.odds)[0]?.odds??null,edgePoints=modelEdgePoints(modelProbabilityPct,best.odds),expectedValue=expectedValuePerDollar(modelProbabilityPct,best.odds);return{source:'SportsGameOdds',market:'player_first_basket',bestOdds:best.odds,bestOddsDisplay:formatAmericanOdds(best.odds),bestBook:best.sportsbook,fanduelOdds:fanduel,draftkingsOdds:draftkings,impliedProbability:Math.max(0,modelProbabilityPct-edgePoints),edgePoints,expectedValue,qualifiesValue:rank===3&&qualifiesAsMarketValue(modelProbabilityPct,best.odds),lastUpdate:best.lastUpdate}}
