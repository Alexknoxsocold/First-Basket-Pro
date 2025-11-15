import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import PlayerStatsTable from "@/components/PlayerStatsTable";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlayerStat } from "@shared/schema";

export default function PlayerStats() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: stats, isLoading } = useQuery<PlayerStat[]>({
    queryKey: ["/api/player-stats"],
  });

  const filteredStats = useMemo(() => {
    if (!stats) return [];
    
    return stats.filter(stat =>
      stat.player.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stat.team.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [stats, searchQuery]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Player First Basket Stats</h2>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search players or teams..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-players"
          />
        </div>
      </div>

      <PlayerStatsTable stats={filteredStats} />
    </div>
  );
}
