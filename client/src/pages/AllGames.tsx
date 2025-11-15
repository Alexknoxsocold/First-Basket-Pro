import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import GamesTable from "@/components/GamesTable";
import StatsCard from "@/components/StatsCard";
import { Target, TrendingUp, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Game } from "@shared/schema";

export default function AllGames() {
  const [selectedDate, setSelectedDate] = useState("Today");

  const { data: games, isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  const stats = useMemo(() => {
    if (!games || games.length === 0) return { avgTipWin: 0, highestScore: 0, highestScoreTeam: "" };
    
    const totalTipPercent = games.reduce((sum, game) => {
      return sum + game.awayTipPercent + game.homeTipPercent;
    }, 0);
    const avgTipWin = (totalTipPercent / (games.length * 2)).toFixed(1);

    let highestScore = 0;
    let highestScoreTeam = "";
    games.forEach(game => {
      if (game.awayScorePercent > highestScore) {
        highestScore = game.awayScorePercent;
        highestScoreTeam = `${game.awayTeam} vs ${game.homeTeam}`;
      }
      if (game.homeScorePercent > highestScore) {
        highestScore = game.homeScorePercent;
        highestScoreTeam = `${game.homeTeam} vs ${game.awayTeam}`;
      }
    });

    return { avgTipWin, highestScore, highestScoreTeam };
  }, [games]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatsCard
          title="Today's Games"
          value={games?.length || 0}
          subtitle="NBA games scheduled"
          icon={Target}
        />
        <StatsCard
          title="Avg Tip Win %"
          value={`${stats.avgTipWin}%`}
          subtitle="Season average"
          icon={TrendingUp}
        />
        <StatsCard
          title="Highest Score %"
          value={`${stats.highestScore}%`}
          subtitle={stats.highestScoreTeam}
          icon={Calendar}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Opening Tips</h2>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" data-testid="button-prev-day">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium px-4" data-testid="text-selected-date">{selectedDate}</span>
          <Button size="icon" variant="ghost" data-testid="button-next-day">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <GamesTable games={games || []} />
    </div>
  );
}
