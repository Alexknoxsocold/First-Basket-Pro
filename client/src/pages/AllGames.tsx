import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import GamesTable from "@/components/GamesTable";
import StatsCard from "@/components/StatsCard";
import { Target, TrendingUp, Zap, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { Game } from "@shared/schema";

const TEAM_COLORS: Record<string, string> = {
  ATL: "bg-red-600", BOS: "bg-green-700", BKN: "bg-gray-800", CHA: "bg-teal-600",
  CHI: "bg-red-700", CLE: "bg-red-800", DAL: "bg-blue-700", DEN: "bg-blue-800",
  DET: "bg-blue-600", GS: "bg-yellow-500", HOU: "bg-red-600", IND: "bg-yellow-600",
  LAC: "bg-blue-700", LAL: "bg-purple-700", MEM: "bg-blue-800", MIA: "bg-red-700",
  MIL: "bg-green-800", MIN: "bg-blue-900", NO: "bg-blue-900", NYK: "bg-orange-600",
  OKC: "bg-blue-500", ORL: "bg-blue-600", PHI: "bg-blue-600", PHX: "bg-purple-700",
  POR: "bg-red-700", SAC: "bg-purple-600", SA: "bg-gray-700", TOR: "bg-red-600",
  UTAH: "bg-blue-900", WSH: "bg-blue-900",
};

function FeaturedPickBanner({ games }: { games: Game[] }) {
  const featured = games
    .map(g => {
      const topTeam = g.awayScorePercent > g.homeScorePercent ? g.awayTeam : g.homeTeam;
      const topPercent = Math.max(g.awayScorePercent, g.homeScorePercent);
      const topPlayer = g.awayScorePercent > g.homeScorePercent ? g.awayPlayer : g.homePlayer;
      return { game: g, topTeam, topPercent, topPlayer, opponent: g.awayScorePercent > g.homeScorePercent ? g.homeTeam : g.awayTeam };
    })
    .filter(f => f.topPercent >= 55)
    .sort((a, b) => b.topPercent - a.topPercent)
    .slice(0, 3);

  if (featured.length === 0) return null;

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b bg-primary/10 flex items-center gap-2">
        <Star className="w-4 h-4 text-primary fill-current" />
        <span className="text-sm font-semibold text-primary">Today's Top Picks</span>
        <Badge variant="secondary" className="text-xs ml-auto">First Basket Analysis</Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x">
        {featured.map(({ game, topTeam, topPercent, topPlayer, opponent }) => {
          const bg = TEAM_COLORS[topTeam] || "bg-gray-600";
          return (
            <div key={game.id} className="p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-md ${bg} flex items-center justify-center shrink-0`}>
                  <span className="text-white text-xs font-bold">{topTeam.slice(0, 3)}</span>
                </div>
                <div>
                  <div className="font-semibold text-sm">{topTeam} <span className="text-muted-foreground font-normal">vs {opponent}</span></div>
                  <div className="text-xs text-muted-foreground">{game.gameTime}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="font-mono text-lg font-bold text-primary">{topPercent}%</div>
                  <div className="text-xs text-muted-foreground">1st to score</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground border-t pt-2">
                <span className="font-medium text-foreground">{topPlayer}</span> — Top First Basket Pick
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AllGames() {
  const { data: allGames, isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

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

  const stats = useMemo(() => {
    if (!games || games.length === 0) return { avgTipWin: 0, highestScore: 0, highestScoreTeam: "", topPlayer: "" };

    const allTipPercents = games.flatMap(g => [g.awayTipPercent, g.homeTipPercent]);
    const avgTipWin = (allTipPercents.reduce((a, b) => a + b, 0) / allTipPercents.length).toFixed(1);

    let highestScore = 0;
    let highestScoreTeam = "";
    let topPlayer = "";
    games.forEach(game => {
      if (game.awayScorePercent > highestScore) {
        highestScore = game.awayScorePercent;
        highestScoreTeam = `${game.awayTeam} @ ${game.homeTeam}`;
        topPlayer = game.awayPlayer;
      }
      if (game.homeScorePercent > highestScore) {
        highestScore = game.homeScorePercent;
        highestScoreTeam = `${game.awayTeam} @ ${game.homeTeam}`;
        topPlayer = game.homePlayer;
      }
    });

    return { avgTipWin, highestScore, highestScoreTeam, topPlayer };
  }, [games]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-36" />
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
          title="Avg Tip Win %"
          value={`${stats.avgTipWin}%`}
          subtitle="Across all matchups today"
          icon={TrendingUp}
        />
        <StatsCard
          title="Top Score Probability"
          value={`${stats.highestScore}%`}
          subtitle={stats.topPlayer ? `${stats.topPlayer} — ${stats.highestScoreTeam}` : stats.highestScoreTeam}
          icon={Zap}
        />
      </div>

      {/* Featured Picks */}
      <FeaturedPickBanner games={games} />

      {/* Games Table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">All Games — Opening Tips</h2>
          <span className="text-xs text-muted-foreground font-mono">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
        <GamesTable games={games} />
      </div>
    </div>
  );
}
