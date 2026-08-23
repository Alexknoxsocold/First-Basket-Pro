import { useQuery } from '@tanstack/react-query';
import { Flame, RefreshCw, ShieldCheck, Wind } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type Candidate = {
  gamePk: number;
  gameTime: string;
  playerId: number;
  player: string;
  team: string;
  opponent: string;
  headshot: string;
  battingOrder: number;
  lineupConfirmed: boolean;
  probablePitcher: string | null;
  venue: string | null;
  probability: number;
  confidence: number;
  tier: 'POWER_PLAY' | 'STRONG' | 'WATCH';
  season: { plateAppearances: number; homeRuns: number; homeRunRate: number; slugging: number | null; ops: number | null };
  recent: { plateAppearances: number; homeRuns: number; homeRunRate: number | null };
  pitcher: { battersFaced: number; homeRunsAllowed: number; homeRunRateAllowed: number | null };
  environment: { parkFactor: number; temperatureF: number | null; windMph: number | null; windDirection: string | null; weatherFactor: number };
  factors: string[];
  market: null;
  homepageEligible: false;
};

type Payload = {
  date: string;
  modelVersion: string;
  updatedAt: string;
  candidates: Candidate[];
  strongest: Candidate[];
  gamesWithConfirmedLineups: number;
  totalGames: number;
  marketStatus: 'unavailable';
  homepageReady: false;
  methodology: string;
  note: string;
};

function time(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Time pending' : `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`;
}

function tierLabel(tier: Candidate['tier']) {
  return tier === 'POWER_PLAY' ? 'POWER PLAY' : tier;
}

function tierClass(tier: Candidate['tier']) {
  if (tier === 'POWER_PLAY') return 'border-orange-500/35 bg-orange-500/10 text-orange-600 dark:text-orange-300';
  if (tier === 'STRONG') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
  return 'border-border bg-muted/30 text-muted-foreground';
}

function CandidateCard({ row }: { row: Candidate }) {
  return <article className="rounded-lg border bg-card overflow-hidden">
    <div className="flex items-start justify-between gap-3 border-b bg-muted/15 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
          <img src={row.headshot} alt="" className="h-full w-full object-cover object-top" onError={e => { e.currentTarget.style.display = 'none'; }} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={tierClass(row.tier)}>{tierLabel(row.tier)}</Badge>
            <Badge variant="outline" className="text-[9px]">LINEUP CONFIRMED</Badge>
          </div>
          <h3 className="mt-1.5 truncate text-base font-bold">{row.player}</h3>
          <p className="text-[11px] text-muted-foreground">{row.team} vs {row.opponent} · batting #{row.battingOrder} · {time(row.gameTime)}</p>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-mono text-2xl font-black">{row.probability.toFixed(1)}%</div>
        <div className="text-[9px] uppercase tracking-[.14em] text-muted-foreground">HR probability</div>
      </div>
    </div>

    <div className="p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border bg-background/50 p-3"><div className="text-[9px] uppercase tracking-wide text-muted-foreground">Season power</div><div className="mt-1 font-mono text-sm font-bold">{row.season.homeRuns} HR</div><div className="text-[10px] text-muted-foreground">{row.season.homeRunRate.toFixed(1)}% / PA</div></div>
        <div className="rounded-md border bg-background/50 p-3"><div className="text-[9px] uppercase tracking-wide text-muted-foreground">Last 14 days</div><div className="mt-1 font-mono text-sm font-bold">{row.recent.homeRuns} HR</div><div className="text-[10px] text-muted-foreground">{row.recent.plateAppearances ? `${row.recent.plateAppearances} PA` : 'Small sample'}</div></div>
        <div className="rounded-md border bg-background/50 p-3"><div className="text-[9px] uppercase tracking-wide text-muted-foreground">Pitcher HR allowed</div><div className="mt-1 font-mono text-sm font-bold">{row.pitcher.homeRunsAllowed}</div><div className="text-[10px] text-muted-foreground">{row.pitcher.battersFaced ? `${row.pitcher.battersFaced} BF` : 'League prior used'}</div></div>
        <div className="rounded-md border bg-background/50 p-3"><div className="text-[9px] uppercase tracking-wide text-muted-foreground">Model confidence</div><div className="mt-1 font-mono text-sm font-bold">{row.confidence}%</div><div className="text-[10px] text-muted-foreground">Data completeness</div></div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs font-semibold"><Wind className="h-4 w-4 text-primary" />Ballpark & atmosphere</div>
          <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
            <div>{row.venue ?? 'Venue pending'} · park multiplier {row.environment.parkFactor.toFixed(3)}x</div>
            <div>{row.environment.temperatureF !== null ? `${row.environment.temperatureF}°F` : 'Temperature pending'} · weather multiplier {row.environment.weatherFactor.toFixed(3)}x</div>
            <div>{row.environment.windDirection ?? 'Wind data pending'}</div>
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-primary" />Matchup controls</div>
          <div className="mt-2 space-y-1 text-[10px] text-muted-foreground">
            <div>Probable pitcher: {row.probablePitcher ?? 'Pending'}</div>
            <div>Confirmed batting position #{row.battingOrder} is included in expected plate appearances.</div>
            <div>Season samples are regressed toward league average to reduce small-sample overreaction.</div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-1 border-t pt-3">{row.factors.map(f => <div key={f} className="text-[10px] text-muted-foreground">• {f}</div>)}</div>
      <div className="mt-4 rounded-md border border-yellow-500/25 bg-yellow-500/5 px-3 py-2 text-[10px] text-muted-foreground">Model probability only. No verified home-run sportsbook price is connected yet, so PreziTools does not display invented edge or EV.</div>
    </div>
  </article>;
}

export default function MLBHomeRuns() {
  const { data, isLoading, isFetching, error, refetch } = useQuery<Payload>({
    queryKey: ['/api/mlb/home-runs'],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-64 w-full" /></div>;
  const rows = data?.strongest ?? [];
  const top = rows[0];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Flame className="h-5 w-5 text-orange-500" /><h1 className="text-xl font-bold">Prezi HR Power</h1></div>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">Home-run probability model using official MLB performance, confirmed batting order, probable-pitcher HR vulnerability, plate-appearance opportunity, ballpark carry, temperature, and wind.</p>
      </div>
      <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh</Button>
    </div>

    {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">MLB home-run data could not be loaded right now.</div> : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Strong HR candidates</div><div className="mt-1 text-2xl font-bold">{rows.length}</div><div className="text-[10px] text-muted-foreground">Only model thresholds, not sportsbook value</div></div>
        <div className="rounded-lg border bg-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Confirmed lineups</div><div className="mt-1 text-2xl font-bold">{data?.gamesWithConfirmedLineups ?? 0}/{data?.totalGames ?? 0}</div><div className="text-[10px] text-muted-foreground">Full 9-man orders required</div></div>
        <div className="rounded-lg border bg-card p-4"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Top HR probability</div><div className="mt-1 text-2xl font-bold">{top ? `${top.probability.toFixed(1)}%` : '—'}</div><div className="truncate text-[10px] text-muted-foreground">{top?.player ?? 'Waiting for qualified data'}</div></div>
      </div>

      <div className="rounded-lg border bg-primary/5 p-4">
        <div className="text-sm font-semibold">Research gate is intentionally on</div>
        <p className="mt-1 text-xs text-muted-foreground">This model stays inside MLB for now. It will not be promoted into Today’s Best Plays until it has enough graded pregame history and verified sportsbook home-run prices to prove real market value.</p>
      </div>

      {rows.length ? <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{rows.map(row => <CandidateCard key={`${row.gamePk}-${row.playerId}`} row={row} />)}</div> : <div className="rounded-lg border bg-card p-10 text-center"><Flame className="mx-auto h-9 w-9 text-muted-foreground/30" /><div className="mt-3 text-sm font-semibold">No strong home-run plays right now</div><div className="mt-1 text-xs text-muted-foreground">{data?.note ?? 'The model will wait for stronger data instead of forcing picks.'}</div></div>}

      <div className="rounded-md border bg-card p-4 text-[10px] text-muted-foreground"><span className="font-semibold text-foreground">Model {data?.modelVersion ?? 'hr-v1-research'}:</span> {data?.methodology}</div>
    </>}
  </div>;
}
