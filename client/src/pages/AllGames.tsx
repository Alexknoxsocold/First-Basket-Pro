import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import GamesTable from "@/components/GamesTable";
import StatsCard from "@/components/StatsCard";
import { getTeamLogoUrl } from "@/components/GameRow";
import dkLogoImg from "@assets/fyz4mydi8ceuovtoaooy_1775294282507.avif";

import { Target, TrendingUp, Zap, Trophy } from "lucide-react";
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
  position?: string;
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

interface JumpBallPlayer {
  player: string;
  headshot?: string;
  position: string;
}

interface GamePickSummary {
  game: Game;
  topPlayer: EspnPlayerStat | null;
  awayTop: EspnPlayerStat | null;
  homeTop: EspnPlayerStat | null;
  awayJumpBall: JumpBallPlayer | null;
  homeJumpBall: JumpBallPlayer | null;
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

  // Find the jump ball player (center) for a team
  const findJumpBall = (players: EspnPlayerStat[]): JumpBallPlayer | null => {
    const starters = players.filter(p => p.isStarter);
    const pool = starters.length > 0 ? starters : players;
    const center = pool.find(p => p.position === 'C')
      ?? pool.find(p => p.position === 'PF' || p.position === 'F')
      ?? pool[0];
    if (!center) return null;
    return { player: center.player, headshot: center.headshot, position: center.position ?? 'C' };
  };

  // Build per-game pick summaries using ESPN stats
  const gamePicks = useMemo<GamePickSummary[]>(() => {
    if (!games.length) return [];
    return games.map(game => {
      const awayPlayers = espnStats?.filter(s => s.team === game.awayTeam) ?? [];
      const homePlayers = espnStats?.filter(s => s.team === game.homeTeam) ?? [];
      const awayTop = [...awayPlayers].sort((a, b) => b.firstBasketPct - a.firstBasketPct)[0] ?? null;
      const homeTop = [...homePlayers].sort((a, b) => b.firstBasketPct - a.firstBasketPct)[0] ?? null;
      const topPlayer = !awayTop ? homeTop
        : !homeTop ? awayTop
        : awayTop.firstBasketPct >= homeTop.firstBasketPct ? awayTop : homeTop;
      return {
        game,
        topPlayer,
        awayTop,
        homeTop,
        awayJumpBall: findJumpBall(awayPlayers),
        homeJumpBall: findJumpBall(homePlayers),
      };
    });
  }, [games, espnStats]);

  const stats = useMemo(() => {
    const empty = {
      avgFbPct: "0.0", highestFbPct: 0, highestFbMatchup: "", topPlayer: "",
      topJumpBallPct: 0, topJumpBallPlayer: "", topJumpBallTeam: "",
      topTeam: "", topTeamPct: 0,
    };
    if (!games || games.length === 0) return empty;

    const allFbPcts = espnStats?.map(s => s.firstBasketPct) ?? [];
    const avgFbPct = allFbPcts.length > 0
      ? (allFbPcts.reduce((a, b) => a + b, 0) / allFbPcts.length).toFixed(1)
      : "0.0";

    let highestFbPct = 0;
    let highestFbMatchup = "";
    let topPlayer = "";
    let topTeam = "";
    let topTeamPct = 0;
    gamePicks.forEach(({ game, topPlayer: tp, awayTop, homeTop }) => {
      if (tp && tp.firstBasketPct > highestFbPct) {
        highestFbPct = tp.firstBasketPct;
        highestFbMatchup = `${game.awayTeam} @ ${game.homeTeam}`;
        topPlayer = tp.player;
      }
      [awayTop, homeTop].forEach(pick => {
        if (pick && pick.firstBasketPct > topTeamPct) {
          topTeamPct = pick.firstBasketPct;
          topTeam = pick.team;
        }
      });
    });

    // Top jump ball: the center with the highest firstBasketPct today
    let topJumpBallPct = 0;
    let topJumpBallPlayer = "";
    let topJumpBallTeam = "";
    gamePicks.forEach(({ awayJumpBall, homeJumpBall }) => {
      [awayJumpBall, homeJumpBall].forEach(jb => {
        if (!jb) return;
        const stat = espnStats?.find(s => s.player === jb.player);
        if (stat && stat.firstBasketPct > topJumpBallPct) {
          topJumpBallPct = stat.firstBasketPct;
          topJumpBallPlayer = jb.player;
          topJumpBallTeam = stat.team;
        }
      });
    });

    return { avgFbPct, highestFbPct, highestFbMatchup, topPlayer, topJumpBallPct, topJumpBallPlayer, topJumpBallTeam, topTeam, topTeamPct };
  }, [games, espnStats, gamePicks]);

  if (gamesLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Skeleton className="h-28" />
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
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatsCard
          title="Today's Games"
          value={games.length}
          subtitle="NBA games scheduled"
          icon={Target}
        />
        <StatsCard
          title="Avg Scoring %"
          value={`${stats.avgFbPct}%`}
          subtitle={`Across ${espnStats?.length ?? 0} players today`}
          icon={TrendingUp}
        />
        <StatsCard
          title="Top Jump Ball"
          value={stats.topJumpBallPct > 0 ? `${stats.topJumpBallPct.toFixed(1)}%` : "Loading..."}
          subtitle={stats.topJumpBallPlayer ? `${stats.topJumpBallPlayer} — ${stats.topJumpBallTeam}` : "Fetching ESPN data..."}
          icon={Zap}
        />
        <StatsCard
          title="Top Team Today"
          value={stats.topTeam || "—"}
          subtitle={stats.topTeamPct > 0 ? `${stats.topTeamPct.toFixed(1)}% scoring probability` : "Fetching ESPN data..."}
          icon={Trophy}
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
          espnAwayJumpBall={Object.fromEntries(gamePicks.map(gp => [gp.game.id, gp.awayJumpBall]))}
          espnHomeJumpBall={Object.fromEntries(gamePicks.map(gp => [gp.game.id, gp.homeJumpBall]))}
        />
      </div>
    </div>
  );
}
