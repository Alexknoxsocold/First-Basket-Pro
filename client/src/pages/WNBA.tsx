import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, Clock, Users, Trophy, AlertCircle, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type Candidate = {
  name: string; team: string; position: string; headshot: string | null;
  avgPoints: number; avgFga: number; fgPct: number; avgMinutes: number;
  currentFirstBaskets: number; currentGamesTracked: number;
  previousFirstBaskets: number; previousGamesTracked: number;
  probability: number; rank: number;
};
type Game = {
  id: string; date: string; shortName: string; awayTeam: string; homeTeam: string;
  awayName: string; homeName: string; status: string; lineupStatus: 'confirmed' | 'waiting';
  starters: { name: string; team: string }[]; candidates: Candidate[]; topPick: Candidate | null;
};
type Slate = { season: number; updatedAt: string; teams: { abbreviation: string; name: string }[]; games: Game[]; source: string; modelVersion: string };
type HistoryRow = { playerName:string; team:string; season:number; fbScored:number; gamesTracked:number; rate:number|null; lastUpdated:string };
type HistoryPayload = { currentSeason:number; previousSeason:number; current:HistoryRow[]; previous:HistoryRow[] };

function time(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Time pending';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
}
function rate(fb: number, games: number) { return games > 0 ? `${((fb / games) * 100).toFixed(1)}%` : '—'; }

function CandidateRow({ player }: { player: Candidate }) {
  return <div className="grid grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_92px_92px_90px] items-center gap-3 py-3 border-b last:border-b-0">
    <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center text-xs font-bold">{player.headshot ? <img src={player.headshot} alt="" className="w-full h-full object-cover object-top" /> : player.rank}</div>
    <div className="min-w-0"><div className="flex items-center gap-2"><span className="font-semibold text-sm truncate">#{player.rank} {player.name}</span><Badge variant="secondary" className="text-[9px]">{player.team}</Badge></div><div className="text-[10px] text-muted-foreground">{player.position} · {player.avgPoints.toFixed(1)} PPG · {player.avgFga.toFixed(1)} FGA</div></div>
    <div className="text-right"><div className="font-mono font-bold text-sm">{player.probability.toFixed(1)}%</div><div className="text-[9px] text-muted-foreground">model</div></div>
    <div className="hidden sm:block text-right"><div className="font-mono text-xs">{player.currentFirstBaskets}/{player.currentGamesTracked}</div><div className="text-[9px] text-muted-foreground">{rate(player.currentFirstBaskets, player.currentGamesTracked)} this yr</div></div>
    <div className="hidden sm:block text-right"><div className="font-mono text-xs">{player.previousFirstBaskets}/{player.previousGamesTracked}</div><div className="text-[9px] text-muted-foreground">{rate(player.previousFirstBaskets, player.previousGamesTracked)} prior</div></div>
  </div>;
}

function GameCard({ game }: { game: Game }) {
  const confirmed = game.lineupStatus === 'confirmed';
  return <article className="rounded-md border bg-card overflow-hidden">
    <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 bg-muted/20"><div><div className="font-bold text-sm">{game.awayTeam} @ {game.homeTeam}</div><div className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{time(game.date)} · {game.status}</div></div><Badge className={confirmed ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' : 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30'}>{confirmed ? '10 STARTERS CONFIRMED' : 'WAITING FOR STARTERS'}</Badge></div>
    {!confirmed ? <div className="p-6 text-center"><AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" /><p className="font-semibold text-sm">Official First Basket ranking is not locked yet</p><p className="text-xs text-muted-foreground mt-1">The model waits for five verified starters on both teams rather than guessing from a stale depth chart.</p></div> : <div className="p-4">{game.topPick && <div className="rounded-md border bg-primary/5 p-3 mb-4 flex items-center justify-between gap-3"><div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top First Basket candidate</div><div className="font-bold">{game.topPick.name} · {game.topPick.team}</div></div><div className="text-2xl font-bold font-mono">{game.topPick.probability.toFixed(1)}%</div></div>}<div>{game.candidates.map(player => <CandidateRow key={`${game.id}-${player.team}-${player.name}`} player={player} />)}</div></div>}
  </article>;
}

function HistoryTable({ rows, season }: { rows:HistoryRow[]; season:number }) {
  return <div className="rounded-md border bg-card overflow-hidden"><div className="px-4 py-3 border-b font-semibold text-sm">{season} verified First Basket history</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/20 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="text-left px-4 py-2">Player</th><th className="text-left px-3 py-2">Team</th><th className="text-right px-3 py-2">FB</th><th className="text-right px-3 py-2">Starter games</th><th className="text-right px-4 py-2">Rate</th></tr></thead><tbody>{rows.length ? rows.map(row=><tr key={`${season}-${row.team}-${row.playerName}`} className="border-t"><td className="px-4 py-2 font-medium">{row.playerName}</td><td className="px-3 py-2 text-muted-foreground">{row.team}</td><td className="px-3 py-2 text-right font-mono">{row.fbScored}</td><td className="px-3 py-2 text-right font-mono">{row.gamesTracked}</td><td className="px-4 py-2 text-right font-mono font-semibold">{row.rate === null ? '—' : `${row.rate.toFixed(1)}%`}</td></tr>) : <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No verified history yet for this season.</td></tr>}</tbody></table></div></div>;
}

export default function WNBA() {
  const [section,setSection]=useState<'games'|'history'>('games');
  const slate = useQuery<Slate>({ queryKey: ['/api/wnba/first-basket'], staleTime: 60_000, refetchInterval: 2 * 60_000 });
  const history = useQuery<HistoryPayload>({ queryKey: ['/api/wnba/history'], staleTime: 2 * 60_000, refetchInterval: 5 * 60_000 });
  if (slate.isLoading) return <div className="space-y-4"><Skeleton className="h-9 w-72" /><Skeleton className="h-28" /><Skeleton className="h-80" /></div>;
  const confirmed = slate.data?.games.filter(g => g.lineupStatus === 'confirmed').length ?? 0;
  return <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-8">
    <div className="border-b bg-card"><div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8"><div className="flex items-center justify-between gap-3"><div className="flex items-center"><button onClick={()=>setSection('games')} className={`px-4 py-4 text-xs font-medium border-b-2 ${section==='games'?'border-primary text-foreground':'border-transparent text-muted-foreground'}`}>WNBA Games</button><button onClick={()=>setSection('history')} className={`px-4 py-4 text-xs font-medium border-b-2 flex items-center gap-1.5 ${section==='history'?'border-primary text-foreground':'border-transparent text-muted-foreground'}`}><History className="w-3.5 h-3.5" />FB History</button></div><Button variant="outline" size="sm" onClick={()=>{slate.refetch();history.refetch();}} disabled={slate.isFetching||history.isFetching} className="gap-2"><RefreshCw className={`w-3.5 h-3.5 ${(slate.isFetching||history.isFetching)?'animate-spin':''}`} />Refresh</Button></div></div></div>
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6">
      <div className="mb-5"><h1 className="text-xl font-bold">WNBA First Basket</h1><p className="text-xs text-muted-foreground mt-1">Separate WNBA model · verified starters · season-aware First Basket history</p></div>
      {slate.error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">WNBA data could not be loaded right now.</div> : section==='games' ? <>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"><div className="rounded-md border bg-card p-4"><Users className="w-4 h-4 text-primary mb-2" /><div className="text-2xl font-bold">{slate.data?.teams.length ?? 0}</div><div className="text-xs text-muted-foreground">WNBA teams tracked</div></div><div className="rounded-md border bg-card p-4"><ShieldCheck className="w-4 h-4 text-primary mb-2" /><div className="text-2xl font-bold">{confirmed}/{slate.data?.games.length ?? 0}</div><div className="text-xs text-muted-foreground">games with confirmed 5+5</div></div><div className="rounded-md border bg-card p-4"><Trophy className="w-4 h-4 text-primary mb-2" /><div className="text-lg font-bold">{slate.data?.modelVersion ?? 'WNBA-FB-SEASONAL-V1'}</div><div className="text-xs text-muted-foreground">separate WNBA model ledger</div></div></div>
        {slate.data?.games.length ? <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{slate.data.games.map(game => <GameCard key={game.id} game={game} />)}</div> : <div className="rounded-md border bg-card p-12 text-center"><p className="font-semibold">No WNBA games on today’s slate</p><p className="text-sm text-muted-foreground mt-1">The tracker and history remain active for the season.</p></div>}
      </> : history.isLoading ? <Skeleton className="h-96" /> : <div className="grid grid-cols-1 xl:grid-cols-2 gap-4"><HistoryTable rows={history.data?.current ?? []} season={history.data?.currentSeason ?? new Date().getUTCFullYear()} /><HistoryTable rows={history.data?.previous ?? []} season={history.data?.previousSeason ?? new Date().getUTCFullYear()-1} /></div>}
      <div className="mt-6 text-[10px] text-muted-foreground">Updated {slate.data ? time(slate.data.updatedAt) : '—'} · {slate.data?.source}</div><div className="mt-2 text-[10px] text-muted-foreground">Model probabilities are estimates, not guarantees. Official predictions are only locked from verified starting lineups before tipoff.</div>
    </div>
  </div>;
}
