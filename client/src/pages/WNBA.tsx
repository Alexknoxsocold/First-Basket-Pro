import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ShieldCheck, Clock, Users, Trophy, AlertCircle } from 'lucide-react';
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

function time(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Time pending';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
}

function rate(fb: number, games: number) { return games > 0 ? `${((fb / games) * 100).toFixed(1)}%` : '—'; }

function CandidateRow({ player }: { player: Candidate }) {
  return (
    <div className="grid grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_92px_92px_90px] items-center gap-3 py-3 border-b last:border-b-0">
      <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center text-xs font-bold">
        {player.headshot ? <img src={player.headshot} alt="" className="w-full h-full object-cover object-top" /> : player.rank}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2"><span className="font-semibold text-sm truncate">#{player.rank} {player.name}</span><Badge variant="secondary" className="text-[9px]">{player.team}</Badge></div>
        <div className="text-[10px] text-muted-foreground">{player.position} · {player.avgPoints.toFixed(1)} PPG · {player.avgFga.toFixed(1)} FGA</div>
      </div>
      <div className="text-right"><div className="font-mono font-bold text-sm">{player.probability.toFixed(1)}%</div><div className="text-[9px] text-muted-foreground">model</div></div>
      <div className="hidden sm:block text-right"><div className="font-mono text-xs">{player.currentFirstBaskets}/{player.currentGamesTracked}</div><div className="text-[9px] text-muted-foreground">{rate(player.currentFirstBaskets, player.currentGamesTracked)} this yr</div></div>
      <div className="hidden sm:block text-right"><div className="font-mono text-xs">{player.previousFirstBaskets}/{player.previousGamesTracked}</div><div className="text-[9px] text-muted-foreground">{rate(player.previousFirstBaskets, player.previousGamesTracked)} prior</div></div>
    </div>
  );
}

function GameCard({ game }: { game: Game }) {
  const confirmed = game.lineupStatus === 'confirmed';
  return (
    <article className="rounded-md border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 bg-muted/20">
        <div><div className="font-bold text-sm">{game.awayTeam} @ {game.homeTeam}</div><div className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{time(game.date)} · {game.status}</div></div>
        <Badge className={confirmed ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' : 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30'}>
          {confirmed ? '10 STARTERS CONFIRMED' : 'WAITING FOR STARTERS'}
        </Badge>
      </div>
      {!confirmed ? (
        <div className="p-6 text-center">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
          <p className="font-semibold text-sm">Official First Basket ranking is not locked yet</p>
          <p className="text-xs text-muted-foreground mt-1">The model waits for five verified starters on both teams rather than guessing from a stale depth chart.</p>
        </div>
      ) : (
        <div className="p-4">
          {game.topPick && <div className="rounded-md border bg-primary/5 p-3 mb-4 flex items-center justify-between gap-3"><div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top First Basket candidate</div><div className="font-bold">{game.topPick.name} · {game.topPick.team}</div></div><div className="text-2xl font-bold font-mono">{game.topPick.probability.toFixed(1)}%</div></div>}
          <div>{game.candidates.map(player => <CandidateRow key={`${game.id}-${player.team}-${player.name}`} player={player} />)}</div>
        </div>
      )}
    </article>
  );
}

export default function WNBA() {
  const { data, isLoading, isFetching, error, refetch } = useQuery<Slate>({ queryKey: ['/api/wnba/first-basket'], staleTime: 60_000, refetchInterval: 2 * 60_000 });
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-9 w-72" /><Skeleton className="h-28" /><Skeleton className="h-80" /></div>;
  const confirmed = data?.games.filter(g => g.lineupStatus === 'confirmed').length ?? 0;
  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-8">
      <div className="border-b bg-card"><div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-5 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-bold">WNBA First Basket</h1><p className="text-xs text-muted-foreground mt-1">Season-aware First Basket rankings built only from current WNBA starters</p></div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2"><RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh</Button>
      </div></div>
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6">
        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">WNBA data could not be loaded right now.</div> : <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="rounded-md border bg-card p-4"><Users className="w-4 h-4 text-primary mb-2" /><div className="text-2xl font-bold">{data?.teams.length ?? 0}</div><div className="text-xs text-muted-foreground">WNBA teams tracked</div></div>
            <div className="rounded-md border bg-card p-4"><ShieldCheck className="w-4 h-4 text-primary mb-2" /><div className="text-2xl font-bold">{confirmed}/{data?.games.length ?? 0}</div><div className="text-xs text-muted-foreground">games with confirmed 5+5</div></div>
            <div className="rounded-md border bg-card p-4"><Trophy className="w-4 h-4 text-primary mb-2" /><div className="text-lg font-bold">{data?.modelVersion ?? 'WNBA-FB-SEASONAL-V1'}</div><div className="text-xs text-muted-foreground">separate WNBA model ledger</div></div>
          </div>
          {data?.games.length ? <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{data.games.map(game => <GameCard key={game.id} game={game} />)}</div> : <div className="rounded-md border bg-card p-12 text-center"><p className="font-semibold">No WNBA games on today’s slate</p><p className="text-sm text-muted-foreground mt-1">The tracker and history remain active for the season.</p></div>}
          <div className="mt-6 text-[10px] text-muted-foreground">Updated {data ? time(data.updatedAt) : '—'} · {data?.source}</div>
          <div className="mt-2 text-[10px] text-muted-foreground">Model probabilities are estimates, not guarantees. Official predictions are only locked from verified starting lineups before tipoff.</div>
        </>}
      </div>
    </div>
  );
}
