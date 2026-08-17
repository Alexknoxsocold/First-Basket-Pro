import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CircleDot, Clock, Info, RefreshCw, TrendingUp, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Pitcher = {
  name: string | null;
  era: number | null;
  headshot: string | null;
};

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

function formatTime(date: string): string {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return "Time pending";
  return `${parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  })} ET`;
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

function Team({ team }: { team: NrfiGame["away"] }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {team.logo ? (
        <img
          src={team.logo}
          alt=""
          className="w-8 h-8 object-contain shrink-0"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      ) : (
        <span className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0">
          {team.abbreviation}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-semibold text-sm truncate">{team.name}</p>
        <p className="text-[10px] text-muted-foreground">{team.abbreviation}</p>
      </div>
    </div>
  );
}

function Pitcher({ label, pitcher }: { label: string; pitcher: Pitcher }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {pitcher.headshot ? (
        <img
          src={pitcher.headshot}
          alt=""
          className="w-7 h-7 rounded-full object-cover object-top bg-muted shrink-0"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      ) : (
        <span className="w-7 h-7 rounded-full bg-muted shrink-0" />
      )}
      <div className="min-w-0">
        <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-xs truncate">{pitcher.name ?? "Not confirmed"}</p>
        <p className="text-[10px] text-muted-foreground">
          {pitcher.era !== null ? `ERA ${pitcher.era.toFixed(2)}` : "ERA pending"}
        </p>
      </div>
    </div>
  );
}

function GameCard({ game }: { game: NrfiGame }) {
  const isNrfi = game.recommendation === "NRFI";
  const probabilityColor = game.nrfiProbability >= 60
    ? "text-emerald-500"
    : game.nrfiProbability >= 50
      ? "text-yellow-500"
      : "text-orange-500";

  return (
    <article className="rounded-md border bg-card overflow-hidden" data-testid={`card-nrfi-${game.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <CircleDot className="w-4 h-4 text-primary" />
          <span className="font-bold text-sm">{game.shortName}</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />{formatTime(game.date)}
          </span>
        </div>
        <Badge
          className={isNrfi
            ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
            : "bg-orange-500/15 text-orange-500 border-orange-500/30"}
        >
          {game.recommendation}
        </Badge>
        {game.outcome === "won" && (
          <Badge
            className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
          >
            WON
          </Badge>
        )}
      </div>

      <div className="p-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Team team={game.away} />
          <span className="text-xs text-muted-foreground">@</span>
          <Team team={game.home} />
        </div>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Model NRFI probability</p>
            <p className={`text-3xl font-bold font-mono ${probabilityColor}`}>{game.nrfiProbability}%</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Confidence</p>
            <p className="text-sm font-semibold">{game.confidence}</p>
            <p className="text-[10px] text-muted-foreground">{game.sampleSize || "Limited"} recent games</p>
          </div>
        </div>

        <div className="h-2 rounded-full bg-muted overflow-hidden mt-2">
          <div
            className={`h-full rounded-full ${game.nrfiProbability >= 60 ? "bg-emerald-500" : game.nrfiProbability >= 50 ? "bg-yellow-500" : "bg-orange-500"}`}
            style={{ width: `${game.nrfiProbability}%` }}
          />
        </div>

        {game.outcome === "won" && (
          <div className="mt-3 rounded-md px-3 py-2 text-xs bg-emerald-500/10 text-emerald-500">
            Pick won · First inning score: {game.firstInningScore ?? "—"}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 pt-4 border-t">
          <Pitcher label={`${game.away.abbreviation} pitcher`} pitcher={game.away.pitcher} />
          <Pitcher label={`${game.home.abbreviation} pitcher`} pitcher={game.home.pitcher} />
        </div>

        <div className="mt-4 space-y-1">
          {game.factors.map((factor) => (
            <p key={factor} className="text-[10px] text-muted-foreground">• {factor}</p>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function NRFIPro() {
  const [filter, setFilter] = useState<"all" | "nrfi" | "yrfi" | "outcomes">("all");
  const { data, isLoading, isFetching, error, refetch } = useQuery<NrfiResponse>({
    queryKey: ["/api/mlb/nrfi"],
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
  const visibleGames = (data?.games ?? []).filter((game) => {
    if (filter === "outcomes") {
      return game.outcome === "won";
    }
    return filter === "all" ? true : game.recommendation.toLowerCase() === filter;
  });
  const recordedWins = visibleGames.filter((game) => game.outcome === "won").length;
  const visibleAverage = visibleGames.length
    ? Math.round(visibleGames.reduce((sum, game) => sum + game.nrfiProbability, 0) / visibleGames.length)
    : null;
  const visibleTopPick = [...visibleGames].sort((a, b) => b.nrfiProbability - a.nrfiProbability)[0];

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 -mt-8">
      <nav className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-0 overflow-x-auto">
            {([
              { value: "all", label: "All Games" },
              { value: "nrfi", label: "NRFI" },
              { value: "yrfi", label: "YRFI" },
              { value: "outcomes", label: "Outcomes" },
            ] as const).map((tab) => {
              const count = tab.value === "all"
                ? data?.games.length ?? 0
                : tab.value === "outcomes"
                  ? data?.games.filter((game) => game.outcome === "won").length ?? 0
                : data?.games.filter((game) => game.recommendation.toLowerCase() === tab.value).length ?? 0;
              const active = filter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setFilter(tab.value)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  }`}
                  data-testid={`tab-mlb-${tab.value}`}
                >
                  {tab.value === "all" && <CircleDot className={`w-3.5 h-3.5 ${active ? "text-primary" : ""}`} />}
                  {tab.label}
                  <span className="text-[10px] opacity-60">({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-lg font-bold">MLB NRFI Picks</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {data ? formatDate(data.date) : "Today"} · No Run First Inning model
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            MLB data could not be loaded right now. ESPN may be temporarily unavailable.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="rounded-md border bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Today&apos;s Games</span>
                  <CircleDot className="w-5 h-5 text-primary" />
                </div>
                <div className="text-3xl font-bold">{visibleGames.length}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {filter === "outcomes"
                    ? `${recordedWins} winning picks`
                    : filter === "all" ? "Today's MLB slate" : `${filter.toUpperCase()} games today`}
                </div>
              </div>
              <div className="rounded-md border bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avg NRFI %</span>
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <div className="text-3xl font-bold">
                  {`${visibleAverage ?? "—"}${visibleAverage !== null ? "%" : ""}`}
                </div>
                <div className="text-xs text-muted-foreground mt-1">Across this view</div>
              </div>
              <div className="rounded-md border bg-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {filter === "outcomes" ? "Best Winning Pick" : "Top NRFI Pick"}
                  </span>
                  <Zap className="w-5 h-5 text-primary" />
                </div>
                <div className="text-3xl font-bold">{visibleTopPick ? `${visibleTopPick.nrfiProbability}%` : "—"}</div>
                <div className="text-xs text-muted-foreground mt-1">{visibleTopPick?.shortName ?? "No games in this view"}</div>
              </div>
            </div>

            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold">
                  {filter === "outcomes" ? "Today's Winning Outcomes" : filter === "all" ? "Today's Picks" : `${filter.toUpperCase()} Picks`}
                </h2>
              </div>
              <span className="text-[10px] text-muted-foreground">Updated {data ? formatTime(data.updatedAt) : "—"}</span>
            </div>

            {visibleGames.length ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {visibleGames.map((game) => <GameCard key={game.id} game={game} />)}
              </div>
            ) : (
              <div className="rounded-md border bg-card p-12 flex flex-col items-center justify-center text-center gap-4">
                <CircleDot className="w-14 h-14 text-muted-foreground/30" />
                <div>
                  <p className="text-base font-semibold">
                    {filter === "outcomes"
                      ? "No winning outcomes yet"
                      : filter === "all" ? "No MLB games scheduled today" : `No ${filter.toUpperCase()} games today`}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {filter === "outcomes"
                      ? "Winning picks appear after the first inning is complete."
                      : filter === "all" ? "Check back when today's slate is available." : "Try the other tab to view today's other recommendations."}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 mt-6 rounded-md border bg-card p-4">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                Estimates use ESPN team game logs and probable-pitcher ERA. They are not sportsbook odds or a guarantee. Always verify the starting pitchers before making any decision.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}