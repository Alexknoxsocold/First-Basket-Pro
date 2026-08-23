import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Clock3, Crosshair, Flame, RefreshCw, ShieldCheck, ThermometerSun, Wind, X } from 'lucide-react';
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
    <img src={row.headshot} alt={row.player} className="h-full w-full scale-[1.08] object-cover object-[50%_28%]" onError={e => { e.currentTarget.style.display = 'none'; }} />
  </div>;
}

function ConfirmedRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  return <button
    type="button"
    onClick={() => onOpen(row)}
    className="grid w-full grid-cols-[auto_minmax(0,1fr)_110px] items-center gap-3 border-b border-border/45 px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-muted/30 focus:outline-none focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/40"
    aria-label={`Open ${row.player} home run details`}
  >
    <PlayerHeadshot row={row} size="lg" />
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="truncate text-[15px] font-bold">{row.player}</span>
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
  </button>;
}

function WatchRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  return <button
    type="button"
    onClick={() => onOpen(row)}
    className="grid w-full grid-cols-[auto_minmax(0,1fr)_90px] items-center gap-3 border-b border-border/45 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/30 focus:outline-none focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/40"
    aria-label={`Open ${row.player} home run details`}
  >
    <PlayerHeadshot row={row} size="sm" />
    <div className="min-w-0">
      <span className="truncate text-sm font-bold">{row.player}</span>
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
  </button>;
}

function DetailMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-lg border bg-muted/20 p-3">
    <div className="text-[8px] uppercase tracking-[.13em] text-muted-foreground">{label}</div>
    <div className="mt-1 font-mono text-lg font-black">{value}</div>
    {sub && <div className="mt-0.5 text-[9px] text-muted-foreground">{sub}</div>}
  </div>;
}

function PlayerDetailModal({ row, onClose }: { row: Candidate; onClose: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.currentTarget === e.target) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label={`${row.player} home run model details`} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-card/95 px-5 py-4 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <PlayerHeadshot row={row} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xl font-black">{row.player}</h3><Badge variant="outline" className={`text-[8px] ${tierClass(row)}`}>{tierLabel(row)}</Badge></div>
            <div className="mt-1 text-xs text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div>
            <div className="mt-1 text-[10px] text-muted-foreground">{row.lineupConfirmed ? `Confirmed batting order${row.battingOrder ? ` #${row.battingOrder}` : ''}` : 'Lineup pending · early watchlist'}</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DetailMetric label="HR Probability" value={`${row.probability.toFixed(1)}%`} sub={`${row.confidence}% confidence`} />
          <DetailMetric label="Season Power" value={`${row.season.homeRuns} HR`} sub={`${row.season.plateAppearances} PA · ${row.season.homeRunRate.toFixed(1)}%`} />
          <DetailMetric label="Last 14 Days" value={`${row.recent.homeRuns} HR`} sub={`${row.recent.plateAppearances} PA${row.recent.homeRunRate !== null ? ` · ${row.recent.homeRunRate.toFixed(1)}%` : ''}`} />
          <DetailMetric label="Pitcher HR Allowed" value={`${row.pitcher.homeRunsAllowed} HR`} sub={`${row.pitcher.battersFaced} BF${row.pitcher.homeRunRateAllowed !== null ? ` · ${row.pitcher.homeRunRateAllowed.toFixed(1)}%` : ''}`} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-muted/15 p-4">
            <div className="flex items-center gap-2 text-sm font-bold"><Wind className="h-4 w-4 text-cyan-500" />Ballpark & atmosphere</div>
            <div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
              <div>{row.venue ?? 'Venue pending'} · park multiplier {row.environment.parkFactor.toFixed(3)}x</div>
              <div>{row.environment.temperatureF !== null ? `${row.environment.temperatureF}°F` : 'Temperature pending'} · weather multiplier {row.environment.weatherFactor.toFixed(3)}x</div>
              <div>{row.environment.windDirection ?? 'Wind data pending'}{row.environment.windMph !== null ? ` · ${row.environment.windMph} mph` : ''}</div>
            </div>
          </div>
          <div className="rounded-xl border bg-muted/15 p-4">
            <div className="flex items-center gap-2 text-sm font-bold"><Crosshair className="h-4 w-4 text-emerald-500" />Matchup controls</div>
            <div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
              <div>Probable pitcher: <span className="font-medium text-foreground">{row.probablePitcher ?? 'Pending'}</span></div>
              <div>{row.lineupConfirmed ? `Batting order #${row.battingOrder ?? '—'} is included in expected plate appearances.` : 'Neutral plate-appearance assumption is used until the official order posts.'}</div>
              <div>Season and recent samples are regressed toward league average to reduce small-sample overreaction.</div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-bold">Why the model ranks this player</div>
          <div className="space-y-2">
            {row.factors.map((factor, index) => <div key={index} className="rounded-lg border bg-muted/10 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">• {factor}</div>)}
          </div>
        </div>

        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/[.06] p-3 text-[9px] leading-relaxed text-muted-foreground">Model probability only. No verified home-run sportsbook price is connected yet, so PreziTools does not display invented odds, edge, or EV.</div>
      </div>
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
  const [selectedPlayer, setSelectedPlayer] = useState<Candidate | null>(null);
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
    {selectedPlayer && <PlayerDetailModal row={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}

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
            <p className="mt-0.5 text-[10px] text-muted-foreground">Official lineup is posted and the hitter cleared the model threshold. Click anywhere on a player card for the full breakdown.</p>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card/75 shadow-sm">
            {confirmedRows.length ? confirmedRows.slice(0,5).map(row => <ConfirmedRow key={`${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-12 text-center"><Clock3 className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No confirmed HR plays yet</div><div className="mt-1 text-[10px] text-muted-foreground">Watchlist players upgrade automatically when lineups post and the model still supports them.</div></div>}
          </div>
        </section>

        <section className="min-w-0">
          <div className="mb-2">
            <h2 className="text-sm font-bold">Early HR Watchlist</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">Best pre-lineup power profiles. Click anywhere on a player card to see the detailed model card.</p>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card/75 shadow-sm">
            {watchRows.length ? watchRows.slice(0,7).map(row => <WatchRow key={`${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-12 text-center"><Activity className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No early watchlist candidates</div><div className="mt-1 text-[10px] text-muted-foreground">The model is waiting for enough usable hitter and matchup data.</div></div>}
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
