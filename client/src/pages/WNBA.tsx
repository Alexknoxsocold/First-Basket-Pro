import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Clock, AlertCircle, History, CircleDot, Activity, Trophy, Target, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type Candidate = {
  name: string; team: string; position: string; headshot: string | null;
  seasonStarts: number; avgPoints: number; avgFga: number; fgPct: number; avgMinutes: number;
  currentFirstBaskets: number; currentGamesTracked: number; previousFirstBaskets: number; previousGamesTracked: number;
  openingFirstShots: number; openingFirstShotRate: number | null; openingShotFgPct: number | null;
  probability: number; rank: number;
};
type TipSignal = {
  awayJumper: string | null; homeJumper: string | null;
  awayTipWins: number; awayTipEvents: number; awayTipPct: number | null;
  homeTipWins: number; homeTipEvents: number; homeTipPct: number | null;
  projectedFirstPossessionTeam: string | null;
  confidence: 'insufficient' | 'emerging' | 'usable';
};
type Game = {
  id: string; date: string; shortName: string;
  awayTeam: string; homeTeam: string; awayName: string; homeName: string; status: string;
  lineupStatus: 'confirmed' | 'projected' | 'waiting';
  starters: { name: string; team: string }[];
  candidates: Candidate[]; topPick: Candidate | null; tipSignal: TipSignal;
};
type Slate = { season: number; updatedAt: string; teams: { abbreviation: string; name: string }[]; games: Game[]; source: string; modelVersion: string };
type HistoryRow = { playerName: string; team: string; season: number; fbScored: number; verifiedStarterGames: number; rate: number | null; lastUpdated: string };
type HistoryPayload = { currentSeason: number; previousSeason: number; current: HistoryRow[]; previous: HistoryRow[]; status: string; verifiedGames: number; coverageStart: string | null; coverageEnd: string | null; note: string };

function time(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'Time pending' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
}
function pct(v: number | null) { return v === null ? '—' : `${v.toFixed(1)}%`; }
function rate(f: number, g: number) { return g > 0 ? `${((f / g) * 100).toFixed(1)}%` : '—'; }
function tier(p: Candidate) {
  if (p.rank <= 2) return { label: 'CERTAINTY', row: 'bg-emerald-500/10 hover:bg-emerald-500/15', badge: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30' };
  if (p.rank === 3) return { label: 'VALUE EDGE', row: 'bg-yellow-500/10 hover:bg-yellow-500/15', badge: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' };
  if (p.rank <= 5) return { label: 'EDGE', row: 'bg-yellow-500/5 hover:bg-yellow-500/10', badge: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' };
  return { label: 'LONGSHOT', row: p.rank >= 9 ? 'bg-red-500/15 hover:bg-red-500/20' : 'bg-red-500/7 hover:bg-red-500/12', badge: 'bg-red-500/10 text-red-500 border-red-500/25' };
}

function CandidateRow({ p, projected }: { p: Candidate; projected: boolean }) {
  const t = tier(p);
  return <div className={`grid grid-cols-[32px_1fr_auto] lg:grid-cols-[32px_1fr_70px_88px_88px_92px] items-start lg:items-center gap-3 px-2 py-3 border-b last:border-b-0 transition-colors ${t.row}`}>
    <div className="w-8 h-8 rounded-full overflow-hidden bg-muted flex items-center justify-center text-xs font-bold">{p.headshot ? <img src={p.headshot} alt="" className="w-full h-full object-cover object-top" /> : p.rank}</div>
    <div className="min-w-0">
      <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold text-sm truncate">#{p.rank} {p.name}</span><Badge variant="secondary" className="text-[9px]">{p.team}</Badge><Badge variant="outline" className={`text-[8px] ${t.badge}`}>{t.label}</Badge></div>
      <div className="text-[10px] text-muted-foreground">{p.position} · {p.avgPoints.toFixed(1)} PPG · {p.avgFga.toFixed(1)} FGA · {p.avgMinutes.toFixed(1)} MIN</div>
      <div className="grid grid-cols-3 gap-1.5 mt-2 lg:hidden">
        <div className="rounded-md border border-border/50 bg-background/35 px-2 py-1.5"><div className="font-mono text-[11px] font-semibold">{p.seasonStarts}</div><div className="text-[8px] uppercase tracking-wide text-muted-foreground">Starts</div></div>
        <div className="rounded-md border border-border/50 bg-background/35 px-2 py-1.5"><div className="font-mono text-[11px] font-semibold">{p.currentFirstBaskets}/{p.currentGamesTracked}</div><div className="text-[8px] uppercase tracking-wide text-muted-foreground">Verified FB</div><div className="text-[8px] text-muted-foreground">{rate(p.currentFirstBaskets, p.currentGamesTracked)}</div></div>
        <div className="rounded-md border border-border/50 bg-background/35 px-2 py-1.5"><div className="font-mono text-[11px] font-semibold">{pct(p.openingFirstShotRate)}</div><div className="text-[8px] uppercase tracking-wide text-muted-foreground">Opening FGA</div><div className="text-[8px] text-muted-foreground">{pct(p.openingShotFgPct)} FG</div></div>
      </div>
    </div>
    <div className="hidden lg:block text-right"><div className="font-mono text-xs font-semibold">{p.seasonStarts}</div><div className="text-[9px] text-muted-foreground">season starts</div></div>
    <div className="hidden lg:block text-right"><div className="font-mono text-xs">{p.currentFirstBaskets}/{p.currentGamesTracked}</div><div className="text-[9px] text-muted-foreground">{rate(p.currentFirstBaskets, p.currentGamesTracked)} verified FB</div></div>
    <div className="hidden lg:block text-right"><div className="font-mono text-xs">{pct(p.openingFirstShotRate)}</div><div className="text-[9px] text-muted-foreground">opening FGA · {pct(p.openingShotFgPct)} FG</div></div>
    <div className="text-right"><div className="font-mono font-bold text-sm">{p.probability.toFixed(1)}%</div><div className="text-[9px] text-muted-foreground">{projected ? 'preview' : 'model'}</div></div>
  </div>;
}

function TopThree({ game, confirmed }: { game: Game; confirmed: boolean }) {
  const picks = game.candidates.slice(0, 3);
  if (!picks.length) return null;
  return <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">{picks.map((p, i) => {
    const isValue = i === 2;
    return <div key={`${p.team}-${p.name}`} className={`rounded-md border p-3 ${isValue ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-emerald-500/10 border-emerald-500/30'}`}>
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{i === 0 ? (confirmed ? 'Best First Basket pick' : 'Preliminary #1') : i === 1 ? 'Second best pick' : 'Value / bang-for-buck'}</div>
      <div className="font-bold text-sm mt-1">#{i + 1} {p.name}</div>
      <div className="flex justify-between items-end mt-2"><span className="text-[10px] text-muted-foreground">{p.team}{isValue ? ' · upside play' : ''}</span><span className="font-mono font-bold">{p.probability.toFixed(1)}%</span></div>
    </div>;
  })}</div>;
}

function tipLine(team: string, wins: number, events: number, p: number | null) {
  return events > 0 ? `${team} · ${wins}/${events} verified jumps · ${pct(p)}` : `${team} · historical tip sample building`;
}

function TipCard({ game, mobileExpanded, onMobileToggle }: { game: Game; mobileExpanded?: boolean; onMobileToggle?: () => void }) {
  const t = game.tipSignal;
  const awayLean = t.projectedFirstPossessionTeam === game.awayTeam;
  const homeLean = t.projectedFirstPossessionTeam === game.homeTeam;
  const hasLean = awayLean || homeLean;
  const gradient = awayLean
    ? 'linear-gradient(90deg, rgba(16,185,129,.18) 0%, rgba(16,185,129,.07) 38%, rgba(16,185,129,0) 50%, rgba(239,68,68,.07) 62%, rgba(239,68,68,.18) 100%)'
    : homeLean
      ? 'linear-gradient(90deg, rgba(239,68,68,.18) 0%, rgba(239,68,68,.07) 38%, rgba(239,68,68,0) 50%, rgba(16,185,129,.07) 62%, rgba(16,185,129,.18) 100%)'
      : undefined;
  return <div
    className="rounded-md border p-3 mb-4 overflow-hidden cursor-pointer md:cursor-default select-none"
    style={gradient ? { backgroundImage: gradient } : undefined}
    onClick={onMobileToggle}
    onKeyDown={e => { if (onMobileToggle && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onMobileToggle(); } }}
    role={onMobileToggle ? 'button' : undefined}
    tabIndex={onMobileToggle ? 0 : undefined}
    aria-expanded={onMobileToggle ? Boolean(mobileExpanded) : undefined}
  >
    <div className="flex items-center justify-between gap-2 mb-3">
      <div className="flex items-center gap-2"><CircleDot className="w-4 h-4 text-primary" /><span className="text-xs font-semibold">Opening Tip</span><span className="md:hidden text-[9px] text-muted-foreground">Tap for picks</span></div>
      <div className="flex items-center gap-1.5">
        {!hasLean ? <Badge variant="outline" className="text-[9px] border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">TIP LEAN PENDING</Badge> : null}
        <Badge variant="outline" className="text-[9px]">{t.confidence.toUpperCase()}</Badge>
        <ChevronDown className={`md:hidden w-4 h-4 text-muted-foreground transition-transform ${mobileExpanded ? 'rotate-180' : ''}`} />
      </div>
    </div>
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div><div className={`text-xs font-semibold ${hasLean ? (awayLean ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500') : ''}`}>{t.awayJumper || 'Tipper not identified'}{awayLean ? <span className="ml-1.5 text-[8px] uppercase tracking-wide">Lean</span> : null}</div><div className="text-[10px] text-muted-foreground">{tipLine(game.awayTeam, t.awayTipWins, t.awayTipEvents, t.awayTipPct)}</div></div>
      <div className="text-[10px] font-semibold text-muted-foreground">VS</div>
      <div className="text-right"><div className={`text-xs font-semibold ${hasLean ? (homeLean ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500') : ''}`}>{t.homeJumper || 'Tipper not identified'}{homeLean ? <span className="ml-1.5 text-[8px] uppercase tracking-wide">Lean</span> : null}</div><div className="text-[10px] text-muted-foreground">{tipLine(game.homeTeam, t.homeTipWins, t.homeTipEvents, t.homeTipPct)}</div></div>
    </div>
    <div className="mt-3 text-[10px] text-muted-foreground">{t.projectedFirstPossessionTeam ? `Opening-possession lean: ${t.projectedFirstPossessionTeam}. Green marks the tip lean; red marks the lower side. Tip remains a supporting input, not the full First Basket prediction.` : 'Tip lean pending — verified player-level sample is still building. No side is colored until the evidence supports a first-possession lean.'}</div>
  </div>;
}

function GameCard({ game, showAll }: { game: Game; showAll: boolean }) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const confirmed = game.lineupStatus === 'confirmed', projected = game.lineupStatus === 'projected';
  const detailVisibility = `${mobileExpanded ? 'block' : 'hidden'} ${showAll ? 'md:block' : 'md:hidden'}`;
  return <article className="rounded-md border bg-card overflow-hidden">
    <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 bg-muted/20">
      <div><div className="font-bold text-sm">{game.awayTeam} @ {game.homeTeam}</div><div className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{time(game.date)} · {game.status}</div></div>
      <Badge className={confirmed ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' : projected ? 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30' : ''}>{confirmed ? '10 STARTERS CONFIRMED' : projected ? 'PROJECTED · NOT LOCKED' : 'WAITING FOR LINEUP'}</Badge>
    </div>
    <div className={showAll ? 'p-4' : 'p-3'}>{game.lineupStatus === 'waiting' ? <div className="py-8 text-center text-sm text-muted-foreground">Waiting for enough reliable lineup information.</div> : <><TipCard game={game} mobileExpanded={mobileExpanded} onMobileToggle={() => setMobileExpanded(v => !v)} /><div className={detailVisibility}><TopThree game={game} confirmed={confirmed} /><div className="overflow-hidden rounded-md border">{game.candidates.map(p => <CandidateRow key={`${game.id}-${p.team}-${p.name}`} p={p} projected={!confirmed} />)}</div></div></>}</div>
  </article>;
}

function HistoryTable({ rows, season }: { rows: HistoryRow[]; season: number }) {
  return <div className="rounded-md border bg-card overflow-hidden"><div className="px-4 py-3 border-b"><div className="font-semibold text-sm">{season} verified First Basket sample</div><div className="text-[10px] text-muted-foreground mt-1">This is not labeled full-season until every game is reconstructed.</div></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/20 text-[10px] uppercase text-muted-foreground"><tr><th className="text-left px-4 py-2">Player</th><th className="text-left px-3 py-2">Team</th><th className="text-right px-3 py-2">Verified FB</th><th className="text-right px-3 py-2">Verified starter games</th><th className="text-right px-4 py-2">Rate</th></tr></thead><tbody>{rows.length ? rows.map(r => <tr key={`${season}-${r.team}-${r.playerName}`} className="border-t"><td className="px-4 py-2 font-medium">{r.playerName}</td><td className="px-3 py-2 text-muted-foreground">{r.team}</td><td className="px-3 py-2 text-right font-mono">{r.fbScored}</td><td className="px-3 py-2 text-right font-mono">{r.verifiedStarterGames}</td><td className="px-4 py-2 text-right font-mono font-semibold">{pct(r.rate)}</td></tr>) : <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Strict verified history is rebuilding.</td></tr>}</tbody></table></div></div>;
}

export default function WNBA() {
  const [section, setSection] = useState<'games' | 'history'>('games');
  const [showAll, setShowAll] = useState(true);
  const slate = useQuery<Slate>({ queryKey: ['/api/wnba/first-basket'], staleTime: 60000, refetchInterval: 120000 });
  const history = useQuery<HistoryPayload>({ queryKey: ['/api/wnba/history'], staleTime: 60000, refetchInterval: 180000 });
  if (slate.isLoading) return <div className="space-y-4"><Skeleton className="h-9 w-72" /><Skeleton className="h-28" /><Skeleton className="h-80" /></div>;
  const games = slate.data?.games ?? [];
  const topPicks = games.map(g => g.topPick).filter((p): p is Candidate => Boolean(p));
  const avgTopProbability = topPicks.length ? topPicks.reduce((sum, p) => sum + p.probability, 0) / topPicks.length : null;
  const topGame = games.filter(g => g.topPick).sort((a, b) => (b.topPick?.probability ?? 0) - (a.topPick?.probability ?? 0))[0];
  const teamScores = new Map<string, { total: number; count: number }>();
  for (const g of games) for (const p of g.candidates.slice(0, 3)) { const v = teamScores.get(p.team) || { total: 0, count: 0 }; v.total += p.probability; v.count++; teamScores.set(p.team, v); }
  const topTeam = [...teamScores.entries()].map(([team, v]) => ({ team, score: v.total / v.count })).sort((a, b) => b.score - a.score)[0] || null;
  const tipEdges = games.flatMap(g => [{ team: g.awayTeam, jumper: g.tipSignal.awayJumper, pct: g.tipSignal.awayTipPct, events: g.tipSignal.awayTipEvents }, { team: g.homeTeam, jumper: g.tipSignal.homeJumper, pct: g.tipSignal.homeTipPct, events: g.tipSignal.homeTipEvents }]).filter(x => x.pct !== null && x.events > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const topTip = tipEdges[0] || null;

  return <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-8">
    <div className="border-b bg-card"><div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 flex items-center justify-between"><div className="flex"><button onClick={() => setSection('games')} className={`px-4 py-4 text-xs border-b-2 ${section === 'games' ? 'border-primary' : 'border-transparent text-muted-foreground'}`}>WNBA Games</button><button onClick={() => setSection('history')} className={`px-4 py-4 text-xs border-b-2 flex gap-1.5 ${section === 'history' ? 'border-primary' : 'border-transparent text-muted-foreground'}`}><History className="w-3.5 h-3.5" />FB History</button></div><Button variant="outline" size="sm" onClick={() => { slate.refetch(); history.refetch(); }} className="gap-2"><RefreshCw className={`w-3.5 h-3.5 ${(slate.isFetching || history.isFetching) ? 'animate-spin' : ''}`} />Refresh</Button></div></div>
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-bold">WNBA First Basket</h1><p className="text-xs text-muted-foreground mt-1">Projected early · confirmed before lock · top 2 picks + value #3 · strict first-shot, tip and First Basket evidence</p></div>{section === 'games' ? <button type="button" role="switch" aria-checked={showAll} onClick={() => setShowAll(v => !v)} className="hidden md:flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-medium shadow-sm hover:bg-muted/40 transition-colors"><span>Show all</span><span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showAll ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}><span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${showAll ? 'translate-x-4' : 'translate-x-0.5'}`} /></span></button> : null}</div>
      {section === 'games' ? <><div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"><div className="rounded-md border bg-card p-4"><Activity className="w-4 h-4 text-primary mb-2" /><div className="text-2xl font-bold">{games.length}</div><div className="text-xs font-medium">Today's Games</div><div className="text-[10px] text-muted-foreground mt-1">WNBA slate</div></div><div className="rounded-md border bg-card p-4"><Target className="w-4 h-4 text-primary mb-2" /><div className="text-2xl font-bold">{avgTopProbability === null ? '—' : `${avgTopProbability.toFixed(1)}%`}</div><div className="text-xs font-medium">Avg Scoring %</div><div className="text-[10px] text-muted-foreground mt-1">average #1 model probability</div></div><div className="rounded-md border bg-card p-4"><CircleDot className="w-4 h-4 text-primary mb-2" /><div className="text-lg font-bold truncate">{topTip?.jumper || topTip?.team || '—'}</div><div className="text-xs font-medium">Top Jump Ball</div><div className="text-[10px] text-muted-foreground mt-1">{topTip ? `${topTip.team} · ${pct(topTip.pct)}` : 'waiting for verified tip data'}</div></div><div className="rounded-md border bg-card p-4"><Trophy className="w-4 h-4 text-primary mb-2" /><div className="text-lg font-bold">{topTeam?.team || topGame?.topPick?.team || '—'}</div><div className="text-xs font-medium">Top Team Today</div><div className="text-[10px] text-muted-foreground mt-1">{topGame?.topPick ? `${topGame.topPick.name} ${topGame.topPick.probability.toFixed(1)}% top individual` : 'waiting for player model'}</div></div></div><div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{games.map(g => <GameCard key={g.id} game={g} showAll={showAll} />)}</div></> : history.isLoading ? <Skeleton className="h-96" /> : <><div className="rounded-md border bg-card p-4 mb-4"><div className="flex items-start gap-2"><AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5" /><div><div className="text-xs font-semibold">History rebuild status: {history.data?.status ?? 'rebuilding'}</div><div className="text-[10px] text-muted-foreground mt-1">{history.data?.note}</div><div className="text-[10px] text-muted-foreground mt-1">Verified games: {history.data?.verifiedGames ?? 0}{history.data?.coverageStart ? ` · coverage ${new Date(history.data.coverageStart).toLocaleDateString()} to ${new Date(history.data?.coverageEnd || history.data.coverageStart).toLocaleDateString()}` : ''}</div></div></div></div><div className="grid grid-cols-1 xl:grid-cols-2 gap-4"><HistoryTable rows={history.data?.current ?? []} season={history.data?.currentSeason ?? new Date().getUTCFullYear()} /><HistoryTable rows={history.data?.previous ?? []} season={history.data?.previousSeason ?? new Date().getUTCFullYear() - 1} /></div></>}
    </div>
  </div>;
}
