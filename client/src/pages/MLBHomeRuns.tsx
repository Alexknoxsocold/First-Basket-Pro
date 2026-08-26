import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Clock3, Crosshair, Flame, MapPin, ShieldCheck, ThermometerSun, Wind, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type BookQuote = { bookmaker: string; bookmakerKey: string; americanOdds: number; updatedAt: string | null };
type HrMarket = {
  source: 'PropLine';
  bestOdds: number;
  bestBook: string;
  impliedProbability: number;
  consensusImpliedProbability: number;
  quoteCount: number;
  trustedQuoteCount: number;
  outlierQuoteCount: number;
  priceVerified: boolean;
  modelEdge: number;
  expectedValue: number;
  valueTier: 'BEST_VALUE' | 'VALUE' | 'NONE';
  quotes: BookQuote[];
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
function updatedTime(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : `${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`;
}
function odds(value: number) { return value > 0 ? `+${Math.round(value)}` : String(Math.round(value)); }
function gameHasStarted(row: Candidate) {
  const start = new Date(row.gameTime).getTime();
  return Number.isFinite(start) && start <= Date.now();
}
function valueQuality(row: Candidate) {
  const m = row.market;
  if (!m) return -999;
  return row.probability * 0.55 + Math.min(12, Math.max(0, m.modelEdge)) * 1.2 + row.confidence * 0.18;
}
function qualifiesForMainValue(row: Candidate) {
  const m = row.market;
  if (!m || gameHasStarted(row)) return false;
  return row.lineupConfirmed && m.priceVerified && m.trustedQuoteCount >= 2 && row.confidence >= 70 && row.probability >= 12 && m.modelEdge >= 2 && m.bestOdds >= 150 && m.bestOdds <= 1200;
}
function tierLabel(row: Candidate) { if (!row.lineupConfirmed) return 'EARLY WATCH'; return row.tier === 'POWER_PLAY' ? 'POWER PLAY' : row.tier; }
function tierClass(row: Candidate) {
  if (!row.lineupConfirmed) return 'border-yellow-500/35 bg-yellow-500/10 text-yellow-600 dark:text-yellow-300';
  if (row.tier === 'POWER_PLAY') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
  if (row.tier === 'STRONG') return 'border-primary/35 bg-primary/10 text-primary';
  return 'border-border bg-muted/30 text-muted-foreground';
}

function environmentEffect(row: Candidate) {
  return (row.environment.parkFactor * row.environment.weatherFactor - 1) * 100;
}
function environmentLabel(effect: number) {
  if (effect >= 10) return { label: 'ELITE HR WEATHER', className: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' };
  if (effect >= 4) return { label: 'HR BOOST', className: 'border-cyan-500/35 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300' };
  if (effect <= -8) return { label: 'HR SUPPRESSED', className: 'border-red-500/35 bg-red-500/10 text-red-600 dark:text-red-300' };
  if (effect <= -3) return { label: 'PITCHER FRIENDLY', className: 'border-yellow-500/35 bg-yellow-500/10 text-yellow-600 dark:text-yellow-300' };
  return { label: 'NEUTRAL', className: 'border-border bg-muted/30 text-muted-foreground' };
}
function windSummary(row: Candidate) {
  if (row.environment.windDirection) return row.environment.windDirection;
  if (row.environment.windMph !== null) return `${row.environment.windMph} mph`;
  return 'Wind pending';
}

const BOOK_DOMAINS: Array<[string, string]> = [
  ['fanduel', 'fanduel.com'], ['draftkings', 'draftkings.com'], ['betmgm', 'betmgm.com'],
  ['caesars', 'caesars.com'], ['betrivers', 'betrivers.com'], ['fanatics', 'fanatics.com'],
  ['espnbet', 'espnbet.com'], ['bet365', 'bet365.com'], ['bovada', 'bovada.lv'],
  ['pinnacle', 'pinnacle.com'], ['hardrock', 'hardrock.bet'], ['betonline', 'betonline.ag'],
  ['thescore', 'thescore.bet'], ['scorebet', 'thescore.bet'], ['fliff', 'getfliff.com'],
  ['novig', 'novig.us'], ['kalshi', 'kalshi.com'], ['prizepicks', 'prizepicks.com'], ['sleeper', 'sleeper.com'],
];
function bookDomain(quote: Pick<BookQuote, 'bookmaker' | 'bookmakerKey'>) {
  const key = `${quote.bookmakerKey} ${quote.bookmaker}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BOOK_DOMAINS.find(([needle]) => key.includes(needle))?.[1] ?? null;
}
function SportsbookLogo({ quote }: { quote: Pick<BookQuote, 'bookmaker' | 'bookmakerKey'> }) {
  const domain = bookDomain(quote);
  const initial = quote.bookmaker.trim().charAt(0).toUpperCase() || 'S';
  return <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white text-[10px] font-black text-black">
    {domain ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={`${quote.bookmaker} logo`} className="h-5 w-5 object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} /> : initial}
  </div>;
}
function BookPrice({ quote, compact = false }: { quote: BookQuote; compact?: boolean }) {
  return <div className={`flex items-center gap-2 rounded-lg border bg-card/60 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
    <SportsbookLogo quote={quote} />
    <div className="min-w-0 flex-1"><div className={`${compact ? 'text-[9px]' : 'text-[10px]'} truncate font-semibold`}>{quote.bookmaker}</div></div>
    <div className={`${compact ? 'text-[10px]' : 'text-xs'} shrink-0 font-mono font-black`}>{odds(quote.americanOdds)}</div>
  </div>;
}

function PlayerHeadshot({ row, size = 'lg' }: { row: Candidate; size?: 'lg' | 'sm' }) {
  const dimensions = size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
  return <div className={`${dimensions} shrink-0 overflow-hidden rounded-full bg-muted/70 ring-1 ring-border/70`}><img src={row.headshot} alt={row.player} className="h-full w-full scale-[0.9] object-contain object-center" onError={e => { e.currentTarget.style.display = 'none'; }} /></div>;
}

function EnvironmentCard({ row, candidateCount }: { row: Candidate; candidateCount: number }) {
  const effect = environmentEffect(row);
  const status = environmentLabel(effect);
  return <div className="min-w-[250px] flex-1 rounded-2xl border bg-card/85 p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><div className="flex items-center gap-2"><Flame className="h-4 w-4 text-orange-500" /><span className="truncate text-sm font-black">{row.team} vs {row.opponent}</span></div><div className="mt-1 flex items-center gap-1.5 truncate text-[9px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{row.venue ?? 'Venue pending'} · {time(row.gameTime)}</div></div>
      <Badge variant="outline" className={`shrink-0 text-[8px] ${status.className}`}>{status.label}</Badge>
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2">
      <div className="rounded-lg border bg-muted/15 p-2.5"><div className="flex items-center gap-1 text-[8px] uppercase tracking-[.12em] text-muted-foreground"><ThermometerSun className="h-3 w-3" />Temp</div><div className="mt-1 font-mono text-sm font-black">{row.environment.temperatureF !== null ? `${Math.round(row.environment.temperatureF)}°` : '—'}</div></div>
      <div className="rounded-lg border bg-muted/15 p-2.5"><div className="flex items-center gap-1 text-[8px] uppercase tracking-[.12em] text-muted-foreground"><Wind className="h-3 w-3" />Wind</div><div className="mt-1 font-mono text-sm font-black">{row.environment.windMph !== null ? `${Math.round(row.environment.windMph)} mph` : '—'}</div></div>
      <div className="rounded-lg border bg-muted/15 p-2.5"><div className="text-[8px] uppercase tracking-[.12em] text-muted-foreground">HR Env</div><div className={`mt-1 font-mono text-sm font-black ${effect > 0 ? 'text-emerald-600' : effect < 0 ? 'text-red-500' : ''}`}>{effect >= 0 ? '+' : ''}{effect.toFixed(1)}%</div></div>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3 text-[9px] text-muted-foreground"><span className="min-w-0 truncate">{windSummary(row)}</span><span className="shrink-0">{candidateCount} tracked hitter{candidateCount === 1 ? '' : 's'}</span></div>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full rounded-full ${effect >= 4 ? 'bg-emerald-500' : effect <= -3 ? 'bg-red-500' : 'bg-muted-foreground/45'}`} style={{ width: `${Math.max(10, Math.min(100, 50 + effect * 3))}%` }} /></div>
  </div>;
}

function ConfirmedRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  const best = row.market?.quotes?.[0];
  return <button type="button" onClick={() => onOpen(row)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_125px] items-center gap-3 border-b border-border/45 px-4 py-3.5 text-left transition-all last:border-b-0 hover:bg-emerald-500/[.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><PlayerHeadshot row={row} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-[15px] font-bold">{row.player}</span>{row.battingOrder !== null && <Badge variant="outline" className="h-5 border-emerald-500/25 bg-emerald-500/10 px-1.5 text-[9px] text-emerald-600">#{row.battingOrder}</Badge>}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className={`text-[8px] ${tierClass(row)}`}>{tierLabel(row)}</Badge><span className="text-[9px] text-muted-foreground">{row.confidence}% model confidence</span></div></div><div className="text-right"><div className="font-mono text-2xl font-black">{row.probability.toFixed(1)}%</div><div className="text-[8px] uppercase tracking-[.14em] text-muted-foreground">HR probability</div>{best && <div className="mt-2 flex justify-end"><div className="flex items-center gap-1.5"><SportsbookLogo quote={best} /><span className="font-mono text-[10px] font-bold">{odds(best.americanOdds)}</span></div></div>}</div></button>;
}
function ValueRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  const m = row.market!; const books = m.quotes.slice(0, 3);
  return <button type="button" onClick={() => onOpen(row)} className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border/45 px-4 py-3.5 text-left transition-all last:border-b-0 hover:bg-violet-500/[.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 md:grid-cols-[auto_minmax(0,1fr)_250px] md:items-center"><PlayerHeadshot row={row} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-[15px] font-bold">{row.player}</span><Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300">STRONG VALUE</Badge></div><div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-1.5 text-[9px] text-muted-foreground">Model {row.probability.toFixed(1)}% · Market {m.consensusImpliedProbability.toFixed(1)}% · {m.trustedQuoteCount} verified books</div><div className="mt-1 font-mono text-[10px] font-bold text-emerald-600">+{m.modelEdge.toFixed(1)}% model edge</div></div><div className="col-span-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3 md:col-span-1">{books.map((q, i) => <BookPrice key={`${q.bookmakerKey}-${i}`} quote={q} compact />)}</div></button>;
}
function WatchRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  return <button type="button" onClick={() => onOpen(row)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_90px] items-center gap-3 border-b border-border/45 px-4 py-3 text-left last:border-b-0 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><PlayerHeadshot row={row} size="sm" /><div className="min-w-0"><span className="truncate text-sm font-bold">{row.player}</span><div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-1.5 flex items-center gap-2"><Badge variant="outline" className={`text-[8px] ${tierClass(row)}`}>EARLY WATCH</Badge><span className="text-[9px] text-muted-foreground">Lineup pending</span></div></div><div className="text-right"><div className="font-mono text-xl font-black">{row.probability.toFixed(1)}%</div><div className="text-[8px] uppercase tracking-[.14em] text-muted-foreground">HR probability</div></div></button>;
}
function DetailMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="rounded-lg border bg-muted/20 p-3"><div className="text-[8px] uppercase tracking-[.13em] text-muted-foreground">{label}</div><div className="mt-1 font-mono text-lg font-black">{value}</div>{sub && <div className="mt-0.5 text-[9px] text-muted-foreground">{sub}</div>}</div>;
}
function PlayerDetailModal({ row, onClose }: { row: Candidate; onClose: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.currentTarget === e.target) onClose(); }}><div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card shadow-2xl"><div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-card/95 px-5 py-4 backdrop-blur"><div className="flex min-w-0 items-center gap-3"><PlayerHeadshot row={row} /><div className="min-w-0"><h3 className="truncate text-xl font-black">{row.player}</h3><div className="mt-1 text-xs text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-1 text-[10px] text-muted-foreground">{row.lineupConfirmed ? `Confirmed batting order${row.battingOrder ? ` #${row.battingOrder}` : ''}` : 'Lineup pending · early watchlist'}</div></div></div><Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button></div><div className="space-y-5 p-5"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><DetailMetric label="HR Probability" value={`${row.probability.toFixed(1)}%`} sub={`${row.confidence}% confidence`} /><DetailMetric label="Season Power" value={`${row.season.homeRuns} HR`} sub={`${row.season.plateAppearances} PA · ${row.season.homeRunRate.toFixed(1)}%`} /><DetailMetric label="Last 14 Days" value={`${row.recent.homeRuns} HR`} sub={`${row.recent.plateAppearances} PA${row.recent.homeRunRate !== null ? ` · ${row.recent.homeRunRate.toFixed(1)}%` : ''}`} /><DetailMetric label="Pitcher HR Allowed" value={`${row.pitcher.homeRunsAllowed} HR`} sub={`${row.pitcher.battersFaced} BF${row.pitcher.homeRunRateAllowed !== null ? ` · ${row.pitcher.homeRunRateAllowed.toFixed(1)}%` : ''}`} /></div>{row.market && <div className="rounded-xl border border-violet-500/20 bg-violet-500/[.06] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-sm font-bold">Live sportsbook prices</div><Badge variant="outline" className={row.market.priceVerified ? 'border-emerald-500/30 bg-emerald-500/[.08] text-emerald-600' : 'border-yellow-500/30 bg-yellow-500/[.08] text-yellow-600'}>{row.market.priceVerified ? `${row.market.trustedQuoteCount} trustworthy books` : 'price not verified'}</Badge></div><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"><DetailMetric label="Best Trusted Price" value={odds(row.market.bestOdds)} sub={row.market.bestBook} /><DetailMetric label="Market Consensus" value={`${row.market.consensusImpliedProbability.toFixed(1)}%`} sub={`${row.market.quoteCount} books received`} /><DetailMetric label="Model Edge" value={`${row.market.modelEdge >= 0 ? '+' : ''}${row.market.modelEdge.toFixed(1)}%`} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{row.market.quotes.map((q, i) => <BookPrice key={`${q.bookmakerKey}-${i}`} quote={q} />)}</div>{row.market.outlierQuoteCount > 0 && <div className="mt-3 rounded-md border border-yellow-500/20 bg-yellow-500/[.06] px-3 py-2 text-[9px] text-muted-foreground">{row.market.outlierQuoteCount} extreme quote{row.market.outlierQuoteCount === 1 ? '' : 's'} detected. They remain visible for transparency but do not create a main value play.</div>}</div>}<div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-muted/15 p-4"><div className="flex items-center gap-2 text-sm font-bold"><Wind className="h-4 w-4 text-cyan-500" />Ballpark & atmosphere</div><div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground"><div>{row.venue ?? 'Venue pending'} · park multiplier {row.environment.parkFactor.toFixed(3)}x</div><div>{row.environment.temperatureF !== null ? `${row.environment.temperatureF}°F` : 'Temperature pending'} · weather multiplier {row.environment.weatherFactor.toFixed(3)}x</div><div>{row.environment.windDirection ?? 'Wind data pending'}{row.environment.windMph !== null ? ` · ${row.environment.windMph} mph` : ''}</div></div></div><div className="rounded-xl border bg-muted/15 p-4"><div className="flex items-center gap-2 text-sm font-bold"><Crosshair className="h-4 w-4 text-emerald-500" />Matchup controls</div><div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground"><div>Probable pitcher: <span className="font-medium text-foreground">{row.probablePitcher ?? 'Pending'}</span></div><div>{row.lineupConfirmed ? `Batting order #${row.battingOrder ?? '—'} is included in expected plate appearances.` : 'Neutral plate-appearance assumption is used until the official order posts.'}</div><div>Sportsbook prices help identify value; they never change the baseball probability.</div></div></div></div><div><div className="mb-2 text-xs font-bold">Why the model ranks this player</div><div className="space-y-2">{row.factors.map((factor, index) => <div key={index} className="rounded-lg border bg-muted/10 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">• {factor}</div>)}</div></div></div></div></div>;
}
function FactorCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <div className="min-w-0 border-border/45 px-3 py-2.5 md:border-r md:last:border-r-0"><div className="flex items-center gap-2 text-xs font-semibold">{icon}<span>{title}</span></div><div className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">{children}</div></div>;
}

export default function MLBHomeRuns() {
  const [selectedPlayer, setSelectedPlayer] = useState<Candidate | null>(null);
  const { data, isLoading, error } = useQuery<Payload>({ queryKey: ['/api/mlb/home-runs'], staleTime: 60_000, refetchInterval: 5 * 60_000, retry: 1 });
  const upcomingCandidates = useMemo(() => (data?.candidates ?? []).filter(row => !gameHasStarted(row)), [data?.candidates]);
  const environmentGames = useMemo(() => {
    const games = new Map<number, { row: Candidate; count: number }>();
    for (const row of upcomingCandidates) {
      const current = games.get(row.gamePk);
      if (!current) games.set(row.gamePk, { row, count: 1 });
      else current.count += 1;
    }
    return [...games.values()].sort((a, b) => environmentEffect(b.row) - environmentEffect(a.row)).slice(0, 8);
  }, [upcomingCandidates]);
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;

  const confirmedRows = (data?.strongest ?? []).filter(row => !gameHasStarted(row));
  const valueRows = (data?.valuePlays ?? []).filter(qualifiesForMainValue).sort((a, b) => valueQuality(b) - valueQuality(a)).slice(0, 6);
  const watchRows = (data?.watchlist ?? []).filter(row => !gameHasStarted(row));
  const top = [...confirmedRows, ...watchRows].sort((a, b) => b.probability - a.probability)[0];

  return <div className="space-y-5 pb-3">
    {selectedPlayer && <PlayerDetailModal row={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Flame className="h-5 w-5 text-orange-500" /><h1 className="text-xl font-bold">Homeruns</h1></div><p className="mt-1 max-w-3xl text-xs text-muted-foreground">Independent HR probability plus live sportsbook prices. Most likely and strong value are ranked separately.</p></div>{updatedTime(data?.updatedAt) && <div className="text-right text-[9px] text-muted-foreground">Last updated: {updatedTime(data?.updatedAt)}</div>}</div>

    {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">MLB home-run data could not be loaded right now.</div> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-xl border bg-card/80 p-4"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Strong HR value</div><div className="mt-1 font-mono text-2xl font-black">{valueRows.length}</div><div className="text-[9px] text-muted-foreground">Pregame, verified, non-lottery prices</div></div><div className="rounded-xl border bg-card/80 p-4"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Most likely HR</div><div className="mt-1 font-mono text-2xl font-black">{top ? `${top.probability.toFixed(1)}%` : '—'}</div><div className="truncate text-[9px] text-muted-foreground">{top?.player ?? 'Waiting for data'}</div></div><div className="rounded-xl border bg-card/80 p-4"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Players priced</div><div className="mt-1 font-mono text-2xl font-black">{data?.marketPlayersPriced ?? 0}</div><div className="text-[9px] text-muted-foreground">Live PropLine HR market</div></div><div className="rounded-xl border bg-card/80 p-4"><div className="text-[9px] uppercase tracking-[.12em] text-muted-foreground">Confirmed plays</div><div className="mt-1 font-mono text-2xl font-black">{confirmedRows.length}</div><div className="text-[9px] text-muted-foreground">Pregame probability-first rankings</div></div></div>

      {environmentGames.length > 0 && <section><div className="mb-2 flex flex-wrap items-end justify-between gap-2"><div><div className="flex items-center gap-2"><Wind className="h-4 w-4 text-cyan-500" /><h2 className="text-sm font-bold">Today&apos;s HR Environment</h2></div><p className="mt-0.5 text-[10px] text-muted-foreground">Game-time weather and park conditions at a glance. Positive numbers help home-run carry; negative numbers suppress it.</p></div><Badge variant="outline" className="text-[8px]">Upcoming games only</Badge></div><div className="flex gap-3 overflow-x-auto pb-1">{environmentGames.map(({ row, count }) => <EnvironmentCard key={row.gamePk} row={row} candidateCount={count} />)}</div></section>}

      <div className={`rounded-xl border px-4 py-3 ${data?.marketStatus === 'available' ? 'border-violet-500/20 bg-violet-500/[.06]' : 'border-yellow-500/20 bg-yellow-500/[.06]'}`}><div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4" />{data?.marketStatus === 'available' ? 'Sportsbook prices are live. Main value favors realistic pregame prices and stronger HR probability instead of raw EV.' : data?.note}</div></div>

      <section><div className="mb-2"><div className="flex items-center gap-2"><h2 className="text-sm font-bold">Strong HR Value</h2><Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-600">{valueRows.length}</Badge></div><p className="mt-0.5 text-[10px] text-muted-foreground">Upcoming games, confirmed lineups and verified multi-book prices only. The public list avoids extreme long-shot value.</p></div><div className="max-h-[520px] overflow-y-auto rounded-2xl border border-violet-500/15 bg-card/80">{valueRows.length ? valueRows.map(row => <ValueRow key={`value-${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-10 text-center"><Crosshair className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No strong HR value right now</div><div className="mt-1 text-[10px] text-muted-foreground">The page will not force long-shot tickets just because the math says positive EV.</div></div>}</div></section>

      <div className="grid gap-4 xl:grid-cols-[1.12fr_.88fr]"><section className="min-w-0"><div className="mb-2"><div className="flex items-center gap-2"><h2 className="text-sm font-bold">Most Likely HR</h2><Badge variant="outline" className="h-5 border-emerald-500/25 bg-emerald-500/[.08] px-1.5 text-[9px] text-emerald-600">{confirmedRows.length}</Badge></div><p className="mt-0.5 text-[10px] text-muted-foreground">Probability ranking only. Sportsbook logo and best received price appear beside players when available.</p></div><div className="max-h-[560px] overflow-y-auto rounded-2xl border border-emerald-500/15 bg-card/80">{confirmedRows.length ? confirmedRows.map(row => <ConfirmedRow key={`${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-12 text-center"><Clock3 className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No upcoming confirmed HR plays</div></div>}</div></section><section className="min-w-0"><div className="mb-2"><h2 className="text-sm font-bold">Early HR Watchlist</h2><p className="mt-0.5 text-[10px] text-muted-foreground">Power profiles before official batting orders post.</p></div><div className="max-h-[500px] overflow-y-auto rounded-xl border bg-card/75">{watchRows.length ? watchRows.map(row => <WatchRow key={`${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-12 text-center"><Activity className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No early watchlist candidates</div></div>}</div></section></div>

      <section className="rounded-xl border bg-card/75 p-3"><div className="px-2 pb-2 text-xs font-bold">What drives the model</div><div className="grid gap-1 md:grid-cols-5"><FactorCard icon={<Flame className="h-4 w-4 text-orange-500" />} title="Hitter Power">Season HR rate and recent power with regression against small samples.</FactorCard><FactorCard icon={<Crosshair className="h-4 w-4 text-red-500" />} title="Pitcher Vulnerability">Probable starter HR allowed rate and league-average priors.</FactorCard><FactorCard icon={<Wind className="h-4 w-4 text-cyan-500" />} title="Ballpark & Weather">Park factor, temperature and wind carry.</FactorCard><FactorCard icon={<ThermometerSun className="h-4 w-4 text-yellow-500" />} title="Opportunity">Batting order, projected plate appearances and lineup status.</FactorCard><FactorCard icon={<ShieldCheck className="h-4 w-4 text-violet-500" />} title="Market Value">Multiple sportsbook prices establish consensus; the public value list emphasizes realistic prices, probability and confidence rather than raw EV.</FactorCard></div></section>
    </>}
  </div>;
}
