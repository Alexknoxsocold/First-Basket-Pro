import { useQuery } from '@tanstack/react-query';
import { Activity, Clock3, Crosshair, Flame, RefreshCw, ShieldCheck, ThermometerSun, Wind } from 'lucide-react';
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
  battingOrder: number | null;
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
  homepageEligible?: boolean;
};

type Payload = {
  date: string;
  modelVersion: string;
  updatedAt: string;
  candidates: Candidate[];
  strongest: Candidate[];
  watchlist: Candidate[];
  gamesWithConfirmedLineups: number;
  teamsWithConfirmedLineups: number;
  totalGames: number;
  marketStatus: 'unavailable';
  homepageReady?: boolean;
  methodology: string;
  note: string;
};

function time(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Time pending' : `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`;
}

function updatedTime(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
}

function tierLabel(row: Candidate) {
  if (!row.lineupConfirmed) return 'EARLY WATCH';
  return row.tier === 'POWER_PLAY' ? 'POWER PLAY' : row.tier;
}

function tierClass(row: Candidate) {
  if (!row.lineupConfirmed) return 'border-yellow-500/35 bg-yellow-500/10 text-yellow-600 dark:text-yellow-300';
  if (row.tier === 'POWER_PLAY') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
  if (row.tier === 'STRONG') return 'border-primary/35 bg-primary/10 text-primary';
  return 'border-border bg-muted/30 text-muted-foreground';
}

function PlayerHeadshot({ row, size = 'lg' }: { row: Candidate; size?: 'lg' | 'sm' }) {
  const dimensions = size === 'lg' ? 'h-16 w-16' : 'h-11 w-11';
  return <div className={`${dimensions} shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/70 shadow-sm`}>
    <img
      src={row.headshot}
      alt={row.player}
      className="h-full w-full scale-[1.08] object-cover object-[50%_28%]"
      onError={e => { e.currentTarget.style.display = 'none'; }}
    />
  </div>;
}

function ConfirmedRow({ row }: { row: Candidate }) {
  return <div className="grid grid-cols-[auto_minmax(0,1fr)_110px] items-center gap-3 border-b border-border/45 px-4 py-3.5 last:border-b-0">
    <PlayerHeadshot row={row} size="lg" />
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="truncate text-[15px] font-bold">{row.player}</div>
        {row.battingOrder !== null && <Badge variant="outline" className="h-5 border-emerald-500/25 bg-emerald-500/10 px-1.5 text-[9px] text-emerald-600">#{row.battingOrder}</Badge>}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={`text-[8px] ${tierClass(row)}`}>{tierLabel(row)}</Badge>
        <span className="text-[9px] text-muted-foreground">{row.confidence}% model confidence</span>
      </div>
    </div>
    <div className="text-right">
      <div className="font-mono text-2xl font-black tracking-tight">{row.probability.toFixed(1)}%</div>
      <div className="text-[8px] uppercase tracking-[.14em] text-muted-foreground">HR probability</div>
      <div className="mt-2 text-[9px] text-muted-foreground">{row.season.homeRuns} season HR</div>
    </div>
  </div>;
}

function WatchRow({ row }: { row: Candidate }) {
  return <div className="grid grid-cols-[auto_minmax(0,1fr)_90px] items-center gap-3 border-b border-border/45 px-4 py-3 last:border-b-0">
    <PlayerHeadshot row={row} size="sm" />
    <div className="min-w-0">
      <div className="truncate text-sm font-bold">{row.player}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <Badge variant="outline" className={`text-[8px] ${tierClass(row)}`}>EARLY WATCH</Badge>
        <span className="text-[9px] text-muted-foreground">Lineup pending</span>
      </div>
    </div>
    <div className="text-right">
      <div className="font-mono text-xl font-black">{row.probability.toFixed(1)}%</div>
      <div className="text-[8px] uppercase tracking-[.14em] text-muted-foreground">HR probability</div>
    </div>
  </div>;
}

function FactorCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className="min-w-0 border-border/45 px-3 py-2.5 md:border-r md:last:border-r-0">
    <div className="flex items-center gap-2 text-xs font-semibold">{icon}<span>{title}</span></div>
    <div className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{children}</div>
  </div>;
}

export default function MLBHomeRuns() {
  const { data, isLoading, isFetching, error, refetch } = useQuery<Payload>({
    queryKey: ['/api/mlb/home-runs'],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  if (isLoading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;

  const confirmedRows = data?.strongest ?? [];
  const watchRows = data?.watchlist ?? [];
  const top = [...confirmedRows, ...watchRows].sort((a, b) => b.probability - a.probability)[0];
  const statusTitle = confirmedRows.length
    ? `${confirmedRows.length} confirmed HR play${confirmedRows.length === 1 ? '' : 's'} live`
    : watchRows.length
      ? 'Lineups are still pending — early watchlist is live'
      : 'Waiting for usable MLB hitter data';

  return <div className="space-y-5 pb-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2"><Flame className="h-5 w-5 text-orange-500" /><h1 className="text-xl font-bold">Prezi HR Power</h1></div>
        <p className="mt-1 max-w-3xl text-xs text-muted-foreground">Advanced home-run probability using MLB performance, lineup role, pitcher vulnerability, ballpark carry, temperature, wind, and opportunity.</p>
      </div>
      <div className="text-right">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />Refresh</Button>
        {updatedTime(data?.updatedAt) && <div className="mt-2 text-[9px] text-muted-foreground">Last updated: {updatedTime(data?.updatedAt)}</div>}
      </div>
    </div>

    {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">MLB home-run data could not be loaded right now.</div> : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card/80 p-4 shadow-sm"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Confirmed HR plays</div><div className="mt-1 font-mono text-2xl font-black">{confirmedRows.length}</div><div className="text-[9px] text-muted-foreground">Strong plays after lineup confirmation</div></div>
        <div className="rounded-xl border bg-card/80 p-4 shadow-sm"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Early watchlist</div><div className="mt-1 font-mono text-2xl font-black">{watchRows.length}</div><div className="text-[9px] text-muted-foreground">Power profiles tracked before lineups</div></div>
        <div className="rounded-xl border bg-card/80 p-4 shadow-sm"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Top HR probability</div><div className="mt-1 font-mono text-2xl font-black">{top ? `${top.probability.toFixed(1)}%` : '—'}</div><div className="truncate text-[9px] text-muted-foreground">{top?.player ?? 'Waiting for usable data'}</div></div>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[.07] px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-500" />{statusTitle}</div>
        <p className="mt-1 text-[10px] text-muted-foreground">{data?.note}</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.02fr_.98fr]">
        <section className="min-w-0">
          <div className="mb-2">
            <h2 className="text-sm font-bold">Confirmed HR Plays</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Official lineup is posted and the hitter cleared the model threshold.</p>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card/75 shadow-sm">
            {confirmedRows.length ? confirmedRows.slice(0,5).map(row => <ConfirmedRow key={`${row.gamePk}-${row.playerId}`} row={row} />) : <div className="px-5 py-12 text-center"><Clock3 className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No confirmed HR plays yet</div><div className="mt-1 text-[10px] text-muted-foreground">Watchlist players upgrade automatically when lineups post and the model still supports them.</div></div>}
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-2">
            <h2 className="text-sm font-bold">Early HR Watchlist</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Best pre-lineup power profiles. These are not final plays yet.</p>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card/75 shadow-sm">
            {watchRows.length ? watchRows.slice(0,7).map(row => <WatchRow key={`${row.gamePk}-${row.playerId}`} row={row} />) : <div className="px-5 py-12 text-center"><Activity className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No early watchlist candidates</div><div className="mt-1 text-[10px] text-muted-foreground">The model is waiting for enough usable hitter and matchup data.</div></div>}
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-card/75 p-3 shadow-sm">
        <div className="px-2 pb-2 text-xs font-bold">Key Factors Weighting Home Run Probability</div>
        <div className="grid gap-1 md:grid-cols-5">
          <FactorCard icon={<Flame className="h-4 w-4 text-orange-500" />} title="Hitter Power">Season HR rate, recent form, slugging/OPS and historical plate appearances.</FactorCard>
          <FactorCard icon={<Crosshair className="h-4 w-4 text-red-500" />} title="Pitcher Vulnerability">HR allowed rate, opposing starter sample and regression toward league average.</FactorCard>
          <FactorCard icon={<Wind className="h-4 w-4 text-cyan-500" />} title="Ballpark & Weather">Park factor, temperature, wind speed/direction and atmospheric carry.</FactorCard>
          <FactorCard icon={<ThermometerSun className="h-4 w-4 text-yellow-500" />} title="Opportunity">Batting-order position, expected plate appearances and lineup confirmation.</FactorCard>
          <FactorCard icon={<ShieldCheck className="h-4 w-4 text-violet-500" />} title="Matchup Controls">Probable pitcher, sample-size controls, recent performance and game context.</FactorCard>
        </div>
      </section>

      <div className="rounded-md border bg-card/60 p-3 text-[9px] leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Model {data?.modelVersion ?? 'hr-v1-research'}:</span> {data?.methodology} Probabilities are model estimates, not sportsbook odds or guarantees. No verified HR price is connected yet, so PreziTools does not invent edge or EV.</div>
    </>}
  </div>;
}
