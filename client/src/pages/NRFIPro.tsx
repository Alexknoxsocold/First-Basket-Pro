import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CircleDot, Clock, RefreshCw, TrendingUp, Zap, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Pitcher = { name: string | null; era: number | null; whip: number | null; headshot: string | null };
type NrfiGame = {
  id: string;
  date: string;
  shortName: string;
  away: { abbreviation: string; name: string; logo: string | null; pitcher: Pitcher };
  home: { abbreviation: string; name: string; logo: string | null; pitcher: Pitcher };
  venue: string | null;
  status: string;
  nrfiProbability: number;
  recommendation: "NRFI" | "YRFI";
  playStatus: "BEST_PLAY" | "PLAY" | "LEAN" | "NO_PLAY";
  modelEdge: number;
  confidence: "High" | "Medium" | "Low";
  sampleSize: number;
  factors: string[];
  outcome: "won" | "lost" | "pending";
  firstInningScore: string | null;
};
type NrfiResponse = {
  date: string;
  games: NrfiGame[];
  averageNrfiProbability: number | null;
  topPick: NrfiGame | null;
  updatedAt: string;
  source: string;
  methodology: string;
};

type Filter = "all" | "plays" | "nrfi" | "yrfi" | "outcomes";

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time pending";
  return `${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} ET`;
}

function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });
}

function Team({ team }: { team: NrfiGame["away"] }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {team.logo ? <img src={team.logo} alt="" className="w-8 h-8 object-contain shrink-0" onError={e => { e.currentTarget.style.display = "none"; }} /> : <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">{team.abbreviation}</span>}
      <div className="min-w-0"><p className="font-semibold text-sm truncate">{team.name}</p><p className="text-[10px] text-muted-foreground">{team.abbreviation}</p></div>
    </div>
  );
}

function Pitcher({ label, pitcher }: { label: string; pitcher: Pitcher }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {pitcher.headshot ? <img src={pitcher.headshot} alt="" className="w-7 h-7 rounded-full object-cover object-top bg-muted shrink-0" onError={e => { e.currentTarget.style.display = "none"; }} /> : <span className="w-7 h-7 rounded-full bg-muted shrink-0" />}
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xs truncate">{pitcher.name ?? "Not confirmed"}</p>
        <p className="text-[10px] text-muted-foreground">
          {pitcher.era !== null ? `ERA ${pitcher.era.toFixed(2)}` : "ERA pending"}
          {pitcher.whip !== null ? ` · WHIP ${pitcher.whip.toFixed(2)}` : " · WHIP pending"}
        </p>
      </div>
    </div>
  );
}

function statusLabel(status: NrfiGame["playStatus"]): string {
  return status === "BEST_PLAY" ? "BEST VALUE" : status === "PLAY" ? "STRONG PLAY" : status === "LEAN" ? "LEAN" : "NO PLAY";
}

function GameCard({ game }: { game: NrfiGame }) {
  const isNrfi = game.recommendation === "NRFI";
  const sideProbability = isNrfi ? game.nrfiProbability : 100 - game.nrfiProbability;
  const promoted = game.playStatus === "BEST_PLAY" || game.playStatus === "PLAY";
  const lean = game.playStatus === "LEAN";
  const noPlay = game.playStatus === "NO_PLAY";
  const probabilityColor = sideProbability >= 60 ? "text-emerald-500" : sideProbability >= 55 ? "text-yellow-500" : "text-muted-foreground";
  const cardTone = noPlay
    ? "border-red-500/30 bg-red-500/5"
    : lean
      ? "border-yellow-500/40 bg-yellow-500/5"
      : "bg-card";
  const headerTone = noPlay
    ? "bg-red-500/10 border-red-500/20"
    : lean
      ? "bg-yellow-500/10 border-yellow-500/25"
      : "bg-muted/20";
  return (
    <article className={`rounded-md border overflow-hidden ${cardTone} ${promoted ? "ring-1 ring-primary/20" : ""}`} data-testid={`card-nrfi-${game.id}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b ${headerTone}`}>
        <div className="flex items-center gap-2 min-w-0"><CircleDot className={`w-4 h-4 shrink-0 ${noPlay ? "text-red-500" : lean ? "text-yellow-500" : "text-primary"}`} /><span className="font-bold text-sm truncate">{game.shortName}</span><span className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap"><Clock className="w-3 h-3" />{formatTime(game.date)}</span></div>
        <div className="flex items-center gap-1.5"><Badge className={isNrfi ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" : "bg-orange-500/15 text-orange-500 border-orange-500/30"}>{game.recommendation}</Badge><Badge variant={noPlay ? "destructive" : promoted ? "default" : "secondary"} className={lean ? "bg-yellow-500/15 text-yellow-600 border-yellow-500/30" : ""}>{statusLabel(game.playStatus)}</Badge>{game.outcome === "won" && <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">WON</Badge>}</div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3"><Team team={game.away} /><span className="text-xs text-muted-foreground">@</span><Team team={game.home} /></div>
        <div className="mt-5 flex items-end justify-between gap-4">
          <div><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{isNrfi ? "NRFI probability" : "YRFI probability"}</p><p className={`text-3xl font-bold font-mono ${probabilityColor}`}>{sideProbability.toFixed(1)}%</p><p className="text-[10px] text-muted-foreground mt-1">Model separation from 50%: {game.modelEdge.toFixed(1)} pts</p></div>
          <div className="text-right"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">Confidence</p><p className="text-sm font-semibold">{game.confidence}</p><p className="text-[10px] text-muted-foreground">{game.sampleSize || "Limited"} recent games</p></div>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden mt-2"><div className={`h-full rounded-full ${sideProbability >= 60 ? "bg-emerald-500" : sideProbability >= 55 ? "bg-yellow-500" : noPlay ? "bg-red-500/60" : lean ? "bg-yellow-500/70" : "bg-muted-foreground/40"}`} style={{ width: `${sideProbability}%` }} /></div>
        {lean && <div className="mt-3 rounded-md px-3 py-2 text-xs bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/25">LEAN · The model sees an edge, but not enough separation or data quality for a stronger play.</div>}
        {game.outcome === "won" && <div className="mt-3 rounded-md px-3 py-2 text-xs bg-emerald-500/10 text-emerald-500">Pick won · First inning score: {game.firstInningScore ?? "—"}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 pt-4 border-t"><Pitcher label={`${game.away.abbreviation} pitcher`} pitcher={game.away.pitcher} /><Pitcher label={`${game.home.abbreviation} pitcher`} pitcher={game.home.pitcher} /></div>
        <div className="mt-4 space-y-1">{game.factors.map(factor => <p key={factor} className="text-[10px] text-muted-foreground">• {factor}</p>)}</div>
      </div>
    </article>
  );
}

export default function NRFIPro() {
  const [filter, setFilter] = useState<Filter>("plays");
  const { data, isLoading, isFetching, error, refetch } = useQuery<NrfiResponse>({ queryKey: ["/api/mlb/nrfi"], staleTime: 5 * 60 * 1000, refetchInterval: 5 * 60 * 1000 });
  const games = data?.games ?? [];
  const promoted = games.filter(g => g.playStatus === "BEST_PLAY" || g.playStatus === "PLAY");
  const nrfiGames = [...games.filter(g => g.recommendation === "NRFI" && g.playStatus !== "NO_PLAY")].sort((a, b) => b.modelEdge - a.modelEdge);
  const yrfiGames = [...games.filter(g => g.recommendation === "YRFI" && g.playStatus !== "NO_PLAY")].sort((a, b) => b.modelEdge - a.modelEdge);
  const nrfiPlays = nrfiGames.filter(g => g.playStatus === "BEST_PLAY" || g.playStatus === "PLAY");
  const yrfiPlays = yrfiGames.filter(g => g.playStatus === "BEST_PLAY" || g.playStatus === "PLAY");
  const nearValue = [...games]
    .filter(g => g.playStatus === "LEAN" || g.playStatus === "NO_PLAY")
    .sort((a, b) => b.modelEdge - a.modelEdge)
    .slice(0, 3);
  const topNrfi = nrfiGames[0];
  const topYrfi = yrfiGames[0];

  const visibleGames = filter === "all"
    ? games
    : filter === "plays"
      ? promoted
      : filter === "nrfi"
        ? nrfiGames
        : filter === "yrfi"
          ? yrfiGames
          : games.filter(g => g.outcome === "won");

  if (isLoading) return <div className="space-y-5"><Skeleton className="h-8 w-72" /><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-72 w-full" /></div>;

  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-8">
      <nav className="border-b bg-card"><div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8"><div className="flex items-center gap-0 overflow-x-auto">
        {(["all", "plays", "nrfi", "yrfi", "outcomes"] as Filter[]).map(tab => {
          const count = tab === "all" ? games.length : tab === "plays" ? promoted.length : tab === "nrfi" ? nrfiGames.length : tab === "yrfi" ? yrfiGames.length : games.filter(g => g.outcome === "won").length;
          const label = tab === "all" ? "All Games" : tab === "plays" ? "Value Plays" : tab === "nrfi" ? "NRFI Leans" : tab === "yrfi" ? "YRFI Leans" : "Results";
          return <button key={tab} type="button" onClick={() => setFilter(tab)} className={`px-4 py-3 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${filter === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{label} <span className="text-[10px] opacity-60">({count})</span></button>;
        })}
      </div></div></nav>

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6"><div><h1 className="text-lg font-bold">MLB First-Inning Value</h1><p className="text-xs text-muted-foreground mt-1">{data ? formatDate(data.date) : "Today"} · All Games keeps the full slate; NRFI/YRFI tabs show only actionable leans</p></div><Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2 text-xs"><RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button></div>
        {error ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">MLB data could not be loaded right now. ESPN may be temporarily unavailable.</div> : <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="rounded-md border bg-card p-5"><div className="flex items-center justify-between mb-3"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value Plays</span><Zap className="w-5 h-5 text-primary" /></div><div className="text-3xl font-bold">{promoted.length}</div><div className="text-xs text-muted-foreground mt-1">{nrfiPlays.length} NRFI · {yrfiPlays.length} YRFI</div></div>
            <div className="rounded-md border bg-card p-5"><div className="flex items-center justify-between mb-3"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top NRFI Lean</span><TrendingUp className="w-5 h-5 text-primary" /></div><div className="text-3xl font-bold">{topNrfi ? `${topNrfi.nrfiProbability.toFixed(1)}%` : "—"}</div><div className="text-xs text-muted-foreground mt-1">{topNrfi?.shortName ?? "No actionable NRFI lean"}</div></div>
            <div className="rounded-md border bg-card p-5"><div className="flex items-center justify-between mb-3"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top YRFI Lean</span><TrendingUp className="w-5 h-5 text-primary" /></div><div className="text-3xl font-bold">{topYrfi ? `${(100 - topYrfi.nrfiProbability).toFixed(1)}%` : "—"}</div><div className="text-xs text-muted-foreground mt-1">{topYrfi?.shortName ?? "No actionable YRFI lean"}</div></div>
          </div>

          {filter === "plays" && <div className="rounded-md border bg-primary/5 p-4 mb-6"><div className="flex items-center gap-2 text-sm font-semibold"><Zap className="w-4 h-4 text-primary" />What “Value Plays” means</div><p className="text-xs text-muted-foreground mt-1">A Value Play is not simply the highest probability. It means the model is meaningfully separated from the 50% neutral baseline and has enough recent data to justify promotion. The current model does not ingest live sportsbook odds, so these are model-strength plays rather than verified market-value bets.</p><div className="flex items-start gap-2 mt-3 text-xs text-muted-foreground"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>True betting value requires comparing our probability with a current no-vig market probability. Until live odds are connected, the site intentionally promotes fewer, stronger signals instead of manufacturing value from a 50% prediction.</span></div></div>}

          <div className="flex items-start justify-between gap-3 mb-4"><div><h2 className="text-base font-bold">{filter === "all" ? "All MLB Games" : filter === "plays" ? "Top Value Plays" : filter === "outcomes" ? "Winning Outcomes" : `${filter.toUpperCase()} Leans`}</h2><p className="text-xs text-muted-foreground mt-1">{filter === "all" ? "Full slate, including games the model says to pass." : filter === "plays" ? "Only meaningful model edges are promoted here." : filter === "nrfi" ? "Only actionable NRFI leans are shown; near-50% predictions stay out." : filter === "yrfi" ? "Only actionable YRFI leans are shown; near-50% predictions stay out." : "Historical results from completed predictions."}</p></div><span className="text-[10px] text-muted-foreground">Updated {data ? formatTime(data.updatedAt) : "—"}</span></div>

          {filter === "plays" && nearValue.length > 0 && promoted.length === 0 && <div className="rounded-md border bg-card p-4 mb-5"><p className="text-xs font-semibold">Why you may see no Value Plays</p><p className="text-xs text-muted-foreground mt-1">The model has predictions, but none currently clear the promotion threshold. These are the closest signals, shown for transparency — not as recommended bets.</p><div className="mt-3 space-y-2">{nearValue.map(game => <div key={game.id} className="flex items-center justify-between gap-3 text-xs"><span className="truncate">{game.shortName} · {game.recommendation}</span><span className="font-mono shrink-0">{(game.recommendation === "NRFI" ? game.nrfiProbability : 100 - game.nrfiProbability).toFixed(1)}% · {game.modelEdge.toFixed(1)} pts</span></div>)}</div></div>}

          {visibleGames.length ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{visibleGames.map(game => <GameCard key={game.id} game={game} />)}</div> : <div className="rounded-md border bg-card p-12 text-center"><CircleDot className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" /><p className="text-base font-semibold">{filter === "plays" ? "No qualifying value plays right now" : filter === "nrfi" ? "No actionable NRFI leans today" : filter === "yrfi" ? "No actionable YRFI leans today" : filter === "all" ? "No MLB games available today" : "No completed results yet"}</p><p className="text-sm text-muted-foreground mt-1">{filter === "plays" ? "That is intentional — the model will pass rather than manufacture a recommendation." : filter === "all" ? "The full slate will appear as the MLB schedule becomes available." : "The model will show actionable signals here as the MLB slate becomes available."}</p></div>}
        </>}
        <p className="text-[10px] text-muted-foreground mt-8">Model probabilities are estimates, not guarantees. The model uses recent first-inning history, Bayesian shrinkage, probable-pitcher metrics including ERA and WHIP, and league calibration. WHIP is displayed only when the source provides it; missing WHIP is not silently treated as a strong pitching signal. Live sportsbook odds are not currently included in the value calculation.</p>
      </div>
    </div>
  );
}