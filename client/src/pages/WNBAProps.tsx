import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ArrowLeft, BarChart3, Clock3, RefreshCw, ShieldCheck, Sparkles, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type PropKey='points'|'rebounds'|'assists'|'threes'|'rebounds_assists'|'points_rebounds_assists';
type PropPlay={player:string;team:string;opponent:string;gameId:string;gameTime:string;headshot:string|null;position:string;market:PropKey;marketLabel:string;seasonAverage:number;recentAverage:number|null;recentGames:number;recentMinutes:number|null;projection:number;line:number|null;consensusLine:number|null;side:'OVER'|'UNDER'|null;edge:number|null;confidence:number;confidenceLabel:'STRONG'|'GOOD'|'WATCH';isBettable:boolean;book:string|null;odds:number|null;bookCount:number;quoteCount:number;reasons:string[]};
type Payload={updatedAt:string;modelVersion:string;source:string;marketSource:string;plays:PropPlay[];games:number;playersEvaluated:number;verifiedLines:number;note:string};

const markets:{key:'all'|PropKey;label:string}[]=[{key:'all',label:'Best'},{key:'points',label:'Points'},{key:'rebounds',label:'Rebounds'},{key:'assists',label:'Assists'},{key:'threes',label:'3PT'},{key:'rebounds_assists',label:'R+A'},{key:'points_rebounds_assists',label:'PRA'}];
function gameTime(v:string){const d=new Date(v);return Number.isNaN(d.getTime())?'Time pending':d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'})+' ET'}
function odds(v:number|null){if(v===null)return'';return v>0?`+${Math.round(v)}`:`${Math.round(v)}`}

function PropCard({play}:{play:PropPlay}){
  const over=play.side==='OVER';
  const strong=play.confidenceLabel==='STRONG';
  return <article className={`relative overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md ${play.isBettable?'border-emerald-500/35':'border-border'}`}>
    <div className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-muted">{play.headshot?<img src={play.headshot} alt="" className="h-full w-full object-cover object-top"/>:<div className="flex h-full w-full items-center justify-center text-xs font-bold">{play.team}</div>}</div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><h3 className="truncate font-bold">{play.player}</h3><Badge variant="secondary" className="text-[9px]">{play.team}</Badge></div><div className="mt-0.5 text-[11px] text-muted-foreground">{play.position} · vs {play.opponent} · {gameTime(play.gameTime)}</div></div>
        </div>
        <Badge variant="outline" className={strong?'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400':play.confidenceLabel==='GOOD'?'border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-400':'text-muted-foreground'}>{play.confidenceLabel}</Badge>
      </div>

      <div className="mt-4 rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{play.marketLabel}</div>{play.isBettable&&play.side?<div className={`mt-1 flex items-center gap-1.5 text-lg font-extrabold ${over?'text-emerald-600 dark:text-emerald-400':'text-blue-600 dark:text-blue-400'}`}>{over?<TrendingUp className="h-4 w-4"/>:<TrendingDown className="h-4 w-4"/>}{play.side} {play.line?.toFixed(1)}</div>:<div className="mt-1 text-base font-bold">Projection {play.projection.toFixed(1)}</div>}</div><div className="text-right"><div className="font-mono text-2xl font-extrabold">{play.projection.toFixed(1)}</div><div className="text-[9px] uppercase tracking-wide text-muted-foreground">Prezi V2 model</div></div></div>
        {play.line!==null?<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[10px] text-muted-foreground"><span>Market line <b className="text-foreground">{play.line.toFixed(1)}</b></span>{play.consensusLine!==null&&Math.abs(play.consensusLine-play.line)>.01?<span>Consensus <b className="text-foreground">{play.consensusLine.toFixed(1)}</b></span>:null}{play.edge!==null?<span>Edge <b className="text-foreground">{play.edge.toFixed(1)}</b></span>:null}{play.book?<span>{play.book}{play.odds!==null?` ${odds(play.odds)}`:''}</span>:null}<span><b className="text-foreground">{play.bookCount}</b> book{play.bookCount===1?'':'s'}</span></div>:<div className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">No verified sportsbook line available — projection only, not labeled as a bet.</div>}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center"><div className="rounded-md border bg-background/40 px-2 py-2"><div className="font-mono text-sm font-semibold">{play.seasonAverage.toFixed(1)}</div><div className="text-[8px] uppercase tracking-wide text-muted-foreground">Season</div></div><div className="rounded-md border bg-background/40 px-2 py-2"><div className="font-mono text-sm font-semibold">{play.recentAverage===null?'—':play.recentAverage.toFixed(1)}</div><div className="text-[8px] uppercase tracking-wide text-muted-foreground">Recent {play.recentGames||''}</div></div><div className="rounded-md border bg-background/40 px-2 py-2"><div className="font-mono text-sm font-semibold">{play.recentMinutes===null?'—':play.recentMinutes.toFixed(1)}</div><div className="text-[8px] uppercase tracking-wide text-muted-foreground">Recent Min</div></div><div className="rounded-md border bg-background/40 px-2 py-2"><div className="font-mono text-sm font-semibold">{play.confidence}%</div><div className="text-[8px] uppercase tracking-wide text-muted-foreground">Confidence</div></div></div>
      <div className="mt-3 space-y-1">{play.reasons.slice(0,5).map((r,i)=><div key={i} className="flex items-start gap-2 text-[10px] text-muted-foreground"><span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary/70"/>{r}</div>)}</div>
    </div>
    {play.isBettable?<div className="border-t bg-emerald-500/8 px-4 py-2 text-center text-[9px] font-bold uppercase tracking-[.16em] text-emerald-700 dark:text-emerald-300">Verified PreziTools Prop Play</div>:null}
  </article>
}

export default function WNBAProps(){
  const [market,setMarket]=useState<'all'|PropKey>('all');
  const q=useQuery<Payload>({queryKey:['wnba-props'],queryFn:async()=>{const r=await fetch('/api/wnba/props');if(!r.ok)throw new Error('Unable to load WNBA props');return r.json()},refetchInterval:5*60*1000,staleTime:2*60*1000});
  const visible=useMemo(()=>{const all=q.data?.plays||[];const filtered=market==='all'?all:all.filter(x=>x.market===market);const bettable=filtered.filter(x=>x.isBettable);const watches=filtered.filter(x=>!x.isBettable);return [...bettable,...watches].slice(0,market==='all'?18:24)},[q.data,market]);
  const realPlays=(q.data?.plays||[]).filter(x=>x.isBettable).length;
  const multiBook=(q.data?.plays||[]).filter(x=>x.line!==null&&x.bookCount>=2).length;
  return <div className="space-y-5">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/wnba"><span className="mb-2 inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5"/>WNBA First Basket</span></Link><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary"/><h1 className="text-2xl font-black tracking-tight sm:text-3xl">WNBA Prop Plays</h1></div><p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">Independent PreziTools projections strengthened by recent role, opponent allowance and cross-book market validation.</p></div><Button variant="outline" size="sm" onClick={()=>q.refetch()} disabled={q.isFetching}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${q.isFetching?'animate-spin':''}`}/>Refresh</Button></div>

    {q.data?<div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-lg border bg-card p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground"><Target className="h-3 w-3"/>Verified plays</div><div className="mt-1 text-xl font-black">{realPlays}</div></div><div className="rounded-lg border bg-card p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground"><BarChart3 className="h-3 w-3"/>Players modeled</div><div className="mt-1 text-xl font-black">{q.data.playersEvaluated}</div></div><div className="rounded-lg border bg-card p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground"><ShieldCheck className="h-3 w-3"/>Multi-book lines</div><div className="mt-1 text-xl font-black">{multiBook}</div></div><div className="rounded-lg border bg-card p-3"><div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-muted-foreground"><Clock3 className="h-3 w-3"/>Slate games</div><div className="mt-1 text-xl font-black">{q.data.games}</div></div></div>:null}

    <div className="flex gap-1 overflow-x-auto rounded-lg border bg-card p-1">{markets.map(m=><button key={m.key} onClick={()=>setMarket(m.key)} className={`whitespace-nowrap rounded-md px-3 py-2 text-[11px] font-semibold transition-colors ${market===m.key?'bg-primary text-primary-foreground':'text-muted-foreground hover:bg-muted hover:text-foreground'}`}>{m.label}</button>)}</div>

    {q.isLoading?<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-72 rounded-xl"/>)}</div>:q.isError?<div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6 text-center"><div className="font-semibold">WNBA prop projections are temporarily unavailable.</div><Button className="mt-3" size="sm" onClick={()=>q.refetch()}>Try again</Button></div>:visible.length?<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map((p,i)=><PropCard key={`${p.player}-${p.market}-${i}`} play={p}/>)}</div>:<div className="rounded-lg border bg-card p-8 text-center"><div className="font-semibold">No projections for this market yet.</div><div className="mt-1 text-xs text-muted-foreground">The model only publishes players with enough current WNBA data.</div></div>}

    {q.data?<div className="rounded-lg border bg-muted/15 p-4 text-[10px] leading-relaxed text-muted-foreground"><div className="mb-1 font-semibold text-foreground">How to read this page</div>{q.data.note} A green “Verified PreziTools Prop Play” label appears only after the independent projection clears the required edge against a verified market line. Source: {q.data.source}. Market feed: {q.data.marketSource}.</div>:null}
  </div>;
}
