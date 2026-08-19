import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Activity, Clock, Flame, RefreshCw, SlidersHorizontal, Sparkles, Target, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type MlbGame={gamePk:number;away:string;home:string;gameTime:string;recommendation?:string;pick?:string;confidence?:string;nrfiProbability?:number;yrfiProbability?:number;probability?:number;edge?:number};
type WnbaCandidate={name:string;team:string;probability:number;rank:number};
type WnbaGame={id:string;date:string;awayTeam:string;homeTeam:string;lineupStatus:string;candidates:WnbaCandidate[];topPick:WnbaCandidate|null};
type WnbaSlate={games:WnbaGame[]};
type NflGame={id:string;date:string;away:{abbr:string;name:string;winProbability:number|null};home:{abbr:string;name:string;winProbability:number|null};market?:{favorite?:string|null;spread?:number|null;overUnder?:number|null}};
type NflSlate={games:NflGame[]};
type Play={id:string;sport:'MLB'|'WNBA'|'NFL';market:string;matchup:string;pick:string;probability:number;time:string;tier:'BEST PLAY'|'STRONG PLAY'|'VALUE';note:string;href:string};

function gameTime(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?'Time pending':d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET'}
function tier(prob:number):Play['tier']{return prob>=62?'BEST PLAY':prob>=56?'STRONG PLAY':'VALUE'}
function tierClass(t:Play['tier']){return t==='BEST PLAY'?'bg-emerald-500/15 text-emerald-600 border-emerald-500/30':t==='STRONG PLAY'?'bg-primary/10 text-primary border-primary/25':'bg-yellow-500/15 text-yellow-600 border-yellow-500/30'}

export default function BestPlays(){
 const[filter,setFilter]=useState<'ALL'|'MLB'|'WNBA'|'NFL'>('ALL');
 const mlb=useQuery<any>({queryKey:['/api/nrfi/today'],staleTime:60000,refetchInterval:120000,retry:1});
 const wnba=useQuery<WnbaSlate>({queryKey:['/api/wnba/first-basket'],staleTime:60000,refetchInterval:120000,retry:1});
 const nfl=useQuery<NflSlate>({queryKey:['/api/nfl/slate'],staleTime:60000,refetchInterval:120000,retry:1});
 const plays=useMemo(()=>{
   const out:Play[]=[];
   const mg:MlbGame[]=Array.isArray(mlb.data)?mlb.data:(mlb.data?.games||[]);
   for(const g of mg){const rec=(g.recommendation||g.pick||'').toUpperCase();if(!rec||rec.includes('NO PLAY'))continue;const isNrfi=rec.includes('NRFI');const p=Number(isNrfi?g.nrfiProbability:g.yrfiProbability)||Number(g.probability)||0;if(p<54)continue;out.push({id:`mlb-${g.gamePk}`,sport:'MLB',market:isNrfi?'NRFI':'YRFI',matchup:`${g.away} @ ${g.home}`,pick:isNrfi?'No Run 1st Inning':'Yes Run 1st Inning',probability:p,time:g.gameTime,tier:tier(p),note:g.confidence?`${g.confidence} confidence`:'Model-qualified play',href:'/mlb'});}
   for(const g of wnba.data?.games||[]){const picks=(g.candidates||[]).slice(0,3);for(const p of picks){if(p.probability<10)continue;const label=p.rank===1?'First Basket':p.rank===2?'First Basket #2':'First Basket Value';const display=Math.min(99,Math.max(0,p.probability));out.push({id:`wnba-${g.id}-${p.rank}`,sport:'WNBA',market:label,matchup:`${g.awayTeam} @ ${g.homeTeam}`,pick:p.name,probability:display,time:g.date,tier:p.rank===1?'BEST PLAY':p.rank===2?'STRONG PLAY':'VALUE',note:g.lineupStatus==='confirmed'?'Confirmed starters':'Projected lineup',href:'/wnba'});}}
   for(const g of nfl.data?.games||[]){const sides=[g.away,g.home].filter(x=>x.winProbability!==null).sort((a,b)=>(b.winProbability||0)-(a.winProbability||0));const top=sides[0];if(top&&top.winProbability!==null&&top.winProbability>=55){out.push({id:`nfl-ml-${g.id}`,sport:'NFL',market:'Moneyline',matchup:`${g.away.abbr} @ ${g.home.abbr}`,pick:`${top.abbr} ML`,probability:top.winProbability,time:g.date,tier:tier(top.winProbability),note:'Team win model',href:'/nfl'});}}
   return out.sort((a,b)=>{const rank={'BEST PLAY':0,'STRONG PLAY':1,'VALUE':2};return rank[a.tier]-rank[b.tier]||b.probability-a.probability});
 },[mlb.data,wnba.data,nfl.data]);
 const shown=filter==='ALL'?plays:plays.filter(p=>p.sport===filter);
 const best=plays.filter(p=>p.tier==='BEST PLAY').length;
 const loading=mlb.isLoading||wnba.isLoading||nfl.isLoading;
 return <div className="space-y-5">
   <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3"><div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary"/><h1 className="text-2xl font-bold">Today's Best Plays</h1></div><p className="text-xs text-muted-foreground mt-1">The strongest model-qualified opportunities across every active sport. Plays can appear, improve or fall off as game time approaches.</p></div><Button variant="outline" size="sm" onClick={()=>{mlb.refetch();wnba.refetch();nfl.refetch()}} className="gap-2"><RefreshCw className={`w-3.5 h-3.5 ${mlb.isFetching||wnba.isFetching||nfl.isFetching?'animate-spin':''}`}/>Refresh</Button></div>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><div className="rounded-md border bg-card p-4"><Flame className="w-4 h-4 text-primary mb-2"/><div className="text-2xl font-bold">{best}</div><div className="text-xs font-medium">Best Plays</div></div><div className="rounded-md border bg-card p-4"><Target className="w-4 h-4 text-primary mb-2"/><div className="text-2xl font-bold">{plays.length}</div><div className="text-xs font-medium">Qualified Plays</div></div><div className="rounded-md border bg-card p-4"><Activity className="w-4 h-4 text-primary mb-2"/><div className="text-2xl font-bold">{new Set(plays.map(p=>p.sport)).size}</div><div className="text-xs font-medium">Sports Active</div></div><div className="rounded-md border bg-card p-4"><Trophy className="w-4 h-4 text-primary mb-2"/><div className="text-lg font-bold truncate">{plays[0]?.pick||'—'}</div><div className="text-xs font-medium">Top Model Play</div></div></div>
   <div className="rounded-md border bg-card overflow-hidden"><div className="p-3 border-b flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-semibold"><SlidersHorizontal className="w-4 h-4"/>Play Board</div><div className="flex gap-1">{(['ALL','MLB','WNBA','NFL'] as const).map(x=><Button key={x} size="sm" variant={filter===x?'default':'ghost'} onClick={()=>setFilter(x)} className="h-7 text-[10px]">{x}</Button>)}</div></div>{loading&&!plays.length?<div className="p-4 space-y-3"><Skeleton className="h-16"/><Skeleton className="h-16"/><Skeleton className="h-16"/></div>:shown.length?<div className="divide-y">{shown.map((p,i)=><Link href={p.href} key={p.id}><div className="grid grid-cols-[32px_1fr_auto] md:grid-cols-[38px_90px_1fr_150px_100px_100px] items-center gap-3 px-3 py-4 hover:bg-muted/30 cursor-pointer"><div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center font-bold text-xs">{i+1}</div><div className="hidden md:block"><Badge variant="outline" className="text-[9px]">{p.sport}</Badge></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-sm">{p.pick}</span><Badge variant="outline" className={`text-[8px] ${tierClass(p.tier)}`}>{p.tier}</Badge></div><div className="text-[10px] text-muted-foreground mt-1">{p.matchup} · {p.market}</div></div><div className="hidden md:block text-xs text-muted-foreground">{p.note}</div><div className="text-right"><div className="font-mono font-bold">{p.probability.toFixed(1)}%</div><div className="text-[9px] text-muted-foreground">model</div></div><div className="hidden md:flex justify-end items-center gap-1 text-[10px] text-muted-foreground"><Clock className="w-3 h-3"/>{gameTime(p.time)}</div></div></Link>)}</div>:<div className="py-16 px-4 text-center"><Sparkles className="w-7 h-7 mx-auto text-muted-foreground mb-3"/><div className="font-semibold text-sm">No qualifying plays right now</div><div className="text-xs text-muted-foreground mt-1">The board stays selective. Check back closer to game time as lineups, pitchers and model confidence update.</div></div>}</div>
   <div className="text-[10px] text-muted-foreground">This board ranks model-qualified opportunities; it does not guarantee outcomes. WNBA projected-lineup plays can change before confirmation.</div>
 </div>
}
