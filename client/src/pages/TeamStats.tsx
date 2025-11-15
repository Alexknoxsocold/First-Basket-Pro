import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import TeamStatsTable from "@/components/TeamStatsTable";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { TeamStat } from "@shared/schema";

export default function TeamStats() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: stats, isLoading } = useQuery<TeamStat[]>({
    queryKey: ["/api/team-stats"],
  });

  const filteredStats = useMemo(() => {
    if (!stats) return [];
    
    return stats.filter(stat =>
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
        <h2 className="text-lg font-semibold">Team First Basket Stats</h2>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search teams..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-teams"
          />
        </div>
      </div>

      <TeamStatsTable stats={filteredStats} />
    </div>
  );
}
