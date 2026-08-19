import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Clock, RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type MlbGame={gamePk?:number;id?:string;away?:string|{abbreviation?:string;name?:string};home?:string|{abbreviation?:string;name?:string};gameTime?:string;date?:string;shortName?:string;recommendation?:string;pick?:string;playStatus?:'BEST_PLAY'|'PLAY'|'LEAN'|'NO_PLAY';confidence?:string;nrfiProbability?:number;yrfiProbability?:number;probability?:number;modelEdge?:number;edge?:number};
type WnbaCandidate={name:string;team:string;probability:number;rank:number;headshot?:string|null};
type WnbaGame={id:string;date:string;awayTeam:string;homeTeam:string;lineupStatus:string;candidates:WnbaCandidate[];topPick:WnbaCandidate|null};
type WnbaSlate={games:WnbaGame[]};
type NflGame={id:string;date:string;away:{abbr:string;name:string;winProbability:number|null};home:{abbr:string;name:string;winProbability:number|null};market?:{favorite?:string|null;spread?:number|null;overUnder?:number|null}};
type NflSlate={games:NflGame[]};
type Play={id:string;sport:'MLB'|'WNBA'|'NFL';market:string;matchup:string;pick:string;probability:number;time:string;tier:'BEST PLAY'|'STRONG PLAY'|'VALUE';note:string;href:string;headshot?:string|null};

function gameTime(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?'Time pending':d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET'}
function tier(prob:number):Play['tier']{return prob>=62?'BEST PLAY':prob>=56?'STRONG PLAY':'VALUE'}
function tierClass(t:Play['tier']){return t==='BEST PLAY'?'bg-emerald-500/15 text-emerald-600 border-emerald-500/30':t==='STRONG PLAY'?'bg-primary/10 text-primary border-primary/25':'bg-yellow-500/15 text-yellow-600 border-yellow-500/30'}
function teamName(team:MlbGame['away']){if(typeof team==='string')return team;if(!team)return 'TBD';return team.abbreviation||team.name||'TBD'}

export default function BestPlays(){
 const mlb=useQuery<any>({queryKey:['/api/mlb/nrfi'],staleTime:60000,refetchInterval:60000,retry:1});
 const wnba=useQuery<WnbaSlate>({queryKey:['/api/wnba/first-basket'],staleTime:60000,refetchInterval:120000,retry:1});
 const nfl=useQuery<NflSlate>({queryKey:['/api/nfl/slate'],staleTime:60000,refetchInterval:120000,retry:1});
 const plays=useMemo(()=>{
   const out:Play[]=[];
   const mg:MlbGame[]=Array.isArray(mlb.data)?mlb.data:(mlb.data?.games||[]);
   for(const g of mg){
     const rec=(g.recommendation||g.pick||'').toUpperCase();
     const status=g.playStatus;
     if(!rec||status==='NO_PLAY'||rec.includes('NO PLAY'))continue;
     const isNrfi=rec.includes('NRFI');
     const nrfi=Number(g.nrfiProbability);
     const explicitYrfi=Number(g.yrfiProbability);
     const fallback=Number(g.probability);
     const p=isNrfi?(Number.isFinite(nrfi)?nrfi:fallback):(Number.isFinite(explicitYrfi)?explicitYrfi:Number.isFinite(nrfi)?100-nrfi:fallback);
     if(!Number.isFinite(p))continue;
     const edge=Number(g.modelEdge??g.edge??Math.abs(p-50));
     const qualifies=status==='BEST_PLAY'||status==='PLAY'||status==='LEAN'||edge>=3.5;
     if(!qualifies||p<53.5)continue;
     const id=String(g.gamePk??g.id??`${teamName(g.away)}-${teamName(g.home)}-${g.date??g.gameTime??''}`);
     const matchup=g.shortName||`${teamName(g.away)} @ ${teamName(g.home)}`;
     const time=g.date||g.gameTime||'';
     const playTier=status==='BEST_PLAY'?'BEST PLAY':status==='PLAY'?'STRONG PLAY':'VALUE';
     out.push({id:`mlb-${id}`,sport:'MLB',market:isNrfi?'NRFI':'YRFI',matchup,pick:isNrfi?'No Run 1st Inning':'Yes Run 1st Inning',probability:p,time,tier:playTier,note:status==='LEAN'?`Model lean · ${edge.toFixed(1)} pt edge`:g.confidence?`${g.confidence} confidence`:'Model-qualified play',href:'/mlb'});
   }
   for(const g of wnba.data?.games||[]){
     const picks=(g.candidates||[]).slice(0,3);
     for(const p of picks){
       if(p.probability<10)continue;
       const label=p.rank===1?'First Basket':p.rank===2?'First Basket #2':'First Basket Value';
       const display=Math.min(99,Math.max(0,p.probability));
       out.push({id:`wnba-${g.id}-${p.rank}`,sport:'WNBA',market:label,matchup:`${g.awayTeam} @ ${g.homeTeam}`,pick:p.name,probability:display,time:g.date,tier:p.rank===1?'BEST PLAY':p.rank===2?'STRONG PLAY':'VALUE',note:g.lineupStatus==='confirmed'?'Confirmed starters':'Projected lineup',href:'/wnba',headshot:p.headshot??null});
     }
   }
   for(const g of nfl.data?.games||[]){
     const sides=[g.away,g.home].filter(x=>x.winProbability!==null).sort((a,b)=>(b.winProbability||0)-(a.winProbability||0));
     const top=sides[0];
     if(top&&top.winProbability!==null&&top.winProbability>=55){
       out.push({id:`nfl-ml-${g.id}`,sport:'NFL',market:'Moneyline',matchup:`${g.away.abbr} @ ${g.home.abbr}`,pick:`${top.abbr} ML`,probability:top.winProbability,time:g.date,tier:tier(top.winProbability),note:'Team win model',href:'/nfl'});
     }
   }
   return out.sort((a,b)=>{const rank={'BEST PLAY':0,'STRONG PLAY':1,'VALUE':2};return rank[a.tier]-rank[b.tier]||b.probability-a.probability});
 },[mlb.data,wnba.data,nfl.data]);
 const loading=mlb.isLoading||wnba.isLoading||nfl.isLoading;
 return <div className="space-y-5">
   <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
     <div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary"/><h1 className="text-2xl font-bold">Today's Best Plays</h1></div><p className="text-xs text-muted-foreground mt-1">Every model-approved play across all active sports, ranked in one place.</p></div>
     <Button variant="outline" size="sm" onClick={()=>{mlb.refetch();wnba.refetch();nfl.refetch()}} className="gap-2"><RefreshCw className={`w-3.5 h-3.5 ${mlb.isFetching||wnba.isFetching||nfl.isFetching?'animate-spin':''}`}/>Refresh</Button>
   </div>
   <div className="rounded-md border bg-card overflow-hidden">
     <div className="p-3 border-b"><div className="text-xs font-semibold">All Plays</div></div>
     {loading&&!plays.length?<div className="p-4 space-y-3"><Skeleton className="h-20"/><Skeleton className="h-20"/><Skeleton className="h-20"/></div>:plays.length?<div className="divide-y">{plays.map((p,i)=><Link href={p.href} key={p.id}><div className="grid grid-cols-[44px_1fr_auto] md:grid-cols-[52px_72px_1fr_150px_100px_100px] items-center gap-3 px-3 py-4 hover:bg-muted/30 cursor-pointer"><div className="w-11 h-11 rounded-full overflow-hidden bg-muted flex items-center justify-center font-bold text-xs">{p.headshot?<img src={p.headshot} alt="" className="w-full h-full object-cover object-top"/>:i+1}</div><div className="hidden md:block"><Badge variant="outline" className="text-[9px]">{p.sport}</Badge></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-sm">{p.pick}</span><Badge variant="outline" className={`text-[8px] ${tierClass(p.tier)}`}>{p.tier}</Badge></div><div className="text-[10px] text-muted-foreground mt-1">{p.matchup} · {p.market}</div></div><div className="hidden md:block text-xs text-muted-foreground">{p.note}</div><div className="text-right"><div className="font-mono font-bold">{p.probability.toFixed(1)}%</div><div className="text-[9px] text-muted-foreground">model</div></div><div className="hidden md:flex justify-end items-center gap-1 text-[10px] text-muted-foreground"><Clock className="w-3 h-3"/>{gameTime(p.time)}</div></div></Link>)}</div>:<div className="py-16 px-4 text-center"><Sparkles className="w-7 h-7 mx-auto text-muted-foreground mb-3"/><div className="font-semibold text-sm">No qualifying plays right now</div><div className="text-xs text-muted-foreground mt-1">Check back closer to game time as the models update.</div></div>}
   </div>
 </div>
}
