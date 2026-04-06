import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import GamesTable from "@/components/GamesTable";
import StatsCard from "@/components/StatsCard";
import { getTeamLogoUrl } from "@/components/GameRow";
import dkLogoImg from "@assets/fyz4mydi8ceuovtoaooy_1775294282507.avif";

import { Target, TrendingUp, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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
    <img
      src={dkLogoImg}
      alt="DraftKings"
      className="w-4 h-4 shrink-0 rounded object-contain"
      style={{ opacity: dimmed ? 0.4 : 1 }}
    />
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

    // Get active date in ET: after 11 PM ET, advance to tomorrow automatically
    const now = new Date();
    const etHour = parseInt(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour: 'numeric', hour12: false
    }).format(now));
    const targetDate = etHour >= 23 ? new Date(now.getTime() + 24 * 60 * 60 * 1000) : now;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(targetDate);
    const y = parseInt(parts.find(p => p.type === 'year')!.value);
    const mo = parseInt(parts.find(p => p.type === 'month')!.value) - 1;
    const d = parseInt(parts.find(p => p.type === 'day')!.value);
    const activeDateISO = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const etFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
    });

    return allGames.filter(game => {
      // gameDate is authoritative when it's a specific date
      if (game.gameDate && game.gameDate !== 'Today') return game.gameDate === activeDateISO;
      // Legacy "Today" label
      if (game.gameDate === 'Today' && etHour < 23) return true;
      // No gameDate — fall back to gameTime in ET
      if (game.gameTime) {
        const gameParts = etFormatter.formatToParts(new Date(game.gameTime));
        const gy = gameParts.find(p => p.type === 'year')?.value;
        const gm = gameParts.find(p => p.type === 'month')?.value;
        const gd = gameParts.find(p => p.type === 'day')?.value;
        return `${gy}-${gm}-${gd}` === activeDateISO;
      }
      return false;
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
