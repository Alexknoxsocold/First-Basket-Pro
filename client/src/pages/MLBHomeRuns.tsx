import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Clock3, Crosshair, Flame, ShieldCheck, ThermometerSun, Wind, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type HrMarket = {
  source: 'PropLine';
  bestOdds: number;
  bestBook: string;
  impliedProbability: number;
  modelEdge: number;
  expectedValue: number;
  valueTier: 'BEST_VALUE' | 'VALUE' | 'NONE';
  quotes: { bookmaker: string; bookmakerKey: string; americanOdds: number; updatedAt: string | null }[];
  capturedAt: string;
};

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
  market: HrMarket | null;
  homepageEligible?: boolean;
};

type Payload = {
  date: string;
  modelVersion: string;
  updatedAt: string;
  candidates: Candidate[];
  strongest: Candidate[];
  valuePlays: Candidate[];
  watchlist: Candidate[];
  gamesWithConfirmedLineups: number;
  teamsWithConfirmedLineups: number;
  totalGames: number;
  marketStatus: 'available' | 'unavailable' | 'disabled';
  marketGamesMatched: number;
  marketPlayersPriced: number;
  homepageReady?: boolean;
  methodology: string;
  note: string;
};

function time(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Time pending' : `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`;
}
function updatedTime(value?: string) { if (!value) return null; const d = new Date(value); return Number.isNaN(d.getTime()) ? null : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET'; }
function odds(value: number) { return value > 0 ? `+${value}` : String(value); }
function tierLabel(row: Candidate) { if (!row.lineupConfirmed) return 'EARLY WATCH'; return row.tier === 'POWER_PLAY' ? 'POWER PLAY' : row.tier; }
function tierClass(row: Candidate) {
  if (!row.lineupConfirmed) return 'border-yellow-500/35 bg-yellow-500/10 text-yellow-600 dark:text-yellow-300';
  if (row.tier === 'POWER_PLAY') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
  if (row.tier === 'STRONG') return 'border-primary/35 bg-primary/10 text-primary';
  return 'border-border bg-muted/30 text-muted-foreground';
}

function PlayerHeadshot({ row, size = 'lg' }: { row: Candidate; size?: 'lg' | 'sm' }) {
  const dimensions = size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
  return <div className={`${dimensions} shrink-0 overflow-hidden rounded-full bg-muted/70 ring-1 ring-border/70 shadow-sm`}><img src={row.headshot} alt={row.player} className="h-full w-full scale-[0.9] object-contain object-center" onError={e => { e.currentTarget.style.display = 'none'; }} /></div>;
}

function ConfirmedRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  return <button type="button" onClick={() => onOpen(row)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_110px] items-center gap-3 border-b border-border/45 px-4 py-3.5 text-left transition-all last:border-b-0 hover:bg-emerald-500/[.045] focus:outline-none focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/40">
    <PlayerHeadshot row={row} size="lg" />
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-[15px] font-bold">{row.player}</span>{row.battingOrder !== null && <Badge variant="outline" className="h-5 border-emerald-500/25 bg-emerald-500/10 px-1.5 text-[9px] text-emerald-600">#{row.battingOrder}</Badge>}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className={`text-[8px] ${tierClass(row)}`}>{tierLabel(row)}</Badge><span className="text-[9px] text-muted-foreground">{row.confidence}% model confidence</span></div></div>
    <div className="text-right"><div className="font-mono text-2xl font-black tracking-tight">{row.probability.toFixed(1)}%</div><div className="text-[8px] uppercase tracking-[.14em] text-muted-foreground">HR probability</div>{row.market && <div className="mt-1 text-[9px] text-muted-foreground">Best {odds(row.market.bestOdds)}</div>}</div>
  </button>;
}

function ValueRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  const m = row.market!;
  return <button type="button" onClick={() => onOpen(row)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_135px] items-center gap-3 border-b border-border/45 px-4 py-3.5 text-left transition-all last:border-b-0 hover:bg-violet-500/[.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40">
    <PlayerHeadshot row={row} size="lg" />
    <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-[15px] font-bold">{row.player}</span><Badge variant="outline" className={m.valueTier === 'BEST_VALUE' ? 'border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300' : 'border-cyan-500/35 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300'}>{m.valueTier === 'BEST_VALUE' ? 'BEST VALUE' : 'VALUE'}</Badge></div><div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-2 text-[9px] text-muted-foreground">Model {row.probability.toFixed(1)}% · Market {m.impliedProbability.toFixed(1)}% · {m.bestBook}</div></div>
    <div className="text-right"><div className="font-mono text-2xl font-black">{odds(m.bestOdds)}</div><div className="text-[8px] uppercase tracking-[.14em] text-muted-foreground">best price</div><div className="mt-1 font-mono text-[11px] font-bold text-emerald-600">+{m.modelEdge.toFixed(1)}% edge</div><div className="text-[9px] text-muted-foreground">EV {m.expectedValue >= 0 ? '+' : ''}{m.expectedValue.toFixed(1)}%</div></div>
  </button>;
}

function WatchRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  return <button type="button" onClick={() => onOpen(row)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_90px] items-center gap-3 border-b border-border/45 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><PlayerHeadshot row={row} size="sm" /><div className="min-w-0"><span className="truncate text-sm font-bold">{row.player}</span><div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-1.5 flex items-center gap-2"><Badge variant="outline" className={`text-[8px] ${tierClass(row)}`}>EARLY WATCH</Badge><span className="text-[9px] text-muted-foreground">Lineup pending</span></div></div><div className="text-right"><div className="font-mono text-xl font-black">{row.probability.toFixed(1)}%</div><div className="text-[8px] uppercase tracking-[.14em] text-muted-foreground">HR probability</div></div></button>;
}

function DetailMetric({ label, value, sub }: { label: string; value: string; sub?: string }) { return <div className="rounded-lg border bg-muted/20 p-3"><div className="text-[8px] uppercase tracking-[.13em] text-muted-foreground">{label}</div><div className="mt-1 font-mono text-lg font-black">{value}</div>{sub && <div className="mt-0.5 text-[9px] text-muted-foreground">{sub}</div>}</div>; }

function PlayerDetailModal({ row, onClose }: { row: Candidate; onClose: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.currentTarget === e.target) onClose(); }}><div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card shadow-2xl">
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-card/95 px-5 py-4 backdrop-blur"><div className="flex min-w-0 items-center gap-3"><PlayerHeadshot row={row} size="lg" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xl font-black">{row.player}</h3><Badge variant="outline" className={`text-[8px] ${tierClass(row)}`}>{tierLabel(row)}</Badge></div><div className="mt-1 text-xs text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-1 text-[10px] text-muted-foreground">{row.lineupConfirmed ? `Confirmed batting order${row.battingOrder ? ` #${row.battingOrder}` : ''}` : 'Lineup pending · early watchlist'}</div></div></div><Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button></div>
    <div className="space-y-5 p-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><DetailMetric label="HR Probability" value={`${row.probability.toFixed(1)}%`} sub={`${row.confidence}% confidence`} /><DetailMetric label="Season Power" value={`${row.season.homeRuns} HR`} sub={`${row.season.plateAppearances} PA · ${row.season.homeRunRate.toFixed(1)}%`} /><DetailMetric label="Last 14 Days" value={`${row.recent.homeRuns} HR`} sub={`${row.recent.plateAppearances} PA${row.recent.homeRunRate !== null ? ` · ${row.recent.homeRunRate.toFixed(1)}%` : ''}`} /><DetailMetric label="Pitcher HR Allowed" value={`${row.pitcher.homeRunsAllowed} HR`} sub={`${row.pitcher.battersFaced} BF${row.pitcher.homeRunRateAllowed !== null ? ` · ${row.pitcher.homeRunRateAllowed.toFixed(1)}%` : ''}`} /></div>
      {row.market && <div className="rounded-xl border border-violet-500/20 bg-violet-500/[.06] p-4"><div className="text-sm font-bold">Live HR market value · PropLine</div><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><DetailMetric label="Best Price" value={odds(row.market.bestOdds)} sub={row.market.bestBook} /><DetailMetric label="Market Implied" value={`${row.market.impliedProbability.toFixed(1)}%`} /><DetailMetric label="Model Edge" value={`${row.market.modelEdge >= 0 ? '+' : ''}${row.market.modelEdge.toFixed(1)}%`} /><DetailMetric label="Expected Value" value={`${row.market.expectedValue >= 0 ? '+' : ''}${row.market.expectedValue.toFixed(1)}%`} /></div><div className="mt-3 text-[9px] text-muted-foreground">Available prices: {row.market.quotes.slice(0, 6).map(q => `${q.bookmaker} ${odds(q.americanOdds)}`).join(' · ')}</div></div>}
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-muted/15 p-4"><div className="flex items-center gap-2 text-sm font-bold"><Wind className="h-4 w-4 text-cyan-500" />Ballpark & atmosphere</div><div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground"><div>{row.venue ?? 'Venue pending'} · park multiplier {row.environment.parkFactor.toFixed(3)}x</div><div>{row.environment.temperatureF !== null ? `${row.environment.temperatureF}°F` : 'Temperature pending'} · weather multiplier {row.environment.weatherFactor.toFixed(3)}x</div><div>{row.environment.windDirection ?? 'Wind data pending'}{row.environment.windMph !== null ? ` · ${row.environment.windMph} mph` : ''}</div></div></div><div className="rounded-xl border bg-muted/15 p-4"><div className="flex items-center gap-2 text-sm font-bold"><Crosshair className="h-4 w-4 text-emerald-500" />Matchup controls</div><div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground"><div>Probable pitcher: <span className="font-medium text-foreground">{row.probablePitcher ?? 'Pending'}</span></div><div>{row.lineupConfirmed ? `Batting order #${row.battingOrder ?? '—'} is included in expected plate appearances.` : 'Neutral plate-appearance assumption is used until the official order posts.'}</div><div>Sportsbook prices are used for value only; they do not change the model HR probability.</div></div></div></div>
      <div><div className="mb-2 text-xs font-bold">Why the model ranks this player</div><div className="space-y-2">{row.factors.map((factor, index) => <div key={index} className="rounded-lg border bg-muted/10 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">• {factor}</div>)}</div></div>
    </div>
  </div></div>;
}

function FactorCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <div className="min-w-0 border-border/45 px-3 py-2.5 md:border-r md:last:border-r-0"><div className="flex items-center gap-2 text-xs font-semibold">{icon}<span>{title}</span></div><div className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{children}</div></div>; }

export default function MLBHomeRuns() {
  const [selectedPlayer, setSelectedPlayer] = useState<Candidate | null>(null);
  const { data, isLoading, error } = useQuery<Payload>({ queryKey: ['/api/mlb/home-runs'], staleTime: 60_000, refetchInterval: 5 * 60_000, retry: 1 });
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;

  const confirmedRows = data?.strongest ?? [];
  const valueRows = data?.valuePlays ?? [];
  const watchRows = data?.watchlist ?? [];
  const top = [...confirmedRows, ...watchRows].sort((a, b) => b.probability - a.probability)[0];

  return <div className="space-y-5 pb-3">
    {selectedPlayer && <PlayerDetailModal row={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Flame className="h-5 w-5 text-orange-500" /><h1 className="text-xl font-bold">Homeruns</h1></div><p className="mt-1 max-w-3xl text-xs text-muted-foreground">Independent HR probability plus live sportsbook value from PropLine. Most likely and best value are ranked separately.</p></div>{updatedTime(data?.updatedAt) && <div className="text-right text-[9px] text-muted-foreground">Last updated: {updatedTime(data?.updatedAt)}</div>}</div>

    {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">MLB home-run data could not be loaded right now.</div> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-xl border bg-card/80 p-4"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Best HR value</div><div className="mt-1 font-mono text-2xl font-black">{valueRows.length}</div><div className="text-[9px] text-muted-foreground">Confirmed hitters clearing edge + EV</div></div><div className="rounded-xl border bg-card/80 p-4"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Most likely HR</div><div className="mt-1 font-mono text-2xl font-black">{top ? `${top.probability.toFixed(1)}%` : '—'}</div><div className="truncate text-[9px] text-muted-foreground">{top?.player ?? 'Waiting for data'}</div></div><div className="rounded-xl border bg-card/80 p-4"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Players priced</div><div className="mt-1 font-mono text-2xl font-black">{data?.marketPlayersPriced ?? 0}</div><div className="text-[9px] text-muted-foreground">PropLine batter_home_runs market</div></div><div className="rounded-xl border bg-card/80 p-4"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Confirmed plays</div><div className="mt-1 font-mono text-2xl font-black">{confirmedRows.length}</div><div className="text-[9px] text-muted-foreground">Probability-first rankings</div></div></div>

      <div className={`rounded-xl border px-4 py-3 ${data?.marketStatus === 'available' ? 'border-violet-500/20 bg-violet-500/[.06]' : 'border-yellow-500/20 bg-yellow-500/[.06]'}`}><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />{data?.note}</div></div>

      <section><div className="mb-2"><div className="flex items-center gap-2"><h2 className="text-sm font-bold">Best HR Value</h2><Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-600">{valueRows.length}</Badge></div><p className="mt-0.5 text-[10px] text-muted-foreground">Confirmed hitters where our independent HR probability beats the best available market price by enough to clear the value thresholds.</p></div><div className="max-h-[560px] overflow-y-auto rounded-2xl border border-violet-500/15 bg-card/80">{valueRows.length ? valueRows.map(row => <ValueRow key={`value-${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-10 text-center"><Crosshair className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No qualified HR value right now</div><div className="mt-1 text-[10px] text-muted-foreground">That is allowed. The model will not force a value play just because sportsbook prices exist.</div></div>}</div></section>

      <div className="grid gap-4 xl:grid-cols-[1.12fr_.88fr]"><section className="min-w-0"><div className="mb-2"><div className="flex items-center gap-2"><h2 className="text-sm font-bold">Most Likely HR</h2><Badge variant="outline" className="h-5 border-emerald-500/25 bg-emerald-500/[.08] px-1.5 text-[9px] text-emerald-600">{confirmedRows.length}</Badge></div><p className="mt-0.5 text-[10px] text-muted-foreground">Probability ranking only. A player can rank highly here without being a good bet at the offered price.</p></div><div className="max-h-[560px] overflow-y-auto rounded-2xl border border-emerald-500/15 bg-card/80">{confirmedRows.length ? confirmedRows.map(row => <ConfirmedRow key={`${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-12 text-center"><Clock3 className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No confirmed HR plays yet</div></div>}</div></section><section className="min-w-0"><div className="mb-2"><h2 className="text-sm font-bold">Early HR Watchlist</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Power profiles before official batting orders post.</p></div><div className="max-h-[500px] overflow-y-auto rounded-xl border bg-card/75">{watchRows.length ? watchRows.map(row => <WatchRow key={`${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-12 text-center"><Activity className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No early watchlist candidates</div></div>}</div></section></div>

      <section className="rounded-xl border bg-card/75 p-3"><div className="px-2 pb-2 text-xs font-bold">What drives the model</div><div className="grid gap-1 md:grid-cols-5"><FactorCard icon={<Flame className="h-4 w-4 text-orange-500" />} title="Hitter Power">Season HR rate and recent power with regression against small samples.</FactorCard><FactorCard icon={<Crosshair className="h-4 w-4 text-red-500" />} title="Pitcher Vulnerability">Probable starter HR allowed rate and league-average priors.</FactorCard><FactorCard icon={<Wind className="h-4 w-4 text-cyan-500" />} title="Ballpark & Weather">Park factor, temperature and wind carry.</FactorCard><FactorCard icon={<ThermometerSun className="h-4 w-4 text-yellow-500" />} title="Opportunity">Batting order, projected plate appearances and lineup status.</FactorCard><FactorCard icon={<ShieldCheck className="h-4 w-4 text-violet-500" />} title="Market Value">PropLine prices determine edge and EV only; odds never change our baseball probability.</FactorCard></div></section>
      <div className="rounded-md border bg-card/60 p-3 text-[9px] leading-relaxed text-muted-foreground"><span className="font-semibold text-foreground">Model {data?.modelVersion ?? 'hr-v2-value'}:</span> {data?.methodology} Probabilities are model estimates, not guarantees.</div>
    </>}
  </div>;
}
