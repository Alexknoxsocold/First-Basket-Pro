import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import GamesTable from "@/components/GamesTable";
import StatsCard from "@/components/StatsCard";
import { getTeamLogoUrl } from "@/components/GameRow";
import { Target, TrendingUp, Zap, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Game } from "@shared/schema";

interface EspnPlayerStat {
  player: string;
  team: string;
  espnId: string;
  headshot?: string;
  firstBasketPct: number;
  avgPoints: number;
  odds: string;
  liveOdds?: string;
  isStarter?: boolean;
}

function DkLogo({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className="w-4 h-4 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: dimmed ? 0.4 : 1 }}>
      <rect width="32" height="32" rx="5" fill="#1a3a1a" />
      <path d="M16 5 L19 11 L26 8 L22 16 L26 17 L16 27 L6 17 L10 16 L6 8 L13 11 Z" fill="#53d337" />
      <rect x="9" y="20" width="14" height="3" rx="1.5" fill="#53d337" />
    </svg>
  );
}

function TeamLogo({ team, size = "md" }: { team: string; size?: "sm" | "md" | "lg" }) {
  const logoUrl = getTeamLogoUrl(team);
  const sizeClass = size === "sm" ? "w-6 h-6" : size === "lg" ? "w-14 h-14" : "w-9 h-9";
  return (
    <div className={`${sizeClass} rounded-md bg-muted/40 flex items-center justify-center shrink-0 overflow-hidden`}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${team} logo`}
          className="w-full h-full object-contain p-0.5"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <span className="text-[10px] font-bold text-muted-foreground">{team.slice(0, 3)}</span>
      )}
    </div>
  );
}

interface GamePickSummary {
  game: Game;
  topPlayer: EspnPlayerStat | null;
  awayTop: EspnPlayerStat | null;
  homeTop: EspnPlayerStat | null;
}

function FeaturedPickBanner({
  gamePicks
}: {
  gamePicks: GamePickSummary[];
}) {
  const featured = gamePicks
    .filter(gp => gp.topPlayer && gp.topPlayer.firstBasketPct > 0)
    .sort((a, b) => (b.topPlayer?.firstBasketPct ?? 0) - (a.topPlayer?.firstBasketPct ?? 0))
    .slice(0, 3);

  if (featured.length === 0) return null;

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-primary/10 flex items-center gap-2">
        <Star className="w-4 h-4 text-primary fill-current" />
        <span className="text-sm font-semibold text-primary">Today's Top First Basket Picks</span>
        <Badge variant="secondary" className="text-xs ml-auto">Live ESPN Data</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
        {featured.map(({ game, topPlayer }, i) => {
          if (!topPlayer) return null;
          const opponent = topPlayer.team === game.awayTeam ? game.homeTeam : game.awayTeam;
          const initials = topPlayer.player.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
          const displayOdds = topPlayer.liveOdds || topPlayer.odds;
          return (
            <div key={game.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="relative shrink-0">
                  <Avatar className="w-14 h-14 ring-2 ring-border">
                    <AvatarImage src={topPlayer.headshot} alt={topPlayer.player} className="object-cover object-top" />
                    <AvatarFallback className="text-sm font-bold bg-muted">{initials}</AvatarFallback>
                  </Avatar>
                  {/* Team logo overlay badge */}
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-md bg-card border border-border overflow-hidden flex items-center justify-center">
                    <img
                      src={getTeamLogoUrl(topPlayer.team)}
                      alt={topPlayer.team}
                      className="w-5 h-5 object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm leading-tight">{topPlayer.player}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {topPlayer.team} vs {opponent}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <DkLogo dimmed={!topPlayer.liveOdds} />
                    <span className="text-[10px] text-muted-foreground/60">
                      {topPlayer.avgPoints} PPG &bull; <span className="text-green-400 font-mono font-semibold">{displayOdds}</span>
                      {!topPlayer.liveOdds && <span className="text-muted-foreground/40 ml-1">Est</span>}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-xl font-bold text-primary">{topPlayer.firstBasketPct.toFixed(1)}%</div>
                  <div className="text-[10px] text-muted-foreground">FB%</div>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t">
                <TeamLogo team={topPlayer.team} size="sm" />
                <span className="text-[10px] text-muted-foreground">Top first basket pick for this matchup</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AllGames() {
  const { data: allGames, isLoading: gamesLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const { data: espnStats } = useQuery<EspnPlayerStat[]>({
    queryKey: ["/api/espn-player-stats"],
    staleTime: 5 * 60 * 1000,
  });

  const headshotMap = useMemo<Record<string, string>>(() => {
    if (!espnStats) return {};
    return espnStats.reduce((acc, s) => {
      if (s.headshot) acc[s.player] = s.headshot;
      return acc;
    }, {} as Record<string, string>);
  }, [espnStats]);

  const games = useMemo(() => {
    if (!allGames) return [];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    return allGames.filter(game => {
      if (game.gameDate === "Today") return true;
      if (game.gameTime) {
        const gameTime = new Date(game.gameTime);
        return gameTime >= todayStart && gameTime < todayEnd;
      }
      const todayISO = now.toISOString().split('T')[0];
      return game.gameDate === todayISO;
    });
  }, [allGames]);

  // Build per-game pick summaries using ESPN stats
  const gamePicks = useMemo<GamePickSummary[]>(() => {
    if (!games.length) return [];
    return games.map(game => {
      const awayPlayers = espnStats?.filter(s => s.team === game.awayTeam) ?? [];
      const homePlayers = espnStats?.filter(s => s.team === game.homeTeam) ?? [];
      const awayTop = awayPlayers.sort((a, b) => b.firstBasketPct - a.firstBasketPct)[0] ?? null;
      const homeTop = homePlayers.sort((a, b) => b.firstBasketPct - a.firstBasketPct)[0] ?? null;
      const topPlayer = !awayTop ? homeTop
        : !homeTop ? awayTop
        : awayTop.firstBasketPct >= homeTop.firstBasketPct ? awayTop : homeTop;
      return { game, topPlayer, awayTop, homeTop };
    });
  }, [games, espnStats]);

  const stats = useMemo(() => {
    if (!games || games.length === 0) return { avgFbPct: "0.0", highestFbPct: 0, highestFbMatchup: "", topPlayer: "" };

    const allFbPcts = espnStats?.map(s => s.firstBasketPct) ?? [];
    const avgFbPct = allFbPcts.length > 0
      ? (allFbPcts.reduce((a, b) => a + b, 0) / allFbPcts.length).toFixed(1)
      : "0.0";

    let highestFbPct = 0;
    let highestFbMatchup = "";
    let topPlayer = "";
    gamePicks.forEach(({ game, topPlayer: tp }) => {
      if (tp && tp.firstBasketPct > highestFbPct) {
        highestFbPct = tp.firstBasketPct;
        highestFbMatchup = `${game.awayTeam} @ ${game.homeTeam}`;
        topPlayer = tp.player;
      }
    });

    return { avgFbPct, highestFbPct, highestFbMatchup, topPlayer };
  }, [games, espnStats, gamePicks]);

  if (gamesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-44" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Today's Games"
          value={games.length}
          subtitle="NBA games scheduled"
          icon={Target}
        />
        <StatsCard
          title="Avg First Basket %"
          value={`${stats.avgFbPct}%`}
          subtitle={`Across ${espnStats?.length ?? 0} players today`}
          icon={TrendingUp}
        />
        <StatsCard
          title="Top Pick Probability"
          value={stats.highestFbPct > 0 ? `${stats.highestFbPct.toFixed(1)}%` : "Loading..."}
          subtitle={stats.topPlayer ? `${stats.topPlayer} — ${stats.highestFbMatchup}` : stats.highestFbMatchup || "Fetching ESPN data..."}
          icon={Zap}
        />
      </div>

      {/* Featured Picks */}
      <FeaturedPickBanner gamePicks={gamePicks} />

      {/* Games Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">All Games — Opening Tips</h2>
          <span className="text-xs text-muted-foreground font-mono">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <GamesTable
          games={games}
          headshotMap={headshotMap}
          espnAwayPicks={Object.fromEntries(gamePicks.map(gp => [gp.game.id, gp.awayTop]))}
          espnHomePicks={Object.fromEntries(gamePicks.map(gp => [gp.game.id, gp.homeTop]))}
        />
      </div>
    </div>
  );
}
