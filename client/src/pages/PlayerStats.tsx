import PlayerStatsTable from "@/components/PlayerStatsTable";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useState } from "react";

export default function PlayerStats() {
  const [searchQuery, setSearchQuery] = useState("");

  const mockStats = [
    { id: "1", player: "J. Allen", team: "CLE", gamesPlayed: 42, firstBaskets: 18, percentage: 42.9, avgTipWin: 64 },
    { id: "2", player: "N. Jokic", team: "DEN", gamesPlayed: 45, firstBaskets: 16, percentage: 35.6, avgTipWin: 36 },
    { id: "3", player: "J. Jackson Jr.", team: "MEM", gamesPlayed: 40, firstBaskets: 15, percentage: 37.5, avgTipWin: 46 },
    { id: "4", player: "R. Gobert", team: "MIN", gamesPlayed: 44, firstBaskets: 14, percentage: 31.8, avgTipWin: 58 },
    { id: "5", player: "C. Holmgren", team: "OKC", gamesPlayed: 38, firstBaskets: 13, percentage: 34.2, avgTipWin: 67 },
    { id: "6", player: "D. Ayton", team: "LAL", gamesPlayed: 41, firstBaskets: 12, percentage: 29.3, avgTipWin: 58 },
    { id: "7", player: "M. Turner", team: "MIL", gamesPlayed: 39, firstBaskets: 11, percentage: 28.2, avgTipWin: 31 },
    { id: "8", player: "J. Poeltl", team: "TOR", gamesPlayed: 43, firstBaskets: 10, percentage: 23.3, avgTipWin: 63 },
  ];

  const filteredStats = mockStats.filter(stat =>
    stat.player.toLowerCase().includes(searchQuery.toLowerCase()) ||
    stat.team.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
