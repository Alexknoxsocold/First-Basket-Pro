import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search, TrendingUp, Activity, AlertCircle, AlertTriangle,
  RefreshCw, Zap, Medal, Target, BarChart2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
}

const InjuryBadge = ({ status }: { status?: string }) => {
  if (!status) return null;
  const upper = status.toUpperCase();
  if (upper.includes("OUT")) return (
    <Badge variant="destructive" className="text-[10px] gap-0.5 py-0 h-4">
      <AlertCircle className="h-2.5 w-2.5" /> OUT
    </Badge>
  );
  if (upper.includes("DAY") || upper.includes("DTD")) return (
    <Badge variant="outline" className="text-[10px] gap-0.5 py-0 h-4">
      <Activity className="h-2.5 w-2.5" /> DTD
    </Badge>
  );
  if (upper.includes("QUESTION") || upper.includes("PROB")) return (
    <Badge variant="secondary" className="text-[10px] gap-0.5 py-0 h-4 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
      <AlertTriangle className="h-2.5 w-2.5" /> Q
    </Badge>
  );
  return null;
};

const FbPctBar = ({ pct }: { pct: number }) => {
  const color = pct >= 30 ? "bg-green-500" : pct >= 20 ? "bg-yellow-500" : "bg-muted-foreground/40";
  const textColor = pct >= 30 ? "text-green-500" : pct >= 20 ? "text-yellow-500" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 60) / 60 * 100}%` }} />
      </div>
      <span className={`font-mono text-xs font-bold ${textColor}`}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
};

const OddsDisplay = ({ odds }: { odds: string }) => {
  const isPositive = odds.startsWith("+");
  return (
    <span className={`font-mono text-xs font-bold ${isPositive ? "text-green-500" : "text-muted-foreground"}`}>
      {odds}
    </span>
  );
};

function PlayerCard({ stat, rank }: { stat: EspnPlayerStat; rank?: number }) {
  const initials = stat.player.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const isElite = stat.firstBasketPct >= 30;
  const isGood = stat.firstBasketPct >= 20;

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-md border bg-card hover-elevate transition-colors ${isElite ? "border-green-500/20 bg-green-500/5" : ""}`}
      data-testid={`row-player-${stat.player.replace(/\s/g, '-')}`}
    >
      {/* Rank */}
      {rank !== undefined && (
        <div className="text-[11px] font-bold text-muted-foreground w-5 text-center shrink-0">
          #{rank}
        </div>
      )}

      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="w-11 h-11 ring-2 ring-border">
          <AvatarImage src={stat.headshot} alt={stat.player} className="object-cover object-top" />
          <AvatarFallback className="text-xs font-bold bg-muted">{initials}</AvatarFallback>
        </Avatar>
        {isElite && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
            <Medal className="w-2.5 h-2.5 text-white" />
          </div>
        )}
      </div>

      {/* Name + team */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold truncate">{stat.player}</span>
          <InjuryBadge status={stat.injuryStatus} />
        </div>
        <div className="text-[10px] text-muted-foreground">
          {stat.team} &bull; {stat.position} &bull; {stat.gamesPlayed} GP
        </div>
      </div>

      {/* Stats */}
      <div className="hidden sm:flex items-center gap-4 shrink-0">
        <div className="text-center">
          <div className="font-mono text-sm font-bold">{stat.avgPoints.toFixed(1)}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">PPG</div>
        </div>
        <div className="text-center">
          <div className="font-mono text-xs">{stat.avgFGA.toFixed(1)}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">FGA/G</div>
        </div>
        <div className="text-center">
          <div className="font-mono text-xs">{stat.fgPct.toFixed(1)}%</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">FG%</div>
        </div>
        <div className="text-center">
          <div className="font-mono text-xs">{stat.q1FgaRate.toFixed(1)}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Q1 FGA</div>
        </div>
      </div>

      {/* FB% + Odds */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <FbPctBar pct={stat.firstBasketPct} />
        <OddsDisplay odds={stat.odds} />
      </div>
    </div>
  );
}

function StatHeader({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="flex items-center gap-2 p-3 rounded-md border bg-card">
      <div className={`w-8 h-8 rounded-md ${color} flex items-center justify-center shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <div className="text-sm font-bold">{value}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      </div>
    </div>
  );
}

function MatchupSection({ game, awayPlayers, homePlayers }: {
  game: Game;
  awayPlayers: EspnPlayerStat[];
  homePlayers: EspnPlayerStat[];
}) {
  const allPlayers = [...awayPlayers, ...homePlayers].sort((a, b) => b.firstBasketPct - a.firstBasketPct);

  const formatGameTime = (time?: string | null) => {
    if (!time) return null;
    try {
      const d = new Date(time);
      if (isNaN(d.getTime())) return time;
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
    } catch { return time; }
  };

  return (
    <Card data-testid={`matchup-${game.awayTeam}-vs-${game.homeTeam}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-bold">
            {game.awayTeam} <span className="text-muted-foreground font-normal text-sm">@</span> {game.homeTeam}
          </CardTitle>
          <div className="flex items-center gap-2">
            {game.gameTime && (
              <span className="text-xs text-muted-foreground font-mono">{formatGameTime(game.gameTime)}</span>
            )}
            <Badge variant="outline" className="text-xs">Today</Badge>
          </div>
        </div>

        {/* Quick matchup stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          <StatHeader
            label="Avg FB%"
            value={allPlayers.length > 0 ? (allPlayers.reduce((a, b) => a + b.firstBasketPct, 0) / allPlayers.length).toFixed(1) + "%" : "-"}
            icon={Target}
            color="bg-primary"
          />
          <StatHeader
            label="Top Pick"
            value={allPlayers[0]?.firstBasketPct.toFixed(1) + "%" || "-"}
            icon={Medal}
            color="bg-green-600"
          />
          <StatHeader
            label="Away Starters"
            value={String(awayPlayers.length)}
            icon={BarChart2}
            color="bg-blue-600"
          />
          <StatHeader
            label="Home Starters"
            value={String(homePlayers.length)}
            icon={BarChart2}
            color="bg-purple-600"
          />
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Column headers */}
        <div className="hidden sm:flex items-center px-3 mb-1 gap-3">
          <div className="w-5 shrink-0" />
          <div className="w-11 shrink-0" />
          <div className="flex-1 text-[9px] text-muted-foreground uppercase tracking-wider">Player</div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="w-12 text-[9px] text-muted-foreground uppercase tracking-wider text-center">PPG</div>
            <div className="w-12 text-[9px] text-muted-foreground uppercase tracking-wider text-center">FGA/G</div>
            <div className="w-12 text-[9px] text-muted-foreground uppercase tracking-wider text-center">FG%</div>
            <div className="w-12 text-[9px] text-muted-foreground uppercase tracking-wider text-center">Q1 FGA</div>
          </div>
          <div className="shrink-0 text-[9px] text-muted-foreground uppercase tracking-wider">FB% / Odds</div>
        </div>

        {/* Combined sorted player list */}
        <div className="flex flex-col gap-1.5">
          {allPlayers.map((stat, i) => (
            <PlayerCard key={`${stat.team}-${stat.player}`} stat={stat} rank={i + 1} />
          ))}
          {allPlayers.length === 0 && (
            <div className="py-6 text-center text-sm text-muted-foreground">No starter data available for this matchup</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function PlayerStats() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: espnStats, isLoading: espnLoading, error: espnError, refetch } = useQuery<EspnPlayerStat[]>({
    queryKey: ["/api/espn-player-stats"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: games, isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const todayGames = useMemo(() => {
    if (!games) return [];
    return games.filter(g => g.gameDate === 'Today').sort((a, b) => {
      const ta = a.gameTime || '11:59 PM';
      const tb = b.gameTime || '11:59 PM';
      return ta.localeCompare(tb);
    });
  }, [games]);

  const matchups = useMemo(() => {
    if (!todayGames || !espnStats) return [];

    return todayGames.map(game => {
      const filterBySearch = (players: EspnPlayerStat[]) => {
        if (!searchQuery) return players;
        const q = searchQuery.toLowerCase();
        return players.filter(p =>
          p.player.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q) ||
          p.position.toLowerCase().includes(q)
        );
      };

      const awayPlayers = filterBySearch(espnStats.filter(s => s.team === game.awayTeam));
      const homePlayers = filterBySearch(espnStats.filter(s => s.team === game.homeTeam));

      return { game, awayPlayers, homePlayers };
    }).filter(m => m.awayPlayers.length > 0 || m.homePlayers.length > 0);
  }, [todayGames, espnStats, searchQuery]);

  const topPicks = useMemo(() => {
    if (!espnStats) return [];
    return [...espnStats]
      .sort((a, b) => b.firstBasketPct - a.firstBasketPct)
      .slice(0, 5);
  }, [espnStats]);

  const isLoading = espnLoading || gamesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-7 w-72" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-72" />)}
      </div>
    );
  }

  const hasStats = espnStats && espnStats.length > 0;

  return (
    <div className="space-y-5 p-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Player First Basket Model
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live 2025-26 season stats from ESPN &bull; Today's starters sorted by First Basket %
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5 text-xs"
            data-testid="button-refresh-espn-stats"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search players..."
              className="pl-9 h-9 w-52 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-players"
            />
          </div>
        </div>
      </div>

      {espnError && (
        <Card className="border-destructive/30">
          <CardContent className="py-4 text-center text-sm text-destructive">
            Failed to load ESPN stats. Check that lineups are set for today's games.
          </CardContent>
        </Card>
      )}

      {/* Top Picks Banner */}
      {topPicks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Top First Basket Picks Today
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-3">
              {topPicks.map((p, i) => {
                const initials = p.player.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <div
                    key={p.player}
                    className="flex items-center gap-3 bg-muted/40 rounded-md px-3 py-2.5 border min-w-0 flex-1 basis-40"
                    data-testid={`pick-top-${i + 1}`}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="w-10 h-10 ring-2 ring-border">
                        <AvatarImage src={p.headshot} alt={p.player} className="object-cover object-top" />
                        <AvatarFallback className="text-xs font-bold bg-muted">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="absolute -top-1 -left-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                        <span className="text-[9px] font-bold text-primary-foreground">{i + 1}</span>
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{p.player}</p>
                      <p className="text-[10px] text-muted-foreground">{p.team} &bull; {p.odds}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-green-500">{p.firstBasketPct.toFixed(1)}%</div>
                      <div className="text-[9px] text-muted-foreground">FB%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      {hasStats && (
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground px-1">
          <span className="font-semibold uppercase tracking-wider">FB% Scale:</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Elite (30%+)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Good (20–29%)</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-foreground/40 inline-block" /> Low (&lt;20%)</span>
          <span className="ml-auto">Players sorted by First Basket % within each matchup</span>
        </div>
      )}

      {/* Matchup Sections */}
      {!hasStats ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground text-sm">
              No ESPN stats available. Starting lineups may not be set yet for today's games.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Lineups are typically released 30-60 minutes before tip-off.
            </p>
          </CardContent>
        </Card>
      ) : matchups.length === 0 && searchQuery ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground text-sm">No players match your search.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {matchups.map(({ game, awayPlayers, homePlayers }) => (
            <MatchupSection key={game.id} game={game} awayPlayers={awayPlayers} homePlayers={homePlayers} />
          ))}
        </div>
      )}
    </div>
  );
}
