const PROPLINE_BASE = 'https://api.prop-line.com/v1';
const MARKET_CACHE_MS = 5 * 60 * 1000;

export type FirstInningBookQuote = { bookmaker:string; bookmakerKey:string; selection:'NRFI'|'YRFI'; americanOdds:number; impliedProbability:number; updatedAt:string|null };
export type FirstInningMarket = { selection:'NRFI'|'YRFI'; price:number; book:string; impliedProbability:number; noVigProbability:number; edge:number; ev:number; quotes:FirstInningBookQuote[]; quoteCount:number; capturedAt:string };
export type FirstInningMarketFeed = { status:'live'|'unavailable'|'disabled'; source:'PropLine'; gamesMatched:number; markets:Map<string,{NRFI?:FirstInningMarket;YRFI?:FirstInningMarket}> };
type GameInput = { id:string; gameTime:string; awayName:string; homeName:string; nrfiProbability:number };
type PropOutcome = { name?:string; description?:string; price?:number; point?:number|null; book_updated_at?:string|null; last_change_at?:string|null };
type PropMarket = { key?:string; period?:string|null; team?:string|null; outcomes?:PropOutcome[] };
type PropBook = { key?:string; title?:string; last_update?:string|null; markets?:PropMarket[] };
type PropEvent = { id?:string|number; event_id?:string|number; home_team?:string; away_team?:string; commence_time?:string; bookmakers?:PropBook[] };

let cache:{key:string;expiresAt:number;value:FirstInningMarketFeed}|null=null;
const norm=(v:string)=>v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
function implied(o:number){return o>0?100/(o+100):Math.abs(o)/(Math.abs(o)+100);}
function ev(p:number,o:number){const profit=o>0?o/100:100/Math.abs(o);return(p*profit-(1-p))*100;}
function median(v:number[]){if(!v.length)return NaN;const s=[...v].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function rows(payload:unknown):PropEvent[]{if(Array.isArray(payload))return payload as PropEvent[];if(payload&&typeof payload==='object'){const r=payload as Record<string,unknown>;for(const k of ['events','data','odds'])if(Array.isArray(r[k]))return r[k] as PropEvent[];if(r.data&&typeof r.data==='object'){const n=r.data as Record<string,unknown>;for(const k of ['events','data','odds'])if(Array.isArray(n[k]))return n[k] as PropEvent[];}if('bookmakers'in r||'home_team'in r||'away_team'in r)return[payload as PropEvent];}return[];}
async function propFetch<T>(path:string,key:string):Promise<T>{const sep=path.includes('?')?'&':'?';const c=new AbortController();const t=setTimeout(()=>c.abort(),9000);try{const r=await fetch(`${PROPLINE_BASE}${path}${sep}apiKey=${encodeURIComponent(key)}`,{signal:c.signal,headers:{'X-API-Key':key,'Authorization':`Bearer ${key}`,'User-Agent':'PreziTools/1.0'}});if(!r.ok){const text=await r.text().catch(()=>'');throw new Error(`PropLine ${r.status}${text?`: ${text.slice(0,180)}`:''}`);}return await r.json() as T;}finally{clearTimeout(t);}}
function matches(game:GameInput,row:PropEvent){const h=norm(row.home_team??''),a=norm(row.away_team??''),gh=norm(game.homeName),ga=norm(game.awayName);if(!h||!a)return false;if(!((h===gh||h.includes(gh)||gh.includes(h))&&(a===ga||a.includes(ga)||ga.includes(a))))return false;if(!row.commence_time)return true;const x=new Date(row.commence_time).getTime(),y=new Date(game.gameTime).getTime();return!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x-y)<=4*60*60*1000;}
function firstInningMarket(m:PropMarket){const key=(m.key??'').toLowerCase(),period=(m.period??'').toLowerCase();return !m.team && key.includes('total') && (period==='i1'||period==='1st'||key.includes('i1')||key.includes('first')) ;}
function parseQuotes(payload:unknown){const out:{NRFI:FirstInningBookQuote[];YRFI:FirstInningBookQuote[]}={NRFI:[],YRFI:[]};for(const event of rows(payload))for(const book of event.bookmakers??[])for(const market of book.markets??[]){if(!firstInningMarket(market))continue;for(const o of market.outcomes??[]){const point=Number(o.point);if(Number.isFinite(point)&&Math.abs(point-.5)>.001)continue;const name=String(o.name??o.description??'').toLowerCase();let selection:'NRFI'|'YRFI'|null=null;if(name.includes('under')||name==='no')selection='NRFI';else if(name.includes('over')||name==='yes')selection='YRFI';const price=Number(o.price);if(!selection||!Number.isFinite(price)||price===0)continue;const ip=implied(price);out[selection].push({bookmaker:String(book.title??book.key??'Sportsbook'),bookmakerKey:String(book.key??''),selection,americanOdds:price,impliedProbability:ip,updatedAt:o.book_updated_at??o.last_change_at??book.last_update??null});}}return out;}
function side(selection:'NRFI'|'YRFI',q:FirstInningBookQuote[],opp:FirstInningBookQuote[],modelPct:number):FirstInningMarket|undefined{if(!q.length)return undefined;const sorted=[...q].sort((a,b)=>b.americanOdds-a.americanOdds),best=sorted[0],a=median(q.map(x=>x.impliedProbability)),b=median(opp.map(x=>x.impliedProbability));const nv=Number.isFinite(a)&&Number.isFinite(b)&&a+b>0?a/(a+b):a;const p=Math.max(0,Math.min(1,modelPct/100));return{selection,price:best.americanOdds,book:best.bookmaker,impliedProbability:best.impliedProbability*100,noVigProbability:nv*100,edge:(p-nv)*100,ev:ev(p,best.americanOdds),quotes:sorted,quoteCount:sorted.length,capturedAt:new Date().toISOString()};}
function attach(out:Map<string,{NRFI?:FirstInningMarket;YRFI?:FirstInningMarket}>,game:GameInput,payload:unknown){const q=parseQuotes(payload);const nrfi=side('NRFI',q.NRFI,q.YRFI,game.nrfiProbability),yrfi=side('YRFI',q.YRFI,q.NRFI,100-game.nrfiProbability);if(nrfi||yrfi)out.set(game.id,{NRFI:nrfi,YRFI:yrfi});}

export async function fetchFirstInningMarkets(games:GameInput[]):Promise<FirstInningMarketFeed>{
  const apiKey=process.env.PROPLINE_API_KEY?.trim();
  if(!apiKey)return{status:'disabled',source:'PropLine',gamesMatched:0,markets:new Map()};
  if(!games.length)return{status:'live',source:'PropLine',gamesMatched:0,markets:new Map()};
  const key=games.map(g=>`${g.id}:${g.gameTime}:${g.nrfiProbability}`).sort().join('|');
  if(cache&&cache.key===key&&cache.expiresAt>Date.now())return cache.value;
  const markets=new Map<string,{NRFI?:FirstInningMarket;YRFI?:FirstInningMarket}>();
  let matched=0;
  try{
    try{
      const bulk=await propFetch<unknown>('/sports/baseball_mlb/odds?markets=totals&period=i1',apiKey);
      const bulkRows=rows(bulk);
      for(const game of games){const row=bulkRows.find(r=>matches(game,r));if(row){matched++;attach(markets,game,row);}}
    }catch(error){console.warn('[MLB NRFI] Bulk PropLine first-inning odds failed:',error);}
    if(markets.size<games.length){
      let events:PropEvent[]=[];
      try{events=rows(await propFetch<unknown>('/sports/baseball_mlb/events',apiKey));}catch(error){console.warn('[MLB NRFI] PropLine events failed:',error);}
      for(const game of games){if(markets.has(game.id))continue;const event=events.find(r=>matches(game,r));const eventId=event?.id??event?.event_id;if(eventId===undefined||eventId===null)continue;matched++;try{const payload=await propFetch<unknown>(`/sports/baseball_mlb/events/${encodeURIComponent(String(eventId))}/odds?markets=totals&period=i1`,apiKey);attach(markets,game,payload);}catch(error){console.warn(`[MLB NRFI] First-inning odds failed for ${game.id}:`,error);}}
    }
    const value:FirstInningMarketFeed={status:markets.size?'live':'unavailable',source:'PropLine',gamesMatched:matched,markets};cache={key,expiresAt:Date.now()+MARKET_CACHE_MS,value};return value;
  }catch(error){console.warn('[MLB NRFI] PropLine market feed unavailable:',error);const value:FirstInningMarketFeed={status:'unavailable',source:'PropLine',gamesMatched:matched,markets};cache={key,expiresAt:Date.now()+60_000,value};return value;}
}
