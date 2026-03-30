import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, TrendingUp, Activity, AlertCircle, AlertTriangle, RefreshCw, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Badge variant="destructive" className="text-xs gap-0.5 py-0">
      <AlertCircle className="h-2.5 w-2.5" /> OUT
    </Badge>
  );
  if (upper.includes("DAY") || upper.includes("DTD")) return (
    <Badge variant="outline" className="text-xs gap-0.5 py-0">
      <Activity className="h-2.5 w-2.5" /> DTD
    </Badge>
  );
  if (upper.includes("QUESTION") || upper.includes("PROB")) return (
    <Badge variant="secondary" className="text-xs gap-0.5 py-0 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">
      <AlertTriangle className="h-2.5 w-2.5" /> Q
    </Badge>
  );
  return null;
};

const FbPctBar = ({ pct }: { pct: number }) => {
  const color = pct >= 30 ? "bg-green-500" : pct >= 20 ? "bg-yellow-500" : "bg-muted-foreground/40";
  return (
    <div className="flex items-center gap-2">
      <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 60) / 60 * 100}%` }} />
      </div>
      <span className={`font-mono text-xs font-semibold ${pct >= 30 ? "text-green-500" : pct >= 20 ? "text-yellow-500" : "text-muted-foreground"}`}>
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

function EspnStatRow({ stat, compact }: { stat: EspnPlayerStat; compact?: boolean }) {
  return (
    <tr className="border-b border-border/40 hover:bg-muted/30 transition-colors" data-testid={`row-player-${stat.player.replace(/\s/g, '-')}`}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {stat.headshot && (
            <img
              src={stat.headshot}
              alt={stat.player}
              className="w-7 h-7 rounded-full object-cover bg-muted flex-shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold whitespace-nowrap">{stat.player}</span>
              <InjuryBadge status={stat.injuryStatus} />
            </div>
            <span className="text-[10px] text-muted-foreground">{stat.position}</span>
          </div>
        </div>
      </td>
      {!compact && <td className="px-3 py-2 text-xs font-mono font-medium">{stat.team}</td>}
      <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">{stat.gamesPlayed}</td>
      <td className="px-3 py-2 text-right font-mono text-xs font-semibold">{stat.avgPoints.toFixed(1)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{stat.avgFGA.toFixed(1)}</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{stat.fgPct.toFixed(1)}%</td>
      <td className="px-3 py-2 text-right font-mono text-xs">{stat.q1FgaRate.toFixed(1)}</td>
      <td className="px-3 py-2">
        <FbPctBar pct={stat.firstBasketPct} />
      </td>
      <td className="px-3 py-2 text-right">
        <OddsDisplay odds={stat.odds} />
      </td>
    </tr>
  );
}

function EspnStatsTable({ players, compact = false }: { players: EspnPlayerStat[]; compact?: boolean }) {
  const sorted = [...players].sort((a, b) => b.firstBasketPct - a.firstBasketPct);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="table-espn-stats">
        <thead>
          <tr className="border-b border-border/60">
            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Player</th>
            {!compact && <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Team</th>}
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">GP</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">PPG</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">FGA/G</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">FG%</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Q1 FGA</th>
            <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium pl-3">FB%</th>
            <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Odds</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={compact ? 8 : 9} className="px-3 py-8 text-center text-muted-foreground text-xs">
                No starter data available
              </td>
            </tr>
          ) : (
            sorted.map((stat) => (
              <EspnStatRow key={`${stat.team}-${stat.player}`} stat={stat} compact={compact} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function PlayerStats() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: espnStats, isLoading: espnLoading, error: espnError, refetch } = useQuery<EspnPlayerStat[]>({
    queryKey: ["/api/espn-player-stats"],
    staleTime: 5 * 60 * 1000, // 5 minutes
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
      const awayPlayers = espnStats.filter(s =>
        s.team === game.awayTeam &&
        (game.awayStarters?.includes(s.player) || true)
      );
      const homePlayers = espnStats.filter(s =>
        s.team === game.homeTeam &&
        (game.homeStarters?.includes(s.player) || true)
      );

      const filterBySearch = (players: EspnPlayerStat[]) => {
        if (!searchQuery) return players;
        const q = searchQuery.toLowerCase();
        return players.filter(p =>
          p.player.toLowerCase().includes(q) ||
          p.team.toLowerCase().includes(q) ||
          p.position.toLowerCase().includes(q)
        );
      };

      return {
        game,
        awayPlayers: filterBySearch(awayPlayers),
        homePlayers: filterBySearch(homePlayers),
      };
    }).filter(m => m.awayPlayers.length > 0 || m.homePlayers.length > 0);
  }, [todayGames, espnStats, searchQuery]);

  // Top picks: players sorted by FB%
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
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-64" />)}
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
            Player First Basket Stats
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real 2025-26 season stats from ESPN &bull; Today's starters only
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-refresh-espn-stats"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
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
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-500" />
              Top First Basket Picks Today
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {topPicks.map((p, i) => (
                <div key={p.player} className="flex items-center gap-2 bg-muted/40 rounded-md px-3 py-2 min-w-0" data-testid={`pick-top-${i + 1}`}>
                  <span className="text-[10px] font-bold text-muted-foreground">#{i + 1}</span>
                  {p.headshot && (
                    <img src={p.headshot} alt={p.player} className="w-6 h-6 rounded-full object-cover bg-muted"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{p.player}</p>
                    <p className="text-[10px] text-muted-foreground">{p.team} &bull; {p.odds}</p>
                  </div>
                  <span className="text-xs font-bold text-green-500 ml-1 shrink-0">{p.firstBasketPct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Matchup Tables */}
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
            <Card key={game.id} data-testid={`matchup-${game.awayTeam}-vs-${game.homeTeam}`}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base font-semibold">
                    {game.awayTeam} @ {game.homeTeam}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {game.gameTime && (
                      <span className="text-xs text-muted-foreground">{game.gameTime} ET</span>
                    )}
                    <Badge variant="outline" className="text-xs">Today</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {/* Away Team */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold">{game.awayTeam}</span>
                      <Badge variant="secondary" className="text-xs">{awayPlayers.length} starters</Badge>
                    </div>
                    <EspnStatsTable players={awayPlayers} compact />
                  </div>

                  {/* Home Team */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold">{game.homeTeam}</span>
                      <Badge variant="secondary" className="text-xs">{homePlayers.length} starters</Badge>
                    </div>
                    <EspnStatsTable players={homePlayers} compact />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
