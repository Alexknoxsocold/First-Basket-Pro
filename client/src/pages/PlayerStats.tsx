import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, RefreshCw, TrendingUp, AlertCircle,
  AlertTriangle, Activity, ChevronUp, ChevronDown,
  Star, Zap, Shield
} from "lucide-react";
import type { Game } from "@shared/schema";

interface EspnPlayerStat {
  player: string;
  team: string;
  espnId: string;
  position: string;
  gamesPlayed: number;
  avgPoints: number;
  avgFGA: number;
  fgPct: number;
  avgMinutes: number;
  avgAssists: number;
  avgRebounds: number;
  firstBasketPct: number;
  q1FgaRate: number;
  odds: string;
  headshot?: string;
  injuryStatus?: string;
  isStarter?: boolean;
}

type SortKey = "firstBasketPct" | "avgPoints" | "avgFGA" | "fgPct" | "q1FgaRate" | "odds" | "avgMinutes";

const INJURY_COLORS: Record<string, string> = {
  out: "bg-red-500/15 text-red-500 border-red-500/20",
  dtd: "bg-yellow-500/15 text-yellow-500 border-yellow-500/20",
  questionable: "bg-orange-500/15 text-orange-500 border-orange-500/20",
  probable: "bg-blue-500/15 text-blue-500 border-blue-500/20",
};

function InjuryBadge({ status }: { status?: string }) {
  if (!status) return null;
  const upper = status.toUpperCase();
  if (upper.includes("OUT")) return (
    <Badge className="text-[9px] h-4 px-1 gap-0.5 bg-red-500/15 text-red-500 border border-red-500/30 font-semibold">
      <AlertCircle className="h-2.5 w-2.5" />OUT
    </Badge>
  );
  if (upper.includes("DAY") || upper.includes("DTD")) return (
    <Badge className="text-[9px] h-4 px-1 gap-0.5 bg-yellow-500/15 text-yellow-500 border border-yellow-500/30 font-semibold">
      <Activity className="h-2.5 w-2.5" />DTD
    </Badge>
  );
  if (upper.includes("QUESTION")) return (
    <Badge className="text-[9px] h-4 px-1 gap-0.5 bg-orange-500/15 text-orange-500 border border-orange-500/30 font-semibold">
      <AlertTriangle className="h-2.5 w-2.5" />Q
    </Badge>
  );
  if (upper.includes("PROB")) return (
    <Badge className="text-[9px] h-4 px-1 gap-0.5 bg-blue-500/15 text-blue-500 border border-blue-500/30 font-semibold">
      <Shield className="h-2.5 w-2.5" />P
    </Badge>
  );
  return null;
}

function FbMeter({ pct }: { pct: number }) {
  const isElite = pct >= 28;
  const isGood = pct >= 20;
  const barColor = isElite ? "bg-green-500" : isGood ? "bg-yellow-500" : "bg-muted-foreground/40";
  const textColor = isElite ? "text-green-400" : isGood ? "text-yellow-400" : "text-muted-foreground";
  const maxPct = 35;
  const barWidth = Math.min(pct / maxPct * 100, 100);
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`font-mono text-sm font-bold ${textColor}`}>{pct.toFixed(1)}%</span>
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  );
}

function OddsCell({ odds, fbPct }: { odds: string; fbPct: number }) {
  const isPositive = odds.startsWith("+");
  const isGood = fbPct >= 20;
  return (
    <span className={`font-mono text-sm font-bold ${isGood ? "text-green-400" : "text-muted-foreground"}`}>
      {odds}
    </span>
  );
}

function StatCell({ value, label, highlight }: { value: string; label?: string; highlight?: boolean }) {
  return (
    <div className="text-right">
      <div className={`font-mono text-sm font-semibold ${highlight ? "text-green-400" : "text-foreground"}`}>
        {value}
      </div>
      {label && <div className="text-[9px] text-muted-foreground">{label}</div>}
    </div>
  );
}

function SortHeader({
  label, sortKey, currentSort, direction, onClick
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  direction: "asc" | "desc";
  onClick: (k: SortKey) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <button
      onClick={() => onClick(sortKey)}
      className={`flex items-center gap-0.5 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap transition-colors ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
    >
      {label}
      {active ? (
        direction === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
      ) : (
        <ChevronDown className="w-3 h-3 opacity-30" />
      )}
    </button>
  );
}

function PlayerRow({
  stat, rank, opponent, gameTime
}: {
  stat: EspnPlayerStat;
  rank: number;
  opponent?: string;
  gameTime?: string;
}) {
  const isElite = stat.firstBasketPct >= 28;
  const isGood = stat.firstBasketPct >= 20;
  const initials = stat.player.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  const formatTime = (t?: string) => {
    if (!t) return null;
    try {
      const d = new Date(t);
      if (isNaN(d.getTime())) return t;
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
    } catch { return t; }
  };

  return (
    <tr
      className={`border-b border-border/40 transition-colors hover:bg-muted/20 ${isElite ? "bg-green-500/5" : ""}`}
      data-testid={`row-player-${stat.player.replace(/\s/g, '-')}`}
    >
      {/* Rank */}
      <td className="pl-4 pr-2 py-3 text-center">
        <span className={`text-xs font-bold ${rank <= 3 ? "text-primary" : "text-muted-foreground"}`}>
          {rank <= 3 ? (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-[10px]">
              {rank}
            </span>
          ) : rank}
        </span>
      </td>

      {/* Player */}
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <Avatar className={`w-10 h-10 ring-1 ${isElite ? "ring-green-500/50" : "ring-border"}`}>
              <AvatarImage src={stat.headshot} alt={stat.player} className="object-cover object-top" />
              <AvatarFallback className="text-xs font-bold bg-muted text-muted-foreground">{initials}</AvatarFallback>
            </Avatar>
            {isElite && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 bg-green-500 rounded-full">
                <Star className="w-2.5 h-2.5 text-white fill-white" />
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold">{stat.player}</span>
              <InjuryBadge status={stat.injuryStatus} />
              {stat.isStarter && (
                <Badge className="text-[9px] h-4 px-1 bg-blue-500/15 text-blue-400 border border-blue-500/20 font-medium">S</Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-muted-foreground font-medium">{stat.team}</span>
              <span className="text-[10px] text-muted-foreground/50">&bull;</span>
              <span className="text-[10px] text-muted-foreground">{stat.position}</span>
              {opponent && (
                <>
                  <span className="text-[10px] text-muted-foreground/50">&bull;</span>
                  <span className="text-[10px] text-muted-foreground">vs {opponent}</span>
                </>
              )}
              {gameTime && (
                <span className="text-[10px] text-muted-foreground/50 font-mono ml-1">{formatTime(gameTime)}</span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* FB% model — the main stat */}
      <td className="px-4 py-3 text-right">
        <FbMeter pct={stat.firstBasketPct} />
      </td>

      {/* Odds */}
      <td className="px-3 py-3 text-right">
        <OddsCell odds={stat.odds} fbPct={stat.firstBasketPct} />
      </td>

      {/* PPG */}
      <td className="px-3 py-3 text-right">
        <StatCell
          value={stat.avgPoints.toFixed(1)}
          highlight={stat.avgPoints >= 25}
        />
      </td>

      {/* MIN */}
      <td className="px-3 py-3 text-right">
        <StatCell
          value={stat.avgMinutes.toFixed(0)}
          highlight={stat.avgMinutes >= 32}
        />
      </td>

      {/* FGA/G */}
      <td className="px-3 py-3 text-right">
        <StatCell
          value={stat.avgFGA.toFixed(1)}
          highlight={stat.avgFGA >= 15}
        />
      </td>

      {/* FG% */}
      <td className="px-3 py-3 text-right">
        <StatCell
          value={`${stat.fgPct.toFixed(1)}%`}
          highlight={stat.fgPct >= 50}
        />
      </td>

      {/* Q1 FGA */}
      <td className="px-3 py-3 text-right">
        <StatCell
          value={stat.q1FgaRate.toFixed(1)}
          highlight={stat.q1FgaRate >= 4}
        />
      </td>

      {/* GP */}
      <td className="px-4 py-3 text-right">
        <span className="font-mono text-xs text-muted-foreground">{stat.gamesPlayed}</span>
      </td>
    </tr>
  );
}

export default function PlayerStats() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("firstBasketPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterStarters, setFilterStarters] = useState(false);
  const [activeGame, setActiveGame] = useState<string | null>(null);

  const { data: espnStats, isLoading: espnLoading, error: espnError, refetch, isFetching } = useQuery<EspnPlayerStat[]>({
    queryKey: ["/api/espn-player-stats"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: games } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  // Build opponent + game time map per team
  const teamGameMap = useMemo(() => {
    const map: Record<string, { opponent: string; gameTime?: string | null }> = {};
    if (!games) return map;
    const now = new Date();
    const todayISO = now.toISOString().split('T')[0];
    games
      .filter(g => {
        if (g.gameDate === 'Today') return true;
        if (g.gameTime) return new Date(g.gameTime).toISOString().split('T')[0] === todayISO;
        return g.gameDate === todayISO;
      })
      .forEach(g => {
        map[g.awayTeam] = { opponent: g.homeTeam, gameTime: g.gameTime };
        map[g.homeTeam] = { opponent: g.awayTeam, gameTime: g.gameTime };
      });
    return map;
  }, [games]);

  // Today's matchups for filter tabs
  const todayMatchups = useMemo(() => {
    if (!games) return [];
    const now = new Date();
    const todayISO = now.toISOString().split('T')[0];
    return games.filter(g => {
      if (g.gameDate === 'Today') return true;
      if (g.gameTime) return new Date(g.gameTime).toISOString().split('T')[0] === todayISO;
      return g.gameDate === todayISO;
    });
  }, [games]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    if (!espnStats) return [];

    let result = [...espnStats];

    // Game filter
    if (activeGame) {
      const game = todayMatchups.find(g => g.id === activeGame);
      if (game) {
        result = result.filter(p => p.team === game.awayTeam || p.team === game.homeTeam);
      }
    }

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.player.toLowerCase().includes(q) ||
        p.team.toLowerCase().includes(q) ||
        p.position.toLowerCase().includes(q)
      );
    }

    // Starters filter
    if (filterStarters) {
      result = result.filter(p => p.isStarter);
    }

    // Sort
    result.sort((a, b) => {
      let av: number, bv: number;
      if (sortKey === "odds") {
        av = parseInt(a.odds.replace("+", "")) * (a.odds.startsWith("+") ? 1 : -10);
        bv = parseInt(b.odds.replace("+", "")) * (b.odds.startsWith("+") ? 1 : -10);
      } else {
        av = a[sortKey] as number;
        bv = b[sortKey] as number;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });

    return result;
  }, [espnStats, searchQuery, sortKey, sortDir, filterStarters, activeGame, todayMatchups]);

  const topPicks = useMemo(() => {
    if (!espnStats) return [];
    return [...espnStats]
      .sort((a, b) => b.firstBasketPct - a.firstBasketPct)
      .slice(0, 5);
  }, [espnStats]);

  if (espnLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-56" />
        </div>
        <Skeleton className="h-24 w-full" />
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  const hasStats = espnStats && espnStats.length > 0;

  return (
    <div className="space-y-4">

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            First Basket Model
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            ESPN 2025-26 season data &bull; Sorted by First Basket Probability &bull; {espnStats?.length ?? 0} players loaded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 text-xs"
            data-testid="button-refresh-espn-stats"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Loading..." : "Refresh"}
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              className="pl-9 h-9 w-48 text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              data-testid="input-search-players"
            />
          </div>
        </div>
      </div>

      {espnError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Failed to load player stats. ESPN API may be temporarily unavailable. Try refreshing.
        </div>
      )}

      {/* Top 5 Picks highlight */}
      {topPicks.length > 0 && (
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-primary/10 flex items-center gap-2">
            <Star className="w-3.5 h-3.5 text-primary fill-current" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">Top 5 First Basket Picks</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-border">
            {topPicks.map((p, i) => {
              const initials = p.player.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
              const gameInfo = teamGameMap[p.team];
              return (
                <div key={p.player} className="flex items-center gap-2.5 p-3" data-testid={`pick-top-${i + 1}`}>
                  <div className="relative shrink-0">
                    <Avatar className="w-10 h-10 ring-1 ring-green-500/40">
                      <AvatarImage src={p.headshot} alt={p.player} className="object-cover object-top" />
                      <AvatarFallback className="text-xs font-bold bg-muted">{initials}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -top-1 -left-1 flex items-center justify-center w-4 h-4 bg-primary rounded-full text-[9px] font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate">{p.player}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {p.team}{gameInfo?.opponent ? ` vs ${gameInfo.opponent}` : ""}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs font-bold text-green-400">{p.firstBasketPct.toFixed(1)}%</span>
                      <span className="text-[10px] text-muted-foreground">{p.odds}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Game filter tabs */}
      {todayMatchups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveGame(null)}
            className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${!activeGame ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            All Games
          </button>
          {todayMatchups.map(g => (
            <button
              key={g.id}
              onClick={() => setActiveGame(activeGame === g.id ? null : g.id)}
              className={`text-xs px-3 py-1.5 rounded-md border font-medium transition-colors ${activeGame === g.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {g.awayTeam} @ {g.homeTeam}
            </button>
          ))}
          <div className="ml-auto">
            <Button
              variant={filterStarters ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterStarters(!filterStarters)}
              className="text-xs h-7"
            >
              Starters Only
            </Button>
          </div>
        </div>
      )}

      {/* Color key */}
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider">FB% key:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          Elite 28%+
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
          Good 20–27%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" />
          Low &lt;20%
        </span>
        <span className="ml-auto flex items-center gap-1 text-green-400">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
          Green stats = above average
        </span>
      </div>

      {/* Main table */}
      {!hasStats ? (
        <div className="rounded-md border bg-card px-6 py-12 text-center">
          <TrendingUp className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium">Loading player data from ESPN...</p>
          <p className="text-xs text-muted-foreground mt-1">
            This may take 30-60 seconds while we fetch stats for all players on today's rosters.
          </p>
          <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </Button>
        </div>
      ) : filteredAndSorted.length === 0 ? (
        <div className="rounded-md border bg-card px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">No players match your filter.</p>
        </div>
      ) : (
        <div className="rounded-md border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-fb-model">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="pl-4 pr-2 py-2.5 text-center text-[10px] text-muted-foreground font-medium w-10">#</th>
                  <th className="px-3 py-2.5 text-left text-[10px] text-muted-foreground font-medium">Player</th>
                  <th className="px-4 py-2.5 text-right">
                    <SortHeader label="FB%" sortKey="firstBasketPct" currentSort={sortKey} direction={sortDir} onClick={handleSort} />
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <SortHeader label="Odds" sortKey="odds" currentSort={sortKey} direction={sortDir} onClick={handleSort} />
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <SortHeader label="PPG" sortKey="avgPoints" currentSort={sortKey} direction={sortDir} onClick={handleSort} />
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <SortHeader label="MIN" sortKey="avgMinutes" currentSort={sortKey} direction={sortDir} onClick={handleSort} />
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <SortHeader label="FGA/G" sortKey="avgFGA" currentSort={sortKey} direction={sortDir} onClick={handleSort} />
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <SortHeader label="FG%" sortKey="fgPct" currentSort={sortKey} direction={sortDir} onClick={handleSort} />
                  </th>
                  <th className="px-3 py-2.5 text-right">
                    <SortHeader label="Q1 FGA" sortKey="q1FgaRate" currentSort={sortKey} direction={sortDir} onClick={handleSort} />
                  </th>
                  <th className="px-4 py-2.5 text-right text-[10px] text-muted-foreground font-medium">GP</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((stat, i) => {
                  const gameInfo = teamGameMap[stat.team];
                  return (
                    <PlayerRow
                      key={`${stat.team}-${stat.player}`}
                      stat={stat}
                      rank={i + 1}
                      opponent={gameInfo?.opponent}
                      gameTime={gameInfo?.gameTime ?? undefined}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-2 border-t bg-muted/30 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {filteredAndSorted.length} players &bull; Sorted by {sortKey} ({sortDir})
            </span>
            <span className="text-[10px] text-muted-foreground">
              FB% = First Basket Probability Model &bull; S = Confirmed Starter
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
