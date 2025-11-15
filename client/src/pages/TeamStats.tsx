import TeamStatsTable from "@/components/TeamStatsTable";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";

export default function TeamStats() {
  const [searchQuery, setSearchQuery] = useState("");

  const mockStats = [
    { id: "1", team: "CLE", gamesPlayed: 48, firstToScore: 37, percentage: 77.1, avgPoints: 2.3 },
    { id: "2", team: "MIN", gamesPlayed: 47, firstToScore: 27, percentage: 57.4, avgPoints: 2.2 },
    { id: "3", team: "MIL", gamesPlayed: 46, firstToScore: 25, percentage: 54.3, avgPoints: 2.1 },
    { id: "4", team: "DEN", gamesPlayed: 46, firstToScore: 21, percentage: 45.7, avgPoints: 2.1 },
    { id: "5", team: "OKC", gamesPlayed: 44, firstToScore: 27, percentage: 61.4, avgPoints: 2.4 },
    { id: "6", team: "LAL", gamesPlayed: 45, firstToScore: 28, percentage: 62.2, avgPoints: 2.2 },
    { id: "7", team: "MEM", gamesPlayed: 45, firstToScore: 14, percentage: 31.1, avgPoints: 1.9 },
    { id: "8", team: "CHA", gamesPlayed: 43, firstToScore: 11, percentage: 25.6, avgPoints: 1.8 },
  ];

  const filteredStats = mockStats.filter(stat =>
    stat.team.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
