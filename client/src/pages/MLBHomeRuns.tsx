import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Clock3, Cloud, CloudRain, Crosshair, Flame, MapPin, Sun, ThermometerSun, Wind, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type BookQuote = { bookmaker: string; bookmakerKey: string; americanOdds: number; updatedAt: string | null };
type HrMarket = {
  source: 'PropLine'; bestOdds: number; bestBook: string; impliedProbability: number; consensusImpliedProbability: number;
  quoteCount: number; trustedQuoteCount: number; outlierQuoteCount: number; priceVerified: boolean; modelEdge: number;
  expectedValue: number; valueTier: 'BEST_VALUE' | 'VALUE' | 'NONE'; quotes: BookQuote[]; capturedAt: string;
};

type Candidate = {
  gamePk: number; gameTime: string; playerId: number; player: string; team: string; opponent: string; headshot: string;
  battingOrder: number | null; lineupConfirmed: boolean; probablePitcher: string | null; venue: string | null; probability: number;
  confidence: number; tier: 'POWER_PLAY' | 'STRONG' | 'WATCH';
  season: { plateAppearances: number; homeRuns: number; homeRunRate: number; slugging: number | null; ops: number | null };
  recent: { plateAppearances: number; homeRuns: number; homeRunRate: number | null };
  pitcher: { battersFaced: number; homeRunsAllowed: number; homeRunRateAllowed: number | null };
  environment: {
    parkFactor: number; temperatureF: number | null; windMph: number | null; windDirection: string | null; windDegrees?: number | null;
    precipitationProbability?: number | null; condition?: string | null; weatherSource?: 'MLB' | 'Open-Meteo' | 'unavailable'; weatherFactor: number;
  };
  factors: string[]; market: HrMarket | null; homepageEligible?: boolean;
};

type Payload = {
  date: string; modelVersion: string; updatedAt: string; candidates: Candidate[]; strongest: Candidate[]; valuePlays: Candidate[]; watchlist: Candidate[];
  gamesWithConfirmedLineups: number; teamsWithConfirmedLineups: number; totalGames: number; marketStatus: 'available' | 'unavailable' | 'disabled';
  marketGamesMatched: number; marketPlayersPriced: number; homepageReady?: boolean; methodology: string; note: string;
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
function gameHasStarted(row: Candidate) { const start = new Date(row.gameTime).getTime(); return Number.isFinite(start) && start <= Date.now(); }
function valueQuality(row: Candidate) { const m = row.market; if (!m) return -999; return row.probability * 0.55 + Math.min(12, Math.max(0, m.modelEdge)) * 1.2 + row.confidence * 0.18; }
function qualifiesForMainValue(row: Candidate) {
  const m = row.market;
  if (!m || gameHasStarted(row)) return false;
  return row.lineupConfirmed && m.priceVerified && m.trustedQuoteCount >= 2 && row.confidence >= 70 && row.probability >= 12 && m.modelEdge >= 2 && m.bestOdds >= 150 && m.bestOdds <= 1200;
}
function tierLabel(row: Candidate) { if (!row.lineupConfirmed) return 'WATCH'; return row.tier === 'POWER_PLAY' ? 'POWER PLAY' : row.tier; }
function tierClass(row: Candidate) {
  if (!row.lineupConfirmed) return 'border-amber-500/35 bg-amber-500/10 text-amber-600 dark:text-amber-300';
  if (row.tier === 'POWER_PLAY') return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300';
  if (row.tier === 'STRONG') return 'border-orange-500/35 bg-orange-500/10 text-orange-600 dark:text-orange-300';
  return 'border-border bg-muted/30 text-muted-foreground';
}
function environmentEffect(row: Candidate) { return (row.environment.parkFactor * row.environment.weatherFactor - 1) * 100; }
function environmentTone(effect: number) {
  if (effect >= 10) return { label: 'ELITE', shell: 'border-emerald-500/35 bg-gradient-to-br from-emerald-500/16 via-card to-lime-500/8', chip: 'bg-emerald-500 text-white', accent: 'text-emerald-500', bar: 'bg-emerald-500' };
  if (effect >= 4) return { label: 'BOOST', shell: 'border-cyan-500/30 bg-gradient-to-br from-cyan-500/14 via-card to-emerald-500/7', chip: 'bg-cyan-500 text-white', accent: 'text-cyan-500', bar: 'bg-cyan-500' };
  if (effect <= -8) return { label: 'COLD', shell: 'border-rose-500/30 bg-gradient-to-br from-rose-500/12 via-card to-slate-500/8', chip: 'bg-rose-500 text-white', accent: 'text-rose-500', bar: 'bg-rose-500' };
  if (effect <= -3) return { label: 'LOW', shell: 'border-amber-500/30 bg-gradient-to-br from-amber-500/12 via-card to-card', chip: 'bg-amber-500 text-black', accent: 'text-amber-500', bar: 'bg-amber-500' };
  return { label: 'NEUTRAL', shell: 'border-slate-500/20 bg-gradient-to-br from-slate-500/8 via-card to-card', chip: 'bg-slate-500 text-white', accent: 'text-muted-foreground', bar: 'bg-slate-400' };
}
function weatherIcon(row: Candidate) {
  const condition = (row.environment.condition ?? '').toLowerCase();
  const rain = row.environment.precipitationProbability ?? 0;
  if (condition.includes('rain') || condition.includes('storm') || rain >= 45) return CloudRain;
  if (condition.includes('cloud') || condition.includes('overcast')) return Cloud;
  return Sun;
}
function windSummary(row: Candidate) {
  if (row.environment.windDirection) return row.environment.windDirection;
  if (row.environment.windMph !== null) return `${row.environment.windMph} mph`;
  return '—';
}

const BOOK_DOMAINS: Array<[string, string]> = [
  ['fanduel', 'fanduel.com'], ['draftkings', 'draftkings.com'], ['betmgm', 'betmgm.com'], ['caesars', 'caesars.com'],
  ['betrivers', 'betrivers.com'], ['fanatics', 'fanatics.com'], ['espnbet', 'espnbet.com'], ['bet365', 'bet365.com'],
  ['bovada', 'bovada.lv'], ['pinnacle', 'pinnacle.com'], ['hardrock', 'hardrock.bet'], ['betonline', 'betonline.ag'],
  ['thescore', 'thescore.bet'], ['scorebet', 'thescore.bet'], ['fliff', 'getfliff.com'], ['novig', 'novig.us'],
  ['kalshi', 'kalshi.com'], ['prizepicks', 'prizepicks.com'], ['sleeper', 'sleeper.com'],
];
function bookDomain(quote: Pick<BookQuote, 'bookmaker' | 'bookmakerKey'>) {
  const key = `${quote.bookmakerKey} ${quote.bookmaker}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  return BOOK_DOMAINS.find(([needle]) => key.includes(needle))?.[1] ?? null;
}
function SportsbookLogo({ quote }: { quote: Pick<BookQuote, 'bookmaker' | 'bookmakerKey'> }) {
  const domain = bookDomain(quote); const initial = quote.bookmaker.trim().charAt(0).toUpperCase() || 'S';
  return <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white text-[10px] font-black text-black">{domain ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={`${quote.bookmaker} logo`} className="h-5 w-5 object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} /> : initial}</div>;
}
function BookPrice({ quote, compact = false }: { quote: BookQuote; compact?: boolean }) {
  return <div className={`flex items-center gap-2 rounded-lg border bg-background/65 ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}><SportsbookLogo quote={quote} /><div className="min-w-0 flex-1"><div className={`${compact ? 'text-[9px]' : 'text-[10px]'} truncate font-semibold`}>{quote.bookmaker}</div></div><div className={`${compact ? 'text-[10px]' : 'text-xs'} shrink-0 font-mono font-black`}>{odds(quote.americanOdds)}</div></div>;
}
function PlayerHeadshot({ row, size = 'lg' }: { row: Candidate; size?: 'lg' | 'sm' }) {
  const dimensions = size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
  return <div className={`${dimensions} shrink-0 overflow-hidden rounded-full bg-muted/70 ring-1 ring-border/70`}><img src={row.headshot} alt={row.player} className="h-full w-full scale-[0.9] object-contain object-center" onError={e => { e.currentTarget.style.display = 'none'; }} /></div>;
}

function BaseballDiamond({ row }: { row: Candidate }) {
  const degrees = row.environment.windDegrees ?? 0;
  const hasDirection = row.environment.windDegrees !== null && row.environment.windDegrees !== undefined;
  return <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-sky-500/20 to-emerald-500/15 shadow-inner">
    <div className="absolute left-1/2 top-[57%] h-16 w-16 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[10px] border-2 border-white/45 bg-emerald-500/25" />
    <div className="absolute left-1/2 top-[57%] h-7 w-7 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-white/55 bg-amber-300/15" />
    <div className="absolute bottom-[13px] left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-white/90" />
    <div className="absolute left-1/2 top-1/2 h-9 w-[3px] origin-bottom -translate-x-1/2 -translate-y-full rounded-full bg-cyan-200 shadow-[0_0_8px_rgba(103,232,249,.9)]" style={{ transform: `translate(-50%, -100%) rotate(${degrees}deg)` }}>
      <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l-[3px] border-t-[3px] border-cyan-100" />
    </div>
    <div className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-1 text-[8px] font-black text-white">{hasDirection ? `${Math.round(degrees)}°` : 'WIND'}</div>
  </div>;
}

function EnvironmentCard({ row, candidateCount }: { row: Candidate; candidateCount: number }) {
  const effect = environmentEffect(row); const tone = environmentTone(effect); const WeatherIcon = weatherIcon(row);
  const precip = row.environment.precipitationProbability;
  return <div className={`min-w-[340px] flex-1 rounded-3xl border p-4 shadow-sm ${tone.shell}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><div className="flex items-center gap-2"><span className="text-base">⚾</span><span className="truncate text-sm font-black">{row.team} vs {row.opponent}</span></div><div className="mt-1 flex items-center gap-1.5 truncate text-[9px] text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" />{row.venue ?? 'Venue'} · {time(row.gameTime)}</div></div>
      <div className={`rounded-full px-2.5 py-1 text-[8px] font-black tracking-[.12em] ${tone.chip}`}>{tone.label}</div>
    </div>
    <div className="mt-4 grid grid-cols-[112px_1fr] gap-3"><BaseballDiamond row={row} /><div className="grid grid-cols-2 gap-2">
      <div className="rounded-2xl border border-white/10 bg-background/55 p-3"><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[.12em] text-muted-foreground"><ThermometerSun className="h-3.5 w-3.5" />Temp</div><div className="mt-1 font-mono text-xl font-black">{row.environment.temperatureF !== null ? `${Math.round(row.environment.temperatureF)}°` : '—'}</div></div>
      <div className="rounded-2xl border border-white/10 bg-background/55 p-3"><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[.12em] text-muted-foreground"><Wind className="h-3.5 w-3.5" />Wind</div><div className="mt-1 font-mono text-xl font-black">{row.environment.windMph !== null ? `${Math.round(row.environment.windMph)}` : '—'}<span className="ml-1 text-[9px] font-medium text-muted-foreground">mph</span></div></div>
      <div className="rounded-2xl border border-white/10 bg-background/55 p-3"><div className="flex items-center gap-1.5 text-[8px] uppercase tracking-[.12em] text-muted-foreground"><WeatherIcon className="h-3.5 w-3.5" />Weather</div><div className="mt-1 truncate text-[11px] font-black">{row.environment.condition ?? 'Clear'}</div><div className="text-[9px] text-muted-foreground">{precip !== null && precip !== undefined ? `${Math.round(precip)}% rain` : windSummary(row)}</div></div>
      <div className="rounded-2xl border border-white/10 bg-background/55 p-3"><div className="text-[8px] uppercase tracking-[.12em] text-muted-foreground">HR carry</div><div className={`mt-1 font-mono text-xl font-black ${tone.accent}`}>{effect >= 0 ? '+' : ''}{effect.toFixed(1)}%</div><div className="text-[9px] text-muted-foreground">{candidateCount} hitters</div></div>
    </div></div>
    <div className="mt-3 flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-background/60"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.max(12, Math.min(100, 50 + effect * 3))}%` }} /></div><span className="max-w-[150px] truncate text-[9px] font-semibold text-muted-foreground">{windSummary(row)}</span></div>
  </div>;
}

function ConfirmedRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  const best = row.market?.quotes?.[0];
  return <button type="button" onClick={() => onOpen(row)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_125px] items-center gap-3 border-b border-border/45 px-4 py-3.5 text-left transition-all last:border-b-0 hover:bg-orange-500/[.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><PlayerHeadshot row={row} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-[15px] font-bold">{row.player}</span>{row.battingOrder !== null && <Badge variant="outline" className="h-5 border-emerald-500/25 bg-emerald-500/10 px-1.5 text-[9px] text-emerald-600">#{row.battingOrder}</Badge>}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-2 flex flex-wrap items-center gap-2"><Badge variant="outline" className={`text-[8px] ${tierClass(row)}`}>{tierLabel(row)}</Badge><span className="text-[9px] text-muted-foreground">{row.confidence}% confidence</span></div></div><div className="text-right"><div className="font-mono text-2xl font-black">{row.probability.toFixed(1)}%</div><div className="text-[8px] uppercase tracking-[.14em] text-muted-foreground">HR chance</div>{best && <div className="mt-2 flex justify-end"><div className="flex items-center gap-1.5"><SportsbookLogo quote={best} /><span className="font-mono text-[10px] font-bold">{odds(best.americanOdds)}</span></div></div>}</div></button>;
}
function ValueRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  const m = row.market!; const books = m.quotes.slice(0, 3);
  return <button type="button" onClick={() => onOpen(row)} className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-border/45 px-4 py-3.5 text-left transition-all last:border-b-0 hover:bg-violet-500/[.045] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40 md:grid-cols-[auto_minmax(0,1fr)_250px] md:items-center"><PlayerHeadshot row={row} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-[15px] font-bold">{row.player}</span><Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 text-violet-600 dark:text-violet-300">VALUE</Badge></div><div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-1.5 text-[9px] text-muted-foreground">Model {row.probability.toFixed(1)}% · Market {m.consensusImpliedProbability.toFixed(1)}%</div><div className="mt-1 font-mono text-[10px] font-bold text-emerald-600">+{m.modelEdge.toFixed(1)}% edge</div></div><div className="col-span-2 grid grid-cols-1 gap-1.5 sm:grid-cols-3 md:col-span-1">{books.map((q, i) => <BookPrice key={`${q.bookmakerKey}-${i}`} quote={q} compact />)}</div></button>;
}
function WatchRow({ row, onOpen }: { row: Candidate; onOpen: (row: Candidate) => void }) {
  return <button type="button" onClick={() => onOpen(row)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_90px] items-center gap-3 border-b border-border/45 px-4 py-3 text-left last:border-b-0 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><PlayerHeadshot row={row} size="sm" /><div className="min-w-0"><span className="truncate text-sm font-bold">{row.player}</span><div className="mt-0.5 text-[10px] text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div><div className="mt-1.5"><Badge variant="outline" className={`text-[8px] ${tierClass(row)}`}>WATCH</Badge></div></div><div className="text-right"><div className="font-mono text-xl font-black">{row.probability.toFixed(1)}%</div><div className="text-[8px] uppercase tracking-[.14em] text-muted-foreground">HR chance</div></div></button>;
}
function DetailMetric({ label, value, sub }: { label: string; value: string; sub?: string }) { return <div className="rounded-lg border bg-muted/20 p-3"><div className="text-[8px] uppercase tracking-[.13em] text-muted-foreground">{label}</div><div className="mt-1 font-mono text-lg font-black">{value}</div>{sub && <div className="mt-0.5 text-[9px] text-muted-foreground">{sub}</div>}</div>; }
function PlayerDetailModal({ row, onClose }: { row: Candidate; onClose: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={e => { if (e.currentTarget === e.target) onClose(); }}><div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-card shadow-2xl"><div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-card/95 px-5 py-4 backdrop-blur"><div className="flex min-w-0 items-center gap-3"><PlayerHeadshot row={row} /><div className="min-w-0"><h3 className="truncate text-xl font-black">{row.player}</h3><div className="mt-1 text-xs text-muted-foreground">{row.team} vs {row.opponent} · {time(row.gameTime)}</div></div></div><Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button></div><div className="space-y-5 p-5"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><DetailMetric label="HR Probability" value={`${row.probability.toFixed(1)}%`} sub={`${row.confidence}% confidence`} /><DetailMetric label="Season Power" value={`${row.season.homeRuns} HR`} sub={`${row.season.plateAppearances} PA`} /><DetailMetric label="Last 14 Days" value={`${row.recent.homeRuns} HR`} sub={`${row.recent.plateAppearances} PA`} /><DetailMetric label="Pitcher HR Allowed" value={`${row.pitcher.homeRunsAllowed} HR`} sub={`${row.pitcher.battersFaced} BF`} /></div>{row.market && <div className="rounded-xl border border-violet-500/20 bg-violet-500/[.06] p-4"><div className="text-sm font-bold">Sportsbook prices</div><div className="mt-4 grid gap-2 sm:grid-cols-2">{row.market.quotes.map((q, i) => <BookPrice key={`${q.bookmakerKey}-${i}`} quote={q} />)}</div></div>}<div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-muted/15 p-4"><div className="flex items-center gap-2 text-sm font-bold"><Wind className="h-4 w-4 text-cyan-500" />Environment</div><div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground"><div>{row.venue ?? 'Venue pending'}</div><div>{row.environment.temperatureF !== null ? `${row.environment.temperatureF}°F` : '—'} · {row.environment.windMph !== null ? `${row.environment.windMph} mph` : '—'}</div><div>{row.environment.condition ?? 'Conditions pending'}</div></div></div><div className="rounded-xl border bg-muted/15 p-4"><div className="flex items-center gap-2 text-sm font-bold"><Crosshair className="h-4 w-4 text-emerald-500" />Matchup</div><div className="mt-3 space-y-1.5 text-[11px] text-muted-foreground"><div>Pitcher: <span className="font-medium text-foreground">{row.probablePitcher ?? 'Pending'}</span></div><div>{row.lineupConfirmed ? `Batting #${row.battingOrder ?? '—'}` : 'Lineup pending'}</div></div></div></div></div></div></div>;
}

export default function MLBHomeRuns() {
  const [selectedPlayer, setSelectedPlayer] = useState<Candidate | null>(null);
  const { data, isLoading, error } = useQuery<Payload>({ queryKey: ['/api/mlb/home-runs'], staleTime: 60_000, refetchInterval: 5 * 60_000, retry: 1 });
  const upcomingCandidates = useMemo(() => (data?.candidates ?? []).filter(row => !gameHasStarted(row)), [data?.candidates]);
  const environmentGames = useMemo(() => {
    const games = new Map<number, { row: Candidate; count: number }>();
    for (const row of upcomingCandidates) { const current = games.get(row.gamePk); if (!current) games.set(row.gamePk, { row, count: 1 }); else current.count += 1; }
    return [...games.values()].sort((a, b) => environmentEffect(b.row) - environmentEffect(a.row)).slice(0, 8);
  }, [upcomingCandidates]);
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;

  const confirmedRows = upcomingCandidates.filter(row => row.lineupConfirmed).sort((a, b) => b.probability - a.probability || b.confidence - a.confidence).slice(0, 15);
  const valueRows = (data?.valuePlays ?? []).filter(qualifiesForMainValue).sort((a, b) => valueQuality(b) - valueQuality(a)).slice(0, 6);
  const watchRows = (data?.watchlist ?? []).filter(row => !gameHasStarted(row));
  const top = [...confirmedRows, ...watchRows].sort((a, b) => b.probability - a.probability)[0];

  return <div className="space-y-6 pb-4">
    {selectedPlayer && <PlayerDetailModal row={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
    <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500/15"><Flame className="h-5 w-5 text-orange-500" /></div><div><h1 className="text-xl font-black">Home Runs</h1><div className="mt-0.5 text-[10px] text-muted-foreground">MLB power board</div></div></div>{updatedTime(data?.updatedAt) && <div className="text-right text-[9px] text-muted-foreground">{updatedTime(data?.updatedAt)}</div>}</div>

    {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">MLB home-run data could not be loaded right now.</div> : <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-500/12 to-card p-4"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-violet-500">HR Value</div><div className="mt-1 font-mono text-2xl font-black">{valueRows.length}</div></div>
        <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/12 to-card p-4"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-orange-500">Top HR</div><div className="mt-1 font-mono text-2xl font-black">{top ? `${top.probability.toFixed(1)}%` : '—'}</div><div className="truncate text-[9px] text-muted-foreground">{top?.player ?? '—'}</div></div>
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/12 to-card p-4"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-cyan-500">Priced</div><div className="mt-1 font-mono text-2xl font-black">{data?.marketPlayersPriced ?? 0}</div></div>
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/12 to-card p-4"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-emerald-500">Ranked</div><div className="mt-1 font-mono text-2xl font-black">{confirmedRows.length}</div></div>
      </div>

      {environmentGames.length > 0 && <section><div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Wind className="h-4 w-4 text-cyan-500" /><h2 className="text-sm font-black">Today&apos;s HR Environment</h2></div><span className="text-[9px] font-semibold text-muted-foreground">UPCOMING</span></div><div className="flex gap-3 overflow-x-auto pb-2">{environmentGames.map(({ row, count }) => <EnvironmentCard key={row.gamePk} row={row} candidateCount={count} />)}</div></section>}

      <section><div className="mb-2 flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-violet-500" /><h2 className="text-sm font-black">Strong HR Value</h2><Badge variant="outline" className="h-5 border-violet-500/30 bg-violet-500/10 px-1.5 text-[9px] text-violet-600">{valueRows.length}</Badge></div><div className="max-h-[520px] overflow-y-auto rounded-2xl border border-violet-500/15 bg-card/80">{valueRows.length ? valueRows.map(row => <ValueRow key={`value-${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-10 text-center"><Crosshair className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No strong value right now</div></div>}</div></section>

      <div className="grid gap-4 xl:grid-cols-[1.12fr_.88fr]"><section className="min-w-0"><div className="mb-2 flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-orange-500" /><h2 className="text-sm font-black">Most Likely HR</h2><Badge variant="outline" className="h-5 border-orange-500/25 bg-orange-500/[.08] px-1.5 text-[9px] text-orange-600">{confirmedRows.length}</Badge></div><div className="max-h-[760px] overflow-y-auto rounded-2xl border border-orange-500/15 bg-card/80">{confirmedRows.length ? confirmedRows.map(row => <ConfirmedRow key={`${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-12 text-center"><Clock3 className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No confirmed hitters yet</div></div>}</div></section><section className="min-w-0"><div className="mb-2 flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-amber-500" /><h2 className="text-sm font-black">Watchlist</h2></div><div className="max-h-[500px] overflow-y-auto rounded-2xl border border-amber-500/15 bg-card/75">{watchRows.length ? watchRows.map(row => <WatchRow key={`${row.gamePk}-${row.playerId}`} row={row} onOpen={setSelectedPlayer} />) : <div className="px-5 py-12 text-center"><Activity className="mx-auto h-7 w-7 text-muted-foreground/35" /><div className="mt-2 text-sm font-semibold">No watchlist players</div></div>}</div></section></div>
    </>}
  </div>;
}
