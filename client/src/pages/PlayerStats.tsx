import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import PlayerStatsTable from "@/components/PlayerStatsTable";
import { Input } from "@/components/ui/input";
import { Search, Filter } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PlayerStat } from "@shared/schema";

export default function PlayerStats() {
  const [searchQuery, setSearchQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");

  const { data: stats, isLoading } = useQuery<PlayerStat[]>({
    queryKey: ["/api/player-stats"],
  });

  const teams = useMemo(() => {
    if (!stats) return [];
    const uniqueTeams = new Set(stats.map(s => s.team));
    return Array.from(uniqueTeams).sort();
  }, [stats]);

  const filteredStats = useMemo(() => {
    if (!stats) return [];
    
    return stats.filter(stat => {
      const matchesSearch = 
        stat.player.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stat.team.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stat.position.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTeam = teamFilter === "all" || stat.team === teamFilter;
      
      return matchesSearch && matchesTeam;
    });
  }, [stats, searchQuery, teamFilter]);

  const totalPlayers = stats?.length || 0;
  const playersWithBaskets = stats?.filter(s => s.firstBaskets > 0).length || 0;

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
      <div>
        <h2 className="text-lg font-semibold mb-2">Player First Basket Stats - 2024/2025 Season</h2>
        <p className="text-sm text-muted-foreground">
          Full roster stats showing first baskets scored this season. {playersWithBaskets} of {totalPlayers} players have scored a first basket.
        </p>
      </div>

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-40" data-testid="select-team-filter">
              <SelectValue placeholder="All Teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map(team => (
                <SelectItem key={team} value={team}>{team}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {teamFilter !== "all" && (
            <Badge variant="secondary" className="text-xs">
              {filteredStats.length} players
            </Badge>
          )}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search players, teams, position..."
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
